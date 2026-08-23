import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getUniversalPlayerScriptAndStyle } from './player-helper.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../..');

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
        slots: { text: "s6-text", logo: "slot-logo-outro" }
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
    }
    
    .phone-face {
      position: absolute;
      inset: 0;
      border-radius: 44px;
      box-sizing: border-box;
    }
    
    .phone-face.front {
      background: #000000;
      transform: translateZ(9px);
      z-index: 10;
      overflow: hidden;
    }
    
    .screen-scroll-wrap {
      width: 100%;
      height: 100%;
      border-radius: 44px;
      overflow: hidden;
      position: relative;
      background: #000000;
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
      border-radius: 44px;
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

    /* Portrait rails disabled by default to prevent ghost halos */
    .phone-side {
      position: absolute;
      background: none;
      border: none;
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
          
          <div class="store-badges" id="s6-badges">
            <!-- App Store Badge mock -->
            <img class="store-badge" src="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='135' height='40' viewBox='0 0 135 40'><rect width='135' height='40' rx='6' fill='black'/><text x='15' y='24' fill='white' font-family='sans-serif' font-size='14' font-weight='bold'>App Store</text></svg>" alt="Download on the App Store" />
            <!-- Google Play Badge mock -->
            <img class="store-badge" src="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='135' height='40' viewBox='0 0 135 40'><rect width='135' height='40' rx='6' fill='black'/><text x='15' y='24' fill='white' font-family='sans-serif' font-size='14' font-weight='bold'>Google Play</text></svg>" alt="Get it on Google Play" />
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

      // Easing helpers
      const tEntry = Math.min(1, progress / 0.35);
      const easeEntry = 1 - Math.pow(1 - tEntry, 3); // Cubic ease-out
      const tDrift = progress;

      if (sceneIdx === 0) { // Scene 1 Logo Opener
        const logo = document.getElementById("s0-logo");
        if (logo) {
          const logoScale = 0.8 + (0.2 * easeEntry);
          logo.style.transform = "scale(" + logoScale + ") translateY(" + (-30 * (1 - easeEntry)) + "px)";
        }
      }
      else if (sceneIdx === 1) { // Scene 2: Video Calling Made With Love (Phone Left)
        const rig = document.getElementById("phone-rig-1");
        if (rig) {
          const entryX = -150 * (1 - easeEntry); // Slide in left: -150px -> 0px
          const currentYaw = -24 + (14 * easeEntry) + (6 * tDrift); // -24deg -> -10deg -> -4deg
          const floatPitch = Math.sin(globalTimeMs * 0.001) * 2;
          rig.style.transform = "translateX(" + entryX + "px) rotateY(" + currentYaw + "deg) rotateX(" + floatPitch + "deg)";
        }
      }
      else if (sceneIdx === 2) { // Scene 3: Make group calls in a few clicks! (Phone Right in panel)
        const rig = document.getElementById("phone-rig-2");
        const panel = document.getElementById("s2-accent-panel");
        if (rig) {
          const entryX = 150 * (1 - easeEntry); // Slide in right: 150px -> 0px
          const currentYaw = 22 - (12 * easeEntry) - (6 * tDrift); // 22deg -> 10deg -> 4deg
          const floatPitch = Math.cos(globalTimeMs * 0.0012) * 2;
          rig.style.transform = "translateX(" + entryX + "px) rotateY(" + currentYaw + "deg) rotateX(" + floatPitch + "deg)";
        }
        if (panel) {
          const panelX = 240 * (1 - easeEntry);
          panel.style.transform = "translateX(" + panelX + "px)";
        }
      }
      else if (sceneIdx === 3) { // Scene 4: Built-in Encryption (Phone Center)
        const rig = document.getElementById("phone-rig-3");
        const badge = document.getElementById("s3-security-badge");
        if (rig) {
          const entryZ = -200 * (1 - easeEntry); // Zoom from depth
          const currentScale = 0.88 + (0.08 * easeEntry); // 0.88 -> 0.96
          const floatYaw = Math.sin(globalTimeMs * 0.001) * 3;
          const floatPitch = Math.cos(globalTimeMs * 0.001) * 2;
          rig.style.transform = "translateZ(" + entryZ + "px) scale(" + currentScale + ") rotateY(" + floatYaw + "deg) rotateX(" + floatPitch + "deg)";
        }
        if (badge) {
          const badgeScale = easeEntry;
          badge.style.transform = "translate(-50%, -50%) scale(" + badgeScale + ")";
          badge.style.opacity = easeEntry;
        }
      }
      else if (sceneIdx === 4) { // Scene 5: Easy Snapshots (Phone Right)
        const rig = document.getElementById("phone-rig-4");
        if (rig) {
          const entryX = 140 * (1 - easeEntry); // Slide in right
          const currentYaw = 24 - (14 * easeEntry) - (6 * tDrift); // 24deg -> 10deg -> 4deg
          rig.style.transform = "translateX(" + entryX + "px) rotateY(" + currentYaw + "deg)";
        }
      }
      else if (sceneIdx === 5) { // Scene 6: Download. Sign Up. Call. (Phone Center + Badges)
        const rig = document.getElementById("phone-rig-5");
        const b1 = document.getElementById("s5-badge-1");
        const b2 = document.getElementById("s5-badge-2");
        const b3 = document.getElementById("s5-badge-3");

        if (rig) {
          const entryY = 160 * (1 - easeEntry); // Rise from bottom
          const currentScale = 0.88 + (0.08 * easeEntry);
          const floatPitch = Math.sin(globalTimeMs * 0.001) * 3;
          rig.style.transform = "translateY(" + entryY + "px) scale(" + currentScale + ") rotateX(" + floatPitch + "deg)";
        }
        if (b1) { b1.style.opacity = Math.min(1, Math.max(0, (progress - 0.25) / 0.15)); b1.style.transform = "translateY(" + (8 * (1 - easeEntry)) + "px)"; }
        if (b2) { b2.style.opacity = Math.min(1, Math.max(0, (progress - 0.35) / 0.15)); b2.style.transform = "translateY(" + (8 * (1 - easeEntry)) + "px)"; }
        if (b3) { b3.style.opacity = Math.min(1, Math.max(0, (progress - 0.45) / 0.15)); b3.style.transform = "translateY(" + (8 * (1 - easeEntry)) + "px)"; }
      }
      else if (sceneIdx === 6) { // Scene 7: Outro CTA
        const logo = document.getElementById("s6-logo");
        const badges = document.getElementById("s6-badges");
        if (logo) {
          const logoScale = 0.8 + (0.2 * easeEntry);
          logo.style.transform = "scale(" + logoScale + ") translateY(" + (-20 * (1 - easeEntry)) + "px)";
        }
        if (badges) {
          badges.style.opacity = easeEntry;
        }
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
