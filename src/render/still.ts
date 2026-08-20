import fs from "fs";
import path from "path";
import { DEVICE_REGISTRY } from "../devices/registry.js";
import { type ProjectDocument } from "../project/schema.js";

export interface StillRenderOptions {
  outputDir: string;
}

export class StillCompositionEngine {
  /**
   * Compose and render static store screenshots using HTML overlaying
   */
  async render(doc: ProjectDocument, options: StillRenderOptions): Promise<string[]> {
    const outputs: string[] = [];
    const outputDir = path.join(options.outputDir, "store");
    fs.mkdirSync(outputDir, { recursive: true });

    for (let i = 0; i < doc.screens.length; i++) {
      const screen = doc.screens[i];
      const deviceId = screen.device || "phone";
      const device = DEVICE_REGISTRY[deviceId];
      if (!device) {
        throw new Error(`Device model '${deviceId}' not found in registry`);
      }

      // Read raw screenshot in Base64
      const screenshotData = fs.readFileSync(screen.capture, "base64");
      const screenshotMime = "image/png";

      // Combine screenshot with SVG frame inside HTML
      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body {
              margin: 0;
              padding: 0;
              width: ${device.geometry.width}px;
              height: ${device.geometry.height}px;
              background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%);
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: flex-start;
              font-family: sans-serif;
              color: white;
              overflow: hidden;
            }
            .caption {
              margin-top: 100px;
              font-size: 64px;
              font-weight: bold;
              text-align: center;
              padding: 0 40px;
            }
            .device-container {
              position: relative;
              margin-top: 80px;
              width: ${device.geometry.width}px;
              height: ${device.geometry.height}px;
              transform: scale(0.7);
              transform-origin: top center;
            }
            .screenshot {
              position: absolute;
              top: ${device.geometry.screenInset.top}px;
              left: ${device.geometry.screenInset.left}px;
              width: ${device.geometry.screenInset.width}px;
              height: ${device.geometry.screenInset.height}px;
              border-radius: ${device.geometry.cornerRadius || 0}px;
              object-fit: cover;
              z-index: 1;
            }
            .device-frame {
              position: absolute;
              top: 0;
              left: 0;
              width: 100%;
              height: 100%;
              z-index: 2;
              pointer-events: none;
            }
          </style>
        </head>
        <body>
          <div class="caption">${screen.featureText || ""}</div>
          <div class="device-container">
            <img class="screenshot" src="data:${screenshotMime};base64,${screenshotData}" />
            <div class="device-frame">
              ${device.svgFrame}
            </div>
          </div>
        </body>
        </html>
      `;

      // Import Playwright dynamically to avoid context collision
      const { chromium } = await import("playwright");
      const browser = await chromium.launch({ headless: true });
      const context = await browser.newContext({
        viewport: { width: device.geometry.width, height: device.geometry.height }
      });
      const page = await context.newPage();
      
      await page.setContent(htmlContent);
      const outPath = path.join(outputDir, `composed_screen_${i + 1}.png`);
      await page.screenshot({ path: outPath, type: "png" });
      await browser.close();

      outputs.push(outPath);
      console.log(`Rendered composed store screenshot: ${outPath}`);
    }

    return outputs;
  }
}
