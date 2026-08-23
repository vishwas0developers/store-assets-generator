import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getUniversalPlayerScriptAndStyle } from './player-helper.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../..');

export function create23552607Template() {
  const config = {
    id: "tpl-23552607-minimal-studio-3d",
    name: "3D Studio Minimal — 23552607 Reference",
    description: "Authentic full recreation of 23552607.mp4 with 15 scenes, dual curved-edge AMOLED 3D phone models, amber spotlight illumination, two-tone typography, and continuous downward webpage scrolling.",
    useCase: "Best for professional website portfolios, SaaS product showcases, and high-fidelity app walk-throughs.",
    designStyle: "Studio Minimal",
    aspectRatio: "16:9",
    features: [
      "15 scenes matching 23552607.mp4 frame-by-frame",
      "Curved dual-edge AMOLED glass 3D phone chassis",
      "Ambient overhead warm spotlight illumination",
      "Two-tone high-contrast clean typography",
      "Continuous downward webpage scroll sync",
      "Dedicated landscape 3D phone presentations"
    ],
    device: "google-pixel-9-pro",
    variant: "minimal-studio",
    deviceFraction: 0.6,
    scenes: [
      {
        label: "Scene 1: Phone Presentation",
        sceneTemplate: "studio-phone",
        durationSeconds: 5.3,
        background: "studio-dark",
        rotate: 0,
        zoom: 1,
        move: 0,
        depth: "showcase",
        transition: "cut",
        layout: "copy-right",
        text: "PHONE PRESENTATION",
        subtext: "NEW BRAND TEMPLATE",
        slots: { text: "s0-text", subtext: "s0-subtext", screenshot: "slot-0" }
      },
      {
        label: "Scene 2: No Plugins Required",
        sceneTemplate: "studio-phone",
        durationSeconds: 4.7,
        background: "studio-dark",
        rotate: 0,
        zoom: 1,
        move: 0,
        depth: "showcase",
        transition: "cut",
        layout: "copy-left",
        text: "NO PLUGINS REQUIRED",
        subtext: "SIMPLE SETUP",
        slots: { text: "s1-text", subtext: "s1-subtext", screenshot: "slot-1" }
      },
      {
        label: "Scene 3: Landscape Mockup",
        sceneTemplate: "studio-landscape",
        durationSeconds: 4.0,
        background: "studio-dark",
        rotate: 0,
        zoom: 1,
        move: 0,
        depth: "showcase",
        transition: "cut",
        layout: "landscape-center",
        text: "",
        subtext: "",
        slots: { screenshot: "slot-2" }
      },
      {
        label: "Scene 4: Very Fast Render",
        sceneTemplate: "studio-phone",
        durationSeconds: 5.0,
        background: "studio-dark",
        rotate: 0,
        zoom: 1,
        move: 0,
        depth: "showcase",
        transition: "cut",
        layout: "copy-left",
        text: "VERY FAST RENDER",
        subtext: "STYLISH LOOK",
        slots: { text: "s3-text", subtext: "s3-subtext", screenshot: "slot-3" }
      },
      {
        label: "Scene 5: Modular Structure",
        sceneTemplate: "studio-phone",
        durationSeconds: 5.0,
        background: "studio-dark",
        rotate: 0,
        zoom: 1,
        move: 0,
        depth: "showcase",
        transition: "cut",
        layout: "copy-right",
        text: "MODULAR STRUCTURE",
        subtext: "READY TO USE",
        slots: { text: "s4-text", subtext: "s4-subtext", screenshot: "slot-4" }
      },
      {
        label: "Scene 6: Landscape Mockup 2",
        sceneTemplate: "studio-landscape",
        durationSeconds: 4.0,
        background: "studio-dark",
        rotate: 0,
        zoom: 1,
        move: 0,
        depth: "showcase",
        transition: "cut",
        layout: "landscape-center",
        text: "",
        subtext: "",
        slots: { screenshot: "slot-5" }
      },
      {
        label: "Scene 7: Full HD Resolution",
        sceneTemplate: "studio-phone",
        durationSeconds: 10.0,
        background: "studio-dark",
        rotate: 0,
        zoom: 1,
        move: 0,
        depth: "showcase",
        transition: "cut",
        layout: "copy-left",
        text: "FULL HD RESOLUTION",
        subtext: "VERY FAST RENDER",
        slots: { text: "s6-text", subtext: "s6-subtext", screenshot: "slot-6" }
      },
      {
        label: "Scene 8: Easy Customize",
        sceneTemplate: "studio-phone",
        durationSeconds: 5.0,
        background: "studio-dark",
        rotate: 0,
        zoom: 1,
        move: 0,
        depth: "showcase",
        transition: "cut",
        layout: "copy-right",
        text: "EASY CUSTOMIZE",
        subtext: "FRESH DESIGN",
        slots: { text: "s7-text", subtext: "s7-subtext", screenshot: "slot-7" }
      },
      {
        label: "Scene 9: Symmetrical Split Layout",
        sceneTemplate: "studio-split",
        durationSeconds: 10.3,
        background: "studio-dark",
        rotate: 0,
        zoom: 1,
        move: 0,
        depth: "showcase",
        transition: "cut",
        layout: "symmetrical-split",
        text: "STYLISH TEMPLATE",
        subtext: "NEW BRAND",
        textRight: "ONLY ON VIDEOHIVE",
        subtextRight: "GET IT NOW",
        slots: { text: "s8-text", subtext: "s8-subtext", textRight: "s8-text-right", subtextRight: "s8-subtext-right", screenshot: "slot-8" }
      },
      {
        label: "Scene 10: Elegant Template",
        sceneTemplate: "studio-phone",
        durationSeconds: 5.0,
        background: "studio-dark",
        rotate: 0,
        zoom: 1,
        move: 0,
        depth: "showcase",
        transition: "cut",
        layout: "copy-right",
        text: "ELEGANT TEMPLATE",
        subtext: "READY TO USE",
        slots: { text: "s9-text", subtext: "s9-subtext", screenshot: "slot-9" }
      },
      {
        label: "Scene 11: Landscape Mockup 3",
        sceneTemplate: "studio-landscape",
        durationSeconds: 5.0,
        background: "studio-dark",
        rotate: 0,
        zoom: 1,
        move: 0,
        depth: "showcase",
        transition: "cut",
        layout: "landscape-center",
        text: "",
        subtext: "",
        slots: { screenshot: "slot-10" }
      },
      {
        label: "Scene 12: Place Image or Video",
        sceneTemplate: "studio-phone",
        durationSeconds: 5.0,
        background: "studio-dark",
        rotate: 0,
        zoom: 1,
        move: 0,
        depth: "showcase",
        transition: "cut",
        layout: "copy-left",
        text: "PLACE IMAGE OR VIDEO",
        subtext: "DRAG AND DROP",
        slots: { text: "s11-text", subtext: "s11-subtext", screenshot: "slot-11" }
      },
      {
        label: "Scene 13: Macro Closeup View",
        sceneTemplate: "studio-phone",
        durationSeconds: 5.0,
        background: "studio-dark",
        rotate: 0,
        zoom: 1,
        move: 0,
        depth: "showcase",
        transition: "cut",
        layout: "closeup-left",
        text: "AE CS6 AND ABOVE",
        subtext: "VIDEO TUTORIAL",
        slots: { text: "s12-text", subtext: "s12-subtext", screenshot: "slot-12" }
      },
      {
        label: "Scene 14: Final Upright Showcase",
        sceneTemplate: "studio-phone",
        durationSeconds: 3.3,
        background: "studio-dark",
        rotate: 0,
        zoom: 1,
        move: 0,
        depth: "showcase",
        transition: "cut",
        layout: "upright-center",
        text: "",
        subtext: "",
        slots: { screenshot: "slot-13" }
      },
      {
        label: "Scene 15: Outro Brand Card",
        sceneTemplate: "studio-outro",
        durationSeconds: 5.0,
        background: "studio-dark",
        rotate: 0,
        zoom: 1,
        move: 0,
        depth: "flat",
        transition: "fade",
        layout: "outro-card",
        text: "envato",
        subtext: ""
      }
    ]
  };

  const templateHtml = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>3D Studio Minimal — 23552607 Reference</title>
  <style>
    html, body {
      margin: 0;
      padding: 0;
      width: 1920px;
      height: 1080px;
      overflow: hidden;
      background: #141416;
      font-family: 'Montserrat', sans-serif;
      color: #ffffff;
      -webkit-font-smoothing: antialiased;
    }
    
    .canvas {
      position: relative;
      width: 1920px;
      height: 1080px;
      background: radial-gradient(circle at 50% 35%, #202026 0%, #0d0d0f 100%);
      overflow: hidden;
    }
    
    /* Subtle warm ambient lighting matching 23552607.mp4 */
    .spotlight {
      position: absolute;
      inset: 0;
      background: radial-gradient(ellipse at top, rgba(200, 150, 80, 0.08) 0%, transparent 60%);
      pointer-events: none;
      z-index: 1;
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
    
    /* Left / Right text columns */
    .copy-col {
      flex: 1;
      max-width: 680px;
      display: flex;
      flex-direction: column;
      justify-content: center;
      z-index: 5;
    }
    
    .copy-col.right-side {
      text-align: right;
      align-items: flex-end;
    }
    
    .title-white {
      font-family: 'Oswald', 'Impact', sans-serif;
      font-size: 64px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin: 0;
      color: #ffffff;
      line-height: 1.1;
    }
    
    .title-amber {
      font-family: 'Oswald', 'Impact', sans-serif;
      font-size: 52px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 1.5px;
      margin: 12px 0 0 0;
      color: #c89650;
      line-height: 1.1;
    }
    
    /* Layout styling for Symmetrical Split (Scene 9) */
    .split-container {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 8%;
      z-index: 2;
    }
    
    .split-col {
      width: 550px;
      display: flex;
      flex-direction: column;
    }
    
    .split-col.left {
      align-items: flex-start;
      text-align: left;
    }
    
    .split-col.right {
      align-items: flex-end;
      text-align: right;
    }
    
    /* Device column & 3D viewport */
    .device-col {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100%;
      z-index: 4;
    }
    
    .phone-3d-viewport {
      perspective: 1600px;
      width: 650px;
      height: 950px;
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
    }
    
    /* Realistic shadow base under phone */
    .phone-floor-shadow {
      position: absolute;
      bottom: 12%;
      width: 320px;
      height: 25px;
      background: radial-gradient(ellipse at center, rgba(0, 0, 0, 0.65) 0%, transparent 70%);
      filter: blur(4px);
      z-index: 1;
      transition: transform 0.1s ease-out;
    }
    
    .phone-3d-scaler {
      transform-style: preserve-3d;
      transform: scale(0.95);
      z-index: 2;
    }
    
    .phone-3d-rig {
      position: relative;
      width: 360px;
      height: 740px;
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
    
    /* Front Screen with curved bezel overlays */
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
    
    /* Extruded side metal rails */
    .phone-side {
      position: absolute;
      background: none;
      border: none;
    }
    
    .landscape-layout .phone-side {
      background: linear-gradient(to bottom, #2d2d37, #191921 50%, #2d2d37);
      border: 1px solid #141419;
    }
    
    .side-left { width: 18px; height: 740px; left: -9px; top: 0; transform: rotateY(90deg); }
    .side-right { width: 18px; height: 740px; right: -9px; top: 0; transform: rotateY(-90deg); }
    .side-top { width: 360px; height: 18px; left: 0; top: -9px; transform: rotateX(90deg); }
    .side-bottom { width: 360px; height: 18px; left: 0; bottom: -9px; transform: rotateX(-90deg); }
    
    .phone-face.back {
      background: #17171e;
      transform: rotateY(180deg) translateZ(9px);
      border: 4px solid #131318;
      box-shadow: 0 30px 60px rgba(0,0,0,0.8);
    }
    
    /* Speaker & camera slot details */
    .bezel-speaker {
      position: absolute;
      top: 15px;
      left: 50%;
      transform: translateX(-50%);
      width: 70px;
      height: 4px;
      background: #25252d;
      border-radius: 2px;
      z-index: 15;
    }
    
    .bezel-camera {
      position: absolute;
      top: 13px;
      left: 64%;
      width: 8px;
      height: 8px;
      background: #0f1015;
      border-radius: 50%;
      border: 1px solid #202029;
      z-index: 15;
    }
    
    /* Landscape screenshot rotation within portrait frame */
    .landscape-screenshot {
      width: 742px !important;
      height: 362px !important;
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%) rotate(90deg);
      object-fit: cover;
    }
    
    /* Outro card styling */
    .outro-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      width: 100%;
      height: 100%;
      z-index: 10;
    }
    
    .outro-logo-wrap {
      display: flex;
      align-items: center;
      gap: 16px;
    }
    
    .envato-leaf {
      width: 58px;
      height: 58px;
      fill: #82b541;
      filter: drop-shadow(0 2px 8px rgba(130, 181, 65, 0.3));
    }
    
    .envato-text {
      font-family: 'Montserrat', sans-serif;
      font-size: 54px;
      font-weight: 700;
      letter-spacing: -2px;
      color: #ffffff;
    }
    
    ${getUniversalPlayerScriptAndStyle(config).style}
  </style>
  <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;700;800&family=Oswald:wght@500;700;800&display=swap" rel="stylesheet">
</head>
<body>
  <div class="canvas">
    <div class="spotlight"></div>
    
    <!-- Scene 1 -->
    <div class="scene" id="scene-0">
      <div class="scene-content" style="flex-direction: row-reverse;">
        <div class="copy-col right-side">
          <h2 class="title-white" id="s0-text">PHONE PRESENTATION</h2>
          <h3 class="title-amber" id="s0-subtext">NEW BRAND TEMPLATE</h3>
        </div>
        <div class="device-col">
          <div class="phone-3d-viewport">
            <div class="phone-floor-shadow" id="shadow-0"></div>
            <div class="phone-3d-scaler" style="transform: scale(0.91);">
              <div class="phone-3d-rig" id="phone-rig-0">
                <div class="phone-face front">
                  <div class="bezel-speaker"></div>
                  <div class="bezel-camera"></div>
                  <div class="gloss-sheen"></div>
                  <div class="screen-edge-glare left-edge"></div>
                  <div class="screen-edge-glare right-edge"></div>
                  <div class="curved-edge-shadow left"></div>
                  <div class="curved-edge-shadow right"></div>
                  <div class="screen-scroll-wrap">
                    <img class="phone-screen" id="slot-0" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" alt="Screen 1" />
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
    
    <!-- Scene 2 -->
    <div class="scene" id="scene-1">
      <div class="scene-content">
        <div class="copy-col">
          <h2 class="title-white" id="s1-text">NO PLUGINS REQUIRED</h2>
          <h3 class="title-amber" id="s1-subtext">SIMPLE SETUP</h3>
        </div>
        <div class="device-col">
          <div class="phone-3d-viewport">
            <div class="phone-floor-shadow" id="shadow-1"></div>
            <div class="phone-3d-scaler" style="transform: scale(0.92);">
              <div class="phone-3d-rig" id="phone-rig-1">
                <div class="phone-face front">
                  <div class="bezel-speaker"></div>
                  <div class="bezel-camera"></div>
                  <div class="gloss-sheen"></div>
                  <div class="screen-edge-glare left-edge"></div>
                  <div class="screen-edge-glare right-edge"></div>
                  <div class="curved-edge-shadow left"></div>
                  <div class="curved-edge-shadow right"></div>
                  <div class="screen-scroll-wrap">
                    <img class="phone-screen" id="slot-1" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" alt="Screen 2" />
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
    
    <!-- Scene 3 -->
    <div class="scene" id="scene-2">
      <div class="scene-content landscape-layout">
        <div class="device-col">
          <div class="phone-3d-viewport">
            <div class="phone-floor-shadow" id="shadow-2" style="width: 580px;"></div>
            <div class="phone-3d-scaler" style="transform: scale(0.96);">
              <div class="phone-3d-rig" id="phone-rig-2">
                <div class="phone-face front">
                  <div class="bezel-speaker"></div>
                  <div class="bezel-camera"></div>
                  <div class="gloss-sheen"></div>
                  <div class="screen-edge-glare left-edge"></div>
                  <div class="screen-edge-glare right-edge"></div>
                  <div class="curved-edge-shadow left"></div>
                  <div class="curved-edge-shadow right"></div>
                  <div class="screen-scroll-wrap">
                    <img class="phone-screen landscape-screenshot" id="slot-2" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" alt="Screen 3" />
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
    
    <!-- Scene 4 -->
    <div class="scene" id="scene-3">
      <div class="scene-content">
        <div class="copy-col">
          <h2 class="title-white" id="s3-text">VERY FAST RENDER</h2>
          <h3 class="title-amber" id="s3-subtext">STYLISH LOOK</h3>
        </div>
        <div class="device-col">
          <div class="phone-3d-viewport">
            <div class="phone-floor-shadow" id="shadow-3"></div>
            <div class="phone-3d-scaler" style="transform: scale(0.92);">
              <div class="phone-3d-rig" id="phone-rig-3">
                <div class="phone-face front">
                  <div class="bezel-speaker"></div>
                  <div class="bezel-camera"></div>
                  <div class="gloss-sheen"></div>
                  <div class="screen-edge-glare left-edge"></div>
                  <div class="screen-edge-glare right-edge"></div>
                  <div class="curved-edge-shadow left"></div>
                  <div class="curved-edge-shadow right"></div>
                  <div class="screen-scroll-wrap">
                    <img class="phone-screen" id="slot-3" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" alt="Screen 4" />
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
    
    <!-- Scene 5 -->
    <div class="scene" id="scene-4">
      <div class="scene-content" style="flex-direction: row-reverse;">
        <div class="copy-col right-side">
          <h2 class="title-white" id="s4-text">MODULAR STRUCTURE</h2>
          <h3 class="title-amber" id="s4-subtext">READY TO USE</h3>
        </div>
        <div class="device-col">
          <div class="phone-3d-viewport">
            <div class="phone-floor-shadow" id="shadow-4"></div>
            <div class="phone-3d-scaler" style="transform: scale(0.92);">
              <div class="phone-3d-rig" id="phone-rig-4">
                <div class="phone-face front">
                  <div class="bezel-speaker"></div>
                  <div class="bezel-camera"></div>
                  <div class="gloss-sheen"></div>
                  <div class="screen-edge-glare left-edge"></div>
                  <div class="screen-edge-glare right-edge"></div>
                  <div class="curved-edge-shadow left"></div>
                  <div class="curved-edge-shadow right"></div>
                  <div class="screen-scroll-wrap">
                    <img class="phone-screen" id="slot-4" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" alt="Screen 5" />
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
    
    <!-- Scene 6 -->
    <div class="scene" id="scene-5">
      <div class="scene-content landscape-layout">
        <div class="device-col">
          <div class="phone-3d-viewport">
            <div class="phone-floor-shadow" id="shadow-5" style="width: 580px;"></div>
            <div class="phone-3d-scaler" style="transform: scale(0.96);">
              <div class="phone-3d-rig" id="phone-rig-5">
                <div class="phone-face front">
                  <div class="bezel-speaker"></div>
                  <div class="bezel-camera"></div>
                  <div class="gloss-sheen"></div>
                  <div class="screen-edge-glare left-edge"></div>
                  <div class="screen-edge-glare right-edge"></div>
                  <div class="curved-edge-shadow left"></div>
                  <div class="curved-edge-shadow right"></div>
                  <div class="screen-scroll-wrap">
                    <img class="phone-screen landscape-screenshot" id="slot-5" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" alt="Screen 6" />
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
    
    <!-- Scene 7 -->
    <div class="scene" id="scene-6">
      <div class="scene-content">
        <div class="copy-col">
          <h2 class="title-white" id="s6-text">FULL HD RESOLUTION</h2>
          <h3 class="title-amber" id="s6-subtext">VERY FAST RENDER</h3>
        </div>
        <div class="device-col">
          <div class="phone-3d-viewport">
            <div class="phone-floor-shadow" id="shadow-6"></div>
            <div class="phone-3d-scaler" style="transform: scale(0.92);">
              <div class="phone-3d-rig" id="phone-rig-6">
                <div class="phone-face front">
                  <div class="bezel-speaker"></div>
                  <div class="bezel-camera"></div>
                  <div class="gloss-sheen"></div>
                  <div class="screen-edge-glare left-edge"></div>
                  <div class="screen-edge-glare right-edge"></div>
                  <div class="curved-edge-shadow left"></div>
                  <div class="curved-edge-shadow right"></div>
                  <div class="screen-scroll-wrap">
                    <img class="phone-screen" id="slot-6" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" alt="Screen 7" />
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
    
    <!-- Scene 8 -->
    <div class="scene" id="scene-7">
      <div class="scene-content" style="flex-direction: row-reverse;">
        <div class="copy-col right-side">
          <h2 class="title-white" id="s7-text">EASY CUSTOMIZE</h2>
          <h3 class="title-amber" id="s7-subtext">FRESH DESIGN</h3>
        </div>
        <div class="device-col">
          <div class="phone-3d-viewport">
            <div class="phone-floor-shadow" id="shadow-7"></div>
            <div class="phone-3d-scaler" style="transform: scale(0.92);">
              <div class="phone-3d-rig" id="phone-rig-7">
                <div class="phone-face front">
                  <div class="bezel-speaker"></div>
                  <div class="bezel-camera"></div>
                  <div class="gloss-sheen"></div>
                  <div class="screen-edge-glare left-edge"></div>
                  <div class="screen-edge-glare right-edge"></div>
                  <div class="curved-edge-shadow left"></div>
                  <div class="curved-edge-shadow right"></div>
                  <div class="screen-scroll-wrap">
                    <img class="phone-screen" id="slot-7" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" alt="Screen 8" />
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
    
    <!-- Scene 9 -->
    <div class="scene" id="scene-8">
      <div class="split-container">
        <div class="split-col left">
          <h2 class="title-white" id="s8-text">STYLISH TEMPLATE</h2>
          <h3 class="title-amber" id="s8-subtext">NEW BRAND</h3>
        </div>
        <div class="split-col right">
          <h2 class="title-white" id="s8-text-right">ONLY ON VIDEOHIVE</h2>
          <h3 class="title-amber" id="s8-subtext-right">GET IT NOW</h3>
        </div>
      </div>
      <div class="scene-content" style="justify-content: center;">
        <div class="device-col">
          <div class="phone-3d-viewport">
            <div class="phone-floor-shadow" id="shadow-8"></div>
            <div class="phone-3d-scaler" style="transform: scale(0.94);">
              <div class="phone-3d-rig" id="phone-rig-8">
                <div class="phone-face front">
                  <div class="bezel-speaker"></div>
                  <div class="bezel-camera"></div>
                  <div class="gloss-sheen"></div>
                  <div class="screen-edge-glare left-edge"></div>
                  <div class="screen-edge-glare right-edge"></div>
                  <div class="curved-edge-shadow left"></div>
                  <div class="curved-edge-shadow right"></div>
                  <div class="screen-scroll-wrap">
                    <img class="phone-screen" id="slot-8" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" alt="Screen 9" />
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
    
    <!-- Scene 10 -->
    <div class="scene" id="scene-9">
      <div class="scene-content" style="flex-direction: row-reverse;">
        <div class="copy-col right-side">
          <h2 class="title-white" id="s9-text">ELEGANT TEMPLATE</h2>
          <h3 class="title-amber" id="s9-subtext">READY TO USE</h3>
        </div>
        <div class="device-col">
          <div class="phone-3d-viewport">
            <div class="phone-floor-shadow" id="shadow-9"></div>
            <div class="phone-3d-scaler" style="transform: scale(0.92);">
              <div class="phone-3d-rig" id="phone-rig-9">
                <div class="phone-face front">
                  <div class="bezel-speaker"></div>
                  <div class="bezel-camera"></div>
                  <div class="gloss-sheen"></div>
                  <div class="screen-edge-glare left-edge"></div>
                  <div class="screen-edge-glare right-edge"></div>
                  <div class="curved-edge-shadow left"></div>
                  <div class="curved-edge-shadow right"></div>
                  <div class="screen-scroll-wrap">
                    <img class="phone-screen" id="slot-9" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" alt="Screen 10" />
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
    
    <!-- Scene 11 -->
    <div class="scene" id="scene-10">
      <div class="scene-content landscape-layout">
        <div class="device-col">
          <div class="phone-3d-viewport">
            <div class="phone-floor-shadow" id="shadow-10" style="width: 580px;"></div>
            <div class="phone-3d-scaler" style="transform: scale(0.96);">
              <div class="phone-3d-rig" id="phone-rig-10">
                <div class="phone-face front">
                  <div class="bezel-speaker"></div>
                  <div class="bezel-camera"></div>
                  <div class="gloss-sheen"></div>
                  <div class="screen-edge-glare left-edge"></div>
                  <div class="screen-edge-glare right-edge"></div>
                  <div class="curved-edge-shadow left"></div>
                  <div class="curved-edge-shadow right"></div>
                  <div class="screen-scroll-wrap">
                    <img class="phone-screen landscape-screenshot" id="slot-10" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" alt="Screen 11" />
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
    
    <!-- Scene 12 -->
    <div class="scene" id="scene-11">
      <div class="scene-content">
        <div class="copy-col">
          <h2 class="title-white" id="s11-text">PLACE IMAGE OR VIDEO</h2>
          <h3 class="title-amber" id="s11-subtext">DRAG AND DROP</h3>
        </div>
        <div class="device-col">
          <div class="phone-3d-viewport">
            <div class="phone-floor-shadow" id="shadow-11"></div>
            <div class="phone-3d-scaler" style="transform: scale(0.92);">
              <div class="phone-3d-rig" id="phone-rig-11">
                <div class="phone-face front">
                  <div class="bezel-speaker"></div>
                  <div class="bezel-camera"></div>
                  <div class="gloss-sheen"></div>
                  <div class="screen-edge-glare left-edge"></div>
                  <div class="screen-edge-glare right-edge"></div>
                  <div class="curved-edge-shadow left"></div>
                  <div class="curved-edge-shadow right"></div>
                  <div class="screen-scroll-wrap">
                    <img class="phone-screen" id="slot-11" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" alt="Screen 12" />
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
    
    <!-- Scene 13 (Closeup Macro View) -->
    <div class="scene" id="scene-12">
      <div class="scene-content" style="flex-direction: row-reverse;">
        <div class="copy-col right-side">
          <h2 class="title-white" id="s12-text">AE CS6 AND ABOVE</h2>
          <h3 class="title-amber" id="s12-subtext">VIDEO TUTORIAL</h3>
        </div>
        <div class="device-col">
          <div class="phone-3d-viewport" style="transform: translateX(160px);">
            <div class="phone-floor-shadow" id="shadow-12" style="transform: translateX(-160px) scale(0.5); opacity: 0.3;"></div>
            <div class="phone-3d-scaler" style="transform: scale(1.35);">
              <div class="phone-3d-rig" id="phone-rig-12">
                <div class="phone-face front">
                  <div class="bezel-speaker"></div>
                  <div class="bezel-camera"></div>
                  <div class="gloss-sheen"></div>
                  <div class="screen-edge-glare left-edge"></div>
                  <div class="screen-edge-glare right-edge"></div>
                  <div class="curved-edge-shadow left"></div>
                  <div class="curved-edge-shadow right"></div>
                  <div class="screen-scroll-wrap">
                    <img class="phone-screen" id="slot-12" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" alt="Screen 13" />
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
    
    <!-- Scene 14 (Final Upright Showcase) -->
    <div class="scene" id="scene-13">
      <div class="scene-content" style="justify-content: center;">
        <div class="device-col">
          <div class="phone-3d-viewport">
            <div class="phone-floor-shadow" id="shadow-13"></div>
            <div class="phone-3d-scaler" style="transform: scale(1.0);">
              <div class="phone-3d-rig" id="phone-rig-13">
                <div class="phone-face front">
                  <div class="bezel-speaker"></div>
                  <div class="bezel-camera"></div>
                  <div class="gloss-sheen"></div>
                  <div class="screen-edge-glare left-edge"></div>
                  <div class="screen-edge-glare right-edge"></div>
                  <div class="curved-edge-shadow left"></div>
                  <div class="curved-edge-shadow right"></div>
                  <div class="screen-scroll-wrap">
                    <img class="phone-screen" id="slot-13" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" alt="Screen 14" />
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
    
    <!-- Scene 15 (Outro Card) -->
    <div class="scene" id="scene-14">
      <div class="outro-container">
        <div class="outro-logo-wrap">
          <svg class="envato-leaf" viewBox="0 0 100 100">
            <path d="M85.3,17.7c-5-4.8-13-7.5-22.1-7.7c-2.4,0-4.7,0.2-6.9,0.5c-4.4,0.7-8.5,2.1-12.1,4.1c-1.8,1-3.5,2.2-5.1,3.6 c-2.4,2.2-4.5,4.8-6.1,7.8C31.5,29,30.3,32.3,29.5,36c-0.8,3.7-0.9,7.8-0.2,12.3c0.8,5.1,2.8,10.6,6.3,16.4 c3.4,5.8,8.2,11.9,14.6,18.4c0.5,0.5,1.2,0.8,1.9,0.8c0.7,0,1.4-0.3,1.9-0.8c6.4-6.5,11.2-12.6,14.6-18.4 c3.5-5.8,5.5-11.3,6.3-16.4c0.7-4.5,0.6-8.6-0.2-12.3c-0.8-3.7-2-7-3.6-10C88.5,31.7,87.4,24,85.3,17.7z" />
          </svg>
          <span class="envato-text">envato</span>
        </div>
      </div>
    </div>
  </div>
  
  <!-- Standalone Player Overlay -->
  <div class="v-player-bar" id="v-player-bar">
    <button class="v-btn" id="v-play-btn" title="Play / Pause (Space)">&#9654;</button>
    <button class="v-btn v-btn-secondary" id="v-replay-btn" title="Replay">&#8635;</button>
    <div class="v-timeline-box">
      <div class="v-scrubber" id="v-scrubber">
        <div class="v-scrubber-fill" id="v-scrubber-fill"></div>
        <div class="v-scrubber-thumb" id="v-scrubber-thumb"></div>
      </div>
      <div class="v-time-text" id="v-time-text">0:00 / 1:21</div>
    </div>
    <div class="v-pills" id="v-pills">
      ${config.scenes.map((s, idx) => '<button class="v-pill ' + (idx === 0 ? 'active' : '') + '" data-scene="' + idx + '">' + (idx + 1) + '</button>').join('')}
    </div>
  </div>
  
  <script type="application/json" id="template-config">
    ${JSON.stringify(config, null, 2)}
  </script>

  <script>
    /* Continuous web scroll and 3D camera transitions */
    window.__customSceneTransform = function(sceneIdx, progress, globalTimeMs) {
      // Scroll the website mockup downward in every portrait scene
      const screen = document.getElementById("slot-" + sceneIdx);
      if (screen && sceneIdx !== 2 && sceneIdx !== 5 && sceneIdx !== 10 && sceneIdx !== 14) {
        // Continuous translation of screen image up to 32%
        screen.style.transform = "translateY(-" + (progress * 32) + "%)";
      }

      // Smooth custom 3D rotation and shadows for each layout
      const rig = document.getElementById("phone-rig-" + sceneIdx);
      const shadow = document.getElementById("shadow-" + sceneIdx);

      if (!rig) return;

      if (sceneIdx === 0) {
        // Scene 1: Phone Left (Yaw 28deg to 18deg)
        const yaw = 28 - (progress * 10);
        const pitch = 3 * Math.sin(progress * Math.PI);
        rig.style.transform = "rotateY(" + yaw + "deg) rotateX(" + pitch + "deg)";
        if (shadow) shadow.style.transform = "translateX(" + (yaw * -1.5) + "px) scale(" + (1 - progress * 0.05) + ")";
      } 
      else if (sceneIdx === 1) {
        // Scene 2: Phone Right (Yaw -28deg to -16deg)
        const yaw = -28 + (progress * 12);
        const pitch = -3 * Math.sin(progress * Math.PI);
        rig.style.transform = "rotateY(" + yaw + "deg) rotateX(" + pitch + "deg)";
        if (shadow) shadow.style.transform = "translateX(" + (yaw * -1.5) + "px) scale(" + (1 - progress * 0.05) + ")";
      } 
      else if (sceneIdx === 2) {
        // Scene 3: Landscape Center (rotateZ -90deg, yaw/pitch slow tilt)
        const pitch = 18 - (progress * 8);
        const yaw = -6 + (progress * 12);
        rig.style.transform = "rotateZ(-90deg) rotateX(" + pitch + "deg) rotateY(" + yaw + "deg)";
        if (shadow) shadow.style.transform = "translateY(15px) scale(" + (1.1 + progress * 0.03) + ")";
      }
      else if (sceneIdx === 3) {
        // Scene 4: Phone Right (Yaw -24deg to -14deg)
        const yaw = -24 + (progress * 10);
        rig.style.transform = "rotateY(" + yaw + "deg)";
        if (shadow) shadow.style.transform = "translateX(" + (yaw * -1.5) + "px)";
      }
      else if (sceneIdx === 4) {
        // Scene 5: Phone Left (Yaw 26deg to 16deg)
        const yaw = 26 - (progress * 10);
        rig.style.transform = "rotateY(" + yaw + "deg)";
        if (shadow) shadow.style.transform = "translateX(" + (yaw * -1.5) + "px)";
      }
      else if (sceneIdx === 5) {
        // Scene 6: Landscape Center 2
        const pitch = 16 - (progress * 6);
        const yaw = -8 + (progress * 14);
        rig.style.transform = "rotateZ(-90deg) rotateX(" + pitch + "deg) rotateY(" + yaw + "deg)";
      }
      else if (sceneIdx === 6) {
        // Scene 7: Phone Right (Yaw -22deg to -12deg)
        const yaw = -22 + (progress * 10);
        rig.style.transform = "rotateY(" + yaw + "deg)";
      }
      else if (sceneIdx === 7) {
        // Scene 8: Phone Left (Yaw 24deg to 14deg)
        const yaw = 24 - (progress * 10);
        rig.style.transform = "rotateY(" + yaw + "deg)";
      }
      else if (sceneIdx === 8) {
        // Scene 9: Symmetrical Center
        const pitch = 2 * Math.sin(progress * Math.PI);
        const roll = Math.sin(progress * Math.PI * 2) * 1.5;
        rig.style.transform = "rotateY(0deg) rotateX(" + pitch + "deg) rotateZ(" + roll + "deg)";
      }
      else if (sceneIdx === 9) {
        // Scene 10: Phone Left (Yaw 22deg to 12deg)
        const yaw = 22 - (progress * 10);
        rig.style.transform = "rotateY(" + yaw + "deg)";
      }
      else if (sceneIdx === 10) {
        // Scene 11: Landscape Center 3
        const pitch = 18 - (progress * 8);
        const yaw = -6 + (progress * 12);
        rig.style.transform = "rotateZ(-90deg) rotateX(" + pitch + "deg) rotateY(" + yaw + "deg)";
      }
      else if (sceneIdx === 11) {
        // Scene 12: Phone Right (Yaw -24deg to -14deg)
        const yaw = -24 + (progress * 10);
        rig.style.transform = "rotateY(" + yaw + "deg)";
      }
      else if (sceneIdx === 12) {
        // Scene 13: Closeup Macro Left (Scale 1.35, yaw 26deg to 20deg)
        const yaw = 26 - (progress * 6);
        rig.style.transform = "rotateY(" + yaw + "deg) rotateX(2deg)";
      }
      else if (sceneIdx === 13) {
        // Scene 14: Center Upright settle
        rig.style.transform = "rotateY(0deg) rotateX(0deg)";
      }
    };
  </script>

  ${getUniversalPlayerScriptAndStyle(config).script}
</body>
</html>`;

  // Write template compiled markup directly to the official project directory tpl-23552607-minimal-studio-3d
  const targetDir = path.join(rootDir, 'templates', 'video', 'tpl-23552607-minimal-studio-3d');
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const targetFile = path.join(targetDir, 'template.html');
  fs.writeFileSync(targetFile, templateHtml, 'utf8');
  console.log(`Successfully generated frame-accurate template at: \${targetFile}`);
}

// Auto-run if executed directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  create23552607Template();
}
