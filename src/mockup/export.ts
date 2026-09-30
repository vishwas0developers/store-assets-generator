import fs from "fs";
import path from "path";
import archiver from "archiver";
import { DEVICE_REGISTRY, resolveGeometry } from "../devices/registry.js";
import { renderDeviceRowExport, renderSingleScreenExport, renderPanoramicBannerExport } from "./render.js";
import { mockupDir, saveMockupProject, type MockupDeviceRow, type MockupProject } from "./project.js";
import { designSizeFor, findSizeTarget } from "./sizeTargets.js";

/** Output pixels for a row: its size target when it has one, else the frame's own geometry (legacy rows).
 *  cellHtml renders at `canvas` (the 1080-wide design size); Playwright's deviceScaleFactor scales it to real pixels. */
function rowOutput(row: Pick<MockupDeviceRow, "deviceId" | "variant" | "sizeKey">) {
  const info = findSizeTarget(row.sizeKey);
  if (info) {
    const canvas = designSizeFor(info.target);
    return { canvas, scale: info.target.width / canvas.width, width: info.target.width, height: info.target.height };
  }
  const g = resolveGeometry(DEVICE_REGISTRY[row.deviceId] ?? DEVICE_REGISTRY["phone"], row.variant);
  return { canvas: { width: g.width, height: g.height }, scale: 1, width: g.width, height: g.height };
}

/**
 * Studio Mockup Export section -- absorbs the old standalone Store Package
 * step. Exports every visible device row at that row's own device
 * geometry (its devices/catalogue.json entry, foldable-variant aware) and
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
    if (!(DEVICE_REGISTRY[row.deviceId] ?? DEVICE_REGISTRY["phone"])) throw new Error(`Device '${row.deviceId}' not found in registry.`);
    const out = rowOutput(row);
    const outDir = path.join(exportsRoot, sanitize(row.label || row.deviceId));
    const files = await renderDeviceRowExport(project, row.id, outDir, out.canvas, out.scale);
    entries.push({ deviceRowId: row.id, label: row.label || row.deviceId, width: out.width, height: out.height, files: files.length });
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

export async function exportSingleScreen(project: MockupProject, columnId?: string): Promise<string> {
  if (project.columns.length === 0) throw new Error("No screens in this project.");
  const colId = columnId || project.columns[0].id;
  const baseDevice = project.devices.find((d) => d.isBase) || project.devices[0] || { id: "dev_default", deviceId: "phone" };
  const out = rowOutput(baseDevice);
  return renderSingleScreenExport(project, baseDevice.id, colId, out.canvas, out.scale);
}

/** sizeKey picks which size row to export (default: the primary/base row). */
export async function exportPanoramicBanner(project: MockupProject, sizeKey?: string): Promise<string> {
  if (project.columns.length === 0) throw new Error("No screens in this project.");
  const baseDevice = (sizeKey && project.devices.find((d) => d.sizeKey === sizeKey)) || project.devices.find((d) => d.isBase) || project.devices[0] || { id: "dev_default", deviceId: "phone" };
  const out = rowOutput(baseDevice);
  return renderPanoramicBannerExport(project, baseDevice.id, out.canvas, out.scale, `panoramic_banner${sizeKey ? `_${sanitize(sizeKey)}` : ""}.png`);
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
