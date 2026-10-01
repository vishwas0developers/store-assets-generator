// Verifies the extraction was lossless: same CSS declarations per selector and
// identical non-style HTML (modulo the data-device markers) vs. the git original.
import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { pathToFileURL } from "url";
const root = process.cwd();
const { parseCssRules } = await import(pathToFileURL(path.join(root, "dist/src/devices/rig-engine.js")).href);
const { DEVICE_REGISTRY } = await import(pathToFileURL(path.join(root, "dist/src/devices/registry.js")).href);

const rulesOf = (css) => {
  const m = new Map();
  for (const r of parseCssRules(css)) {
    const key = r.sel.replace(/\s+/g, " ");
    const decls = r.at ? [r.body.replace(/\s+/g, " ")] : r.body.split(";").map((d) => d.trim().replace(/\s+/g, " ")).filter(Boolean);
    m.set(key, [...(m.get(key) ?? []), ...decls].sort());
  }
  return m;
};
const styles = (h) => [...h.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join("\n");
const noStyle = (h) => h.replace(/<style[^>]*>[\s\S]*?<\/style>/g, "").replace(/\s+/g, " ");

let bad = 0;
for (const f of fs.readdirSync("templates/video").filter((x) => x.endsWith(".html"))) {
  const id = f.replace(/\.html$/, "");
  let orig;
  try { orig = execSync(`git show HEAD:templates/video/${id}/template.html`, { maxBuffer: 1 << 28 }).toString("utf-8"); } catch { orig = execSync(`git show HEAD:templates/video/${id}.html`, { maxBuffer: 1 << 28 }).toString("utf-8"); }
  const now = fs.readFileSync(path.join("templates/video", f), "utf-8");
  const cfg = JSON.parse(orig.match(/id="template-config">([\s\S]*?)<\/script>/)[1]);
  if (orig.includes("{{DEVICE_ID}}")) {
    const dev = DEVICE_REGISTRY[cfg.device] ?? DEVICE_REGISTRY["phone"];
    orig = orig.replaceAll("{{DEVICE_ID}}", dev.id).replaceAll("{{DEVICE_W}}", String(dev.geometry.width)).replaceAll("{{DEVICE_H}}", String(dev.geometry.height));
  }
  const a = rulesOf(styles(orig)), b = rulesOf(styles(now));
  const problems = [];
  for (const k of new Set([...a.keys(), ...b.keys()])) {
    if (JSON.stringify(a.get(k)) !== JSON.stringify(b.get(k))) problems.push(`css ${k}: ${JSON.stringify(a.get(k))?.slice(0, 80)} -> ${JSON.stringify(b.get(k))?.slice(0, 80)}`);
  }
  const clean = now.replace(/ data-device(?:-rig-classes|-size)?="[^"]*"/g, "").replace(/("device":\s*)"css-[^"]*"/, `$1"${cfg.device}"`).replace(/"deviceMode": "3D",/g, "");
  const cleanOrig = orig.replace(/"deviceMode": "3D",/g, "");
  if (noStyle(clean) !== noStyle(cleanOrig)) problems.push("non-style html differs");
  console.log(problems.length ? `FAIL ${id}\n  ${problems.slice(0, 8).join("\n  ")}` : `ok   ${id}`);
  bad += problems.length ? 1 : 0;
}
process.exit(bad ? 1 : 0);
