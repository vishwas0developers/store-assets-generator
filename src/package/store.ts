import fs from "fs";
import path from "path";
import archiver from "archiver";
import { loadPlatformSpec } from "../platform/index.js";
import { renderMockups } from "../render/mockup.js";
import { saveSession, sessionDir, type Session } from "../session/store.js";

/**
 * Step 3 — Store asset package. Renders the step-2 mockups once per
 * required device class of each selected platform, then zips the tree in
 * the folder shape a manual Play Console / App Store Connect upload wants.
 */

export interface PackageRequest {
  /** platform id -> device class ids to render. Empty array = required classes. */
  targets: Record<string, string[]>;
}

export interface PackageResult {
  zipPath: string;
  bytes: number;
  entries: Array<{ platform: string; deviceClass: string; width: number; height: number; files: number }>;
  warnings: string[];
}

export async function buildStorePackage(session: Session, request: PackageRequest): Promise<PackageResult> {
  if (session.raw.length === 0) throw new Error("No screenshots captured — run Step 1 first.");

  const storeRoot = path.join(sessionDir(session.id), "store");
  fs.rmSync(storeRoot, { recursive: true, force: true });

  const entries: PackageResult["entries"] = [];
  const warnings: string[] = [];

  for (const [platformId, requestedClasses] of Object.entries(request.targets)) {
    const spec = loadPlatformSpec(platformId);
    const classIds =
      requestedClasses.length > 0
        ? requestedClasses
        : Object.entries(spec.deviceClasses).filter(([, c]) => c.required).map(([id]) => id);

    for (const classId of classIds) {
      const deviceClass = spec.deviceClasses[classId];
      if (!deviceClass) throw new Error(`Unknown device class '${classId}' for platform '${platformId}'.`);

      const outDir = path.join(storeRoot, platformId, classId);
      const files = await renderMockups(session, outDir, { width: deviceClass.width, height: deviceClass.height });

      if (files.length < deviceClass.minScreenshots) {
        warnings.push(
          `${platformId}/${classId}: ${files.length} screenshots — the store requires at least ${deviceClass.minScreenshots}.`,
        );
      }
      if (files.length > deviceClass.maxScreenshots) {
        warnings.push(
          `${platformId}/${classId}: ${files.length} screenshots — the store accepts at most ${deviceClass.maxScreenshots}; trim before upload.`,
        );
      }
      entries.push({ platform: platformId, deviceClass: classId, width: deviceClass.width, height: deviceClass.height, files: files.length });
    }
  }

  if (entries.length === 0) throw new Error("No platform/device targets selected.");

  fs.writeFileSync(
    path.join(storeRoot, "MANIFEST.json"),
    JSON.stringify({ session: session.id, url: session.url, generatedAt: new Date().toISOString(), entries, warnings }, null, 2),
    "utf-8",
  );

  const zipPath = path.join(sessionDir(session.id), "store-assets.zip");
  await zipDirectory(storeRoot, zipPath);

  session.outputs.zip = "store-assets.zip";
  saveSession(session);

  return { zipPath, bytes: fs.statSync(zipPath).size, entries, warnings };
}

function zipDirectory(sourceDir: string, zipPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(zipPath);
    const archive = archiver("zip", { zlib: { level: 9 } });
    output.on("close", () => resolve());
    archive.on("error", reject);
    archive.pipe(output);
    archive.directory(sourceDir, false);
    archive.finalize();
  });
}
