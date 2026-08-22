import fs from "fs";
import path from "path";

/**
 * Video tab storage -- completely independent of Screen Capture and Studio
 * Mockup (own root, own uploaded source images, no shared state). A video
 * project picks a template (a full multi-scene animation sequence), then
 * each scene is edited independently.
 *
 *   output/projects/<id>/video/project.json  (via the unified project store)
 *   output/projects/<id>/video/sources/      uploaded screenshot/recording sources
 *   output/projects/<id>/video/video/        rendered promo.mp4 + bgm
 */

export interface VideoSourceImage {
  id: string;
  name: string;
  file: string; // relative to project dir, e.g. "sources/img_1.png"
  width: number;
  height: number;
  /** "video" sources play a real screen recording inside the device instead
   *  of a static screenshot -- see sceneHtml's device-video rendering and
   *  window.seek's <video> handling. Falls back to "image" when unset (every
   *  source predating this field). */
  kind?: "image" | "video";
}

export interface FlowStep {
  label: string;
  startSec: number;
  durationSec: number;
  side: "left" | "right";
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
  /** Composition id from LAYOUTS (render.ts) -- which side the device sits
   *  on and how the copy block is sized/aligned. Falls back to a
   *  per-orientation default (copy-left / stacked-top) when unset. */
  layout?: string;
  /** How much physical depth the device renders with. "flat" is today's
   *  plain 2D frame; "perspective" tilts the same flat plane with a matched
   *  shadow; "float" and "showcase" use the full six-face 3D rig ("showcase"
   *  additionally implies the showcase-3d entrance animation). Falls back to
   *  "flat". */
  depth?: "flat" | "perspective" | "float" | "showcase";
  /** In/out transition applied to this scene's first/last ~400ms. Falls
   *  back to "cut" (no transition). */
  transition?: "cut" | "fade" | "slide" | "wipe" | "zoom";
  /** Dynamic flow labels for landscape screen-recording walkthroughs. */
  flowSteps?: FlowStep[];
  /** Percent-positioned icon/badge/shape callouts -- see decorationsMarkup. */
  decorations?: import("../render/shared.js").DecorationLike[];
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
  /** Mux volume for `bgm`, 0-1. Falls back to 0.35 when unset. */
  bgmVolume?: number;
  /** Fade-in/out length in ms, anchored to the start and to the true video
   *  duration respectively. Fall back to 1500 / 2000 when unset. */
  bgmFadeInMs?: number;
  bgmFadeOutMs?: number;
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
