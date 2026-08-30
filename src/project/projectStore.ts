import fs from "fs";
import path from "path";

export interface ProjectCapture {
  id: number;
  file: string; // e.g. "captures/1.png" relative to project dir
  url: string;
  capturedAt: string;
  width: number;
  height: number;
  resolution?: string;   // e.g. "1242x2688"
  deviceLabel?: string;  // e.g. "Phone – 6.5\" Display"
  /** "video" = an .mp4 screen recording. Absent/"image" = a PNG screenshot. */
  kind?: "image" | "video";
  durationSec?: number;  // videos only
}

export interface ProjectState {
  id: string;
  name: string;
  createdAt: string;
  appCategory: string;
  targetUrl: string;
  captures: ProjectCapture[];
  mockup: any; // Nested MockupProject state
  video: any;  // Nested VideoProject state
}

const ROOT = path.join(process.cwd(), "output", "projects");

export function getProjectRootDir(): string {
  if (!fs.existsSync(ROOT)) {
    fs.mkdirSync(ROOT, { recursive: true });
  }
  return ROOT;
}

export function projectDir(id: string): string {
  const root = getProjectRootDir();
  const dir = path.join(root, id);
  const rel = path.relative(root, dir);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error(`Security Exception: Access denied to project id '${id}'`);
  }
  return dir;
}

export function projectFile(id: string, relative: string): string {
  const dir = projectDir(id);
  const full = path.join(dir, relative);
  const rel = path.relative(dir, full);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error(`Security Exception: Access denied to path '${relative}'`);
  }
  return full;
}

export function createProject(name: string, appCategory = "Utility", targetUrl = ""): ProjectState {
  const id = `project-${Date.now()}`;
  const dir = projectDir(id);

  fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(path.join(dir, "captures"), { recursive: true });
  fs.mkdirSync(path.join(dir, "mockup"), { recursive: true });
  fs.mkdirSync(path.join(dir, "mockup", "sources"), { recursive: true });
  fs.mkdirSync(path.join(dir, "mockup", "exports"), { recursive: true });
  fs.mkdirSync(path.join(dir, "video"), { recursive: true });
  fs.mkdirSync(path.join(dir, "video", "sources"), { recursive: true });
  fs.mkdirSync(path.join(dir, "uploads"), { recursive: true });
  fs.mkdirSync(path.join(dir, "exports"), { recursive: true });

  const project: ProjectState = {
    id,
    name,
    createdAt: new Date().toISOString(),
    appCategory,
    targetUrl,
    captures: [],
    mockup: {
      id,
      createdAt: new Date().toISOString(),
      name,
      appCategory,
      sources: [],
      devices: [],
      columns: [],
      cells: {},
      globalPanoramic: { flip: false },
      settings: { inspectorPosition: "right", screenshotSizeLabel: "6.5 Inch", palette: [] },
    },
    video: {
      id,
      createdAt: new Date().toISOString(),
      name,
      template: null,
      sources: [],
      scenes: [],
      bgm: null,
      outputs: {},
    }
  };

  saveProject(project);
  return project;
}

export function saveProject(project: ProjectState): void {
  const dir = projectDir(project.id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "project.json"), JSON.stringify(project, null, 2), "utf-8");
}

export function loadProject(id: string): ProjectState {
  const file = path.join(projectDir(id), "project.json");
  if (!fs.existsSync(file)) {
    throw new Error(`Project '${id}' not found.`);
  }
  return JSON.parse(fs.readFileSync(file, "utf-8"));
}

export function listProjects(): Array<ProjectState> {
  const root = getProjectRootDir();
  if (!fs.existsSync(root)) return [];
  return fs
    .readdirSync(root)
    .filter((n) => fs.existsSync(path.join(root, n, "project.json")))
    .map((n) => loadProject(n))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function deleteProject(id: string): void {
  const dir = projectDir(id);
  fs.rmSync(dir, { recursive: true, force: true });
}
