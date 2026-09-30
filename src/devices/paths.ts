import path from "path";

/** `devices/` is the single home of every reusable device asset:
 *    devices/catalogue.json   device definitions (source of truth for 2D SVG + 3D GLB devices)
 *    devices/2d/<id>.svg      2D frames (generated from the catalogue, or a custom uploaded SVG)
 *    devices/3d/<id>.glb      3D models
 *    devices/css/<id>.json    CSS-built devices (markup + css), reusable across templates */
export const DEVICES_DIR = path.join(process.cwd(), "devices");
export const CATALOGUE_PATH = path.join(DEVICES_DIR, "catalogue.json");
export const DEVICES_2D_DIR = path.join(DEVICES_DIR, "2d");
export const DEVICES_3D_DIR = path.join(DEVICES_DIR, "3d");
export const DEVICES_CSS_DIR = path.join(DEVICES_DIR, "css");
