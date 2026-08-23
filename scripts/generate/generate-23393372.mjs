import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getUniversalPlayerScriptAndStyle } from './player-helper.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../..');

export function create23393372Template() {
  const config = {
    id: "tpl-23393372-neon-rings",
    name: "Neon Crimson Rings — 23393372 Full Recreation",
    description: "Authentic full recreation of 23393372.mp4 with 8 full scenes, curved-glass 3D phone geometry, orbital neon rings, and crimson urban night styling.",
    useCase: "Best for high-contrast neon app promo and dramatic 3D mobile showcases.",
    designStyle: "Neon Crimson 3D",
    aspectRatio: "16:9",
    features: [
      "8 full video scenes",
      "Curved dual-edge infinity glass 3D phone",
      "Metallic chrome donut ring + concentric neon rings",
      "Landscape and duo-device rigs",
      "Panoramic fan-out screen parallax",
      "Live synchronized active scene cards"
    ],
    device: "samsung-galaxy-s25",
    variant: "neon-rings-3d",
    deviceFraction: 0.6,
    scenes: [
      {
        label: "App Promo",
        sceneTemplate: "hero-rise",
        durationSeconds: 6,
        background: "graphite",
        rotate: 0,
        zoom: 10,
        move: 0,
        layout: "centre-flank",
        text: "APP PROMO",
        subtext: "Suitable for all app and mobile promotion needs",
        slots: { text: "s0-text", subtext: "s0-subtext", screenshot: "slot-0" }
      },
      {
        label: "Effective Way",
        sceneTemplate: "hero-rise",
        durationSeconds: 6,
        background: "graphite",
        rotate: 0,
        zoom: 10,
        move: 0,
        layout: "copy-left",
        text: "EFFECTIVE WAY TO TELL ABOUT THE PRODUCT",
        subtext: "This project is suitable for all. Change the text, font, insert your photos or videos.",
        slots: { text: "s1-text", subtext: "s1-subtext", screenshot: "slot-1" }
      },
      {
        label: "Beautiful Modern Design",
        sceneTemplate: "hero-rise",
        durationSeconds: 5,
        background: "graphite",
        rotate: 0,
        zoom: 10,
        move: 0,
        layout: "copy-right",
        text: "BEAUTIFUL MODERN DESIGN",
        subtext: "Panoramic fan-out screens showcase every detail",
        slots: { text: "s2-text", subtext: "s2-subtext", screenshot: "slot-2", screenshots: ["slot-2", "slot-2b", "slot-2c"] }
      },
      {
        label: "Easy to Customize",
        sceneTemplate: "hero-rise",
        durationSeconds: 7,
        background: "graphite",
        rotate: 0,
        zoom: 10,
        move: 0,
        layout: "copy-left",
        text: "EASY TO CUSTOMIZE",
        subtext: "Full control over color, text, and media placeholders",
        slots: { text: "s3-text", subtext: "s3-subtext", screenshot: "slot-3" }
      },
      {
        label: "Color Control",
        sceneTemplate: "hero-rise",
        durationSeconds: 5,
        background: "graphite",
        rotate: 0,
        zoom: 10,
        move: 0,
        layout: "centre-flank",
        text: "COLOR CONTROL",
        subtext: "Adjust every accent color to match your brand",
        slots: { text: "s4-text", subtext: "s4-subtext", screenshot: "slot-4" }
      },
      {
        label: "Modular Structure",
        sceneTemplate: "hero-rise",
        durationSeconds: 5,
        background: "graphite",
        rotate: 0,
        zoom: 10,
        move: 0,
        layout: "copy-right",
        text: "MODULAR STRUCTURE",
        subtext: "Rearrange scenes freely with a fully modular layout",
        slots: { text: "s5-text", subtext: "s5-subtext", screenshot: "slot-5" }
      },
      {
        label: "Media Player",
        sceneTemplate: "hero-rise",
        durationSeconds: 5,
        background: "graphite",
        rotate: 0,
        zoom: 10,
        move: 0,
        layout: "stacked-top",
        text: "MEDIA PLAYER",
        subtext: "Landscape media playback showcase",
        slots: { text: "s6-text", subtext: "s6-subtext", screenshot: "slot-6", screenshotLandscape: "slot-6-land" }
      },
      {
        label: "Available on VideoHive",
        sceneTemplate: "hero-rise",
        durationSeconds: 6,
        background: "graphite",
        rotate: 0,
        zoom: 10,
        move: 0,
        layout: "centre-flank",
        text: "AVAILABLE ON VIDEOHIVE",
        subtext: "Download today and customize every scene",
        slots: { text: "s7-text", subtext: "s7-subtext", screenshot: "slot-7" }
      }
    ]
  };

  const player = getUniversalPlayerScriptAndStyle(config);

  const dotDivider = `<div class="dot-divider"><span></span><span></span><span></span></div>`;

  const phoneFrontFace = (slotId, defaultBg, innerContent = '') => `
    <div class="phone-face front">
      <div class="phone-top-bezel">
        <div class="phone-speaker-grille"></div>
        <div class="phone-camera-dot"></div>
      </div>
      <div class="phone-screen-frame" style="background: ${defaultBg};">
        <img class="phone-screen" id="${slotId}" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" alt="Screen" />
        ${innerContent}
        <div class="gloss-sheen"></div>
      </div>
    </div>
  `;

  // Custom face specifically for Scene 7 portrait-to-landscape transition supporting dual image slots
  const phoneFrontFaceDual = (portraitSlotId, landscapeSlotId, defaultBg, innerContent = '') => `
    <div class="phone-face front">
      <div class="phone-top-bezel">
        <div class="phone-speaker-grille"></div>
        <div class="phone-camera-dot"></div>
      </div>
      <div class="phone-screen-frame" style="background: ${defaultBg};">
        <img class="phone-screen portrait-src" id="${portraitSlotId}" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" alt="Screen Portrait" />
        <img class="phone-screen landscape-src" id="${landscapeSlotId}" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" alt="Screen Landscape" />
        ${innerContent}
        <div class="gloss-sheen"></div>
      </div>
    </div>
  `;

  const phone3D = (rigId, slotId, defaultBg, innerContent = '', extraClass = '') => `
    <div class="phone-3d-container ${extraClass}">
      <div class="phone-3d-rig" id="${rigId}">
        <div class="phone-ambient-shadow"></div>
        ${phoneFrontFace(slotId, defaultBg, innerContent)}
        <div class="phone-face back">
          <div class="back-camera-module">
            <div class="back-lens"></div>
            <div class="back-lens"></div>
            <div class="back-flash"></div>
          </div>
          <div class="back-fingerprint"></div>
        </div>
        <div class="phone-side side-left">
          <div class="side-btn volume-up"></div>
          <div class="side-btn volume-down"></div>
        </div>
        <div class="phone-side side-right">
          <div class="side-btn power-btn"></div>
        </div>
        <div class="phone-side side-top"></div>
        <div class="phone-side side-bottom">
          <div class="usb-port"></div>
        </div>
      </div>
    </div>
  `;

  const phone3DDual = (rigId, portraitSlotId, landscapeSlotId, defaultBg, innerContent = '', extraClass = '') => `
    <div class="phone-3d-container ${extraClass}">
      <div class="phone-3d-rig" id="${rigId}">
        <div class="phone-ambient-shadow"></div>
        ${phoneFrontFaceDual(portraitSlotId, landscapeSlotId, defaultBg, innerContent)}
        <div class="phone-face back">
          <div class="back-camera-module">
            <div class="back-lens"></div>
            <div class="back-lens"></div>
            <div class="back-flash"></div>
          </div>
          <div class="back-fingerprint"></div>
        </div>
        <div class="phone-side side-left">
          <div class="side-btn volume-up"></div>
          <div class="side-btn volume-down"></div>
        </div>
        <div class="phone-side side-right">
          <div class="side-btn power-btn"></div>
        </div>
        <div class="phone-side side-top"></div>
        <div class="phone-side side-bottom">
          <div class="usb-port"></div>
        </div>
      </div>
    </div>
  `;

  // Specific screens SVG / CSS UI overlays to match 23393372.mp4 vibe
  const redWallpaperMockup = `
    <div class="mockup-ui red-wallpaper"></div>
  `;

  const mockupMiddleScreen = `
    <div class="mockup-ui screen-medium-dark">
      <div class="mock-header">Overview</div>
      <div class="mock-list">
        <div class="mock-item"><span>Dashboard</span></div>
        <div class="mock-item"><span>Analytics</span></div>
        <div class="mock-item"><span>Settings</span></div>
      </div>
    </div>
  `;

  const mockupRightScreen = `
    <div class="mockup-ui screen-very-dark">
      <div class="mock-center-circle"></div>
      <div class="mock-sub">LOREM IPSUM</div>
    </div>
  `;

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${config.name}</title>
  <style>
    html, body { margin:0; padding:0; width:1920px; height:1080px; overflow:hidden; background:#050507; font-family:'Montserrat','Inter',sans-serif; color:#ffffff; }
    .canvas { position:relative; width:1920px; height:1080px; background:radial-gradient(circle at center, #150910 0%, #030305 100%); overflow:hidden; }

    /* Urban night city bokeh backdrop */
    .city-bokeh { position:absolute; inset:0; z-index:1; opacity:0.95;
      background:
        radial-gradient(circle at 15% 25%, rgba(232,23,93,0.18) 0%, transparent 15%),
        radial-gradient(circle at 82% 18%, rgba(255,42,109,0.14) 0%, transparent 12%),
        radial-gradient(circle at 30% 75%, rgba(232,23,93,0.12) 0%, transparent 16%),
        radial-gradient(circle at 88% 68%, rgba(255,42,109,0.16) 0%, transparent 13%),
        radial-gradient(circle at 60% 40%, rgba(232,23,93,0.08) 0%, transparent 60%);
    }
    .skyline { position:absolute; bottom:0; left:0; width:100%; height:280px; z-index:1; opacity:0.4;
      background:repeating-linear-gradient(90deg, rgba(255,255,255,0.03) 0px, rgba(255,255,255,0.03) 40px, transparent 40px, transparent 90px);
      mask-image:linear-gradient(to top, black 0%, transparent 100%);
      -webkit-mask-image:linear-gradient(to top, black 0%, transparent 100%);
    }

    /* Orbital neon rings (kept behind the phone) */
    .neon-rings-wrap { position:absolute; left:50%; top:50%; transform:translate(-50%, -50%); width:900px; height:900px; pointer-events:none; z-index:2; transform-style:preserve-3d; perspective:1200px; }
    .neon-ring { position:absolute; border-radius:50%; border:2px solid rgba(232,23,93,0.35); box-shadow:0 0 25px rgba(232,23,93,0.28), inset 0 0 25px rgba(232,23,93,0.22); }
    .ring-outer { width:820px; height:820px; left:40px; top:40px; border-style:dashed; }
    .ring-mid { width:640px; height:640px; left:130px; top:130px; opacity:0.8; }
    .ring-inner { width:460px; height:460px; left:220px; top:220px; border-width:1px; opacity:0.6; }
    .chrome-donut { position:absolute; left:50%; top:50%; width:260px; height:260px; margin:-130px 0 0 -130px; border-radius:50%; z-index:3; pointer-events:none;
      background:conic-gradient(from 0deg, #f5f5f5, #9ca3af 25%, #f5f5f5 50%, #6b7280 75%, #f5f5f5 100%);
      -webkit-mask:radial-gradient(circle, transparent 62%, black 63%);
      mask:radial-gradient(circle, transparent 62%, black 63%);
      box-shadow:0 0 40px rgba(0,0,0,0.5);
    }
    .float-plus, .float-cross { position:absolute; color:rgba(255,255,255,0.45); font-weight:200; pointer-events:none; z-index:2; text-shadow:0 0 12px rgba(232,23,93,0.3); }
    .float-plus { font-size:34px; }
    .float-cross { font-size:26px; }

    /* Scene layout */
    .scene { position:absolute; inset:0; width:1920px; height:1080px; display:none; align-items:center; justify-content:center; z-index:8; padding:0 8%; box-sizing:border-box; }
    .scene.active, .scene.playing { display:flex; }
    .scene-content { display:flex; width:100%; height:100%; align-items:center; justify-content:space-between; position:relative; }
    .copy-col { flex:1.1; max-width:820px; display:flex; flex-direction:column; justify-content:center; z-index:10; transition:all 0.4s ease; }
    .copy-col.right-side { text-align:right; align-items:flex-end; max-width: 680px; }
    .copy-col.center-col { text-align:center; align-items:center; max-width:100%; }
    .title { font-size:68px; font-weight:900; text-transform:uppercase; line-height:1.12; letter-spacing:-1px; margin:0 0 20px 0; color:#ffffff; text-shadow:0 4px 20px rgba(0,0,0,0.8); }
    .dot-divider { display:flex; gap:8px; margin-bottom:20px; }
    .dot-divider span { width:8px; height:8px; border-radius:50%; background:#e8175d; box-shadow:0 0 10px #ff2a6d; }
    .copy-col.right-side .dot-divider, .copy-col.center-col .dot-divider { justify-content:flex-end; }
    .copy-col.center-col .dot-divider { justify-content:center; }
    .subtitle { font-size:25px; font-weight:500; line-height:1.6; color:#cfcfcf; margin:0; max-width:600px; }

    /* Curved-glass 3D phone style */
    .phone-3d-container { perspective:1600px; width:600px; height:920px; display:flex; align-items:center; justify-content:center; transform-style:preserve-3d; }
    .phone-3d-container.landscape-mode { width:920px; height:600px; }
    .phone-3d-rig { position:relative; width:370px; height:760px; transform-style:preserve-3d; }
    
    .phone-face { position:absolute; inset:0; border-radius:46px; box-sizing:border-box; }
    .phone-face.front { background:#0a0a0f; transform:translateZ(10px); z-index:10; border:1px solid #232329; overflow:hidden; box-shadow:inset 0 0 25px rgba(255,42,109,0.15); display:flex; flex-direction:column; }
    .phone-top-bezel { height:40px; display:flex; align-items:center; justify-content:center; position:relative; background:#000000; z-index:5; }
    .phone-speaker-grille { width:58px; height:4px; border-radius:2px; background:#475569; }
    .phone-camera-dot { position:absolute; right:110px; top:50%; transform:translateY(-50%); width:8px; height:8px; border-radius:50%; background:#0f172a; box-shadow:inset 0 0 2px #ff2a6d; }
    
    /* Screen frame rounded directly at the bottom to solve CSS 3D parent overflow clip bugs */
    .phone-screen-frame { flex:1; position:relative; overflow:hidden; background:#0f0f14; border-radius:0 0 44px 44px;
      background-image:linear-gradient(90deg, rgba(255,255,255,0.18) 0%, transparent 8%, transparent 92%, rgba(255,255,255,0.18) 100%);
    }
    .phone-screen { width:100%; height:100%; object-fit:cover; display:block; border-radius:inherit; }
    .gloss-sheen { position:absolute; inset:0; background:linear-gradient(105deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0.02) 40%, rgba(255,255,255,0.12) 100%); z-index:11; pointer-events:none; }
    
    /* Dual image slot support for Scene 7 - slightly enlarged landscape slot to guarantee 100% coverage */
    .phone-screen.portrait-src { position:absolute; inset:0; z-index:3; opacity:1; }
    .phone-screen.landscape-src { position:absolute; width:740px; height:380px; left:50%; top:50%; transform:translate(-50%, -50%) rotate(90deg); object-fit:cover; z-index:2; opacity:0; }

    /* Rear Chassis */
    .phone-face.back { background:linear-gradient(135deg, #121218 0%, #050507 100%); transform:rotateY(180deg) translateZ(10px); border:2px solid #ff2a6d; box-shadow:0 30px 60px rgba(0,0,0,0.65); display:flex; align-items:center; justify-content:center; }
    .back-camera-module { position:absolute; top:40px; left:50%; transform:translateX(-50%); width:70px; height:120px; border-radius:20px; background:#0a0a0f; border:2px solid #2a2a30; display:flex; flex-direction:column; align-items:center; justify-content:space-evenly; }
    .back-lens { width:38px; height:38px; border-radius:50%; background:radial-gradient(circle at 35% 35%, #3a3a42, #050507 70%); border:2px solid #3a3a42; }
    .back-flash { width:12px; height:12px; border-radius:50%; background:#e8b923; box-shadow:0 0 6px #e8b923; }
    .back-fingerprint { position:absolute; bottom:120px; left:50%; transform:translateX(-50%); width:50px; height:50px; border-radius:50%; border:2px solid #2a2a30; }
    
    /* Extrusion side rails */
    .phone-side { position:absolute; background:linear-gradient(to bottom, #232329, #475569 50%, #232329); border:1px solid #1e293b; }
    .side-left { width:20px; height:680px; left:-10px; top:40px; transform:rotateY(90deg); border-radius:6px; }
    .side-right { width:20px; height:680px; right:-10px; top:40px; transform:rotateY(-90deg); border-radius:6px; }
    .side-top { width:290px; height:20px; left:40px; top:-10px; transform:rotateX(90deg); border-radius:6px; }
    .side-bottom { width:290px; height:20px; left:40px; bottom:-10px; transform:rotateX(-90deg); border-radius:6px; }
    .side-btn { position:absolute; background:#475569; border:1px solid #334155; border-radius:3px; }
    .volume-up { width:4px; height:45px; left:-4px; top:120px; }
    .volume-down { width:4px; height:45px; left:-4px; top:180px; }
    .power-btn { width:4px; height:50px; right:-4px; top:140px; }
    .usb-port { position:absolute; left:50%; top:50%; transform:translate(-50%, -50%); width:36px; height:6px; border-radius:3px; background:#3a3a42; }
    .phone-ambient-shadow { position:absolute; width:360px; height:740px; border-radius:60px; background:rgba(0,0,0,0.5); filter:blur(30px); transform:translateZ(-60px) scale(0.94); pointer-events:none; }

    /* In-App Mockups style */
    .mockup-ui { position:absolute; inset:0; background:linear-gradient(135deg, #150910 0%, #030305 100%); display:flex; flex-direction:column; padding:24px; box-sizing:border-box; border-radius:inherit; }
    .red-wallpaper { background:linear-gradient(135deg, #880e4f 0%, #2d001d 50%, #050507 100%);
      background-image:radial-gradient(circle at 30% 20%, #ad1457 0%, transparent 40%), radial-gradient(circle at 80% 70%, #880e4f 0%, transparent 50%);
    }
    .mock-header { font-size:22px; font-weight:800; color:#fff; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:12px; margin-bottom:20px; }
    .mock-list { display:flex; flex-direction:column; gap:14px; }
    .mock-item { padding:14px; border-radius:12px; background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); font-size:14px; font-weight:600; color:#cbd5e1; }
    .mock-center-circle { width:100px; height:100px; border-radius:50%; border:6px solid #e8175d; box-shadow:0 0 15px #e8175d; margin:60px auto 20px; }
    .mock-sub { text-align:center; font-size:16px; font-weight:800; color:#fff; letter-spacing:2px; }

    /* Panoramic fan-out screens (Scene 3) - Simple clean frameless screen layers matching display dimensions */
    .fan-layer { position:absolute; width:368px; height:720px; border-radius:36px; overflow:hidden; top:40px; left:0; transform-style:preserve-3d; pointer-events:none; border:1px solid rgba(255,255,255,0.12); box-shadow:0 25px 60px rgba(0,0,0,0.65); }
    .fan-layer .phone-screen-frame { width:100%; height:100%; position:relative; overflow:hidden; display:flex; flex-direction:column; border-radius:36px; }

    /* Duo phone (Scene 8) - Adjusted height to fit within 1080px height without bottom cut-off */
    .duo-wrap { position:relative; width:800px; height:680px; perspective:1600px; transform-style:preserve-3d; }
    .duo-wrap .phone-3d-rig.duo-front { position:absolute; left:70px; top:0; transform-style:preserve-3d; }
    .duo-wrap .phone-3d-rig.duo-back { position:absolute; left:280px; top:-50px; transform-style:preserve-3d; }

    /* App store badges */
    .store-badges { display:flex; gap:16px; margin-top:24px; }
    .store-badge { display:flex; align-items:center; gap:8px; padding:10px 20px; border:1px solid rgba(255,255,255,0.25); border-radius:10px; font-size:14px; font-weight:600; color:#e8e8ea; }

    ${player.style}
  </style>
</head>
<body>
  <div class="canvas">
    <div class="city-bokeh"></div>
    <div class="skyline"></div>
    <div class="neon-rings-wrap" id="pulsing-rings">
      <div class="neon-ring ring-outer"></div>
      <div class="neon-ring ring-mid"></div>
      <div class="neon-ring ring-inner"></div>
      <div class="chrome-donut" id="chrome-donut"></div>
    </div>
    <div class="float-plus" id="float-plus-1" style="left:14%; top:22%;">+</div>
    <div class="float-cross" id="float-cross-1" style="right:16%; top:30%;">&times;</div>
    <div class="float-plus" id="float-plus-2" style="right:20%; bottom:20%;">+</div>
    <div class="float-cross" id="float-cross-2" style="left:22%; bottom:16%;">&times;</div>

    <!-- Scene 1 (0:00-0:06): App Promo -->
    <div class="scene" id="scene-0">
      <div class="scene-content" style="justify-content:center; flex-direction:column;" id="content-0">
        <div class="copy-col center-col">
          <h2 class="title" id="s0-text">APP PROMO</h2>
          ${dotDivider}
          <p class="subtitle" id="s0-subtext">Suitable for all app and mobile promotion needs</p>
        </div>
        <div style="margin-top:20px;">${phone3D("phone-rig-0", "slot-0", "#880e4f", redWallpaperMockup)}</div>
      </div>
    </div>

    <!-- Scene 2 (0:06-0:12): Effective Way -->
    <div class="scene" id="scene-1">
      <div class="scene-content" id="content-1">
        <div class="copy-col">
          <h2 class="title" id="s1-text">EFFECTIVE WAY TO TELL ABOUT THE PRODUCT</h2>
          ${dotDivider}
          <p class="subtitle" id="s1-subtext">This project is suitable for all. Change the text, font, insert your photos or videos.</p>
        </div>
        ${phone3D("phone-rig-1", "slot-1", "#880e4f", redWallpaperMockup)}
      </div>
    </div>

    <!-- Scene 3 (0:12-0:17): Beautiful Modern Design -->
    <div class="scene" id="scene-2">
      <div class="scene-content" style="flex-direction:row-reverse;" id="content-2">
        <div class="copy-col right-side" style="flex: 0.9;">
          <h2 class="title" id="s2-text">BEAUTIFUL MODERN DESIGN</h2>
          ${dotDivider}
          <p class="subtitle" id="s2-subtext">Panoramic fan-out screens showcase every detail</p>
        </div>
        <div style="position:relative; width:720px; height:920px; perspective:1600px; display:flex; align-items:center; justify-content:center;">
          <div style="position:relative; transform-style:preserve-3d; width:370px; height:760px;" id="fan-group-2">
            ${phone3D("phone-rig-2", "slot-2", "#880e4f", redWallpaperMockup)}
            <!-- Frameless Screen 2 -->
            <div class="fan-layer" id="fan-layer-1">
              <div class="phone-screen-frame" style="background: #150910;">
                <img class="phone-screen" id="slot-2b" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" alt="Screen" />
                ${mockupMiddleScreen}
                <div class="gloss-sheen"></div>
              </div>
            </div>
            <!-- Frameless Screen 3 -->
            <div class="fan-layer" id="fan-layer-2">
              <div class="phone-screen-frame" style="background: #030305;">
                <img class="phone-screen" id="slot-2c" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" alt="Screen" />
                ${mockupRightScreen}
                <div class="gloss-sheen"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Scene 4 (0:17-0:24): Easy to Customize -->
    <div class="scene" id="scene-3">
      <div class="scene-content" id="content-3">
        <div class="copy-col">
          <h2 class="title" id="s3-text">EASY TO CUSTOMIZE</h2>
          ${dotDivider}
          <p class="subtitle" id="s3-subtext">Full control over color, text, and media placeholders</p>
        </div>
        ${phone3D("phone-rig-3", "slot-3", "#880e4f", redWallpaperMockup)}
      </div>
    </div>

    <!-- Scene 5 (0:24-0:29): Color Control -->
    <div class="scene" id="scene-4">
      <div class="scene-content" style="justify-content:center; flex-direction:column;" id="content-4">
        <div class="copy-col center-col">
          <h2 class="title" id="s4-text">COLOR CONTROL</h2>
          ${dotDivider}
          <p class="subtitle" id="s4-subtext">Adjust every accent color to match your brand</p>
        </div>
        <div style="margin-top:20px;">${phone3D("phone-rig-4", "slot-4", "#880e4f", redWallpaperMockup)}</div>
      </div>
    </div>

    <!-- Scene 6 (0:29-0:34): Modular Structure -->
    <div class="scene" id="scene-5">
      <div class="scene-content" style="flex-direction:row-reverse;" id="content-5">
        <div class="copy-col right-side">
          <h2 class="title" id="s5-text">MODULAR STRUCTURE</h2>
          ${dotDivider}
          <p class="subtitle" id="s5-subtext">Rearrange scenes freely with a fully modular layout</p>
        </div>
        ${phone3D("phone-rig-5", "slot-5", "#880e4f", redWallpaperMockup)}
      </div>
    </div>

    <!-- Scene 7 (0:34-0:39): Media Player (portrait-to-landscape transition) -->
    <div class="scene" id="scene-6">
      <div class="scene-content" style="flex-direction:column; justify-content:center; gap:20px;" id="content-6">
        <div class="copy-col center-col">
          <h2 class="title" id="s6-text">MEDIA PLAYER</h2>
          ${dotDivider}
          <p class="subtitle" id="s6-subtext">Landscape media playback showcase</p>
        </div>
        ${phone3DDual("phone-rig-6", "slot-6", "slot-6-land", "#880e4f", redWallpaperMockup, "landscape-mode")}
      </div>
    </div>

    <!-- Scene 8 (0:39-0:45): Available on VideoHive (duo phones) -->
    <div class="scene" id="scene-7">
      <div class="scene-content" style="justify-content:center; flex-direction:column;" id="content-7">
        <div class="copy-col center-col">
          <h2 class="title" id="s7-text">AVAILABLE ON VIDEOHIVE</h2>
          ${dotDivider}
          <p class="subtitle" id="s7-subtext">Download today and customize every scene</p>
          <div class="store-badges">
            <div class="store-badge">App Store</div>
            <div class="store-badge">Google Play</div>
          </div>
        </div>
        <div class="duo-wrap" style="margin-top:20px;">
          <div class="phone-3d-rig duo-front" id="phone-rig-7a">
            ${phoneFrontFace("slot-7", "#880e4f", redWallpaperMockup)}
            <div class="phone-side side-left"></div>
            <div class="phone-side side-right"></div>
            <div class="phone-side side-top"></div>
            <div class="phone-side side-bottom"></div>
          </div>
          <div class="phone-3d-rig duo-back" id="phone-rig-7b">
            <div class="phone-face back" style="transform:translateZ(10px);">
              <div class="back-camera-module">
                <div class="back-lens"></div>
                <div class="back-lens"></div>
                <div class="back-flash"></div>
              </div>
              <div class="back-fingerprint"></div>
            </div>
            <div class="phone-side side-left"></div>
            <div class="phone-side side-right"></div>
            <div class="phone-side side-top"></div>
            <div class="phone-side side-bottom"></div>
          </div>
        </div>
      </div>
    </div>
  </div>

  ${player.html}

  <script type="application/json" id="template-config">
${JSON.stringify(config, null, 2)}
  </script>

  <script>
  window.__customSceneTransform = function(sceneIdx, progress, globalTimeMs) {
    // Easing helper
    function easeOutCubic(t) {
      return 1 - Math.pow(1 - t, 3);
    }
    function easeInOutCubic(t) {
      return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    }

    // Keep rings and backgrounds rotating smoothly in 3D perspective
    const rings = document.getElementById("pulsing-rings");
    if (rings) rings.style.transform = "translate(-50%, -50%) rotate(" + (globalTimeMs * 0.012) + "deg) rotateX(16deg)";
    const donut = document.getElementById("chrome-donut");
    if (donut) donut.style.transform = "rotate(" + (-globalTimeMs * 0.03) + "deg)";
    
    ["float-plus-1", "float-cross-1", "float-plus-2", "float-cross-2"].forEach((id, i) => {
      const el = document.getElementById(id);
      if (el) el.style.transform = "translateY(" + (Math.sin(globalTimeMs * 0.001 + i) * 12) + "px) rotate(" + (Math.sin(globalTimeMs * 0.0005 + i) * 8) + "deg)";
    });

    // Content fade/slide transitions
    const content = document.getElementById("content-" + sceneIdx);
    if (content) {
      let opacity = 1;
      let translateY = 0;
      if (progress < 0.15) {
        const t = progress / 0.15;
        opacity = easeOutCubic(t);
        translateY = (1 - easeOutCubic(t)) * 25;
      } else if (progress > 0.85) {
        const t = (1 - progress) / 0.15;
        opacity = easeOutCubic(t);
        translateY = -(1 - easeOutCubic(t)) * 25;
      }
      content.style.opacity = opacity;
      content.style.transform = "translateY(" + translateY + "px)";
    }

    if (sceneIdx === 0) { // Scene 1: App Promo
      const rig = document.getElementById("phone-rig-0");
      if (rig) {
        let rY = Math.sin(progress * Math.PI) * 10;
        let rX = 6 + Math.cos(progress * Math.PI) * 2;
        let scale = 1.0;
        if (progress > 0.8) {
          const transitionProgress = (progress - 0.8) / 0.2;
          rY = 10 * Math.sin(0.8 * Math.PI) + (transitionProgress * 18); // yaw rotates rightwards
        }
        rig.style.transform = "scale(" + scale + ") rotateY(" + rY + "deg) rotateX(" + rX + "deg)";
      }
    } else if (sceneIdx === 1) { // Scene 2: Effective Way
      const rig = document.getElementById("phone-rig-1");
      if (rig) {
        const rY = 28 - progress * 16;
        const rX = 4 + Math.sin(progress * Math.PI) * 3;
        let tX = 0;
        if (progress > 0.8) {
          const t = (progress - 0.8) / 0.2;
          tX = -easeOutCubic(t) * 220;
        }
        rig.style.transform = "translateX(" + tX + "px) rotateY(" + rY + "deg) rotateX(" + rX + "deg)";
      }
    } else if (sceneIdx === 2) { // Scene 3: Beautiful Modern Design
      const rig = document.getElementById("phone-rig-2");
      const l1 = document.getElementById("fan-layer-1");
      const l2 = document.getElementById("fan-layer-2");
      
      let baseTX = -260;
      let progressMid = 0;
      let progressRight = 0;
      
      if (progress > 0.15 && progress < 0.8) {
        const activeProgress = (progress - 0.15) / 0.65;
        progressMid = easeOutCubic(Math.min(1, activeProgress * 1.5));
        progressRight = easeOutCubic(Math.max(0, (activeProgress - 0.2) * 1.5));
      } else if (progress >= 0.8) {
        const exitProgress = (progress - 0.8) / 0.2;
        progressMid = 1 - easeOutCubic(exitProgress);
        progressRight = 1 - easeOutCubic(exitProgress);
        baseTX = -260 + easeOutCubic(exitProgress) * 260;
      }
      
      if (rig) rig.style.transform = "translateX(" + baseTX + "px) rotateY(-8deg)";
      
      // Fanout middle screen (l1) and right screen (l2) start 100% hidden (baseTX) with opacity 0
      // Spacing set to match frame 484 with a clean consistent gap: Card 1 at 378px, Card 2 at 756px
      if (l1) {
        l1.style.transform = "translate3d(" + (baseTX + progressMid * 378) + "px, 0, -20px) rotateY(-10deg) scale(0.98)";
        l1.style.opacity = progressMid;
      }
      if (l2) {
        l2.style.transform = "translate3d(" + (baseTX + progressRight * 756) + "px, 0, -40px) rotateY(-14deg) scale(0.96)";
        l2.style.opacity = progressRight;
      }
    } else if (sceneIdx === 3) { // Scene 4: Easy to Customize
      const rig = document.getElementById("phone-rig-3");
      if (rig) {
        const ease = easeInOutCubic(progress);
        const rZ = 35 - ease * 35; // smooth straighten on flat plane
        const rX = 48 - ease * 40; // tilts straight to 8deg
        const rY = -22 + ease * 22; // straightens to 0deg
        const tZ = (1 - ease) * 40;
        rig.style.transform = "rotateZ(" + rZ + "deg) rotateX(" + rX + "deg) rotateY(" + rY + "deg) translate3d(0, 0, " + tZ + "px)";
      }
    } else if (sceneIdx === 4) { // Scene 5: Color Control
      const rig = document.getElementById("phone-rig-4");
      if (rig) {
        const scale = 0.95 + progress * 0.08;
        const rY = -14 + progress * 24;
        const rX = Math.sin(progress * Math.PI) * 4;
        rig.style.transform = "scale(" + scale + ") rotateY(" + rY + "deg) rotateX(" + rX + "deg)";
      }
    } else if (sceneIdx === 5) { // Scene 6: Modular Structure
      const rig = document.getElementById("phone-rig-5");
      if (rig) {
        const rY = 18 - progress * 8;
        const rX = 3 + Math.sin(progress * Math.PI) * 2;
        rig.style.transform = "scale(1.38) translateX(240px) rotateY(" + rY + "deg) rotateX(" + rX + "deg)";
      }
    } else if (sceneIdx === 6) { // Scene 7: Media Player (Portrait-to-Landscape Transition)
      const rig = document.getElementById("phone-rig-6");
      const imgPortrait = document.getElementById("slot-6");
      const imgLandscape = document.getElementById("slot-6-land");
      
      if (rig) {
        let rZ = 0;
        let opacityLand = 0;
        let opacityPort = 1;
        
        if (progress > 0.15 && progress < 0.55) {
          const t = (progress - 0.15) / 0.40;
          const ease = easeInOutCubic(t);
          rZ = ease * -90; // smoothly rotate by -90deg
          opacityLand = ease;
          opacityPort = 1 - ease;
        } else if (progress >= 0.55) {
          rZ = -90;
          opacityLand = 1;
          opacityPort = 0;
        }
        
        const bobY = Math.sin(progress * Math.PI * 2) * 12;
        const rY = Math.sin(progress * Math.PI) * 12;
        rig.style.transform = "translateY(" + bobY + "px) rotateZ(" + rZ + "deg) rotateY(" + rY + "deg) rotateX(8deg)";
        
        if (imgPortrait) imgPortrait.style.opacity = opacityPort;
        if (imgLandscape) imgLandscape.style.opacity = opacityLand;
      }
    } else if (sceneIdx === 7) { // Scene 8: Available on VideoHive (Duo Phones Collision & Bottom Cut-off Fix)
      const rigA = document.getElementById("phone-rig-7a");
      const rigB = document.getElementById("phone-rig-7b");
      
      let entry = 1;
      if (progress < 0.25) {
        entry = easeOutCubic(progress / 0.25);
      }
      
      // Phone A (Front): Enters from top-right, translateZ(30px) foreground, scaled to 0.78 to prevent bottom cut-off
      if (rigA) {
        const tY = -70 + (1 - entry) * -80; // Shifted UP by 70px to make the bottom rounded corners fully visible within canvas
        const tX = 80 + (1 - entry) * 60;
        rigA.style.transform = "translate3d(" + tX + "px, " + tY + "px, 30px) scale(0.78) rotateY(" + (-12 + (1 - entry) * 15) + "deg)";
      }
      
      // Phone B (Back): Enters from bottom-left, translateZ(-50px) background, scaled to 0.78
      if (rigB) {
        const tY = -120 + (1 - entry) * 90; // Shifted UP by 70px as well to maintain correct relative positions
        const tX = -180 + (1 - entry) * -60;
        rigB.style.transform = "translate3d(" + tX + "px, " + tY + "px, -50px) scale(0.78) rotateY(" + (195 + (1 - entry) * -15) + "deg)";
      }
    }
  };
  </script>

  ${player.script}
</body>
</html>`;

  const tplDir = path.join(rootDir, 'templates', 'video', config.id);
  fs.mkdirSync(tplDir, { recursive: true });
  fs.writeFileSync(path.join(tplDir, 'template.html'), html);
  console.log(`[SUCCESS] Recreated 23393372 template with 8 full scenes and 3D phone models at ${tplDir}`);
}

create23393372Template();
