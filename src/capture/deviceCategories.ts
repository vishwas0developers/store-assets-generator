/**
 * Single source of truth for the app-store device-size taxonomy used across
 * Screen Capture, Studio Mockup, and Video Studio. Device size (Phone /
 * 7-inch Tablet / 10-inch Tablet) is the primary, user-facing way assets are
 * categorized, filtered, and reused -- exact pixel resolution is kept only as
 * secondary technical metadata (see ApplicationCapture / MockupSourceImage).
 *
 * No Watch category by product decision -- classifyDeviceCategory() never
 * returns anything outside DeviceCategory, so a watch-sized capture still
 * falls back to "phone" rather than introducing a fourth category.
 */

export type DeviceCategory = "phone" | "tablet7" | "tablet10";

export const DEVICE_CATEGORY_ORDER: DeviceCategory[] = ["phone", "tablet7", "tablet10"];

export const DEVICE_CATEGORY_LABELS: Record<DeviceCategory, string> = {
  phone: "6.7 inch Phone",
  tablet7: "7-inch Tablet",
  tablet10: "10-inch Tablet",
};

export function isDeviceCategory(value: unknown): value is DeviceCategory {
  return value === "phone" || value === "tablet7" || value === "tablet10";
}

/** The canonical capture resolution used when a Live Web session connects
 *  "as" a given device size (see src/capture/liveBrowser.ts). */
export const CATEGORY_RESOLUTION: Record<DeviceCategory, { width: number; height: number; resolutionKey: string }> = {
  phone: { width: 1290, height: 2796, resolutionKey: "1290x2796" },
  tablet7: { width: 1200, height: 1920, resolutionKey: "1200x1920" },
  tablet10: { width: 2048, height: 2732, resolutionKey: "2048x2732" },
};

/**
 * Classifies arbitrary pixel dimensions (a real Android device's native
 * screen, or a legacy capture saved before deviceCategory existed) into one
 * of the three device-size categories. Phones/phablets are tall and narrow;
 * tablets are squarer, and a 10" tablet's long edge is meaningfully larger in
 * absolute pixels than a 7" tablet's.
 */
export function classifyDeviceCategory(width: number, height: number): DeviceCategory {
  const long = Math.max(width, height);
  const short = Math.min(width, height);
  if (short <= 0) return "phone";
  const aspect = long / short;
  if (aspect >= 1.55) return "phone";
  return long >= 2200 ? "tablet10" : "tablet7";
}

export const DEVICE_CATEGORIES_LIST = DEVICE_CATEGORY_ORDER.map((id) => ({
  id,
  label: DEVICE_CATEGORY_LABELS[id],
  ...CATEGORY_RESOLUTION[id],
}));
