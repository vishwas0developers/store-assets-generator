import { addColumn, addDeviceRow, defaultColumnStyle, type ColumnStyle, type MockupProject } from "./project.js";

/**
 * Studio Mockup starter templates -- the reference's "Load Starter
 * Template" / "Load App Template" (ios-starter-template,
 * android-starter-template, ios-android-starter-template, plus category
 * templates: Books, Business, Entertainment, Food, Photo & Video, To Do,
 * Utility). Applying one auto-prepares device rows + a starting set of
 * columns + a default layout/background, then the user edits text/styles
 * from there -- "select a device/model/template once and automatically
 * handle multiple screenshots based on it".
 */

export interface MockupStarterTemplate {
  id: string;
  name: string;
  category: string;
  devices: Array<{ deviceId: string; label: string }>;
  columnCount: number;
  layout: string;
  background: ColumnStyle["background"];
  titles?: string[];
  subtitles?: string[];
}

export const MOCKUP_TEMPLATES: MockupStarterTemplate[] = [
  {
    id: "ios-starter-template",
    name: "iOS Starter Pro",
    category: "Starter",
    devices: [{ deviceId: "apple-iphone-15-pro", label: "6.5 Inch Phone" }],
    columnCount: 4,
    layout: "single-title-above",
    background: { type: "gradient", value: "royal" },
    titles: ["Welcome Guide", "Modern Design", "Instant Sync", "Get Started"],
    subtitles: ["Discover a new way of living", "Clean and customizable components", "Your data is always with you", "Join our community today"]
  },
  {
    id: "android-starter-template",
    name: "Android Starter Pro",
    category: "Starter",
    devices: [{ deviceId: "phone", label: "Android Phone" }],
    columnCount: 4,
    layout: "single-title-above",
    background: { type: "gradient", value: "graphite" },
    titles: ["Explore Features", "Intuitive Layout", "Secure Lock", "Stay Connected"],
    subtitles: ["Designed for modern Android devices", "Simple navigation and gestures", "Keep your private data safe", "Never miss a single update"]
  },
  {
    id: "saas-wave-template",
    name: "SaaS Gradient Wave",
    category: "SaaS & Tech",
    devices: [
      { deviceId: "apple-iphone-15-pro", label: "6.5 Inch Phone" },
      { deviceId: "phone", label: "Android Phone" }
    ],
    columnCount: 5,
    layout: "the-airbnb-left-1-title-above",
    background: { type: "gradient", value: "ocean" },
    titles: ["Grow Fast", "Deep Insights", "Collaboration", "Integrations", "Cloud Sync"],
    subtitles: ["Scale your startup smoothly", "Interactive analytics charts", "Work with your team live", "Connect with all your tools", "Deploy instantly to the cloud"]
  },
  {
    id: "business-app-template-1",
    name: "Fintech Business Pro",
    category: "Business",
    devices: [{ deviceId: "apple-iphone-15-pro", label: "6.5 Inch Phone" }],
    columnCount: 5,
    layout: "left-side-title-above",
    background: { type: "solid", value: "solid-indigo" },
    titles: ["Send Money", "Realtime Rates", "Smart Budget", "Crypto Wallet", "Premium Care"],
    subtitles: ["Zero transfer fees worldwide", "Track live currency markets", "Analyze monthly expenses", "Buy, sell and hold tokens", "24/7 priority support team"]
  },
  {
    id: "food-lifestyle-template",
    name: "Warm Sunset Food",
    category: "Food & Lifestyle",
    devices: [{ deviceId: "apple-iphone-15-pro", label: "6.5 Inch Phone" }],
    columnCount: 4,
    layout: "tilted-left-caption-below",
    background: { type: "gradient", value: "sunset" },
    titles: ["Order Food", "Fresh Ingredients", "Fast Delivery", "Enjoy Meal"],
    subtitles: ["Get dishes from top chefs", "Sourced from local farms", "Delivered hot in 20 minutes", "Delicious food at your door"]
  },
  {
    id: "health-fitness-template",
    name: "Fresh Mint Health",
    category: "Health & Fitness",
    devices: [{ deviceId: "apple-iphone-15-pro", label: "6.5 Inch Phone" }],
    columnCount: 4,
    layout: "snapshot-single-title-above",
    background: { type: "gradient", value: "mint" },
    titles: ["Workouts", "Nutrition", "Sleep Tracker", "Achieve Goals"],
    subtitles: ["Daily personalized gym plans", "Log meals and water intake", "Monitor deep sleep cycles", "Unlock health badges weekly"]
  },
  {
    id: "ecommerce-retail-template",
    name: "Classic Cream Retail",
    category: "E-Commerce",
    devices: [{ deviceId: "phone", label: "Android Phone" }],
    columnCount: 5,
    layout: "two-devices-title-below",
    background: { type: "solid", value: "solid-cream" },
    titles: ["New Arrivals", "Easy Cart", "Secure Checkout", "Track Order", "Get Rewards"],
    subtitles: ["Curated items every week", "One-tap addition to cart", "All major cards accepted", "Realtime delivery routing", "Earn points on every purchase"]
  },
  {
    id: "books-app-template",
    name: "Sleek Books & Reader",
    category: "Books",
    devices: [{ deviceId: "apple-iphone-15-pro", label: "6.5 Inch Phone" }],
    columnCount: 4,
    layout: "rotated-left-1-caption-above",
    background: { type: "solid", value: "solid-charcoal" },
    titles: ["Read Books", "Offline Mode", "Audiobooks", "Bookmark"],
    subtitles: ["Your library in your pocket", "Download stories to read anywhere", "Listen to high-quality audio", "Never lose your place"]
  },
  {
    id: "music-app-template",
    name: "Beats Music Player",
    category: "Entertainment",
    devices: [{ deviceId: "apple-iphone-15-pro", label: "6.5 Inch Phone" }],
    columnCount: 5,
    layout: "two-devices-title-below",
    background: { type: "gradient", value: "violet" },
    titles: ["Stream Beats", "Create Playlists", "Offline Mode", "Hi-Fi Sound", "Join Live"],
    subtitles: ["Access millions of songs", "Curate for any mood", "Listen without connection", "Lossless audio quality", "Interact with your favorite artists"]
  },
  {
    id: "notes-app-template",
    name: "Smart Notes & Journal",
    category: "Productivity",
    devices: [{ deviceId: "phone", label: "Android Phone" }],
    columnCount: 4,
    layout: "left-side-title-above",
    background: { type: "solid", value: "solid-forest" },
    titles: ["Smart Notes", "Organize Ideas", "Sync Everywhere", "Rich Formatting"],
    subtitles: ["Quick capturing made simple", "Folders, tags, and colors", "Access notes on any platform", "Markdown and sketch support"]
  },
  {
    id: "travel-app-template",
    name: "Travel Explorer Guide",
    category: "Travel",
    devices: [{ deviceId: "apple-iphone-15-pro", label: "6.5 Inch Phone" }],
    columnCount: 5,
    layout: "the-airbnb-right-2-title-above",
    background: { type: "gradient", value: "aurora" },
    titles: ["Find Stays", "Local Guides", "Realtime Maps", "Book Tickets", "Share Trip"],
    subtitles: ["Discover unique cabins & homes", "Handpicked recommendations", "Interactive offline maps", "Seamless booking for flights", "Plan with friends in real time"]
  },
  {
    id: "utility-app-template",
    name: "Convert Pro Calculator",
    category: "Utilities",
    devices: [{ deviceId: "phone", label: "Android Phone" }],
    columnCount: 4,
    layout: "single-caption-above",
    background: { type: "gradient", value: "graphite" },
    titles: ["Quick Convert", "Smart History", "Widget Support", "Pro Mode"],
    subtitles: ["Convert units in one tap", "Access past calculations", "Add tools to your home screen", "Unlock advanced math features"]
  }
];

/** Applies a starter template: replaces devices/columns/cells with the
 *  template's recipe. Existing sources are kept -- columns just don't have
 *  a screenshot assigned until the user picks one, same as the reference's
 *  "empty screenshot placeholder" state. */
export function applyMockupTemplate(project: MockupProject, templateId: string): void {
  const template = MOCKUP_TEMPLATES.find((t) => t.id === templateId);
  if (!template) throw new Error(`Unknown template '${templateId}'.`);

  project.devices = [];
  project.columns = [];
  project.cells = {};

  template.devices.forEach((d, i) => addDeviceRow(project, { deviceId: d.deviceId, label: d.label, previewsVisible: true, isBase: i === 0 }));
  for (let i = 0; i < template.columnCount; i++) {
    const defaultTitle = (template.titles && template.titles[i]) || `Feature ${i + 1}`;
    const defaultSub = (template.subtitles && template.subtitles[i]) || "Lorem ipsum dolor sit amet";
    
    const style = defaultColumnStyle(defaultTitle);
    style.subtitle.text = defaultSub;
    style.layout = template.layout;
    style.background = template.background;
    addColumn(project, style);
  }
}
