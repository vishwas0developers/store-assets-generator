import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getUniversalPlayerScriptAndStyle } from './player-helper.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

async function main() {
  console.log("Rebuilding all 16 standalone templates with authentic designs and playable player controllers...");

  // Import compiled render engine modules
  const renderModule = await import('../dist/src/video/render.js');
  const tempOrigModule = await import('../dist/src/video/temp_orig_templates.js');

  const {
    sceneLayoutCss,
    sceneContentHtml,
    CANVAS_BASE_CSS,
    DEVICE_CSS,
    WORD_SPAN_CSS,
    foldRigCss,
    SCENE_ANIMATIONS,
    DEVICE_REGISTRY,
    sourceUrisFor,
    sourceKindsFor,
    scratchVideoProject
  } = renderModule;

  const originalTemplates = tempOrigModule.VIDEO_TEMPLATES;
  const outBaseDir = path.join(rootDir, 'templates', 'video');
  fs.mkdirSync(outBaseDir, { recursive: true });

  // 1. Re-generate the 10 original templates with their pristine design and CSS keyframes
  for (const t of originalTemplates) {
    const tplDir = path.join(outBaseDir, t.id);
    fs.mkdirSync(tplDir, { recursive: true });

    const scratch = tempOrigModule.scratchVideoProject(t.id);
    scratch.template = null; // Forces templatePreviewHtml to run its full original CSS + keyframes generation engine!
    const rawHtml = renderModule.templatePreviewHtml(scratch);

    const playerComponents = getUniversalPlayerScriptAndStyle(t);

    // Inject player style into <head>, player html + config + player script before </body>
    let fullHtml = rawHtml;

    // Remove the old inline preview script from rawHtml
    fullHtml = fullHtml.replace(/<script>[\s\S]*?<\/script>/, '');

    // Inject styles
    fullHtml = fullHtml.replace('</style>', `${playerComponents.style}\n  </style>`);

    // Inject manifest config, player HTML, and interactive player script
    const injection = `
  ${playerComponents.html}

  <script type="application/json" id="template-config">
${JSON.stringify(t, null, 2)}
  </script>

  ${playerComponents.script}
`;
    fullHtml = fullHtml.replace('</body>', `${injection}\n</body>`);

    fs.writeFileSync(path.join(tplDir, 'template.html'), fullHtml);
    console.log(`[OK] Recreated authentic original template: ${t.id} (${t.aspectRatio}, ${t.device})`);
  }

  // 2. Re-generate the 6 reference templates with rich 3D phone designs + universal player
  await generateReferenceTemplates(outBaseDir);

  console.log("All 16 templates successfully generated!");
}

async function generateReferenceTemplates(outBaseDir) {
  // Reference 1: HUD Blueprint 1371526
  {
    const config = {
      id: "tpl-1371526-hud-blueprint",
      name: "Universal Tech HUD — 1371526 Reference",
      description: "Cyan chevron blueprint HUD style with full 3D phone rig.",
      useCase: "Best for HUD presentation.",
      designStyle: "Blueprint HUD",
      aspectRatio: "16:9",
      features: ["3D rig", "HUD overlay"],
      device: "apple-iphone-15-pro",
      variant: "hud-blueprint",
      deviceFraction: 0.6,
      scenes: [
        { label: "Scene 1", sceneTemplate: "hero-rise", durationSeconds: 5, background: "ocean", rotate: 0, zoom: 10, move: 0, layout: "stacked-top", text: "APP PRESENTATION", subtext: "", slots: { text: "s0-text" } },
        { label: "Scene 2", sceneTemplate: "hero-rise", durationSeconds: 6, background: "ocean", rotate: 0, zoom: 10, move: 0, layout: "copy-left", text: "UNIQUE ANIMATION", subtext: "Every scene has a unique pre-render animation of phone", slots: { text: "s1-text", subtext: "s1-subtext", screenshot: "slot-0" } },
        { label: "Scene 3", sceneTemplate: "hero-rise", durationSeconds: 6, background: "ocean", rotate: 0, zoom: 10, move: 0, layout: "copy-right", text: "DESIGN BY IMOCEAN", subtext: "Imocean has several phone promo templates. You can see more in portfolio", slots: { text: "s2-text", subtext: "s2-subtext", screenshot: "slot-1" } },
        { label: "Scene 4", sceneTemplate: "hero-rise", durationSeconds: 7, background: "ocean", rotate: 0, zoom: 10, move: 0, layout: "centre-flank", text: "THREE COLOR VERSIONS", subtext: "Black, white, and gold colors available for smartphone rigs", slots: { text: "s3-text", subtext: "s3-subtext", screenshots: ["slot-2", "slot-3", "slot-4"] } },
        { label: "Scene 5", sceneTemplate: "hero-rise", durationSeconds: 6, background: "ocean", rotate: 0, zoom: 10, move: 0, layout: "stacked-bottom", text: "GET STARTED NOW", subtext: "Download the template today to customize all texts, music, and insert your app screenshots easily.", slots: { text: "s4-text", subtext: "s4-subtext", screenshot: "slot-5" } }
      ]
    };
    const player = getUniversalPlayerScriptAndStyle(config);
    const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${config.name}</title>
  <style>
    html, body { margin:0; padding:0; width:1920px; height:1080px; overflow:hidden; background:#08141d; font-family:'Montserrat','Inter',sans-serif; color:#ffffff; }
    .canvas { position:relative; width:1920px; height:1080px; background:radial-gradient(circle at center, #0e2433 0%, #060e14 100%); overflow:hidden; }
    .dot-grid { position:absolute; inset:0; background-image:radial-gradient(rgba(0,210,196,0.15) 1px, transparent 1px); background-size:24px 24px; opacity:0.85; z-index:1; }
    .chevron-wings { position:absolute; inset:0; pointer-events:none; z-index:2; }
    .chevron-left, .chevron-right { position:absolute; top:50%; width:120px; height:600px; border:2px solid rgba(0,210,196,0.35); border-color:transparent rgba(0,210,196,0.35) transparent transparent; transform:translateY(-50%) rotate(45deg); }
    .chevron-left { left:-60px; border-radius:40px; }
    .chevron-right { right:-60px; transform:translateY(-50%) rotate(-135deg); border-radius:40px; }
    .scene { position:absolute; inset:0; width:1920px; height:1080px; display:none; align-items:center; justify-content:center; z-index:3; padding:0 10%; box-sizing:border-box; }
    .scene.active, .scene.playing { display:flex; }
    .scene-content { display:flex; width:100%; height:100%; align-items:center; justify-content:space-between; position:relative; }
    .copy-col { flex:1; max-width:700px; display:flex; flex-direction:column; justify-content:center; z-index:5; }
    .copy-col.right-side { text-align:right; align-items:flex-end; }
    .title { font-size:64px; font-weight:800; text-transform:uppercase; letter-spacing:2px; margin:0 0 20px 0; color:#ffffff; text-shadow:0 0 20px rgba(0,210,196,0.3); }
    .cyan-bar { width:160px; height:5px; background:#00d2c4; margin-bottom:30px; box-shadow:0 0 15px #00d2c4; }
    .subtitle { font-size:28px; font-weight:400; line-height:1.5; color:#a4c0d1; margin:0; }
    .device-col { flex:1; display:flex; align-items:center; justify-content:center; height:100%; z-index:4; }
    .phone-3d-container { perspective:1500px; width:600px; height:900px; display:flex; align-items:center; justify-content:center; }
    .phone-3d-scaler { transform-style:preserve-3d; transform:scale(1.0); }
    .phone-3d-rig { position:relative; width:360px; height:740px; transform-style:preserve-3d; transition:transform 0.1s ease-out; }
    .phone-face { position:absolute; inset:0; border-radius:44px; box-sizing:border-box; }
    .phone-face.front { background:#000000; transform:translateZ(8px); z-index:10; border:6px solid #1a1a1a; overflow:hidden; box-shadow:inset 0 0 15px rgba(0,210,196,0.3); }
    .phone-face.back { background:#111e26; transform:rotateY(180deg) translateZ(8px); border:6px solid #121f29; box-shadow:0 20px 50px rgba(0,0,0,0.5); }
    .phone-screen { width:100%; height:100%; object-fit:cover; border-radius:38px; }
    .notch { position:absolute; top:15px; left:50%; transform:translateX(-50%); width:110px; height:30px; background:#1a1a1a; border-radius:15px; z-index:12; }
    .gloss-sheen { position:absolute; inset:0; background:linear-gradient(135deg, rgba(255,255,255,0.2) 0%, rgba(255,255,255,0) 50%, rgba(255,255,255,0) 100%); z-index:11; pointer-events:none; }
    .phone-side { position:absolute; background:linear-gradient(to bottom, #16242e, #0e171f, #16242e); border:1px solid #0b1117; }
    .side-left { width:16px; height:740px; left:-8px; top:0; transform:rotateY(90deg); }
    .side-right { width:16px; height:740px; right:-8px; top:0; transform:rotateY(-90deg); }
    .side-top { width:360px; height:16px; left:0; top:-8px; transform:rotateX(90deg); }
    .side-bottom { width:360px; height:16px; left:0; bottom:-8px; transform:rotateX(-90deg); }
    .hud-overlay { position:absolute; inset:-20px; border:1px dashed rgba(0,210,196,0.25); border-radius:54px; pointer-events:none; transform:translateZ(-20px); transform-style:preserve-3d; }
    .intro-badge-container { display:flex; flex-direction:column; align-items:center; justify-content:center; width:100%; }
    .badge-icon-box { width:160px; height:160px; border-radius:40px; background:radial-gradient(circle, #00d2c4 0%, #00736c 100%); display:flex; align-items:center; justify-content:center; box-shadow:0 0 35px rgba(0,210,196,0.4); margin-bottom:40px; }
    .badge-icon-box svg { width:80px; height:80px; fill:#ffffff; }
    .badge-title-box { border:2px solid #00d2c4; border-radius:12px; padding:16px 48px; font-size:44px; font-weight:800; text-transform:uppercase; letter-spacing:4px; color:#ffffff; box-shadow:inset 0 0 20px rgba(0,210,196,0.2); }
    ${player.style}
  </style>
</head>
<body>
  <div class="canvas">
    <div class="dot-grid"></div>
    <div class="chevron-wings"><div class="chevron-left"></div><div class="chevron-right"></div></div>
    <!-- Scene 1 -->
    <div class="scene" id="scene-0">
      <div class="intro-badge-container">
        <div class="badge-icon-box"><svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg></div>
        <div class="badge-title-box" id="s0-text">APP PRESENTATION</div>
      </div>
    </div>
    <!-- Scene 2 -->
    <div class="scene" id="scene-1">
      <div class="scene-content">
        <div class="copy-col"><h2 class="title" id="s1-text">UNIQUE ANIMATION</h2><div class="cyan-bar"></div><p class="subtitle" id="s1-subtext">Every scene has a unique pre-render animation of phone</p></div>
        <div class="device-col"><div class="phone-3d-container"><div class="phone-3d-scaler" style="transform:scale(0.9);"><div class="phone-3d-rig" id="phone-rig-1"><div class="phone-face front"><div class="notch"></div><div class="gloss-sheen"></div><img class="phone-screen" id="slot-0" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" alt="Screen 1" /></div><div class="phone-face back"></div><div class="phone-side side-left"></div><div class="phone-side side-right"></div><div class="phone-side side-top"></div><div class="phone-side side-bottom"></div><div class="hud-overlay"></div></div></div></div></div>
      </div>
    </div>
    <!-- Scene 3 -->
    <div class="scene" id="scene-2">
      <div class="scene-content" style="flex-direction:row-reverse;">
        <div class="copy-col right-side"><h2 class="title" id="s2-text">DESIGN BY IMOCEAN</h2><div class="cyan-bar"></div><p class="subtitle" id="s2-subtext">Imocean has several phone promo templates. You can see more in portfolio</p></div>
        <div class="device-col"><div class="phone-3d-container"><div class="phone-3d-scaler" style="transform:scale(1.1) translateX(50px);"><div class="phone-3d-rig" id="phone-rig-2"><div class="phone-face front"><div class="notch"></div><div class="gloss-sheen"></div><img class="phone-screen" id="slot-1" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" alt="Screen 2" /></div><div class="phone-face back"></div><div class="phone-side side-left"></div><div class="phone-side side-right"></div><div class="phone-side side-top"></div><div class="phone-side side-bottom"></div></div></div></div></div>
      </div>
    </div>
    <!-- Scene 4 -->
    <div class="scene" id="scene-3">
      <div class="scene-content" style="flex-direction:column; justify-content:center; gap:40px;">
        <div class="copy-col" style="text-align:center; align-items:center; max-width:100%;"><h2 class="title" id="s3-text">THREE COLOR VERSIONS</h2><div class="cyan-bar"></div><p class="subtitle" id="s3-subtext">Black, white, and gold colors available for smartphone rigs</p></div>
        <div style="display:flex; gap:60px; justify-content:center; width:100%; transform-style:preserve-3d; perspective:1200px;">
          <div class="phone-3d-rig" id="phone-rig-3a" style="transform:scale(0.7) rotateY(15deg);"><div class="phone-face front"><img class="phone-screen" id="slot-2" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" alt="Screen 3" /></div><div class="phone-side side-left"></div><div class="phone-side side-right"></div><div class="phone-side side-top"></div><div class="phone-side side-bottom"></div></div>
          <div class="phone-3d-rig" id="phone-rig-3b" style="transform:scale(0.78) translateZ(20px);"><div class="phone-face front"><img class="phone-screen" id="slot-3" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" alt="Screen 4" /></div><div class="phone-side side-left"></div><div class="phone-side side-right"></div><div class="phone-side side-top"></div><div class="phone-side side-bottom"></div></div>
          <div class="phone-3d-rig" id="phone-rig-3c" style="transform:scale(0.7) rotateY(-15deg);"><div class="phone-face front"><img class="phone-screen" id="slot-4" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" alt="Screen 5" /></div><div class="phone-side side-left"></div><div class="phone-side side-right"></div><div class="phone-side side-top"></div><div class="phone-side side-bottom"></div></div>
        </div>
      </div>
    </div>
    <!-- Scene 5 -->
    <div class="scene" id="scene-4">
      <div class="scene-content" style="flex-direction:column; justify-content:center; gap:30px; text-align:center; align-items:center;">
        <h2 class="title" id="s4-text">GET STARTED NOW</h2><div class="cyan-bar"></div><p class="subtitle" id="s4-subtext" style="max-width:800px; margin-bottom:40px;">Download the template today to customize all texts, music, and insert your app screenshots easily.</p>
        <div class="device-col" style="height:auto;"><div class="phone-3d-container" style="height:400px;"><div class="phone-3d-scaler" style="transform:scale(0.65) rotateX(15deg);"><div class="phone-3d-rig" id="phone-rig-4"><div class="phone-face front"><img class="phone-screen" id="slot-5" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" alt="Screen 6" /></div><div class="phone-side side-left"></div><div class="phone-side side-right"></div><div class="phone-side side-top"></div><div class="phone-side side-bottom"></div></div></div></div></div>
      </div>
    </div>
  </div>
  ${player.html}

  <script type="application/json" id="template-config">
${JSON.stringify(config, null, 2)}
  </script>

  <script>
  window.__customSceneTransform = function(sceneIdx, progress, globalTimeMs) {
    if (sceneIdx === 1) {
      const rig = document.getElementById("phone-rig-1");
      if (rig) rig.style.transform = "rotateY(" + (-25 + progress * 15) + "deg) rotateX(" + (5 * Math.sin(progress * Math.PI)) + "deg)";
    } else if (sceneIdx === 2) {
      const rig = document.getElementById("phone-rig-2");
      if (rig) rig.style.transform = "rotateY(" + (25 - progress * 18) + "deg) rotateX(" + (-4 * Math.sin(progress * Math.PI)) + "deg)";
    } else if (sceneIdx === 3) {
      const rigA = document.getElementById("phone-rig-3a");
      const rigB = document.getElementById("phone-rig-3b");
      const rigC = document.getElementById("phone-rig-3c");
      if (rigA && rigB && rigC) {
        rigA.style.transform = "scale(0.7) rotateY(" + (15 + Math.sin(progress * Math.PI) * 10) + "deg)";
        rigB.style.transform = "scale(0.78) translateZ(20px) rotateX(" + (Math.sin(progress * Math.PI) * 8) + "deg)";
        rigC.style.transform = "scale(0.7) rotateY(" + (-15 - Math.sin(progress * Math.PI) * 10) + "deg)";
      }
    } else if (sceneIdx === 4) {
      const rig = document.getElementById("phone-rig-4");
      if (rig) rig.style.transform = "rotateX(" + (15 - progress * 5) + "deg) rotateY(" + (Math.sin(progress * Math.PI * 2) * 5) + "deg)";
    }
  };
  </script>

  ${player.script}
</body>
</html>`;
    const tplDir = path.join(outBaseDir, config.id);
    fs.mkdirSync(tplDir, { recursive: true });
    fs.writeFileSync(path.join(tplDir, 'template.html'), html);
    console.log(`[OK] Recreated reference template: ${config.id}`);
  }

  // Reference 2: Neon Rings 23393372
  {
    const config = {
      id: "tpl-23393372-neon-rings",
      name: "Neon Crimson Rings — 23393372 Reference",
      description: "Urban night city with neon pink concentric orbital rings.",
      useCase: "Best for high-contrast dark neon showcase.",
      designStyle: "Neon Crimson",
      aspectRatio: "16:9",
      features: ["Neon rings", "Curved glass phone"],
      device: "samsung-galaxy-s25",
      variant: "neon-rings",
      deviceFraction: 0.58,
      scenes: [
        { label: "Scene 1", sceneTemplate: "hero-rise", durationSeconds: 7, background: "graphite", rotate: 0, zoom: 10, move: 0, layout: "copy-left", text: "EFFECTIVE WAY TO TELL ABOUT THE PRODUCT", subtext: "This project is suitable for all. Change the text, font, insert your photos or videos.", slots: { text: "s0-text", subtext: "s0-subtext", screenshot: "slot-0" } },
        { label: "Scene 2", sceneTemplate: "hero-rise", durationSeconds: 7, background: "graphite", rotate: 0, zoom: 10, move: 0, layout: "copy-right", text: "STUNNING GRAPHICS", subtext: "Deliver high-contrast visual brilliance out of the box with responsive timing.", slots: { text: "s1-text", subtext: "s1-subtext", screenshot: "slot-1" } },
        { label: "Scene 3", sceneTemplate: "hero-rise", durationSeconds: 8, background: "graphite", rotate: 0, zoom: 10, move: 0, layout: "centre-flank", text: "POWERFUL CHROMATIC FINISH", subtext: "The project is fully universal and responsive to custom screenshots.", slots: { text: "s2-text", subtext: "s2-subtext", screenshot: "slot-2" } }
      ]
    };
    const player = getUniversalPlayerScriptAndStyle(config);
    const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${config.name}</title>
  <style>
    html, body { margin:0; padding:0; width:1920px; height:1080px; overflow:hidden; background:#050507; font-family:'Montserrat',sans-serif; color:#ffffff; }
    .canvas { position:relative; width:1920px; height:1080px; background:radial-gradient(circle at center, #150910 0%, #030305 100%); overflow:hidden; }
    .city-bokeh { position:absolute; inset:0; background:radial-gradient(circle at 20% 30%, rgba(232,23,93,0.18) 0%, transparent 60%), radial-gradient(circle at 80% 70%, rgba(255,42,109,0.12) 0%, transparent 60%); opacity:0.95; z-index:1; }
    .neon-rings-wrap { position:absolute; left:50%; top:50%; transform:translate(-50%, -50%); width:800px; height:800px; pointer-events:none; z-index:2; transform-style:preserve-3d; perspective:1200px; }
    .neon-ring { position:absolute; border:3px solid rgba(232,23,93,0.4); border-radius:50%; box-shadow:0 0 25px rgba(232,23,93,0.3), inset 0 0 25px rgba(232,23,93,0.3); }
    .ring-outer { width:700px; height:700px; left:50px; top:50px; border-style:dashed; }
    .ring-inner { width:500px; height:500px; left:150px; top:150px; border-width:2px; opacity:0.7; }
    .scene { position:absolute; inset:0; width:1920px; height:1080px; display:none; align-items:center; justify-content:center; z-index:3; padding:0 8%; box-sizing:border-box; }
    .scene.active, .scene.playing { display:flex; }
    .scene-content { display:flex; width:100%; height:100%; align-items:center; justify-content:space-between; position:relative; }
    .copy-col { flex:1.2; max-width:850px; display:flex; flex-direction:column; justify-content:center; z-index:5; }
    .title { font-size:72px; font-weight:900; text-transform:uppercase; line-height:1.1; letter-spacing:-1px; margin:0 0 24px 0; color:#ffffff; text-shadow:0 4px 15px rgba(0,0,0,0.8); }
    .subtitle-wrap { position:relative; padding-top:15px; }
    .red-dot { position:absolute; top:0; left:0; width:8px; height:8px; background:#ff2a6d; border-radius:50%; box-shadow:0 0 10px #ff2a6d; }
    .subtitle { font-size:26px; font-weight:500; line-height:1.6; color:#cccccc; margin:0; }
    .device-col { flex:0.8; display:flex; align-items:center; justify-content:center; height:100%; z-index:4; }
    .phone-3d-container { perspective:1500px; width:600px; height:900px; display:flex; align-items:center; justify-content:center; }
    .phone-3d-scaler { transform-style:preserve-3d; transform:scale(0.95); }
    .phone-3d-rig { position:relative; width:380px; height:780px; transform-style:preserve-3d; transition:transform 0.1s ease-out; }
    .phone-face { position:absolute; inset:0; border-radius:48px; box-sizing:border-box; }
    .phone-face.front { background:#000000; transform:translateZ(10px); z-index:10; border:5px solid #1c1c22; overflow:hidden; box-shadow:inset 0 0 25px rgba(255,42,109,0.25); }
    .phone-face.back { background:#e8175d; transform:rotateY(180deg) translateZ(10px); border:5px solid #ff2a6d; box-shadow:0 30px 60px rgba(0,0,0,0.65); }
    .phone-screen { width:100%; height:100%; object-fit:cover; border-radius:43px; }
    .gloss-sheen { position:absolute; inset:0; background:linear-gradient(105deg, rgba(255,255,255,0.25) 0%, rgba(255,255,255,0.02) 40%, rgba(255,255,255,0.15) 100%); z-index:11; pointer-events:none; }
    .phone-side { position:absolute; background:linear-gradient(to bottom, #d81b60, #880e4f, #d81b60); border:1px solid #4a0024; }
    .side-left { width:20px; height:780px; left:-10px; top:0; transform:rotateY(90deg); }
    .side-right { width:20px; height:780px; right:-10px; top:0; transform:rotateY(-90deg); }
    .side-top { width:380px; height:20px; left:0; top:-10px; transform:rotateX(90deg); }
    .side-bottom { width:380px; height:20px; left:0; bottom:-10px; transform:rotateX(-90deg); }
    ${player.style}
  </style>
</head>
<body>
  <div class="canvas">
    <div class="city-bokeh"></div>
    <div class="neon-rings-wrap" id="pulsing-rings"><div class="neon-ring ring-outer"></div><div class="neon-ring ring-inner"></div></div>
    <!-- Scene 1 -->
    <div class="scene" id="scene-0">
      <div class="scene-content">
        <div class="copy-col"><h2 class="title" id="s0-text">EFFECTIVE WAY TO TELL ABOUT THE PRODUCT</h2><div class="subtitle-wrap"><div class="red-dot"></div><p class="subtitle" id="s0-subtext">This project is suitable for all. Change the text, font, insert your photos or videos.</p></div></div>
        <div class="device-col"><div class="phone-3d-container"><div class="phone-3d-scaler" style="transform:scale(0.92);"><div class="phone-3d-rig" id="phone-rig-0"><div class="phone-face front"><div class="gloss-sheen"></div><img class="phone-screen" id="slot-0" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" alt="Screen 1" /></div><div class="phone-face back"></div><div class="phone-side side-left"></div><div class="phone-side side-right"></div><div class="phone-side side-top"></div><div class="phone-side side-bottom"></div></div></div></div></div>
      </div>
    </div>
    <!-- Scene 2 -->
    <div class="scene" id="scene-1">
      <div class="scene-content" style="flex-direction:row-reverse;">
        <div class="copy-col" style="align-items:flex-end; text-align:right;"><h2 class="title" id="s1-text">STUNNING GRAPHICS</h2><div class="subtitle-wrap" style="padding-top:15px; display:flex; justify-content:flex-end;"><div class="red-dot" style="right:0; left:auto;"></div><p class="subtitle" id="s1-subtext" style="max-width:500px;">Deliver high-contrast visual brilliance out of the box with responsive timing.</p></div></div>
        <div class="device-col"><div class="phone-3d-container"><div class="phone-3d-scaler" style="transform:scale(1.15) translateX(-60px);"><div class="phone-3d-rig" id="phone-rig-1"><div class="phone-face front"><div class="gloss-sheen"></div><img class="phone-screen" id="slot-1" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" alt="Screen 2" /></div><div class="phone-face back"></div><div class="phone-side side-left"></div><div class="phone-side side-right"></div><div class="phone-side side-top"></div><div class="phone-side side-bottom"></div></div></div></div></div>
      </div>
    </div>
    <!-- Scene 3 -->
    <div class="scene" id="scene-2">
      <div class="scene-content" style="justify-content:center; flex-direction:column; gap:30px;">
        <div class="copy-col" style="align-items:center; text-align:center; max-width:100%;"><h2 class="title" id="s2-text">POWERFUL CHROMATIC FINISH</h2><div class="subtitle-wrap" style="display:flex; justify-content:center;"><div class="red-dot" style="position:static; margin-right:10px; transform:translateY(12px);"></div><p class="subtitle" id="s2-subtext">The project is fully universal and responsive to custom screenshots.</p></div></div>
        <div class="device-col" style="height:480px;"><div class="phone-3d-container" style="height:450px;"><div class="phone-3d-scaler" style="transform:scale(0.8) rotateX(-10deg);"><div class="phone-3d-rig" id="phone-rig-2"><div class="phone-face back" style="transform:translateZ(10px);"></div><div class="phone-face front" style="transform:rotateY(180deg) translateZ(10px);"><img class="phone-screen" id="slot-2" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" alt="Screen 3" /></div><div class="phone-side side-left"></div><div class="phone-side side-right"></div><div class="phone-side side-top"></div><div class="phone-side side-bottom"></div></div></div></div></div>
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
    if (rings) rings.style.transform = "translate(-50%, -50%) rotate(" + (globalTimeMs * 0.02) + "deg) rotateX(15deg)";

    if (sceneIdx === 0) {
      const rig = document.getElementById("phone-rig-0");
      if (rig) rig.style.transform = "rotateY(" + (-28 + progress * 16) + "deg) rotateX(" + (12 * Math.sin(progress * Math.PI)) + "deg)";
    } else if (sceneIdx === 1) {
      const rig = document.getElementById("phone-rig-1");
      if (rig) rig.style.transform = "rotateY(" + (35 - progress * 18) + "deg) rotateX(" + (-8 * Math.cos(progress * Math.PI)) + "deg)";
    } else if (sceneIdx === 2) {
      const rig = document.getElementById("phone-rig-2");
      if (rig) rig.style.transform = "rotateY(" + (180 + progress * 360) + "deg)";
    }
  };
  </script>

  ${player.script}
</body>
</html>`;
    const tplDir = path.join(outBaseDir, config.id);
    fs.mkdirSync(tplDir, { recursive: true });
    fs.writeFileSync(path.join(tplDir, 'template.html'), html);
    console.log(`[OK] Recreated reference template: ${config.id}`);
  }

  // Reference 3: Minimal Studio 3D 23552607
  {
    const config = {
      id: "tpl-23552607-minimal-studio-3d",
      name: "3D Studio Minimal — 23552607 Reference",
      description: "Minimal studio with radial overhead spotlight and slow yaw orbit.",
      useCase: "Best for dark minimal web walkthrough.",
      designStyle: "Studio Minimal",
      aspectRatio: "16:9",
      features: ["Studio light", "Continuous screen scroll"],
      device: "google-pixel-9-pro",
      variant: "minimal-studio",
      deviceFraction: 0.6,
      scenes: [
        { label: "Scene 1", sceneTemplate: "hero-rise", durationSeconds: 8, background: "graphite", rotate: 0, zoom: 10, move: 0, layout: "copy-left", text: "NO PLUGINS REQUIRED", subtext: "SIMPLE SETUP", slots: { text: "s0-text", subtext: "s0-subtext", screenshot: "slot-0" } },
        { label: "Scene 2", sceneTemplate: "hero-rise", durationSeconds: 8, background: "graphite", rotate: 0, zoom: 10, move: 0, layout: "copy-right", text: "MINIMAL DESIGN", subtext: "NEW STYLE", slots: { text: "s1-text", subtext: "s1-subtext", screenshot: "slot-1" } },
        { label: "Scene 3", sceneTemplate: "hero-rise", durationSeconds: 9, background: "graphite", rotate: 0, zoom: 10, move: 0, layout: "centre-flank", text: "PIXEL PERFECT", subtext: "HIGH RESOLUTION DETAILS", slots: { text: "s2-text", subtext: "s2-subtext", screenshot: "slot-2" } }
      ]
    };
    const player = getUniversalPlayerScriptAndStyle(config);
    const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${config.name}</title>
  <style>
    html, body { margin:0; padding:0; width:1920px; height:1080px; overflow:hidden; background:#141416; font-family:'Montserrat',sans-serif; color:#ffffff; }
    .canvas { position:relative; width:1920px; height:1080px; background:radial-gradient(circle at 50% 30%, #202026 0%, #0d0d0f 100%); overflow:hidden; }
    .spotlight { position:absolute; inset:0; background:radial-gradient(ellipse at top, rgba(200, 150, 80, 0.08) 0%, transparent 60%); pointer-events:none; z-index:1; }
    .scene { position:absolute; inset:0; width:1920px; height:1080px; display:none; align-items:center; justify-content:center; z-index:3; padding:0 12%; box-sizing:border-box; }
    .scene.active, .scene.playing { display:flex; }
    .scene-content { display:flex; width:100%; height:100%; align-items:center; justify-content:space-between; position:relative; }
    .copy-col { flex:1; max-width:650px; display:flex; flex-direction:column; justify-content:center; z-index:5; }
    .copy-col.right-side { text-align:right; align-items:flex-end; }
    .title-white { font-family:'Oswald','Impact',sans-serif; font-size:68px; font-weight:800; text-transform:uppercase; letter-spacing:1px; margin:0; color:#ffffff; line-height:1.1; }
    .title-amber { font-family:'Oswald','Impact',sans-serif; font-size:56px; font-weight:700; text-transform:uppercase; letter-spacing:1px; margin:10px 0 0 0; color:#c89650; line-height:1.1; }
    .device-col { flex:1; display:flex; align-items:center; justify-content:center; height:100%; z-index:4; }
    .phone-3d-container { perspective:1500px; width:600px; height:900px; display:flex; align-items:center; justify-content:center; }
    .phone-3d-scaler { transform-style:preserve-3d; transform:scale(0.96); }
    .phone-3d-rig { position:relative; width:360px; height:750px; transform-style:preserve-3d; transition:transform 0.1s ease-out; }
    .phone-face { position:absolute; inset:0; border-radius:46px; box-sizing:border-box; }
    .phone-face.front { background:#000000; transform:translateZ(9px); z-index:10; border:5px solid #1a1a20; overflow:hidden; }
    .phone-face.back { background:#18181f; transform:rotateY(180deg) translateZ(9px); border:5px solid #15151b; box-shadow:0 25px 55px rgba(0,0,0,0.7); }
    .screen-scroll-wrap { width:100%; height:100%; border-radius:41px; overflow:hidden; position:relative; }
    .phone-screen { width:100%; position:absolute; top:0; left:0; object-fit:cover; }
    .gloss-sheen { position:absolute; inset:0; background:linear-gradient(135deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0.01) 35%, rgba(255,255,255,0.1) 100%); z-index:11; pointer-events:none; }
    .phone-side { position:absolute; background:linear-gradient(to bottom, #2b2b36, #1c1c24, #2b2b36); border:1px solid #121217; }
    .side-left { width:18px; height:750px; left:-9px; top:0; transform:rotateY(90deg); }
    .side-right { width:18px; height:750px; right:-9px; top:0; transform:rotateY(-90deg); }
    .side-top { width:360px; height:18px; left:0; top:-9px; transform:rotateX(90deg); }
    .side-bottom { width:360px; height:18px; left:0; bottom:-9px; transform:rotateX(-90deg); }
    ${player.style}
  </style>
</head>
<body>
  <div class="canvas">
    <div class="spotlight"></div>
    <!-- Scene 1 -->
    <div class="scene" id="scene-0">
      <div class="scene-content">
        <div class="copy-col"><h2 class="title-white" id="s0-text">NO PLUGINS REQUIRED</h2><h3 class="title-amber" id="s0-subtext">SIMPLE SETUP</h3></div>
        <div class="device-col"><div class="phone-3d-container"><div class="phone-3d-scaler" style="transform:scale(0.92);"><div class="phone-3d-rig" id="phone-rig-0"><div class="phone-face front"><div class="gloss-sheen"></div><div class="screen-scroll-wrap"><img class="phone-screen" id="slot-0" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" alt="Screen 1" /></div></div><div class="phone-face back"></div><div class="phone-side side-left"></div><div class="phone-side side-right"></div><div class="phone-side side-top"></div><div class="phone-side side-bottom"></div></div></div></div></div>
      </div>
    </div>
    <!-- Scene 2 -->
    <div class="scene" id="scene-1">
      <div class="scene-content" style="flex-direction:row-reverse;">
        <div class="copy-col right-side"><h2 class="title-white" id="s1-text">MINIMAL DESIGN</h2><h3 class="title-amber" id="s1-subtext">NEW STYLE</h3></div>
        <div class="device-col"><div class="phone-3d-container"><div class="phone-3d-scaler" style="transform:scale(0.95);"><div class="phone-3d-rig" id="phone-rig-1"><div class="phone-face front"><div class="gloss-sheen"></div><div class="screen-scroll-wrap"><img class="phone-screen" id="slot-1" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" alt="Screen 2" /></div></div><div class="phone-face back"></div><div class="phone-side side-left"></div><div class="phone-side side-right"></div><div class="phone-side side-top"></div><div class="phone-side side-bottom"></div></div></div></div></div>
      </div>
    </div>
    <!-- Scene 3 -->
    <div class="scene" id="scene-2">
      <div class="scene-content" style="flex-direction:column; justify-content:center; gap:40px;">
        <div class="copy-col" style="text-align:center; align-items:center; max-width:100%;"><h2 class="title-white" id="s2-text">PIXEL PERFECT</h2><h3 class="title-amber" id="s2-subtext">HIGH RESOLUTION DETAILS</h3></div>
        <div class="device-col" style="height:520px;"><div class="phone-3d-container" style="height:500px;"><div class="phone-3d-scaler" style="transform:scale(0.85);"><div class="phone-3d-rig" id="phone-rig-2"><div class="phone-face front"><div class="gloss-sheen"></div><div class="screen-scroll-wrap"><img class="phone-screen" id="slot-2" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" alt="Screen 3" /></div></div><div class="phone-face back"></div><div class="phone-side side-left"></div><div class="phone-side side-right"></div><div class="phone-side side-top"></div><div class="phone-side side-bottom"></div></div></div></div></div>
      </div>
    </div>
  </div>
  ${player.html}

  <script type="application/json" id="template-config">
${JSON.stringify(config, null, 2)}
  </script>

  <script>
  window.__customSceneTransform = function(sceneIdx, progress, globalTimeMs) {
    const screen = document.getElementById("slot-" + sceneIdx);
    if (screen) screen.style.transform = "translateY(-" + (progress * 50) + "%)";

    if (sceneIdx === 0) {
      const rig = document.getElementById("phone-rig-0");
      if (rig) rig.style.transform = "rotateY(" + (28 - progress * 16) + "deg) rotateX(" + (4 * Math.sin(progress * Math.PI)) + "deg)";
    } else if (sceneIdx === 1) {
      const rig = document.getElementById("phone-rig-1");
      if (rig) rig.style.transform = "rotateY(" + (-28 + progress * 16) + "deg) rotateX(" + (-4 * Math.sin(progress * Math.PI)) + "deg)";
    } else if (sceneIdx === 2) {
      const rig = document.getElementById("phone-rig-2");
      if (rig) rig.style.transform = "rotateY(" + (Math.sin(progress * Math.PI * 2) * 8) + "deg) rotateX(10deg)";
    }
  };
  </script>

  ${player.script}
</body>
</html>`;
    const tplDir = path.join(outBaseDir, config.id);
    fs.mkdirSync(tplDir, { recursive: true });
    fs.writeFileSync(path.join(tplDir, 'template.html'), html);
    console.log(`[OK] Recreated reference template: ${config.id}`);
  }

  // Reference 4: Dark Matte Spheres 27720310
  {
    const config = {
      id: "tpl-27720310-dark-matte-spheres",
      name: "Matte Geometry & Cyber Blue — 27720310 Reference",
      description: "Floating matte spheres with vibrant cyan rectangle framing and black badge text.",
      useCase: "Best for Swiss typography tech.",
      designStyle: "Matte Geometry",
      aspectRatio: "16:9",
      features: ["Matte spheres", "Swiss labels"],
      device: "google-pixel-9",
      variant: "matte-spheres",
      deviceFraction: 0.62,
      scenes: [
        { label: "Scene 1", sceneTemplate: "hero-rise", durationSeconds: 7, background: "graphite", rotate: 0, zoom: 10, move: 0, layout: "copy-left", text: "App of the week", subtext: "engineered / power / control", slots: { text: "s0-text", subtext: "s0-subtext", screenshot: "slot-0" } },
        { label: "Scene 2", sceneTemplate: "hero-rise", durationSeconds: 7, background: "graphite", rotate: 0, zoom: 10, move: 0, layout: "copy-right", text: "Vivid Interfaces", subtext: "zero latency / fast execution", slots: { text: "s1-text", subtext: "s1-subtext", screenshot: "slot-1" } },
        { label: "Scene 3", sceneTemplate: "hero-rise", durationSeconds: 8, background: "graphite", rotate: 0, zoom: 10, move: 0, layout: "centre-flank", text: "Access Portal", subtext: "initialize application / deploy", slots: { text: "s2-text", subtext: "s2-subtext", screenshot: "slot-2" } }
      ]
    };
    const player = getUniversalPlayerScriptAndStyle(config);
    const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${config.name}</title>
  <style>
    html, body { margin:0; padding:0; width:1920px; height:1080px; overflow:hidden; background:#0a0a0c; font-family:'Montserrat','Inter',sans-serif; color:#ffffff; }
    .canvas { position:relative; width:1920px; height:1080px; background:radial-gradient(circle at center, #14141a 0%, #050507 100%); overflow:hidden; }
    .sphere { position:absolute; border-radius:50%; background:radial-gradient(circle at 35% 35%, #3e3e46 0%, #0e0e12 70%, #030305 100%); box-shadow:0 20px 45px rgba(0,0,0,0.6); z-index:2; pointer-events:none; }
    .cyber-frame { position:absolute; left:50%; top:50%; transform:translate(-50%, -50%); width:1300px; height:720px; border:6px solid #00bfff; box-shadow:0 0 30px rgba(0, 191, 255, 0.25); z-index:1; pointer-events:none; }
    .swiss-label { position:absolute; font-family:monospace; font-size:14px; text-transform:lowercase; color:rgba(255, 255, 255, 0.4); z-index:5; }
    .scene { position:absolute; inset:0; width:1920px; height:1080px; display:none; align-items:center; justify-content:center; z-index:3; padding:0 14%; box-sizing:border-box; }
    .scene.active, .scene.playing { display:flex; }
    .scene-content { display:flex; width:100%; height:100%; align-items:center; justify-content:space-between; position:relative; }
    .copy-col { flex:1.1; max-width:720px; display:flex; flex-direction:column; justify-content:center; z-index:5; }
    .copy-col.right-side { text-align:right; align-items:flex-end; }
    .badge-title-wrap { background:#000000; padding:12px 24px; display:inline-block; margin-bottom:12px; border-left:4px solid #00bfff; }
    .title-white { font-size:54px; font-weight:800; text-transform:uppercase; letter-spacing:1px; margin:0; color:#ffffff; line-height:1.2; }
    .subtitle-wrap { margin-top:15px; }
    .subtitle { font-family:monospace; font-size:20px; color:#00bfff; margin:0; text-transform:lowercase; }
    .device-col { flex:0.9; display:flex; align-items:center; justify-content:center; height:100%; z-index:4; }
    .phone-3d-container { perspective:1500px; width:600px; height:900px; display:flex; align-items:center; justify-content:center; }
    .phone-3d-scaler { transform-style:preserve-3d; transform:scale(0.92); }
    .phone-3d-rig { position:relative; width:360px; height:740px; transform-style:preserve-3d; transition:transform 0.1s ease-out; }
    .phone-face { position:absolute; inset:0; border-radius:44px; box-sizing:border-box; }
    .phone-face.front { background:#000000; transform:translateZ(9px); z-index:10; border:6px solid #1c1c1f; overflow:hidden; }
    .phone-face.back { background:#111115; transform:rotateY(180deg) translateZ(9px); border:6px solid #16161c; box-shadow:0 25px 55px rgba(0,0,0,0.7); }
    .phone-screen { width:100%; height:100%; object-fit:cover; border-radius:38px; }
    .camera-punch { position:absolute; top:20px; left:50%; transform:translateX(-50%); width:14px; height:14px; background:#0d0d0f; border-radius:50%; border:2px solid #222; z-index:12; }
    .gloss-sheen { position:absolute; inset:0; background:linear-gradient(135deg, rgba(255,255,255,0.2) 0%, rgba(255,255,255,0.01) 40%, rgba(255,255,255,0.12) 100%); z-index:11; pointer-events:none; }
    .phone-side { position:absolute; background:linear-gradient(to bottom, #25252b, #15151a, #25252b); border:1px solid #111114; }
    .side-left { width:18px; height:740px; left:-9px; top:0; transform:rotateY(90deg); }
    .side-right { width:18px; height:740px; right:-9px; top:0; transform:rotateY(-90deg); }
    .side-top { width:360px; height:18px; left:0; top:-9px; transform:rotateX(90deg); }
    .side-bottom { width:360px; height:18px; left:0; bottom:-9px; transform:rotateX(-90deg); }
    ${player.style}
  </style>
</head>
<body>
  <div class="canvas">
    <div class="cyber-frame"></div>
    <div class="sphere" style="width:180px; height:180px; left:12%; top:15%;" id="sphere-1"></div>
    <div class="sphere" style="width:120px; height:120px; right:28%; bottom:12%;" id="sphere-2"></div>
    <div class="sphere" style="width:150px; height:150px; right:10%; top:30%;" id="sphere-3"></div>
    <div class="swiss-label" style="top:40px; left:40px;">new</div>
    <div class="swiss-label" style="top:40px; right:40px;">app</div>
    <!-- Scene 1 -->
    <div class="scene" id="scene-0">
      <div class="scene-content">
        <div class="copy-col"><div class="badge-title-wrap"><h2 class="title-white" id="s0-text">App of the week</h2></div><div class="subtitle-wrap"><p class="subtitle" id="s0-subtext">engineered / power / control</p></div></div>
        <div class="device-col"><div class="phone-3d-container"><div class="phone-3d-scaler" style="transform:scale(0.92);"><div class="phone-3d-rig" id="phone-rig-0"><div class="phone-face front"><div class="camera-punch"></div><div class="gloss-sheen"></div><img class="phone-screen" id="slot-0" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" alt="Screen 1" /></div><div class="phone-face back"></div><div class="phone-side side-left"></div><div class="phone-side side-right"></div><div class="phone-side side-top"></div><div class="phone-side side-bottom"></div></div></div></div></div>
      </div>
    </div>
    <!-- Scene 2 -->
    <div class="scene" id="scene-1">
      <div class="scene-content" style="flex-direction:row-reverse;">
        <div class="copy-col right-side"><div class="badge-title-wrap"><h2 class="title-white" id="s1-text">Vivid Interfaces</h2></div><div class="subtitle-wrap"><p class="subtitle" id="s1-subtext">zero latency / fast execution</p></div></div>
        <div class="device-col"><div class="phone-3d-container"><div class="phone-3d-scaler" style="transform:scale(0.96) rotateZ(-3deg);"><div class="phone-3d-rig" id="phone-rig-1"><div class="phone-face front"><div class="camera-punch"></div><div class="gloss-sheen"></div><img class="phone-screen" id="slot-1" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" alt="Screen 2" /></div><div class="phone-face back"></div><div class="phone-side side-left"></div><div class="phone-side side-right"></div><div class="phone-side side-top"></div><div class="phone-side side-bottom"></div></div></div></div></div>
      </div>
    </div>
    <!-- Scene 3 -->
    <div class="scene" id="scene-2">
      <div class="scene-content" style="flex-direction:column; justify-content:center; gap:40px; text-align:center; align-items:center;">
        <div class="copy-col" style="align-items:center; max-width:100%;"><div class="badge-title-wrap"><h2 class="title-white" id="s2-text">Access Portal</h2></div><div class="subtitle-wrap"><p class="subtitle" id="s2-subtext">initialize application / deploy</p></div></div>
        <div class="device-col" style="height:480px;"><div class="phone-3d-container" style="height:450px;"><div class="phone-3d-scaler" style="transform:scale(0.78);"><div class="phone-3d-rig" id="phone-rig-2"><div class="phone-face front"><div class="camera-punch"></div><img class="phone-screen" id="slot-2" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" alt="Screen 3" /></div><div class="phone-face back"></div><div class="phone-side side-left"></div><div class="phone-side side-right"></div><div class="phone-side side-top"></div><div class="phone-side side-bottom"></div></div></div></div></div>
      </div>
    </div>
  </div>
  ${player.html}

  <script type="application/json" id="template-config">
${JSON.stringify(config, null, 2)}
  </script>

  <script>
  window.__customSceneTransform = function(sceneIdx, progress, globalTimeMs) {
    const s1 = document.getElementById("sphere-1");
    const s2 = document.getElementById("sphere-2");
    const s3 = document.getElementById("sphere-3");
    if (s1 && s2 && s3) {
      s1.style.transform = "translateY(" + (Math.sin(globalTimeMs * 0.001) * 20) + "px)";
      s2.style.transform = "translateY(" + (Math.cos(globalTimeMs * 0.0015) * 15) + "px)";
      s3.style.transform = "translate(" + (Math.sin(globalTimeMs * 0.0012) * 15) + "px, " + (Math.cos(globalTimeMs * 0.0012) * 15) + "px)";
    }

    if (sceneIdx === 0) {
      const rig = document.getElementById("phone-rig-0");
      if (rig) rig.style.transform = "rotateY(" + (45 - progress * 15) + "deg) rotateX(" + (10 * Math.sin(progress * Math.PI)) + "deg)";
    } else if (sceneIdx === 1) {
      const rig = document.getElementById("phone-rig-1");
      if (rig) rig.style.transform = "rotateY(" + (-15 + progress * 15) + "deg) rotateX(" + (-8 * Math.cos(progress * Math.PI)) + "deg)";
    } else if (sceneIdx === 2) {
      const rig = document.getElementById("phone-rig-2");
      if (rig) rig.style.transform = "rotateY(" + (Math.sin(progress * Math.PI) * 10) + "deg) rotateX(12deg)";
    }
  };
  </script>

  ${player.script}
</body>
</html>`;
    const tplDir = path.join(outBaseDir, config.id);
    fs.mkdirSync(tplDir, { recursive: true });
    fs.writeFileSync(path.join(tplDir, 'template.html'), html);
    console.log(`[OK] Recreated reference template: ${config.id}`);
  }

  // Reference 5: Clean Split Panorama 38180229
  {
    const config = {
      id: "tpl-38180229-clean-split-panorama",
      name: "Clean Split & Curved Track — 38180229 Reference",
      description: "Split blue/white background with curved dashed track line.",
      useCase: "Best for split clean messenger layout.",
      designStyle: "Clean Split",
      aspectRatio: "16:9",
      features: ["Split background", "Dashed bezier path"],
      device: "apple-iphone-15-pro",
      variant: "split-panorama",
      deviceFraction: 0.6,
      scenes: [
        { label: "Scene 1", sceneTemplate: "hero-rise", durationSeconds: 6, background: "royal", rotate: 0, zoom: 10, move: 0, layout: "copy-left", text: "Built-in encryption", subtext: "Encrypted for your safety at every layer", slots: { text: "s0-text", subtext: "s0-subtext", screenshot: "slot-0" } },
        { label: "Scene 2", sceneTemplate: "hero-rise", durationSeconds: 6, background: "royal", rotate: 0, zoom: 10, move: 0, layout: "copy-right", text: "Group Chat Rooms", subtext: "Connect up to fifty members simultaneously with no lags", slots: { text: "s1-text", subtext: "s1-subtext", screenshot: "slot-1" } },
        { label: "Scene 3", sceneTemplate: "hero-rise", durationSeconds: 7, background: "royal", rotate: 0, zoom: 10, move: 0, layout: "centre-flank", text: "DOWNLOAD Today", subtext: "Get the secure messenger now on iOS and Android marketplaces", slots: { text: "s2-text", subtext: "s2-subtext", screenshot: "slot-2" } }
      ]
    };
    const player = getUniversalPlayerScriptAndStyle(config);
    const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${config.name}</title>
  <style>
    html, body { margin:0; padding:0; width:1920px; height:1080px; overflow:hidden; background:#ffffff; font-family:'Inter',sans-serif; color:#1a1a24; }
    .canvas { position:relative; width:1920px; height:1080px; background:#ffffff; overflow:hidden; }
    .blue-panel { position:absolute; left:0; top:0; width:480px; height:1080px; background:#1e88e5; z-index:1; }
    .curved-path-svg { position:absolute; inset:0; width:1920px; height:1080px; z-index:2; pointer-events:none; }
    .dashed-path { fill:none; stroke:rgba(30, 136, 229, 0.22); stroke-width:4; stroke-dasharray:10 10; }
    .squircle { position:absolute; width:80px; height:80px; border-radius:24px; background:#2196f3; box-shadow:0 10px 25px rgba(33, 150, 243, 0.35); z-index:2; pointer-events:none; }
    .badge-icon { position:absolute; width:90px; height:90px; border-radius:50%; background:#ffffff; box-shadow:0 8px 30px rgba(0,0,0,0.08); display:flex; align-items:center; justify-content:center; z-index:2; pointer-events:none; }
    .badge-icon svg { width:45px; height:45px; fill:#1e88e5; }
    .scene { position:absolute; inset:0; width:1920px; height:1080px; display:none; align-items:center; justify-content:center; z-index:3; padding-left:540px; padding-right:10%; box-sizing:border-box; }
    .scene.active, .scene.playing { display:flex; }
    .scene-content { display:flex; width:100%; height:100%; align-items:center; justify-content:space-between; position:relative; }
    .copy-col { flex:1.1; max-width:650px; display:flex; flex-direction:column; justify-content:center; z-index:5; }
    .title { font-size:56px; font-weight:800; letter-spacing:-0.5px; margin:0 0 16px 0; color:#111116; line-height:1.2; }
    .subtitle { font-size:24px; font-weight:400; line-height:1.5; color:#666a76; margin:0; }
    .device-col { flex:0.9; display:flex; align-items:center; justify-content:center; height:100%; z-index:4; }
    .phone-3d-container { perspective:1500px; width:600px; height:900px; display:flex; align-items:center; justify-content:center; }
    .phone-3d-scaler { transform-style:preserve-3d; transform:scale(0.92); }
    .phone-3d-rig { position:relative; width:360px; height:740px; transform-style:preserve-3d; transition:transform 0.1s ease-out; }
    .phone-face { position:absolute; inset:0; border-radius:44px; box-sizing:border-box; }
    .phone-face.front { background:#000000; transform:translateZ(8px); z-index:10; border:5px solid #1c1c1f; overflow:hidden; }
    .phone-face.back { background:#1e88e5; transform:rotateY(180deg) translateZ(8px); border:5px solid #1565c0; box-shadow:0 25px 55px rgba(0,0,0,0.15); }
    .phone-screen { width:100%; height:100%; object-fit:cover; border-radius:39px; }
    .phone-side { position:absolute; background:linear-gradient(to bottom, #2196f3, #1565c0, #2196f3); border:1px solid #0d47a1; }
    .side-left { width:16px; height:740px; left:-8px; top:0; transform:rotateY(90deg); }
    .side-right { width:16px; height:740px; right:-8px; top:0; transform:rotateY(-90deg); }
    .side-top { width:360px; height:16px; left:0; top:-8px; transform:rotateX(90deg); }
    .side-bottom { width:360px; height:16px; left:0; bottom:-8px; transform:rotateX(-90deg); }
    ${player.style}
  </style>
</head>
<body>
  <div class="canvas">
    <div class="blue-panel"></div>
    <svg class="curved-path-svg"><path class="dashed-path" d="M -100,540 C 400,300 1300,780 2000,540" /></svg>
    <div class="squircle" style="top:20%; left:300px;" id="sq-1"></div>
    <div class="squircle" style="bottom:15%; right:28%;" id="sq-2"></div>
    <div class="badge-icon" style="top:15%; right:15%;" id="badge-shield"><svg viewBox="0 0 24 24"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z"/></svg></div>
    <!-- Scene 1 -->
    <div class="scene" id="scene-0">
      <div class="scene-content">
        <div class="copy-col"><h2 class="title" id="s0-text">Built-in encryption</h2><p class="subtitle" id="s0-subtext">Encrypted for your safety at every layer</p></div>
        <div class="device-col"><div class="phone-3d-container"><div class="phone-3d-scaler" style="transform:scale(0.9);"><div class="phone-3d-rig" id="phone-rig-0"><div class="phone-face front"><img class="phone-screen" id="slot-0" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" alt="Screen 1" /></div><div class="phone-face back"></div><div class="phone-side side-left"></div><div class="phone-side side-right"></div><div class="phone-side side-top"></div><div class="phone-side side-bottom"></div></div></div></div></div>
      </div>
    </div>
    <!-- Scene 2 -->
    <div class="scene" id="scene-1">
      <div class="scene-content">
        <div class="copy-col"><h2 class="title" id="s1-text">Group Chat Rooms</h2><p class="subtitle" id="s1-subtext">Connect up to fifty members simultaneously with no lags</p></div>
        <div class="device-col"><div class="phone-3d-container"><div class="phone-3d-scaler" style="transform:scale(0.93) rotateZ(3deg);"><div class="phone-3d-rig" id="phone-rig-1"><div class="phone-face front"><img class="phone-screen" id="slot-1" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" alt="Screen 2" /></div><div class="phone-face back"></div><div class="phone-side side-left"></div><div class="phone-side side-right"></div><div class="phone-side side-top"></div><div class="phone-side side-bottom"></div></div></div></div></div>
      </div>
    </div>
    <!-- Scene 3 -->
    <div class="scene" id="scene-2">
      <div class="scene-content" style="flex-direction:column; justify-content:center; gap:40px; text-align:center; align-items:center; padding-right:0;">
        <div class="copy-col" style="align-items:center; max-width:100%;"><h2 class="title" id="s2-text">DOWNLOAD Today</h2><p class="subtitle" id="s2-subtext">Get the secure messenger now on iOS and Android marketplaces</p></div>
        <div class="device-col" style="height:480px;"><div class="phone-3d-container" style="height:450px;"><div class="phone-3d-scaler" style="transform:scale(0.8);"><div class="phone-3d-rig" id="phone-rig-2"><div class="phone-face front"><img class="phone-screen" id="slot-2" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" alt="Screen 3" /></div><div class="phone-face back"></div><div class="phone-side side-left"></div><div class="phone-side side-right"></div><div class="phone-side side-top"></div><div class="phone-side side-bottom"></div></div></div></div></div>
      </div>
    </div>
  </div>
  ${player.html}

  <script type="application/json" id="template-config">
${JSON.stringify(config, null, 2)}
  </script>

  <script>
  window.__customSceneTransform = function(sceneIdx, progress, globalTimeMs) {
    const sq1 = document.getElementById("sq-1");
    const sq2 = document.getElementById("sq-2");
    const shield = document.getElementById("badge-shield");
    if (sq1 && sq2 && shield) {
      sq1.style.transform = "translateY(" + (Math.sin(globalTimeMs * 0.001) * 20) + "px) rotate(" + (globalTimeMs * 0.02) + "deg)";
      sq2.style.transform = "translateY(" + (Math.cos(globalTimeMs * 0.0012) * 15) + "px)";
      shield.style.transform = "translateY(" + (Math.sin(globalTimeMs * 0.0008) * 12) + "px)";
    }

    if (sceneIdx === 0) {
      const rig = document.getElementById("phone-rig-0");
      if (rig) rig.style.transform = "rotateY(" + (-20 + progress * 15) + "deg) rotateX(" + (6 * Math.sin(progress * Math.PI)) + "deg)";
    } else if (sceneIdx === 1) {
      const rig = document.getElementById("phone-rig-1");
      if (rig) rig.style.transform = "rotateY(" + (18 - progress * 15) + "deg) rotateX(" + (-6 * Math.sin(progress * Math.PI)) + "deg)";
    } else if (sceneIdx === 2) {
      const rig = document.getElementById("phone-rig-2");
      if (rig) rig.style.transform = "rotateY(" + (Math.sin(progress * Math.PI) * 10) + "deg) rotateX(10deg)";
    }
  };
  </script>

  ${player.script}
</body>
</html>`;
    const tplDir = path.join(outBaseDir, config.id);
    fs.mkdirSync(tplDir, { recursive: true });
    fs.writeFileSync(path.join(tplDir, 'template.html'), html);
    console.log(`[OK] Recreated reference template: ${config.id}`);
  }

  // Reference 6: Delivery Trio 62155880
  {
    const config = {
      id: "tpl-62155880-delivery-trio-showcase",
      name: "Delivery App Trio — 62155880 Reference",
      description: "Stepped multi-device fan lineup with studio floor reflections and glass magnifying cost card.",
      useCase: "Best for premium delivery SaaS presentation.",
      designStyle: "Trio Showcase",
      aspectRatio: "16:9",
      features: ["Trio fan lineup", "Floor reflection", "Frosted glass card"],
      device: "apple-iphone-15-pro",
      variant: "delivery-trio",
      deviceFraction: 0.6,
      scenes: [
        { label: "Scene 1", sceneTemplate: "hero-rise", durationSeconds: 8, background: "royal", rotate: 0, zoom: 10, move: 0, layout: "copy-left", text: "Transparent In Every Detail", subtext: "As soon as you finish typing a word, it will be checked against the dictionary.", slots: { text: "s0-text", subtext: "s0-subtext", screenshots: ["slot-0", "slot-1"] } },
        { label: "Scene 2", sceneTemplate: "hero-rise", durationSeconds: 7, background: "royal", rotate: 0, zoom: 10, move: 0, layout: "copy-right", text: "Smart Logistics Delivery", subtext: "Manage schedules, track routes, and coordinate packages seamlessly.", slots: { text: "s1-text", subtext: "s1-subtext", screenshot: "slot-2" } }
      ]
    };
    const player = getUniversalPlayerScriptAndStyle(config);
    const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${config.name}</title>
  <style>
    html, body { margin:0; padding:0; width:1920px; height:1080px; overflow:hidden; background:#0d0d11; font-family:'Inter',sans-serif; color:#ffffff; }
    .canvas { position:relative; width:1920px; height:1080px; background:radial-gradient(circle at 60% 30%, #1c1c2b 0%, #07070a 100%); overflow:hidden; }
    .floor-reflection-plane { position:absolute; left:0; bottom:0; width:1920px; height:380px; background:linear-gradient(to bottom, transparent, rgba(13, 13, 17, 0.95)), radial-gradient(ellipse at center bottom, rgba(124, 119, 235, 0.12) 0%, transparent 70%); z-index:1; pointer-events:none; }
    .scene { position:absolute; inset:0; width:1920px; height:1080px; display:none; align-items:center; justify-content:center; z-index:3; padding:0 10%; box-sizing:border-box; }
    .scene.active, .scene.playing { display:flex; }
    .scene-content { display:flex; width:100%; height:100%; align-items:center; justify-content:space-between; position:relative; }
    .copy-col { flex:1; max-width:680px; display:flex; flex-direction:column; justify-content:center; z-index:5; }
    .copy-col.right-side { text-align:right; align-items:flex-end; }
    .title-highlight { font-size:68px; font-weight:800; line-height:1.1; letter-spacing:-1.5px; margin:0 0 24px 0; color:#ffffff; }
    .title-highlight span { color:#8b85f8; text-shadow:0 0 20px rgba(139, 133, 248, 0.35); }
    .subtitle { font-size:24px; font-weight:400; line-height:1.6; color:#a0a0bd; margin:0; }
    .device-col { flex:1.1; display:flex; align-items:center; justify-content:center; height:100%; z-index:4; position:relative; transform-style:preserve-3d; perspective:1500px; }
    .phone-3d-rig { position:absolute; width:340px; height:700px; transform-style:preserve-3d; transition:transform 0.1s ease-out; }
    .phone-face { position:absolute; inset:0; border-radius:46px; box-sizing:border-box; }
    .phone-face.front { background:#000000; transform:translateZ(8px); z-index:10; border:5px solid #1a1a22; overflow:hidden; }
    .phone-face.back { background:#111116; transform:rotateY(180deg) translateZ(8px); border:5px solid #1a1a22; box-shadow:0 20px 45px rgba(0,0,0,0.6); }
    .dynamic-island { position:absolute; top:15px; left:50%; transform:translateX(-50%); width:90px; height:26px; background:#000000; border-radius:13px; z-index:12; border:1px solid #222; }
    .phone-screen { width:100%; height:100%; object-fit:cover; border-radius:41px; }
    .reflection-screen { position:absolute; width:340px; height:700px; border-radius:46px; transform:scaleY(-0.7) translateY(480px) translateZ(-40px) rotateX(15deg); opacity:0.18; filter:blur(4px); pointer-events:none; z-index:1; }
    .phone-side { position:absolute; background:linear-gradient(to bottom, #2c2c38, #181820, #2c2c38); border:1px solid #101015; }
    .side-left { width:16px; height:700px; left:-8px; top:0; transform:rotateY(90deg); }
    .side-right { width:16px; height:700px; right:-8px; top:0; transform:rotateY(-90deg); }
    .side-top { width:340px; height:16px; left:0; top:-8px; transform:rotateX(90deg); }
    .side-bottom { width:340px; height:16px; left:0; bottom:-8px; transform:rotateX(-90deg); }
    .frosted-pill-card { position:absolute; width:260px; height:260px; border-radius:40px; border:1.5px solid rgba(255,255,255,0.4); background:rgba(255,255,255,0.08); backdrop-filter:blur(25px); display:flex; flex-direction:column; align-items:center; justify-content:center; box-shadow:0 20px 50px rgba(0,0,0,0.3); z-index:20; pointer-events:none; transform:translateZ(50px); }
    .frosted-pill-card .pill-label { font-size:18px; font-weight:500; color:#a0a0bd; margin-bottom:8px; }
    .frosted-pill-card .pill-value { font-size:56px; font-weight:800; color:#ffffff; }
    ${player.style}
  </style>
</head>
<body>
  <div class="canvas">
    <div class="floor-reflection-plane"></div>
    <!-- Scene 1 -->
    <div class="scene" id="scene-0">
      <div class="scene-content">
        <div class="copy-col"><h2 class="title-highlight"><span>Transparent</span> In Every Detail</h2><p class="subtitle" id="s0-subtext">As soon as you finish typing a word, it will be checked against the dictionary.</p></div>
        <div class="device-col">
          <div class="phone-3d-rig" id="trio-phone-1" style="transform:translateX(-120px) translateZ(-40px) rotateY(15deg);"><div class="phone-face front"><div class="dynamic-island"></div><img class="phone-screen" id="slot-0" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" alt="Screen 1" /></div><div class="phone-side side-left"></div><div class="phone-side side-right"></div><div class="phone-side side-top"></div><div class="phone-side side-bottom"></div></div>
          <img class="reflection-screen" id="refl-slot-0" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" style="transform:translateX(-120px) scaleY(-0.7) translateY(450px) rotateX(15deg);" />

          <div class="phone-3d-rig" id="trio-phone-2" style="transform:translateX(40px) translateZ(10px) rotateY(-5deg);"><div class="phone-face front"><div class="dynamic-island"></div><img class="phone-screen" id="slot-1" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" alt="Screen 2" /></div><div class="phone-side side-left"></div><div class="phone-side side-right"></div><div class="phone-side side-top"></div><div class="phone-side side-bottom"></div></div>
          <img class="reflection-screen" id="refl-slot-1" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" style="transform:translateX(40px) scaleY(-0.7) translateY(450px) rotateX(15deg);" />

          <div class="frosted-pill-card" id="trio-glass-card" style="top:30%; right:10%;"><div class="pill-label">Total Cost</div><div class="pill-value">$44</div></div>
        </div>
      </div>
    </div>
    <!-- Scene 2 -->
    <div class="scene" id="scene-1">
      <div class="scene-content" style="flex-direction:column; justify-content:center; gap:40px; text-align:center; align-items:center;">
        <div class="copy-col" style="align-items:center; max-width:100%;"><h2 class="title-highlight"><span>Smart</span> Logistics Delivery</h2><p class="subtitle" id="s1-subtext">Manage schedules, track routes, and coordinate packages seamlessly.</p></div>
        <div class="device-col" style="height:480px;"><div class="phone-3d-rig" id="outro-phone" style="transform:rotateX(10deg); position:relative;"><div class="phone-face front"><div class="dynamic-island"></div><img class="phone-screen" id="slot-2" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" alt="Screen 3" /></div><div class="phone-side side-left"></div><div class="phone-side side-right"></div><div class="phone-side side-top"></div><div class="phone-side side-bottom"></div></div></div>
      </div>
    </div>
  </div>
  ${player.html}

  <script type="application/json" id="template-config">
${JSON.stringify(config, null, 2)}
  </script>

  <script>
  window.__customSceneTransform = function(sceneIdx, progress, globalTimeMs) {
    const slot0 = document.getElementById("slot-0");
    const reflSlot0 = document.getElementById("refl-slot-0");
    if (slot0 && reflSlot0) reflSlot0.src = slot0.src;

    const slot1 = document.getElementById("slot-1");
    const reflSlot1 = document.getElementById("refl-slot-1");
    if (slot1 && reflSlot1) reflSlot1.src = slot1.src;

    if (sceneIdx === 0) {
      const phone1 = document.getElementById("trio-phone-1");
      const phone2 = document.getElementById("trio-phone-2");
      const glass = document.getElementById("trio-glass-card");
      if (phone1 && phone2 && glass) {
        phone1.style.transform = "translateX(-120px) translateZ(-40px) rotateY(" + (15 + Math.sin(progress * Math.PI) * 4) + "deg) rotateX(" + (Math.sin(progress * Math.PI) * 3) + "deg)";
        phone2.style.transform = "translateX(40px) translateZ(10px) rotateY(" + (-5 - Math.sin(progress * Math.PI) * 4) + "deg) rotateX(" + (-Math.sin(progress * Math.PI) * 3) + "deg)";
        glass.style.transform = "translateZ(50px) translateY(" + (Math.sin(globalTimeMs * 0.002) * 12) + "px)";
      }
    } else if (sceneIdx === 1) {
      const phone = document.getElementById("outro-phone");
      if (phone) phone.style.transform = "rotateX(" + (10 - progress * 5) + "deg) rotateY(" + (Math.sin(progress * Math.PI) * 6) + "deg)";
    }
  };
  </script>

  ${player.script}
</body>
</html>`;
    const tplDir = path.join(outBaseDir, config.id);
    fs.mkdirSync(tplDir, { recursive: true });
    fs.writeFileSync(path.join(tplDir, 'template.html'), html);
    console.log(`[OK] Recreated reference template: ${config.id}`);
  }
}

main().catch(err => {
  console.error("Error generating templates:", err);
  process.exit(1);
});
