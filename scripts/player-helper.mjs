import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Helper for Universal Player Controls Bar CSS + HTML + JS
export function getUniversalPlayerScriptAndStyle(config) {
  const totalDurationSeconds = config.scenes.reduce((sum, s) => sum + (s.durationSeconds || 5), 0);
  
  const style = `
  /* === Universal Interactive Player Overlay === */
  .v-player-bar {
    position: fixed;
    bottom: 24px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    gap: 16px;
    background: rgba(15, 17, 26, 0.88);
    backdrop-filter: blur(18px);
    -webkit-backdrop-filter: blur(18px);
    border: 1px solid rgba(255, 255, 255, 0.16);
    border-radius: 40px;
    padding: 10px 22px;
    box-shadow: 0 16px 40px rgba(0, 0, 0, 0.65), 0 0 0 1px rgba(255, 255, 255, 0.05);
    z-index: 999999;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    color: #ffffff;
    user-select: none;
    transition: opacity 0.35s ease, transform 0.35s ease;
  }
  .v-player-bar.autohide {
    opacity: 0;
    pointer-events: none;
    transform: translate(-50%, 15px);
  }
  .v-btn {
    background: #3b82f6;
    color: white;
    border: none;
    border-radius: 50%;
    width: 40px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 16px;
    cursor: pointer;
    transition: transform 0.15s ease, background 0.15s ease, box-shadow 0.15s ease;
    box-shadow: 0 4px 14px rgba(59, 130, 246, 0.4);
    outline: none;
  }
  .v-btn:hover {
    transform: scale(1.08);
    background: #2563eb;
    box-shadow: 0 6px 18px rgba(59, 130, 246, 0.6);
  }
  .v-btn-secondary {
    background: rgba(255, 255, 255, 0.1);
    color: #cbd5e1;
    box-shadow: none;
    width: 34px;
    height: 34px;
    font-size: 14px;
  }
  .v-btn-secondary:hover {
    background: rgba(255, 255, 255, 0.2);
    color: #fff;
    box-shadow: none;
  }
  .v-timeline-box {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 260px;
  }
  .v-scrubber {
    flex: 1;
    height: 6px;
    background: rgba(255, 255, 255, 0.2);
    border-radius: 3px;
    position: relative;
    cursor: pointer;
  }
  .v-scrubber:hover {
    height: 8px;
  }
  .v-scrubber-fill {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 0%;
    background: #3b82f6;
    border-radius: 3px;
    pointer-events: none;
  }
  .v-scrubber-thumb {
    position: absolute;
    top: 50%;
    left: 0%;
    transform: translate(-50%, -50%);
    width: 14px;
    height: 14px;
    background: #ffffff;
    border-radius: 50%;
    box-shadow: 0 2px 6px rgba(0,0,0,0.5);
    pointer-events: none;
    transition: transform 0.1s ease;
  }
  .v-scrubber:hover .v-scrubber-thumb {
    transform: translate(-50%, -50%) scale(1.2);
  }
  .v-time-text {
    font-size: 13px;
    font-variant-numeric: tabular-nums;
    color: #94a3b8;
    min-width: 80px;
    text-align: right;
  }
  .v-pills {
    display: flex;
    gap: 6px;
    border-left: 1px solid rgba(255, 255, 255, 0.14);
    padding-left: 12px;
  }
  .v-pill {
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.12);
    color: #94a3b8;
    font-size: 12px;
    font-weight: 500;
    padding: 5px 11px;
    border-radius: 16px;
    cursor: pointer;
    transition: all 0.15s ease;
    outline: none;
  }
  .v-pill:hover {
    background: rgba(255, 255, 255, 0.18);
    color: #ffffff;
  }
  .v-pill.active {
    background: rgba(59, 130, 246, 0.35);
    border-color: #3b82f6;
    color: #ffffff;
    font-weight: 600;
  }
  @media print {
    .v-player-bar { display: none !important; }
  }
  body.rendering .v-player-bar, .v-player-bar.render-hidden {
    display: none !important;
  }
  `;

  const html = `
  <!-- Standalone Floating Video Player Bar -->
  <div class="v-player-bar" id="v-player-bar">
    <button class="v-btn" id="v-play-btn" title="Play / Pause (Space)">&#9654;</button>
    <button class="v-btn v-btn-secondary" id="v-replay-btn" title="Replay">&#8635;</button>
    <div class="v-timeline-box">
      <div class="v-scrubber" id="v-scrubber">
        <div class="v-scrubber-fill" id="v-scrubber-fill"></div>
        <div class="v-scrubber-thumb" id="v-scrubber-thumb"></div>
      </div>
      <div class="v-time-text" id="v-time-text">0:00 / ${Math.floor(totalDurationSeconds / 60)}:${String(Math.round(totalDurationSeconds % 60)).padStart(2, '0')}</div>
    </div>
    <div class="v-pills" id="v-pills">
      ${config.scenes.map((s, idx) => `<button class="v-pill ${idx === 0 ? 'active' : ''}" data-scene="${idx}">${idx + 1}</button>`).join('')}
    </div>
  </div>
  `;

  const script = `
  <!-- Video Player Logic & API Controller -->
  <script>
  (function() {
    const config = JSON.parse(document.getElementById("template-config").textContent);
    const scenes = config.scenes;
    let durations = scenes.map(s => (s.durationSeconds || s.durationMs / 1000 || 5) * 1000);
    let totalDuration = durations.reduce((a, b) => a + b, 0);
    
    let currentSceneIdx = 0;
    let globalTimeMs = 0;
    let playState = "idle"; // idle | playing | paused | ended
    let mode = "sequence"; // sequence | scene
    let playbackInterval = null;
    let lastTickTime = Date.now();
    let hideTimeout = null;

    const playBtn = document.getElementById("v-play-btn");
    const replayBtn = document.getElementById("v-replay-btn");
    const scrubber = document.getElementById("v-scrubber");
    const scrubberFill = document.getElementById("v-scrubber-fill");
    const scrubberThumb = document.getElementById("v-scrubber-thumb");
    const timeText = document.getElementById("v-time-text");
    const playerBar = document.getElementById("v-player-bar");
    const pills = document.querySelectorAll(".v-pill");

    function formatTime(ms) {
      const totalSec = Math.floor(ms / 1000);
      const min = Math.floor(totalSec / 60);
      const sec = totalSec % 60;
      return min + ":" + (sec < 10 ? "0" : "") + sec;
    }

    function updateUiTime() {
      const progress = Math.max(0, Math.min(1, globalTimeMs / totalDuration));
      if (scrubberFill) scrubberFill.style.width = (progress * 100) + "%";
      if (scrubberThumb) scrubberThumb.style.left = (progress * 100) + "%";
      if (timeText) timeText.textContent = formatTime(globalTimeMs) + " / " + formatTime(totalDuration);
      
      pills.forEach((p, idx) => {
        p.classList.toggle("active", idx === currentSceneIdx);
      });

      if (playBtn) {
        playBtn.innerHTML = playState === "playing" ? "&#10074;&#10074;" : playState === "ended" ? "&#8635;" : "&#9654;";
      }
    }

    function notify() {
      if (window.__videoPreview && typeof window.__videoPreview.onState === 'function') {
        try {
          window.__videoPreview.onState({ scene: currentSceneIdx, state: playState, mode });
        } catch(e) {}
      }
    }

    function applyCssAnimationSeek(sceneIdx, sceneRelMs) {
      document.getAnimations().forEach(a => {
        try {
          if (playState === "playing") {
            a.play();
          } else {
            a.pause();
            a.currentTime = sceneRelMs;
          }
        } catch(e) {}
      });
      document.querySelectorAll("video").forEach(v => {
        try {
          if (playState === "playing") v.play();
          else { v.pause(); v.currentTime = sceneRelMs / 1000; }
        } catch(e) {}
      });
    }

    function apply3DRigCustomTransforms(sceneIdx, sceneRelMs, sceneDurationMs) {
      const progress = Math.max(0, Math.min(1, sceneRelMs / sceneDurationMs));
      
      // Dynamic hook for template-specific 3D rigs if defined
      if (typeof window.__customSceneTransform === 'function') {
        window.__customSceneTransform(sceneIdx, progress, globalTimeMs);
      } else {
        const rig = document.getElementById("phone-rig-" + sceneIdx);
        if (rig) {
          const yRot = -20 + (progress * 18);
          const xRot = 8 * Math.sin(progress * Math.PI);
          rig.style.transform = "rotateY(" + yRot + "deg) rotateX(" + xRot + "deg)";
        }
      }
    }

    function renderFrameAt(timeMs) {
      globalTimeMs = Math.max(0, Math.min(totalDuration, timeMs));
      
      let accum = 0;
      let targetIdx = 0;
      let sceneRelMs = 0;
      for (let i = 0; i < durations.length; i++) {
        if (globalTimeMs < accum + durations[i] || i === durations.length - 1) {
          targetIdx = i;
          sceneRelMs = globalTimeMs - accum;
          break;
        }
        accum += durations[i];
      }

      if (targetIdx !== currentSceneIdx || !document.querySelector(".scene.playing, .scene.active")) {
        const changed = targetIdx !== currentSceneIdx;
        currentSceneIdx = targetIdx;
        document.querySelectorAll(".scene").forEach((el, idx) => {
          if (idx === currentSceneIdx) {
            el.classList.add("playing");
            el.classList.add("active");
          } else {
            el.classList.remove("playing");
            el.classList.remove("active");
          }
        });
        void document.body.offsetWidth; // Force CSS animation restart
        if (changed) notify();
      }

      const curSceneDur = durations[currentSceneIdx] || 5000;
      applyCssAnimationSeek(currentSceneIdx, sceneRelMs);
      apply3DRigCustomTransforms(currentSceneIdx, sceneRelMs, curSceneDur);
      updateUiTime();
    }

    function startLoop() {
      if (playbackInterval) clearInterval(playbackInterval);
      lastTickTime = Date.now();
      playbackInterval = setInterval(() => {
        const now = Date.now();
        const delta = now - lastTickTime;
        lastTickTime = now;

        globalTimeMs += delta;
        if (globalTimeMs >= totalDuration) {
          globalTimeMs = totalDuration;
          renderFrameAt(globalTimeMs);
          window.pause();
          playState = "ended";
          notify();
          return;
        }

        renderFrameAt(globalTimeMs);
      }, 1000 / 60);
    }

    function resetAutoHide() {
      if (!playerBar) return;
      playerBar.classList.remove("autohide");
      if (hideTimeout) clearTimeout(hideTimeout);
      if (playState === "playing") {
        hideTimeout = setTimeout(() => {
          playerBar.classList.add("autohide");
        }, 3000);
      }
    }

    window.seek = function(timeMs) {
      renderFrameAt(timeMs);
    };

    window.play = function() {
      if (playState === "ended" || globalTimeMs >= totalDuration) {
        globalTimeMs = 0;
      }
      playState = "playing";
      mode = "sequence";
      startLoop();
      renderFrameAt(globalTimeMs);
      notify();
      resetAutoHide();
    };

    window.pause = function() {
      playState = "paused";
      if (playbackInterval) {
        clearInterval(playbackInterval);
        playbackInterval = null;
      }
      renderFrameAt(globalTimeMs);
      notify();
      resetAutoHide();
    };

    window.replay = function() {
      globalTimeMs = 0;
      window.play();
    };

    window.goto = function(index) {
      index = Math.max(0, Math.min(index, durations.length - 1));
      let targetMs = 0;
      for (let i = 0; i < index; i++) targetMs += durations[i];
      window.pause();
      currentSceneIdx = index;
      renderFrameAt(targetMs + 100);
      playState = "idle";
      notify();
    };

    window.playScene = function(index) {
      index = Math.max(0, Math.min(index, durations.length - 1));
      let targetMs = 0;
      for (let i = 0; i < index; i++) targetMs += durations[i];
      globalTimeMs = targetMs;
      mode = "scene";
      playState = "playing";
      startLoop();
      renderFrameAt(globalTimeMs);
      notify();
      resetAutoHide();
    };

    window.__videoPreview = {
      sceneCount: durations.length,
      onState: null,
      play: window.play,
      pause: window.pause,
      replay: window.replay,
      goto: window.goto,
      playScene: window.playScene,
      next: () => window.goto(currentSceneIdx + 1),
      prev: () => window.goto(currentSceneIdx - 1),
      isPaused: () => playState === "paused" || playState === "idle",
      currentScene: () => currentSceneIdx,
      currentState: () => playState,
    };

    // DOM Event Listeners
    if (playBtn) {
      playBtn.onclick = (e) => {
        e.stopPropagation();
        if (playState === "playing") window.pause();
        else window.play();
      };
    }
    if (replayBtn) {
      replayBtn.onclick = (e) => {
        e.stopPropagation();
        window.replay();
      };
    }
    if (scrubber) {
      const handleScrub = (e) => {
        const rect = scrubber.getBoundingClientRect();
        const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        renderFrameAt(pct * totalDuration);
      };
      scrubber.onmousedown = (e) => {
        e.stopPropagation();
        handleScrub(e);
        const onMove = (ev) => handleScrub(ev);
        const onUp = () => {
          window.removeEventListener("mousemove", onMove);
          window.removeEventListener("mouseup", onUp);
        };
        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp);
      };
    }

    pills.forEach((p, idx) => {
      p.onclick = (e) => {
        e.stopPropagation();
        window.goto(idx);
      };
    });

    document.addEventListener("keydown", (e) => {
      if (e.code === "Space" && e.target.tagName !== "INPUT" && e.target.tagName !== "TEXTAREA") {
        e.preventDefault();
        if (playState === "playing") window.pause();
        else window.play();
      }
    });

    document.body.onclick = (e) => {
      if (e.target.closest(".v-player-bar")) return;
      if (playState === "playing") window.pause();
      else window.play();
    };

    document.addEventListener("mousemove", resetAutoHide);

    // Initial load: render frame 0 settled
    renderFrameAt(0);

    // Autoplay when opened directly as a standalone web page
    if (window.self === window.top && !window.location.search.includes("paused")) {
      setTimeout(() => {
        window.play();
      }, 250);
    }
  })();
  </script>
  `;

  return { style, html, script };
}
