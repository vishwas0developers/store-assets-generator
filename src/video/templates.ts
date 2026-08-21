import { type VideoProject, type VideoScene } from "./project.js";

/**
 * Video tab starter templates -- each a complete multi-scene animation
 * sequence, built from the scene animations in video/render.ts. Every
 * template owns its own device + variant + framing (deviceFraction) so the
 * five read as five genuinely different mockup videos, not the same phone
 * with different colors. Selecting one prepares Scene 1..N with sensible
 * defaults; each scene is then independently editable in the Scenes
 * section. Nothing here is an AI video engine -- every frame is plain
 * HTML/CSS/JS, rendered by video/render.ts.
 */

export interface VideoTemplateScene {
  label: string;
  sceneTemplate: string;
  durationSeconds: number;
  background: string;
  rotate: number;
  zoom: number;
  move: number;
  /** When >1, this scene cross-fades through that many screens inside the
   *  device instead of showing one static screenshot for its whole run. */
  screenCount?: number;
}

export interface VideoTemplate {
  id: string;
  name: string;
  description: string;
  useCase: string;
  designStyle: string;
  aspectRatio: string;
  features: string[];
  /** The device this template is designed around -- fixed, not user-selectable;
   *  each template's scene proportions/pacing are tuned for this one device. */
  device: string;
  variant?: string;
  /** Fraction of canvas height the device fills -- a tablet and a flip phone
   *  should not be forced to the same on-screen size. */
  deviceFraction: number;
  scenes: VideoTemplateScene[];
}

export const VIDEO_TEMPLATES: VideoTemplate[] = [
  {
    id: "foldable-unfold",
    device: "samsung-galaxy-z-fold",
    variant: "unfolded",
    deviceFraction: 0.5,
    name: "Foldable Unfold",
    description: "Opens on the fold itself -- the cover screen gives way to the wide unfolded display before the feature tour begins.",
    useCase: "Best for foldable-specific launches and 'more screen, more app' positioning.",
    designStyle: "Wide near-square canvas, hinge seam, a deliberate unfold as the hero beat.",
    aspectRatio: "9:16",
    features: ["Real hinge-open animation", "Wide unfolded canvas", "Multi-screen swap mid-scene"],
    scenes: [
      { label: "Unfold", sceneTemplate: "fold-open", durationSeconds: 4.5, background: "graphite", rotate: 10, zoom: 8, move: 30 },
      { label: "Continuity", sceneTemplate: "zoom-focus", durationSeconds: 5, background: "royal", rotate: 0, zoom: 14, move: 0, screenCount: 2 },
      { label: "Multitasking", sceneTemplate: "parallax-stack", durationSeconds: 5, background: "mint", rotate: 6, zoom: 10, move: 40, screenCount: 2 },
      { label: "Outro / CTA", sceneTemplate: "outro-cta", durationSeconds: 5, background: "violet", rotate: 0, zoom: 12, move: 0 },
    ],
  },
  {
    id: "feature-showcase",
    device: "apple-iphone-17-pro-max",
    deviceFraction: 0.6,
    name: "Feature Showcase",
    description: "A confident walkthrough of your app's core features, closing on a clear call to action.",
    useCase: "Best for App Store / Play Store preview videos and feature-launch announcements.",
    designStyle: "Tall dynamic-island silhouette, deep gradients, staged 3D device motion.",
    aspectRatio: "9:16",
    features: ["Word-staggered titles", "Six-scene arc with a dedicated outro", "Depth-drifting backdrops"],
    scenes: [
      { label: "Cold open", sceneTemplate: "hero-rise", durationSeconds: 4.5, background: "ocean", rotate: 15, zoom: 8, move: 60 },
      { label: "Feature one", sceneTemplate: "tilt-3d", durationSeconds: 5, background: "royal", rotate: 22, zoom: 10, move: 40 },
      { label: "Feature two", sceneTemplate: "mask-reveal", durationSeconds: 5, background: "graphite", rotate: 8, zoom: 14, move: 50, screenCount: 3 },
      { label: "Feature three", sceneTemplate: "slide-pan", durationSeconds: 5, background: "sunset", rotate: 12, zoom: 8, move: 80 },
      { label: "Feature four", sceneTemplate: "kinetic-type", durationSeconds: 5, background: "mint", rotate: 6, zoom: 12, move: 30 },
      { label: "Outro / CTA", sceneTemplate: "outro-cta", durationSeconds: 5, background: "violet", rotate: 0, zoom: 16, move: 0 },
    ],
  },
  {
    id: "social-promo",
    device: "google-pixel-9",
    deviceFraction: 0.56,
    name: "Social Promo",
    description: "Five fast-paced scenes tuned for feed autoplay -- clear in the first second, no sound required.",
    useCase: "Best for Instagram/TikTok/X promo clips and paid social creative.",
    designStyle: "Thin-bezel punch-hole silhouette, saturated gradients, energetic entrances.",
    aspectRatio: "9:16",
    features: ["Autoplay-safe pacing", "Five distinct entrance styles", "Built-in CTA close"],
    scenes: [
      { label: "Hook", sceneTemplate: "slide-pan", durationSeconds: 4, background: "candy", rotate: -10, zoom: 6, move: 90 },
      { label: "Feature one", sceneTemplate: "hero-rise", durationSeconds: 4, background: "violet", rotate: 12, zoom: 12, move: 50 },
      { label: "Feature two", sceneTemplate: "kinetic-type", durationSeconds: 4, background: "citrus", rotate: 0, zoom: 15, move: 0, screenCount: 2 },
      { label: "Feature three", sceneTemplate: "card-flip", durationSeconds: 4, background: "aurora", rotate: 20, zoom: 8, move: 45 },
      { label: "CTA", sceneTemplate: "outro-cta", durationSeconds: 4.5, background: "sunset", rotate: -15, zoom: 10, move: 70 },
    ],
  },
  {
    id: "quick-teaser",
    device: "samsung-galaxy-s24",
    deviceFraction: 0.62,
    name: "Quick Teaser",
    description: "A fast-paced intro reel that hits four beats and gets out -- built for short attention spans.",
    useCase: "Best for social ads, Stories/Reels-style teasers, and 15-30s pre-roll.",
    designStyle: "Tightest bezel and radius of the set, high-contrast, snappy overshoot easing.",
    aspectRatio: "9:16",
    features: ["Sub-4s scene pacing", "Card-flip reveal", "Kinetic type throughout"],
    scenes: [
      { label: "Hook", sceneTemplate: "kinetic-type", durationSeconds: 3.5, background: "graphite", rotate: 0, zoom: 18, move: 0 },
      { label: "Payoff", sceneTemplate: "slide-pan", durationSeconds: 3.5, background: "aurora", rotate: 10, zoom: 8, move: 90 },
      { label: "Detail", sceneTemplate: "card-flip", durationSeconds: 3.5, background: "citrus", rotate: 25, zoom: 10, move: 30 },
      { label: "CTA", sceneTemplate: "outro-cta", durationSeconds: 4, background: "ocean", rotate: 15, zoom: 10, move: 60 },
    ],
  },
  {
    id: "studio-tablet",
    device: "ipad-pro-12-9",
    deviceFraction: 0.6,
    name: "Studio Tablet",
    description: "A widescreen landscape tour built around a tablet canvas -- room to show a full workspace, not just a phone screen.",
    useCase: "Best for productivity/creative apps and landing-page hero videos where the tablet layout is the selling point.",
    designStyle: "Full 16:9 landscape canvas -- device and copy sit side by side instead of stacked, chunky bezel, slow horizontal pans.",
    aspectRatio: "16:9",
    features: ["Full-width 16:9 landscape canvas", "Tablet-tuned pan motion", "Multi-screen workspace swap"],
    scenes: [
      { label: "Cold open", sceneTemplate: "tablet-pan", durationSeconds: 6, background: "light", rotate: 8, zoom: 8, move: 40 },
      { label: "Workspace", sceneTemplate: "zoom-focus", durationSeconds: 6, background: "mint", rotate: 0, zoom: 12, move: 0, screenCount: 3 },
      { label: "Collaboration", sceneTemplate: "tablet-pan", durationSeconds: 6, background: "aurora", rotate: 6, zoom: 10, move: 30 },
      { label: "Outro / CTA", sceneTemplate: "outro-cta", durationSeconds: 5, background: "light", rotate: 0, zoom: 10, move: 0 },
    ],
  },
  {
    id: "landscape-hero",
    device: "apple-iphone-18-pro-max",
    deviceFraction: 0.62,
    name: "Widescreen Hero",
    description: "A premium 16:9 hero reel -- the flagship device tilts and settles beside bold kinetic copy, built for a landing-page opener.",
    useCase: "Best as a website hero video, keynote opener, or paid display ad in a landscape placement.",
    designStyle: "Full 16:9 canvas, deep cinematic gradients, staged 3D device motion beside large kinetic type.",
    aspectRatio: "16:9",
    features: ["Cinematic 3D tilt entrance", "Kinetic type pairing", "Dedicated outro CTA beat"],
    scenes: [
      { label: "Cold open", sceneTemplate: "tilt-3d", durationSeconds: 5, background: "ocean", rotate: 20, zoom: 10, move: 40 },
      { label: "Feature one", sceneTemplate: "kinetic-type", durationSeconds: 5, background: "royal", rotate: 0, zoom: 14, move: 0, screenCount: 2 },
      { label: "Feature two", sceneTemplate: "mask-reveal", durationSeconds: 5, background: "violet", rotate: 6, zoom: 12, move: 30 },
      { label: "Outro / CTA", sceneTemplate: "outro-cta", durationSeconds: 5, background: "sunset", rotate: 0, zoom: 16, move: 0 },
    ],
  },
  {
    id: "landscape-cinematic",
    device: "samsung-galaxy-z-fold",
    variant: "unfolded",
    deviceFraction: 0.52,
    name: "Cinematic Unfold",
    description: "A slower widescreen story built around the foldable's open hinge moment -- generous pacing, soft depth, premium reveal.",
    useCase: "Best for foldable-specific landing pages and investor/press reveal videos where the unfold itself is the story.",
    designStyle: "Full 16:9 canvas, the widest device of the set, restrained palette, deliberate hinge-open cold open.",
    aspectRatio: "16:9",
    features: ["Full-width hinge-open cold open", "Widest device silhouette in landscape", "Slow, deliberate pacing"],
    scenes: [
      { label: "Unfold", sceneTemplate: "fold-open", durationSeconds: 6, background: "graphite", rotate: 8, zoom: 8, move: 20 },
      { label: "Continuity", sceneTemplate: "parallax-stack", durationSeconds: 6, background: "royal", rotate: 4, zoom: 10, move: 30, screenCount: 2 },
      { label: "Detail", sceneTemplate: "zoom-focus", durationSeconds: 6, background: "candy", rotate: 0, zoom: 12, move: 0 },
      { label: "Outro / CTA", sceneTemplate: "outro-cta", durationSeconds: 6, background: "graphite", rotate: 0, zoom: 12, move: 0 },
    ],
  },
  {
    id: "landscape-social-ad",
    device: "google-pixel-9",
    deviceFraction: 0.6,
    name: "Widescreen Social Ad",
    description: "A punchy 16:9 ad cut -- fast beats, high-contrast gradients, built to hold attention on a landscape feed placement.",
    useCase: "Best for YouTube pre-roll, landscape display ads, and paid social placements that aren't Stories/Reels-shaped.",
    designStyle: "Full 16:9 canvas, saturated gradients, snappy card-flip and slide beats, tight pacing throughout.",
    aspectRatio: "16:9",
    features: ["Sub-5s scene pacing", "Card-flip reveal beside copy", "Built-in CTA close"],
    scenes: [
      { label: "Hook", sceneTemplate: "slide-pan", durationSeconds: 4, background: "citrus", rotate: -10, zoom: 8, move: 70 },
      { label: "Feature one", sceneTemplate: "card-flip", durationSeconds: 4.5, background: "aurora", rotate: 18, zoom: 8, move: 30 },
      { label: "Feature two", sceneTemplate: "hero-rise", durationSeconds: 4.5, background: "candy", rotate: 10, zoom: 12, move: 40 },
      { label: "CTA", sceneTemplate: "outro-cta", durationSeconds: 4, background: "sunset", rotate: 0, zoom: 12, move: 0 },
    ],
  },
  {
    id: "landscape-minimal",
    device: "android-tablet-10",
    deviceFraction: 0.58,
    name: "Widescreen Minimal",
    description: "A calm, light-mode 16:9 tour for apps that sell on clarity over spectacle -- soft mask reveals, even pacing.",
    useCase: "Best for finance, productivity, and utility apps where a restrained landscape tone builds trust.",
    designStyle: "Full 16:9 canvas, airy light backgrounds, mask-reveal led, understated device motion.",
    aspectRatio: "16:9",
    features: ["Light-toned widescreen palette", "Mask-reveal led entrance", "Even, unhurried pacing"],
    scenes: [
      { label: "Cold open", sceneTemplate: "mask-reveal", durationSeconds: 5, background: "light", rotate: 4, zoom: 8, move: 20 },
      { label: "Feature one", sceneTemplate: "zoom-focus", durationSeconds: 5, background: "mint", rotate: 0, zoom: 10, move: 0, screenCount: 2 },
      { label: "Feature two", sceneTemplate: "parallax-stack", durationSeconds: 5, background: "aurora", rotate: 4, zoom: 8, move: 30 },
      { label: "Outro / CTA", sceneTemplate: "outro-cta", durationSeconds: 5, background: "light", rotate: 0, zoom: 10, move: 0 },
    ],
  },
];

export function applyVideoTemplate(project: VideoProject, templateId: string): void {
  const template = VIDEO_TEMPLATES.find((t) => t.id === templateId);
  if (!template) throw new Error(`Unknown video template '${templateId}'.`);

  // Pre-configured titles and subtitles per template for premium default appearance
  const defaultTexts: Record<string, Array<{ text: string; subtext: string }>> = {
    "foldable-unfold": [
      { text: "One Phone, Two Screens", subtext: "Unfold into more app" },
      { text: "Pick Up Where You Left Off", subtext: "Seamless across both screens" },
      { text: "Multitask in Style", subtext: "Two apps, side by side" },
      { text: "Fold Into It", subtext: "Available on all major platforms" },
    ],
    "feature-showcase": [
      { text: "Welcome to AppName", subtext: "The ultimate companion" },
      { text: "Realtime Statistics", subtext: "Track everything instantly" },
      { text: "Global Connections", subtext: "Work seamlessly everywhere" },
      { text: "Premium Safety", subtext: "Bank-grade file protection" },
      { text: "Collaborate Together", subtext: "Invite your team in one click" },
      { text: "Get Started Now", subtext: "Available on all major platforms" }
    ],
    "social-promo": [
      { text: "Discover Something New", subtext: "Swipe to explore" },
      { text: "Designed for You", subtext: "Tailored experience" },
      { text: "Boost Productivity", subtext: "Save 10+ hours weekly" },
      { text: "Interactive Panels", subtext: "Engaging dashboard views" },
      { text: "Try it Free Today", subtext: "No credit card required" }
    ],
    "quick-teaser": [
      { text: "Fast & Powerful", subtext: "Experience the new speed" },
      { text: "Intelligent AI", subtext: "Automate your daily workflows" },
      { text: "Stunning Graphics", subtext: "Visuals that amaze" },
      { text: "Join Millions", subtext: "Start your journey today" }
    ],
    "studio-tablet": [
      { text: "Built for the Big Screen", subtext: "Every detail, full canvas" },
      { text: "Your Whole Workspace", subtext: "Everything within reach" },
      { text: "Work Better Together", subtext: "Real-time collaboration" },
      { text: "Start Creating Today", subtext: "Available on tablet and desktop" }
    ],
    "landscape-hero": [
      { text: "Introducing AppName", subtext: "Reimagined for widescreen" },
      { text: "Power, Refined", subtext: "Every detail considered" },
      { text: "Built to Impress", subtext: "Crafted for the big picture" },
      { text: "See It for Yourself", subtext: "Available now on every store" }
    ],
    "landscape-cinematic": [
      { text: "One Device, Wide Open", subtext: "More screen, more story" },
      { text: "Seamless in Every Fold", subtext: "Continuity across states" },
      { text: "Detail That Matters", subtext: "Precision in every pixel" },
      { text: "Unfold the Possibilities", subtext: "Reserve yours today" }
    ],
    "landscape-social-ad": [
      { text: "Stop Scrolling", subtext: "This one's worth it" },
      { text: "Flip the Script", subtext: "A new way to get things done" },
      { text: "Rise Above the Rest", subtext: "Built for the way you work" },
      { text: "Get It Now", subtext: "Free to start, no card required" }
    ],
    "landscape-minimal": [
      { text: "Clarity, Widescreen", subtext: "Everything in its place" },
      { text: "Focus on What Matters", subtext: "Distraction-free, at scale" },
      { text: "Built to Last", subtext: "Reliable across every device" },
      { text: "Start Free Today", subtext: "No clutter, no compromise" }
    ],
  };

  const texts = defaultTexts[templateId] || [];

  let sourceCursor = 0;
  project.template = templateId;
  project.scenes = template.scenes.map((s, i): VideoScene => {
    const count = s.screenCount && s.screenCount > 1 ? s.screenCount : 1;
    const slice = project.sources.slice(sourceCursor, sourceCursor + count);
    sourceCursor += count;
    // Pad with placeholder-only slot ids so a multi-screen scene still shows
    // its full swap (via distinct placeholders) even with no real sources yet.
    const screenIds = count > 1 ? Array.from({ length: count }, (_, j) => slice[j]?.id ?? `__placeholder_${i}_${j}__`) : undefined;
    return {
      id: `scene_${i + 1}`,
      order: i,
      sceneTemplate: s.sceneTemplate,
      sourceId: slice[0]?.id,
      screenIds,
      device: template.device,
      variant: template.variant,
      deviceFraction: template.deviceFraction,
      aspectRatio: template.aspectRatio === "16:9" ? "16:9" : "9:16",
      background: s.background,
      text: texts[i]?.text || "",
      subtext: texts[i]?.subtext || "",
      durationSeconds: s.durationSeconds,
      rotate: s.rotate,
      zoom: s.zoom,
      move: s.move,
    };
  });
}

/** A throwaway in-memory project for a template -- used to preview or
 *  thumbnail a template before it's ever applied to a real project.
 *  `sources` (real screenshots) can be borrowed from an existing project;
 *  otherwise scenes render with the render pipeline's placeholder screens. */
export function scratchVideoProject(templateId: string, sources: VideoProject["sources"] = []): VideoProject {
  const scratch: VideoProject = {
    id: "__template_preview__",
    createdAt: new Date().toISOString(),
    name: templateId,
    template: null,
    sources,
    scenes: [],
    bgm: null,
    outputs: {},
  };
  applyVideoTemplate(scratch, templateId);
  return scratch;
}
