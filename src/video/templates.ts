import { type VideoProject, type VideoScene } from "./project.js";

/**
 * Video tab starter templates -- each a complete ~60s multi-scene
 * animation sequence, built from the four scene animations in
 * video/render.ts (hero-rise, tilt-3d, zoom-focus, slide-pan). Selecting
 * one prepares Scene 1..N with sensible defaults; each scene is then
 * independently editable in the Scenes section. Nothing here is an AI
 * video engine -- every frame is plain HTML/CSS/JS, rendered by
 * video/render.ts.
 */

export interface VideoTemplateScene {
  sceneTemplate: string;
  durationSeconds: number;
  background: string;
  rotate: number;
  zoom: number;
  move: number;
}

export interface VideoTemplate {
  id: string;
  name: string;
  description: string;
  scenes: VideoTemplateScene[];
}

export const VIDEO_TEMPLATES: VideoTemplate[] = [
  {
    id: "feature-showcase",
    name: "Feature Showcase",
    description: "Six scenes, ~60s total -- rises, tilts and zooms through your app's key screens.",
    scenes: [
      { sceneTemplate: "hero-rise", durationSeconds: 10, background: "ocean", rotate: 15, zoom: 8, move: 60 },
      { sceneTemplate: "tilt-3d", durationSeconds: 10, background: "royal", rotate: 22, zoom: 10, move: 40 },
      { sceneTemplate: "zoom-focus", durationSeconds: 10, background: "graphite", rotate: 0, zoom: 14, move: 0 },
      { sceneTemplate: "slide-pan", durationSeconds: 10, background: "sunset", rotate: 12, zoom: 8, move: 100 },
      { sceneTemplate: "hero-rise", durationSeconds: 10, background: "mint", rotate: 15, zoom: 8, move: 60 },
      { sceneTemplate: "zoom-focus", durationSeconds: 10, background: "violet", rotate: 0, zoom: 16, move: 0 },
    ],
  },
  {
    id: "quick-teaser",
    name: "Quick Teaser",
    description: "Four punchy scenes, ~40s -- a fast-paced intro reel.",
    scenes: [
      { sceneTemplate: "zoom-focus", durationSeconds: 10, background: "graphite", rotate: 0, zoom: 18, move: 0 },
      { sceneTemplate: "slide-pan", durationSeconds: 10, background: "aurora", rotate: 10, zoom: 8, move: 120 },
      { sceneTemplate: "tilt-3d", durationSeconds: 10, background: "citrus", rotate: 25, zoom: 10, move: 30 },
      { sceneTemplate: "hero-rise", durationSeconds: 10, background: "ocean", rotate: 15, zoom: 10, move: 80 },
    ],
  },
  {
    id: "cinematic-tour",
    name: "Cinematic Tour",
    description: "Seven slower scenes, ~70s -- a deliberate, cinematic walk through the app.",
    scenes: [
      { sceneTemplate: "hero-rise", durationSeconds: 10, background: "graphite", rotate: 10, zoom: 6, move: 40 },
      { sceneTemplate: "tilt-3d", durationSeconds: 10, background: "royal", rotate: 18, zoom: 8, move: 30 },
      { sceneTemplate: "slide-pan", durationSeconds: 10, background: "sunset", rotate: 8, zoom: 6, move: 90 },
      { sceneTemplate: "zoom-focus", durationSeconds: 10, background: "mint", rotate: 0, zoom: 12, move: 0 },
      { sceneTemplate: "hero-rise", durationSeconds: 10, background: "candy", rotate: 10, zoom: 6, move: 40 },
      { sceneTemplate: "tilt-3d", durationSeconds: 10, background: "violet", rotate: 18, zoom: 8, move: 30 },
      { sceneTemplate: "zoom-focus", durationSeconds: 10, background: "ocean", rotate: 0, zoom: 14, move: 0 },
    ],
  },
];

export function applyVideoTemplate(project: VideoProject, templateId: string, defaultDevice: string): void {
  const template = VIDEO_TEMPLATES.find((t) => t.id === templateId);
  if (!template) throw new Error(`Unknown video template '${templateId}'.`);

  project.template = templateId;
  project.scenes = template.scenes.map((s, i): VideoScene => ({
    id: `scene_${i + 1}`,
    order: i,
    sceneTemplate: s.sceneTemplate,
    sourceId: project.sources[i]?.id,
    device: defaultDevice,
    background: s.background,
    text: "",
    subtext: "",
    durationSeconds: s.durationSeconds,
    rotate: s.rotate,
    zoom: s.zoom,
    move: s.move,
  }));
}
