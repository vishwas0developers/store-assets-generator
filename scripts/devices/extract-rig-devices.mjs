// One-off (idempotent) extraction of every template's embedded device.
//   npm run build && node scripts/devices/extract-rig-devices.mjs
// - marks each template rig with data-device and moves the device's CSS into a
//   <style data-device-css> block (template stays byte-identical in behaviour)
// - writes CSS-built devices to devices/css/<id>.json as standalone assets
// Existing GLB-shell templates (`{{DEVICE_ID}}` canvases) get their placeholders
// resolved to the template's default device so the file renders on its own.
import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";

const root = process.cwd();
const dist = (p) => import(pathToFileURL(path.join(root, "dist", "src", p)).href);
const { extractRigDevice } = await dist("devices/rig-engine.js");
const { DEVICE_REGISTRY } = await dist("devices/registry.js");

const TEMPLATES = path.join(root, "templates", "video");
const CSS_DEVICES = {
  "tpl-38180229-minimal-skyblue": { id: "css-minimal-chassis-phone", name: "Minimal Chassis Phone", features: ["punch-hole-camera", "side-buttons", "gloss-sheen", "curved-edge-shadow", "edge-glare"] },
  "tpl-27720310-dark-matte-spheres": { id: "css-dark-matte-phone", name: "Dark Matte Phone", features: ["6-face-box", "punch-hole-camera", "triple-lens-back", "gloss-sheen", "curved-edge-shadow"] },
  "tpl-23552607-minimal-studio-3d": { id: "css-studio-box-phone", name: "Studio 6-Sided Box Phone", features: ["6-face-box", "bezel-speaker", "bezel-camera", "gloss-sheen", "curved-edge-shadow", "metallic-side-rails"] },
  "tpl-23393372-neon-rings": { id: "css-neon-bevel-phone", name: "Neon Bevel Phone", features: ["6-face-box", "top-bottom-bezel", "speaker-grille", "back-camera-module", "fingerprint-sensor", "usb-port", "side-buttons"] },
  "tpl-1371526-hud-blueprint": { id: "css-hud-blueprint-phone", name: "HUD Blueprint Phone", features: ["6-face-box", "top-bottom-bezel", "home-button", "sensor-dots", "glass-reflection", "side-buttons", "usb-port"] },
};

function radiusOf(css) {
  const m = css.match(/\.phone-face(?:\.front|-front)?\s*\{[^}]*?border-radius:\s*(\d+)px/);
  return m ? Number(m[1]) : undefined;
}
function depthOf(css) {
  const m = css.match(/\.side-left\s*\{[^}]*?width:\s*(\d+)px/) ?? css.match(/\.side-edge-left\s*\{[^}]*?width:\s*(\d+)px/) ?? css.match(/\.phone-side\.left\s*\{[^}]*?width:\s*(\d+)px/);
  return m ? Number(m[1]) : undefined;
}

let done = 0;
for (const file of fs.readdirSync(TEMPLATES).filter((f) => f.endsWith(".html"))) {
  const id = file.replace(/\.html$/, "");
  const p = path.join(TEMPLATES, file);
  let html = fs.readFileSync(p, "utf-8");
  if (html.includes("data-device-css=")) { console.log("skip (already extracted)", id); continue; }

  const cfgMatch = html.match(/<script type="application\/json" id="template-config">([\s\S]*?)<\/script>/);
  const cfg = JSON.parse(cfgMatch[1]);
  const glb = html.includes("{{DEVICE_ID}}");
  const css = CSS_DEVICES[id];
  const deviceId = css ? css.id : cfg.device;
  if (glb) {
    const dev = DEVICE_REGISTRY[cfg.device] ?? DEVICE_REGISTRY["phone"];
    html = html.replaceAll("{{DEVICE_ID}}", dev.id).replaceAll("{{DEVICE_W}}", String(dev.geometry.width)).replaceAll("{{DEVICE_H}}", String(dev.geometry.height));
  }
  const r = extractRigDevice(html, { deviceId });
  let out = r.html;

  if (css) {
    const size = r.size ?? { width: 360, height: 740 };
    const asset = {
      id: css.id, name: css.name, vendor: "Template", category: "css", renderingType: "3d", formFactor: "phone",
      dimensions: { width: size.width, height: size.height, depth: depthOf(r.css), radius: radiusOf(r.css) },
      features: css.features, rigClass: r.rigClass, rigClasses: r.rigClasses,
      markup: r.markup, css: r.css, sourceTemplate: id,
    };
    fs.mkdirSync(path.join(root, "devices", "css"), { recursive: true });
    fs.writeFileSync(path.join(root, "devices", "css", `${css.id}.json`), JSON.stringify(asset, null, 2) + "\n");
    // the template's default device is now the extracted CSS device
    out = out.replace(/("device":\s*)"[^"]*"/, `$1"${css.id}"`);
  }
  fs.writeFileSync(p, out);
  console.log(`${id}: device=${deviceId} rigs=${r.rigCount} variants=${r.variants} moved=${r.movedSelectors.length} size=${r.size ? r.size.width + "x" + r.size.height : "?"} rigClasses=[${r.rigClasses}]`);
  done++;
}
console.log("extracted", done);
