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
}

export const MOCKUP_TEMPLATES: MockupStarterTemplate[] = [
  {
    id: "ios-starter-template",
    name: "iOS Starter",
    category: "Starter",
    devices: [{ deviceId: "apple-iphone-15-pro", label: "6.5 Inch" }],
    columnCount: 4,
    layout: "single-title-above",
    background: { type: "gradient", value: "royal" },
  },
  {
    id: "android-starter-template",
    name: "Android Starter",
    category: "Starter",
    devices: [{ deviceId: "phone", label: "Phone" }],
    columnCount: 4,
    layout: "single-title-above",
    background: { type: "gradient", value: "graphite" },
  },
  {
    id: "ios-android-starter-template",
    name: "iOS + Android Starter",
    category: "Starter",
    devices: [
      { deviceId: "apple-iphone-15-pro", label: "6.5 Inch" },
      { deviceId: "phone", label: "Phone" },
    ],
    columnCount: 4,
    layout: "single-title-above",
    background: { type: "gradient", value: "ocean" },
  },
  {
    id: "books-app-template-1",
    name: "Books App Template 1",
    category: "Books",
    devices: [{ deviceId: "apple-iphone-15-pro", label: "6.5 Inch" }],
    columnCount: 5,
    layout: "tilted-left-caption-below",
    background: { type: "solid", value: "solid-cream" },
  },
  {
    id: "business-app-template-1",
    name: "Business App Template 1",
    category: "Business",
    devices: [{ deviceId: "phone", label: "Phone" }],
    columnCount: 5,
    layout: "left-side-title-above",
    background: { type: "gradient", value: "royal" },
  },
  {
    id: "entertainment-app-template-1",
    name: "Entertainment App Template 1",
    category: "Entertainment",
    devices: [{ deviceId: "apple-iphone-15-pro", label: "6.5 Inch" }],
    columnCount: 5,
    layout: "rotated-left-1-caption-above",
    background: { type: "pattern", value: "mesh" },
  },
  {
    id: "food-template-3",
    name: "Food Template 3",
    category: "Food",
    devices: [{ deviceId: "phone", label: "Phone" }],
    columnCount: 4,
    layout: "two-devices-title-below",
    background: { type: "solid", value: "solid-forest" },
  },
  {
    id: "food-template-4",
    name: "Food Template 4",
    category: "Food",
    devices: [{ deviceId: "phone", label: "Phone" }],
    columnCount: 4,
    layout: "single-caption-below",
    background: { type: "gradient", value: "sunset" },
  },
  {
    id: "photo-video-template-1",
    name: "Photo & Video Template 1",
    category: "Photo & Video",
    devices: [{ deviceId: "apple-iphone-15-pro", label: "6.5 Inch" }],
    columnCount: 5,
    layout: "snapshot-single-no-text",
    background: { type: "solid", value: "solid-charcoal" },
  },
  {
    id: "to-do-app-template-1",
    name: "To Do App Template 1",
    category: "To Do",
    devices: [{ deviceId: "phone", label: "Phone" }],
    columnCount: 4,
    layout: "right-side-title-above",
    background: { type: "gradient", value: "mint" },
  },
  {
    id: "utility-app-template-1",
    name: "Utility App Template 1",
    category: "Utility",
    devices: [{ deviceId: "phone", label: "Phone" }],
    columnCount: 4,
    layout: "single-title-above",
    background: { type: "gradient", value: "violet" },
  },
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
    const style = defaultColumnStyle(`Feature ${i + 1}`);
    style.layout = template.layout;
    style.background = template.background;
    addColumn(project, style);
  }
}
