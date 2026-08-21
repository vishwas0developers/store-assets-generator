import fs from "fs";
import path from "path";
import { BACKGROUNDS, DEVICE_CSS, backgroundCss, dataUri, deviceMarkup, deviceScaleFor, escapeHtml } from "./shared.js";
import { DEVICE_REGISTRY } from "../devices/registry.js";
import { sessionFile, type MockupConfig, type RawScreenshot, type Session } from "../session/store.js";

/**
 * Step 2 — Studio mockups. Each raw screenshot becomes a framed device
 * mockup on a styled canvas with a label, sub-label and layout template.
 * One HTML generator serves both the in-browser preview and the step 3
 * render, so what you preview is exactly what ships.
 */

export interface MockupTemplate {
  id: string;
  name: string;
  css: (deviceScale: number) => string;
  body: (device: string, label: string, subtext: string) => string;
}

const TEXT_BLOCK = (label: string, subtext: string) =>
  `<div class="copy"><div class="label">${escapeHtml(label)}</div>${
    subtext ? `<div class="subtext">${escapeHtml(subtext)}</div>` : ""
  }</div>`;

export const MOCKUP_TEMPLATES: Record<string, MockupTemplate> = {
  "caption-above": {
    id: "caption-above",
    name: "Caption above device",
    css: (s) => `
      .canvas { flex-direction: column; justify-content: flex-start; padding-top: 7%; }
      .stage { transform: scale(${s}); transform-origin: top center; margin-top: 4%; }`,
    body: (device, label, subtext) => `${TEXT_BLOCK(label, subtext)}<div class="stage">${device}</div>`,
  },
  "caption-below": {
    id: "caption-below",
    name: "Caption below device",
    css: (s) => `
      .canvas { flex-direction: column-reverse; justify-content: flex-end; padding-bottom: 7%; }
      .stage { transform: scale(${s}); transform-origin: bottom center; margin-bottom: 4%; }`,
    body: (device, label, subtext) => `${TEXT_BLOCK(label, subtext)}<div class="stage">${device}</div>`,
  },
  angled: {
    id: "angled",
    name: "Angled / 3D tilt",
    css: (s) => `
      .canvas { flex-direction: column; justify-content: flex-start; padding-top: 6%; perspective: 2400px; }
      .copy { text-align: left; align-self: flex-start; }
      .stage { transform: scale(${s * 1.05}) rotateY(-16deg) rotateX(4deg) rotateZ(-4deg);
               transform-origin: top center; margin-top: 5%; }`,
    body: (device, label, subtext) => `${TEXT_BLOCK(label, subtext)}<div class="stage">${device}</div>`,
  },
  "full-bleed": {
    id: "full-bleed",
    name: "Full-bleed screenshot",
    css: (s) => `
      .canvas { padding: 0; }
      .stage { transform: scale(${s * 1.32}); transform-origin: center; }
      .copy { position: absolute; bottom: 0; left: 0; right: 0; padding: 6% 8%; z-index: 5;
              background: linear-gradient(to top, rgba(0,0,0,.85), rgba(0,0,0,0)); }`,
    body: (device, label, subtext) => `<div class="stage">${device}</div>${TEXT_BLOCK(label, subtext)}`,
  },
};

export function defaultMockupConfig(screen: RawScreenshot, platform: string): MockupConfig {
  return {
    template: "caption-above",
    device: platform === "apple-app-store" ? "apple-iphone-15-pro" : "phone",
    label: screen.title,
    subtext: "",
    background: "ocean",
    textColor: "#ffffff",
  };
}

export function listMockupOptions() {
  return {
    templates: Object.values(MOCKUP_TEMPLATES).map((t) => ({ id: t.id, name: t.name })),
    backgrounds: Object.keys(BACKGROUNDS),
  };
}

/** The single source of truth for what a mockup looks like. */
export function mockupHtml(config: MockupConfig, screenshotUri: string, canvas: { width: number; height: number }): string {
  const template = MOCKUP_TEMPLATES[config.template] ?? MOCKUP_TEMPLATES["caption-above"];
  const device = DEVICE_REGISTRY[config.device] ?? DEVICE_REGISTRY["phone"];
  if (!device) throw new Error(`Device '${config.device}' not found in registry`);
  const deviceScale = deviceScaleFor(device, canvas.height, config.variant);
  const labelSize = Math.round(canvas.width * 0.055);

  return `<!doctype html>
<html><head><meta charset="utf-8" /><style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; width: ${canvas.width}px; height: ${canvas.height}px; overflow: hidden; }
  .canvas {
    position: relative; width: ${canvas.width}px; height: ${canvas.height}px;
    background: ${backgroundCss(config.background)};
    display: flex; align-items: center; font-family: "Segoe UI", Roboto, -apple-system, sans-serif;
    color: ${escapeHtml(config.textColor)}; overflow: hidden;
  }
  .copy { width: 100%; text-align: center; padding: 0 7%; }
  .label { font-size: ${labelSize}px; font-weight: 800; line-height: 1.15; }
  .subtext { font-size: ${Math.round(labelSize * 0.5)}px; opacity: .8; margin-top: .5em; font-weight: 500; }
  ${DEVICE_CSS}
  ${template.css(deviceScale)}
</style></head>
<body><div class="canvas">${template.body(deviceMarkup(device, screenshotUri, config.variant), config.label, config.subtext)}</div></body></html>`;
}

export function mockupHtmlForScreen(session: Session, screenId: string, canvas: { width: number; height: number }): string {
  const screen = session.raw.find((r) => r.id === screenId);
  if (!screen) throw new Error(`Screen '${screenId}' not found in session ${session.id}`);
  const config = session.mockups[screenId] ?? defaultMockupConfig(screen, session.platforms[0]);
  return mockupHtml(config, dataUri(sessionFile(session.id, screen.file)), canvas);
}

/** Render every screen at one device-class size. Returns written file paths. */
export async function renderMockups(session: Session, outputDir: string, canvas: { width: number; height: number }): Promise<string[]> {
  fs.mkdirSync(outputDir, { recursive: true });
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  const written: string[] = [];
  try {
    const page = await browser.newPage({ viewport: canvas });
    for (let i = 0; i < session.raw.length; i++) {
      const screen = session.raw[i];
      await page.setContent(mockupHtmlForScreen(session, screen.id, canvas), { waitUntil: "load" });
      const outPath = path.join(outputDir, `${String(i + 1).padStart(2, "0")}_${screen.id}.png`);
      await page.screenshot({ path: outPath, type: "png" });
      written.push(outPath);
    }
  } finally {
    await browser.close();
  }
  return written;
}
