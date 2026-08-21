import { addColumn, addDeviceRow, defaultColumnStyle, type ColumnStyle, type MockupProject } from "./project.js";
import { DEVICE_REGISTRY, resolveGeometry } from "../devices/registry.js";
import { getLayoutPreset } from "./layouts.js";

/**
 * Studio Mockup starter templates -- 19 templates matching the reference's
 * "All" template gallery slug-for-slug and category-for-category (mined
 * from studio.app-mockup.com's production bundle), with neutral display
 * names in place of the reference's third-party app names. Applying one
 * auto-prepares device rows + a starting set of columns + a default
 * layout/background, then the user edits text/styles from there.
 */

export interface MockupStarterTemplate {
  id: string;
  name: string;
  category: string;
  description: string;
  devices: Array<{ deviceId: string; label: string; variant?: string }>;
  columnCount: number;
  layout: string;
  background: ColumnStyle["background"];
  /** Title/subtitle color override -- defaultColumnStyle always sets white
   *  text, which is invisible on a light background (cream/white). */
  textColor?: string;
  titles?: string[];
  subtitles?: string[];
}

export const MOCKUP_TEMPLATES: MockupStarterTemplate[] = [
  {
    id: "airbnb-template",
    name: "Stays & Rentals",
    category: "travel-and-local",
    description: "Staggered browsing cards for a stays/rentals booking flow.",
    devices: [{ deviceId: "apple-iphone-16-pro-max", label: "6.7 Inch Phone" }],
    columnCount: 5,
    layout: "the-airbnb-left-1-title-above",
    background: { type: "gradient", value: "sunset" },
    titles: ["Find a Stay", "Unique Homes", "Local Experiences", "Easy Booking", "Trip Details"],
    subtitles: ["Search thousands of listings", "Cabins, lofts and villas", "Handpicked by hosts nearby", "Book in a few taps", "Everything in one place"],
  },
  {
    id: "apple-music-template",
    name: "Music Streaming",
    category: "music",
    description: "Two-device showcase for a music streaming and playlist app.",
    devices: [
      { deviceId: "apple-iphone-15-pro", label: "6.5 Inch Phone" },
      { deviceId: "google-pixel-9", label: "Pixel Phone" },
    ],
    columnCount: 5,
    layout: "two-devices-title-below",
    background: { type: "gradient", value: "violet" },
    titles: ["Stream Beats", "Create Playlists", "Offline Mode", "Hi-Fi Sound", "Join Live"],
    subtitles: ["Access millions of songs", "Curate for any mood", "Listen without connection", "Lossless audio quality", "Interact with your favorite artists"],
  },
  {
    id: "blink-travel-template",
    name: "Travel Planner",
    category: "travel-and-local",
    description: "Airy gradient layout for an itinerary and trip-planning app.",
    devices: [{ deviceId: "samsung-galaxy-s24", label: "Galaxy Phone" }],
    columnCount: 5,
    layout: "the-airbnb-right-2-title-above",
    background: { type: "gradient", value: "aurora" },
    titles: ["Find Stays", "Local Guides", "Realtime Maps", "Book Tickets", "Share Trip"],
    subtitles: ["Discover unique cabins & homes", "Handpicked recommendations", "Interactive offline maps", "Seamless booking for flights", "Plan with friends in real time"],
  },
  {
    id: "business-app-template-1",
    name: "Business App Template 1",
    category: "business",
    description: "Left-aligned title layout for a fintech / business app.",
    devices: [{ deviceId: "apple-iphone-17-pro-max", label: "6.9 Inch Phone" }],
    columnCount: 5,
    layout: "left-side-title-above",
    background: { type: "solid", value: "solid-indigo" },
    titles: ["Send Money", "Realtime Rates", "Smart Budget", "Crypto Wallet", "Premium Care"],
    subtitles: ["Zero transfer fees worldwide", "Track live currency markets", "Analyze monthly expenses", "Buy, sell and hold tokens", "24/7 priority support team"],
  },
  {
    id: "books-app-template-1",
    name: "Books App Template 1",
    category: "books",
    description: "Rotated framed screens for a reading and e-book app.",
    devices: [{ deviceId: "ipad-pro-12-9", label: "12.9 Inch Tablet" }],
    columnCount: 4,
    layout: "rotated-left-1-caption-above",
    // Warm cream, not solid-charcoal (#1c1c1c) -- that was the exact same
    // hex as the iPad's frame body color, so the frame was invisible.
    background: { type: "solid", value: "solid-cream" },
    textColor: "#1c1c1c",
    titles: ["Read Books", "Offline Mode", "Audiobooks", "Bookmark"],
    subtitles: ["Your library in your pocket", "Download stories to read anywhere", "Listen to high-quality audio", "Never lose your place"],
  },
  {
    id: "dropbox-template",
    name: "Cloud Storage",
    category: "productivity",
    description: "Clean single-device layout for a file sync and storage app.",
    devices: [{ deviceId: "google-pixel-9", label: "Pixel Phone" }],
    columnCount: 4,
    layout: "left-side-title-above",
    background: { type: "gradient", value: "royal" },
    titles: ["Store Files", "Auto Backup", "Share Links", "Access Anywhere"],
    subtitles: ["Keep everything in the cloud", "Never lose a document again", "Send large files instantly", "Sync across every device"],
  },
  {
    id: "messenger-template",
    name: "Direct Messages",
    category: "social-networking",
    description: "Two-device chat showcase with rounded speech-forward copy.",
    devices: [
      { deviceId: "samsung-galaxy-s24", label: "Galaxy Phone" },
      { deviceId: "apple-iphone-15-pro", label: "6.5 Inch Phone" },
    ],
    columnCount: 4,
    layout: "two-devices-connected-left-title-below",
    background: { type: "gradient", value: "royal" },
    titles: ["Chat Instantly", "Group Threads", "Voice & Video", "Stay in Sync"],
    subtitles: ["Message friends in real time", "Keep everyone in one thread", "Call without leaving the app", "Read receipts and typing status"],
  },
  {
    id: "medium-template",
    name: "Reading & Blogging",
    category: "entertainment",
    description: "Editorial single-column layout for a long-form reading app.",
    devices: [{ deviceId: "apple-iphone-16-pro-max", label: "6.7 Inch Phone" }],
    columnCount: 4,
    layout: "single-caption-below",
    background: { type: "solid", value: "solid-white" },
    textColor: "#1c1c1c",
    titles: ["Read Stories", "Follow Writers", "Save for Later", "Curated Feed"],
    subtitles: ["Long-form articles worth your time", "Get updates from favorite authors", "Build your own reading list", "Personalized to your interests"],
  },
  {
    id: "netflix-template",
    name: "Streaming Video",
    category: "entertainment",
    description: "Bold dark layout for a video/movie streaming app.",
    devices: [{ deviceId: "ipad-pro-12-9", label: "12.9 Inch Tablet" }],
    columnCount: 5,
    layout: "single-title-above",
    background: { type: "solid", value: "solid-indigo" },
    titles: ["Watch Anywhere", "New Releases", "Download Offline", "Multiple Profiles", "4K Streaming"],
    subtitles: ["Stream on any screen", "Fresh titles every week", "Take shows on the go", "One account, every viewer", "Crisp picture, every time"],
  },
  {
    id: "slack-template",
    name: "Team Workspace",
    category: "productivity",
    description: "Left-side layout for a team chat and collaboration app.",
    devices: [{ deviceId: "android-tablet-10", label: "10 Inch Tablet" }],
    columnCount: 4,
    layout: "left-side-title-above",
    background: { type: "pattern", value: "grid" },
    titles: ["Team Channels", "Direct Messages", "Huddles", "Integrations"],
    subtitles: ["Organize work by topic", "Quick 1:1 conversations", "Jump on a call instantly", "Connect all your tools"],
  },
  {
    id: "snapchat-template",
    name: "Stories & Camera",
    category: "social-networking",
    description: "Tilted playful layout for a camera-first social app.",
    devices: [{ deviceId: "apple-iphone-18-pro-max", label: "6.9 Inch Phone" }],
    columnCount: 4,
    layout: "tilted-right-title-above",
    background: { type: "gradient", value: "citrus" },
    titles: ["Capture Moments", "Add Filters", "Share Stories", "Chat Live"],
    subtitles: ["Snap and send in seconds", "Fun effects and lenses", "24-hour disappearing posts", "Message friends instantly"],
  },
  {
    id: "whatsapp-template",
    name: "Chat & Messaging",
    category: "social-networking",
    description: "Two-device messaging showcase with a calm green palette.",
    devices: [
      { deviceId: "apple-iphone-15-pro", label: "6.5 Inch Phone" },
      { deviceId: "google-pixel-9", label: "Pixel Phone" },
    ],
    columnCount: 5,
    layout: "two-devices-title-below",
    background: { type: "gradient", value: "mint" },
    titles: ["Message Freely", "Voice Calls", "Group Chats", "Media Sharing", "End-to-End Privacy"],
    subtitles: ["Text over Wi-Fi or data", "Crystal-clear calling", "Stay close with your circle", "Send photos and files fast", "Your conversations, protected"],
  },
  {
    id: "food-template-3",
    name: "Food Template 3",
    category: "food-and-drink",
    description: "Warm tilted layout for a restaurant discovery app.",
    devices: [{ deviceId: "samsung-galaxy-z-flip", label: "Galaxy Z Flip", variant: "unfolded" }],
    columnCount: 4,
    layout: "tilted-left-caption-below",
    background: { type: "gradient", value: "sunset" },
    titles: ["Order Food", "Fresh Ingredients", "Fast Delivery", "Enjoy Meal"],
    subtitles: ["Get dishes from top chefs", "Sourced from local farms", "Delivered hot in 20 minutes", "Delicious food at your door"],
  },
  {
    id: "food-template-4",
    name: "Food Template 4",
    category: "food-and-drink",
    description: "Cream-toned layout for a recipe and meal-planning app.",
    devices: [{ deviceId: "samsung-galaxy-s24", label: "Galaxy Phone" }],
    columnCount: 4,
    // Framed (was "snapshot-" -- frameless -- which made the device chrome
    // invisible by design; the near-black Galaxy frame reads clearly here
    // against the cream background).
    layout: "single-caption-above",
    background: { type: "solid", value: "solid-cream" },
    textColor: "#1c1c1c",
    titles: ["Browse Recipes", "Plan Your Week", "Shopping List", "Cook Along"],
    subtitles: ["Thousands of dishes to try", "Meals mapped to your days", "Ingredients synced automatically", "Step-by-step guided cooking"],
  },
  {
    id: "entertainment-app-template-1",
    name: "Entertainment App Template 1",
    category: "entertainment",
    description: "Two-device layout for a games and entertainment hub.",
    devices: [
      { deviceId: "samsung-galaxy-z-fold", label: "Galaxy Z Fold", variant: "unfolded" },
      { deviceId: "apple-iphone-15-pro", label: "6.5 Inch Phone" },
    ],
    columnCount: 4,
    layout: "two-devices-connected-right-title-below",
    background: { type: "gradient", value: "candy" },
    titles: ["Play Games", "Watch Clips", "Leaderboards", "Daily Rewards"],
    subtitles: ["Hundreds of titles to explore", "Bite-sized entertainment", "Compete with friends", "Log in and earn every day"],
  },
  {
    id: "photo-video-template-1",
    name: "Photo & Video Template 1",
    category: "photo-and-video",
    description: "Framed layout for a camera/editing app.",
    devices: [{ deviceId: "apple-iphone-17-pro-max", label: "6.9 Inch Phone" }],
    columnCount: 5,
    // Framed (was "snapshot-", frameless) on "aurora" instead of "graphite" --
    // graphite's dark gradient (#232526) was nearly identical to the
    // iPhone's #262626 frame body, so the frame all but disappeared.
    layout: "single-title-above",
    background: { type: "gradient", value: "aurora" },
    titles: ["Shoot & Edit", "Pro Filters", "Layer Tools", "Quick Export", "Share Everywhere"],
    subtitles: ["Capture in stunning detail", "Cinematic color grades", "Non-destructive editing", "Save in seconds", "Post directly to any platform"],
  },
  {
    id: "to-do-app-template-1",
    name: "To Do App Template 1",
    category: "utilities",
    description: "Minimal single-caption layout for a task management app.",
    devices: [{ deviceId: "google-pixel-9", label: "Pixel Phone" }],
    columnCount: 4,
    layout: "single-caption-above",
    background: { type: "gradient", value: "mint" },
    titles: ["Add Tasks", "Set Reminders", "Organize Lists", "Track Progress"],
    subtitles: ["Capture to-dos in a tap", "Never miss a deadline", "Group tasks by project", "See how far you've come"],
  },
  {
    id: "utility-app-template-1",
    name: "Utility App Template 1",
    category: "utilities",
    description: "Bold gradient layout for a converter/calculator utility.",
    devices: [{ deviceId: "samsung-galaxy-s24", label: "Galaxy Phone" }],
    columnCount: 4,
    layout: "single-caption-above",
    background: { type: "gradient", value: "graphite" },
    titles: ["Quick Convert", "Smart History", "Widget Support", "Pro Mode"],
    subtitles: ["Convert units in one tap", "Access past calculations", "Add tools to your home screen", "Unlock advanced math features"],
  },
  {
    id: "uber-eats-template",
    name: "Food Delivery",
    category: "food-and-drink",
    description: "Cream retail-style layout for a food delivery app.",
    devices: [{ deviceId: "apple-iphone-15-pro", label: "6.5 Inch Phone" }],
    columnCount: 5,
    layout: "two-devices-title-below",
    background: { type: "solid", value: "solid-cream" },
    textColor: "#1c1c1c",
    titles: ["New Arrivals", "Easy Cart", "Secure Checkout", "Track Order", "Get Rewards"],
    subtitles: ["Curated items every week", "One-tap addition to cart", "All major cards accepted", "Realtime delivery routing", "Earn points on every purchase"],
  },
  {
    id: "learnhub-education-template",
    name: "LearnHub Online Courses",
    category: "education",
    description: "Premium right-aligned layout for an online learning and course platform.",
    devices: [{ deviceId: "apple-iphone-18-pro-max", label: "6.9 Inch Phone" }],
    columnCount: 5,
    layout: "right-side-title-above",
    // Citrus (a bright orange/yellow gradient) reads clearly against the
    // iPhone 18 Pro Max's near-black frame (#282828) -- checked against the
    // same contrast audit used to fix the other low-contrast templates.
    background: { type: "gradient", value: "citrus" },
    titles: ["Learn Anything", "Expert-Led Courses", "Track Your Progress", "Learn Offline", "Join the Community"],
    subtitles: [
      "Thousands of courses across every subject",
      "Taught by industry professionals",
      "Certificates and skill milestones",
      "Download lessons for any connection",
      "Study groups and live Q&A sessions",
    ],
  },
];

/** Applies a starter template: replaces devices/columns/cells with the
 *  template's recipe. Existing sources are kept -- columns just don't have
 *  a screenshot assigned until the user picks one, same as the reference's
 *  "empty screenshot placeholder" state. */
const CANVAS_WIDTH = 1080;

/** `deviceOne.size`/`deviceTwo.size` (a 0-200 slider, 90 = the device's
 *  native pixel size -- see project.ts) has no relationship to the 1080px
 *  canvas: a device whose native width exceeds 1080 (most modern phones)
 *  overflows the canvas entirely at the slider default. Starter templates
 *  pick a size that fits the device to a sensible fraction of the canvas
 *  instead of blindly using the slider default. */
/** Canvas is 1080x1920, but sizing purely by target width breaks down for
 *  unusually tall/wide geometries (e.g. a foldable's unfolded variant can be
 *  ~2640px tall) -- constraining width alone leaves the device overflowing
 *  the canvas height and getting clipped, cropping away the frame edges
 *  entirely. Fit both axes and take whichever is smaller. */
function sizeForDevice(deviceId: string, variant: string | undefined, targetWidthPx: number, maxHeightPx = 1920 * 0.82): number {
  const device = DEVICE_REGISTRY[deviceId] ?? DEVICE_REGISTRY["phone"];
  const geometry = resolveGeometry(device, variant);
  const widthScale = targetWidthPx / geometry.width;
  const heightScale = maxHeightPx / geometry.height;
  return Math.round(90 * Math.min(widthScale, heightScale));
}

export function applyMockupTemplate(project: MockupProject, templateId: string): void {
  const template = MOCKUP_TEMPLATES.find((t) => t.id === templateId);
  if (!template) throw new Error(`Unknown template '${templateId}'.`);

  project.devices = [];
  project.columns = [];
  project.cells = {};

  template.devices.forEach((d, i) => addDeviceRow(project, { deviceId: d.deviceId, label: d.label, variant: d.variant, previewsVisible: true, isBase: i === 0 }));

  const preset = getLayoutPreset(template.layout);
  const targetWidth = preset.twoDevices ? CANVAS_WIDTH * 0.52 : CANVAS_WIDTH * 0.78;
  const baseDevice = template.devices[0];
  const deviceSize = sizeForDevice(baseDevice?.deviceId ?? "phone", baseDevice?.variant, targetWidth);

  for (let i = 0; i < template.columnCount; i++) {
    const defaultTitle = (template.titles && template.titles[i]) || `Feature ${i + 1}`;
    const defaultSub = (template.subtitles && template.subtitles[i]) || "Lorem ipsum dolor sit amet";

    const style = defaultColumnStyle(defaultTitle);
    style.subtitle.text = defaultSub;
    style.layout = template.layout;
    style.background = template.background;
    if (template.textColor) {
      style.title.color = template.textColor;
      style.subtitle.color = template.textColor;
    }
    style.deviceOne.size = deviceSize;
    // A "snapshot-" layout is frameless by design (screenshot only, no
    // device chrome) -- without this the preset's frameless flag was never
    // reaching the actual cell style, so every layout rendered framed.
    style.deviceOne.frameless = preset.frameless;
    if (preset.twoDevices) {
      style.deviceTwo = { ...style.deviceOne, sourceId: undefined };
    }
    addColumn(project, style);
  }
}
