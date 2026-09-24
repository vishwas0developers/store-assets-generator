/**
 * Platform size targets for Studio Mockup rows. Dependency-free so the browser can import the compiled
 * copy via the `/dist/mockup/*` route (same as layerLayout.ts). The first target of a platform is primary.
 */
export type SizePlatform = "play-store" | "app-store";
export type CaptureCategory = "phone" | "tablet7" | "tablet10";

export interface SizeTarget {
  key: string;
  label: string;
  /** config/devices.json id used for a newly added row. */
  deviceId: string;
  width: number;
  height: number;
  captureCategory: CaptureCategory;
}

export const PLATFORM_SIZE_TARGETS: Record<SizePlatform, SizeTarget[]> = {
  "play-store": [
    { key: "phone67", label: "6.7-inch Phone", deviceId: "phone", width: 1080, height: 2400, captureCategory: "phone" },
    { key: "tablet7", label: "7-inch Tablet", deviceId: "android-tablet-7", width: 1200, height: 1920, captureCategory: "tablet7" },
    { key: "tablet10", label: "10-inch Tablet", deviceId: "android-tablet-10", width: 1600, height: 2560, captureCategory: "tablet10" },
  ],
  "app-store": [
    { key: "iphone69", label: "6.9-inch iPhone", deviceId: "apple-iphone-16-pro-max", width: 1320, height: 2868, captureCategory: "phone" },
    { key: "ipad13", label: "13-inch iPad", deviceId: "ipad-pro-12-9", width: 2064, height: 2752, captureCategory: "tablet10" },
  ],
};

export function sizeTargetsFor(platform?: string): SizeTarget[] {
  return PLATFORM_SIZE_TARGETS[platform === "app-store" ? "app-store" : "play-store"];
}

export function primaryTargetFor(platform?: string): SizeTarget {
  return sizeTargetsFor(platform)[0];
}

/** Editing/design canvas: always 1080 wide; height keeps the target's aspect (floor: iPhone 6.9 -> 2346). */
export function designSizeFor(target: SizeTarget): { width: number; height: number } {
  return { width: 1080, height: Math.floor((1080 * target.height) / target.width) };
}

/** Finds a target (and its platform) by row sizeKey; undefined for legacy rows without one. */
export function findSizeTarget(sizeKey?: string): { platform: SizePlatform; target: SizeTarget } | undefined {
  if (!sizeKey) return undefined;
  for (const platform of Object.keys(PLATFORM_SIZE_TARGETS) as SizePlatform[]) {
    const target = PLATFORM_SIZE_TARGETS[platform].find((t) => t.key === sizeKey);
    if (target) return { platform, target };
  }
  return undefined;
}
