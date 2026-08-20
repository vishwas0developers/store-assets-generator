import { StillCompositionEngine } from "./render/still.js";
import { PlaywrightFFmpegVideoEngine } from "./render/video.js";
import { AssetValidator } from "./validate/report.js";
import { loadPlatformSpec } from "./platform/index.js";
import { DiscoveryEngine } from "./discovery/crawl.js";
import { WebCaptureBackend } from "./capture/browser.js";
import { type ProjectDocument } from "./project/schema.js";
import { loadAuthConfig, slugify, } from "./auth/appConfig.js";
import { defaultSessionStatePath } from "./capture/auth.js";
import path from "path";
import fs from "fs";

export interface PipelineOptions {
  /** Overrides the app-config-derived slug (apps/<slug>/auth.json lookup). */
  slug?: string;
  /** Explicit email/password — takes priority over the stored/env credential store. */
  email?: string;
  password?: string;
}

export interface PipelineResult {
  projectDoc: ProjectDocument;
  screenshots: string[];
  videoPath: string | null;
  validationReport: any;
  authStatus: { attempted: boolean; ok: boolean; stage: string | null; reason?: string } | null;
}

export class AssetPipeline {
  async run(url: string, platform: string, outputDir: string, options: PipelineOptions = {}): Promise<PipelineResult> {
    console.log(`Running pipeline for URL: ${url} (Platform: ${platform})`);

    const slug = options.slug ?? slugify(url);
    const authConfig = loadAuthConfig(slug);
    if (authConfig && !authConfig.sessionStatePath) {
      authConfig.sessionStatePath = defaultSessionStatePath(slug);
    }
    let authStatus: PipelineResult["authStatus"] = null;

    // 1. Load specs
    const spec = loadPlatformSpec(platform);

    // 2. Crawl & Discover
    const discover = new DiscoveryEngine();
    await discover.initialize();
    const pages = await discover.crawl(url, { maxPages: 2 });
    await discover.close();

    if (pages.length === 0) {
      throw new Error(`Could not discover pages at: ${url}`);
    }

    // 3. Web Capture
    const captureBackend = new WebCaptureBackend();
    await captureBackend.initialize();

    const screens: ProjectDocument["screens"] = [];
    const defaultDeviceClass = Object.keys(spec.deviceClasses)[0];
    const deviceClassSpec = spec.deviceClasses[defaultDeviceClass];

    const rawOutputDir = path.join(outputDir, "raw");
    fs.mkdirSync(rawOutputDir, { recursive: true });

    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      const captureFilename = `screen_${i + 1}.png`;
      console.log(`Capturing page ${i + 1}: ${page.url}`);

      let effectiveAuth = authConfig ?? undefined;
      if (effectiveAuth && (options.email || options.password)) {
        effectiveAuth = {
          ...effectiveAuth,
          apiSession: effectiveAuth.apiSession
            ? { ...effectiveAuth.apiSession, email: options.email, password: options.password }
            : undefined,
        };
      }

      try {
        const result = await captureBackend.captureScreen(page.url, captureFilename, {
          width: deviceClassSpec.width,
          height: deviceClassSpec.height,
          deviceScaleFactor: 3,
          outputDir: rawOutputDir,
          auth: effectiveAuth,
        });

        if (result.auth) {
          authStatus = { attempted: true, ok: result.auth.ok, stage: result.auth.stage, reason: result.auth.reason };
        }

        screens.push({
          id: `screen_${i + 1}`,
          sourceUrl: page.url,
          capture: result.path,
          httpStatus: result.httpStatus ?? undefined,
          featureText: page.title || `Featured Screen ${i + 1}`,
          device: defaultDeviceClass,
          layout: "caption-above",
        });
      } catch (err) {
        if (authConfig) {
          // Auth-gated screen that failed to authenticate: skip it with a
          // recorded reason rather than capturing a login screen.
          authStatus = { attempted: true, ok: false, stage: "capture", reason: (err as Error).message };
          console.warn(`Skipping ${page.url}: ${(err as Error).message}`);
          continue;
        }
        throw err;
      }
    }

    await captureBackend.close();

    if (screens.length === 0) {
      throw new Error("No screens were successfully captured (all auth-gated and unauthenticated).");
    }

    // 4. Assemble Project Doc
    const projectDoc: ProjectDocument = {
      app: {
        name: "Citi Career & NcvtOnline",
        url,
        slug: "citicareer",
      },
      platform,
      template: {
        id: "glide-rotate",
        version: "1.0.0",
      },
      locale: "en",
      screens,
      outputs: {
        screenshots: true,
        video: true,
      },
    };

    // Save project document
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(path.join(outputDir, "project.json"), JSON.stringify(projectDoc, null, 2), "utf-8");

    // 5. Still Composition
    const stillEngine = new StillCompositionEngine();
    const screenshots = await stillEngine.render(projectDoc, { outputDir });

    // 6. Video Generation
    let videoPath: string | null = null;
    if (projectDoc.outputs.video) {
      console.log("Starting motion video render...");
      const videoEngine = new PlaywrightFFmpegVideoEngine();
      videoPath = await videoEngine.render(projectDoc, { outputDir });
      console.log(`Video rendered successfully: ${videoPath}`);
    }

    // 7. Validate
    const validator = new AssetValidator();
    const issues = validator.validatePackage(outputDir, spec);

    const reportPath = path.join(outputDir, "report.json");
    const reportData = {
      timestamp: new Date().toISOString(),
      platform,
      issues,
      status: issues.some(iss => iss.severity === "error") ? "FAILED" : "PASSED"
    };
    fs.writeFileSync(reportPath, JSON.stringify(reportData, null, 2), "utf-8");

    return {
      projectDoc,
      screenshots,
      videoPath,
      validationReport: reportData,
      authStatus,
    };
  }
}
