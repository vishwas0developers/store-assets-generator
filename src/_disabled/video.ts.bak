import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { DEVICE_REGISTRY } from "../devices/registry.js";
import { type ProjectDocument } from "../project/schema.js";

export interface VideoRenderOptions {
  outputDir: string;
}

export class PlaywrightFFmpegVideoEngine {
  /**
   * Render motion promotional video using Playwright headless frame stepping + FFmpeg layout pipeline
   */
  async render(doc: ProjectDocument, options: VideoRenderOptions): Promise<string> {
    const fps = 30;
    const durationSeconds = 5;
    const totalFrames = fps * durationSeconds;

    const deviceId = doc.screens[0]?.device || "phone";
    const device = DEVICE_REGISTRY[deviceId];
    if (!device) {
      throw new Error(`Device model '${deviceId}' not found in registry`);
    }

    const width = 1080;
    const height = 1920;

    const screenshotData = fs.readFileSync(doc.screens[0].capture, "base64");
    const screenshotMime = "image/png";

    const framesTempDir = path.join(options.outputDir, "temp_frames");
    fs.mkdirSync(framesTempDir, { recursive: true });

    // One browser/page reused across every frame — launching and tearing
    // down Chromium per frame (150x for a 5s clip) is both wasteful and the
    // likely cause of "Unable to capture screenshot" protocol errors from a
    // page/context that gets closed mid-flight.
    const { chromium } = await import("playwright");
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width, height } });

    try {
      for (let frame = 0; frame < totalFrames; frame++) {
      const progress = frame / totalFrames;
      
      // Compute 3D slide and rotate transformations using linear interpolation
      const rotateY = -35 + (progress * 35);
      const translateY = 200 - (progress * 200);
      const scale = 0.8 + (progress * 0.2);

      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body {
              margin: 0;
              padding: 0;
              width: ${width}px;
              height: ${height}px;
              background: linear-gradient(135deg, #0f2027 0%, #203a43 50%, #2c5364 100%);
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              font-family: sans-serif;
              color: white;
              overflow: hidden;
            }
            .caption {
              font-size: 55px;
              font-weight: bold;
              text-align: center;
              margin-bottom: 50px;
            }
            .stage {
              perspective: 1200px;
              width: ${device.geometry.width}px;
              height: ${device.geometry.height}px;
              display: flex;
              justify-content: center;
              align-items: center;
            }
            .device-container {
              position: relative;
              width: ${device.geometry.width}px;
              height: ${device.geometry.height}px;
              transform: translateY(${translateY}px) rotateY(${rotateY}deg) scale(${scale});
            }
            .screenshot {
              position: absolute;
              top: ${device.geometry.screenInset.top}px;
              left: ${device.geometry.screenInset.left}px;
              width: ${device.geometry.screenInset.width}px;
              height: ${device.geometry.screenInset.height}px;
              border-radius: ${device.geometry.cornerRadius || 0}px;
              object-fit: cover;
              z-index: 1;
            }
            .device-frame {
              position: absolute;
              top: 0;
              left: 0;
              width: 100%;
              height: 100%;
              z-index: 2;
            }
          </style>
        </head>
        <body>
          <div class="caption">${doc.screens[0].featureText}</div>
          <div class="stage">
            <div class="device-container">
              <img class="screenshot" src="data:${screenshotMime};base64,${screenshotData}" />
              <div class="device-frame">
                ${device.svgFrame}
              </div>
            </div>
          </div>
        </body>
        </html>
      `;

        await page.setContent(htmlContent);
        const framePath = path.join(framesTempDir, `frame_${frame.toString().padStart(4, "0")}.png`);
        await page.screenshot({ path: framePath, type: "png" });
      }
    } finally {
      await browser.close();
    }

    // Compile into MP4 via FFmpeg
    const outputVideoPath = path.join(options.outputDir, "video", "promo_video.mp4");
    fs.mkdirSync(path.dirname(outputVideoPath), { recursive: true });

    try {
      execSync(
        `ffmpeg -y -framerate ${fps} -i "${framesTempDir}/frame_%04d.png" -c:v libx264 -pix_fmt yuv420p "${outputVideoPath}"`,
        { stdio: "ignore" }
      );
    } catch (err) {
      throw new Error(`FFmpeg compilation failed: ${(err as Error).message}`);
    } finally {
      // Cleanup temporary frame pictures
      fs.rmSync(framesTempDir, { recursive: true, force: true });
    }

    return outputVideoPath;
  }
}
