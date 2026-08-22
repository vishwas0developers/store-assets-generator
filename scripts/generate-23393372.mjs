import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getUniversalPlayerScriptAndStyle } from './player-helper.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

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
      { label: "App Promo", sceneTemplate: "hero-rise", durationSeconds: 6, background: "graphite", rotate: 0, zoom: 10, move: 0, layout: "centre-flank", text: "APP PROMO", subtext: "Suitable for all app and mobile promotion needs", slots: { text: "s0-text", subtext: "s0-subtext", screenshot: "slot-0" } },
      { label: "Effective Way", sceneTemplate: "hero-rise", durationSeconds: 6, background: "graphite", rotate: 0, zoom: 10, move: 0, layout: "copy-left", text: "EFFECTIVE WAY TO TELL ABOUT THE PRODUCT", subtext: "This project is suitable for all. Change the text, font, insert your photos or videos.", slots: { text: "s1-text", subtext: "s1-subtext", screenshot: "slot-1" } },
      { label: "Beautiful Modern Design", sceneTemplate: "hero-rise", durationSeconds: 5, background: "graphite", rotate: 0, zoom: 10, move: 0, layout: "copy-right", text: "BEAUTIFUL MODERN DESIGN", subtext: "Panoramic fan-out screens showcase every detail", slots: { text: "s2-text", subtext: "s2-subtext", screenshot: "slot-2" } },
      { label: "Easy to Customize", sceneTemplate: "hero-rise", durationSeconds: 7, background: "graphite", rotate: 0, zoom: 10, move: 0, layout: "copy-left", text: "EASY TO CUSTOMIZE", subtext: "Full control over color, text, and media placeholders", slots: { text: "s3-text", subtext: "s3-subtext", screenshot: "slot-3" } },
      { label: "Color Control", sceneTemplate: "hero-rise", durationSeconds: 5, background: "graphite", rotate: 0, zoom: 10, move: 0, layout: "centre-flank", text: "COLOR CONTROL", subtext: "Adjust every accent color to match your brand", slots: { text: "s4-text", subtext: "s4-subtext", screenshot: "slot-4" } },
      { label: "Modular Structure", sceneTemplate: "hero-rise", durationSeconds: 5, background: "graphite", rotate: 0, zoom: 10, move: 0, layout: "copy-right", text: "MODULAR STRUCTURE", subtext: "Rearrange scenes freely with a fully modular layout", slots: { text: "s5-text", subtext: "s5-subtext", screenshot: "slot-5" } },
      { label: "Media Player", sceneTemplate: "hero-rise", durationSeconds: 5, background: "graphite", rotate: 0, zoom: 10, move: 0, layout: "stacked-top", text: "MEDIA PLAYER", subtext: "Landscape media playback showcase", slots: { text: "s6-text", subtext: "s6-subtext", screenshot: "slot-6" } },
      { label: "Available on VideoHive", sceneTemplate: "hero-rise", durationSeconds: 6, background: "graphite", rotate: 0, zoom: 10, move: 0, layout: "centre-flank", text: "AVAILABLE ON VIDEOHIVE", subtext: "Download today and customize every scene", slots: { text: "s7-text", subtext: "s7-subtext", screenshot: "slot-7" } }
    ]
  };

  const player = getUniversalPlayerScriptAndStyle(config);

  const dotDivider = `<div class="dot-divider"><span></span><span></span><span></span></div>`;

  const phoneFrontFace = (slotId, extraContent = '') => `
    <div class="phone-face front">
      <div class="phone-top-bezel"><div class="phone-speaker-grille"></div><div class="phone-camera-dot"></div></div>
      <div class="phone-screen-frame">
        <img class="phone-screen" id="${slotId}" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" alt="Screen" />
        ${extraContent}
        <div class="gloss-sheen"></div>
      </div>
    </div>
  `;

  const phone3D = (rigId, slotId, extraClass = '', extraContent = '') => `
    <div class="phone-3d-container ${extraClass}">
      <div class="phone-3d-scaler">
        <div class="phone-3d-rig" id="${rigId}">
          <div class="phone-ambient-shadow"></div>
          ${phoneFrontFace(slotId, extraContent)}
          <div class="phone-face back">
            <div class="back-camera-module"><div class="back-lens"></div><div class="back-lens"></div><div class="back-flash"></div></div>
            <div class="back-fingerprint"></div>
          </div>
          <div class="phone-side side-left"><div class="side-btn"></div><div class="side-btn"></div></div>
          <div class="phone-side side-right"><div class="side-btn"></div></div>
          <div class="phone-side side-top"></div>
          <div class="phone-side side-bottom"><div class="usb-port"></div></div>
        </div>
      </div>
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
        radial-gradient(circle at 15% 25%, rgba(232,23,93,0.20) 0%, transparent 12%),
        radial-gradient(circle at 82% 18%, rgba(255,42,109,0.16) 0%, transparent 10%),
        radial-gradient(circle at 30% 75%, rgba(232,23,93,0.14) 0%, transparent 14%),
        radial-gradient(circle at 88% 68%, rgba(255,42,109,0.18) 0%, transparent 11%),
        radial-gradient(circle at 60% 40%, rgba(232,23,93,0.10) 0%, transparent 60%);
    }
    .skyline { position:absolute; bottom:0; left:0; width:100%; height:280px; z-index:1; opacity:0.5;
      background:repeating-linear-gradient(90deg, rgba(255,255,255,0.03) 0px, rgba(255,255,255,0.03) 40px, transparent 40px, transparent 90px);
      mask-image:linear-gradient(to top, black 0%, transparent 100%);
    }

    /* Orbital neon rings */
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
    .float-plus, .float-cross { position:absolute; color:rgba(255,255,255,0.55); font-weight:200; pointer-events:none; z-index:6; text-shadow:0 0 12px rgba(232,23,93,0.4); }
    .float-plus { font-size:34px; }
    .float-cross { font-size:26px; }

    /* Scene layout */
    .scene { position:absolute; inset:0; width:1920px; height:1080px; display:none; align-items:center; justify-content:center; z-index:8; padding:0 8%; box-sizing:border-box; }
    .scene.active, .scene.playing { display:flex; }
    .scene-content { display:flex; width:100%; height:100%; align-items:center; justify-content:space-between; position:relative; }
    .copy-col { flex:1.1; max-width:820px; display:flex; flex-direction:column; justify-content:center; z-index:10; }
    .copy-col.right-side { text-align:right; align-items:flex-end; }
    .copy-col.center-col { text-align:center; align-items:center; max-width:100%; }
    .title { font-size:68px; font-weight:900; text-transform:uppercase; line-height:1.12; letter-spacing:-1px; margin:0 0 20px 0; color:#ffffff; text-shadow:0 4px 20px rgba(0,0,0,0.8); }
    .dot-divider { display:flex; gap:8px; margin-bottom:20px; }
    .dot-divider span { width:8px; height:8px; border-radius:50%; background:#e8175d; box-shadow:0 0 10px #ff2a6d; }
    .copy-col.right-side .dot-divider, .copy-col.center-col .dot-divider { justify-content:flex-end; }
    .copy-col.center-col .dot-divider { justify-content:center; }
    .subtitle { font-size:25px; font-weight:500; line-height:1.6; color:#cfcfcf; margin:0; max-width:600px; }

    /* Curved-glass 3D phone */
    .phone-3d-container { perspective:1600px; width:600px; height:920px; display:flex; align-items:center; justify-content:center; }
    .phone-3d-container.landscape-mode { width:920px; height:600px; }
    .phone-3d-scaler { transform-style:preserve-3d; }
    .phone-3d-rig { position:relative; width:380px; height:780px; transform-style:preserve-3d; transition:transform 0.08s linear; }
    .phone-face { position:absolute; inset:0; border-radius:48px; box-sizing:border-box; }
    .phone-face.front { background:#0a0a0f; transform:translateZ(11px); z-index:10; border:4px solid #232329; overflow:hidden; box-shadow:inset 0 0 25px rgba(255,42,109,0.2); display:flex; flex-direction:column; }
    .phone-top-bezel { height:34px; display:flex; align-items:center; justify-content:center; gap:14px; }
    .phone-speaker-grille { width:56px; height:5px; border-radius:3px; background:#3a3a42; }
    .phone-camera-dot { width:8px; height:8px; border-radius:50%; background:#111; box-shadow:inset 0 0 3px #ff2a6d; }
    .phone-screen-frame { flex:1; position:relative; overflow:hidden; background:#0f0f14;
      background-image:linear-gradient(90deg, rgba(255,255,255,0.18) 0%, transparent 8%, transparent 92%, rgba(255,255,255,0.18) 100%);
    }
    .phone-screen { width:100%; height:100%; object-fit:cover; display:block; }
    .gloss-sheen { position:absolute; inset:0; background:linear-gradient(105deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0.02) 40%, rgba(255,255,255,0.12) 100%); z-index:11; pointer-events:none; }
    .phone-face.back { background:linear-gradient(135deg, #121218 0%, #050507 100%); transform:rotateY(180deg) translateZ(11px); border:4px solid #ff2a6d; box-shadow:0 30px 60px rgba(0,0,0,0.65); display:flex; align-items:center; justify-content:center; }
    .back-camera-module { position:absolute; top:40px; left:40px; width:88px; height:130px; border-radius:22px; background:#0a0a0f; border:2px solid #2a2a30; display:flex; flex-direction:column; align-items:center; justify-content:space-evenly; }
    .back-lens { width:44px; height:44px; border-radius:50%; background:radial-gradient(circle at 35% 35%, #3a3a42, #050507 70%); border:2px solid #3a3a42; }
    .back-flash { width:16px; height:16px; border-radius:50%; background:#e8b923; box-shadow:0 0 6px #e8b923; }
    .back-fingerprint { position:absolute; bottom:120px; left:50%; transform:translateX(-50%); width:56px; height:56px; border-radius:50%; border:2px solid #2a2a30; }
    .phone-side { position:absolute; background:linear-gradient(to bottom, #e8e8ea, #9ca3af 50%, #e8e8ea); border:1px solid #6b7280; }
    .side-left { width:20px; height:780px; left:-10px; top:0; transform:rotateY(90deg); }
    .side-right { width:20px; height:780px; right:-10px; top:0; transform:rotateY(-90deg); }
    .side-top { width:380px; height:20px; left:0; top:-10px; transform:rotateX(90deg); }
    .side-bottom { width:380px; height:20px; left:0; bottom:-10px; transform:rotateX(-90deg); }
    .side-btn { position:absolute; left:50%; transform:translateX(-50%); width:32px; height:5px; border-radius:3px; background:#6b7280; }
    .side-left .side-btn:nth-child(1) { top:120px; } .side-left .side-btn:nth-child(2) { top:150px; }
    .side-right .side-btn { top:140px; }
    .usb-port { position:absolute; left:50%; top:50%; transform:translate(-50%, -50%); width:36px; height:6px; border-radius:3px; background:#3a3a42; }
    .phone-ambient-shadow { position:absolute; width:360px; height:760px; border-radius:60px; background:rgba(0,0,0,0.5); filter:blur(30px); transform:translateZ(-60px) scale(0.94); pointer-events:none; }

    /* Panoramic fan-out screens (Scene 3) */
    .fan-layer { position:absolute; width:280px; height:600px; border-radius:24px; background:#0f0f14; border:2px solid #2a2a30; box-shadow:0 25px 60px rgba(0,0,0,0.55); overflow:hidden; }
    .fan-layer img { width:100%; height:100%; object-fit:cover; }

    /* Duo phone (Scene 8) */
    .duo-wrap { position:relative; width:800px; height:920px; perspective:1600px; }
    .duo-wrap .phone-3d-rig.duo-front { position:absolute; left:70px; top:70px; }
    .duo-wrap .phone-3d-rig.duo-back { position:absolute; left:280px; top:0; }

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
      <div class="scene-content" style="justify-content:center; flex-direction:column;">
        <div class="copy-col center-col">
          <h2 class="title" id="s0-text">APP PROMO</h2>
          ${dotDivider}
          <p class="subtitle" id="s0-subtext">Suitable for all app and mobile promotion needs</p>
        </div>
        <div style="margin-top:20px;">${phone3D("phone-rig-0", "slot-0")}</div>
      </div>
    </div>

    <!-- Scene 2 (0:06-0:12): Effective Way -->
    <div class="scene" id="scene-1">
      <div class="scene-content">
        <div class="copy-col">
          <h2 class="title" id="s1-text">EFFECTIVE WAY TO TELL ABOUT THE PRODUCT</h2>
          ${dotDivider}
          <p class="subtitle" id="s1-subtext">This project is suitable for all. Change the text, font, insert your photos or videos.</p>
        </div>
        ${phone3D("phone-rig-1", "slot-1")}
      </div>
    </div>

    <!-- Scene 3 (0:12-0:17): Beautiful Modern Design -->
    <div class="scene" id="scene-2">
      <div class="scene-content" style="flex-direction:row-reverse;">
        <div class="copy-col right-side">
          <h2 class="title" id="s2-text">BEAUTIFUL MODERN DESIGN</h2>
          ${dotDivider}
          <p class="subtitle" id="s2-subtext">Panoramic fan-out screens showcase every detail</p>
        </div>
        <div style="position:relative; width:700px; height:920px; perspective:1600px; display:flex; align-items:center; justify-content:center;">
          <div style="position:relative; transform-style:preserve-3d;" id="fan-group-2">
            ${phone3D("phone-rig-2", "slot-2")}
            <div class="fan-layer" id="fan-layer-1" style="top:110px; left:80px;"><img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" alt="Layer 1" /></div>
            <div class="fan-layer" id="fan-layer-2" style="top:110px; left:80px;"><img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" alt="Layer 2" /></div>
          </div>
        </div>
      </div>
    </div>

    <!-- Scene 4 (0:17-0:24): Easy to Customize -->
    <div class="scene" id="scene-3">
      <div class="scene-content">
        <div class="copy-col">
          <h2 class="title" id="s3-text">EASY TO CUSTOMIZE</h2>
          ${dotDivider}
          <p class="subtitle" id="s3-subtext">Full control over color, text, and media placeholders</p>
        </div>
        ${phone3D("phone-rig-3", "slot-3")}
      </div>
    </div>

    <!-- Scene 5 (0:24-0:29): Color Control -->
    <div class="scene" id="scene-4">
      <div class="scene-content" style="justify-content:center; flex-direction:column;">
        <div class="copy-col center-col">
          <h2 class="title" id="s4-text">COLOR CONTROL</h2>
          ${dotDivider}
          <p class="subtitle" id="s4-subtext">Adjust every accent color to match your brand</p>
        </div>
        <div style="margin-top:20px;">${phone3D("phone-rig-4", "slot-4")}</div>
      </div>
    </div>

    <!-- Scene 6 (0:29-0:34): Modular Structure -->
    <div class="scene" id="scene-5">
      <div class="scene-content" style="flex-direction:row-reverse;">
        <div class="copy-col right-side">
          <h2 class="title" id="s5-text">MODULAR STRUCTURE</h2>
          ${dotDivider}
          <p class="subtitle" id="s5-subtext">Rearrange scenes freely with a fully modular layout</p>
        </div>
        ${phone3D("phone-rig-5", "slot-5")}
      </div>
    </div>

    <!-- Scene 7 (0:34-0:39): Media Player (landscape) -->
    <div class="scene" id="scene-6">
      <div class="scene-content" style="flex-direction:column; justify-content:center; gap:20px;">
        <div class="copy-col center-col">
          <h2 class="title" id="s6-text">MEDIA PLAYER</h2>
          ${dotDivider}
          <p class="subtitle" id="s6-subtext">Landscape media playback showcase</p>
        </div>
        ${phone3D("phone-rig-6", "slot-6", "landscape-mode")}
      </div>
    </div>

    <!-- Scene 8 (0:39-0:45): Available on VideoHive (duo phones) -->
    <div class="scene" id="scene-7">
      <div class="scene-content" style="justify-content:center; flex-direction:column;">
        <div class="copy-col center-col">
          <h2 class="title" id="s7-text">AVAILABLE ON VIDEOHIVE</h2>
          ${dotDivider}
          <p class="subtitle" id="s7-subtext">Download today and customize every scene</p>
          <div class="store-badges"><div class="store-badge">App Store</div><div class="store-badge">Google Play</div></div>
        </div>
        <div class="duo-wrap" style="margin-top:10px;">
          <div class="phone-3d-rig duo-front" id="phone-rig-7a" style="transform:scale(0.85);">
            ${phoneFrontFace("slot-7")}
            <div class="phone-side side-left"></div><div class="phone-side side-right"></div><div class="phone-side side-top"></div><div class="phone-side side-bottom"></div>
          </div>
          <div class="phone-3d-rig duo-back" id="phone-rig-7b" style="transform:scale(0.85);">
            <div class="phone-face back" style="transform:translateZ(11px);">
              <div class="back-camera-module"><div class="back-lens"></div><div class="back-lens"></div><div class="back-flash"></div></div>
              <div class="back-fingerprint"></div>
            </div>
            <div class="phone-side side-left"></div><div class="phone-side side-right"></div><div class="phone-side side-top"></div><div class="phone-side side-bottom"></div>
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
    const rings = document.getElementById("pulsing-rings");
    if (rings) rings.style.transform = "translate(-50%, -50%) rotate(" + (globalTimeMs * 0.015) + "deg) rotateX(15deg)";
    const donut = document.getElementById("chrome-donut");
    if (donut) donut.style.transform = "rotate(" + (-globalTimeMs * 0.04) + "deg)";
    ["float-plus-1", "float-cross-1", "float-plus-2", "float-cross-2"].forEach((id, i) => {
      const el = document.getElementById(id);
      if (el) el.style.transform = "translateY(" + (Math.sin(globalTimeMs * 0.001 + i) * 14) + "px) rotate(" + (Math.sin(globalTimeMs * 0.0006 + i) * 10) + "deg)";
    });

    if (sceneIdx === 0) {
      const rig = document.getElementById("phone-rig-0");
      if (rig) rig.style.transform = "rotateY(" + (Math.sin(progress * Math.PI * 2) * 8) + "deg) rotateX(6deg)";
    } else if (sceneIdx === 1) {
      const rig = document.getElementById("phone-rig-1");
      if (rig) rig.style.transform = "rotateY(" + (28 - progress * 16) + "deg) rotateX(" + (6 * Math.sin(progress * Math.PI)) + "deg)";
    } else if (sceneIdx === 2) {
      const rig = document.getElementById("phone-rig-2");
      const l1 = document.getElementById("fan-layer-1");
      const l2 = document.getElementById("fan-layer-2");
      if (rig) rig.style.transform = "rotateY(-16deg)";
      if (l1) l1.style.transform = "translate3d(" + (progress * 180) + "px, 0, " + (progress * 40) + "px) rotateY(-10deg)";
      if (l2) l2.style.transform = "translate3d(" + (progress * 360) + "px, 0, " + (progress * 80) + "px) rotateY(-14deg)";
    } else if (sceneIdx === 3) {
      const rig = document.getElementById("phone-rig-3");
      if (rig) rig.style.transform = "rotateZ(" + (35 * Math.sin(progress * Math.PI * 0.5)) + "deg) rotateX(45deg) rotateY(" + (progress * 20) + "deg)";
    } else if (sceneIdx === 4) {
      const rig = document.getElementById("phone-rig-4");
      if (rig) rig.style.transform = "scale(" + (1 + progress * 0.1) + ") rotateY(" + (8 * Math.sin(progress * Math.PI)) + "deg)";
    } else if (sceneIdx === 5) {
      const rig = document.getElementById("phone-rig-5");
      if (rig) rig.style.transform = "scale(1.3) rotateY(" + (15 - progress * 6) + "deg)";
    } else if (sceneIdx === 6) {
      const rig = document.getElementById("phone-rig-6");
      if (rig) rig.style.transform = "rotateZ(-90deg) rotateY(" + (10 * Math.sin(progress * Math.PI)) + "deg)";
    } else if (sceneIdx === 7) {
      const rigA = document.getElementById("phone-rig-7a");
      const rigB = document.getElementById("phone-rig-7b");
      if (rigA) rigA.style.transform = "scale(0.85) rotateY(" + (-10 + progress * 6) + "deg)";
      if (rigB) rigB.style.transform = "scale(0.85) rotateY(" + (190 - progress * 6) + "deg)";
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
