import fs from "fs";
import path from "path";

/**
 * Studio Mockup tab storage — a devices x columns matrix project, modeled
 * on studio.app-mockup.com's normalized store (verified against its bundle):
 *
 *   - devices[]  = ROWS   (a device/size class the whole project previews at)
 *   - columns[]  = COLUMNS (one logical screen -- content, not a device)
 *   - cells      = optional per (device,column) overrides
 *
 * Editing a column's style applies to that screen across every device row
 * by default (reference behaviour: updateDeviceSize(value, column.screenshots)
 * writes every row). A "cell" override lets one row diverge for one column.
 *
 * Independent of the Screen Capture and Video tabs -- its own root, its own
 * uploaded source images, no shared state.
 *
 *   output/mockups/<id>/project.json
 *   output/mockups/<id>/sources/     uploaded screenshot images
 *   output/mockups/<id>/exports/     Export section output (zips)
 */

export interface MockupSourceImage {
  id: string;
  name: string;
  file: string; // relative to project dir, e.g. "sources/img_1.png"
  width: number;
  height: number;
}

export interface MockupDeviceRow {
  id: string;
  /** config/devices.json id. */
  deviceId: string;
  variant?: string;
  /** Free label shown in the row header, e.g. "6.5 Inch". */
  label: string;
  previewsVisible: boolean;
  isBase: boolean;
}

export interface TextStyle {
  text: string;
  color: string;
  size: number; // px at a 1080-wide reference canvas
  align: "left" | "center" | "right";
}

export type MockupBackgroundType = "solid" | "gradient" | "pattern" | "image" | "panoramic";
export interface MockupBackground {
  type: MockupBackgroundType;
  value: string;
  imageFile?: string;
  panoramaFile?: string;
}

export interface DeviceLayerStyle {
  sourceId?: string; // MockupSourceImage id
  /** 0-200, default 90 -- mirrors the reference's device-size slider exactly. */
  size: number;
  x: number;
  y: number;
  rotation: number;
  brightness: number; // 0-200, 100 = unchanged
  frameless: boolean; // "snapshot-" layouts skip the device frame
}

export interface Decoration {
  id: string;
  kind: "icon" | "badge" | "shape";
  content: string;
  xPct: number;
  yPct: number;
  sizePct: number;
  rotate: number;
  color: string;
}

export interface ColumnStyle {
  layout: string; // preset slug, see mockup/layouts.ts
  title: TextStyle;
  subtitle: TextStyle;
  background: MockupBackground;
  deviceOne: DeviceLayerStyle;
  deviceTwo?: DeviceLayerStyle;
  decorations: Decoration[];
}

export interface MockupColumn {
  id: string;
  order: number;
  style: ColumnStyle;
}

export interface MockupProject {
  id: string;
  createdAt: string;
  name: string;
  appCategory: string;
  sources: MockupSourceImage[];
  devices: MockupDeviceRow[];
  columns: MockupColumn[];
  /** key = `${deviceId}:${columnId}` */
  cells: Record<string, Partial<ColumnStyle>>;
  globalPanoramic: { file?: string; flip: boolean };
  settings: { inspectorPosition: "left" | "right"; screenshotSizeLabel: string; palette: string[] };
}

const ROOT = path.join(process.cwd(), "output", "mockups");

export function mockupDir(id: string): string {
  const dir = path.join(ROOT, id);
  const rel = path.relative(ROOT, dir);
  if (rel.startsWith("..") || path.isAbsolute(rel)) throw new Error(`Invalid mockup project id '${id}'.`);
  return dir;
}

export function mockupFile(id: string, relative: string): string {
  const dir = mockupDir(id);
  const full = path.join(dir, relative);
  const rel = path.relative(dir, full);
  if (rel.startsWith("..") || path.isAbsolute(rel)) throw new Error(`Invalid path '${relative}'.`);
  return full;
}

export function defaultTextStyle(text = ""): TextStyle {
  return { text, color: "#ffffff", size: 58, align: "center" };
}

export function defaultDeviceLayerStyle(): DeviceLayerStyle {
  return { size: 90, x: 0, y: 0, rotation: 0, brightness: 100, frameless: false };
}

export function defaultColumnStyle(title = ""): ColumnStyle {
  return {
    layout: "single-title-above",
    title: defaultTextStyle(title),
    subtitle: defaultTextStyle(""),
    background: { type: "gradient", value: "ocean" },
    deviceOne: defaultDeviceLayerStyle(),
    decorations: [],
  };
}

export function createMockupProject(init: { name: string; appCategory?: string }): MockupProject {
  const id = `mockup-${Date.now()}`;
  const project: MockupProject = {
    id,
    createdAt: new Date().toISOString(),
    name: init.name,
    appCategory: init.appCategory ?? "Utility",
    sources: [],
    devices: [],
    columns: [],
    cells: {},
    globalPanoramic: { flip: false },
    settings: { inspectorPosition: "right", screenshotSizeLabel: "6.5 Inch", palette: [] },
  };
  fs.mkdirSync(path.join(mockupDir(id), "sources"), { recursive: true });
  fs.mkdirSync(path.join(mockupDir(id), "exports"), { recursive: true });
  saveMockupProject(project);
  return project;
}

export function saveMockupProject(project: MockupProject): void {
  fs.mkdirSync(mockupDir(project.id), { recursive: true });
  fs.writeFileSync(path.join(mockupDir(project.id), "project.json"), JSON.stringify(project, null, 2), "utf-8");
}

export function loadMockupProject(id: string): MockupProject {
  const file = path.join(mockupDir(id), "project.json");
  if (!fs.existsSync(file)) throw new Error(`Mockup project '${id}' not found.`);
  return JSON.parse(fs.readFileSync(file, "utf-8"));
}

export function listMockupProjects(): Array<{ id: string; createdAt: string; name: string; columns: number; devices: number }> {
  if (!fs.existsSync(ROOT)) return [];
  return fs
    .readdirSync(ROOT)
    .filter((n) => fs.existsSync(path.join(ROOT, n, "project.json")))
    .map((n) => {
      const p = loadMockupProject(n);
      return { id: p.id, createdAt: p.createdAt, name: p.name, columns: p.columns.length, devices: p.devices.length };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Column edit: applies to the column, so every device row picks it up --
 *  this IS the "propagate across all devices" behaviour; cell overrides
 *  (below) are the explicit per-row exception. */
export function updateColumnStyle(project: MockupProject, columnId: string, style: ColumnStyle): void {
  const idx = project.columns.findIndex((c) => c.id === columnId);
  if (idx === -1) throw new Error(`Column '${columnId}' not found.`);
  project.columns[idx] = { ...project.columns[idx], style };
}

export function cellKey(deviceRowId: string, columnId: string): string {
  return `${deviceRowId}:${columnId}`;
}

export function setCellOverride(project: MockupProject, deviceRowId: string, columnId: string, override: Partial<ColumnStyle> | null): void {
  const key = cellKey(deviceRowId, columnId);
  if (override === null) delete project.cells[key];
  else project.cells[key] = override;
}

/** Effective style for one (device row, column) cell = column style with
 *  any cell-level fields shadowing it. Sub-objects (title/background/
 *  deviceOne/etc.) are replaced wholesale by the override when present --
 *  simplest correct semantics for "resize this row's device differently". */
export function effectiveCellStyle(project: MockupProject, deviceRowId: string, columnId: string): ColumnStyle {
  const column = project.columns.find((c) => c.id === columnId);
  if (!column) throw new Error(`Column '${columnId}' not found.`);
  const override = project.cells[cellKey(deviceRowId, columnId)];
  if (!override) return column.style;
  return { ...column.style, ...override };
}

/** Adding a device row clones every existing column's style into that row
 *  implicitly (there is nothing to clone into -- cells are sparse and a
 *  missing cell just falls back to the column style), matching the
 *  reference's "new device row starts from the base device's screenshots". */
export function addDeviceRow(project: MockupProject, row: Omit<MockupDeviceRow, "id">): MockupDeviceRow {
  const created: MockupDeviceRow = { ...row, id: `dev_${Date.now()}_${Math.round(Math.random() * 1e4)}` };
  project.devices.push(created);
  return created;
}

export function addColumn(project: MockupProject, style: ColumnStyle): MockupColumn {
  const created: MockupColumn = { id: `col_${Date.now()}_${Math.round(Math.random() * 1e4)}`, order: project.columns.length, style };
  project.columns.push(created);
  return created;
}
