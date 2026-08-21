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
  /** Optional multi-screen sequence -- when set (2+ ids), the device
   *  cross-fades between these screens inside this one scene instead of
   *  showing a single static screenshot for its whole duration. Falls back
   *  to `sourceId` when absent. */
  screenIds?: string[];
  device: string;
  variant?: string;
  /** Fraction of canvas height the device fills (see deviceScaleFor) --
   *  template-specific so a tablet and a phone aren't forced to the same
   *  on-screen size. Falls back to 0.58 when unset. */
  deviceFraction?: number;
  /** "16:9" renders a landscape canvas (1920x1080); anything else (or unset)
   *  keeps the app-store-standard 9:16 portrait canvas (1080x1920). */
  aspectRatio?: "9:16" | "16:9";
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

import { loadProject, saveProject, listProjects } from "../project/projectStore.js";

const ROOT = path.join(process.cwd(), "output", "projects");

export function videoDir(id: string): string {
  const dir = path.join(ROOT, id, "video");
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
  throw new Error("Deprecated: Use createProject from projectStore instead");
}

export function saveVideoProject(project: VideoProject): void {
  const unified = loadProject(project.id);
  unified.video = project;
  saveProject(unified);
}

export function loadVideoProject(id: string): VideoProject {
  const unified = loadProject(id);
  return unified.video;
}

export function listVideoProjects(): Array<{ id: string; createdAt: string; name: string; scenes: number }> {
  return listProjects().map((p) => {
    const v = p.video;
    return { id: p.id, createdAt: p.createdAt, name: p.name, scenes: v.scenes?.length ?? 0 };
  });
}
