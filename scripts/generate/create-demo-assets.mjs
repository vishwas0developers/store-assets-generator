import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { chromium } from "playwright";
// Reuses the same generic-app-screen SVG the studio already falls back to
// when a scene has no real source yet (src/video/placeholder.ts) -- so the
// bundled demo PNGs and the live in-app placeholder look like the same
// product family. Requires `npm run build` to have populated dist/ first.
import { placeholderScreenUri } from "../../dist/src/video/placeholder.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "../..");
const outDir = path.join(rootDir, "assets", "demo");
fs.mkdirSync(outDir, { recursive: true });

function svgToDataUri(svg) {
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

const LANDSCAPE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080">
  <rect width="1920" height="1080" fill="#eef1f6"/>
  <rect width="1920" height="140" fill="#ffffff"/>
  <circle cx="80" cy="70" r="30" fill="#c7d0dc"/>
  <rect x="130" y="52" width="260" height="20" rx="10" fill="#c7d0dc"/>
  <rect x="130" y="82" width="180" height="16" rx="8" fill="#dbe1ea"/>
  ${[0, 1, 2].map((i) => `<rect x="${80 + i * 610}" y="200" width="560" height="760" rx="24" fill="#ffffff"/>
    <rect x="${120 + i * 610}" y="240" width="360" height="26" rx="13" fill="#c7d0dc"/>
    <rect x="${120 + i * 610}" y="284" width="480" height="18" rx="9" fill="#dbe1ea"/>
    <rect x="${120 + i * 610}" y="340" width="480" height="500" rx="16" fill="#e1e6ee"/>`).join("")}
</svg>`;

const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#3b82f6"/>
      <stop offset="100%" stop-color="#8b5cf6"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="112" fill="url(#g)"/>
  <circle cx="256" cy="256" r="120" fill="rgba(255,255,255,.18)"/>
  <path d="M180 280 L230 330 L340 190" stroke="#ffffff" stroke-width="34" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
</svg>`;

async function shoot(browser, svg, width, height, outPath) {
  const page = await browser.newPage({ viewport: { width, height } });
  await page.setContent(`<!doctype html><html><body style="margin:0;width:${width}px;height:${height}px;">${svg}</body></html>`);
  await page.screenshot({ path: outPath, type: "png" });
  await page.close();
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  try {
    for (let i = 1; i <= 6; i++) {
      const uri = placeholderScreenUri(i - 1);
      const svg = Buffer.from(uri.split(",")[1], "base64").toString("utf-8");
      await shoot(browser, svg, 1080, 2400, path.join(outDir, `demo_screen_${i}.png`));
      console.log(`Generated demo_screen_${i}.png`);
    }
    await shoot(browser, LANDSCAPE_SVG, 1920, 1080, path.join(outDir, "demo_landscape.png"));
    console.log("Generated demo_landscape.png");
    await shoot(browser, LOGO_SVG, 512, 512, path.join(outDir, "demo_logo.png"));
    console.log("Generated demo_logo.png");
  } finally {
    await browser.close();
  }
}

main();
