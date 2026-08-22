import { type FlowStep, type VideoProject, type VideoScene } from "./project.js";

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
  /** Which side the device/copy sit on -- see LAYOUTS in render.ts. Falls
   *  back to a per-orientation default when unset. */
  layout?: string;
  /** Device depth treatment -- "flat" (default), "perspective", "float", or
   *  "showcase" (full 3D rig). See render.ts's deviceRigMarkup. */
  depth?: "flat" | "perspective" | "float" | "showcase";
  /** In/out transition for this scene. Falls back to "cut". */
  transition?: "cut" | "fade" | "slide" | "wipe" | "zoom";
  /** Dynamic flow labels for landscape walkthrough scene. */
  flowSteps?: FlowStep[];
  /** On-screen title and supporting line for this scene. */
  text: string;
  subtext: string;
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
  // =========================================================================
  // PORTRAIT TEMPLATES (9:16) — 5 Distinct Devices
  // =========================================================================
  {
    id: "iphone-15-pro-portrait",
    device: "apple-iphone-15-pro",
    deviceFraction: 0.6,
    name: "iPhone 15 Pro — Modern Premium",
    description: "Flagship titanium aesthetic with deep gradients, subtle 3D entrance choreography, and an immersive zoom-to-app flow close.",
    useCase: "Best for premium App Store previews, brand-forward mobile utilities, and fintech launches.",
    designStyle: "Refined Dynamic Island silhouette, deep oceanic tones, horizontally centered presentation, 3D product perspective.",
    aspectRatio: "9:16",
    features: ["Cohesive 6-scene portrait arc", "Subtle 3D perspective tilts", "Full zoom-into-screen final app flow"],
    scenes: [
      { label: "Cold Open", sceneTemplate: "hero-rise", durationSeconds: 4.5, background: "ocean", rotate: 10, zoom: 8, move: 40, layout: "stacked-top", depth: "perspective", transition: "cut", text: "Welcome to AppName", subtext: "The ultimate companion" },
      { label: "Core Feature", sceneTemplate: "tilt-3d", durationSeconds: 5, background: "royal", rotate: 12, zoom: 10, move: 30, layout: "stacked-bottom", depth: "perspective", transition: "fade", text: "Realtime Statistics", subtext: "Track every metric instantly" },
      { label: "Detail View", sceneTemplate: "mask-reveal", durationSeconds: 5, background: "graphite", rotate: 0, zoom: 12, move: 20, layout: "stacked-top", depth: "flat", transition: "fade", screenCount: 2, text: "Seamless Sync", subtext: "Live updates across all devices" },
      { label: "Highlight", sceneTemplate: "zoom-focus", durationSeconds: 5, background: "royal", rotate: 0, zoom: 14, move: 0, layout: "full-bleed", depth: "perspective", transition: "wipe", text: "Bank-Grade Security", subtext: "Protected with end-to-end encryption" },
      { label: "Benefit", sceneTemplate: "parallax-stack", durationSeconds: 5, background: "ocean", rotate: 6, zoom: 10, move: 25, layout: "stacked-bottom", depth: "float", transition: "fade", text: "Collaborate Together", subtext: "Invite your team in one click" },
      { label: "App Flow", sceneTemplate: "portrait-flow", durationSeconds: 7, background: "graphite", rotate: 0, zoom: 18, move: 0, layout: "full-bleed", depth: "showcase", transition: "zoom", text: "Experience the Full App", subtext: "Download today on the App Store" },
    ],
  },
  {
    id: "pixel-9-pro-portrait",
    device: "google-pixel-9-pro",
    deviceFraction: 0.58,
    name: "Google Pixel 9 Pro — Studio Motion",
    description: "Modern Android flagship tour with punch-hole precision, fresh vibrant styling, and smooth cinematic easing.",
    useCase: "Best for Google Play flagship previews, productivity companions, and AI tool showcases.",
    designStyle: "Polished camera-bar silhouette, fresh organic aurora tones, centered safe alignment.",
    aspectRatio: "9:16",
    features: ["Balanced 6-scene sequence", "Controlled 3D perspective", "Direct zoom-into-app flow conclusion"],
    scenes: [
      { label: "Cold Open", sceneTemplate: "hero-rise", durationSeconds: 4.5, background: "aurora", rotate: 8, zoom: 8, move: 35, layout: "stacked-top", depth: "perspective", transition: "cut", text: "Meet Your New Hub", subtext: "Everything in one unified place" },
      { label: "Key Benefit", sceneTemplate: "slide-pan", durationSeconds: 5, background: "graphite", rotate: 8, zoom: 10, move: 30, layout: "stacked-bottom", depth: "perspective", transition: "slide", text: "Plan in Seconds", subtext: "Intelligent scheduling built in" },
      { label: "Live Glance", sceneTemplate: "parallax-stack", durationSeconds: 5, background: "royal", rotate: 6, zoom: 10, move: 25, layout: "stacked-top", depth: "flat", transition: "fade", screenCount: 2, text: "Live Data Glance", subtext: "Real-time updates as you work" },
      { label: "Deep Focus", sceneTemplate: "zoom-focus", durationSeconds: 5, background: "aurora", rotate: 0, zoom: 12, move: 0, layout: "full-bleed", depth: "perspective", transition: "wipe", text: "Automate Everyday Tasks", subtext: "Smart rules that run themselves" },
      { label: "Collaboration", sceneTemplate: "kinetic-type", durationSeconds: 5, background: "mint", rotate: 4, zoom: 10, move: 20, layout: "stacked-bottom", depth: "float", transition: "fade", text: "Built for Teams", subtext: "Keep everyone in sync effortlessly" },
      { label: "App Flow", sceneTemplate: "portrait-flow", durationSeconds: 7, background: "graphite", rotate: 0, zoom: 18, move: 0, layout: "full-bleed", depth: "showcase", transition: "zoom", text: "Start Your Journey", subtext: "Available on Google Play" },
    ],
  },
  {
    id: "galaxy-s25-portrait",
    device: "samsung-galaxy-s25",
    deviceFraction: 0.6,
    name: "Samsung Galaxy S25 — Black Premium",
    description: "Weighty dark-mode elegance with ultra-slim bezels, sophisticated typography, and restrained high-end motion.",
    useCase: "Best for enterprise tools, developer platforms, analytics suites, and dark-theme apps.",
    designStyle: "Ultra-thin bezel silhouette, deep charcoal/navy swatches, centered safe composition.",
    aspectRatio: "9:16",
    features: ["Sophisticated dark aesthetic", "Natural 3D product tilt", "Seamless zoom-into-app flow"],
    scenes: [
      { label: "Cold Open", sceneTemplate: "hero-rise", durationSeconds: 4.5, background: "solid-navy", rotate: 6, zoom: 8, move: 30, layout: "stacked-top", depth: "perspective", transition: "cut", text: "Engineered for Focus", subtext: "Maximum clarity, zero distraction" },
      { label: "Precision", sceneTemplate: "tilt-3d", durationSeconds: 5, background: "solid-charcoal", rotate: 10, zoom: 10, move: 25, layout: "stacked-bottom", depth: "perspective", transition: "fade", text: "Pixel-Perfect Insights", subtext: "Deep analytical intelligence" },
      { label: "Dashboard", sceneTemplate: "mask-reveal", durationSeconds: 5, background: "solid-navy", rotate: 0, zoom: 12, move: 20, layout: "stacked-top", depth: "flat", transition: "fade", screenCount: 2, text: "Unified Command", subtext: "All workflows under control" },
      { label: "Security", sceneTemplate: "zoom-focus", durationSeconds: 5, background: "graphite", rotate: 0, zoom: 14, move: 0, layout: "full-bleed", depth: "perspective", transition: "wipe", text: "Enterprise Grade", subtext: "Built for mission-critical reliability" },
      { label: "Performance", sceneTemplate: "kinetic-type", durationSeconds: 5, background: "solid-navy", rotate: 4, zoom: 10, move: 20, layout: "stacked-bottom", depth: "float", transition: "fade", text: "Blazing Fast Execution", subtext: "Instant responses every time" },
      { label: "App Flow", sceneTemplate: "portrait-flow", durationSeconds: 7, background: "solid-charcoal", rotate: 0, zoom: 18, move: 0, layout: "full-bleed", depth: "showcase", transition: "zoom", text: "Unleash Maximum Power", subtext: "Deploy in your organisation today" },
    ],
  },
  {
    id: "iphone-16-pro-portrait",
    device: "apple-iphone-16-pro-max",
    deviceFraction: 0.62,
    name: "iPhone 16 Pro Max — Clean Minimal",
    description: "Light, airy, and distraction-free presentation designed to communicate trust, calm usability, and clarity.",
    useCase: "Best for health, finance, mindfulness, education, and lifestyle apps.",
    designStyle: "Expansive display with soft cream/light gradients, unhurried pacing, and crisp typography.",
    aspectRatio: "9:16",
    features: ["Calm light aesthetic", "Smooth non-aggressive transitions", "Clean zoom-into-app flow close"],
    scenes: [
      { label: "Cold Open", sceneTemplate: "mask-reveal", durationSeconds: 4.5, background: "light", rotate: 4, zoom: 8, move: 20, layout: "stacked-top", depth: "perspective", transition: "cut", text: "Clarity, First", subtext: "Everything thoughtfully in its place" },
      { label: "Key Feature", sceneTemplate: "zoom-focus", durationSeconds: 5, background: "solid-cream", rotate: 0, zoom: 10, move: 0, layout: "stacked-bottom", depth: "flat", transition: "fade", screenCount: 2, text: "Focus on What Matters", subtext: "Distraction-free at every step" },
      { label: "Detail View", sceneTemplate: "parallax-stack", durationSeconds: 5, background: "light", rotate: 4, zoom: 8, move: 20, layout: "stacked-top", depth: "perspective", transition: "fade", text: "Every Detail Considered", subtext: "Designed with purpose and craft" },
      { label: "Core Benefit", sceneTemplate: "hero-rise", durationSeconds: 5, background: "solid-cream", rotate: 4, zoom: 10, move: 25, layout: "stacked-bottom", depth: "perspective", transition: "fade", text: "Built to Last", subtext: "Seamless performance every day" },
      { label: "Simplicity", sceneTemplate: "kinetic-type", durationSeconds: 5, background: "light", rotate: 0, zoom: 10, move: 0, layout: "stacked-top", depth: "flat", transition: "fade", text: "No Clutter, No Noise", subtext: "Just the tools you need" },
      { label: "App Flow", sceneTemplate: "portrait-flow", durationSeconds: 7, background: "light", rotate: 0, zoom: 18, move: 0, layout: "full-bleed", depth: "showcase", transition: "zoom", text: "Experience Pure Simplicity", subtext: "Free trial available now" },
    ],
  },
  {
    id: "pixel-9-portrait",
    device: "google-pixel-9",
    deviceFraction: 0.58,
    name: "Google Pixel 9 — Dynamic Showcase",
    description: "High-contrast dynamic promo with punchy color gradients, bold typography, and controlled 3D choreography.",
    useCase: "Best for social promo reels, consumer app launches, and high-energy feature updates.",
    designStyle: "Vibrant saturated gradients, distinct punch-hole silhouette, snappy rhythmic beats.",
    aspectRatio: "9:16",
    features: ["High-impact color palette", "Snappy natural easing", "Full zoom-into-app flow climax"],
    scenes: [
      { label: "Hook", sceneTemplate: "slide-pan", durationSeconds: 4.5, background: "sunset", rotate: 6, zoom: 8, move: 35, layout: "stacked-top", depth: "perspective", transition: "cut", text: "The App You Were Waiting For", subtext: "Experience the difference today" },
      { label: "Hero Feature", sceneTemplate: "hero-rise", durationSeconds: 5, background: "violet", rotate: 8, zoom: 10, move: 30, layout: "stacked-bottom", depth: "float", transition: "slide", text: "Tailored Experience", subtext: "Customizes to your habits instantly" },
      { label: "Power Tool", sceneTemplate: "kinetic-type", durationSeconds: 5, background: "citrus", rotate: 0, zoom: 12, move: 0, layout: "stacked-top", depth: "flat", transition: "fade", screenCount: 2, text: "Boost Productivity", subtext: "Save hours every single week" },
      { label: "Interactive", sceneTemplate: "card-flip", durationSeconds: 5, background: "aurora", rotate: 12, zoom: 8, move: 25, layout: "full-bleed", depth: "perspective", transition: "wipe", text: "Interactive Panels", subtext: "Real-time actionable summaries" },
      { label: "Speed", sceneTemplate: "mask-reveal", durationSeconds: 5, background: "sunset", rotate: 4, zoom: 10, move: 20, layout: "stacked-bottom", depth: "float", transition: "fade", text: "Instant Results", subtext: "Zero lag, zero waiting" },
      { label: "App Flow", sceneTemplate: "portrait-flow", durationSeconds: 7, background: "violet", rotate: 0, zoom: 18, move: 0, layout: "full-bleed", depth: "showcase", transition: "zoom", text: "Get Started Now", subtext: "Join over 100k happy creators" },
    ],
  },

  // =========================================================================
  // LANDSCAPE TEMPLATES (16:9) — 5 Matching Device Counterparts
  // =========================================================================
  {
    id: "iphone-15-pro-landscape",
    device: "apple-iphone-15-pro",
    deviceFraction: 0.6,
    name: "iPhone 15 Pro — Modern Premium",
    description: "Widescreen showcase featuring alternating left/right layout balance, cinematic 3D product motion, and animated flow subtitles.",
    useCase: "Best for website hero headers, YouTube video ads, and product launch keynotes.",
    designStyle: "Full 16:9 widescreen canvas, deep ocean/royal palette, alternating copy rhythm, dynamic flow labels.",
    aspectRatio: "16:9",
    features: ["Widescreen 6-scene master layout", "Alternating left/right balance", "Dynamic flow subtitles in scene 6"],
    scenes: [
      { label: "Cold Open", sceneTemplate: "tilt-3d", durationSeconds: 5, background: "ocean", rotate: 14, zoom: 10, move: 30, layout: "copy-left", depth: "perspective", transition: "cut", text: "Introducing AppName", subtext: "Reimagined for the widescreen canvas" },
      { label: "Core Feature", sceneTemplate: "kinetic-type", durationSeconds: 5, background: "royal", rotate: 0, zoom: 12, move: 0, layout: "copy-right", depth: "flat", transition: "fade", screenCount: 2, text: "Power, Refined", subtext: "Every interaction crafted with precision" },
      { label: "Detail View", sceneTemplate: "mask-reveal", durationSeconds: 5, background: "violet", rotate: 4, zoom: 10, move: 20, layout: "hero-device", depth: "perspective", transition: "fade", text: "Built to Impress", subtext: "See the bigger picture in high detail" },
      { label: "Deep Focus", sceneTemplate: "zoom-focus", durationSeconds: 5, background: "graphite", rotate: 0, zoom: 12, move: 0, layout: "copy-left", depth: "flat", transition: "wipe", screenCount: 2, text: "Total Control", subtext: "Complete workflow oversight in one spot" },
      { label: "Benefit", sceneTemplate: "parallax-stack", durationSeconds: 5, background: "royal", rotate: 4, zoom: 10, move: 20, layout: "copy-right", depth: "float", transition: "fade", text: "Fast, Fluid, Familiar", subtext: "Instant collaboration across your team" },
      {
        label: "App Flow",
        sceneTemplate: "landscape-flow",
        durationSeconds: 10,
        background: "ocean",
        rotate: 0,
        zoom: 14,
        move: 0,
        layout: "centre-flank",
        depth: "showcase",
        transition: "fade",
        text: "Interactive Workflow Tour",
        subtext: "Explore key screens in real time",
        flowSteps: [
          { label: "Home Dashboard", startSec: 3.5, durationSec: 2.0, side: "left" },
          { label: "Live Analytics", startSec: 5.6, durationSec: 2.0, side: "right" },
          { label: "Team Settings", startSec: 7.7, durationSec: 2.0, side: "left" },
        ],
      },
    ],
  },
  {
    id: "pixel-9-pro-landscape",
    device: "google-pixel-9-pro",
    deviceFraction: 0.58,
    name: "Google Pixel 9 Pro — Studio Motion",
    description: "Sleek widescreen Android presentation with balanced side-by-side composition and dynamic animated flow subtitles.",
    useCase: "Best for SaaS web landing pages, product reveal videos, and digital marketing campaigns.",
    designStyle: "Polished punch-hole silhouette, aurora/mint themes, rhythmic left-to-right visual balance.",
    aspectRatio: "16:9",
    features: ["Balanced widescreen framing", "Controlled 3D product motion", "Multi-step flow subtitle progression"],
    scenes: [
      { label: "Cold Open", sceneTemplate: "tilt-3d", durationSeconds: 5, background: "aurora", rotate: 12, zoom: 10, move: 25, layout: "copy-left", depth: "perspective", transition: "cut", text: "Smart Workspaces", subtext: "Unleash next-generation productivity" },
      { label: "Key Feature", sceneTemplate: "slide-pan", durationSeconds: 5, background: "graphite", rotate: -6, zoom: 8, move: 35, layout: "copy-right", depth: "perspective", transition: "slide", text: "Instant Scheduling", subtext: "Smart calendar intelligence built in" },
      { label: "Overview", sceneTemplate: "parallax-stack", durationSeconds: 5, background: "royal", rotate: 4, zoom: 10, move: 20, layout: "hero-device", depth: "flat", transition: "fade", screenCount: 2, text: "Unified Views", subtext: "Live updates as events unfold" },
      { label: "Automation", sceneTemplate: "zoom-focus", durationSeconds: 5, background: "aurora", rotate: 0, zoom: 12, move: 0, layout: "copy-left", depth: "perspective", transition: "wipe", text: "Automate Repetitive Work", subtext: "Save valuable hours every single week" },
      { label: "Collaboration", sceneTemplate: "kinetic-type", durationSeconds: 5, background: "mint", rotate: 0, zoom: 10, move: 0, layout: "copy-right", depth: "float", transition: "fade", text: "Empower Your Team", subtext: "Real-time multi-user synchronization" },
      {
        label: "App Flow",
        sceneTemplate: "landscape-flow",
        durationSeconds: 10,
        background: "aurora",
        rotate: 0,
        zoom: 14,
        move: 0,
        layout: "centre-flank",
        depth: "showcase",
        transition: "fade",
        text: "Guided Product Tour",
        subtext: "Navigate through seamless workflows",
        flowSteps: [
          { label: "Projects Feed", startSec: 3.5, durationSec: 2.0, side: "left" },
          { label: "Live Performance", startSec: 5.6, durationSec: 2.0, side: "right" },
          { label: "Profile & Export", startSec: 7.7, durationSec: 2.0, side: "left" },
        ],
      },
    ],
  },
  {
    id: "galaxy-s25-landscape",
    device: "samsung-galaxy-s25",
    deviceFraction: 0.6,
    name: "Samsung Galaxy S25 — Black Premium",
    description: "Authoritative dark-mode widescreen showcase designed for enterprise software, cybersecurity, and financial tech.",
    useCase: "Best for investor presentations, enterprise landing pages, and B2B SaaS video campaigns.",
    designStyle: "Ultra-thin bezel flagship, solid dark palettes, deliberate centered 3D device staging.",
    aspectRatio: "16:9",
    features: ["Enterprise-grade dark styling", "Realistic 3D depth and shadows", "Interactive flow subtitles in scene 6"],
    scenes: [
      { label: "Cold Open", sceneTemplate: "tilt-3d", durationSeconds: 5, background: "solid-navy", rotate: 10, zoom: 8, move: 25, layout: "copy-left", depth: "perspective", transition: "cut", text: "Enterprise Intelligence", subtext: "Security and speed without compromise" },
      { label: "Analytics", sceneTemplate: "mask-reveal", durationSeconds: 5, background: "solid-charcoal", rotate: 4, zoom: 10, move: 20, layout: "copy-right", depth: "perspective", transition: "fade", text: "Full Observability", subtext: "Real-time metrics with zero latency" },
      { label: "Workspace", sceneTemplate: "parallax-stack", durationSeconds: 5, background: "solid-navy", rotate: 4, zoom: 10, move: 20, layout: "hero-device", depth: "flat", transition: "fade", screenCount: 2, text: "Focus-Driven Design", subtext: "Engineered for mission-critical tasks" },
      { label: "Security", sceneTemplate: "zoom-focus", durationSeconds: 5, background: "solid-charcoal", rotate: 0, zoom: 12, move: 0, layout: "copy-left", depth: "perspective", transition: "wipe", text: "Zero-Trust Architecture", subtext: "Complete end-to-end data safety" },
      { label: "Speed", sceneTemplate: "kinetic-type", durationSeconds: 5, background: "solid-navy", rotate: 0, zoom: 10, move: 0, layout: "copy-right", depth: "float", transition: "fade", text: "High-Throughput Power", subtext: "Scale seamlessly as your business grows" },
      {
        label: "App Flow",
        sceneTemplate: "landscape-flow",
        durationSeconds: 10,
        background: "solid-charcoal",
        rotate: 0,
        zoom: 14,
        move: 0,
        layout: "centre-flank",
        depth: "showcase",
        transition: "fade",
        text: "Enterprise Operations View",
        subtext: "Live monitoring and policy control",
        flowSteps: [
          { label: "Security Portal", startSec: 3.5, durationSec: 2.0, side: "left" },
          { label: "Audit Reports", startSec: 5.6, durationSec: 2.0, side: "right" },
          { label: "Admin Console", startSec: 7.7, durationSec: 2.0, side: "left" },
        ],
      },
    ],
  },
  {
    id: "iphone-16-pro-landscape",
    device: "apple-iphone-16-pro-max",
    deviceFraction: 0.62,
    name: "iPhone 16 Pro Max — Clean Minimal",
    description: "Airy light-mode widescreen layout highlighting interface simplicity, clean typography, and uncluttered presentation.",
    useCase: "Best for consumer health, financial planning, productivity suites, and modern lifestyle tools.",
    designStyle: "Light/cream minimalist backgrounds, generous whitespace, smooth and unhurried pacing.",
    aspectRatio: "16:9",
    features: ["Warm light aesthetic", "Refined 3D depth and lighting", "Clear progression flow subtitles"],
    scenes: [
      { label: "Cold Open", sceneTemplate: "mask-reveal", durationSeconds: 5, background: "light", rotate: 4, zoom: 8, move: 20, layout: "copy-left", depth: "flat", transition: "cut", text: "Clarity at Scale", subtext: "Thoughtfully organized for maximum focus" },
      { label: "Simplicity", sceneTemplate: "zoom-focus", durationSeconds: 5, background: "solid-cream", rotate: 0, zoom: 10, move: 0, layout: "copy-right", depth: "flat", transition: "fade", screenCount: 2, text: "Pure & Uncluttered", subtext: "Every tool right where you expect it" },
      { label: "Detail", sceneTemplate: "parallax-stack", durationSeconds: 5, background: "light", rotate: 4, zoom: 8, move: 20, layout: "hero-device", depth: "perspective", transition: "fade", text: "Precision Craft", subtext: "Designed with elegance and care" },
      { label: "Performance", sceneTemplate: "hero-rise", durationSeconds: 5, background: "solid-cream", rotate: 4, zoom: 10, move: 20, layout: "copy-left", depth: "perspective", transition: "fade", text: "Rock-Solid Reliability", subtext: "Performant on every screen size" },
      { label: "Focus", sceneTemplate: "kinetic-type", durationSeconds: 5, background: "light", rotate: 0, zoom: 10, move: 0, layout: "copy-right", depth: "flat", transition: "fade", text: "Zero Distractions", subtext: "Just the essentials, beautifully rendered" },
      {
        label: "App Flow",
        sceneTemplate: "landscape-flow",
        durationSeconds: 10,
        background: "light",
        rotate: 0,
        zoom: 14,
        move: 0,
        layout: "centre-flank",
        depth: "showcase",
        transition: "fade",
        text: "Serene User Experience",
        subtext: "Effortless flow across daily routines",
        flowSteps: [
          { label: "Daily Summary", startSec: 3.5, durationSec: 2.0, side: "left" },
          { label: "Trends & Insights", startSec: 5.6, durationSec: 2.0, side: "right" },
          { label: "Personal Profile", startSec: 7.7, durationSec: 2.0, side: "left" },
        ],
      },
    ],
  },
  {
    id: "pixel-9-landscape",
    device: "google-pixel-9",
    deviceFraction: 0.58,
    name: "Google Pixel 9 — Dynamic Showcase",
    description: "Vibrant high-contrast widescreen showcase with energetic gradients, bold visual rhythm, and engaging flow subtitles.",
    useCase: "Best for paid social ad campaigns, promotional videos, and high-impact product introductions.",
    designStyle: "Saturated sunset/violet palettes, distinct punch-hole frame, animated flow subtitles.",
    aspectRatio: "16:9",
    features: ["Dynamic high-energy palette", "Refined 3D depth and lighting", "Dynamic side-alternating flow labels"],
    scenes: [
      { label: "Hook", sceneTemplate: "slide-pan", durationSeconds: 5, background: "candy", rotate: -8, zoom: 8, move: 35, layout: "copy-left", depth: "perspective", transition: "cut", text: "Upgrade Your Flow", subtext: "The new standard in mobile software" },
      { label: "Feature One", sceneTemplate: "hero-rise", durationSeconds: 5, background: "violet", rotate: 8, zoom: 10, move: 25, layout: "copy-right", depth: "float", transition: "slide", text: "Designed for You", subtext: "Adapts automatically to how you work" },
      { label: "Productivity", sceneTemplate: "kinetic-type", durationSeconds: 5, background: "citrus", rotate: 0, zoom: 12, move: 0, layout: "hero-device", depth: "flat", transition: "fade", screenCount: 2, text: "Save Serious Time", subtext: "Speed through repetitive everyday tasks" },
      { label: "Interactive", sceneTemplate: "card-flip", durationSeconds: 5, background: "aurora", rotate: 12, zoom: 8, move: 25, layout: "copy-left", depth: "perspective", transition: "wipe", text: "Instant Actions", subtext: "Execute complex workflows in one tap" },
      { label: "Speed", sceneTemplate: "mask-reveal", durationSeconds: 5, background: "sunset", rotate: 4, zoom: 10, move: 20, layout: "copy-right", depth: "float", transition: "fade", text: "Always Responsive", subtext: "Zero lag and instantaneous sync" },
      {
        label: "App Flow",
        sceneTemplate: "landscape-flow",
        durationSeconds: 10,
        background: "sunset",
        rotate: 0,
        zoom: 14,
        move: 0,
        layout: "centre-flank",
        depth: "showcase",
        transition: "fade",
        text: "Interactive Flow Highlights",
        subtext: "Complete end-to-end user actions",
        flowSteps: [
          { label: "Main Discover", startSec: 3.5, durationSec: 2.0, side: "left" },
          { label: "Fast Checkout", startSec: 5.6, durationSec: 2.0, side: "right" },
          { label: "Order Confirm", startSec: 7.7, durationSec: 2.0, side: "left" },
        ],
      },
    ],
  },
];

/** Old ids mapped to their new equivalents for backwards compatibility. */
const TEMPLATE_ID_ALIASES: Record<string, string> = {
  "minimal-premium": "iphone-15-pro-portrait",
  "modern-saas": "pixel-9-pro-portrait",
  "bold-marketing": "galaxy-s25-portrait",
  "light-minimal": "iphone-16-pro-portrait",
  "cinematic-showcase": "iphone-15-pro-landscape",
  "futuristic-tech": "pixel-9-pro-landscape",
  "editorial-studio": "iphone-16-pro-landscape",
  "dark-premium": "galaxy-s25-landscape",
  "foldable-story": "pixel-9-portrait",
  "foldable-unfold": "pixel-9-portrait",
  "feature-showcase": "iphone-15-pro-portrait",
  "social-promo": "pixel-9-portrait",
  "quick-teaser": "pixel-9-pro-portrait",
  "studio-tablet": "iphone-16-pro-landscape",
  "landscape-hero": "iphone-15-pro-landscape",
  "landscape-cinematic": "pixel-9-pro-landscape",
  "landscape-social-ad": "galaxy-s25-landscape",
  "landscape-minimal": "iphone-16-pro-landscape",
};

export function resolveTemplateId(templateId: string): string {
  if (VIDEO_TEMPLATES.some((t) => t.id === templateId)) return templateId;
  return TEMPLATE_ID_ALIASES[templateId] ?? templateId;
}

export function applyVideoTemplate(project: VideoProject, templateId: string): void {
  const resolvedId = resolveTemplateId(templateId);
  const template = VIDEO_TEMPLATES.find((t) => t.id === resolvedId);
  if (!template) throw new Error(`Unknown video template '${templateId}'.`);

  let sourceCursor = 0;
  project.template = resolvedId;
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
      layout: s.layout,
      depth: s.depth,
      transition: s.transition,
      background: s.background,
      text: s.text,
      subtext: s.subtext,
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
