import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import qrcode from 'qrcode-generator';
import { getUniversalPlayerScriptAndStyle } from './player-helper.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../..');

// Build-time QR code generation — no client-side QR engine needed, no image assets uploaded.
function generateQRCodeSVG(text, size = 110) {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const count = qr.getModuleCount();
  const cell = size / count;
  let rects = '';
  for (let r = 0; r < count; r++) {
    for (let c = 0; c < count; c++) {
      if (qr.isDark(r, c)) {
        rects += `<rect x="${(c * cell).toFixed(2)}" y="${(r * cell).toFixed(2)}" width="${cell.toFixed(2)}" height="${cell.toFixed(2)}"/>`;
      }
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges"><rect width="${size}" height="${size}" fill="#fff"/><g fill="#0f172a">${rects}</g></svg>`;
}

// Recognizable monochrome platform glyphs (vector, no external asset uploads)
const PLATFORM_ICONS = {
  android: `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="#1d9bf0"><path d="M17.6 9.48l1.84-3.18a.6.6 0 10-1.04-.6l-1.87 3.23a10.6 10.6 0 00-8.06 0L6.6 5.7a.6.6 0 10-1.04.6l1.84 3.18C4.7 11.2 2.7 14.14 2.4 17.6h19.2c-.3-3.46-2.3-6.4-5.98-8.12zM8 15a1.2 1.2 0 110-2.4A1.2 1.2 0 018 15zm8 0a1.2 1.2 0 110-2.4A1.2 1.2 0 0116 15z"/></svg>`,
  apple: `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="#0f172a"><path d="M16.7 12.7c0-2.2 1.8-3.3 1.9-3.4-1-1.5-2.6-1.7-3.2-1.7-1.4-.1-2.7.8-3.4.8-.7 0-1.8-.8-3-.8-1.5 0-3 .9-3.8 2.3-1.6 2.8-.4 7 1.2 9.3.8 1.1 1.7 2.4 3 2.3 1.2 0 1.6-.8 3-.8s1.8.8 3 .8c1.3 0 2.1-1.1 2.9-2.3.9-1.3 1.3-2.6 1.3-2.7-.1 0-2.5-1-2.5-3.8zM14.2 5.9c.6-.8 1.1-1.9.9-3-1 .1-2.1.6-2.8 1.4-.6.7-1.2 1.9-1 2.9 1.1.1 2.2-.5 2.9-1.3z"/></svg>`,
  windows: `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="#1d9bf0"><path d="M3 5.6L10.4 4.5V11.4H3V5.6zM11.3 4.4L21 3V11.3H11.3V4.4zM3 12.4H10.4V19.4L3 18.3V12.4zM11.3 12.4H21V20.9L11.3 19.5V12.4z"/></svg>`,
  globe: `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#0f172a" stroke-width="1.6"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 010 18 14 14 0 010-18z"/></svg>`
};

export function create38180229Template() {
  const config = {
    id: "tpl-38180229-minimal-skyblue",
    name: "Clean Minimalist Sky Blue — 38180229 Reference",
    description: "Clean minimalist off-white and sky blue app promotion template frame-accurate to 38180229.mp4, featuring a modern 3D smartphone chassis, floating squircle badges, and dashed trajectory vectors.",
    useCase: "Ideal for video calling apps, communication tools, and general SaaS promotions.",
    designStyle: "Minimal Sky Blue",
    aspectRatio: "16:9",
    features: [
      "7 scenes matching 38180229.mp4 frame-by-frame",
      "Modern 3D flagship smartphone chassis",
      "Smooth off-white background with dashed trajectory vectors",
      "Floating Sky Blue rounded square badges and ring accents",
      "Unified two-phase monotonic motion engine",
      "100% front-screen usability for all screenshots"
    ],
    device: "generic-flagship",
    variant: "minimal-skyblue",
    deviceFraction: 0.62,
    scenes: [
      {
        label: "Scene 1: App Logo Opener",
        sceneTemplate: "studio-opener",
        durationSeconds: 1.73,
        background: "minimal-white",
        rotate: 0, zoom: 1, move: 0,
        depth: "opener", layout: "logo-kinetic",
        text: "Appsy: Free and secure video calls",
        subtext: "",
        slots: { text: "s0-text", logo: "slot-logo" }
      },
      {
        label: "Scene 2: Video Calling Made With Love",
        sceneTemplate: "studio-phone",
        durationSeconds: 2.57,
        background: "minimal-white",
        rotate: 0, zoom: 1, move: 0,
        depth: "showcase", layout: "copy-right",
        text: "Video calling app made with love",
        subtext: "",
        slots: { text: "s1-text", screenshot: "slot-0" }
      },
      {
        label: "Scene 3: Group Calls in Few Clicks",
        sceneTemplate: "studio-phone",
        durationSeconds: 2.67,
        background: "minimal-white",
        rotate: 0, zoom: 1, move: 0,
        depth: "showcase", layout: "copy-left",
        text: "Make group calls in a few clicks!",
        subtext: "",
        slots: { text: "s2-text", screenshot: "slot-1" }
      },
      {
        label: "Scene 4: Built-in Encryption",
        sceneTemplate: "studio-phone",
        durationSeconds: 3.33,
        background: "minimal-white",
        rotate: 0, zoom: 1, move: 0,
        depth: "showcase", layout: "split-copy",
        text: "Built-in encryption",
        subtext: "The process of converting data into a code to prevent unauthorized access",
        slots: { text: "s3-text", subtext: "s3-subtext", screenshot: "slot-2" }
      },
      {
        label: "Scene 5: Easy Snapshots During Call",
        sceneTemplate: "studio-phone",
        durationSeconds: 2.67,
        background: "minimal-white",
        rotate: 0, zoom: 1, move: 0,
        depth: "showcase", layout: "copy-left",
        text: "Easy take snapshots during the call",
        subtext: "Snap. Save. Done",
        slots: { text: "s4-text", subtext: "s4-subtext", screenshot: "slot-3" }
      },
      {
        label: "Scene 6: Download. Sign Up. Call.",
        sceneTemplate: "studio-phone",
        durationSeconds: 3.33,
        background: "minimal-white",
        rotate: 0, zoom: 1, move: 0,
        depth: "showcase", layout: "center-panel",
        text: "Download. Sign Up. Call.",
        subtext: "",
        slots: { text: "s5-text", screenshot: "slot-4" }
      },
      {
        label: "Scene 7: Outro Call-to-Action",
        sceneTemplate: "studio-outro",
        durationSeconds: 3.60,
        background: "minimal-white",
        rotate: 0, zoom: 1, move: 0,
        depth: "outro", layout: "outro-badges",
        text: "Appsy: Free and secure video calls",
        subtext: "",
        slots: { text: "s6-text", logo: "slot-logo-outro" },
        platforms: [
          { name: "Android", icon: "android", url: "https://play.google.com/store/apps/details?id=com.appsy.calls" },
          { name: "iOS", icon: "apple", url: "https://apps.apple.com/app/appsy/id123456789" },
          { name: "Windows", icon: "windows", url: "https://appsy.com/download/windows" },
          { name: "Website", icon: "globe", url: "https://appsy.com" }
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
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;700;800&display=swap" rel="stylesheet">
  <style>
    html, body {
      margin: 0;
      padding: 0;
      width: 1920px;
      height: 1080px;
      overflow: hidden;
      background: #f8fafc;
      font-family: 'Outfit', sans-serif;
      color: #0f172a;
      -webkit-font-smoothing: antialiased;
    }
    
    .canvas {
      position: relative;
      width: 1920px;
      height: 1080px;
      overflow: hidden;
      background: #f8fafc;
    }

    /* Trajectory dashed curves */
    .bg-dashed-curve {
      position: absolute;
      top: 50%;
      left: 50%;
      width: 1500px;
      height: 800px;
      border: 3px dashed rgba(15, 23, 42, 0.06);
      border-radius: 50%;
      transform: translate(-50%, -50%) rotate(-12deg);
      pointer-events: none;
      z-index: 1;
    }

    /* Floating Sky Blue pills */
    .decor-pill {
      position: absolute;
      width: 54px;
      height: 54px;
      background: #1d9bf0;
      border-radius: 16px;
      box-shadow: 0 8px 24px rgba(29, 155, 240, 0.25);
      z-index: 2;
    }
    .decor-ring {
      position: absolute;
      width: 32px;
      height: 32px;
      border: 6px solid #1d9bf0;
      border-radius: 50%;
      z-index: 2;
    }

    .scene {
      position: absolute;
      inset: 0;
      width: 1920px;
      height: 1080px;
      display: none;
      align-items: center;
      justify-content: center;
      z-index: 3;
      padding: 0 10%;
      box-sizing: border-box;
    }
    
    .scene.active, .scene.playing {
      display: flex;
    }
    
    .scene-content {
      display: flex;
      width: 100%;
      height: 100%;
      align-items: center;
      justify-content: space-between;
      position: relative;
    }

    /* Typography Columns */
    .copy-col {
      flex: 1.1;
      max-width: 800px;
      display: flex;
      flex-direction: column;
      justify-content: center;
      z-index: 5;
    }
    .copy-col.right-side {
      text-align: right;
      align-items: flex-end;
    }
    .copy-col.centered {
      text-align: center;
      align-items: center;
      max-width: 1200px;
      margin: 0 auto;
    }

    .title-black {
      font-size: 64px;
      font-weight: 800;
      line-height: 1.15;
      margin: 0 0 16px 0;
      color: #0f172a;
      letter-spacing: -1px;
    }
    .subtitle-grey {
      font-size: 24px;
      font-weight: 400;
      line-height: 1.5;
      color: #64748b;
      margin: 0;
      max-width: 600px;
    }

    /* Device column & viewports */
    .device-col {
      flex: 0.9;
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100%;
      z-index: 4;
    }
    
    .phone-3d-viewport {
      perspective: 1600px;
      width: 600px;
      height: 900px;
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
    }
    
    .phone-3d-scaler {
      transform-style: preserve-3d;
      transform: scale(0.92);
      z-index: 2;
    }
    
    .phone-3d-rig {
      position: relative;
      width: 370px;
      height: 760px;
      transform-style: preserve-3d;
      border-radius: 48px;
      /* Thin metal side rail (thickness) + fine metallic highlight line along the chassis boundary */
      box-shadow:
        0 0 0 2px #22252c,
        0 0 0 3px rgba(255, 255, 255, 0.14),
        0 30px 70px rgba(0, 0, 0, 0.28);
    }

    /* Dedicated 38180229 chassis: matte ink finish, side hardware accents (rung: CSS pseudo-elements, no markup change) */
    .phone-3d-rig::before, .phone-3d-rig::after {
      content: '';
      position: absolute;
      background: #1a1d24;
      z-index: 9;
      border-radius: 3px;
    }
    .phone-3d-rig::before { /* volume rocker - left */
      left: -3px;
      top: 140px;
      width: 4px;
      height: 70px;
    }
    .phone-3d-rig::after { /* power button - right */
      right: -3px;
      top: 160px;
      width: 4px;
      height: 50px;
    }

    .phone-face {
      position: absolute;
      inset: 0;
      border-radius: 48px;
      box-sizing: border-box;
    }

    .phone-face.front {
      background: #0d0f14;
      transform: translateZ(9px);
      z-index: 10;
      overflow: hidden;
      padding: 8px; /* ultra-thin symmetrical bezel around the active display */
    }

    .screen-scroll-wrap {
      width: 100%;
      height: 100%;
      border-radius: 40px; /* outer 48px minus 8px bezel */
      overflow: hidden;
      position: relative;
      background: #0d0f14;
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

    /* Glossy reflection sheen overlay */
    .gloss-sheen {
      position: absolute;
      inset: 0;
      background: linear-gradient(135deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0.02) 40%, rgba(255,255,255,0.06) 100%);
      z-index: 11;
      pointer-events: none;
      border-radius: 40px;
    }

    .screen-edge-glare {
      position: absolute;
      top: 0;
      bottom: 0;
      width: 10px;
      background: linear-gradient(to right, rgba(255, 255, 255, 0.12), transparent);
      z-index: 12;
      pointer-events: none;
    }
    .screen-edge-glare.left-edge { left: 0; }
    .screen-edge-glare.right-edge { right: 0; transform: scaleX(-1); }

    .curved-edge-shadow {
      position: absolute;
      top: 0;
      bottom: 0;
      width: 20px;
      z-index: 13;
      pointer-events: none;
    }
    .curved-edge-shadow.left {
      left: 0;
      background: linear-gradient(to right, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0.2) 50%, transparent 100%);
    }
    .curved-edge-shadow.right {
      right: 0;
      background: linear-gradient(to left, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0.2) 50%, transparent 100%);
    }

    /* True 3D side rail panels — thin brushed-metal edges revealed by the existing rotateY yaw */
    .phone-side {
      position: absolute;
      top: 48px; /* inset by the corner radius so the flat rail never pokes past the rounded corners */
      height: calc(100% - 96px);
      width: 18px;
      background: linear-gradient(180deg, #3a3f4a 0%, #14161b 50%, #3a3f4a 100%);
    }
    .phone-side.left {
      left: 0;
      transform-origin: left center;
      transform: rotateY(-90deg);
    }
    .phone-side.right {
      right: 0;
      transform-origin: right center;
      transform: rotateY(90deg);
    }

    /* Grounding floor shadow beneath each device */
    .phone-3d-viewport::after {
      content: '';
      position: absolute;
      bottom: 60px;
      left: 50%;
      width: 260px;
      height: 36px;
      background: radial-gradient(ellipse at center, rgba(15, 23, 42, 0.28) 0%, rgba(15, 23, 42, 0) 72%);
      transform: translateX(-50%);
      z-index: 1;
      pointer-events: none;
    }

    .camera-punch {
      position: absolute;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      width: 12px;
      height: 12px;
      background: #08080c;
      border-radius: 50%;
      border: 1.5px solid #1a1a24;
      z-index: 15;
    }

    /* Floating Shield Badge Accent (Scene 4) */
    .security-badge {
      position: absolute;
      width: 80px;
      height: 80px;
      background: #1d9bf0;
      border-radius: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 10px 30px rgba(29, 155, 240, 0.35);
      z-index: 12;
      color: #fff;
    }

    /* Floating calling bubble badges (Scene 6) */
    .call-bubble-badge {
      position: absolute;
      background: #ffffff;
      color: #0f172a;
      font-weight: 500;
      font-size: 16px;
      padding: 10px 18px;
      border-radius: 18px;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08);
      z-index: 12;
      pointer-events: none;
      border: 1px solid rgba(0,0,0,0.03);
    }

    /* Squircle App Logo design */
    .logo-squircle {
      width: 160px;
      height: 160px;
      background: #ffffff;
      border-radius: 38px;
      box-shadow: 0 20px 48px rgba(0, 0, 0, 0.08);
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 30px;
      border: 1px solid rgba(0,0,0,0.02);
    }
    .logo-icon {
      width: 84px;
      height: 84px;
      background: #1d9bf0;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #ffffff;
      font-size: 42px;
      font-weight: 800;
    }

    /* Store Download Badges */
    .store-badges {
      display: flex;
      gap: 16px;
      margin-top: 32px;
    }
    .store-badge {
      height: 48px;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.08);
    }

    /* Multi-platform download grid with live QR codes (Scene 7) */
    .platform-grid {
      display: flex;
      gap: 20px;
      margin-top: 36px;
    }
    .platform-card {
      display: flex;
      flex-direction: column;
      align-items: center;
      background: #ffffff;
      border-radius: 18px;
      padding: 16px 20px;
      box-shadow: 0 10px 28px rgba(0,0,0,0.08);
      border: 1px solid rgba(0,0,0,0.03);
    }
    .platform-card .qr-wrap {
      width: 96px;
      height: 96px;
      margin-bottom: 10px;
    }
    .platform-card .qr-wrap svg {
      width: 100%;
      height: 100%;
      display: block;
    }
    .platform-name-row {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .platform-name {
      font-size: 14px;
      font-weight: 600;
      color: #0f172a;
    }

    ${getUniversalPlayerScriptAndStyle(config).style}
  </style>
</head>
<body>
  <div class="canvas">
    <!-- Faint background dashed curves -->
    <div class="bg-dashed-curve"></div>

    <!-- Floating Pill & Ring Decor Elements -->
    <div class="decor-pill" id="pill-1" style="top: 240px; left: 160px;"></div>
    <div class="decor-pill" id="pill-2" style="bottom: 220px; right: 180px;"></div>
    <div class="decor-ring" id="ring-1" style="top: 140px; right: 280px;"></div>
    <div class="decor-ring" id="ring-2" style="bottom: 120px; left: 240px;"></div>

    <!-- Scene 1: App Logo Opener -->
    <div class="scene" id="scene-0">
      <div class="scene-content" style="justify-content: center; flex-direction: column; align-items: center; text-align: center;">
        <div class="logo-squircle" id="s0-logo">
          <div class="logo-icon">a</div>
        </div>
        <div class="copy-col centered">
          <h1 class="title-black" id="s0-text">Appsy: Free and secure video calls</h1>
        </div>
      </div>
    </div>

    <!-- Scene 2: Video Calling Made With Love -->
    <div class="scene" id="scene-1">
      <div class="scene-content">
        <!-- Phone chassis left -->
        <div class="device-col">
          <div class="phone-3d-viewport">
            <div class="phone-3d-scaler" style="transform: scale(0.92);">
              <div class="phone-3d-rig" id="phone-rig-1">
                <div class="phone-side left"></div>
                <div class="phone-side right"></div>
                <div class="phone-face front">
                  <div class="camera-punch"></div>
                  <div class="gloss-sheen"></div>
                  <div class="screen-edge-glare left-edge"></div>
                  <div class="screen-edge-glare right-edge"></div>
                  <div class="curved-edge-shadow left"></div>
                  <div class="curved-edge-shadow right"></div>
                  <div class="screen-scroll-wrap">
                    <img class="phone-screen" id="slot-0" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" alt="Screen 1" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <!-- Text right -->
        <div class="copy-col">
          <h2 class="title-black" id="s1-text">Video calling app made with love</h2>
        </div>
      </div>
    </div>

    <!-- Scene 3: Make group calls in a few clicks! -->
    <div class="scene" id="scene-2">
      <div class="scene-content">
        <!-- Text left -->
        <div class="copy-col">
          <h2 class="title-black" id="s2-text">Make group calls in a few clicks!</h2>
        </div>

        <!-- Phone chassis right inside skyblue panel card -->
        <div class="device-col" style="position: relative; justify-content: flex-end; padding-right: 4%;">
          <!-- Panel card background accent -->
          <div id="s2-accent-panel" style="position: absolute; top: 0; right: 0; bottom: 0; width: 440px; background: #1d9bf0; z-index: 1; border-radius: 36px 0 0 36px; box-shadow: -15px 0 35px rgba(29, 155, 240, 0.08);"></div>
          
          <div class="phone-3d-viewport" style="z-index: 2;">
            <div class="phone-3d-scaler" style="transform: scale(0.92);">
              <div class="phone-3d-rig" id="phone-rig-2">
                <div class="phone-side left"></div>
                <div class="phone-side right"></div>
                <div class="phone-face front">
                  <div class="camera-punch"></div>
                  <div class="gloss-sheen"></div>
                  <div class="screen-edge-glare left-edge"></div>
                  <div class="screen-edge-glare right-edge"></div>
                  <div class="curved-edge-shadow left"></div>
                  <div class="curved-edge-shadow right"></div>
                  <div class="screen-scroll-wrap">
                    <img class="phone-screen" id="slot-1" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" alt="Screen 2" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Scene 4: Built-in Encryption -->
    <div class="scene" id="scene-3">
      <div class="scene-content" style="justify-content: center; align-items: center;">
        <!-- Left title -->
        <div class="copy-col" style="flex: 0.8;">
          <h2 class="title-black" id="s3-text">Built-in encryption</h2>
        </div>

        <!-- Center Phone -->
        <div class="device-col" style="position: relative; flex: 1.2;">
          <!-- Floating security shield badge -->
          <div class="security-badge" id="s3-security-badge" style="top: 42%; left: 16%; transform: translate(-50%, -50%);">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              <path d="m9 11 2 2 4-4"/>
            </svg>
          </div>
          
          <div class="phone-3d-viewport">
            <div class="phone-3d-scaler" style="transform: scale(0.90);">
              <div class="phone-3d-rig" id="phone-rig-3">
                <div class="phone-side left"></div>
                <div class="phone-side right"></div>
                <div class="phone-face front">
                  <div class="camera-punch"></div>
                  <div class="gloss-sheen"></div>
                  <div class="screen-edge-glare left-edge"></div>
                  <div class="screen-edge-glare right-edge"></div>
                  <div class="curved-edge-shadow left"></div>
                  <div class="curved-edge-shadow right"></div>
                  <div class="screen-scroll-wrap">
                    <img class="phone-screen" id="slot-2" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" alt="Screen 3" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Right description -->
        <div class="copy-col" style="flex: 0.8;">
          <p class="subtitle-grey" id="s3-subtext">The process of converting data into a code to prevent unauthorized access</p>
        </div>
      </div>
    </div>

    <!-- Scene 5: Easy Snapshots During Call -->
    <div class="scene" id="scene-4">
      <div class="scene-content">
        <!-- Title left -->
        <div class="copy-col">
          <h2 class="title-black" id="s4-text">Easy take snapshots during the call</h2>
          <p class="subtitle-grey" id="s4-subtext" style="font-weight: 500; color: #1d9bf0;">Snap. Save. Done</p>
        </div>

        <!-- Phone right -->
        <div class="device-col">
          <div class="phone-3d-viewport">
            <div class="phone-3d-scaler" style="transform: scale(0.92);">
              <div class="phone-3d-rig" id="phone-rig-4">
                <div class="phone-side left"></div>
                <div class="phone-side right"></div>
                <div class="phone-face front">
                  <div class="camera-punch"></div>
                  <div class="gloss-sheen"></div>
                  <div class="screen-edge-glare left-edge"></div>
                  <div class="screen-edge-glare right-edge"></div>
                  <div class="curved-edge-shadow left"></div>
                  <div class="curved-edge-shadow right"></div>
                  <div class="screen-scroll-wrap">
                    <img class="phone-screen" id="slot-3" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" alt="Screen 4" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Scene 6: Download. Sign Up. Call. -->
    <div class="scene" id="scene-5">
      <div class="scene-content" style="flex-direction: column; justify-content: center; align-items: center;">
        <!-- Top title -->
        <h2 class="title-black" id="s5-text" style="margin-bottom: 24px;">Download. Sign Up. Call.</h2>
        
        <!-- Center Phone with floating bubble badges -->
        <div class="device-col" style="position: relative; height: 780px;">
          <!-- Floating call bubbles -->
          <div class="call-bubble-badge" id="s5-badge-1" style="top: 15%; left: -22%;">Free app</div>
          <div class="call-bubble-badge" id="s5-badge-2" style="top: 25%; right: -25%;">High-quality calls</div>
          <div class="call-bubble-badge" id="s5-badge-3" style="top: 50%; right: -28%;">No SIM card required</div>

          <div class="phone-3d-viewport">
            <div class="phone-3d-scaler" style="transform: scale(0.90);">
              <div class="phone-3d-rig" id="phone-rig-5">
                <div class="phone-side left"></div>
                <div class="phone-side right"></div>
                <div class="phone-face front">
                  <div class="camera-punch"></div>
                  <div class="gloss-sheen"></div>
                  <div class="screen-edge-glare left-edge"></div>
                  <div class="screen-edge-glare right-edge"></div>
                  <div class="curved-edge-shadow left"></div>
                  <div class="curved-edge-shadow right"></div>
                  <div class="screen-scroll-wrap">
                    <img class="phone-screen" id="slot-4" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" alt="Screen 5" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Scene 7: Outro Call-to-Action -->
    <div class="scene" id="scene-6">
      <div class="scene-content" style="justify-content: center; flex-direction: column; align-items: center; text-align: center;">
        <div class="logo-squircle" id="s6-logo">
          <div class="logo-icon">a</div>
        </div>
        <div class="copy-col centered">
          <h1 class="title-black" id="s6-text">Appsy: Free and secure video calls</h1>

          <div class="platform-grid" id="s6-platforms">
            ${config.scenes[6].platforms.map(p => `
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
      // Background decorating floating items
      const p1 = document.getElementById("pill-1");
      const p2 = document.getElementById("pill-2");
      const r1 = document.getElementById("ring-1");
      const r2 = document.getElementById("ring-2");

      if (p1) p1.style.transform = "translateY(" + (Math.sin(globalTimeMs * 0.001) * 12) + "px) rotate(" + (globalTimeMs * 0.001) + "deg)";
      if (p2) p2.style.transform = "translateY(" + (Math.cos(globalTimeMs * 0.0012) * 12) + "px) rotate(" + (-globalTimeMs * 0.0008) + "deg)";
      if (r1) r1.style.transform = "translate(" + (Math.sin(globalTimeMs * 0.0008) * 8) + "px, " + (Math.cos(globalTimeMs * 0.0008) * 8) + "px)";
      if (r2) r2.style.transform = "translateY(" + (Math.sin(globalTimeMs * 0.0014) * 10) + "px)";

      // Easing helper (cubic ease-out) over a 0..0.45 entry window
      function easeWindow(p, window) {
        const t = Math.min(1, Math.max(0, p / window));
        return 1 - Math.pow(1 - t, 3);
      }

      // Post-entry ambient drift: blends a slow sinusoidal float into the settled rig
      // (e is the entry-ease amount, so drift ramps in only as the entrance completes)
      function applyRigDrift(rig, offsetX, offsetY, baseYawDeg, e) {
        if (!rig) return;
        const driftYaw = Math.sin(globalTimeMs * 0.001) * 2.5 * e;
        const driftPitch = Math.cos(globalTimeMs * 0.0012) * 1.5 * e;
        const driftX = Math.sin(globalTimeMs * 0.0009) * 8 * e;
        const driftY = Math.cos(globalTimeMs * 0.0011) * 8 * e;
        rig.style.transform = "translate(" + (offsetX + driftX) + "px, " + (offsetY + driftY) + "px) rotateY(" + (baseYawDeg + driftYaw) + "deg) rotateX(" + driftPitch + "deg)";
      }

      if (sceneIdx === 0) { // Scene 1: staged zoom (0-0.4) then text reveal (0.4-0.8)
        const logo = document.getElementById("s0-logo");
        const text = document.getElementById("s0-text");
        if (logo) {
          const eLogo = easeWindow(progress, 0.4);
          logo.style.transform = "scale(" + (0.35 + 0.65 * eLogo) + ")";
        }
        if (text) {
          const eText = Math.min(1, Math.max(0, (progress - 0.4) / 0.4));
          const eased = 1 - Math.pow(1 - eText, 3);
          text.style.opacity = eased;
          text.style.transform = "translateY(" + (30 * (1 - eased)) + "px)";
        }
      }
      else if (sceneIdx === 1) { // Scene 2: vertical upward entrance (phone + copy)
        const rig = document.getElementById("phone-rig-1");
        const text = document.getElementById("s1-text");
        const e = easeWindow(progress, 0.45);
        const offset = 480 * (1 - e);
        applyRigDrift(rig, 0, offset, -10, e);
        if (text) { text.style.transform = "translateY(" + offset + "px)"; text.style.opacity = e; }
      }
      else if (sceneIdx === 2) { // Scene 3: right-to-left entrance (panel + phone)
        const rig = document.getElementById("phone-rig-2");
        const panel = document.getElementById("s2-accent-panel");
        const text = document.getElementById("s2-text");
        const e = easeWindow(progress, 0.45);
        const offset = 480 * (1 - e);
        applyRigDrift(rig, offset, 0, 10, e);
        if (panel) panel.style.transform = "translateX(" + offset + "px)";
        if (text) text.style.opacity = e;
      }
      else if (sceneIdx === 3) { // Scene 4: center phone enters from right, concurrent with copy fade
        const rig = document.getElementById("phone-rig-3");
        const badge = document.getElementById("s3-security-badge");
        const e = easeWindow(progress, 0.45);
        const offset = 380 * (1 - e);
        applyRigDrift(rig, offset, 0, 0, e);
        if (badge) { badge.style.opacity = e; badge.style.transform = "translate(-50%, -50%) scale(" + e + ")"; }
      }
      else if (sceneIdx === 4) { // Scene 5: vertical upward entrance
        const rig = document.getElementById("phone-rig-4");
        const text = document.getElementById("s4-text");
        const e = easeWindow(progress, 0.45);
        const offset = 480 * (1 - e);
        applyRigDrift(rig, 0, offset, 10, e);
        if (text) { text.style.transform = "translateY(" + offset + "px)"; text.style.opacity = e; }
      }
      else if (sceneIdx === 5) { // Scene 6: vertical downward entrance (from top) + badges
        const rig = document.getElementById("phone-rig-5");
        const title = document.getElementById("s5-text");
        const b1 = document.getElementById("s5-badge-1");
        const b2 = document.getElementById("s5-badge-2");
        const b3 = document.getElementById("s5-badge-3");
        const e = easeWindow(progress, 0.45);
        const offset = -480 * (1 - e);
        applyRigDrift(rig, 0, offset, 0, e);
        if (title) { title.style.transform = "translateY(" + offset + "px)"; title.style.opacity = e; }
        if (b1) { b1.style.opacity = Math.min(1, Math.max(0, (progress - 0.25) / 0.15)); b1.style.transform = "translateY(" + (8 * (1 - e)) + "px)"; }
        if (b2) { b2.style.opacity = Math.min(1, Math.max(0, (progress - 0.35) / 0.15)); b2.style.transform = "translateY(" + (8 * (1 - e)) + "px)"; }
        if (b3) { b3.style.opacity = Math.min(1, Math.max(0, (progress - 0.45) / 0.15)); b3.style.transform = "translateY(" + (8 * (1 - e)) + "px)"; }
      }
      else if (sceneIdx === 6) { // Scene 7: vertical downward entrance + platform grid reveal
        const logo = document.getElementById("s6-logo");
        const text = document.getElementById("s6-text");
        const grid = document.getElementById("s6-platforms");
        const e = easeWindow(progress, 0.45);
        const offset = -380 * (1 - e);
        if (logo) logo.style.transform = "translateY(" + offset + "px) scale(" + (0.8 + 0.2 * e) + ")";
        if (text) { text.style.opacity = e; text.style.transform = "translateY(" + offset + "px)"; }
        if (grid) grid.style.opacity = Math.min(1, Math.max(0, (progress - 0.4) / 0.3));
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
  create38180229Template();
}
