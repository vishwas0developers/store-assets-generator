import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getUniversalPlayerScriptAndStyle } from './player-helper.mjs';
// Shared with the studio renderer (src/video/slots.ts) so re-generating this
// QR at edit time and at build time produces the same SVG. Requires `npm run
// build` (or `npx tsc`) to have populated dist/ first.
import { generateQRCodeSVG } from '../../dist/src/video/slots.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../..');

// Recognizable monochrome platform glyphs (vector, no external asset uploads)
const PLATFORM_ICONS = {
  android: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="#8b85f8"><path d="M17.6 9.48l1.84-3.18a.6.6 0 10-1.04-.6l-1.87 3.23a10.6 10.6 0 00-8.06 0L6.6 5.7a.6.6 0 10-1.04.6l1.84 3.18C4.7 11.2 2.7 14.14 2.4 17.6h19.2c-.3-3.46-2.3-6.4-5.98-8.12zM8 15a1.2 1.2 0 110-2.4A1.2 1.2 0 018 15zm8 0a1.2 1.2 0 110-2.4A1.2 1.2 0 0116 15z"/></svg>`,
  apple: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="#ffffff"><path d="M16.7 12.7c0-2.2 1.8-3.3 1.9-3.4-1-1.5-2.6-1.7-3.2-1.7-1.4-.1-2.7.8-3.4.8-.7 0-1.8-.8-3-.8-1.5 0-3 .9-3.8 2.3-1.6 2.8-.4 7 1.2 9.3.8 1.1 1.7 2.4 3 2.3 1.2 0 1.6-.8 3-.8s1.8.8 3 .8c1.3 0 2.1-1.1 2.9-2.3.9-1.3 1.3-2.6 1.3-2.7-.1 0-2.5-1-2.5-3.8zM14.2 5.9c.6-.8 1.1-1.9.9-3-1 .1-2.1.6-2.8 1.4-.6.7-1.2 1.9-1 2.9 1.1.1 2.2-.5 2.9-1.3z"/></svg>`,
  windows: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="#eab308"><path d="M3 5.6L10.4 4.5V11.4H3V5.6zM11.3 4.4L21 3V11.3H11.3V4.4zM3 12.4H10.4V19.4L3 18.3V12.4zM11.3 12.4H21V20.9L11.3 19.5V12.4z"/></svg>`
};

export function create62155880Template() {
  const config = {
    id: "tpl-62155880-delivery-trio-showcase",
    name: "Delivery App Trio — 62155880 Reference",
    description: "Premium dark-mode delivery logistics showcase with a tap-to-open opener, stepped 3D phone lineup, floor reflections, and a dynamic multi-platform QR outro.",
    useCase: "Best for premium delivery / logistics SaaS promotion.",
    designStyle: "Trio Showcase",
    aspectRatio: "16:9",
    features: [
      "Tap-gesture opener with gradient reveal",
      "True 3D phone chassis with side rails and Dynamic Island",
      "Stepped trio fan lineup with floor reflections",
      "Dynamic multi-platform QR code outro"
    ],
    device: "apple-iphone-15-pro",
    variant: "delivery-trio",
    deviceFraction: 0.6,
    scenes: [
      {
        label: "Scene 1: Opener",
        sceneTemplate: "hero-rise",
        durationSeconds: 2.5,
        background: "gradient-opener",
        rotate: 0, zoom: 1, move: 0,
        depth: "opener", layout: "logo-tap",
        text: "Personal Delivery",
        subtext: "",
        slots: { text: "s0-text", logo: "slot-logo" }
      },
      {
        label: "Scene 2: Meet Personal Delivery",
        sceneTemplate: "hero-rise",
        durationSeconds: 3.2,
        background: "royal",
        rotate: 0, zoom: 1, move: 0,
        depth: "showcase", layout: "copy-right",
        text: "Meet <span>Personal</span> Delivery",
        subtext: "Track, schedule, and manage every package from one clean, modern app.",
        slots: { text: "s1-text", subtext: "s1-subtext", screenshot: "slot-0" }
      },
      {
        label: "Scene 3: Trio Fan Lineup",
        sceneTemplate: "hero-rise",
        durationSeconds: 3.6,
        background: "royal",
        rotate: 0, zoom: 1, move: 0,
        depth: "showcase", layout: "trio-center",
        text: "One App. <span>Every</span> Delivery.",
        subtext: "",
        slots: { text: "s2-text", screenshots: ["slot-1", "slot-2", "slot-3"] }
      },
      {
        label: "Scene 4: Outro CTA",
        sceneTemplate: "studio-outro",
        durationSeconds: 3.2,
        background: "royal",
        rotate: 0, zoom: 1, move: 0,
        depth: "outro", layout: "outro-platforms",
        text: "Get <span>Personal</span> Delivery",
        subtext: "",
        slots: { text: "s3-text", logo: "slot-logo-outro" },
        platforms: [
          { name: "Android", icon: "android", url: "https://play.google.com/store/apps/details?id=com.personaldelivery.app" },
          { name: "iOS", icon: "apple", url: "https://apps.apple.com/app/personal-delivery/id987654321" },
          { name: "Windows", icon: "windows", url: "https://personaldelivery.app/download/windows" }
        ]
      }
    ]
  };

  const templateHtml = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${config.name}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700;800&display=swap" rel="stylesheet">
  <style>
    html, body { margin:0; padding:0; width:1920px; height:1080px; overflow:hidden; background:#0d0d11; font-family:'Inter',sans-serif; color:#ffffff; }
    .canvas { position:relative; width:1920px; height:1080px; background:radial-gradient(circle at 60% 30%, #1c1c2b 0%, #07070a 100%); overflow:hidden; }
    .floor-reflection-plane { position:absolute; left:0; bottom:0; width:1920px; height:380px; background:linear-gradient(to bottom, transparent, rgba(13, 13, 17, 0.95)), radial-gradient(ellipse at center bottom, rgba(124, 119, 235, 0.12) 0%, transparent 70%); z-index:1; pointer-events:none; }

    .scene { position:absolute; inset:0; width:1920px; height:1080px; display:none; align-items:center; justify-content:center; z-index:3; padding:0 10%; box-sizing:border-box; }
    .scene.active, .scene.playing { display:flex; }
    .scene-content { display:flex; width:100%; height:100%; align-items:center; justify-content:space-between; position:relative; }

    /* Scene 1: gradient opener background (blue -> cyan-white) */
    #scene-0 { background: linear-gradient(160deg, #1c4fd6 0%, #2f8fe0 45%, #eafcff 100%); }

    .copy-col { flex:1; max-width:680px; display:flex; flex-direction:column; justify-content:center; z-index:5; }
    .copy-col.right-side { text-align:right; align-items:flex-end; }
    .copy-col.centered { text-align:center; align-items:center; max-width:1100px; margin:0 auto; }
    .title-highlight { font-size:68px; font-weight:800; line-height:1.1; letter-spacing:-1.5px; margin:0 0 24px 0; color:#ffffff; }
    .title-highlight span { color:#8b85f8; text-shadow:0 0 20px rgba(139, 133, 248, 0.35); }
    .subtitle { font-size:24px; font-weight:400; line-height:1.6; color:#a0a0bd; margin:0; }

    /* "Get Started" pill CTA (Scene 2) */
    .get-started-pill {
      margin-top: 36px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background: #eab308;
      color: #1c1c2b;
      font-size: 20px;
      font-weight: 700;
      letter-spacing: 0.5px;
      padding: 18px 44px;
      border-radius: 32px;
      box-shadow: 0 12px 30px rgba(234, 179, 8, 0.3);
      width: fit-content;
    }

    .device-col { flex:1.1; display:flex; align-items:center; justify-content:center; height:100%; z-index:4; position:relative; transform-style:preserve-3d; perspective:1500px; }
    .device-col.trio { flex:1.4; }

    .phone-3d-rig { position:absolute; top:50%; left:50%; margin-top:-350px; margin-left:-170px; width:340px; height:700px; transform-style:preserve-3d; }
    .phone-face { position:absolute; inset:0; border-radius:46px; box-sizing:border-box; }
    .phone-face.front { background:#000000; transform:translateZ(8px); z-index:10; border:5px solid #1a1a22; overflow:hidden; }
    .dynamic-island { position:absolute; top:15px; left:50%; transform:translateX(-50%); width:90px; height:26px; background:#000000; border-radius:13px; z-index:12; border:1px solid #222; }
    .phone-screen { width:100%; height:100%; object-fit:cover; border-radius:41px; }
    .reflection-screen { position:absolute; top:50%; left:50%; margin-top:-350px; margin-left:-170px; width:340px; height:700px; border-radius:46px; transform-origin:center bottom; transform:scaleY(-1) translateY(6px); opacity:0.16; filter:blur(4px); pointer-events:none; z-index:1; }
    .phone-side { position:absolute; background:linear-gradient(to bottom, #2c2c38, #181820, #2c2c38); border:1px solid #101015; }
    .side-left { width:16px; height:700px; left:-8px; top:0; transform-origin: left center; transform:rotateY(90deg); }
    .side-right { width:16px; height:700px; right:-8px; top:0; transform-origin: right center; transform:rotateY(-90deg); }
    .side-top { width:340px; height:16px; left:0; top:-8px; transform-origin: center top; transform:rotateX(90deg); }
    .side-bottom { width:340px; height:16px; left:0; bottom:-8px; transform-origin: center bottom; transform:rotateX(-90deg); }

    /* Scene 1: squircle location-pin logo + tap ripple */
    .logo-squircle-pin {
      width: 180px;
      height: 180px;
      background: rgba(255,255,255,0.9);
      border-radius: 44px;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 24px 60px rgba(0,0,0,0.18);
      margin-bottom: 32px;
      position: relative;
    }
    .tap-ripple {
      position: absolute;
      width: 180px;
      height: 180px;
      border-radius: 44px;
      border: 3px solid rgba(255,255,255,0.9);
      pointer-events: none;
    }
    #scene-0 .title-highlight { color: #ffffff; text-shadow: 0 2px 12px rgba(0,0,0,0.25); }

    /* Scene 4: platform download grid with live QR codes */
    .platform-grid { display:flex; gap:22px; margin-top:40px; }
    .platform-card {
      display:flex; flex-direction:column; align-items:center;
      background: rgba(255,255,255,0.06);
      border: 1px solid rgba(255,255,255,0.14);
      border-radius: 20px;
      padding: 18px 22px;
      backdrop-filter: blur(10px);
    }
    .platform-card .qr-wrap { width:96px; height:96px; margin-bottom:12px; border-radius: 8px; overflow: hidden; }
    .platform-card .qr-wrap svg { width:100%; height:100%; display:block; }
    .platform-name-row { display:flex; align-items:center; gap:6px; }
    .platform-name { font-size:14px; font-weight:600; color:#ffffff; }

    ${getUniversalPlayerScriptAndStyle(config).style}
  </style>
</head>
<body>
  <div class="canvas">
    <div class="floor-reflection-plane"></div>

    <!-- Scene 1: Opener -->
    <div class="scene" id="scene-0">
      <div class="scene-content" style="justify-content:center; flex-direction:column; align-items:center; text-align:center;">
        <div class="logo-squircle-pin" id="s0-logo">
          <div class="tap-ripple" id="s0-ripple"></div>
          <svg width="84" height="84" viewBox="0 0 24 24">
            <defs>
              <linearGradient id="pinGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="#f59e0b"/>
                <stop offset="100%" stop-color="#ef4444"/>
              </linearGradient>
            </defs>
            <path fill="url(#pinGrad)" d="M12 2C7.6 2 4 5.6 4 10c0 6.2 8 12 8 12s8-5.8 8-12c0-4.4-3.6-8-8-8zm0 11a3 3 0 110-6 3 3 0 010 6z"/>
          </svg>
        </div>
        <div class="copy-col centered">
          <h1 class="title-highlight" id="s0-text">Personal Delivery</h1>
        </div>
      </div>
    </div>

    <!-- Scene 2: Meet Personal Delivery -->
    <div class="scene" id="scene-1">
      <div class="scene-content">
        <div class="device-col">
          <div class="phone-3d-rig" id="phone-rig-1">
            <div class="phone-face front">
              <div class="dynamic-island"></div>
              <img class="phone-screen" id="slot-0" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" alt="Screen 1" />
            </div>
            <div class="phone-side side-left"></div>
            <div class="phone-side side-right"></div>
            <div class="phone-side side-top"></div>
            <div class="phone-side side-bottom"></div>
          </div>
          <img class="reflection-screen" id="refl-slot-0" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" />
        </div>
        <div class="copy-col">
          <h2 class="title-highlight" id="s1-text">Meet <span>Personal</span> Delivery</h2>
          <p class="subtitle" id="s1-subtext">Track, schedule, and manage every package from one clean, modern app.</p>
          <div class="get-started-pill">GET STARTED</div>
        </div>
      </div>
    </div>

    <!-- Scene 3: Trio Fan Lineup -->
    <div class="scene" id="scene-2">
      <div class="scene-content" style="flex-direction:column; justify-content:center; gap:24px; text-align:center; align-items:center;">
        <div class="copy-col centered" style="margin-bottom: 8px;">
          <h2 class="title-highlight" id="s2-text">One App. <span>Every</span> Delivery.</h2>
        </div>
        <div class="device-col trio" style="height:640px;">
          <div class="phone-3d-rig" id="phone-rig-2a" style="transform: translateX(-300px) translateZ(-70px) scale(0.82) rotateY(15deg);">
            <div class="phone-face front">
              <div class="dynamic-island"></div>
              <img class="phone-screen" id="slot-1" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" alt="Screen 2" />
            </div>
            <div class="phone-side side-left"></div>
            <div class="phone-side side-right"></div>
            <div class="phone-side side-top"></div>
            <div class="phone-side side-bottom"></div>
          </div>
          <div class="phone-3d-rig" id="phone-rig-2b" style="transform: translateX(0px) translateZ(30px) scale(1) rotateY(0deg);">
            <div class="phone-face front">
              <div class="dynamic-island"></div>
              <img class="phone-screen" id="slot-2" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" alt="Screen 3" />
            </div>
            <div class="phone-side side-left"></div>
            <div class="phone-side side-right"></div>
            <div class="phone-side side-top"></div>
            <div class="phone-side side-bottom"></div>
          </div>
          <div class="phone-3d-rig" id="phone-rig-2c" style="transform: translateX(300px) translateZ(-70px) scale(0.82) rotateY(-15deg);">
            <div class="phone-face front">
              <div class="dynamic-island"></div>
              <img class="phone-screen" id="slot-3" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" alt="Screen 4" />
            </div>
            <div class="phone-side side-left"></div>
            <div class="phone-side side-right"></div>
            <div class="phone-side side-top"></div>
            <div class="phone-side side-bottom"></div>
          </div>
        </div>
      </div>
    </div>

    <!-- Scene 4: Outro CTA -->
    <div class="scene" id="scene-3">
      <div class="scene-content" style="justify-content:center; flex-direction:column; align-items:center; text-align:center;">
        <div class="logo-squircle-pin" id="s3-logo" style="width:140px; height:140px; margin-bottom:24px;">
          <svg width="64" height="64" viewBox="0 0 24 24">
            <path fill="url(#pinGrad)" d="M12 2C7.6 2 4 5.6 4 10c0 6.2 8 12 8 12s8-5.8 8-12c0-4.4-3.6-8-8-8zm0 11a3 3 0 110-6 3 3 0 010 6z"/>
          </svg>
        </div>
        <div class="copy-col centered">
          <h1 class="title-highlight" id="s3-text">Get <span>Personal</span> Delivery</h1>
          <div class="platform-grid" id="s3-platforms">
            ${config.scenes[3].platforms.map(p => `
            <div class="platform-card">
              <div class="qr-wrap">${generateQRCodeSVG(p.url, 96)}</div>
              <div class="platform-name-row">${PLATFORM_ICONS[p.icon] || ''}<div class="platform-name">${p.name}</div></div>
            </div>`).join('')}
          </div>
        </div>
      </div>
    </div>
  </div>

  ${getUniversalPlayerScriptAndStyle(config).html}

  <script type="application/json" id="template-config">
    ${JSON.stringify(config, null, 2)}
  </script>

  <script>
    window.__customSceneTransform = function(sceneIdx, progress, globalTimeMs) {
      // Easing helper (cubic ease-out) over a 0..window entry window
      function easeWindow(p, window) {
        const t = Math.min(1, Math.max(0, p / window));
        return 1 - Math.pow(1 - t, 3);
      }

      if (sceneIdx === 0) { // Scene 1: logo settle + tap ripple pulse
        const logo = document.getElementById("s0-logo");
        const ripple = document.getElementById("s0-ripple");
        const text = document.getElementById("s0-text");
        const e = easeWindow(progress, 0.35);
        if (logo) logo.style.transform = "scale(" + (0.7 + 0.3 * e) + ")";
        if (text) { text.style.opacity = e; text.style.transform = "translateY(" + (20 * (1 - e)) + "px)"; }
        if (ripple) {
          // Pulses once the logo has settled, simulating a finger tap
          const tapT = Math.min(1, Math.max(0, (progress - 0.4) / 0.35));
          ripple.style.transform = "scale(" + (1 + tapT * 0.35) + ")";
          ripple.style.opacity = String(0.6 * (1 - tapT));
        }
      }
      else if (sceneIdx === 1) { // Scene 2: phone left rotateY -15deg + copy/CTA entrance
        const rig = document.getElementById("phone-rig-1");
        const refl = document.getElementById("refl-slot-0");
        const slot0 = document.getElementById("slot-0");
        if (slot0 && refl) refl.src = slot0.src;
        const e = easeWindow(progress, 0.45);
        const offset = 260 * (1 - e);
        const driftYaw = Math.sin(globalTimeMs * 0.001) * 2.5 * e;
        const driftPitch = Math.cos(globalTimeMs * 0.0012) * 1.5 * e;
        if (rig) rig.style.transform = "translateX(" + (-offset) + "px) rotateY(" + (-15 + driftYaw) + "deg) rotateX(" + driftPitch + "deg)";
        if (refl) refl.style.transform = "translateX(" + (-offset) + "px) scaleY(-1) translateY(6px)";
      }
      else if (sceneIdx === 2) { // Scene 3: trio fan lineup, step-rotated
        const a = document.getElementById("phone-rig-2a");
        const b = document.getElementById("phone-rig-2b");
        const c = document.getElementById("phone-rig-2c");
        const e = easeWindow(progress, 0.45);
        const spread = 1 - 0.3 * (1 - e); // phones settle inward slightly as they enter
        const drift = Math.sin(globalTimeMs * 0.001) * 2 * e;
        if (a) a.style.transform = "translateX(" + (-300 * spread) + "px) translateZ(-70px) scale(0.82) rotateY(" + (15 + drift) + "deg)";
        if (b) b.style.transform = "translateX(0px) translateZ(30px) scale(1) rotateY(" + (drift * 0.5) + "deg)";
        if (c) c.style.transform = "translateX(" + (300 * spread) + "px) translateZ(-70px) scale(0.82) rotateY(" + (-15 - drift) + "deg)";
      }
      else if (sceneIdx === 3) { // Scene 4: outro logo + platform grid reveal
        const logo = document.getElementById("s3-logo");
        const text = document.getElementById("s3-text");
        const grid = document.getElementById("s3-platforms");
        const e = easeWindow(progress, 0.4);
        if (logo) logo.style.transform = "scale(" + (0.8 + 0.2 * e) + ")";
        if (text) { text.style.opacity = e; }
        if (grid) grid.style.opacity = Math.min(1, Math.max(0, (progress - 0.35) / 0.3));
      }
    };
  </script>

  ${getUniversalPlayerScriptAndStyle(config).script}
</body>
</html>`;

  const tplDir = path.join(rootDir, 'templates', 'video', config.id);
  fs.mkdirSync(tplDir, { recursive: true });
  fs.writeFileSync(path.join(tplDir, 'template.html'), templateHtml);
  console.log(`Successfully generated frame-accurate template at: ${path.join(tplDir, 'template.html')}`);
}

// Auto-run if executed directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  create62155880Template();
}
