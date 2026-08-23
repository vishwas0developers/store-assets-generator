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
  /** Template-declared dynamic content for this scene, keyed by SlotSpec.key
   *  (see video/slots.ts) -- superset of the legacy text/subtext/sourceId/
   *  screenIds fields above, which stay populated in parallel because the
   *  device-preset templates' code-generated render path still reads them. */
  slotValues?: Record<string, SlotValue>;
}

export type SlotValue =
  | { kind: "text"; value: string }
  | { kind: "textList"; values: string[] }
  | { kind: "image"; sourceId: string | null }
  | { kind: "imageList"; sourceIds: (string | null)[] }
  | { kind: "platformList"; items: { name: string; icon: string; url: string }[] }
  /** An alternate mode for a single `image`-kind slot (currently only the
   *  `screenshot` role): instead of one static screenshot for the whole
   *  scene, cycle through several, each shown for its own durationSec, like
   *  a mini timeline within the scene. See slots.ts's resolveImageSequences
   *  -- this is driven by absolute document time (via a window.seek wrap),
   *  not wall-clock, so it renders identically in the interactive preview
   *  and in the frame-captured final video. */
  | { kind: "imageSequence"; segments: { sourceId: string | null; durationSec: number }[] };

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
  /** Project-wide defaults a slot falls back to when the scene has no value
   *  of its own -- e.g. set the app icon once, it appears in every scene
   *  that has a `logo` slot. */
  brand?: {
    appName?: string;
    appIcon?: string; // VideoSourceImage id
    accent?: string;
    platforms?: { name: string; icon: string; url: string }[];
  };
}

import { loadProject, saveProject, listProjects } from "../project/projectStore.js";
import { templateConfig, htmlSpanToAsterisk } from "./templateConfig.js";

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

/** Seeds `slotValues` for a scene saved before the slot system existed, from
 *  its legacy text/subtext/sourceId/screenIds fields -- old projects open
 *  with nothing lost. Reads `templateConfig` only (not slots.ts's full
 *  `slotSpecsForScene`) to avoid a circular import back through render.ts;
 *  it only needs to know each declared role's DOM key, not its resolved
 *  targets, to build the seed. */
function migrateScene(scene: VideoScene, cfgScene: any): void {
  if (scene.slotValues) return;
  const values: Record<string, SlotValue> = {};
  const slots: Record<string, string | string[]> | undefined = cfgScene?.slots ?? undefined;
  if (slots?.text && scene.text) values.text = { kind: "text", value: htmlSpanToAsterisk(scene.text) };
  if (slots?.subtext && scene.subtext) values.subtext = { kind: "text", value: htmlSpanToAsterisk(scene.subtext) };
  if (slots?.screenshots) {
    const ids = scene.screenIds ?? (scene.sourceId ? [scene.sourceId] : []);
    values.screenshots = { kind: "imageList", sourceIds: ids };
  } else if (slots?.screenshot && scene.sourceId) {
    values.screenshot = { kind: "image", sourceId: scene.sourceId };
  }
  scene.slotValues = values;
}

export function loadVideoProject(id: string): VideoProject {
  const unified = loadProject(id);
  const project: VideoProject = unified.video;
  if (project?.template && project.scenes?.length) {
    const cfg = templateConfig(project.template);
    project.scenes.forEach((scene: VideoScene, i: number) => migrateScene(scene, cfg?.scenes?.[i]));
  }
  return project;
}

export function listVideoProjects(): Array<{ id: string; createdAt: string; name: string; scenes: number }> {
  return listProjects().map((p) => {
    const v = p.video;
    return { id: p.id, createdAt: p.createdAt, name: p.name, scenes: v.scenes?.length ?? 0 };
  });
}
