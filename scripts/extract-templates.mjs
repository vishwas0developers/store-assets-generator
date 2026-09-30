import fs from 'fs';
import path from 'path';
import { VIDEO_TEMPLATES } from '../dist/src/video/templates.js';

const outDir = path.join(process.cwd(), 'templates', 'video');
fs.mkdirSync(outDir, { recursive: true });

for (const t of VIDEO_TEMPLATES) {
  const tplDir = path.join(outDir, t.id);

  const htmlContent = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${t.name}</title>
  <style>
    /* Reset & Base Canvas */
    html, body {
      margin: 0;
      padding: 0;
      width: 1920px;
      height: 1080px;
      overflow: hidden;
      background: #0f1115;
      font-family: 'Inter', sans-serif;
      color: #ffffff;
    }

    .canvas {
      position: relative;
      width: 1920px;
      height: 1080px;
      overflow: hidden;
      background: radial-gradient(circle at center, #1b202c 0%, #0c0e12 100%);
    }

    /* Scene layouts */
    .scene {
      position: absolute;
      inset: 0;
      width: 1920px;
      height: 1080px;
      display: none;
      align-items: center;
      justify-content: center;
      box-sizing: border-box;
      padding: 0 10%;
    }
    .scene.active {
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

    /* Copy Styles */
    .copy-col {
      flex: 1;
      max-width: 800px;
      display: flex;
      flex-direction: column;
      justify-content: center;
    }
    .title {
      font-size: 60px;
      font-weight: 800;
      margin: 0 0 20px 0;
      text-transform: uppercase;
    }
    .subtitle {
      font-size: 24px;
      color: #b0b5c0;
      line-height: 1.5;
      margin: 0;
    }

    /* Device column & 3D Rig */
    .device-col {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .phone-3d-container {
      perspective: 1500px;
      width: 600px;
      height: 900px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .phone-3d-scaler {
      transform-style: preserve-3d;
      transform: scale(${t.deviceFraction || 0.6});
    }
    .phone-3d-rig {
      position: relative;
      width: 360px;
      height: 740px;
      transform-style: preserve-3d;
      transition: transform 0.1s ease-out;
    }

    .phone-face {
      position: absolute;
      inset: 0;
      border-radius: 44px;
      box-sizing: border-box;
    }
    .phone-face.front {
      background: #000000;
      transform: translateZ(8px);
      z-index: 10;
      border: 5px solid #1a1a1a;
      overflow: hidden;
    }
    .phone-face.back {
      background: #252830;
      transform: rotateY(180deg) translateZ(8px);
      border: 5px solid #1f2228;
    }

    .phone-screen {
      width: 100%;
      height: 100%;
      object-fit: cover;
      border-radius: 39px;
    }

    /* 3D Side panels */
    .phone-side {
      position: absolute;
      background: linear-gradient(to bottom, #2d3139, #1c1e24, #2d3139);
      border: 1px solid #111216;
    }
    .side-left { width: 16px; height: 740px; left: -8px; top: 0; transform: rotateY(90deg); }
    .side-right { width: 16px; height: 740px; right: -8px; top: 0; transform: rotateY(-90deg); }
    .side-top { width: 360px; height: 16px; left: 0; top: -8px; transform: rotateX(90deg); }
    .side-bottom { width: 360px; height: 16px; left: 0; bottom: -8px; transform: rotateX(-90deg); }
  </style>
</head>
<body>
  <div class="canvas">
    ${t.scenes.map((s, idx) => `
    <div class="scene" id="scene-${idx}">
      <div class="scene-content">
        <div class="copy-col">
          <h2 class="title" id="s${idx}-text">${s.text || ''}</h2>
          <p class="subtitle" id="s${idx}-subtext">${s.subtext || ''}</p>
        </div>
        <div class="device-col">
          <div class="phone-3d-container">
            <div class="phone-3d-scaler">
              <div class="phone-3d-rig" id="phone-rig-${idx}">
                <div class="phone-face front">
                  <img class="phone-screen" id="slot-${idx}" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" alt="Screen ${idx + 1}" />
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
    </div>`).join('\n')}
  </div>

  <!-- Manifest Configuration script -->
  <script type="application/json" id="template-config">
  ${JSON.stringify(t, null, 2)}
  </script>

  <!-- Player Timeline Script -->
  <script>
    const config = JSON.parse(document.getElementById("template-config").textContent);
    const scenes = config.scenes;
    let globalTimeMs = 0;
    let playbackInterval = null;
    let isPlaying = false;

    // Calculate scene timings
    let totalDuration = 0;
    scenes.forEach(s => {
      s.durationMs = (s.durationSeconds || 5) * 1000;
      s.startMs = totalDuration;
      totalDuration += s.durationMs;
    });

    function showSceneAtTime(timeMs) {
      let activeIdx = 0;
      for (let i = 0; i < scenes.length; i++) {
        if (timeMs >= scenes[i].startMs && timeMs < scenes[i].startMs + scenes[i].durationMs) {
          activeIdx = i;
          break;
        }
      }
      if (timeMs >= totalDuration) {
        activeIdx = scenes.length - 1;
      }

      document.querySelectorAll(".scene").forEach((s, idx) => {
        if (idx === activeIdx) s.classList.add("active");
        else s.classList.remove("active");
      });

      const scene = scenes[activeIdx];
      const relTime = Math.min(scene.durationMs, Math.max(0, timeMs - scene.startMs));
      const progress = relTime / scene.durationMs;

      // Dynamic 3D Rig Rotation
      const rig = document.getElementById("phone-rig-" + activeIdx);
      if (rig) {
        const yRot = -20 + (progress * 15);
        const xRot = 10 * Math.sin(progress * Math.PI);
        rig.style.transform = \`rotateY(\${yRot}deg) rotateX(\${xRot}deg)\`;
      }
    }

    window.seek = function(timeMs) {
      globalTimeMs = Math.max(0, Math.min(totalDuration, timeMs));
      showSceneAtTime(globalTimeMs);
    };

    window.play = function() {
      if (isPlaying) return;
      isPlaying = true;
      const startRealTime = Date.now() - globalTimeMs;
      playbackInterval = setInterval(() => {
        globalTimeMs = Date.now() - startRealTime;
        if (globalTimeMs >= totalDuration) {
          globalTimeMs = totalDuration;
          window.pause();
        }
        showSceneAtTime(globalTimeMs);
      }, 1000 / 30);
    };

    window.pause = function() {
      isPlaying = false;
      if (playbackInterval) {
        clearInterval(playbackInterval);
        playbackInterval = null;
      }
    };

    window.seek(0);
  </script>
</body>
</html>`;

  fs.writeFileSync(path.join(path.dirname(tplDir), path.basename(tplDir) + '.html'), htmlContent);
  console.log(`Extracted standalone template HTML for: ${t.id}`);
}
