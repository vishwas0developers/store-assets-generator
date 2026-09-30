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
  android: `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="#8b85f8"><path d="M17.6 9.48l1.84-3.18a.6.6 0 10-1.04-.6l-1.87 3.23a10.6 10.6 0 00-8.06 0L6.6 5.7a.6.6 0 10-1.04.6l1.84 3.18C4.7 11.2 2.7 14.14 2.4 17.6h19.2c-.3-3.46-2.3-6.4-5.98-8.12zM8 15a1.2 1.2 0 110-2.4A1.2 1.2 0 018 15zm8 0a1.2 1.2 0 110-2.4A1.2 1.2 0 0116 15z"/></svg>`,
  apple: `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="#ffffff"><path d="M16.7 12.7c0-2.2 1.8-3.3 1.9-3.4-1-1.5-2.6-1.7-3.2-1.7-1.4-.1-2.7.8-3.4.8-.7 0-1.8-.8-3-.8-1.5 0-3 .9-3.8 2.3-1.6 2.8-.4 7 1.2 9.3.8 1.1 1.7 2.4 3 2.3 1.2 0 1.6-.8 3-.8s1.8.8 3 .8c1.3 0 2.1-1.1 2.9-2.3.9-1.3 1.3-2.6 1.3-2.7-.1 0-2.5-1-2.5-3.8zM14.2 5.9c.6-.8 1.1-1.9.9-3-1 .1-2.1.6-2.8 1.4-.6.7-1.2 1.9-1 2.9 1.1.1 2.2-.5 2.9-1.3z"/></svg>`,
  windows: `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="#eab308"><path d="M3 5.6L10.4 4.5V11.4H3V5.6zM11.3 4.4L21 3V11.3H11.3V4.4zM3 12.4H10.4V19.4L3 18.3V12.4zM11.3 12.4H21V20.9L11.3 19.5V12.4z"/></svg>`
};

// Small inline glyphs for the Scene 5 dual-sided feature capsules
const CAPSULE_ICONS = {
  check: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>`,
  download: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12m0 0-4-4m4 4 4-4M4 21h16"/></svg>`,
  upload: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8b85f8" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21V9m0 0-4 4m4-4 4 4M4 3h16"/></svg>`,
  info: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8b85f8" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v5m0-8h.01"/></svg>`
};

let pinLogoGradCounter = 0;
const PIN_LOGO_SVG = (size) => {
  const gradId = `pinGrad-${pinLogoGradCounter++}`; // unique per instance: duplicate SVG ids don't resolve reliably across scenes
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24">
  <defs>
    <linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#f59e0b"/>
      <stop offset="100%" stop-color="#ef4444"/>
    </linearGradient>
  </defs>
  <path fill="url(#${gradId})" d="M12 2C7.6 2 4 5.6 4 10c0 6.2 8 12 8 12s8-5.8 8-12c0-4.4-3.6-8-8-8zm0 11a3 3 0 110-6 3 3 0 010 6z"/>
</svg>`;
};

// One <div class="phone-3d-rig"> with side rails + Dynamic Island + a screen slot.
function phoneRig(id, slotId, extraStyle = '') {
  return `<div class="phone-3d-rig" id="${id}"${extraStyle ? ` style="${extraStyle}"` : ''}>
            <div class="phone-face front">
              <div class="dynamic-island"></div>
              <img class="phone-screen" id="${slotId}" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" alt="${slotId}" />
            </div>
            <div class="phone-face back"></div>
            <div class="phone-side side-left">
              <div class="side-btn volume-up"></div>
              <div class="side-btn volume-down"></div>
            </div>
            <div class="phone-side side-right">
              <div class="side-btn power-btn"></div>
            </div>
            <div class="phone-side side-top"></div>
            <div class="phone-side side-bottom"></div>
          </div>`;
}

export function create62155880Template() {
  const config = {
    id: "tpl-62155880-delivery-trio-showcase",
    name: "Delivery App Trio — 62155880 Reference",
    description: "Premium blue-gradient delivery logistics showcase, frame-accurate to 62155880.mp4: a unified logo/label opener, app-opening reveal, multi-phone feature scenes, trio lineup, and a dynamic multi-platform QR outro.",
    useCase: "Best for premium delivery / logistics SaaS promotion.",
    designStyle: "Trio Showcase",
    aspectRatio: "16:9",
    features: [
      "8 unified scenes matching 62155880.mp4 frame-by-frame",
      "Animated blue 3D wallpaper background system",
      "True 3D phone chassis with side rails and Dynamic Island",
      "Directional monotonic scene transitions (up/down/left/right)",
      "Trio fan lineup with floor reflections",
      "Dynamic multi-platform QR code outro"
    ],
    device: "apple-iphone-15-pro",
    variant: "delivery-trio",
    deviceFraction: 0.6,
    scenes: [
      {
        label: "Scene 1: Opening Scene",
        sceneTemplate: "hero-rise",
        durationSeconds: 3.6,
        background: "gradient-opener",
        rotate: 0, zoom: 1, move: 0,
        depth: "opener", layout: "logo-tap",
        text: "My Delivery",
        subtext: "",
        slots: { text: "s0-text", logo: "slot-logo" }
      },
      {
        label: "Scene 2: App Opening & Info Reveal",
        sceneTemplate: "hero-rise",
        durationSeconds: 7.2,
        background: "royal",
        rotate: 0, zoom: 1, move: 0,
        depth: "showcase", layout: "copy-right",
        text: "We are <span>Personal Delivery</span> Online Services",
        subtext: "",
        slots: { text: "s1-text", screenshot: "slot-0" }
      },
      {
        label: "Scene 3: Center Phone + Feature Labels Ring",
        sceneTemplate: "hero-rise",
        durationSeconds: 5.8,
        background: "royal",
        rotate: 0, zoom: 1, move: 0,
        depth: "showcase", layout: "center-phone",
        text: "",
        subtext: "",
        slots: { screenshot: "slot-1" }
      },
      {
        label: "Scene 4: Two-Phone Feature Presentation",
        sceneTemplate: "hero-rise",
        durationSeconds: 6.3,
        background: "royal",
        rotate: 0, zoom: 1, move: 0,
        depth: "showcase", layout: "copy-left",
        text: "<span>Best Way</span> To Deliver",
        subtext: "As soon as you finish typing a word, it will be checked against the dictionary.",
        slots: { text: "s3-text", subtext: "s3-subtext", screenshots: ["slot-2", "slot-3"] }
      },
      {
        label: "Scene 5: Dual-Sided Feature Capsules",
        sceneTemplate: "hero-rise",
        durationSeconds: 6.4,
        background: "royal",
        rotate: 0, zoom: 1, move: 0,
        depth: "showcase", layout: "copy-left",
        text: "Minimum Risk <span>Secure Your Package</span>",
        subtext: "",
        slots: { text: "s4-text", screenshot: "slot-4" }
      },
      {
        label: "Scene 6: Handoff & Glass Magnifier Card",
        sceneTemplate: "hero-rise",
        durationSeconds: 3.9,
        background: "royal",
        rotate: 0, zoom: 1, move: 0,
        depth: "showcase", layout: "copy-right",
        text: "Transparent <span>In Every Detail</span>",
        subtext: "",
        slots: { text: "s5-text", screenshot: "slot-5" }
      },
      {
        label: "Scene 7: Trio Showcase + Feature Cards",
        sceneTemplate: "hero-rise",
        durationSeconds: 7.7,
        background: "royal",
        rotate: 0, zoom: 1, move: 0,
        depth: "showcase", layout: "trio-center",
        text: "Why We Are The <span>Best Choice</span> And How It Works",
        subtext: "",
        slots: { text: "s6-text", screenshots: ["slot-6", "slot-7", "slot-8"] }
      },
      {
        label: "Scene 8: Outro CTA",
        sceneTemplate: "studio-outro",
        durationSeconds: 4.9,
        background: "royal",
        rotate: 0, zoom: 1, move: 0,
        depth: "outro", layout: "outro-platforms",
        text: "Best Way To <span>Send & Receive</span> Packages",
        subtext: "",
        slots: { text: "s7-text", screenshots: ["slot-9", "slot-10"] },
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
    html, body { margin:0; padding:0; width:1920px; height:1080px; overflow:hidden; background:#0f172a; font-family:'Inter',sans-serif; color:#ffffff; }

    /* Unified animated blue 3D wallpaper background, shared by every scene */
    .canvas { position:relative; width:1920px; height:1080px; overflow:hidden; background: linear-gradient(145deg, #1e3a8a 0%, #172554 45%, #0f172a 100%); }
    .ambient-sphere {
      position:absolute; border-radius:50%; pointer-events:none; filter: blur(1px);
      background: radial-gradient(circle at 35% 35%, rgba(56,189,248,0.32), rgba(30,58,138,0.02) 72%);
      animation: ambientWallpaperDrift 18s ease-in-out infinite;
    }
    .ambient-ring {
      position:absolute; border-radius:50%; pointer-events:none;
      border: 2px solid rgba(56,189,248,0.14);
      animation: ambientWallpaperDrift 24s ease-in-out infinite reverse;
    }
    @keyframes ambientWallpaperDrift {
      0%   { transform: translate(0px, 0px) rotate(0deg); }
      50%  { transform: translate(24px, -30px) rotate(6deg); }
      100% { transform: translate(0px, 0px) rotate(0deg); }
    }
    .floor-reflection-plane { position:absolute; left:0; bottom:0; width:1920px; height:380px; background:linear-gradient(to bottom, transparent, rgba(15,23,42,0.92)), radial-gradient(ellipse at center bottom, rgba(56, 189, 248, 0.18) 0%, transparent 70%); z-index:1; pointer-events:none; }

    .scene { position:absolute; inset:0; width:1920px; height:1080px; display:none; align-items:center; justify-content:center; z-index:3; padding:0 10%; box-sizing:border-box; }
    .scene.active, .scene.playing { display:flex; }
    .scene-content { display:flex; width:100%; height:100%; align-items:center; justify-content:space-between; position:relative; }

    .copy-col { flex:1; max-width:680px; display:flex; flex-direction:column; justify-content:center; z-index:5; }
    .copy-col.right-side { text-align:right; align-items:flex-end; }
    .copy-col.centered { text-align:center; align-items:center; max-width:1100px; margin:0 auto; }
    .title-highlight { font-size:68px; font-weight:800; line-height:1.1; letter-spacing:-1.5px; margin:0 0 24px 0; color:#ffffff; }
    .title-highlight span { color:#8b85f8; text-shadow:0 0 20px rgba(139, 133, 248, 0.35); }
    .title-highlight.small { font-size:44px; }
    .subtitle { font-size:24px; font-weight:400; line-height:1.6; color:#a0a0bd; margin:0; }

    /* "Get Started" pill CTA */
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
      width: 220px;
      height: 54px;
      border-radius: 32px;
      border: 2px solid rgba(255,255,255,0.35);
      box-shadow: 0 0 26px rgba(234, 179, 8, 0.55), 0 12px 30px rgba(234, 179, 8, 0.3);
    }

    .device-col { flex:1.1; display:flex; align-items:center; justify-content:center; height:100%; z-index:4; position:relative; transform-style:preserve-3d; perspective:1500px; }
    .device-col.trio { flex:1.4; }
    .device-col.center-only { flex:1; }

    .phone-3d-rig { position:absolute; top:50%; left:50%; margin-top:-350px; margin-left:-170px; width:340px; height:700px; transform-style:preserve-3d; border: none; outline: none; }
    .phone-face { position:absolute; inset:0; border-radius:46px; box-sizing:border-box; }
    .phone-face.front { background:#000000; transform:translateZ(8px); z-index:10; overflow:hidden; padding:4px; border: 1.5px solid rgba(255,255,255,0.3); outline: none; box-shadow: inset 0 0 0 1px rgba(255,255,255,0.05), 0 20px 45px rgba(0,0,0,0.5); }
    .phone-face.back { background:linear-gradient(135deg, #cbd5e1 0%, #94a3b8 50%, #475569 100%); transform:translateZ(-8px) rotateY(180deg); border: 1px solid rgba(255,255,255,0.2); box-shadow: inset 0 0 20px rgba(0,0,0,0.4); }
    .dynamic-island { position:absolute; top:15px; left:50%; transform:translateX(-50%); width:90px; height:26px; background:#0c0d10; border-radius:13px; z-index:12; border:1px solid #1a1b20; box-shadow: inset 0 1px 2px rgba(255,255,255,0.1), 0 1px 2px rgba(0,0,0,0.5); }
    .phone-screen { width:100%; height:100%; object-fit:cover; border-radius:42px; }
    .reflection-screen { position:absolute; top:50%; left:50%; margin-top:-350px; margin-left:-170px; width:340px; height:700px; border-radius:46px; transform-origin:center bottom; transform:scaleY(-1) translateY(6px); opacity:0.16; filter:blur(4px); pointer-events:none; z-index:1; }
    /* Premium 3D Polished Chrome Chassis Side Rails */
    .phone-side {
      position:absolute;
      box-sizing: border-box;
      outline: none;
    }
    .side-left { width:16px; height:700px; left:-8px; top:0; transform-origin: left center; transform: translateZ(-8px) rotateY(90deg); border-radius: 4px; }
    .side-right { width:16px; height:700px; right:-8px; top:0; transform-origin: right center; transform: translateZ(-8px) rotateY(-90deg); border-radius: 4px; }
    .side-top { width:340px; height:16px; left:0; top:-8px; transform-origin: center top; transform: translateZ(-8px) rotateX(90deg); border-radius: 4px; }
    .side-bottom { width:340px; height:16px; left:0; bottom:-8px; transform-origin: center bottom; transform: translateZ(-8px) rotateX(-90deg); border-radius: 4px; }
    .side-btn { position:absolute; background: linear-gradient(to bottom, #f8fafc, #cbd5e1); border: 1px solid #64748b; border-radius:3px; }
    .volume-up { width:4px; height:45px; left:-4px; top:120px; }
    .volume-down { width:4px; height:45px; left:-4px; top:180px; }
    .power-btn { width:4px; height:50px; right:-4px; top:140px; }

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
    /* Scene 1: 32px semibold app name under the icon */
    #s0-text { font-size: 32px; font-weight: 600; color: #ffffff; text-shadow: 0 2px 12px rgba(0,0,0,0.25); margin-top: 24px; }

    /* Floating glass badge pills */
    .glass-badge {
      position: absolute;
      display: flex;
      align-items: center;
      gap: 8px;
      background: rgba(255,255,255,0.08);
      border: 1px solid rgba(255,255,255,0.16);
      backdrop-filter: blur(14px);
      border-radius: 40px;
      padding: 10px 18px;
      font-size: 15px;
      font-weight: 600;
      color: #e6e6f0;
      box-shadow: 0 10px 26px rgba(0,0,0,0.3);
      pointer-events: none;
    }
    .glass-badge .dot { width: 8px; height: 8px; border-radius: 50%; background: #8b85f8; box-shadow: 0 0 10px #8b85f8; flex-shrink: 0; }
    .glass-badge.lg { min-width: 140px; height: 44px; justify-content: center; font-size: 16px; }
    .glass-badge.xl { min-width: 220px; height: 52px; justify-content: center; font-size: 15px; white-space: nowrap; }

    /* Scene 6: floating frosted glass magnifier card */
    .magnifier-card {
      position: absolute;
      width: 220px;
      height: 220px;
      border-radius: 36px;
      border: 1.5px solid rgba(255,255,255,0.35);
      background: rgba(255,255,255,0.08);
      backdrop-filter: blur(22px);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      box-shadow: 0 24px 50px rgba(0,0,0,0.35);
      pointer-events: none;
      z-index: 20;
    }
    .magnifier-card .mc-label { font-size: 17px; font-weight: 500; color: #cbd5e1; margin-bottom: 8px; }
    .magnifier-card .mc-value { font-size: 52px; font-weight: 800; color: #ffffff; }

    /* Feature card row with progress bars (Scene 7) */
    .feature-card-row { display:flex; gap:20px; margin-top: 28px; margin-bottom: 42px; }
    .feature-card {
      width: 380px;
      height: 126px;
      box-sizing: border-box;
      background: rgba(255,255,255,0.06);
      border: 1px solid rgba(255,255,255,0.14);
      border-radius: 18px;
      padding: 22px 24px;
      backdrop-filter: blur(10px);
      text-align: left;
    }
    .feature-card .fc-title { font-size: 18px; font-weight: 600; color: #e6e6f0; margin-bottom: 12px; }
    .feature-card .fc-bar { height: 6px; border-radius: 3px; background: rgba(255,255,255,0.12); overflow: hidden; box-shadow: 0 0 10px rgba(139,133,248,0.35); }
    .feature-card .fc-bar-fill { height: 100%; background: #8b85f8; border-radius: 3px; box-shadow: 0 0 8px #8b85f8; }

    /* Scene 8: platform download grid with live QR codes -- wide pill cards (480x128) */
    .platform-grid { display:flex; flex-direction: column; gap:18px; margin-top:32px; }
    .platform-card {
      display:flex; flex-direction:row; align-items:center; gap:28px;
      width: 480px; height: 128px; box-sizing: border-box;
      background: rgba(255,255,255,0.06);
      border: 1px solid rgba(255,255,255,0.14);
      border-radius: 24px;
      padding: 0 28px;
      backdrop-filter: blur(10px);
    }
    .platform-card .qr-wrap { width:104px; height:104px; flex-shrink:0; border-radius: 8px; overflow: hidden; }
    .platform-card .qr-wrap svg { width:100%; height:100%; display:block; }
    .platform-name-row { display:flex; align-items:center; gap:14px; }
    .platform-name { font-size:26px; font-weight:700; color:#ffffff; }

    /* Opener center wrapper to keep logo & text grouped & centered */
    .opener-center-wrap {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      position: relative;
      z-index: 5;
    }

    /* Scene 5 absolute columns */
    .s4-left-col {
      position: absolute;
      left: 120px;
      top: 50%;
      transform: translateY(-50%);
      width: 540px;
      display: flex;
      flex-direction: column;
      z-index: 5;
    }
    .s4-right-col {
      position: absolute;
      right: 120px;
      top: 50%;
      transform: translateY(-50%);
      width: 440px;
      display: flex;
      flex-direction: column;
      gap: 24px;
      z-index: 5;
    }

    ${getUniversalPlayerScriptAndStyle(config).style}
  </style>
</head>
<body>
  <div class="canvas">
    <!-- Ambient drifting spheres/rings -- continuous across every scene, unaffected by transitions -->
    <div class="ambient-sphere" style="width:520px; height:520px; top:-160px; right:-140px; animation-delay:-4s;"></div>
    <div class="ambient-sphere" style="width:360px; height:360px; bottom:-120px; left:-100px; animation-delay:-11s;"></div>
    <div class="ambient-ring" style="width:640px; height:640px; top:20%; left:-220px;"></div>
    <div class="ambient-ring" style="width:420px; height:420px; bottom:-140px; right:10%;"></div>
    <div class="floor-reflection-plane"></div>

    <!-- Scene 1: Unified Opening Scene (blue gradient, dual top/bottom entry + tap ripple) -->
    <div class="scene" id="scene-0">
      <div class="scene-content" style="justify-content:center; flex-direction:column; align-items:center; text-align:center;">
        <div class="opener-center-wrap">
          <div class="logo-squircle-pin" id="s0-logo">
            <div class="tap-ripple" id="s0-ripple"></div>
            ${PIN_LOGO_SVG(84)}
          </div>
          <div class="copy-col centered">
            <h1 class="title-highlight" id="s0-text">My Delivery</h1>
          </div>
        </div>
      </div>
    </div>

    <!-- Scene 2: App Opening & Info Reveal -->
    <div class="scene" id="scene-1">
      <div class="scene-content">
        <div class="device-col">
          ${phoneRig('phone-rig-1', 'slot-0')}
          <img class="reflection-screen" id="refl-slot-0" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" />
        </div>
        <div class="copy-col">
          <h2 class="title-highlight" id="s1-text">We are <span>Personal Delivery</span> Online Services</h2>
          <div class="get-started-pill" id="s1-cta">GET STARTED</div>
        </div>
      </div>
    </div>

    <!-- Scene 3: Center Phone + Feature Labels Ring (6 capsules) -->
    <div class="scene" id="scene-2">
      <div class="scene-content" style="justify-content:center;">
        <div class="device-col center-only" style="position:relative;">
          ${phoneRig('phone-rig-2', 'slot-1')}
        </div>
      </div>
      <div class="glass-badge lg" id="s2-badge-1" style="top: 260px; left: calc(50% - 410px);"><span class="dot"></span>Instant</div>
      <div class="glass-badge lg" id="s2-badge-2" style="top: 490px; left: calc(50% - 450px);"><span class="dot"></span>Anywhere</div>
      <div class="glass-badge lg" id="s2-badge-3" style="top: 720px; left: calc(50% - 410px);"><span class="dot"></span>Affordable</div>
      <div class="glass-badge lg" id="s2-badge-4" style="top: 260px; left: calc(50% + 230px);"><span class="dot"></span>Secure</div>
      <div class="glass-badge lg" id="s2-badge-5" style="top: 490px; left: calc(50% + 270px);"><span class="dot"></span>Anytime</div>
      <div class="glass-badge lg" id="s2-badge-6" style="top: 720px; left: calc(50% + 230px);"><span class="dot"></span>No Excuse</div>
    </div>

    <!-- Scene 4: Two-Phone Feature Presentation -->
    <div class="scene" id="scene-3">
      <div class="scene-content">
        <div class="copy-col" style="margin-left: 140px;">
          <h2 class="title-highlight" id="s3-text" style="font-size: 54px;"><span>Best Way</span> To Deliver</h2>
          <p class="subtitle" id="s3-subtext" style="font-size: 20px;">As soon as you finish typing a word, it will be checked against the dictionary.</p>
        </div>
        <div class="device-col trio" style="position:relative;">
          ${phoneRig('phone-rig-3a', 'slot-2', 'transform: translateX(-160px);')}
          ${phoneRig('phone-rig-3b', 'slot-3', 'transform: translateX(240px) rotateY(-12deg);')}
        </div>
      </div>
    </div>

    <!-- Scene 5: Dual-Sided Feature Capsules -->
    <div class="scene" id="scene-4">
      <div class="scene-content">
        <div class="copy-col" style="margin-left: 140px; max-width: 620px;">
          <h2 class="title-highlight" id="s4-text" style="font-size: 48px; margin-bottom: 24px;">Minimum Risk <span>Secure Your Package</span></h2>
          <div style="display: flex; flex-direction: column; gap: 16px;">
            <div class="glass-badge xl" id="s4-badge-1" style="position: relative; top: 0; left: 0; opacity: 0;">${CAPSULE_ICONS.check}Payment Processed (Transaction ID : #4466737)</div>
            <div class="glass-badge xl" id="s4-badge-2" style="position: relative; top: 0; left: 0; opacity: 0;">${CAPSULE_ICONS.info}Package Return (Version 17.5 ready to install)</div>
            <div class="glass-badge xl" id="s4-badge-3" style="position: relative; top: 0; left: 0; opacity: 0;">${CAPSULE_ICONS.download}Package Received (Download completed)</div>
            <div class="glass-badge xl" id="s4-badge-4" style="position: relative; top: 0; left: 0; opacity: 0;">${CAPSULE_ICONS.upload}Package On Process (Upload completed)</div>
          </div>
        </div>
        <div class="device-col">
          ${phoneRig('phone-rig-4', 'slot-4')}
        </div>
      </div>
    </div>

    <!-- Scene 6: Handoff & Floating Glass Magnifier Card -->
    <div class="scene" id="scene-5">
      <div class="scene-content">
        <div class="device-col center-only" style="position:relative;">
          ${phoneRig('phone-rig-5', 'slot-5')}
          <div class="magnifier-card" id="s5-magnifier" style="top: 30%; left: 50%; margin-left: -110px;">
            <div class="mc-label">Total Cost</div>
            <div class="mc-value">$45</div>
          </div>
        </div>
        <div class="copy-col right-side">
          <h2 class="title-highlight" id="s5-text">Transparent <span>In Every Detail</span></h2>
        </div>
      </div>
    </div>

    <!-- Scene 7: Trio Showcase + Feature Cards -->
    <div class="scene" id="scene-6">
      <div class="scene-content" style="flex-direction:column; justify-content:center; gap:16px; text-align:center; align-items:center;">
        <div class="copy-col centered" style="margin-bottom: 8px;">
          <h2 class="title-highlight small" id="s6-text">Why We Are The <span>Best Choice</span> And How It Works</h2>
        </div>
        <div class="device-col trio" style="height:560px;">
          ${phoneRig('phone-rig-6a', 'slot-6', 'transform: translateX(-340px) translateY(-90px) translateZ(-70px) scale(0.82) rotateY(15deg);')}
          ${phoneRig('phone-rig-6b', 'slot-7', 'transform: translateX(0px) translateY(-90px) translateZ(30px) scale(0.88) rotateY(0deg);')}
          ${phoneRig('phone-rig-6c', 'slot-8', 'transform: translateX(340px) translateY(-90px) translateZ(-70px) scale(0.82) rotateY(-15deg);')}
        </div>
        <div class="feature-card-row" id="s6-cards">
          <div class="feature-card"><div class="fc-title">01 — Firefox automatically checks for updates</div><div class="fc-bar"><div class="fc-bar-fill" style="width:70%;"></div></div></div>
          <div class="feature-card"><div class="fc-title">02 — End-to-end encrypted delivery tracking</div><div class="fc-bar"><div class="fc-bar-fill" style="width:45%;"></div></div></div>
          <div class="feature-card"><div class="fc-title">03 — Real-time courier location updates</div><div class="fc-bar"><div class="fc-bar-fill" style="width:85%;"></div></div></div>
        </div>
      </div>
    </div>

    <!-- Scene 8: Outro CTA -->
    <div class="scene" id="scene-7">
      <div class="scene-content">
        <div class="copy-col" style="margin-left: 140px; max-width: 680px;">
          <h2 class="title-highlight" id="s7-text" style="font-size: 56px;">Best Way To <span>Send & Receive</span> Packages</h2>
          <div class="platform-grid" id="s7-platforms">
            ${config.scenes[7].platforms.map(p => `
            <div class="platform-card">
              <div class="qr-wrap">${generateQRCodeSVG(p.url, 104)}</div>
              <div class="platform-name-row">${PLATFORM_ICONS[p.icon] || ''}<div class="platform-name">${p.name}</div></div>
            </div>`).join('')}
          </div>
        </div>
        <div class="device-col trio" style="position:relative;">
          ${phoneRig('phone-rig-7a', 'slot-9', 'transform: translateX(-120px);')}
          ${phoneRig('phone-rig-7b', 'slot-10', 'transform: translateX(220px) rotateY(-14deg);')}
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
      function ambientDrift(e) {
        return {
          yaw: Math.sin(globalTimeMs * 0.001) * 2.5 * e,
          pitch: Math.cos(globalTimeMs * 0.0012) * 1.5 * e
        };
      }

      if (sceneIdx === 0) { // Scene 1: logo enters from top, label enters from bottom, meet at center + tap ripple
        const logo = document.getElementById("s0-logo");
        const text = document.getElementById("s0-text");
        const ripple = document.getElementById("s0-ripple");
        const e = easeWindow(progress, 0.45);
        if (logo) logo.style.transform = "translateY(" + (-160 * (1 - e)) + "px) scale(" + (0.85 + 0.15 * e) + ")";
        if (text) { text.style.transform = "translateY(" + (120 * (1 - e)) + "px)"; text.style.opacity = e; }
        if (ripple) {
          const tapT = Math.min(1, Math.max(0, (progress - 0.5) / 0.35));
          ripple.style.transform = "scale(" + (1 + tapT * 0.4) + ")";
          ripple.style.opacity = String(0.6 * (1 - tapT));
        }
      }
      else if (sceneIdx === 1) { // Scene 2: phone settles left (rotateY -14, translateX -260) + right copy + CTA
        const rig = document.getElementById("phone-rig-1");
        const refl = document.getElementById("refl-slot-0");
        const slot0 = document.getElementById("slot-0");
        const text = document.getElementById("s1-text");
        const cta = document.getElementById("s1-cta");
        if (slot0 && refl) refl.src = slot0.src;
        const e = easeWindow(progress, 0.4);
        const entry = 260 * (1 - e);
        const drift = ambientDrift(e);
        const baseX = -260 + entry;
        if (rig) rig.style.transform = "translateX(" + baseX + "px) rotateY(" + (-14 + drift.yaw) + "deg) rotateX(" + drift.pitch + "deg)";
        if (refl) refl.style.transform = "translateX(" + baseX + "px) scaleY(-1) translateY(6px)";
        const copyE = Math.min(1, Math.max(0, (progress - 0.35) / 0.4));
        if (text) { text.style.opacity = copyE; text.style.transform = "translateX(" + (30 * (1 - copyE)) + "px)"; }
        if (cta) cta.style.opacity = Math.min(1, Math.max(0, (progress - 0.55) / 0.3));
      }
      else if (sceneIdx === 2) { // Scene 3: center phone rises from bottom, ambient drift, 6-badge ring staggers in
        const rig = document.getElementById("phone-rig-2");
        const e = easeWindow(progress, 0.4);
        const entryY = 300 * (1 - e);
        const drift = ambientDrift(e);
        if (rig) rig.style.transform = "translateY(" + entryY + "px) scale(0.95) rotateY(" + drift.yaw + "deg) rotateX(" + drift.pitch + "deg)";
        const badgeDefs = [
          ["s2-badge-1", 0.30, 0.0011], ["s2-badge-2", 0.38, 0.0013], ["s2-badge-3", 0.46, 0.0009],
          ["s2-badge-4", 0.34, 0.0012], ["s2-badge-5", 0.42, 0.0010], ["s2-badge-6", 0.50, 0.0014]
        ];
        badgeDefs.forEach(function (def) {
          const el = document.getElementById(def[0]);
          if (!el) return;
          el.style.opacity = Math.min(1, Math.max(0, (progress - def[1]) / 0.22));
          el.style.transform = "translateY(" + (Math.sin(globalTimeMs * def[2]) * 8) + "px)";
        });
      }
      else if (sceneIdx === 3) { // Scene 4: first phone settles center-left, second slides in from the right
        const a = document.getElementById("phone-rig-3a");
        const b = document.getElementById("phone-rig-3b");
        const text = document.getElementById("s3-text");
        const sub = document.getElementById("s3-subtext");
        const eA = easeWindow(progress, 0.35);
        const eB = easeWindow(Math.max(0, progress - 0.15), 0.4);
        const entryA = 200 * (1 - eA);
        const entryB = 780 * (1 - eB); // 1020px -> 240px settle
        if (a) a.style.transform = "translateX(" + (-160 - entryA) + "px)";
        if (b) b.style.transform = "translateX(" + (240 + entryB) + "px) rotateY(-12deg)";
        if (text) { text.style.opacity = eA; text.style.transform = "translateX(" + (-30 * (1 - eA)) + "px)"; }
        if (sub) sub.style.opacity = Math.min(1, Math.max(0, (progress - 0.3) / 0.3));
      }
      else if (sceneIdx === 4) { // Scene 5: phone enters from bottom, settles right; left copy
        const rig = document.getElementById("phone-rig-4");
        const text = document.getElementById("s4-text");
        const e = easeWindow(progress, 0.4);
        const entryY = 320 * (1 - e);
        const drift = ambientDrift(e);
        const baseX = 260 + 300 * (1 - e);
        if (rig) rig.style.transform = "translateX(" + baseX + "px) translateY(" + entryY + "px) scale(0.95) rotateY(" + (14 + drift.yaw) + "deg) rotateX(" + drift.pitch + "deg)";
        if (text) { text.style.opacity = e; }
        const b1 = document.getElementById("s4-badge-1");
        const b2 = document.getElementById("s4-badge-2");
        const b3 = document.getElementById("s4-badge-3");
        const b4 = document.getElementById("s4-badge-4");
        if (b1) { b1.style.opacity = Math.min(1, Math.max(0, (progress - 0.4) / 0.3)); b1.style.transform = "translateY(" + (Math.sin(globalTimeMs * 0.001) * 6) + "px)"; }
        if (b2) { b2.style.opacity = Math.min(1, Math.max(0, (progress - 0.45) / 0.3)); b2.style.transform = "translateY(" + (Math.cos(globalTimeMs * 0.0012) * 6) + "px)"; }
        if (b3) { b3.style.opacity = Math.min(1, Math.max(0, (progress - 0.5) / 0.3)); b3.style.transform = "translateY(" + (Math.sin(globalTimeMs * 0.0011) * 6) + "px)"; }
        if (b4) { b4.style.opacity = Math.min(1, Math.max(0, (progress - 0.55) / 0.3)); b4.style.transform = "translateY(" + (Math.cos(globalTimeMs * 0.0009) * 6) + "px)"; }
      }
      else if (sceneIdx === 5) { // Scene 6: incoming phone enters from the right + floating magnifier card + right copy
        const rig = document.getElementById("phone-rig-5");
        const card = document.getElementById("s5-magnifier");
        const text = document.getElementById("s5-text");
        const e = easeWindow(progress, 0.45);
        const entryX = 1000 * (1 - e);
        const drift = ambientDrift(e);
        if (rig) rig.style.transform = "translateX(" + entryX + "px) rotateY(" + drift.yaw + "deg) rotateX(" + drift.pitch + "deg)";
        if (card) {
          const cardE = Math.min(1, Math.max(0, (progress - 0.4) / 0.3));
          card.style.opacity = cardE;
          // translateZ(60px) keeps the card ahead of the phone face (translateZ 8px) in the
          // preserve-3d depth-sorted stacking context -- z-index alone doesn't govern paint order there.
          card.style.transform = "translateZ(60px) translateY(" + ((1 - cardE) * 20 + Math.sin(globalTimeMs * 0.0018) * 10) + "px)";
        }
        if (text) text.style.opacity = Math.min(1, Math.max(0, (progress - 0.3) / 0.35));
      }
      else if (sceneIdx === 6) { // Scene 7: trio fan lineup rises from bottom + lower feature cards
        const a = document.getElementById("phone-rig-6a");
        const b = document.getElementById("phone-rig-6b");
        const c = document.getElementById("phone-rig-6c");
        const cards = document.getElementById("s6-cards");
        const e = easeWindow(progress, 0.4);
        const settleY = -90; // final resting offset -- higher up, clear of the bottom cards
        const entryY = settleY + 300 * (1 - e);
        const spread = 1 - 0.3 * (1 - e);
        const drift = Math.sin(globalTimeMs * 0.001) * 2 * e;
        if (a) a.style.transform = "translateX(" + (-340 * spread) + "px) translateY(" + entryY + "px) translateZ(-70px) scale(0.82) rotateY(" + (15 + drift) + "deg)";
        if (b) b.style.transform = "translateY(" + entryY + "px) translateZ(30px) scale(0.88) rotateY(" + (drift * 0.5) + "deg)";
        if (c) c.style.transform = "translateX(" + (340 * spread) + "px) translateY(" + entryY + "px) translateZ(-70px) scale(0.82) rotateY(" + (-15 - drift) + "deg)";
        if (cards) cards.style.opacity = Math.min(1, Math.max(0, (progress - 0.5) / 0.35));
      }
      else if (sceneIdx === 7) { // Scene 8: two-phone outro reveal like Scene 4
        const a = document.getElementById("phone-rig-7a");
        const b = document.getElementById("phone-rig-7b");
        const text = document.getElementById("s7-text");
        const grid = document.getElementById("s7-platforms");
        const eA = easeWindow(progress, 0.38);
        const eB = easeWindow(Math.max(0, progress - 0.12), 0.42);
        const entryA = 320 * (1 - eA);
        const entryB = 800 * (1 - eB);
        const drift = ambientDrift(eA);
        if (a) a.style.transform = "translateX(" + (-120 - 60 * (1 - eA)) + "px) translateY(" + entryA + "px) scale(0.92) rotateY(" + (8 + drift.yaw) + "deg) rotateX(" + drift.pitch + "deg)";
        if (b) b.style.transform = "translateX(" + (220 + entryB) + "px) translateY(" + (180 * (1 - eB)) + "px) scale(0.88) rotateY(" + (-14 - drift.yaw) + "deg) rotateX(" + drift.pitch + "deg)";
        if (text) text.style.opacity = eA;
        if (grid) grid.style.opacity = Math.min(1, Math.max(0, (progress - 0.3) / 0.3));
      }
    };
  </script>

  ${getUniversalPlayerScriptAndStyle(config).script}
</body>
</html>`;

  const tplDir = path.join(rootDir, 'templates', 'video', config.id);
  fs.writeFileSync(path.join(path.dirname(tplDir), path.basename(tplDir) + '.html'), templateHtml);
  console.log(`Successfully generated frame-accurate template at: ${path.join(path.dirname(tplDir), path.basename(tplDir) + '.html')}`);
}

// Auto-run if executed directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  create62155880Template();
}
