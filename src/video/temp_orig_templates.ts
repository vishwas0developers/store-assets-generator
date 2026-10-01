import { type FlowStep, type VideoApplication, type VideoScene } from "./application.js";

export interface VideoTemplateScene {
  label: string;
  sceneTemplate: string;
  durationSeconds: number;
  background: string;
  rotate: number;
  zoom: number;
  move: number;
  screenCount?: number;
  layout?: string;
  depth?: "flat" | "perspective" | "float" | "showcase";
  transition?: "cut" | "fade" | "slide" | "wipe" | "zoom";
  flowSteps?: FlowStep[];
  text: string;
  subtext: string;
  slots?: Record<string, string | string[]>;
}

export interface VideoTemplate {
  id: string;
  name: string;
  description: string;
  useCase: string;
  designStyle: string;
  aspectRatio: string;
  features: string[];
  device: string;
  variant?: string;
  deviceFraction: number;
  scenes: VideoTemplateScene[];
}

const PORTRAIT_SCENES_STANDARD = (backgrounds: string[], texts: string[], subtexts: string[]): VideoTemplateScene[] => [
  { label: "Cold Open", sceneTemplate: "hero-rise", durationSeconds: 4.5, background: backgrounds[0], rotate: 10, zoom: 8, move: 40, layout: "stacked-top", depth: "perspective", transition: "cut", text: texts[0], subtext: subtexts[0], slots: { text: "s0-text", subtext: "s0-subtext", screenshot: "slot-0" } },
  { label: "Core Feature", sceneTemplate: "tilt-3d", durationSeconds: 5, background: backgrounds[1], rotate: 12, zoom: 10, move: 30, layout: "stacked-bottom", depth: "perspective", transition: "fade", text: texts[1], subtext: subtexts[1], slots: { text: "s1-text", subtext: "s1-subtext", screenshot: "slot-1" } },
  { label: "Feature Breakdown", sceneTemplate: "mask-reveal", durationSeconds: 5, background: backgrounds[2], rotate: 0, zoom: 12, move: 20, layout: "stacked-top", depth: "showcase", transition: "fade", screenCount: 2, text: texts[2], subtext: subtexts[2], slots: { text: "s2-text", subtext: "s2-subtext", screenshots: ["slot-2a", "slot-2b"] } },
  { label: "Interactive Deep Dive", sceneTemplate: "zoom-focus", durationSeconds: 4.5, background: backgrounds[3], rotate: 0, zoom: 12, move: 0, layout: "stacked-bottom", depth: "showcase", transition: "fade", text: texts[3], subtext: subtexts[3], slots: { text: "s3-text", subtext: "s3-subtext", screenshot: "slot-3" } },
  { label: "Performance & Capabilities", sceneTemplate: "parallax-stack", durationSeconds: 4.5, background: backgrounds[4], rotate: 4, zoom: 10, move: 20, layout: "stacked-top", depth: "float", transition: "fade", text: texts[4], subtext: subtexts[4], slots: { text: "s4-text", subtext: "s4-subtext", screenshot: "slot-4" } },
  { label: "Speed & Automation", sceneTemplate: "kinetic-type", durationSeconds: 4.5, background: backgrounds[5], rotate: 0, zoom: 10, move: 0, layout: "stacked-bottom", depth: "showcase", transition: "fade", text: texts[5], subtext: subtexts[5], slots: { text: "s5-text", subtext: "s5-subtext", screenshot: "slot-5" } },
  { label: "Security & Privacy", sceneTemplate: "zoom-focus", durationSeconds: 5, background: backgrounds[6], rotate: 0, zoom: 14, move: 0, layout: "full-bleed", depth: "perspective", transition: "wipe", text: texts[6], subtext: subtexts[6], slots: { text: "s6-text", subtext: "s6-subtext", screenshot: "slot-6" } },
  { label: "Seamless Collaboration", sceneTemplate: "parallax-stack", durationSeconds: 5, background: backgrounds[7], rotate: 6, zoom: 10, move: 25, layout: "stacked-bottom", depth: "float", transition: "fade", text: texts[7], subtext: subtexts[7], slots: { text: "s7-text", subtext: "s7-subtext", screenshot: "slot-7" } },
  { label: "Ecosystem & Benefits", sceneTemplate: "slide-pan", durationSeconds: 4.5, background: backgrounds[8], rotate: 0, zoom: 10, move: 30, layout: "stacked-top", depth: "showcase", transition: "fade", text: texts[8], subtext: subtexts[8], slots: { text: "s8-text", subtext: "s8-subtext", screenshot: "slot-8" } },
  { label: "App Flow", sceneTemplate: "portrait-flow", durationSeconds: 7, background: backgrounds[9], rotate: 0, zoom: 18, move: 0, layout: "full-bleed", depth: "showcase", transition: "zoom", text: texts[9], subtext: subtexts[9], slots: { text: "s9-text", subtext: "s9-subtext", screenshot: "slot-9" } },
];

const LANDSCAPE_SCENES_STANDARD = (backgrounds: string[], texts: string[], subtexts: string[], flowSteps: any[]): VideoTemplateScene[] => [
  { label: "Cold Open", sceneTemplate: "tilt-3d", durationSeconds: 5, background: backgrounds[0], rotate: 12, zoom: 10, move: 25, layout: "copy-left", depth: "perspective", transition: "cut", text: texts[0], subtext: subtexts[0], slots: { text: "s0-text", subtext: "s0-subtext", screenshot: "slot-0" } },
  { label: "Core Feature", sceneTemplate: "kinetic-type", durationSeconds: 5, background: backgrounds[1], rotate: 0, zoom: 12, move: 0, layout: "copy-right", depth: "showcase", transition: "fade", screenCount: 2, text: texts[1], subtext: subtexts[1], slots: { text: "s1-text", subtext: "s1-subtext", screenshots: ["slot-1a", "slot-1b"] } },
  { label: "Feature Breakdown", sceneTemplate: "mask-reveal", durationSeconds: 5, background: backgrounds[2], rotate: 4, zoom: 10, move: 20, layout: "hero-device", depth: "perspective", transition: "fade", text: texts[2], subtext: subtexts[2], slots: { text: "s2-text", subtext: "s2-subtext", screenshot: "slot-2" } },
  { label: "Interactive Deep Dive", sceneTemplate: "zoom-focus", durationSeconds: 5, background: backgrounds[3], rotate: 0, zoom: 12, move: 0, layout: "copy-left", depth: "showcase", transition: "wipe", screenCount: 2, text: texts[3], subtext: subtexts[3], slots: { text: "s3-text", subtext: "s3-subtext", screenshots: ["slot-3a", "slot-3b"] } },
  { label: "Performance & Capabilities", sceneTemplate: "tilt-3d", durationSeconds: 4.5, background: backgrounds[4], rotate: 8, zoom: 10, move: 20, layout: "copy-right", depth: "float", transition: "fade", text: texts[4], subtext: subtexts[4], slots: { text: "s4-text", subtext: "s4-subtext", screenshot: "slot-4" } },
  { label: "Speed & Automation", sceneTemplate: "kinetic-type", durationSeconds: 4.5, background: backgrounds[5], rotate: 0, zoom: 10, move: 0, layout: "copy-left", depth: "showcase", transition: "fade", text: texts[5], subtext: subtexts[5], slots: { text: "s5-text", subtext: "s5-subtext", screenshot: "slot-5" } },
  { label: "Security & Privacy", sceneTemplate: "mask-reveal", durationSeconds: 4.5, background: backgrounds[6], rotate: 0, zoom: 10, move: 0, layout: "hero-device", depth: "showcase", transition: "fade", text: texts[6], subtext: subtexts[6], slots: { text: "s6-text", subtext: "s6-subtext", screenshot: "slot-6" } },
  { label: "Seamless Collaboration", sceneTemplate: "parallax-stack", durationSeconds: 5, background: backgrounds[7], rotate: 4, zoom: 10, move: 20, layout: "copy-right", depth: "float", transition: "fade", text: texts[7], subtext: subtexts[7], slots: { text: "s7-text", subtext: "s7-subtext", screenshot: "slot-7" } },
  { label: "Ecosystem & Benefits", sceneTemplate: "slide-pan", durationSeconds: 4.5, background: backgrounds[8], rotate: -4, zoom: 8, move: 30, layout: "copy-left", depth: "showcase", transition: "fade", text: texts[8], subtext: subtexts[8], slots: { text: "s8-text", subtext: "s8-subtext", screenshot: "slot-8" } },
  {
    label: "App Flow",
    sceneTemplate: "landscape-flow",
    durationSeconds: 10,
    background: backgrounds[9],
    rotate: 0,
    zoom: 14,
    move: 0,
    layout: "centre-flank",
    depth: "showcase",
    transition: "fade",
    text: texts[9],
    subtext: subtexts[9],
    slots: { text: "s9-text", subtext: "s9-subtext", screenshot: "slot-9" },
    flowSteps
  },
];

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
    features: ["Cohesive 10-scene portrait arc", "Subtle 3D perspective tilts", "Full zoom-into-screen final app flow"],
    scenes: PORTRAIT_SCENES_STANDARD(
      ["ocean", "royal", "graphite", "royal", "ocean", "graphite", "royal", "ocean", "royal", "graphite"],
      [
        "Welcome to AppName",
        "Realtime Statistics",
        "Seamless Sync",
        "Tap. Swipe. Done.",
        "Engineered for Speed",
        "Automate the Busywork",
        "Bank-Grade Security",
        "Collaborate Together",
        "One App, Every Device",
        "Experience the Full App"
      ],
      [
        "The ultimate companion",
        "Track every metric instantly",
        "Live updates across all devices",
        "Every gesture feels instant and alive",
        "Buttery-smooth performance, always",
        "Smart shortcuts that save you hours",
        "Protected with end-to-end encryption",
        "Invite your team in one click",
        "Your world, perfectly in sync",
        "Download today on the App Store"
      ]
    )
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
    features: ["Balanced 10-scene sequence", "Controlled 3D perspective", "Direct zoom-into-app flow conclusion"],
    scenes: PORTRAIT_SCENES_STANDARD(
      ["aurora", "graphite", "royal", "mint", "aurora", "aurora", "graphite", "mint", "royal", "graphite"],
      [
        "Meet Your New Hub",
        "Plan in Seconds",
        "Live Data Glance",
        "Tap Into Every Detail",
        "Studio-Grade Speed",
        "Automate Everyday Tasks",
        "Private by Design",
        "Built for Teams",
        "One Hub, Every Screen",
        "Start Your Journey"
      ],
      [
        "Everything in one unified place",
        "Intelligent scheduling built in",
        "Real-time updates as you work",
        "Precise controls, zero friction",
        "Fluid at every frame",
        "Smart rules that run themselves",
        "Your data stays yours, always",
        "Keep everyone in sync effortlessly",
        "Pixel, tablet, and web -- unified",
        "Available on Google Play"
      ]
    )
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
    scenes: PORTRAIT_SCENES_STANDARD(
      ["solid-navy", "solid-charcoal", "solid-navy", "solid-charcoal", "solid-navy", "solid-charcoal", "graphite", "solid-navy", "solid-charcoal", "solid-charcoal"],
      [
        "Engineered for Focus",
        "Pixel-Perfect Insights",
        "Unified Command",
        "Command Every Detail",
        "Blazing Fast Execution",
        "Rules That Run Themselves",
        "Enterprise Grade",
        "One Team, One View",
        "Trusted Across the Org",
        "Unleash Maximum Power"
      ],
      [
        "Maximum clarity, zero distraction",
        "Deep analytical intelligence",
        "All workflows under control",
        "Precision controls, zero lag",
        "Instant responses every time",
        "Set it once, automate forever",
        "Built for mission-critical reliability",
        "Shared workspaces, zero friction",
        "One platform, every department",
        "Deploy in your organisation today"
      ]
    )
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
    scenes: PORTRAIT_SCENES_STANDARD(
      ["light", "solid-cream", "light", "solid-cream", "solid-cream", "light", "solid-cream", "light", "solid-cream", "light"],
      [
        "Clarity, First",
        "Focus on What Matters",
        "Every Detail Considered",
        "Feels Natural, Instantly",
        "Built to Last",
        "No Clutter, No Noise",
        "Quietly Protected",
        "Share Without Friction",
        "Everywhere You Are",
        "Experience Pure Simplicity"
      ],
      [
        "Everything thoughtfully in its place",
        "Distraction-free at every step",
        "Designed with purpose and craft",
        "Every tap responds the way you expect",
        "Seamless performance every day",
        "Just the tools you need",
        "Privacy built in, never bolted on",
        "Bring anyone in, effortlessly",
        "One calm experience, every device",
        "Free trial available now"
      ]
    )
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
    scenes: PORTRAIT_SCENES_STANDARD(
      ["sunset", "violet", "citrus", "aurora", "citrus", "sunset", "violet", "aurora", "citrus", "violet"],
      [
        "The App You Were Waiting For",
        "Tailored Experience",
        "Boost Productivity",
        "Interactive Panels",
        "Turbocharged Everywhere",
        "Instant Results",
        "Locked Down, By Default",
        "Bring Your Crew",
        "One Login, Every Screen",
        "Get Started Now"
      ],
      [
        "Experience the difference today",
        "Customizes to your habits instantly",
        "Save hours every single week",
        "Real-time actionable summaries",
        "Fast on every network, every device",
        "Zero lag, zero waiting",
        "Your data, protected everywhere",
        "Real-time collaboration, built in",
        "Your world follows you everywhere",
        "Join over 100k happy creators"
      ]
    )
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
    features: ["Widescreen 10-scene master layout", "Alternating left/right balance", "Dynamic flow subtitles in scene 10"],
    scenes: LANDSCAPE_SCENES_STANDARD(
      ["ocean", "royal", "violet", "graphite", "royal", "ocean", "graphite", "royal", "violet", "ocean"],
      [
        "Introducing AppName",
        "Power, Refined",
        "Built to Impress",
        "Total Control",
        "Built for Scale",
        "Runs Itself",
        "Airtight Security",
        "Fast, Fluid, Familiar",
        "One Account, Every Screen",
        "Everything You Need"
      ],
      [
        "Reimagined for the widescreen canvas",
        "Every interaction crafted with precision",
        "See the bigger picture in high detail",
        "Complete workflow oversight in one spot",
        "Fast under any load",
        "Set your rules, let automation take over",
        "Enterprise-grade protection by default",
        "Instant collaboration across your team",
        "Desktop, mobile, and web -- unified",
        "Download today and see for yourself"
      ],
      [
        { label: "Home Dashboard", startSec: 2.0, durationSec: 2.0, side: "left" },
        { label: "Live Analytics", startSec: 3.0, durationSec: 2.0, side: "right" },
        { label: "Team Settings", startSec: 4.0, durationSec: 2.0, side: "left" },
        { label: "Bank-Grade Security", startSec: 5.0, durationSec: 2.0, side: "right" },
        { label: "Instant Sync", startSec: 6.0, durationSec: 2.0, side: "left" },
        { label: "Get the App", startSec: 7.0, durationSec: 2.0, side: "right" },
      ]
    )
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
    scenes: LANDSCAPE_SCENES_STANDARD(
      ["aurora", "graphite", "royal", "mint", "aurora", "aurora", "graphite", "mint", "royal", "aurora"],
      [
        "Smart Workspaces",
        "Instant Scheduling",
        "Unified Views",
        "Every Panel, One Tap Away",
        "Studio-Grade Performance",
        "Automate Repetitive Work",
        "Locked Down by Default",
        "Empower Your Team",
        "Works Wherever You Do",
        "Guided Product Tour"
      ],
      [
        "Unleash next-generation productivity",
        "Smart calendar intelligence built in",
        "Live updates as events unfold",
        "Navigate at the speed of thought",
        "Rendered fluid, frame after frame",
        "Save valuable hours every single week",
        "Encrypted end to end, everywhere",
        "Real-time multi-user synchronization",
        "Phone, tablet, and desktop -- always in sync",
        "Navigate through seamless workflows"
      ],
      [
        { label: "Applications Feed", startSec: 2.0, durationSec: 2.0, side: "left" },
        { label: "Live Performance", startSec: 3.0, durationSec: 2.0, side: "right" },
        { label: "Smart Scheduling", startSec: 4.0, durationSec: 2.0, side: "left" },
        { label: "Team Sync", startSec: 5.0, durationSec: 2.0, side: "right" },
        { label: "Profile & Export", startSec: 6.0, durationSec: 2.0, side: "left" },
        { label: "Get It on Google Play", startSec: 7.0, durationSec: 2.0, side: "right" },
      ]
    )
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
    features: ["Enterprise-grade dark styling", "Realistic 3D depth and shadows", "Interactive flow subtitles in scene 10"],
    scenes: LANDSCAPE_SCENES_STANDARD(
      ["solid-navy", "solid-charcoal", "solid-navy", "solid-charcoal", "solid-navy", "solid-navy", "solid-charcoal", "solid-navy", "solid-charcoal", "solid-charcoal"],
      [
        "Enterprise Intelligence",
        "Full Observability",
        "Focus-Driven Design",
        "Total Command",
        "Built to Scale",
        "High-Throughput Power",
        "Zero-Trust Architecture",
        "Cross-Team Visibility",
        "One Platform, Every Team",
        "Enterprise Operations View"
      ],
      [
        "Security and speed without compromise",
        "Real-time metrics with zero latency",
        "Engineered for mission-critical tasks",
        "Every control exactly where you need it",
        "Handles enterprise load without flinching",
        "Scale seamlessly as your business grows",
        "Complete end-to-end data safety",
        "Everyone works from the same truth",
        "From ops to finance, fully integrated",
        "Live monitoring and policy control"
      ],
      [
        { label: "Security Portal", startSec: 2.0, durationSec: 2.0, side: "left" },
        { label: "Audit Reports", startSec: 3.0, durationSec: 2.0, side: "right" },
        { label: "Admin Console", startSec: 4.0, durationSec: 2.0, side: "left" },
        { label: "Zero-Trust Policies", startSec: 5.0, durationSec: 2.0, side: "right" },
        { label: "Live Metrics", startSec: 6.0, durationSec: 2.0, side: "left" },
        { label: "Request a Demo", startSec: 7.0, durationSec: 2.0, side: "right" },
      ]
    )
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
    scenes: LANDSCAPE_SCENES_STANDARD(
      ["light", "solid-cream", "light", "solid-cream", "solid-cream", "light", "solid-cream", "light", "solid-cream", "light"],
      [
        "Clarity at Scale",
        "Pure & Uncluttered",
        "Precision Craft",
        "Feels Effortless",
        "Rock-Solid Reliability",
        "Zero Distractions",
        "Quietly Protected",
        "Share With Calm Confidence",
        "Everywhere, Effortlessly",
        "Serene User Experience"
      ],
      [
        "Thoughtfully organized for maximum focus",
        "Every tool right where you expect it",
        "Designed with elegance and care",
        "Every interaction, calm and immediate",
        "Performant on every screen size",
        "Just the essentials, beautifully rendered",
        "Privacy respected by design",
        "Invite others without the clutter",
        "One serene experience, every device",
        "Effortless flow across daily routines"
      ],
      [
        { label: "Daily Summary", startSec: 2.0, durationSec: 2.0, side: "left" },
        { label: "Trends & Insights", startSec: 3.0, durationSec: 2.0, side: "right" },
        { label: "Personal Profile", startSec: 4.0, durationSec: 2.0, side: "left" },
        { label: "Quiet Notifications", startSec: 5.0, durationSec: 2.0, side: "right" },
        { label: "Sync Across Devices", startSec: 6.0, durationSec: 2.0, side: "left" },
        { label: "Try It Free", startSec: 7.0, durationSec: 2.0, side: "right" },
      ]
    )
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
    scenes: LANDSCAPE_SCENES_STANDARD(
      ["candy", "violet", "citrus", "aurora", "citrus", "sunset", "aurora", "violet", "candy", "sunset"],
      [
        "Upgrade Your Flow",
        "Designed for You",
        "Save Serious Time",
        "Instant Actions",
        "Fast by Nature",
        "Always Responsive",
        "Protected at Every Step",
        "Bring Everyone Along",
        "One App, Every Moment",
        "Interactive Flow Highlights"
      ],
      [
        "The new standard in mobile software",
        "Adapts automatically to how you work",
        "Speed through repetitive everyday tasks",
        "Execute complex workflows in one tap",
        "Speed you can feel in every tap",
        "Always responsive and instantly in sync",
        "Your data stays safe, always",
        "Share instantly, work together live",
        "Wherever you are, it's ready",
        "Complete end-to-end user actions"
      ],
      [
        { label: "Main Discover", startSec: 2.0, durationSec: 2.0, side: "left" },
        { label: "Fast Checkout", startSec: 3.0, durationSec: 2.0, side: "right" },
        { label: "Order Confirm", startSec: 4.0, durationSec: 2.0, side: "left" },
        { label: "Real-Time Tracking", startSec: 5.0, durationSec: 2.0, side: "right" },
        { label: "Rewards & Perks", startSec: 6.0, durationSec: 2.0, side: "left" },
        { label: "Join Now", startSec: 7.0, durationSec: 2.0, side: "right" },
      ]
    )
  }
];

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

export function applyVideoTemplate(application: VideoApplication, templateId: string): void {
  const resolvedId = resolveTemplateId(templateId);
  const template = VIDEO_TEMPLATES.find((t) => t.id === resolvedId);
  if (!template) throw new Error(`Unknown video template '${templateId}'.`);

  let sourceCursor = 0;
  application.template = resolvedId;
  application.scenes = template.scenes.map((s, i): VideoScene => {
    const count = s.screenCount && s.screenCount > 1 ? s.screenCount : 1;
    const slice = application.sources.slice(sourceCursor, sourceCursor + count);
    sourceCursor += count;
    const screenIds = count > 1 ? Array.from({ length: count }, (_, j) => slice[j]?.id ?? `__placeholder_${i}_${j}__`) : undefined;
    return {
      id: `scene_${i + 1}`,
      order: i,
      sceneTemplate: s.sceneTemplate,
      sourceId: slice[0]?.id,
      screenIds,
      device: template.device,
      deviceFraction: template.deviceFraction,
      aspectRatio: template.aspectRatio === "16:9" ? "16:9" : "9:16",
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

export function scratchVideoApplication(templateId: string, sources: VideoApplication["sources"] = []): VideoApplication {
  const scratch: VideoApplication = {
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
