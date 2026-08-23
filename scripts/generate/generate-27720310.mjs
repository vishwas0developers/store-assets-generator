import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getUniversalPlayerScriptAndStyle } from './player-helper.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../..');

export function create27720310Template() {
  const config = {
    id: "tpl-27720310-dark-matte-spheres",
    name: "Matte Geometry & Cyber Blue — 27720310 Reference",
    description: "Authentic full recreation of 27720310.mp4 with 18 scenes, 3D Galaxy flagship phones, floating matte spheres, glowing cyber blue frames, and high-fidelity customer testimonials.",
    useCase: "Best for modern high-end app promotional presentations and tech showcases.",
    designStyle: "Matte Geometry",
    aspectRatio: "16:9",
    features: [
      "18 scenes matching 27720310.mp4 frame-by-frame",
      "Realistic 3D Galaxy flagship phone chassis",
      "Floating 3D matte black spheres",
      "Glowing cyber blue frame rectangles",
      "Swiss-style timecode and label annotations",
      "Widescreen landscape and isometric dual phone presentations"
    ],
    device: "samsung-galaxy-s20",
    variant: "matte-spheres",
    deviceFraction: 0.62,
    scenes: [
      {
        label: "Scene 1: Opener",
        sceneTemplate: "studio-opener",
        durationSeconds: 1.0,
        background: "matte-dark",
        rotate: 0,
        zoom: 1,
        move: 0,
        depth: "opener",
        layout: "intro-kinetic",
        text: "",
        subtext: "",
        slots: { screenshot: "slot-0" }
      },
      {
        label: "Scene 2: Meet the new Android app",
        sceneTemplate: "studio-phone",
        durationSeconds: 7.04,
        background: "matte-dark",
        rotate: 0,
        zoom: 1,
        move: 0,
        depth: "showcase",
        layout: "copy-left",
        text: "Meet the new",
        subtext: "Android app",
        slots: { text: "s1-text", subtext: "s1-subtext", screenshot: "slot-1" }
      },
      {
        label: "Scene 3: New level",
        sceneTemplate: "studio-phone",
        durationSeconds: 7.24,
        background: "matte-dark",
        rotate: 0,
        zoom: 1,
        move: 0,
        depth: "showcase",
        layout: "copy-right",
        text: "New level",
        subtext: "of app development",
        slots: { text: "s2-text", subtext: "s2-subtext", screenshot: "slot-2" }
      },
      {
        label: "Scene 4: App of the week",
        sceneTemplate: "studio-phone",
        durationSeconds: 6.12,
        background: "matte-dark",
        rotate: 0,
        zoom: 1,
        move: 0,
        depth: "showcase",
        layout: "copy-left",
        text: "App of the week",
        subtext: "Aug 2020",
        slots: { text: "s3-text", subtext: "s3-subtext", screenshot: "slot-3" }
      },
      {
        label: "Scene 5: Intuitive UI",
        sceneTemplate: "studio-phone",
        durationSeconds: 6.36,
        background: "matte-dark",
        rotate: 0,
        zoom: 1,
        move: 0,
        depth: "showcase",
        layout: "copy-right",
        text: "Intuitive UI",
        subtext: "Pixel perfect",
        slots: { text: "s4-text", subtext: "s4-subtext", screenshot: "slot-4" }
      },
      {
        label: "Scene 6: Finally it's comming",
        sceneTemplate: "studio-phone",
        durationSeconds: 6.16,
        background: "matte-dark",
        rotate: 0,
        zoom: 1,
        move: 0,
        depth: "showcase",
        layout: "copy-left",
        text: "Finally",
        subtext: "it's comming",
        slots: { text: "s5-text", subtext: "s5-subtext", screenshot: "slot-5" }
      },
      {
        label: "Scene 7: Dual Macro Closeup",
        sceneTemplate: "studio-macro",
        durationSeconds: 6.08,
        background: "matte-dark",
        rotate: 0,
        zoom: 1.4,
        move: 0,
        depth: "macro",
        layout: "macro-closeup",
        text: "",
        subtext: "",
        slots: { screenshot: "slot-6" }
      },
      {
        label: "Scene 8: Completely new experience",
        sceneTemplate: "studio-phone",
        durationSeconds: 6.04,
        background: "matte-dark",
        rotate: 0,
        zoom: 1,
        move: 0,
        depth: "showcase",
        layout: "copy-right",
        text: "Completely new",
        subtext: "experience",
        slots: { text: "s7-text", subtext: "s7-subtext", screenshot: "slot-7" }
      },
      {
        label: "Scene 9: Transition whip",
        sceneTemplate: "studio-transition",
        durationSeconds: 0.8,
        background: "matte-dark",
        rotate: 0,
        zoom: 1,
        move: 0,
        depth: "transition",
        layout: "kinetic-pan",
        text: "",
        subtext: "",
        slots: { screenshot: "slot-8" }
      },
      {
        label: "Scene 10: Convenient mobile application",
        sceneTemplate: "studio-phone",
        durationSeconds: 5.4,
        background: "matte-dark",
        rotate: 0,
        zoom: 1,
        move: 0,
        depth: "showcase",
        layout: "copy-left",
        text: "Convenient mobile",
        subtext: "application",
        slots: { text: "s9-text", subtext: "s9-subtext", screenshot: "slot-9" }
      },
      {
        label: "Scene 11: The best application",
        sceneTemplate: "studio-phone",
        durationSeconds: 6.4,
        background: "matte-dark",
        rotate: 0,
        zoom: 1,
        move: 0,
        depth: "showcase",
        layout: "copy-left",
        text: "The best application",
        subtext: "according to NYT",
        slots: { text: "s10-text", subtext: "s10-subtext", screenshot: "slot-10" }
      },
      {
        label: "Scene 12: Transition 2",
        sceneTemplate: "studio-transition",
        durationSeconds: 0.64,
        background: "matte-dark",
        rotate: 0,
        zoom: 1,
        move: 0,
        depth: "transition",
        layout: "cyan-pulse",
        text: "",
        subtext: "",
        slots: { screenshot: "slot-11" }
      },
      {
        label: "Scene 13: Extreme Macro Closeup",
        sceneTemplate: "studio-macro",
        durationSeconds: 7.0,
        background: "matte-dark",
        rotate: 0,
        zoom: 1.5,
        move: 0,
        depth: "macro",
        layout: "extreme-closeup",
        text: "",
        subtext: "",
        slots: { screenshot: "slot-12" }
      },
      {
        label: "Scene 14: Corner Pan Transition",
        sceneTemplate: "studio-transition",
        durationSeconds: 1.0,
        background: "matte-dark",
        rotate: 0,
        zoom: 1,
        move: 0,
        depth: "transition",
        layout: "whip-corner",
        text: "",
        subtext: "",
        slots: { screenshot: "slot-13" }
      },
      {
        label: "Scene 15: Landscape Video Mode",
        sceneTemplate: "studio-landscape",
        durationSeconds: 6.52,
        background: "matte-dark",
        rotate: 90,
        zoom: 1,
        move: 0,
        depth: "landscape",
        layout: "landscape-center",
        text: "Advanced",
        subtext: "video options",
        slots: { text: "s14-text", subtext: "s14-subtext", screenshot: "slot-14" }
      },
      {
        label: "Scene 16: Isometric Dual Phone",
        sceneTemplate: "studio-phone",
        durationSeconds: 7.8,
        background: "matte-dark",
        rotate: 0,
        zoom: 1,
        move: 0,
        depth: "showcase",
        layout: "copy-left",
        text: "Powerfull app",
        subtext: "Simple design",
        slots: { text: "s15-text", subtext: "s15-subtext", screenshot: "slot-15" }
      },
      {
        label: "Scene 17: Outro transition",
        sceneTemplate: "studio-outro",
        durationSeconds: 0.92,
        background: "matte-dark",
        rotate: 0,
        zoom: 1,
        move: 0,
        depth: "flat",
        layout: "outro-kinetic",
        text: "",
        subtext: "",
        slots: { screenshot: "slot-16" }
      },
      {
        label: "Scene 18: Customer Testimonials",
        sceneTemplate: "studio-outro",
        durationSeconds: 7.12,
        background: "matte-dark",
        rotate: 0,
        zoom: 1,
        move: 0,
        depth: "flat",
        layout: "reviews-card",
        text: "Customers",
        subtext: "review",
        slots: { text: "s17-text", subtext: "s17-subtext", screenshot: "slot-17" }
      }
    ]
  };

  const templateHtml = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Matte Geometry & Cyber Blue — 27720310 Reference</title>
  <style>
    html, body {
      margin: 0;
      padding: 0;
      width: 1920px;
      height: 1080px;
      overflow: hidden;
      background: #0a0a0c;
      font-family: 'Montserrat', sans-serif;
      color: #ffffff;
      -webkit-font-smoothing: antialiased;
    }
    
    .canvas {
      position: relative;
      width: 1920px;
      height: 1080px;
      background: radial-gradient(circle at 50% 45%, #181820 0%, #08080a 100%);
      overflow: hidden;
    }
    
    /* 3D Matte Spheres with realistic shading */
    .sphere {
      position: absolute;
      border-radius: 50%;
      background: radial-gradient(circle at 35% 35%, #42424c 0%, #16161c 65%, #050507 100%);
      box-shadow: 0 25px 60px rgba(0,0,0,0.7);
      pointer-events: none;
      z-index: 2;
    }
    
    /* Glowing Cyber Blue Frame */
    .cyber-frame {
      position: absolute;
      left: 50%;
      top: 50%;
      transform: translate(-50%, -50%);
      width: 1300px;
      height: 720px;
      border: 6px solid #00c2ff;
      box-shadow: 0 0 35px rgba(0, 194, 255, 0.35);
      z-index: 1;
      pointer-events: none;
      transition: transform 0.1s ease-out;
    }
    
    /* Swiss Typography annotations */
    .swiss-label {
      position: absolute;
      font-family: monospace;
      font-size: 14px;
      text-transform: lowercase;
      color: rgba(255, 255, 255, 0.45);
      z-index: 5;
    }
    
    .swiss-cross {
      position: absolute;
      font-size: 24px;
      color: rgba(255, 255, 255, 0.3);
      font-weight: 300;
      z-index: 5;
      pointer-events: none;
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
      padding: 0 14%;
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
    
    /* Copy Columns with solid black block badges */
    .copy-col {
      flex: 1.1;
      max-width: 720px;
      display: flex;
      flex-direction: column;
      justify-content: center;
      z-index: 5;
    }
    
    .copy-col.right-side {
      text-align: right;
      align-items: flex-end;
    }
    
    .badge-block {
      background: #000000;
      padding: 10px 22px;
      display: inline-block;
      margin-bottom: 6px;
    }
    
    .title-white {
      font-family: 'Montserrat', sans-serif;
      font-size: 52px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin: 0;
      color: #ffffff;
      line-height: 1.2;
    }
    
    .subtitle-block {
      background: #000000;
      padding: 6px 14px;
      display: inline-block;
      margin-top: 10px;
    }
    
    .subtitle {
      font-family: monospace;
      font-size: 18px;
      color: #00c2ff;
      margin: 0;
      text-transform: lowercase;
    }
    
    /* Device rendering columns */
    .device-col {
      flex: 0.9;
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100%;
      z-index: 4;
    }
    
    .phone-3d-viewport {
      perspective: 1500px;
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
      transition: transform 0.1s ease-out;
    }
    
    /* 3D phone faces */
    .phone-face {
      position: absolute;
      inset: 0;
      border-radius: 44px;
      box-sizing: border-box;
    }
    
    /* Front Screen with curved bezel overlays (No borders in portrait mode) */
    .phone-face.front {
      background: #000000;
      transform: translateZ(9px);
      z-index: 10;
      border: none;
      overflow: hidden;
      box-shadow: inset 0 0 18px rgba(0, 0, 0, 0.9);
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
      position: absolute;
      top: 0;
      left: 0;
      display: block;
      object-fit: cover;
    }
    
    /* Glossy reflections overlays */
    .gloss-sheen {
      position: absolute;
      inset: 0;
      background: linear-gradient(130deg, rgba(255, 255, 255, 0.18) 0%, rgba(255, 255, 255, 0.02) 40%, rgba(255, 255, 255, 0.08) 100%);
      z-index: 11;
      pointer-events: none;
      border-radius: 44px;
    }
    
    .screen-edge-glare {
      position: absolute;
      top: 0;
      bottom: 0;
      width: 12px;
      background: linear-gradient(to right, rgba(255, 255, 255, 0.15), transparent);
      z-index: 12;
      pointer-events: none;
    }
    
    .screen-edge-glare.left-edge { left: 0; }
    .screen-edge-glare.right-edge { right: 0; transform: scaleX(-1); }
    
    /* Curved AMOLED glass side shading */
    .curved-edge-shadow {
      position: absolute;
      top: 0;
      bottom: 0;
      width: 22px;
      z-index: 13;
      pointer-events: none;
    }
    
    .curved-edge-shadow.left {
      left: 0;
      background: linear-gradient(to right, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.3) 50%, transparent 100%);
    }
    
    .curved-edge-shadow.right {
      right: 0;
      background: linear-gradient(to left, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.3) 50%, transparent 100%);
    }
    
    /* Extruded side metal rails - disabled by default for portrait, enabled for landscape */
    .phone-side {
      position: absolute;
      background: none;
      border: none;
    }
    
    .landscape-layout .phone-side {
      background: linear-gradient(to bottom, #2d2d37, #191921 50%, #2d2d37);
      border: 1px solid #141419;
    }
    
    .side-left { width: 18px; height: 760px; left: -9px; top: 0; transform: rotateY(90deg); }
    .side-right { width: 18px; height: 760px; right: -9px; top: 0; transform: rotateY(-90deg); }
    .side-top { width: 370px; height: 18px; left: 0; top: -9px; transform: rotateX(90deg); }
    .side-bottom { width: 370px; height: 18px; left: 0; bottom: -9px; transform: rotateX(-90deg); }
    
    /* Back Face of Galaxy model */
    .phone-face.back {
      background: #18181f;
      transform: rotateY(180deg) translateZ(9px);
      border: 5px solid #121217;
      box-shadow: 0 30px 60px rgba(0,0,0,0.75);
    }
    
    /* Camera module bump */
    .back-camera-module {
      position: absolute;
      top: 40px;
      left: 30px;
      width: 76px;
      height: 125px;
      border-radius: 22px;
      background: #0a0a0f;
      border: 2px solid #22222a;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: space-evenly;
      padding: 8px 0;
      box-sizing: border-box;
    }
    
    .back-lens {
      width: 22px;
      height: 22px;
      border-radius: 50%;
      background: radial-gradient(circle at 35% 35%, #33333a, #050507 70%);
      border: 1.5px solid #33333a;
    }
    
    .back-flash {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: #e8b923;
      box-shadow: 0 0 5px #e8b923;
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
    
    /* Landscape screenshot rotation within portrait frame */
    .landscape-screenshot {
      width: 762px !important;
      height: 372px !important;
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%) rotate(90deg);
      object-fit: cover;
    }
    
    /* Customer reviews CSS styling */
    .reviews-container {
      display: flex;
      flex-direction: column;
      gap: 16px;
      width: 600px;
      z-index: 5;
    }
    
    .review-item {
      display: flex;
      align-items: flex-start;
      gap: 16px;
      background: rgba(0, 0, 0, 0.45);
      border-left: 3px solid #00c2ff;
      padding: 14px 20px;
      border-radius: 0 12px 12px 0;
    }
    
    .review-avatar {
      width: 64px;
      height: 64px;
      border-radius: 50%;
      border: 2.5px solid #00c2ff;
      object-fit: cover;
    }
    
    .review-content {
      display: flex;
      flex-direction: column;
    }
    
    .review-name {
      font-size: 16px;
      font-weight: 700;
      color: #ffffff;
      margin: 0;
    }
    
    .review-stars {
      color: #ffd700;
      font-size: 14px;
      margin: 4px 0;
    }
    
    .review-text {
      font-size: 13px;
      color: #cbd5e1;
      margin: 0;
      line-height: 1.4;
    }
    
    ${getUniversalPlayerScriptAndStyle(config).style}
  </style>
  <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;700;800&display=swap" rel="stylesheet">
</head>
<body>
  <div class="canvas">
    <div class="cyber-frame" id="cyber-frame"></div>
    
    <!-- Floating Spheres -->
    <div class="sphere" style="width: 170px; height: 170px; left: 10%; top: 12%;" id="sphere-1"></div>
    <div class="sphere" style="width: 120px; height: 120px; right: 28%; bottom: 10%;" id="sphere-2"></div>
    <div class="sphere" style="width: 140px; height: 140px; right: 8%; top: 28%;" id="sphere-3"></div>
    <div class="sphere" style="width: 90px; height: 90px; left: 24%; bottom: 15%;" id="sphere-4"></div>
    
    <!-- Swiss Labels -->
    <div class="swiss-label" style="top: 40px; left: 40px;">new</div>
    <div class="swiss-label" style="top: 40px; right: 40px;">app</div>
    <div class="swiss-label" style="bottom: 40px; left: 40px;">2020</div>
    <div class="swiss-label" style="bottom: 40px; right: 40px;">2021</div>
    <div class="swiss-label" style="top: 40px; left: 50%; transform: translateX(-50%);">play</div>
    <div class="swiss-label" style="bottom: 30px; left: 50%; transform: translateX(-50%);">app_name</div>
    
    <!-- Crosshairs -->
    <div class="swiss-cross" style="top: 50%; left: 35px; transform: translateY(-50%);">+</div>
    <div class="swiss-cross" style="top: 50%; right: 35px; transform: translateY(-50%);">+</div>
    
    <!-- Scene 1 -->
    <div class="scene" id="scene-0">
      <div class="scene-content" style="justify-content: center;">
        <div class="device-col">
          <div class="phone-3d-viewport">
            <div class="phone-3d-scaler" style="transform: scale(0.92);">
              <div class="phone-3d-rig" id="phone-rig-0">
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
                <div class="phone-face back">
                  <div class="back-camera-module">
                    <div class="back-lens"></div>
                    <div class="back-lens"></div>
                    <div class="back-lens"></div>
                    <div class="back-flash"></div>
                  </div>
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
    </div>
    
    <!-- Scene 2 -->
    <div class="scene" id="scene-1">
      <div class="scene-content">
        <div class="copy-col">
          <div><div class="badge-block"><h2 class="title-white" id="s1-text">Meet the new</h2></div></div>
          <div><div class="badge-block"><h2 class="title-white" id="s1-subtext">Android app</h2></div></div>
        </div>
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
                    <img class="phone-screen" id="slot-1" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" alt="Screen 2" />
                  </div>
                </div>
                <div class="phone-face back">
                  <div class="back-camera-module">
                    <div class="back-lens"></div>
                    <div class="back-lens"></div>
                    <div class="back-lens"></div>
                    <div class="back-flash"></div>
                  </div>
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
    </div>
    
    <!-- Scene 3 -->
    <div class="scene" id="scene-2">
      <div class="scene-content" style="flex-direction: row-reverse;">
        <div class="copy-col right-side">
          <div><div class="badge-block"><h2 class="title-white" id="s2-text">New level</h2></div></div>
          <div><div class="badge-block"><h2 class="title-white" id="s2-subtext">of app development</h2></div></div>
        </div>
        <div class="device-col">
          <div class="phone-3d-viewport">
            <div class="phone-3d-scaler" style="transform: scale(0.94);">
              <div class="phone-3d-rig" id="phone-rig-2">
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
                <div class="phone-face back">
                  <div class="back-camera-module">
                    <div class="back-lens"></div>
                    <div class="back-lens"></div>
                    <div class="back-lens"></div>
                    <div class="back-flash"></div>
                  </div>
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
    </div>
    
    <!-- Scene 4 -->
    <div class="scene" id="scene-3">
      <div class="scene-content">
        <div class="copy-col">
          <div><div class="badge-block"><h2 class="title-white" id="s3-text">App of the week</h2></div></div>
          <div><div class="badge-block"><h2 class="title-white" id="s3-subtext">Aug 2020</h2></div></div>
        </div>
        <div class="device-col">
          <div class="phone-3d-viewport">
            <div class="phone-3d-scaler" style="transform: scale(0.92);">
              <div class="phone-3d-rig" id="phone-rig-3">
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
                <div class="phone-face back">
                  <div class="back-camera-module">
                    <div class="back-lens"></div>
                    <div class="back-lens"></div>
                    <div class="back-lens"></div>
                    <div class="back-flash"></div>
                  </div>
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
    </div>
    
    <!-- Scene 5 -->
    <div class="scene" id="scene-4">
      <div class="scene-content" style="flex-direction: row-reverse;">
        <div class="copy-col right-side">
          <div><div class="badge-block"><h2 class="title-white" id="s4-text">Intuitive UI</h2></div></div>
          <div><div class="badge-block"><h2 class="title-white" id="s4-subtext">Pixel perfect</h2></div></div>
        </div>
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
                    <img class="phone-screen" id="slot-4" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" alt="Screen 5" />
                  </div>
                </div>
                <div class="phone-face back">
                  <div class="back-camera-module">
                    <div class="back-lens"></div>
                    <div class="back-lens"></div>
                    <div class="back-lens"></div>
                    <div class="back-flash"></div>
                  </div>
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
    </div>
    
    <!-- Scene 6 -->
    <div class="scene" id="scene-5">
      <div class="scene-content">
        <div class="copy-col">
          <div><div class="badge-block"><h2 class="title-white" id="s5-text">Finally</h2></div></div>
          <div><div class="badge-block"><h2 class="title-white" id="s5-subtext">it's comming</h2></div></div>
        </div>
        <div class="device-col">
          <div class="phone-3d-viewport">
            <div class="phone-3d-scaler" style="transform: scale(0.94);">
              <div class="phone-3d-rig" id="phone-rig-5">
                <div class="phone-face front">
                  <div class="camera-punch"></div>
                  <div class="gloss-sheen"></div>
                  <div class="screen-edge-glare left-edge"></div>
                  <div class="screen-edge-glare right-edge"></div>
                  <div class="curved-edge-shadow left"></div>
                  <div class="curved-edge-shadow right"></div>
                  <div class="screen-scroll-wrap">
                    <img class="phone-screen" id="slot-5" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" alt="Screen 6" />
                  </div>
                </div>
                <div class="phone-face back">
                  <div class="back-camera-module">
                    <div class="back-lens"></div>
                    <div class="back-lens"></div>
                    <div class="back-lens"></div>
                    <div class="back-flash"></div>
                  </div>
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
    </div>
    
    <!-- Scene 7 (Dual Macro Closeup) -->
    <div class="scene" id="scene-6">
      <div class="scene-content" style="justify-content: center; gap: 40px; position: relative;">
        <!-- Left Side Phone (Cropped Bottom) -->
        <div class="phone-3d-viewport" style="transform: translate(-100px, 80px);">
          <div class="phone-3d-scaler" style="transform: scale(1.25);">
            <div class="phone-3d-rig" id="phone-rig-6">
              <div class="phone-face front">
                <div class="camera-punch"></div>
                <div class="gloss-sheen"></div>
                <div class="screen-edge-glare left-edge"></div>
                <div class="screen-edge-glare right-edge"></div>
                <div class="curved-edge-shadow left"></div>
                <div class="curved-edge-shadow right"></div>
                <div class="screen-scroll-wrap">
                  <img class="phone-screen" id="slot-6" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" alt="Screen 7" />
                </div>
              </div>
            </div>
          </div>
        </div>
        <!-- Right Side Phone (Cropped Top) -->
        <div class="phone-3d-viewport" style="transform: translate(100px, -80px);">
          <div class="phone-3d-scaler" style="transform: scale(1.25);">
            <div class="phone-3d-rig" id="phone-rig-6-secondary">
              <div class="phone-face front">
                <div class="camera-punch"></div>
                <div class="gloss-sheen"></div>
                <div class="screen-edge-glare left-edge"></div>
                <div class="screen-edge-glare right-edge"></div>
                <div class="curved-edge-shadow left"></div>
                <div class="curved-edge-shadow right"></div>
                <div class="screen-scroll-wrap">
                  <img class="phone-screen" id="slot-6-secondary" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" alt="Screen 7 duplicate" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    
    <!-- Scene 8 -->
    <div class="scene" id="scene-7">
      <div class="scene-content" style="flex-direction: row-reverse;">
        <div class="copy-col right-side">
          <div><div class="badge-block"><h2 class="title-white" id="s7-text">Completely new</h2></div></div>
          <div><div class="badge-block"><h2 class="title-white" id="s7-subtext">experience</h2></div></div>
        </div>
        <div class="device-col">
          <div class="phone-3d-viewport">
            <div class="phone-3d-scaler" style="transform: scale(0.92);">
              <div class="phone-3d-rig" id="phone-rig-7">
                <div class="phone-face front">
                  <div class="camera-punch"></div>
                  <div class="gloss-sheen"></div>
                  <div class="screen-edge-glare left-edge"></div>
                  <div class="screen-edge-glare right-edge"></div>
                  <div class="curved-edge-shadow left"></div>
                  <div class="curved-edge-shadow right"></div>
                  <div class="screen-scroll-wrap">
                    <img class="phone-screen" id="slot-7" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" alt="Screen 8" />
                  </div>
                </div>
                <div class="phone-face back">
                  <div class="back-camera-module">
                    <div class="back-lens"></div>
                    <div class="back-lens"></div>
                    <div class="back-lens"></div>
                    <div class="back-flash"></div>
                  </div>
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
    </div>
    
    <!-- Scene 9 (Whip Transition) -->
    <div class="scene" id="scene-8">
      <div class="scene-content" style="justify-content: center;">
        <div class="device-col">
          <div class="phone-3d-viewport">
            <div class="phone-3d-scaler" style="transform: scale(1.1);">
              <div class="phone-3d-rig" id="phone-rig-8">
                <div class="phone-face back">
                  <div class="back-camera-module">
                    <div class="back-lens"></div>
                    <div class="back-lens"></div>
                    <div class="back-lens"></div>
                    <div class="back-flash"></div>
                  </div>
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
    </div>
    
    <!-- Scene 10 -->
    <div class="scene" id="scene-9">
      <div class="scene-content">
        <div class="copy-col">
          <div><div class="badge-block"><h2 class="title-white" id="s9-text">Convenient mobile</h2></div></div>
          <div><div class="badge-block"><h2 class="title-white" id="s9-subtext">application</h2></div></div>
        </div>
        <div class="device-col">
          <div class="phone-3d-viewport">
            <div class="phone-3d-scaler" style="transform: scale(0.92);">
              <div class="phone-3d-rig" id="phone-rig-9">
                <div class="phone-face front">
                  <div class="camera-punch"></div>
                  <div class="gloss-sheen"></div>
                  <div class="screen-edge-glare left-edge"></div>
                  <div class="screen-edge-glare right-edge"></div>
                  <div class="curved-edge-shadow left"></div>
                  <div class="curved-edge-shadow right"></div>
                  <div class="screen-scroll-wrap">
                    <img class="phone-screen" id="slot-9" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" alt="Screen 10" />
                  </div>
                </div>
                <div class="phone-face back">
                  <div class="back-camera-module">
                    <div class="back-lens"></div>
                    <div class="back-lens"></div>
                    <div class="back-lens"></div>
                    <div class="back-flash"></div>
                  </div>
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
    </div>
    
    <!-- Scene 11 -->
    <div class="scene" id="scene-10">
      <div class="scene-content">
        <div class="copy-col">
          <div><div class="badge-block"><h2 class="title-white" id="s10-text">The best application</h2></div></div>
          <div><div class="badge-block"><h2 class="title-white" id="s10-subtext">according to NYT</h2></div></div>
        </div>
        <div class="device-col">
          <div class="phone-3d-viewport">
            <div class="phone-3d-scaler" style="transform: scale(0.92);">
              <div class="phone-3d-rig" id="phone-rig-10">
                <div class="phone-face front">
                  <div class="camera-punch"></div>
                  <div class="gloss-sheen"></div>
                  <div class="screen-edge-glare left-edge"></div>
                  <div class="screen-edge-glare right-edge"></div>
                  <div class="curved-edge-shadow left"></div>
                  <div class="curved-edge-shadow right"></div>
                  <div class="screen-scroll-wrap">
                    <img class="phone-screen" id="slot-10" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" alt="Screen 11" />
                  </div>
                </div>
                <div class="phone-face back">
                  <div class="back-camera-module">
                    <div class="back-lens"></div>
                    <div class="back-lens"></div>
                    <div class="back-lens"></div>
                    <div class="back-flash"></div>
                  </div>
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
    </div>
    
    <!-- Scene 12 (Transition) -->
    <div class="scene" id="scene-11">
      <div class="scene-content" style="justify-content: center; align-items: center;">
        <div style="width: 200px; height: 200px; border: 6px solid #00c2ff; box-shadow: 0 0 40px rgba(0,194,255,0.4);"></div>
      </div>
    </div>
    
    <!-- Scene 13 (Extreme Macro Closeup) -->
    <div class="scene" id="scene-12">
      <div class="scene-content" style="justify-content: center;">
        <div class="phone-3d-viewport" style="transform: translate(160px, -50px);">
          <div class="phone-3d-scaler" style="transform: scale(1.55);">
            <div class="phone-3d-rig" id="phone-rig-12">
              <div class="phone-face front">
                <div class="camera-punch"></div>
                <div class="gloss-sheen"></div>
                <div class="screen-edge-glare left-edge"></div>
                <div class="screen-edge-glare right-edge"></div>
                <div class="curved-edge-shadow left"></div>
                <div class="curved-edge-shadow right"></div>
                <div class="screen-scroll-wrap">
                  <img class="phone-screen" id="slot-12" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" alt="Screen 13" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    
    <!-- Scene 14 (Corner pan) -->
    <div class="scene" id="scene-13">
      <div class="scene-content" style="justify-content: center;">
        <div class="phone-3d-viewport" style="transform: translate(-200px, 150px) rotate(-15deg);">
          <div class="phone-3d-scaler" style="transform: scale(1.6);">
            <div class="phone-3d-rig" id="phone-rig-13">
              <div class="phone-face front">
                <div class="camera-punch"></div>
                <div class="gloss-sheen"></div>
              </div>
              <div class="phone-side side-left"></div>
              <div class="phone-side side-top"></div>
            </div>
          </div>
        </div>
      </div>
    </div>
    
    <!-- Scene 15 (Landscape Mode) -->
    <div class="scene" id="scene-14">
      <div class="scene-content landscape-layout">
        <div class="copy-col" style="transform: translate(80px, 180px);">
          <div><div class="badge-block"><h2 class="title-white" id="s14-text">Advanced</h2></div></div>
          <div><div class="badge-block"><h2 class="title-white" id="s14-subtext">video options</h2></div></div>
        </div>
        <div class="device-col">
          <div class="phone-3d-viewport">
            <div class="phone-3d-scaler" style="transform: scale(0.96);">
              <div class="phone-3d-rig" id="phone-rig-14">
                <div class="phone-face front">
                  <div class="camera-punch"></div>
                  <div class="gloss-sheen"></div>
                  <div class="screen-edge-glare left-edge"></div>
                  <div class="screen-edge-glare right-edge"></div>
                  <div class="curved-edge-shadow left"></div>
                  <div class="curved-edge-shadow right"></div>
                  <div class="screen-scroll-wrap">
                    <img class="phone-screen landscape-screenshot" id="slot-14" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" alt="Screen 15" />
                  </div>
                </div>
                <div class="phone-face back"></div>
                <div class="phone-side side-left"></div>
                <div class="phone-side side-right"></div>
                <div class="phone-side side-top"></div>
                <div class="phone-side side-bottom"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    
    <!-- Scene 16 (Isometric Dual Phone) -->
    <div class="scene" id="scene-15">
      <div class="scene-content">
        <div class="copy-col" style="transform: translateY(-160px);">
          <div><div class="badge-block"><h2 class="title-white" id="s15-text">Powerfull app</h2></div></div>
          <div><div class="badge-block"><h2 class="title-white" id="s15-subtext">Simple design</h2></div></div>
        </div>
        <div class="device-col" style="position: relative;">
          <!-- Face down phone -->
          <div class="phone-3d-viewport" style="position: absolute; transform: translate(-140px, 40px);">
            <div class="phone-3d-scaler" style="transform: scale(0.85);">
              <div class="phone-3d-rig" id="phone-rig-15-back">
                <div class="phone-face back">
                  <div class="back-camera-module">
                    <div class="back-lens"></div>
                    <div class="back-lens"></div>
                    <div class="back-lens"></div>
                    <div class="back-flash"></div>
                  </div>
                </div>
                <div class="phone-side side-left"></div>
                <div class="phone-side side-right"></div>
                <div class="phone-side side-top"></div>
                <div class="phone-side side-bottom"></div>
              </div>
            </div>
          </div>
          <!-- Face up phone -->
          <div class="phone-3d-viewport" style="position: absolute; transform: translate(120px, 120px);">
            <div class="phone-3d-scaler" style="transform: scale(0.85);">
              <div class="phone-3d-rig" id="phone-rig-15-front">
                <div class="phone-face front">
                  <div class="camera-punch"></div>
                  <div class="gloss-sheen"></div>
                  <div class="screen-edge-glare left-edge"></div>
                  <div class="screen-edge-glare right-edge"></div>
                  <div class="curved-edge-shadow left"></div>
                  <div class="curved-edge-shadow right"></div>
                  <div class="screen-scroll-wrap">
                    <img class="phone-screen" id="slot-15" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" alt="Screen 16" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    
    <!-- Scene 17 (Pre-outro) -->
    <div class="scene" id="scene-16">
      <div class="scene-content" style="justify-content: center; align-items: center;">
        <div style="width: 100px; height: 100px; border: 6px solid #00c2ff; border-radius: 50%;"></div>
      </div>
    </div>
    
    <!-- Scene 18 (Customer Testimonials) -->
    <div class="scene" id="scene-17">
      <div class="scene-content">
        <!-- Left: Dual Phones -->
        <div class="device-col" style="position: relative; transform: translateX(-50px);">
          <!-- Back Phone -->
          <div class="phone-3d-viewport" style="position: absolute; transform: translate(-80px, 0px) scale(0.82);">
            <div class="phone-3d-rig" id="phone-rig-17-back">
              <div class="phone-face back">
                <div class="back-camera-module">
                  <div class="back-lens"></div>
                  <div class="back-lens"></div>
                  <div class="back-lens"></div>
                  <div class="back-flash"></div>
                </div>
              </div>
              <div class="phone-side side-left"></div>
              <div class="phone-side side-right"></div>
              <div class="phone-side side-top"></div>
              <div class="phone-side side-bottom"></div>
            </div>
          </div>
          <!-- Front Phone -->
          <div class="phone-3d-viewport" style="position: absolute; transform: translate(60px, 0px) scale(0.82);">
            <div class="phone-3d-rig" id="phone-rig-17-front">
              <div class="phone-face front">
                <div class="camera-punch"></div>
                <div class="gloss-sheen"></div>
                <div class="screen-edge-glare left-edge"></div>
                <div class="screen-edge-glare right-edge"></div>
                <div class="curved-edge-shadow left"></div>
                <div class="curved-edge-shadow right"></div>
                <div class="screen-scroll-wrap">
                  <img class="phone-screen" id="slot-17" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" alt="Screen 18" />
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <!-- Right: Testimonials -->
        <div class="reviews-container">
          <div><div class="badge-block" style="margin-bottom: 20px;"><h2 class="title-white" id="s17-text">Customers review</h2></div></div>
          
          <div class="review-item">
            <img class="review-avatar" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" alt="Shawn Avatar" />
            <div class="review-content">
              <span class="review-name">Shawn Dowson</span>
              <span class="review-stars">★★★★★</span>
              <p class="review-text">Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque laudantium</p>
            </div>
          </div>
          
          <div class="review-item">
            <img class="review-avatar" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" alt="Jane Avatar" />
            <div class="review-content">
              <span class="review-name">Jane Abrams</span>
              <span class="review-stars">★★★★★</span>
              <p class="review-text">Nemo enim ipsam voluptatem quia voluptas sit aspernatur aut odit aut fugit, sed quia consequuntur magni dolores eos qui ratione voluptatem sequi nesciunt.</p>
            </div>
          </div>
          
          <div class="review-item">
            <img class="review-avatar" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" alt="Corey Avatar" />
            <div class="review-content">
              <span class="review-name">Corey James</span>
              <span class="review-stars">★★★★★</span>
              <p class="review-text">Neque porro quisquam est, qui dolorem ipsum quia dolor sit amet, consectetur, adipisci velit, sed quia</p>
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
    /* Continuous floating spheres and 3D camera timeline transformations */
    window.__customSceneTransform = function(sceneIdx, progress, globalTimeMs) {
      // Harmonic floating matte spheres logic
      const s1 = document.getElementById("sphere-1");
      const s2 = document.getElementById("sphere-2");
      const s3 = document.getElementById("sphere-3");
      const s4 = document.getElementById("sphere-4");
      
      if (s1) s1.style.transform = "translateY(" + (Math.sin(globalTimeMs * 0.0012) * 22) + "px) rotate(" + (globalTimeMs * 0.002) + "deg)";
      if (s2) s2.style.transform = "translateY(" + (Math.cos(globalTimeMs * 0.0016) * 18) + "px)";
      if (s3) s3.style.transform = "translate(" + (Math.sin(globalTimeMs * 0.001) * 15) + "px, " + (Math.cos(globalTimeMs * 0.001) * 15) + "px)";
      if (s4) s4.style.transform = "translateY(" + (Math.sin(globalTimeMs * 0.0018) * 25) + "px)";

      // Cyber Frame subtle rotation/parallax
      const frame = document.getElementById("cyber-frame");
      if (frame) {
        frame.style.transform = "translate(-50%, -50%) rotate3d(1, 1, 0, " + (Math.sin(globalTimeMs * 0.0008) * 1.5) + "deg)";
      }

      // Exact 3D Phone Rotations & Motions frame-by-frame
      if (sceneIdx === 0) { // Scene 1 Opener
        const rig = document.getElementById("phone-rig-0");
        if (rig) rig.style.transform = "rotateY(" + (35 - progress * 15) + "deg) rotateX(" + (10 * Math.sin(progress * Math.PI)) + "deg)";
      }
      else if (sceneIdx === 1) { // Scene 2: Meet the new Android app
        const rig = document.getElementById("phone-rig-1");
        if (rig) rig.style.transform = "rotateY(" + (12 - progress * 8) + "deg)";
      }
      else if (sceneIdx === 2) { // Scene 3: New level
        const rig = document.getElementById("phone-rig-2");
        if (rig) rig.style.transform = "rotateY(" + (-18 + progress * 6) + "deg) rotateX(" + (8 - progress * 4) + "deg)";
      }
      else if (sceneIdx === 3) { // Scene 4: App of the week
        const rig = document.getElementById("phone-rig-3");
        if (rig) rig.style.transform = "rotateY(" + (-15 + progress * 8) + "deg) rotateX(12deg)";
      }
      else if (sceneIdx === 4) { // Scene 5: Intuitive UI
        const rig = document.getElementById("phone-rig-4");
        if (rig) rig.style.transform = "rotateY(" + (14 - progress * 8) + "deg)";
      }
      else if (sceneIdx === 5) { // Scene 6: Finally it's comming
        const rig = document.getElementById("phone-rig-5");
        if (rig) rig.style.transform = "rotateY(" + (progress * 4) + "deg) rotateX(" + (Math.sin(progress * Math.PI) * 4) + "deg)";
      }
      else if (sceneIdx === 6) { // Scene 7: Dual Macro
        const rig1 = document.getElementById("phone-rig-6");
        const rig2 = document.getElementById("phone-rig-6-secondary");
        if (rig1) rig1.style.transform = "rotateY(" + (15 + progress * 8) + "deg) scale(1.1)";
        if (rig2) rig2.style.transform = "rotateY(" + (-15 - progress * 8) + "deg) scale(1.1)";
      }
      else if (sceneIdx === 7) { // Scene 8: Completely new experience
        const rig = document.getElementById("phone-rig-7");
        if (rig) rig.style.transform = "rotateY(" + (25 - progress * 10) + "deg) rotateX(-6deg)";
      }
      else if (sceneIdx === 8) { // Scene 9: Transition Whip
        const rig = document.getElementById("phone-rig-8");
        if (rig) rig.style.transform = "rotateY(" + (180 + progress * 180) + "deg) translateZ(" + (progress * 150) + "px)";
      }
      else if (sceneIdx === 9) { // Scene 10: Convenient mobile
        const rig = document.getElementById("phone-rig-9");
        if (rig) rig.style.transform = "rotateY(" + (progress * 5) + "deg)";
      }
      else if (sceneIdx === 10) { // Scene 11: The best application
        const rig = document.getElementById("phone-rig-10");
        if (rig) rig.style.transform = "rotateY(" + (-22 + progress * 8) + "deg) rotateX(10deg)";
      }
      else if (sceneIdx === 12) { // Scene 13: Extreme Macro Closeup
        const rig = document.getElementById("phone-rig-12");
        if (rig) rig.style.transform = "rotateY(" + (20 - progress * 6) + "deg) scale(1.3)";
      }
      else if (sceneIdx === 13) { // Scene 14: Whip corner
        const rig = document.getElementById("phone-rig-13");
        if (rig) rig.style.transform = "rotateX(" + (35 - progress * 15) + "deg) rotateY(" + (progress * 45) + "deg)";
      }
      else if (sceneIdx === 14) { // Scene 15: Landscape Video Mode
        const rig = document.getElementById("phone-rig-14");
        if (rig) rig.style.transform = "rotateZ(-90deg) rotateY(" + (Math.sin(progress * Math.PI) * 8) + "deg) rotateX(" + (progress * 4) + "deg)";
      }
      else if (sceneIdx === 15) { // Scene 16: Isometric Dual Phone
        const rigBack = document.getElementById("phone-rig-15-back");
        const rigFront = document.getElementById("phone-rig-15-front");
        if (rigBack) rigBack.style.transform = "rotateY(180deg) rotateX(-20deg) rotateZ(35deg)";
        if (rigFront) rigFront.style.transform = "rotateY(15deg) rotateX(20deg) rotateZ(-15deg)";
      }
      else if (sceneIdx === 17) { // Scene 18: Customer Testimonials
        const rigBack = document.getElementById("phone-rig-17-back");
        const rigFront = document.getElementById("phone-rig-17-front");
        if (rigBack) rigBack.style.transform = "rotateY(180deg) rotateX(-10deg) scale(0.95)";
        if (rigFront) rigFront.style.transform = "rotateY(12deg) scale(0.95)";
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
  create27720310Template();
}
