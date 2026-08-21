import fs from "fs";
import path from "path";
import archiver from "archiver";
import { DEVICE_REGISTRY, resolveGeometry } from "../devices/registry.js";
import { renderDeviceRowExport } from "./render.js";
import { mockupDir, saveMockupProject, type MockupProject } from "./project.js";

/**
 * Studio Mockup Export section -- absorbs the old standalone Store Package
 * step. Exports every visible device row at that row's own device
 * geometry (its config/devices.json entry, foldable-variant aware) and
 * zips the set, matching the reference's "Export Device Screenshots" / ZIP
 * behaviour. There is no separate platform/device-class picker any more --
 * the device rows YOU built in the Editor canvas ARE the export targets.
 */

export interface MockupExportResult {
  zipPath: string;
  bytes: number;
  entries: Array<{ deviceRowId: string; label: string; width: number; height: number; files: number }>;
}

export async function exportMockupProject(project: MockupProject): Promise<MockupExportResult> {
  if (project.columns.length === 0) throw new Error("No columns (screens) in this project -- add at least one.");
  const rows = project.devices.filter((d) => d.previewsVisible);
  if (rows.length === 0) throw new Error("No visible device rows -- add or unhide at least one device row.");

  const exportsRoot = path.join(mockupDir(project.id), "exports", "latest");
  fs.rmSync(exportsRoot, { recursive: true, force: true });

  const entries: MockupExportResult["entries"] = [];
  for (const row of rows) {
    const device = DEVICE_REGISTRY[row.deviceId] ?? DEVICE_REGISTRY["phone"];
    if (!device) throw new Error(`Device '${row.deviceId}' not found in registry.`);
    const geometry = resolveGeometry(device, row.variant);
    const outDir = path.join(exportsRoot, sanitize(row.label || row.deviceId));
    const files = await renderDeviceRowExport(project, row.id, outDir, { width: geometry.width, height: geometry.height });
    entries.push({ deviceRowId: row.id, label: row.label || row.deviceId, width: geometry.width, height: geometry.height, files: files.length });
  }

  fs.writeFileSync(
    path.join(exportsRoot, "MANIFEST.json"),
    JSON.stringify({ project: project.id, name: project.name, generatedAt: new Date().toISOString(), entries }, null, 2),
    "utf-8",
  );

  const zipPath = path.join(mockupDir(project.id), "exports", "mockup-export.zip");
  await zipDirectory(exportsRoot, zipPath);
  saveMockupProject(project);

  return { zipPath, bytes: fs.statSync(zipPath).size, entries };
}

function sanitize(label: string): string {
  return label.replace(/[^a-z0-9._-]+/gi, "-");
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
