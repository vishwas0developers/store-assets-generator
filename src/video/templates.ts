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
  {
    id: "social-promo",
    name: "Social Promo",
    description: "Five fast-paced scenes, ~50s -- ideal for social media sharing and promo reels.",
    scenes: [
      { sceneTemplate: "slide-pan", durationSeconds: 10, background: "candy", rotate: -10, zoom: 6, move: 110 },
      { sceneTemplate: "hero-rise", durationSeconds: 10, background: "violet", rotate: 12, zoom: 12, move: 50 },
      { sceneTemplate: "zoom-focus", durationSeconds: 10, background: "citrus", rotate: 0, zoom: 15, move: 0 },
      { sceneTemplate: "tilt-3d", durationSeconds: 10, background: "aurora", rotate: 20, zoom: 8, move: 45 },
      { sceneTemplate: "hero-rise", durationSeconds: 10, background: "sunset", rotate: -15, zoom: 10, move: 70 },
    ],
  },
];

export function applyVideoTemplate(project: VideoProject, templateId: string, defaultDevice: string): void {
  const template = VIDEO_TEMPLATES.find((t) => t.id === templateId);
  if (!template) throw new Error(`Unknown video template '${templateId}'.`);

  // Pre-configured titles and subtitles per template for premium default appearance
  const defaultTexts: Record<string, Array<{ text: string; subtext: string }>> = {
    "feature-showcase": [
      { text: "Welcome to AppName", subtext: "The ultimate companion" },
      { text: "Realtime Statistics", subtext: "Track everything instantly" },
      { text: "Global Connections", subtext: "Work seamlessly everywhere" },
      { text: "Premium Safety", subtext: "Bank-grade file protection" },
      { text: "Collaborate Together", subtext: "Invite your team in one click" },
      { text: "Get Started Now", subtext: "Available on all major platforms" }
    ],
    "quick-teaser": [
      { text: "Fast & Powerful", subtext: "Experience the new speed" },
      { text: "Intelligent AI", subtext: "Automate your daily workflows" },
      { text: "Stunning Graphics", subtext: "Visuals that amaze" },
      { text: "Join Millions", subtext: "Start your journey today" }
    ],
    "cinematic-tour": [
      { text: "A New Vision", subtext: "Crafted for simplicity" },
      { text: "Explore Details", subtext: "No feature left behind" },
      { text: "Seamless Experience", subtext: "Optimized for all viewports" },
      { text: "Stay Organized", subtext: "Everything in one secure place" },
      { text: "Share Progress", subtext: "Connect and export anywhere" },
      { text: "Advanced Settings", subtext: "Customize it to your liking" },
      { text: "Ready to Level Up?", subtext: "Download from stores now" }
    ],
    "social-promo": [
      { text: "Discover Something New", subtext: "Swipe to explore" },
      { text: "Designed for You", subtext: "Tailored experience" },
      { text: "Boost Productivity", subtext: "Save 10+ hours weekly" },
      { text: "Interactive Panels", subtext: "Engaging dashboard views" },
      { text: "Try it Free Today", subtext: "No credit card required" }
    ]
  };

  const texts = defaultTexts[templateId] || [];

  project.template = templateId;
  project.scenes = template.scenes.map((s, i): VideoScene => ({
    id: `scene_${i + 1}`,
    order: i,
    sceneTemplate: s.sceneTemplate,
    sourceId: project.sources[i]?.id,
    device: defaultDevice,
    background: s.background,
    text: texts[i]?.text || "",
    subtext: texts[i]?.subtext || "",
    durationSeconds: s.durationSeconds,
    rotate: s.rotate,
    zoom: s.zoom,
    move: s.move,
  }));
}
