// Single source of truth: build/icon.svg -> build/icon.png (512) + build/icon.ico (16..256).
// Run: node scripts/icons/build-icons.mjs
import fs from "fs";
import path from "path";
import { chromium } from "playwright";

const dir = path.resolve("build");
const svg = fs.readFileSync(path.join(dir, "icon.svg"), "utf8");
const sizes = [16, 24, 32, 48, 64, 128, 256, 512];
const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
const png = {};
for (const s of sizes) {
  await page.setViewportSize({ width: s, height: s });
  await page.setContent(`<body style="margin:0;background:transparent"><img src="data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}" width="${s}" height="${s}">`);
  png[s] = await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: s, height: s } });
}
await browser.close();
fs.writeFileSync(path.join(dir, "icon.png"), png[512]);

const ico = sizes.filter((s) => s <= 256);
const head = Buffer.alloc(6 + 16 * ico.length);
head.writeUInt16LE(1, 2); head.writeUInt16LE(ico.length, 4);
let off = head.length;
ico.forEach((s, i) => {
  const o = 6 + 16 * i;
  head[o] = s === 256 ? 0 : s; head[o + 1] = s === 256 ? 0 : s;
  head.writeUInt16LE(1, o + 4); head.writeUInt16LE(32, o + 6);
  head.writeUInt32LE(png[s].length, o + 8); head.writeUInt32LE(off, o + 12);
  off += png[s].length;
});
fs.writeFileSync(path.join(dir, "icon.ico"), Buffer.concat([head, ...ico.map((s) => png[s])]));
console.log("icons written to build/");
