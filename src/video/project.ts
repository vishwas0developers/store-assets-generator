import fs from "fs";
import path from "path";

/**
 * Video tab storage -- completely independent of Screen Capture and Studio
 * Mockup (own root, own uploaded source images, no shared state). A video
 * project picks a template (a full multi-scene animation sequence), then
 * each scene is edited independently.
 *
 *   output/videos/<id>/project.json
 *   output/videos/<id>/sources/     uploaded screenshot images
 *   output/videos/<id>/video/       rendered promo.mp4 + bgm
 */

export interface VideoSourceImage {
  id: string;
  name: string;
  file: string; // relative to project dir, e.g. "sources/img_1.png"
  width: number;
  height: number;
}

export interface VideoScene {
  id: string;
  order: number;
  /** Which scene-template animation this scene uses (see video/templates.ts). */
  sceneTemplate: string;
  sourceId?: string;
  device: string;
  variant?: string;
  background: string;
  text: string;
  subtext: string;
  durationSeconds: number;
  rotate: number;
  zoom: number;
  move: number;
}

export interface VideoProject {
  id: string;
  createdAt: string;
  name: string;
  /** The chosen top-level template (a full ~60s sequence recipe). */
  template: string | null;
  sources: VideoSourceImage[];
  scenes: VideoScene[];
  bgm: string | null;
  outputs: { video?: string };
}

const ROOT = path.join(process.cwd(), "output", "videos");

export function videoDir(id: string): string {
  const dir = path.join(ROOT, id);
  const rel = path.relative(ROOT, dir);
  if (rel.startsWith("..") || path.isAbsolute(rel)) throw new Error(`Invalid video project id '${id}'.`);
  return dir;
}

export function videoFile(id: string, relative: string): string {
  const dir = videoDir(id);
  const full = path.join(dir, relative);
  const rel = path.relative(dir, full);
  if (rel.startsWith("..") || path.isAbsolute(rel)) throw new Error(`Invalid path '${relative}'.`);
  return full;
}

export function createVideoProject(name: string): VideoProject {
  const id = `video-${Date.now()}`;
  const project: VideoProject = {
    id,
    createdAt: new Date().toISOString(),
    name,
    template: null,
    sources: [],
    scenes: [],
    bgm: null,
    outputs: {},
  };
  fs.mkdirSync(path.join(videoDir(id), "sources"), { recursive: true });
  saveVideoProject(project);
  return project;
}

export function saveVideoProject(project: VideoProject): void {
  fs.mkdirSync(videoDir(project.id), { recursive: true });
  fs.writeFileSync(path.join(videoDir(project.id), "project.json"), JSON.stringify(project, null, 2), "utf-8");
}

export function loadVideoProject(id: string): VideoProject {
  const file = path.join(videoDir(id), "project.json");
  if (!fs.existsSync(file)) throw new Error(`Video project '${id}' not found.`);
  return JSON.parse(fs.readFileSync(file, "utf-8"));
}

export function listVideoProjects(): Array<{ id: string; createdAt: string; name: string; scenes: number }> {
  if (!fs.existsSync(ROOT)) return [];
  return fs
    .readdirSync(ROOT)
    .filter((n) => fs.existsSync(path.join(ROOT, n, "project.json")))
    .map((n) => {
      const p = loadVideoProject(n);
      return { id: p.id, createdAt: p.createdAt, name: p.name, scenes: p.scenes.length };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
