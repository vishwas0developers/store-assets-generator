import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getUniversalPlayerScriptAndStyle } from './player-helper.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../..');

const BACKGROUNDS = {
  ocean: "linear-gradient(135deg,#0f2027 0%,#203a43 50%,#2c5364 100%)",
  royal: "linear-gradient(135deg,#1e3c72 0%,#2a5298 100%)",
  sunset: "linear-gradient(135deg,#ff512f 0%,#dd2476 100%)",
  mint: "linear-gradient(135deg,#134e5e 0%,#71b280 100%)",
  graphite: "linear-gradient(135deg,#232526 0%,#414345 100%)",
  light: "linear-gradient(135deg,#f8fafc 0%,#e2e8f0 100%)",
  candy: "linear-gradient(135deg,#ee9ca7 0%,#ffdde1 100%)",
  aurora: "linear-gradient(135deg,#00c6ff 0%,#0072ff 100%)",
  citrus: "linear-gradient(135deg,#f7971e 0%,#ffd200 100%)",
  violet: "linear-gradient(135deg,#654ea3 0%,#eaafc8 100%)",
  "solid-navy": "linear-gradient(135deg,#0f172a 0%,#1e293b 100%)",
  "solid-charcoal": "linear-gradient(135deg,#0f0f10 0%,#1f1f23 100%)",
  "solid-cream": "linear-gradient(135deg,#fafaf9 0%,#f5f5f4 100%)"
};

async function main() {
  console.log("Rebuilding all 10 default templates, device shell sourced from the Device Management registry...");

  const tempOrigModule = await import('../../dist/src/video/temp_orig_templates.js');
  const originalTemplates = tempOrigModule.VIDEO_TEMPLATES;
  const { DEVICE_REGISTRY } = await import('../../dist/src/devices/registry.js');
  const outBaseDir = path.join(rootDir, 'templates', 'video');

  for (const t of originalTemplates) {
    const tplDir = path.join(outBaseDir, t.id);
    fs.mkdirSync(tplDir, { recursive: true });

    const isLandscape = t.aspectRatio === "16:9";
    const width = isLandscape ? 1920 : 1080;
    const height = isLandscape ? 1080 : 1920;

    // Device shell now comes from the central registry (src/devices/registry.ts)
    // via {{DEVICE_ID}}/{{DEVICE_W}}/{{DEVICE_H}} placeholders substituted by
    // composeStandaloneHtml() at render time -- see
    // src/render/shared.ts::deviceShellMarkup and src/render/three-bridge.ts's
    // shell-only mode. No per-template device-shape guessing here any more;
    // this generator only fails loudly if `t.device` isn't a real registered
    // device instead of silently falling back to a generic/wrong shape.
    if (!DEVICE_REGISTRY[t.device]) {
      throw new Error(`Template "${t.id}" declares device "${t.device}", which is not in config/devices.json. Add it to the registry before regenerating.`);
    }

    let htmlScenes = "";
    t.scenes.forEach((s, idx) => {
      const bgStyle = BACKGROUNDS[s.background] || BACKGROUNDS.ocean;
      const isStackedBottom = s.layout === "stacked-bottom";
      const isCopyRight = s.layout === "copy-right";
      const isFullBleed = s.layout === "full-bleed";
      const isCentreFlank = s.layout === "centre-flank";

      // Layout specific classing and alignments
      let contentStyle = "display: flex; width: 100%; height: 100%; align-items: center; justify-content: space-between;";
      let copyColStyle = "flex: 1.1; max-width: 800px; display: flex; flex-direction: column; justify-content: center; z-index: 5;";
      let deviceColStyle = "flex: 0.9; display: flex; align-items: center; justify-content: center; height: 100%; z-index: 4;";

      let viewportExtraStyle = "transform-origin: center center;";
      if (isLandscape) {
        if (isCopyRight) {
          contentStyle += " flex-direction: row-reverse;";
        }
        if (isCentreFlank) {
          contentStyle = "display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; width: 100%; height: 100%;";
          copyColStyle = "max-width: 1000px; margin-bottom: 40px; z-index: 5; text-align: center; align-items: center;";
          deviceColStyle = "display: flex; align-items: center; justify-content: center; z-index: 4;";
        }
      } else {
        if (idx === 9) {
          // Revert Scene 10 portrait to original full-bleed center zoom
          contentStyle = "display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; width: 100%; height: 100%;";
          copyColStyle = "display: none !important;";
          deviceColStyle = "display: flex; align-items: center; justify-content: center; z-index: 4;";
          viewportExtraStyle = "transform-origin: center center;";
        } else {
          // Portrait scenes 1-9: absolute positioning to prevent overlap
          contentStyle = "position: relative; width: 100%; height: 100%;";
          copyColStyle = "position: absolute; top: 120px; left: 50%; transform: translateX(-50%); width: 90%; max-width: 960px; z-index: 5; text-align: center; display: flex; flex-direction: column; align-items: center;";
          deviceColStyle = "position: absolute; top: 620px; left: 50%; transform: translateX(-50%); display: flex; align-items: center; justify-content: center; z-index: 4;";
          viewportExtraStyle = "transform-origin: top center;";
        }
      }

      // Handle screenshots / image sequence slots
      let screenHtml = "";
      if (s.screenCount === 2) {
        screenHtml = `
          <div class="phone-face front shell-migrated">
            <div class="gloss-sheen"></div>
            <div class="screen-edge-glare left-edge"></div>
            <div class="screen-edge-glare right-edge"></div>
            <div class="curved-edge-shadow left"></div>
            <div class="curved-edge-shadow right"></div>
            <div class="screen-scroll-wrap">
              <img class="phone-screen active" id="slot-${idx}-0" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" alt="Screen A" />
              <img class="phone-screen" id="slot-${idx}-1" style="opacity: 0;" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" alt="Screen B" />
            </div>
          </div>
        `;
      } else {
        screenHtml = `
          <div class="phone-face front shell-migrated">
            <div class="gloss-sheen"></div>
            <div class="screen-edge-glare left-edge"></div>
            <div class="screen-edge-glare right-edge"></div>
            <div class="curved-edge-shadow left"></div>
            <div class="curved-edge-shadow right"></div>
            <div class="screen-scroll-wrap">
              <img class="phone-screen" id="slot-${idx}" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" alt="Screen" />
            </div>
          </div>
        `;
      }

      // Title/subtext coloring
      const isLightBg = ["light", "candy", "citrus", "solid-cream"].includes(s.background);
      const titleColor = isLightBg ? "#0f172a" : "#ffffff";
      const subColor = isLightBg ? "#475569" : "rgba(255,255,255,0.8)";
      const textShadow = isLightBg ? "none" : "0 4px 12px rgba(0,0,0,0.3)";

      const flowLabels = (s.flowSteps || []).map((step, stepIdx) => {
        const side = step.side || 'left';
        const yPct = 28 + Math.floor(stepIdx / 2) * 22;
        // Bracket ( ) shape: top/bottom cards push outward, center card pushes inward
        const row = Math.floor(stepIdx / 2); // 0=top, 1=center, 2=bottom
        const bracketOuter = row === 1 ? '12%' : '5%'; // center = inner (more %), top/bottom = outer
        const posStyle = side === 'left' ? `left:${bracketOuter};` : `right:${bracketOuter};`;
        return `
          <div class="flow-label" id="flow-label-${idx}-${stepIdx}" style="opacity:0; top:${yPct}%; ${posStyle}">
            <span>${step.label}</span>
          </div>
        `;
      }).join("\n");

      htmlScenes += `
    <!-- Scene ${idx + 1}: ${s.label} -->
    <div class="scene" id="scene-${idx}">
      <div class="backdrop" style="background: ${bgStyle};"></div>
      <div class="vignette"></div>
      
      <div class="scene-content" style="${contentStyle}">
        <!-- Copy block (Permanently hidden in Scene 10) -->
        ${s.text ? `
        <div class="copy-col" style="${copyColStyle} ${idx === 9 ? 'display: none !important;' : ''}">
          <h2 class="title-black" id="s${idx}-text" style="color: ${titleColor}; text-shadow: ${textShadow}; opacity: 0;">${s.text}</h2>
          ${s.subtext ? `<p class="subtitle-grey" id="s${idx}-subtext" style="color: ${subColor}; opacity: 0; margin-top: 16px;">${s.subtext}</p>` : ""}
        </div>
        ` : ""}

        <!-- Device viewport -->
        <div class="device-col" style="${deviceColStyle}">
          <div class="phone-3d-viewport" id="viewport-${idx}" style="${viewportExtraStyle}">
            <div class="phone-3d-scaler" id="scaler-${idx}">
              <div class="phone-3d-rig shell-migrated" id="phone-rig-${idx}">
                <canvas class="device-shell-canvas" data-device-id="{{DEVICE_ID}}" data-shell-only="1" width="{{DEVICE_W}}" height="{{DEVICE_H}}" style="position:absolute;inset:0;width:100%;height:100%;z-index:1;"></canvas>
                ${screenHtml}
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <!-- Flow Walkthrough Labels -->
      ${flowLabels}
    </div>
      `;
    });

    const playerComponents = getUniversalPlayerScriptAndStyle(t);

    const templateHtml = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${t.name}</title>
  <style>
    html, body { margin:0; padding:0; overflow:hidden; width:${width}px; height:${height}px; background:#000; }
    
    .canvas {
      position: relative;
      width: ${width}px;
      height: ${height}px;
      overflow: hidden;
      font-family: "Segoe UI", Roboto, -apple-system, sans-serif;
    }

    .scene {
      position: absolute;
      inset: 0;
      width: ${width}px;
      height: ${height}px;
      display: none;
      align-items: center;
      justify-content: center;
      box-sizing: border-box;
      padding: 0 ${isLandscape ? '10%' : '6%'};
    }

    .scene.active, .scene.playing {
      display: flex;
    }

    .backdrop {
      position: absolute;
      inset: 0;
      z-index: 0;
    }

    .vignette {
      position: absolute;
      inset: 0;
      background: radial-gradient(circle at 50% 50%, rgba(0,0,0,0) 30%, rgba(0,0,0,0.3) 100%);
      z-index: 1;
      pointer-events: none;
    }

    /* 3D phone layout and viewport */
    .phone-3d-viewport {
      perspective: 1600px;
      width: 600px;
      height: 900px;
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
      z-index: 2;
      transform-origin: ${isLandscape ? 'center center' : 'top center'};
    }

    .phone-3d-viewport::after {
      content: '';
      position: absolute;
      bottom: 50px;
      left: 50%;
      width: 280px;
      height: 24px;
      background: radial-gradient(ellipse at center, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0) 70%);
      transform: translateX(-50%);
      z-index: 1;
      pointer-events: none;
    }

    .phone-3d-scaler {
      transform-style: preserve-3d;
      transform: scale(${isLandscape ? '0.9' : '1.52'});
      z-index: 2;
    }

    .phone-3d-rig {
      position: relative;
      width: 370px;
      height: 800px;
      transform-style: preserve-3d;
      border-radius: 52px;
      box-shadow:
        0 0 0 2px #22252c,
        0 0 0 3.5px rgba(255,255,255,0.12),
        0 20px 60px rgba(0,0,0,0.4);
    }

    /* Protruding side rails buttons */
    .phone-3d-rig::before, .phone-3d-rig::after {
      content: '';
      position: absolute;
      background: #1c1d22;
      z-index: 9;
      border-radius: 3px;
    }
    .phone-3d-rig::before {
      left: -3px;
      top: 150px;
      width: 4px;
      height: 80px;
    }
    .phone-3d-rig::after {
      right: -3px;
      top: 170px;
      width: 4px;
      height: 55px;
    }

    /* Device shell now comes from a real GLB rendered by
       src/render/three-bridge.ts's shell-only mode (see the
       <canvas class="device-shell-canvas"> inserted per scene below) --
       these rules neutralize the old flat-CSS chrome so the canvas shows
       through cleanly instead of fighting a hardcoded background/rails. */
    .phone-3d-rig.shell-migrated { background: transparent; box-shadow: 0 20px 60px rgba(0,0,0,0.4); }
    .phone-3d-rig.shell-migrated::before, .phone-3d-rig.shell-migrated::after { display: none; }
    .phone-face.front.shell-migrated { background: transparent; }
    .device-shell-canvas { pointer-events: none; }

    .phone-face.front {
      position: absolute;
      inset: 0;
      border-radius: 52px;
      z-index: 10;
      overflow: hidden;
      padding: 9px;
      background: #08080a;
    }

    .screen-scroll-wrap {
      width: 100%;
      height: 100%;
      border-radius: 43px;
      overflow: hidden;
      position: relative;
      background: #08080a;
    }

    .phone-screen {
      width: 100%;
      height: 100%;
      position: absolute;
      top: 0;
      left: 0;
      display: block;
      object-fit: cover;
    }

    .gloss-sheen {
      position: absolute;
      inset: 0;
      background: linear-gradient(135deg, rgba(255,255,255,0.16) 0%, rgba(255,255,255,0.01) 40%, rgba(255,255,255,0.05) 100%);
      z-index: 11;
      pointer-events: none;
      border-radius: 43px;
    }

    .screen-edge-glare {
      position: absolute;
      top: 0;
      bottom: 0;
      width: 8px;
      background: linear-gradient(to right, rgba(255,255,255,0.1), transparent);
      z-index: 12;
      pointer-events: none;
    }
    .screen-edge-glare.left-edge { left: 0; }
    .screen-edge-glare.right-edge { right: 0; transform: scaleX(-1); }

    .curved-edge-shadow {
      position: absolute;
      top: 0;
      bottom: 0;
      width: 16px;
      z-index: 13;
      pointer-events: none;
    }
    .curved-edge-shadow.left {
      left: 0;
      background: linear-gradient(to right, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.15) 60%, transparent 100%);
    }
    .curved-edge-shadow.right {
      right: 0;
      background: linear-gradient(to left, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.15) 60%, transparent 100%);
    }

    /* Typography styles - Enlarged for 9:16 and layered with GPU will-change */
    .title-black {
      font-size: ${isLandscape ? '56px' : '80px'};
      font-weight: 800;
      line-height: ${isLandscape ? '1.18' : '1.15'};
      margin: 0;
      letter-spacing: ${isLandscape ? '-1.5px' : '-2px'};
      will-change: transform, opacity;
      backface-visibility: hidden;
      -webkit-backface-visibility: hidden;
    }

    .subtitle-grey {
      font-size: ${isLandscape ? '24px' : '36px'};
      font-weight: 500;
      line-height: ${isLandscape ? '1.4' : '1.35'};
      margin: 0;
      will-change: transform, opacity;
      backface-visibility: hidden;
      -webkit-backface-visibility: hidden;
    }

    /* Walkthrough flow labels style */
    .flow-label {
      position: absolute;
      z-index: 20;
      padding: 16px 36px;
      background: rgba(18, 20, 26, 0.82);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border: 1px solid rgba(255, 255, 255, 0.22);
      border-radius: 999px;
      color: #ffffff;
      font-size: 26px;
      font-weight: 700;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 0 20px rgba(255,255,255,0.18), inset 0 1px 2px rgba(255,255,255,0.4);
      transform: translateY(-50%);
      pointer-events: none;
    }
    /* Bracket positions are set per-card via inline style in JS */
    .flow-label-left {
      left: 5%;
    }
    .flow-label-right {
      right: 5%;
    }

    ${playerComponents.style}
  </style>
</head>
<body>
  <div class="canvas">
    ${htmlScenes}
  </div>

  ${playerComponents.html}

  <script type="application/json" id="template-config">
${JSON.stringify(t, null, 2)}
  </script>

  <script>
    // Progressive, jitter-free transformation engine
    window.__customSceneTransform = function(sceneIdx, progress, globalTimeMs) {
      // Easing helper
      function easeOutCubic(x) {
        return 1 - Math.pow(1 - x, 3);
      }

      function easeWindow(p, win) {
        const t = Math.min(1, Math.max(0, p / win));
        return 1 - Math.pow(1 - t, 3);
      }

      // Smooth transform interpolation
      function applyRigTransform(rig, viewport, text, subtext, config) {
        const ease = easeOutCubic(progress);
        
        // 3D phone transforms
        if (rig) {
          const yaw = config.startYaw + (config.endYaw - config.startYaw) * ease;
          const pitch = config.startPitch + (config.endPitch - config.startPitch) * ease;
          const tx = config.startX + (config.endX - config.startX) * ease;
          const ty = config.startY + (config.endY - config.startY) * ease;
          
          // Apply gentle ambient drift once entered
          const driftSpeed = 0.001;
          const driftYaw = Math.sin(globalTimeMs * driftSpeed) * 2.2 * ease;
          const driftPitch = Math.cos(globalTimeMs * driftSpeed * 1.2) * 1.4 * ease;
          const driftX = Math.sin(globalTimeMs * driftSpeed * 0.9) * 6 * ease;
          const driftY = Math.cos(globalTimeMs * driftSpeed * 1.1) * 6 * ease;

          rig.style.transform = "rotateY(" + (yaw + driftYaw) + "deg) rotateX(" + (pitch + driftPitch) + "deg)";
          
          if (viewport) {
            const vScale = config.startScale + (config.endScale - config.startScale) * ease;
            const vX = tx + driftX;
            const vY = ty + driftY;
            viewport.style.transform = "translate(" + vX + "px, " + vY + "px) scale(" + vScale + ")";
          }
        }

        // Text reveal animations (fade & translate3d for subpixel smoothing)
        if (text) {
          const tEase = easeWindow(progress, 0.6);
          text.style.opacity = tEase;
          text.style.transform = "translate3d(0, " + (25 * (1 - tEase)) + "px, 0)";
        }
        if (subtext) {
          const subProgress = Math.max(0, (progress - 0.12) / 0.88);
          const tSubEase = easeWindow(subProgress, 0.6);
          subtext.style.opacity = tSubEase;
          subtext.style.transform = "translate3d(0, " + (20 * (1 - tSubEase)) + "px, 0)";
        }
      }

      const viewport = document.getElementById("viewport-" + sceneIdx);
      const scaler = document.getElementById("scaler-" + sceneIdx);
      const rig = document.getElementById("phone-rig-" + sceneIdx);
      const text = document.getElementById("s" + sceneIdx + "-text");
      const subtext = document.getElementById("s" + sceneIdx + "-subtext");

      // Default animation properties
      // Portrait endScale is larger to fill canvas height (~82% coverage)
      let animConfig = {
        startYaw: -18, endYaw: 0,
        startPitch: 4, endPitch: 0,
        startX: 0, endX: 0,
        startY: 280, endY: 0,
        startScale: ${isLandscape ? '0.84' : '1.26'}, endScale: ${isLandscape ? '1.0' : '1.58'}
      };

      if (sceneIdx === 0) { // Scene 1: Hero Rise
        animConfig = {
          startYaw: -15, endYaw: 5,
          startPitch: 5, endPitch: 0,
          startX: 0, endX: 0,
          startY: 400, endY: 0,
          startScale: ${isLandscape ? '0.85' : '1.26'}, endScale: ${isLandscape ? '1.02' : '1.58'}
        };
      }
      else if (sceneIdx === 1) { // Scene 2: 3D Tilt
        animConfig = {
          startYaw: -35, endYaw: -8,
          startPitch: 8, endPitch: 0,
          startX: ${isLandscape ? '300' : '0'}, endX: 0,
          startY: ${isLandscape ? '0' : '200'}, endY: 0,
          startScale: ${isLandscape ? '0.88' : '1.26'}, endScale: ${isLandscape ? '1.05' : '1.58'}
        };
      }
      else if (sceneIdx === 2) { // Scene 3: Feature Breakdown (2 screenshots crossfade)
        animConfig = {
          startYaw: 25, endYaw: 0,
          startPitch: 0, endPitch: 0,
          startX: 0, endX: 0,
          startY: 200, endY: 0,
          startScale: ${isLandscape ? '0.86' : '1.26'}, endScale: ${isLandscape ? '1.0' : '1.58'}
        };
        // Crossfade screenshots inside the screen wrap
        const imgA = document.getElementById("slot-2-0") || document.getElementById("slot-1-0");
        const imgB = document.getElementById("slot-2-1") || document.getElementById("slot-1-1");
        if (imgA && imgB) {
          const fadeStart = 0.35;
          const fadeDur = 0.25;
          const tFade = Math.min(1, Math.max(0, (progress - fadeStart) / fadeDur));
          imgA.style.opacity = 1 - tFade;
          imgB.style.opacity = tFade;
        }
      }
      else if (sceneIdx === 3) { // Scene 4: Zoom Focus
        animConfig = {
          startYaw: -12, endYaw: 6,
          startPitch: 4, endPitch: 0,
          startX: 0, endX: 0,
          startY: 0, endY: 0,
          startScale: ${isLandscape ? '0.78' : '1.26'}, endScale: ${isLandscape ? '1.06' : '1.58'}
        };
        // For landscape multiple screen crossfade if scene index 3
        const imgA = document.getElementById("slot-3-0");
        const imgB = document.getElementById("slot-3-1");
        if (imgA && imgB) {
          const fadeStart = 0.35;
          const fadeDur = 0.25;
          const tFade = Math.min(1, Math.max(0, (progress - fadeStart) / fadeDur));
          imgA.style.opacity = 1 - tFade;
          imgB.style.opacity = tFade;
        }
      }
      else if (sceneIdx === 4) { // Scene 5: Parallax stack
        animConfig = {
          startYaw: -22, endYaw: -5,
          startPitch: 0, endPitch: 0,
          startX: -150, endX: 0,
          startY: 0, endY: 0,
          startScale: ${isLandscape ? '0.88' : '1.26'}, endScale: ${isLandscape ? '1.02' : '1.58'}
        };
      }
      else if (sceneIdx === 5) { // Scene 6: Kinetic Type
        animConfig = {
          startYaw: 0, endYaw: 0,
          startPitch: 0, endPitch: 0,
          startX: 0, endX: 0,
          startY: 180, endY: 0,
          startScale: ${isLandscape ? '0.9' : '1.26'}, endScale: ${isLandscape ? '1.03' : '1.58'}
        };
      }
      else if (sceneIdx === 6) { // Scene 7: Zoom Focus (Security scene)
        animConfig = {
          startYaw: 15, endYaw: -12,
          startPitch: 4, endPitch: 0,
          startX: 0, endX: 0,
          startY: 0, endY: 0,
          startScale: ${isLandscape ? '0.82' : '1.26'}, endScale: ${isLandscape ? '1.08' : '1.58'}
        };
      }
      else if (sceneIdx === 7) { // Scene 8: Seamless Collaboration
        animConfig = {
          startYaw: -18, endYaw: 8,
          startPitch: 0, endPitch: 0,
          startX: 120, endX: 0,
          startY: 0, endY: 0,
          startScale: ${isLandscape ? '0.88' : '1.26'}, endScale: ${isLandscape ? '1.02' : '1.58'}
        };
      }
      else if (sceneIdx === 8) { // Scene 9: Ecosystem & Benefits
        animConfig = {
          startYaw: 0, endYaw: 0,
          startPitch: 0, endPitch: 0,
          startX: 0, endX: 0,
          startY: ${isLandscape ? '-200' : '-80'}, endY: 0,
          startScale: ${isLandscape ? '0.88' : '1.26'}, endScale: ${isLandscape ? '1.02' : '1.58'}
        };
      }
      else if (sceneIdx === 9) { // Scene 10: App Flow outro spin + merge / pill-flank
        // Landscape: cap at 1.5 so phone touches top/bottom edges exactly (1080 / (800*0.9) = 1.5)
        // Portrait: 2.45 drives the full-bleed zoom
        const finalScale = ${isLandscape ? 1.5 : 2.45};
        animConfig = {
          startYaw: -360, endYaw: 0,
          startPitch: 0, endPitch: 0,
          startX: 0, endX: 0,
          startY: 0, endY: 0,
          startScale: 0.85, endScale: finalScale
        };

        // For landscape flow, reveal flanking walkthrough labels dynamically
        if (${isLandscape}) {
          const lCount = 6;
          for (let stepIdx = 0; stepIdx < lCount; stepIdx++) {
            const label = document.getElementById("flow-label-9-" + stepIdx);
            if (label) {
              const startProgress = 0.15 + stepIdx * 0.08;
              const stepProgress = Math.min(1, Math.max(0, (progress - startProgress) / 0.15));
              const stepEase = easeOutCubic(stepProgress);
              label.style.opacity = stepProgress;
              const xOffset = (stepIdx % 2 === 0 ? -40 : 40) * (1 - stepEase);
              label.style.transform = "translateY(-50%) translateX(" + xOffset + "px)";
            }
          }
        }
      }

      applyRigTransform(rig, scaler, text, subtext, animConfig);
    };
  </script>

  ${playerComponents.script}
</body>
</html>`;

    fs.writeFileSync(path.join(tplDir, 'template.html'), templateHtml);
    console.log(`[OK] Recreated authentic original template: ${t.id} (${t.aspectRatio}, ${t.device})`);
  }

  console.log("All 10 default templates successfully generated!");
}

main().catch(err => {
  console.error("Error generating templates:", err);
  process.exit(1);
});
