// Client-side single source of truth for the device-size category cache --
// shared by capture.js, editor.js, and video.js so the id -> label mapping
// (fetched once from GET /api/device-categories, itself backed by
// src/capture/deviceCategories.ts) is never duplicated or fetched per-module.
import { api } from './utils.js';

let cache = null;

export async function loadDeviceCategories() {
  if (cache) return cache;
  try {
    const { categories } = await api("/api/device-categories");
    cache = categories || [];
  } catch (_) {
    cache = [];
  }
  return cache;
}

export function getDeviceCategoriesSync() {
  return cache || [];
}

export function deviceCategoryLabel(categoryId) {
  const found = cache?.find((c) => c.id === categoryId);
  return found ? found.label : (categoryId || "Unknown device");
}
