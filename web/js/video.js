// Video Studio module — template & scene management, timeline, 3D device preview, and player bridge.
import {
  activeProjectId,
  videoId,
  videoProject,
  selectedSceneId,
  videoTemplates,
  setVideoId,
  setVideoProject,
  setSelectedSceneId,
  setVideoTemplates
} from './state.js';
import { api, uploadFile, showAlert, showConfirm, showToast } from './utils.js';
import { populateSourceSelect } from './editor.js';
import { loadDeviceCategories, deviceCategoryLabel } from './deviceCategories.js';

loadDeviceCategories();

let videoTemplateDetailId = null;
let videoDetailSceneIndex = 0;
let videoDetailState = "idle";
let videoDetailMode = "sequence";
let videoDetailAudio = null;
let videoDetailResizeObserver = null;
let hostPlaybackTick = null;
let videoDevices = [];
let videoSceneOptions = { animations: [], backgrounds: [], layouts: {} };

let scTransport = {
  playing: false,
  elapsedMs: 0,
  durationMs: 5000,
  timer: null,
  loop: false,
  muted: false,
  speed: 1.0
};

let currentSceneFlowSteps = [];
let contentPanelSceneId = null;
let contentSaveTimer = null;
let legacyFieldSaveTimer = null;
let segmentsSaveTimer = null;
let savedConfigsCache = [];

const $ = (id) => document.getElementById(id);

export async function loadVideoProjectInto(id) {
  setVideoId(id);
  if (id) {
    try {
      const proj = await api(`/api/videos/${id}`);
      setVideoProject(proj);
      const label = $("video-project-label");
      if (label) label.textContent = proj.name;
    } catch (e) {
      console.error("Failed to load video project:", e);
      setVideoProject(null);
      const label = $("video-project-label");
      if (label) label.textContent = "No video project loaded";
    }
  } else {
    setVideoProject(null);
    const label = $("video-project-label");
    if (label) label.textContent = "No video project selected";
  }

  try {
    if (!Array.isArray(videoDevices) || videoDevices.length === 0) {
      const res = await api("/api/devices");
      videoDevices = Array.isArray(res) ? res : (Array.isArray(res?.devices) ? res.devices : []);
    }
    if (videoSceneOptions.animations.length === 0) {
      videoSceneOptions = await api("/api/videos/scene-options");
    }
  } catch (e) {
    console.error("Failed to load video reference data:", e);
  }

  await renderVideoTemplateGrid();
  if (videoProject && videoProject.template && videoProject.scenes?.length) {
    renderVideoScenes();
  }
}

export async function ensureVideoTemplates() {
  if (videoTemplates.length === 0) {
    const { templates } = await api("/api/videos/templates");
    setVideoTemplates(templates);
  }
  return videoTemplates;
}

export async function renderVideoTemplateGrid() {
  const list = $("video-template-list");
  const stage = $("video-template-stage");
  if (list) list.innerHTML = "";
  if (stage) stage.innerHTML = "";
  const templates = await ensureVideoTemplates();
  const keepId = videoTemplateDetailId && templates.some((t) => t.id === videoTemplateDetailId) ? videoTemplateDetailId : templates[0]?.id;
  if (keepId) openVideoTemplateDetail(keepId);
}

function totalDuration(t) {
  return t.scenes.reduce((sum, s) => sum + (s.durationSeconds || 5), 0);
}

function isLandscapeTemplate(t) { return t.aspectRatio === "16:9"; }
function canvasSizeFor(t) { return isLandscapeTemplate(t) ? "1920 × 1080 (16:9)" : "1080 × 1920 (9:16)"; }
function orientationFor(t) { return isLandscapeTemplate(t) ? "Landscape" : "Portrait"; }

function renderVideoTemplateList(templates, activeId) {
  const list = $("video-template-list");
  if (!list) return;
  list.innerHTML = templates
    .map(
      (t) => `
    <div class="video-list-card ${t.id === activeId ? "active" : ""}" data-id="${t.id}">
      <div class="video-list-thumb">
        <img src="/api/videos/template-thumb/${encodeURIComponent(t.id)}.png" alt="${t.name}" loading="lazy" onload="this.classList.add('loaded')" />
      </div>
      <div class="video-list-info">
        <h4>${t.name}</h4>
        <div class="hint video-list-subtitle">${t.description}</div>
        <div class="video-list-tags">
          <span class="pill">${orientationFor(t)}</span>
          <span class="pill">${canvasSizeFor(t)}</span>
        </div>
        <div class="hint" style="margin:.3rem 0 0;">${t.scenes.length} scenes &middot; ${Math.round(totalDuration(t))}s</div>
      </div>
    </div>`
    )
    .join("");
  list.querySelectorAll(".video-list-card").forEach((card) => {
    card.onclick = () => openVideoTemplateDetail(card.dataset.id);
  });
}

function videoDetailPreviewQuery() {
  const q = new URLSearchParams({ t: Date.now() });
  if (videoId) q.set("projectId", videoId);
  return q;
}

/** The preview iframe's in-page player API (see templatePreviewHtml). */
function videoPlayerApi() {
  const frame = $("video-detail-preview");
  try {
    return frame && frame.contentWindow ? frame.contentWindow.__videoPreview : null;
  } catch (e) {
    return null;
  }
}

/** Background music for the currently-open template's preview -- a single
 *  <audio> element kept in lockstep with the iframe player's pushed state. */
function ensureVideoDetailAudio() {
  if (!videoDetailAudio) {
    videoDetailAudio = new Audio();
    videoDetailAudio.loop = false;
    videoDetailAudio.volume = 0.35;
  }
  return videoDetailAudio;
}

function videoDetailRefreshUi(t) {
  const label = $("video-detail-scene-label");
  if (!label) return;
  const scene = t.scenes[videoDetailSceneIndex];
  const playing = videoDetailState === "playing";
  const ended = videoDetailState === "ended";

  label.textContent =
    videoDetailMode === "sequence" && playing
      ? `Playing — scene ${videoDetailSceneIndex + 1} of ${t.scenes.length}`
      : ended
        ? `Finished — scene ${videoDetailSceneIndex + 1} of ${t.scenes.length}`
        : `Scene ${videoDetailSceneIndex + 1} of ${t.scenes.length} — ${scene ? scene.label : ""}`;

  const playBtn = $("video-detail-play");
  if (playBtn) {
    playBtn.innerHTML = ended ? "&#8635; Replay" : playing ? "&#10074;&#10074; Pause" : "&#9654; Play";
  }
  const prevBtn = $("video-detail-prev");
  if (prevBtn) prevBtn.disabled = videoDetailSceneIndex <= 0;
  const nextBtn = $("video-detail-next");
  if (nextBtn) nextBtn.disabled = videoDetailSceneIndex >= t.scenes.length - 1;

  const hostPlayBtn = $("host-play-btn");
  if (hostPlayBtn) {
    hostPlayBtn.innerHTML = ended ? "&#8635;" : playing ? "&#10074;&#10074;" : "&#9654;";
  }

  const stage = $("video-template-stage");
  if (stage) {
    stage.querySelectorAll("[data-host-scene]").forEach((el, i) => {
      el.classList.toggle("active", i === videoDetailSceneIndex);
    });
    const dots = $("video-detail-dots");
    if (dots) {
      dots.querySelectorAll(".video-scene-dot").forEach((d, i) => {
        d.classList.toggle("active", i === videoDetailSceneIndex);
      });
    }
    const activeCard = stage.querySelector(`[data-scene-jump="${videoDetailSceneIndex}"]`);
    stage.querySelectorAll("[data-scene-jump]").forEach((el) => {
      el.classList.toggle("active", Number(el.dataset.sceneJump) === videoDetailSceneIndex);
    });
    if (activeCard) activeCard.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }
}

/** Selects one scene and holds it, unplayed. */
function videoDetailShowScene(id, index) {
  const t = videoTemplates.find((x) => x.id === id);
  if (!t) return;
  const apiInstance = videoPlayerApi();
  videoDetailSceneIndex = Math.max(0, Math.min(index, t.scenes.length - 1));
  if (apiInstance) apiInstance.goto(videoDetailSceneIndex);
  else {
    videoDetailMode = "scene";
    videoDetailState = "idle";
    videoDetailRefreshUi(t);
  }
}

/** Plays exactly one scene, once. */
function videoDetailPlayScene(id, index) {
  const apiInstance = videoPlayerApi();
  if (!apiInstance) return;
  videoDetailSceneIndex = Math.max(0, index);
  apiInstance.playScene(index);
}

function videoDetailTogglePlay(id) {
  const apiInstance = videoPlayerApi();
  if (!apiInstance) return;
  if (videoDetailState === "playing") {
    apiInstance.pause();
  } else {
    if (videoDetailState === "ended" && videoDetailMode === "scene") apiInstance.playScene(videoDetailSceneIndex);
    else if (videoDetailState === "ended") apiInstance.replay();
    else apiInstance.play();
  }
}

function startHostPlaybackTick(id) {
  if (hostPlaybackTick) clearInterval(hostPlaybackTick);
  hostPlaybackTick = setInterval(() => {
    const apiInstance = videoPlayerApi();
    if (!apiInstance) return;

    const currentMs = apiInstance.globalTimeMs || 0;
    const totalMs = apiInstance.totalDuration || 1;

    const progress = Math.max(0, Math.min(1, currentMs / totalMs));
    const fill = $("host-scrubber-fill");
    const thumb = $("host-scrubber-thumb");
    const txt = $("host-time-text");

    if (fill) fill.style.width = (progress * 100) + "%";
    if (thumb) thumb.style.left = (progress * 100) + "%";

    if (txt) {
      const format = (ms) => {
        const sec = Math.floor(ms / 1000);
        const m = Math.floor(sec / 60);
        const s = sec % 60;
        return m + ":" + (s < 10 ? "0" : "") + s;
      };
      txt.textContent = format(currentMs) + " / " + format(totalMs);
    }

    if (videoDetailState !== "playing") {
      clearInterval(hostPlaybackTick);
      hostPlaybackTick = null;
    }
  }, 1000 / 30);
}

function videoDetailOnPlayerState(id, evt) {
  const t = videoTemplates.find((x) => x.id === id);
  if (!t) return;
  videoDetailSceneIndex = evt.scene;
  videoDetailMode = evt.mode;
  videoDetailState = evt.state;

  const audio = ensureVideoDetailAudio();
  if (evt.state === "playing") {
    audio.play().catch(() => {});
    startHostPlaybackTick(id);
  } else {
    audio.pause();
    if (evt.state === "ended" || evt.state === "idle") audio.currentTime = 0;
  }

  videoDetailRefreshUi(t);
}

export function openVideoTemplateDetail(id) {
  const t = videoTemplates.find((x) => x.id === id);
  if (!t) return;
  if (videoDetailResizeObserver) { videoDetailResizeObserver.disconnect(); videoDetailResizeObserver = null; }
  videoTemplateDetailId = id;
  videoDetailSceneIndex = 0;
  videoDetailMode = "sequence";
  videoDetailState = "idle";

  renderVideoTemplateList(videoTemplates, id);

  const stage = $("video-template-stage");
  if (!stage) return;
  stage.innerHTML = `
    <div class="detail-topbar">
      <div>
        <h3 style="margin:0;">${t.name}</h3>
        <p class="hint" style="margin:.2rem 0 0;">${t.description}</p>
      </div>
      <button type="button" id="video-detail-load-btn">Load Template</button>
    </div>
    <div class="template-detail template-detail-video">
      <div class="video-detail-main">
        <div class="video-player">
          <div class="video-preview-scale ${t.aspectRatio === "16:9" ? "landscape" : "portrait"}"><iframe id="video-detail-preview"></iframe></div>
        </div>
        <!-- Externalized Player Bar -->
        <div class="v-player-bar" id="host-player-bar">
          <button class="v-btn" id="host-play-btn" title="Play / Pause (Space)">&#9654;</button>
          <button class="v-btn v-btn-secondary" id="host-mute-btn" title="Mute / Unmute Audio">&#128266;</button>
          <div class="v-timeline-box">
            <div class="v-scrubber" id="host-scrubber">
              <div class="v-scrubber-fill" id="host-scrubber-fill"></div>
              <div class="v-scrubber-thumb" id="host-scrubber-thumb"></div>
            </div>
            <div class="v-time-text" id="host-time-text">0:00 / 0:00</div>
          </div>
          <div class="v-pills" id="host-pills">
            ${t.scenes.map((s, idx) => `<button class="v-pill ${idx === 0 ? 'active' : ''}" data-host-scene="${idx}">${idx + 1}</button>`).join('')}
          </div>
        </div>
      </div>
      <div class="template-detail-side">
        <div class="video-list-column-label" style="margin-bottom: 0.5rem;">Video Scenes</div>
        <div class="video-screen-list">
          ${t.scenes
            .map(
              (s, i) => `
            <div class="video-screen-card" data-scene-jump="${i}">
              <div class="video-screen-num">Scene ${i + 1}</div>
              <button type="button" class="video-screen-play" data-scene-play="${i}" title="Play only this scene">&#9654;</button>
              <div class="video-screen-name">${s.label}</div>
              <div class="hint">${s.durationSeconds}s &middot; ${(s.sceneTemplate || s.layout || "scene").replace(/-/g, " ")} &middot; ${s.background || "dark-studio"}</div>
            </div>`
            )
            .join("")}
        </div>
        <div class="video-scene-controls">
          <button type="button" class="secondary small" id="video-detail-prev" aria-label="Previous scene">&laquo; Prev</button>
          <button type="button" id="video-detail-play" aria-label="Play or pause the full sequence">&#9654; Play</button>
          <button type="button" class="secondary small" id="video-detail-next" aria-label="Next scene">Next &raquo;</button>
          <span class="scene-indicator" id="video-detail-scene-label"></span>
          <div class="video-scene-dots" id="video-detail-dots">
            ${t.scenes.map((s, i) => `<div class="video-scene-dot" title="${s.label}" data-scene-jump="${i}"></div>`).join("")}
          </div>
        </div>
      </div>
    </div>
  `;

  $("video-detail-load-btn").onclick = () => loadVideoTemplateNow(id);
  $("video-detail-prev").onclick = () => videoDetailShowScene(id, videoDetailSceneIndex - 1);
  $("video-detail-next").onclick = () => videoDetailShowScene(id, videoDetailSceneIndex + 1);
  $("video-detail-play").onclick = () => videoDetailTogglePlay(id);

  stage.querySelectorAll("[data-host-scene]").forEach((el) => {
    el.onclick = () => videoDetailShowScene(id, Number(el.dataset.hostScene));
  });
  const hostPlayBtn = $("host-play-btn");
  if (hostPlayBtn) hostPlayBtn.onclick = () => videoDetailTogglePlay(id);
  const hostMuteBtn = $("host-mute-btn");
  if (hostMuteBtn) {
    const audio = ensureVideoDetailAudio();
    hostMuteBtn.innerHTML = audio.muted ? "&#128263;" : "&#128266;";
    hostMuteBtn.onclick = () => {
      audio.muted = !audio.muted;
      hostMuteBtn.innerHTML = audio.muted ? "&#128263;" : "&#128266;";
      hostMuteBtn.title = audio.muted ? "Unmute Audio" : "Mute Audio";
    };
  }
  const hostScrubber = $("host-scrubber");
  if (hostScrubber) {
    let isDragging = false;
    let resumeAfterDrag = false;
    const handleHostScrub = (e) => {
      const apiInstance = videoPlayerApi();
      if (!apiInstance) return;
      const rect = hostScrubber.getBoundingClientRect();
      const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const totalDur = apiInstance.totalDuration || (t.scenes.reduce((sum, s) => sum + (s.durationSeconds || 5), 0) * 1000);
      apiInstance.seek(pos * totalDur);
    };
    hostScrubber.onmousedown = (e) => {
      e.stopPropagation();
      const apiInstance = videoPlayerApi();
      isDragging = true;
      resumeAfterDrag = (videoDetailState === "playing");
      if (resumeAfterDrag && apiInstance) {
        apiInstance.pause();
      }
      handleHostScrub(e);
      const onMove = (ev) => {
        if (isDragging) handleHostScrub(ev);
      };
      const onUp = () => {
        if (isDragging) {
          isDragging = false;
          window.removeEventListener("mousemove", onMove);
          window.removeEventListener("mouseup", onUp);
          if (resumeAfterDrag && apiInstance) {
            apiInstance.play();
          }
        }
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    };
  }
  stage.querySelectorAll("[data-scene-jump]").forEach((el) => {
    el.onclick = () => videoDetailShowScene(id, Number(el.dataset.sceneJump));
  });
  stage.querySelectorAll("[data-scene-play]").forEach((el) => {
    el.onclick = (ev) => { ev.stopPropagation(); videoDetailPlayScene(id, Number(el.dataset.scenePlay)); };
  });
  document.removeEventListener("keydown", videoDetailKeyHandler);
  document.addEventListener("keydown", videoDetailKeyHandler);

  const audio = ensureVideoDetailAudio();
  audio.pause();
  audio.src = `/api/videos/templates/${encodeURIComponent(id)}/bgm.wav`;
  audio.currentTime = 0;

  const isLandscape = t.aspectRatio === "16:9";
  const nativeWidth = isLandscape ? 1920 : 1080;
  const nativeHeight = isLandscape ? 1080 : 1920;
  const mainCol = stage.querySelector(".video-detail-main");
  const availableWidth = Math.max(320, (mainCol ? mainCol.clientWidth : 400) - 16);
  const boxWidth = isLandscape ? Math.min(720, availableWidth) : 280;
  const box = stage.querySelector(".video-preview-scale");
  if (box) {
    box.style.width = `${boxWidth}px`;
    box.style.maxWidth = `${boxWidth}px`;
    box.style.aspectRatio = isLandscape ? "16 / 9" : "9 / 16";
  }
  const frame = $("video-detail-preview");
  if (frame) {
    frame.style.width = `${nativeWidth}px`;
    frame.style.height = `${nativeHeight}px`;
    const scale = boxWidth / nativeWidth;
    frame.style.transform = `scale(${scale})`;
    frame.onload = () => {
      const apiInstance = videoPlayerApi();
      if (apiInstance) apiInstance.onState = (evt) => videoDetailOnPlayerState(id, evt);
      videoDetailSceneIndex = 0;
      videoDetailMode = "sequence";
      videoDetailState = "idle";
      videoDetailRefreshUi(t);
    };
    frame.src = `/api/videos/templates/${encodeURIComponent(id)}/preview?${videoDetailPreviewQuery().toString()}`;
  }

  const side = stage.querySelector(".template-detail-side");
  if (side && mainCol) {
    videoDetailResizeObserver = new ResizeObserver(() => {
      side.style.height = `${mainCol.getBoundingClientRect().height}px`;
    });
    videoDetailResizeObserver.observe(mainCol);
  }
}

function videoDetailKeyHandler(ev) {
  if (!videoTemplateDetailId) return;
  const sec = $("video-section-templates");
  if (!sec || !sec.classList.contains("active")) return;
  if (ev.target && ["INPUT", "TEXTAREA", "SELECT"].includes(ev.target.tagName)) return;
  if (ev.code === "Space") { ev.preventDefault(); videoDetailTogglePlay(videoTemplateDetailId); }
  if (ev.code === "ArrowRight") videoDetailShowScene(videoTemplateDetailId, videoDetailSceneIndex + 1);
  if (ev.code === "ArrowLeft") videoDetailShowScene(videoTemplateDetailId, videoDetailSceneIndex - 1);
}

export function closeVideoTemplateDetail() {
  if (videoDetailAudio) {
    videoDetailAudio.pause();
    videoDetailAudio.currentTime = 0;
  }
  stopHostPlaybackTick();
  videoTemplateDetailId = null;
  const stage = $("video-template-stage");
  if (stage) stage.innerHTML = '<div class="template-stage-empty"><div class="template-stage-empty-icon">&#127916;</div><p>Select a video template from the list to preview</p></div>';
}

export async function loadVideoTemplateNow(id) {
  if (!videoId) {
    await showAlert("Start a video project first.");
    return;
  }
  const t = videoTemplates.find((x) => x.id === id);
  if (videoProject && videoProject.scenes?.length > 0) {
    const ok = await showConfirm("You have an existing scene sequence. Are you sure you want to load a new template?");
    if (!ok) return;
  }
  const updatedProj = await api(`/api/videos/${videoId}/apply-template`, { method: "POST", body: { templateId: id } });
  setVideoProject(updatedProj);
  renderVideoScenes();
  showToast(`Applied "${t ? t.name : id}" — ${updatedProj.scenes.length} scene(s) ready. Switch to Scenes to customize.`, "success");
}

export function renderVideoScenes() {
  if (!videoProject || !videoProject.scenes) return;

  const scTemplate = $("sc-template");
  if (scTemplate && videoSceneOptions.animations) {
    scTemplate.innerHTML = videoSceneOptions.animations.map((a) => `<option value="${a.id}">${a.name}</option>`).join("");
  }
  const scBackground = $("sc-background");
  if (scBackground && videoSceneOptions.backgrounds) {
    scBackground.innerHTML = videoSceneOptions.backgrounds.map((b) => `<option value="${b}">${b}</option>`).join("");
  }
  const scDevice = $("sc-device");
  if (scDevice && videoDevices) {
    scDevice.innerHTML = videoDevices.map((d) => `<option value="${d.id}">${d.vendor} — ${d.name}</option>`).join("");
  }

  const orientation = (videoProject.scenes[0] && videoProject.scenes[0].aspectRatio) === "16:9" ? "16:9" : "9:16";
  const layouts = (videoSceneOptions.layouts && videoSceneOptions.layouts[orientation]) || [];
  const scLayout = $("sc-layout");
  if (scLayout) {
    scLayout.innerHTML = layouts.map((l) => `<option value="${l.id}">${l.name}</option>`).join("");
  }

  // Grouped and labeled by device size (Phone / 7-inch Tablet / 10-inch
  // Tablet), matching Screen Capture / Screenshot Source Mapping -- never by
  // resolution/pixel dimensions.
  const scSource = $("sc-source");
  if (scSource) populateSourceSelect(scSource, videoProject.sources || [], null, { blankLabel: "(None)" });

  const templateLabel = $("video-selected-template-label");
  if (templateLabel) {
    const t = videoTemplates.find((x) => x.id === videoProject.template);
    templateLabel.textContent = videoProject.template ? `Template: ${t ? t.name : videoProject.template}` : "";
  }

  const nav = $("video-scene-nav");
  if (nav) {
    nav.innerHTML = "";
    videoProject.scenes.forEach((s, i) => {
      const chip = document.createElement("div");
      chip.className = "scene-chip" + (i === 0 ? " active" : "");
      chip.dataset.sceneId = s.id;
      chip.onclick = () => selectScene(s.id);
      const dot = document.createElement("span");
      dot.className = "scene-chip-dot";
      dot.id = `scene-dot-${s.id}`;
      chip.appendChild(dot);
      chip.appendChild(document.createTextNode(`Scene ${i + 1}`));
      nav.appendChild(chip);
    });
  }

  if (videoProject.scenes.length) {
    const targetId = selectedSceneId && videoProject.scenes.some(s => s.id === selectedSceneId) ? selectedSceneId : videoProject.scenes[0].id;
    selectScene(targetId);
  }
  refreshSceneCompleteness();
}

async function refreshSceneCompleteness() {
  if (!videoId) return;
  try {
    const result = await api(`/api/videos/${videoId}/validate`);
    let incomplete = 0;
    for (const s of result.scenes) {
      const dot = $(`scene-dot-${s.sceneId}`);
      if (!dot) continue;
      const hasError = s.issues.some((i) => i.severity === "error");
      dot.className = "scene-chip-dot" + (s.issues.length === 0 ? " ok" : hasError ? " error" : " warning");
      if (hasError) incomplete++;
    }
    const renderBtn = $("video-render");
    if (renderBtn) {
      renderBtn.disabled = incomplete > 0;
      renderBtn.textContent = incomplete > 0 ? `Render Final Video — ${incomplete} scene${incomplete === 1 ? "" : "s"} incomplete` : "Render Final Video";
    }
  } catch {
    // validation overlay
  }
}

function renderFlowStepsEditor(steps) {
  currentSceneFlowSteps = Array.isArray(steps) ? JSON.parse(JSON.stringify(steps)) : [];
  const list = $("sc-flow-steps-list");
  if (!list) return;
  list.innerHTML = "";
  if (currentSceneFlowSteps.length === 0) {
    list.innerHTML = '<div class="hint" style="font-size:0.85rem;">No flow steps configured. Click "+ Add Step" to add one.</div>';
    return;
  }
  currentSceneFlowSteps.forEach((step, idx) => {
    const row = document.createElement("div");
    row.style.cssText = "display:flex; gap:0.4rem; align-items:center;";
    row.innerHTML = `
      <input type="text" value="${step.label || ""}" placeholder="Label e.g. Dashboard" style="flex:2; margin:0;" data-field="label" />
      <input type="number" step="0.1" min="0" max="60" value="${step.startSec ?? 0}" title="Start Sec" style="width:65px; margin:0;" data-field="startSec" />
      <input type="number" step="0.1" min="0.5" max="30" value="${step.durationSec ?? 2}" title="Duration Sec" style="width:65px; margin:0;" data-field="durationSec" />
      <select style="width:75px; margin:0;" data-field="side">
        <option value="left" ${step.side === "left" ? "selected" : ""}>Left</option>
        <option value="right" ${step.side === "right" ? "selected" : ""}>Right</option>
      </select>
      <button class="secondary small danger" style="padding:0.2rem 0.5rem; margin:0;" type="button">&times;</button>
    `;
    row.querySelectorAll("input, select").forEach((el) => {
      el.onchange = () => {
        const field = el.dataset.field;
        if (field === "startSec" || field === "durationSec") currentSceneFlowSteps[idx][field] = Number(el.value);
        else currentSceneFlowSteps[idx][field] = el.value;
      };
    });
    row.querySelector("button").onclick = () => {
      currentSceneFlowSteps.splice(idx, 1);
      renderFlowStepsEditor(currentSceneFlowSteps);
    };
    list.appendChild(row);
  });
}

function updateSceneSpecialPanels(templateVal) {
  const isLandscapeFlow = templateVal === "landscape-flow";
  const isPortraitFlow = templateVal === "portrait-flow";
  const flowPanel = $("sc-flow-panel");
  const portraitNote = $("sc-portrait-flow-note");
  if (flowPanel) flowPanel.style.display = isLandscapeFlow ? "block" : "none";
  if (portraitNote) portraitNote.style.display = isPortraitFlow ? "block" : "none";
}

function selectScene(sceneId) {
  setSelectedSceneId(sceneId);
  for (const chip of document.querySelectorAll(".scene-chip")) {
    chip.classList.toggle("active", chip.dataset.sceneId === sceneId);
  }
  const scene = videoProject?.scenes?.find((s) => s.id === sceneId);
  if (!scene) return;

  if ($("sc-template")) $("sc-template").value = scene.sceneTemplate || "";
  if ($("sc-layout")) $("sc-layout").value = scene.layout || "";
  if ($("sc-depth")) $("sc-depth").value = scene.depth || "flat";
  if ($("sc-transition")) $("sc-transition").value = scene.transition || "cut";
  if ($("sc-device")) $("sc-device").value = scene.device || "";
  if ($("sc-background")) $("sc-background").value = scene.background || "";
  if ($("sc-duration")) $("sc-duration").value = scene.durationSeconds || 5;
  if ($("sc-rotate")) { $("sc-rotate").value = scene.rotate || 0; $("sc-rotate-val").textContent = scene.rotate || 0; }
  if ($("sc-zoom")) { $("sc-zoom").value = scene.zoom || 0; $("sc-zoom-val").textContent = scene.zoom || 0; }
  if ($("sc-move")) { $("sc-move").value = scene.move || 0; $("sc-move-val").textContent = scene.move || 0; }

  const textAnim = scene.textAnimation || {};
  if ($("sc-text-preset")) $("sc-text-preset").value = textAnim.preset || "fade-up";
  if ($("sc-text-speed")) $("sc-text-speed").value = String(textAnim.speed ?? 1);
  if ($("sc-text-delay")) { $("sc-text-delay").value = textAnim.delayMs ?? 0; $("sc-text-delay-val").textContent = textAnim.delayMs ?? 0; }
  if ($("sc-text-scale")) { $("sc-text-scale").value = textAnim.scale ?? 1; $("sc-text-scale-val").textContent = (textAnim.scale ?? 1).toFixed(2); }
  if (scene.sourceId && $("sc-source")) $("sc-source").value = scene.sourceId;

  updateVariantSelect("sc-device", "sc-variant", scene.variant, videoDevices);
  updateSceneSpecialPanels(scene.sceneTemplate);
  renderFlowStepsEditor(scene.flowSteps);
  showScenePreview();
  updateScenePreviewScale();
  loadSceneContentPanel(sceneId);
}

function updateVariantSelect(deviceSelectId, variantSelectId, current, catalog) {
  const devSelect = $(deviceSelectId);
  const varSelect = $(variantSelectId);
  if (!devSelect || !varSelect) return;
  const device = catalog.find((d) => d.id === devSelect.value);
  varSelect.innerHTML = '<option value="">default</option>';
  if (device?.variants) {
    for (const v of device.variants) varSelect.innerHTML += `<option value="${v.id}">${v.name}</option>`;
  }
  varSelect.value = current || "";
}

function showScenePreview() {
  const frame = $("sc-preview");
  if (!frame || !videoId || !selectedSceneId) return;
  frame.src = `/api/videos/${videoId}/scene-preview/${selectedSceneId}?t=${Date.now()}`;
  frame.onload = () => {
    scTransportReset();
    updateScenePreviewScale();
  };
}

function updateScenePreviewScale() {
  const scene = videoProject?.scenes?.find((s) => s.id === selectedSceneId);
  if (!scene) return;
  const isLandscape = scene.aspectRatio === "16:9";
  const nativeWidth = isLandscape ? 1920 : 1080;
  const nativeHeight = isLandscape ? 1080 : 1920;
  const box = document.querySelector(".studio-preview-box");
  const frameEl = document.querySelector(".preview-frame");
  if (!box || !frameEl) return;

  const availWidth = Math.max(160, frameEl.clientWidth - 24);
  const availHeight = Math.min(window.innerHeight * 0.5, 420);
  let boxWidth = availHeight * (nativeWidth / nativeHeight);
  let boxHeight = availHeight;
  if (boxWidth > availWidth) {
    boxWidth = availWidth;
    boxHeight = availWidth * (nativeHeight / nativeWidth);
  }
  box.style.width = `${Math.round(boxWidth)}px`;
  box.style.height = `${Math.round(boxHeight)}px`;

  const frame = $("sc-preview");
  if (frame) {
    frame.style.width = `${nativeWidth}px`;
    frame.style.height = `${nativeHeight}px`;
    frame.style.transform = `scale(${boxWidth / nativeWidth})`;
  }
}

function scTransportReset() {
  scTransportStop();
  const scene = videoProject?.scenes?.find((s) => s.id === selectedSceneId);
  scTransport.durationMs = Math.max(1, scene?.durationSeconds || 5) * 1000;
  scTransport.elapsedMs = 0;
  scTransportSeek(0);
}

function scTransportSeek(ms) {
  scTransport.elapsedMs = Math.max(0, Math.min(ms, scTransport.durationMs));
  const frame = $("sc-preview");
  try {
    if (frame && frame.contentWindow && typeof frame.contentWindow.seek === "function") {
      frame.contentWindow.seek(scTransport.elapsedMs);
    }
  } catch {
    // Frame loading or cross-origin
  }
  const timeEl = $("sc-tr-time");
  if (timeEl) {
    timeEl.textContent = `${(scTransport.elapsedMs / 1000).toFixed(1)}s / ${(scTransport.durationMs / 1000).toFixed(1)}s`;
  }
}

function scTransportStop() {
  scTransport.playing = false;
  if (scTransport.timer) clearInterval(scTransport.timer);
  scTransport.timer = null;
  const btn = $("sc-tr-play");
  if (btn) {
    if (scTransport.elapsedMs >= scTransport.durationMs) {
      btn.innerHTML = "&#8635;";
      btn.title = "Replay Scene";
    } else {
      btn.innerHTML = "&#9654;";
      btn.title = "Play";
    }
  }
}

function scTransportPlay() {
  if (scTransport.playing) return;
  scTransport.playing = true;
  const btn = $("sc-tr-play");
  if (btn) {
    btn.innerHTML = "&#9208;";
    btn.title = "Pause";
  }
  const stepMs = 1000 / 30;
  let lastTime = performance.now();
  scTransport.timer = setInterval(() => {
    const now = performance.now();
    const delta = (now - lastTime) * scTransport.speed;
    lastTime = now;

    let elapsed = scTransport.elapsedMs + delta;
    if (elapsed >= scTransport.durationMs) {
      if (scTransport.loop) {
        elapsed = 0;
      } else {
        scTransportSeek(scTransport.durationMs);
        scTransportStop();
        return;
      }
    }
    scTransportSeek(elapsed);
  }, stepMs);
}

async function loadSceneContentPanel(sceneId) {
  contentPanelSceneId = sceneId;
  const panel = $("sc-content-panel");
  if (!panel) return;
  if (!videoId) { panel.innerHTML = ""; return; }
  panel.innerHTML = '<p class="hint">Loading...</p>';
  let spec;
  try {
    spec = await api(`/api/videos/${videoId}/scene-spec/${sceneId}`);
  } catch (e) {
    panel.innerHTML = `<p class="hint">Could not load content requirements: ${e.message}</p>`;
    return;
  }
  if (contentPanelSceneId !== sceneId) return;
  renderSlotEditor(spec.specs, spec.values, spec.issues, sceneId);
  renderSegmentsPanel(sceneId, spec.specs, spec.values);
}

/** Hides a native file input and returns the app's own button that opens it,
 *  so no browser-default "Choose File / No file chosen" widget is ever shown. */
function uploadButton(fileInput, label = "Upload New Source") {
  fileInput.style.display = "none";
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "secondary small";
  btn.style.width = "100%";
  btn.textContent = label;
  btn.onclick = () => fileInput.click();
  return btn;
}

function renderSlotEditor(specs, values, issues, sceneId) {
  const panel = $("sc-content-panel");
  if (!panel) return;
  panel.innerHTML = "";
  if ($("sc-source-section")) $("sc-source-section").style.display = "";
  if (!specs || specs.length === 0) {
    panel.innerHTML = '<p class="hint">This scene needs no content.</p>';
    return;
  }
  const legacyScene = videoProject?.scenes?.find((s) => s.id === sceneId) || {};
  const issuesByKey = {};
  for (const issue of issues || []) (issuesByKey[issue.slotKey] ??= []).push(issue);

  const screenshotSpec = specs.find((s) => s.key === "screenshot" || s.key === "screenshots");
  // The screenshot slot(s) below already offer reuse + upload, so the generic
  // "Screenshot source" block would just be a duplicate of them.
  const sourceSection = $("sc-source-section");
  if (sourceSection) sourceSection.style.display = screenshotSpec ? "none" : "";
  if (screenshotSpec) {
    const count = screenshotSpec.kind === "imageList" ? screenshotSpec.count || 1 : 1;
    const summary = document.createElement("p");
    summary.className = "hint";
    summary.textContent = `This scene uses ${count} screenshot${count === 1 ? "" : "s"}.`;
    panel.appendChild(summary);
  }

  for (const spec of specs) {
    const row = document.createElement("div");
    row.className = "content-slot";
    const label = document.createElement("label");
    label.textContent = spec.label + (spec.required ? " *" : "");
    row.appendChild(label);

    const isLegacy = spec.targets.length === 0;
    const value = values[spec.key];
    if (isLegacy && spec.kind === "text") {
      row.appendChild(legacyTextField(spec, legacyScene, sceneId));
    } else if (isLegacy && spec.kind === "imageList") {
      row.appendChild(legacyImageListField(spec, legacyScene, sceneId));
    } else if (spec.kind === "text") {
      row.appendChild(textField(spec, value?.kind === "text" ? value.value : "", sceneId));
    } else if (spec.kind === "textList") {
      row.appendChild(textListField(spec, value?.kind === "textList" ? value.values : [], sceneId));
    } else if (spec.kind === "image" && spec.key === "screenshot" && value?.kind === "imageSequence") {
      const note = document.createElement("p");
      note.className = "hint";
      note.textContent = "Using the screenshot timeline below.";
      row.appendChild(note);
    } else if (spec.kind === "image") {
      row.appendChild(imageField(spec, value?.kind === "image" ? value.sourceId : null, sceneId, 0));
    } else if (spec.kind === "imageList") {
      row.appendChild(imageListField(spec, value?.kind === "imageList" ? value.sourceIds : [], sceneId));
    } else if (spec.kind === "platformList") {
      row.appendChild(platformListField(spec, value?.kind === "platformList" ? value.items : [], sceneId));
    }

    for (const issue of issuesByKey[spec.key] || []) {
      const msg = document.createElement("p");
      msg.className = "hint slot-issue" + (issue.severity === "error" ? " error" : "");
      msg.textContent = issue.message;
      row.appendChild(msg);
    }
    panel.appendChild(row);
  }
}

async function saveLegacySceneField(sceneId, patch) {
  clearTimeout(legacyFieldSaveTimer);
  return new Promise((resolve) => {
    legacyFieldSaveTimer = setTimeout(async () => {
      const stateEl = $("sc-content-save-state");
      if (stateEl) stateEl.textContent = "Saving...";
      try {
        const updated = await api(`/api/videos/${videoId}/scenes/${sceneId}`, { method: "PUT", body: patch });
        const idx = videoProject.scenes.findIndex((s) => s.id === sceneId);
        if (idx !== -1) videoProject.scenes[idx] = updated;
        if (stateEl) stateEl.textContent = `Saved · ${new Date().toLocaleTimeString()}`;
        refreshSceneCompleteness();
        if (sceneId === selectedSceneId) showScenePreview();
      } catch (e) {
        if (stateEl) stateEl.textContent = "Save failed";
      }
      resolve();
    }, 400);
  });
}

function legacyTextField(spec, legacyScene, sceneId) {
  const wrap = aiFieldWrap();
  const input = document.createElement("input");
  input.type = "text";
  input.value = (spec.key === "text" ? legacyScene.text : legacyScene.subtext) || "";
  input.maxLength = spec.maxLength || 500;
  input.oninput = () => saveLegacySceneField(sceneId, { [spec.key]: input.value });
  wrap.appendChild(input);
  wrap.appendChild(aiButton());
  return wrap;
}

function legacyImageListField(spec, legacyScene, sceneId) {
  const wrap = document.createElement("div");
  wrap.className = "content-slot-list";
  const count = spec.count || 1;
  const ids = legacyScene.screenIds || (legacyScene.sourceId ? [legacyScene.sourceId] : []);
  for (let i = 0; i < count; i++) {
    const single = document.createElement("div");
    const cap = document.createElement("div");
    cap.className = "hint";
    cap.textContent = `Screenshot ${i + 1}`;
    single.appendChild(cap);
    single.appendChild(legacyImageField(ids[i] || null, sceneId, i, count));
    wrap.appendChild(single);
  }
  return wrap;
}

function legacyImageField(sourceId, sceneId, index, count) {
  const wrap = document.createElement("div");
  wrap.className = "content-slot-image";
  const source = sourceId ? (videoProject.sources || []).find((s) => s.id === sourceId) : null;
  const thumb = document.createElement("div");
  thumb.className = "content-slot-thumb";
  if (source) {
    const img = document.createElement("img");
    img.src = `/api/videos/${videoId}/file?p=${encodeURIComponent(source.file)}`;
    thumb.appendChild(img);
  } else {
    thumb.textContent = "No image";
  }
  wrap.appendChild(thumb);

  const controls = document.createElement("div");
  controls.className = "content-slot-image-controls";
  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = "image/png,image/jpeg,image/webp,image/gif";
  fileInput.onchange = async () => {
    const file = fileInput.files[0];
    if (!file) return;
    try {
      const uploaded = await uploadFile(`/api/videos/${videoId}/sources?name=${encodeURIComponent(file.name)}`, file);
      videoProject.sources.push(uploaded);
      const legacyScene = videoProject.scenes.find((s) => s.id === sceneId);
      const ids = legacyScene.screenIds || (legacyScene.sourceId ? [legacyScene.sourceId] : []);
      ids[index] = uploaded.id;
      const patch = count > 1 ? { screenIds: ids } : { sourceId: ids[0] };
      await saveLegacySceneField(sceneId, patch);
      loadSceneContentPanel(sceneId);
    } catch (e) {
      await showAlert("Upload failed: " + e.message);
    }
  };
  controls.appendChild(fileInput);
  controls.appendChild(uploadButton(fileInput));
  wrap.appendChild(controls);
  return wrap;
}

function livePreviewEscapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function livePreviewRichText(raw) {
  return livePreviewEscapeHtml(raw).replace(/\*([^*]+)\*/g, "<span>$1</span>");
}

function livePatchSlot(spec, value, targetIndex) {
  const frame = $("sc-preview");
  let doc;
  try {
    doc = frame.contentDocument || frame.contentWindow?.document;
  } catch {
    return;
  }
  if (!doc) return;
  const targets = targetIndex === undefined ? spec.targets : [spec.targets[targetIndex]].filter(Boolean);
  for (const sel of targets) {
    doc.querySelectorAll(sel).forEach((el) => {
      if (spec.op === "text") el.textContent = value;
      else if (spec.op === "src") el.src = value;
      else el.innerHTML = value;
    });
  }
}

function textField(spec, value, sceneId) {
  const wrap = aiFieldWrap();
  const input = document.createElement("input");
  input.type = "text";
  input.value = value || "";
  input.maxLength = spec.maxLength || 500;
  input.placeholder = `Leave blank to keep the template's default ${spec.label.toLowerCase()}`;
  input.oninput = () => {
    if (input.value) livePatchSlot(spec, livePreviewRichText(input.value));
    saveSlotValueDebounced(sceneId, spec.key, { kind: "text", value: input.value });
  };
  wrap.appendChild(input);
  wrap.appendChild(aiButton());
  return wrap;
}

function textListField(spec, values, sceneId) {
  const wrap = document.createElement("div");
  wrap.className = "content-slot-list";
  const count = spec.count || 1;
  const current = Array.from({ length: count }, (_, i) => values[i] || "");
  for (let i = 0; i < count; i++) {
    const fieldWrap = aiFieldWrap();
    const input = document.createElement("input");
    input.type = "text";
    input.value = current[i];
    input.placeholder = `${spec.label} ${i + 1}`;
    input.maxLength = spec.maxLength || 200;
    input.oninput = () => {
      current[i] = input.value;
      if (input.value) livePatchSlot(spec, livePreviewRichText(input.value), i);
      saveSlotValueDebounced(sceneId, spec.key, { kind: "textList", values: [...current] });
    };
    fieldWrap.appendChild(input);
    fieldWrap.appendChild(aiButton());
    wrap.appendChild(fieldWrap);
  }
  return wrap;
}

function aiFieldWrap() {
  const wrap = document.createElement("div");
  wrap.className = "ai-field";
  return wrap;
}

function aiButton() {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "ai-field-btn";
  btn.title = "AI assist (coming soon)";
  btn.textContent = "✨";
  btn.disabled = true;
  return btn;
}

function imageField(spec, sourceId, sceneId, index) {
  const wrap = document.createElement("div");
  wrap.className = "content-slot-image";
  const source = sourceId ? (videoProject.sources || []).find((s) => s.id === sourceId) : null;
  const thumb = document.createElement("div");
  thumb.className = "content-slot-thumb";
  if (source) {
    const img = document.createElement("img");
    img.src = `/api/videos/${videoId}/file?p=${encodeURIComponent(source.file)}`;
    thumb.appendChild(img);
  } else {
    thumb.textContent = "No image";
  }
  // Thumbnail + device-size label stack vertically so the label sits under
  // the preview instead of crowding the controls beside it.
  const thumbCol = document.createElement("div");
  thumbCol.className = "content-slot-thumb-col";
  thumbCol.appendChild(thumb);
  wrap.appendChild(thumbCol);

  if (source) {
    // Device size only -- resolution/pixel dimensions stay in the data as
    // technical metadata but are never shown in the UI.
    const dims = document.createElement("div");
    dims.className = "hint";
    dims.style.cssText = "font-size:0.68rem; margin-top:2px;";
    dims.textContent = deviceCategoryLabel(source.deviceCategory);
    thumbCol.appendChild(dims);
  }

  const controls = document.createElement("div");
  controls.className = "content-slot-image-controls";

  // Reuse a screenshot already captured for this project -- same {device size
  // -> resolution -> screenshot} data (project.video.sources) the Screen
  // Capture tab writes and Studio Mockup's Screenshot Source Mapping reads
  // (see editor.js's populateSourceSelect), so picking here is consistent
  // with both other tabs instead of forcing a fresh upload every time.
  const sources = videoProject.sources || [];
  if (sources.length > 0) {
    const existingSelect = document.createElement("select");
    existingSelect.style.cssText = "width:100%; font-size:0.78rem; margin-bottom:0.35rem;";
    populateSourceSelect(existingSelect, sources, sourceId || "", { blankLabel: "Reuse existing screenshot…" });
    existingSelect.onchange = async () => {
      const chosenId = existingSelect.value || null;
      if (spec.kind === "imageList") {
        const scene = videoProject.scenes.find((s) => s.id === sceneId);
        const existing = scene?.slotValues?.[spec.key];
        const ids = existing?.kind === "imageList" ? [...existing.sourceIds] : [];
        ids[index] = chosenId;
        await saveSlotValue(sceneId, spec.key, { kind: "imageList", sourceIds: ids });
      } else {
        await saveSlotValue(sceneId, spec.key, { kind: "image", sourceId: chosenId });
      }
      loadSceneContentPanel(sceneId);
      refreshSceneCompleteness();
      showScenePreview();
    };
    controls.appendChild(existingSelect);
  }

  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = "image/png,image/jpeg,image/webp,image/gif";
  fileInput.onchange = async () => {
    const file = fileInput.files[0];
    if (!file) return;
    const localUrl = URL.createObjectURL(file);
    if (spec.op === "src") livePatchSlot(spec, localUrl, spec.kind === "imageList" ? index : undefined);
    try {
      const slotParam = spec.kind === "imageList" ? `${sceneId}:${spec.key}:${index}` : `${sceneId}:${spec.key}`;
      const uploaded = await uploadFile(`/api/videos/${videoId}/sources?name=${encodeURIComponent(file.name)}&slot=${encodeURIComponent(slotParam)}`, file);
      videoProject.sources.push(uploaded);
      loadSceneContentPanel(sceneId);
      refreshSceneCompleteness();
      showScenePreview();
    } catch (e) {
      await showAlert("Upload failed: " + e.message);
    } finally {
      URL.revokeObjectURL(localUrl);
    }
  };
  controls.appendChild(fileInput);
  controls.appendChild(uploadButton(fileInput));

  if (source) {
    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "secondary small";
    removeBtn.textContent = "Remove";
    removeBtn.onclick = async () => {
      if (spec.kind === "imageList") {
        const scene = videoProject.scenes.find((s) => s.id === sceneId);
        const existing = scene?.slotValues?.[spec.key];
        const ids = existing?.kind === "imageList" ? [...existing.sourceIds] : [];
        ids[index] = null;
        await saveSlotValue(sceneId, spec.key, { kind: "imageList", sourceIds: ids });
      } else {
        await saveSlotValue(sceneId, spec.key, { kind: "image", sourceId: null });
      }
      loadSceneContentPanel(sceneId);
      refreshSceneCompleteness();
      showScenePreview();
    };
    controls.appendChild(removeBtn);
  }
  wrap.appendChild(controls);
  return wrap;
}

function imageListField(spec, sourceIds, sceneId) {
  const wrap = document.createElement("div");
  wrap.className = "content-slot-list";
  const count = spec.count || 1;
  for (let i = 0; i < count; i++) {
    const single = document.createElement("div");
    const cap = document.createElement("div");
    cap.className = "hint";
    cap.textContent = `${spec.label} ${i + 1}`;
    single.appendChild(cap);
    single.appendChild(imageField(spec, sourceIds[i] || null, sceneId, i));
    wrap.appendChild(single);
  }
  return wrap;
}

function platformListField(spec, items, sceneId) {
  const wrap = document.createElement("div");
  wrap.className = "content-slot-platforms";
  const current = (items || []).map((i) => ({ ...i }));
  const icons = ["android", "apple", "windows", "globe"];

  function redraw() {
    wrap.innerHTML = "";
    current.forEach((item, i) => {
      const row = document.createElement("div");
      row.className = "platform-row";
      const nameInput = document.createElement("input");
      nameInput.type = "text";
      nameInput.placeholder = "Name";
      nameInput.value = item.name || "";
      nameInput.oninput = () => { item.name = nameInput.value; saveSlotValueDebounced(sceneId, spec.key, { kind: "platformList", items: current }); };
      const iconSelect = document.createElement("select");
      iconSelect.innerHTML = icons.map((ic) => `<option value="${ic}">${ic}</option>`).join("");
      iconSelect.value = item.icon || icons[0];
      iconSelect.onchange = () => { item.icon = iconSelect.value; saveSlotValueDebounced(sceneId, spec.key, { kind: "platformList", items: current }); };
      const urlInput = document.createElement("input");
      urlInput.type = "text";
      urlInput.placeholder = "https://...";
      urlInput.value = item.url || "";
      urlInput.oninput = () => { item.url = urlInput.value; saveSlotValueDebounced(sceneId, spec.key, { kind: "platformList", items: current }); };
      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "secondary small";
      removeBtn.textContent = "×";
      removeBtn.onclick = () => { current.splice(i, 1); redraw(); saveSlotValue(sceneId, spec.key, { kind: "platformList", items: current }); };
      row.append(nameInput, iconSelect, urlInput, removeBtn);
      wrap.appendChild(row);
    });
    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "secondary small";
    addBtn.textContent = "+ Add platform";
    addBtn.onclick = () => { current.push({ name: "", icon: "android", url: "" }); redraw(); };
    wrap.appendChild(addBtn);
  }
  redraw();
  return wrap;
}

function saveSlotValueDebounced(sceneId, key, value) {
  const stateEl = $("sc-content-save-state");
  if (stateEl) stateEl.textContent = "Saving...";
  clearTimeout(contentSaveTimer);
  contentSaveTimer = setTimeout(() => saveSlotValue(sceneId, key, value), 400);
}

async function saveSlotValue(sceneId, key, value) {
  try {
    await api(`/api/videos/${videoId}/scenes/${sceneId}/slots`, { method: "PUT", body: { slotValues: { [key]: value } } });
    const scene = videoProject.scenes.find((s) => s.id === sceneId);
    if (scene) scene.slotValues = { ...(scene.slotValues || {}), [key]: value };
    const stateEl = $("sc-content-save-state");
    if (stateEl) stateEl.textContent = `Saved · ${new Date().toLocaleTimeString()}`;
    refreshSceneCompleteness();
    if (sceneId === selectedSceneId) showScenePreview();
  } catch (e) {
    const stateEl = $("sc-content-save-state");
    if (stateEl) stateEl.textContent = "Save failed";
  }
}

function renderSegmentsPanel(sceneId, specs, values) {
  const panel = $("sc-segments-panel");
  if (!panel) return;
  const spec = specs.find((s) => s.key === "screenshot");
  if (!spec) { panel.style.display = "none"; return; }
  panel.style.display = "";

  const value = values.screenshot;
  const isSequence = value?.kind === "imageSequence";
  const list = $("sc-segments-list");
  if (!list) return;
  list.innerHTML = "";

  const toggleRow = document.createElement("label");
  toggleRow.className = "checkbox-row";
  const toggle = document.createElement("input");
  toggle.type = "checkbox";
  toggle.checked = isSequence;
  toggle.onchange = () => {
    if (toggle.checked) {
      const existingSourceId = value?.kind === "image" ? value.sourceId : null;
      const seeded = { kind: "imageSequence", segments: [{ sourceId: existingSourceId, durationSec: 3 }] };
      saveSlotValue(sceneId, "screenshot", seeded).then(() => loadSceneContentPanel(sceneId));
    } else {
      const firstSourceId = value?.kind === "imageSequence" ? value.segments[0]?.sourceId ?? null : null;
      saveSlotValue(sceneId, "screenshot", { kind: "image", sourceId: firstSourceId }).then(() => loadSceneContentPanel(sceneId));
    }
  };
  toggleRow.appendChild(toggle);
  toggleRow.appendChild(document.createTextNode(" Use multiple screenshots in this scene"));
  list.appendChild(toggleRow);

  const addBtn = $("sc-segment-add");
  if (addBtn) addBtn.style.display = isSequence ? "" : "none";
  if (!isSequence) return;

  const segments = (value.segments || []).map((s) => ({ ...s }));

  function persist() {
    clearTimeout(segmentsSaveTimer);
    segmentsSaveTimer = setTimeout(() => saveSlotValue(sceneId, "screenshot", { kind: "imageSequence", segments }), 400);
  }

  function draw() {
    Array.from(list.querySelectorAll(".segment-row")).forEach((el) => el.remove());
    segments.forEach((seg, i) => {
      const row = document.createElement("div");
      row.className = "segment-row";

      const thumb = document.createElement("div");
      thumb.className = "segment-thumb";
      const source = seg.sourceId ? (videoProject.sources || []).find((s) => s.id === seg.sourceId) : null;
      if (source) {
        const img = document.createElement("img");
        img.src = `/api/videos/${videoId}/file?p=${encodeURIComponent(source.file)}`;
        thumb.appendChild(img);
      }
      row.appendChild(thumb);

      const fileInput = document.createElement("input");
      fileInput.type = "file";
      fileInput.accept = "image/png,image/jpeg,image/webp,image/gif";
      fileInput.onchange = async () => {
        const file = fileInput.files[0];
        if (!file) return;
        try {
          const uploaded = await uploadFile(`/api/videos/${videoId}/sources?name=${encodeURIComponent(file.name)}`, file);
          videoProject.sources.push(uploaded);
          seg.sourceId = uploaded.id;
          persist();
          draw();
        } catch (e) {
          await showAlert("Upload failed: " + e.message);
        }
      };
      row.appendChild(fileInput);
      row.appendChild(uploadButton(fileInput));

      const durationInput = document.createElement("input");
      durationInput.type = "number";
      durationInput.min = "0.2";
      durationInput.step = "0.1";
      durationInput.value = seg.durationSec;
      durationInput.title = "Duration (seconds)";
      durationInput.oninput = () => { seg.durationSec = Math.max(0.2, Number(durationInput.value) || 0.2); persist(); };
      row.appendChild(durationInput);

      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "secondary small";
      removeBtn.textContent = "×";
      removeBtn.onclick = () => { segments.splice(i, 1); persist(); draw(); };
      row.appendChild(removeBtn);

      list.appendChild(row);
    });
  }
  draw();

  if (addBtn) {
    addBtn.onclick = () => {
      segments.push({ sourceId: null, durationSec: 3 });
      persist();
      draw();
    };
  }
}

export async function saveCurrentScene() {
  if (!videoId || !selectedSceneId || !videoProject) return;
  const body = {
    sceneTemplate: $("sc-template")?.value,
    layout: $("sc-layout")?.value || undefined,
    depth: $("sc-depth")?.value || "flat",
    transition: $("sc-transition")?.value || "cut",
    device: $("sc-device")?.value,
    variant: $("sc-variant")?.value || undefined,
    background: $("sc-background")?.value,
    durationSeconds: Number($("sc-duration")?.value) || 3,
    rotate: Number($("sc-rotate")?.value || 0),
    zoom: Number($("sc-zoom")?.value || 0),
    move: Number($("sc-move")?.value || 0),
    sourceId: $("sc-source")?.value || undefined,
    flowSteps: currentSceneFlowSteps.length > 0 ? currentSceneFlowSteps : undefined,
    textAnimation: {
      preset: $("sc-text-preset")?.value || "fade-up",
      speed: Number($("sc-text-speed")?.value) || 1,
      delayMs: Number($("sc-text-delay")?.value) || 0,
      scale: Number($("sc-text-scale")?.value) || 1,
    },
  };
  const updated = await api(`/api/videos/${videoId}/scenes/${selectedSceneId}`, { method: "PUT", body });
  const idx = videoProject.scenes.findIndex((s) => s.id === selectedSceneId);
  if (idx !== -1) videoProject.scenes[idx] = updated;
  showScenePreview();
}

export async function submitSaveConfig(overwrite) {
  const name = $("save-config-name")?.value.trim();
  if (!name) {
    const warn = $("save-config-warning");
    if (warn) {
      warn.textContent = "A configuration name is required.";
      warn.style.display = "block";
    }
    return;
  }
  try {
    savedConfigsCache = await api(`/api/videos/${videoId}/configs`, { method: "POST", body: { name, overwrite } });
    $("save-config-backdrop")?.classList.remove("open");
    showToast(`Configuration "${name}" saved.`, "success");
    renderSavedConfigsGrid();
  } catch (e) {
    if (!overwrite && /already exists/i.test(e.message)) {
      const ok = await showConfirm(`A configuration named "${name}" already exists. Overwrite it?`);
      if (ok) return submitSaveConfig(true);
      return;
    }
    const warn = $("save-config-warning");
    if (warn) {
      warn.textContent = e.message;
      warn.style.display = "block";
    }
  }
}

export async function loadSavedConfigs() {
  const grid = $("saved-configs-grid");
  if (!grid) return;
  if (!videoId) {
    grid.innerHTML = '<div class="hint">No project loaded.</div>';
    return;
  }
  grid.innerHTML = '<div class="hint">Loading...</div>';
  try {
    savedConfigsCache = await api(`/api/videos/${videoId}/configs`);
    renderSavedConfigsGrid();
  } catch (e) {
    grid.innerHTML = `<div class="hint slot-issue error">Failed to load saved configurations: ${e.message}</div>`;
  }
}

export function renderSavedConfigsGrid() {
  const grid = $("saved-configs-grid");
  if (!grid) return;
  if (savedConfigsCache.length === 0) {
    grid.innerHTML = '<div class="hint">No saved configurations yet. Use "Save Template Configuration" in the Scenes tab.</div>';
    return;
  }
  grid.innerHTML = savedConfigsCache.map((c) => {
    const aspect = c.scenes[0]?.aspectRatio === "16:9" ? "16:9" : "9:16";
    return `
      <div class="card" style="padding:1rem;" data-config-id="${c.id}">
        <div style="font-weight:600; margin-bottom:.3rem;">${c.name}</div>
        <div class="hint" style="margin-bottom:.5rem;">${c.scenes.length} scenes &middot; ${aspect} &middot; ${new Date(c.savedAt).toLocaleDateString()}</div>
        <div class="row" style="gap:.4rem;">
          <button class="small primary" data-act="apply-config" data-id="${c.id}">Apply to Project</button>
          <button class="small danger" data-act="delete-config" data-id="${c.id}">Delete</button>
        </div>
      </div>
    `;
  }).join("");

  grid.querySelectorAll('[data-act="apply-config"]').forEach((btn) => {
    btn.onclick = async () => {
      const id = btn.dataset.id;
      const ok = await showConfirm("Apply this configuration? Current scenes will be replaced.");
      if (!ok) return;
      try {
        const updated = await api(`/api/videos/${videoId}/apply-config/${id}`, { method: "POST" });
        setVideoProject(updated);
        renderVideoScenes();
        showToast("Configuration applied.", "success");
      } catch (e) {
        await showAlert("Could not apply configuration: " + e.message);
      }
    };
  });

  grid.querySelectorAll('[data-act="delete-config"]').forEach((btn) => {
    btn.onclick = async () => {
      const id = btn.dataset.id;
      const ok = await showConfirm("Delete this saved configuration?");
      if (!ok) return;
      try {
        savedConfigsCache = await api(`/api/videos/${videoId}/configs/${id}`, { method: "DELETE" });
        renderSavedConfigsGrid();
      } catch (e) {
        await showAlert("Could not delete configuration: " + e.message);
      }
    };
  });
}

// Wire scene transport and event handlers
(function initVideoStaticListeners() {
  if (typeof window === "undefined") return;

  window.addEventListener("resize", () => updateScenePreviewScale());

  const flowAddBtn = $("sc-flow-add-btn");
  if (flowAddBtn) {
    flowAddBtn.onclick = () => {
      const lastStart = currentSceneFlowSteps.length > 0 ? (currentSceneFlowSteps.at(-1).startSec + currentSceneFlowSteps.at(-1).durationSec + 0.5) : 0.5;
      const lastSide = currentSceneFlowSteps.length > 0 ? (currentSceneFlowSteps.at(-1).side === "left" ? "right" : "left") : "left";
      currentSceneFlowSteps.push({ label: "Next Feature", startSec: Math.round(lastStart * 10) / 10, durationSec: 2.2, side: lastSide });
      renderFlowStepsEditor(currentSceneFlowSteps);
    };
  }

  const scTemplate = $("sc-template");
  if (scTemplate) {
    scTemplate.onchange = () => updateSceneSpecialPanels(scTemplate.value);
  }

  const scDevice = $("sc-device");
  if (scDevice) {
    scDevice.onchange = () => updateVariantSelect("sc-device", "sc-variant", "", videoDevices);
  }

  for (const [id, out] of [["sc-rotate", "sc-rotate-val"], ["sc-zoom", "sc-zoom-val"], ["sc-move", "sc-move-val"]]) {
    const el = $(id);
    if (el) el.oninput = () => { const o = $(out); if (o) o.textContent = el.value; };
  }
  const textDelay = $("sc-text-delay");
  if (textDelay) textDelay.oninput = () => { const o = $("sc-text-delay-val"); if (o) o.textContent = textDelay.value; };
  const textScale = $("sc-text-scale");
  if (textScale) textScale.oninput = () => { const o = $("sc-text-scale-val"); if (o) o.textContent = Number(textScale.value).toFixed(2); };

  // Transport buttons
  const playBtn = $("sc-tr-play");
  if (playBtn) {
    playBtn.onclick = () => {
      if (scTransport.elapsedMs >= scTransport.durationMs) {
        scTransportSeek(0);
      }
      scTransport.playing ? scTransportStop() : scTransportPlay();
    };
  }
  const backBtn = $("sc-tr-back");
  if (backBtn) backBtn.onclick = () => { scTransportStop(); scTransportSeek(scTransport.elapsedMs - 1000); };
  const fwdBtn = $("sc-tr-fwd");
  if (fwdBtn) fwdBtn.onclick = () => { scTransportStop(); scTransportSeek(scTransport.elapsedMs + 1000); };
  const prevFrameBtn = $("sc-tr-prev-frame");
  if (prevFrameBtn) prevFrameBtn.onclick = () => { scTransportStop(); scTransportSeek(scTransport.elapsedMs - 1000 / 30); };
  const nextFrameBtn = $("sc-tr-next-frame");
  if (nextFrameBtn) nextFrameBtn.onclick = () => { scTransportStop(); scTransportSeek(scTransport.elapsedMs + 1000 / 30); };

  const loopBtn = $("sc-tr-loop");
  if (loopBtn) {
    loopBtn.onclick = () => {
      scTransport.loop = !scTransport.loop;
      loopBtn.style.background = scTransport.loop ? "#3b82f6" : "";
      loopBtn.style.color = scTransport.loop ? "#ffffff" : "";
    };
  }

  const muteBtn = $("sc-tr-mute");
  if (muteBtn) {
    muteBtn.onclick = () => {
      scTransport.muted = !scTransport.muted;
      muteBtn.innerHTML = scTransport.muted ? "🔇" : "🔊";
      const audio = ensureVideoDetailAudio();
      if (audio) audio.muted = scTransport.muted;
      const frame = $("sc-preview");
      try {
        if (frame && frame.contentWindow) {
          frame.contentWindow.postMessage({ type: "video-mute-toggle", muted: scTransport.muted }, "*");
          frame.contentWindow.document.querySelectorAll("audio, video").forEach(el => {
            el.muted = scTransport.muted;
          });
        }
      } catch(e) {}
    };
  }

  const speedSelect = $("sc-tr-speed");
  if (speedSelect) {
    speedSelect.onchange = () => {
      scTransport.speed = parseFloat(speedSelect.value) || 1.0;
    };
  }

  const scSourceUpload = $("sc-source-upload");
  if (scSourceUpload) {
    scSourceUpload.onclick = async () => {
      const fileInput = $("sc-source-file");
      if (!fileInput || !fileInput.files[0]) {
        if (fileInput) fileInput.click();
        return;
      }
      const file = fileInput.files[0];
      try {
        const uploaded = await uploadFile(`/api/videos/${videoId}/sources?name=${encodeURIComponent(file.name)}`, file);
        videoProject.sources = videoProject.sources || [];
        videoProject.sources.push(uploaded);
        renderVideoScenes();
        showToast(`Uploaded "${file.name}".`, "success");
      } catch (e) {
        await showAlert("Upload failed: " + e.message);
      }
    };
  }

  const scSourceFile = $("sc-source-file");
  if (scSourceFile) {
    scSourceFile.onchange = async () => {
      const file = scSourceFile.files[0];
      if (!file) return;
      try {
        const uploaded = await uploadFile(`/api/videos/${videoId}/sources?name=${encodeURIComponent(file.name)}`, file);
        videoProject.sources = videoProject.sources || [];
        videoProject.sources.push(uploaded);
        renderVideoScenes();
        showToast(`Uploaded "${file.name}".`, "success");
      } catch (e) {
        await showAlert("Upload failed: " + e.message);
      }
    };
  }

  const scSaveBtn = $("sc-save");
  if (scSaveBtn) {
    scSaveBtn.onclick = async () => {
      try {
        await saveCurrentScene();
        showToast("Scene saved.", "success");
      } catch (e) {
        await showAlert("Save failed: " + e.message);
      }
    };
  }

  const scAddBtn = $("sc-add");
  if (scAddBtn) {
    scAddBtn.onclick = async () => {
      if (!videoId || !videoProject || videoProject.scenes.length === 0) {
        await showAlert("Load a template first.");
        return;
      }
      try {
        const updated = await api(`/api/videos/${videoId}/scenes`, { method: "POST" });
        setVideoProject(updated);
        renderVideoScenes();
        selectScene(updated.scenes.at(-1).id);
        showToast(`Scene ${updated.scenes.length} added.`, "success");
      } catch (e) {
        await showAlert("Could not add scene: " + e.message);
      }
    };
  }

  const scRemoveBtn = $("sc-remove");
  if (scRemoveBtn) {
    scRemoveBtn.onclick = async () => {
      if (!selectedSceneId || !videoProject) return;
      const ok = await showConfirm("Remove this scene? This cannot be undone.");
      if (!ok) return;
      try {
        const updated = await api(`/api/videos/${videoId}/scenes/${selectedSceneId}`, { method: "DELETE" });
        setVideoProject(updated);
        renderVideoScenes();
      } catch (e) {
        await showAlert("Could not remove scene: " + e.message);
      }
    };
  }

  const saveConfigBtn = $("video-save-config-btn");
  if (saveConfigBtn) {
    saveConfigBtn.onclick = () => {
      if (!videoId || !videoProject || !videoProject.template) {
        showAlert("Load a template first.");
        return;
      }
      if ($("save-config-name")) $("save-config-name").value = "";
      if ($("save-config-warning")) $("save-config-warning").style.display = "none";
      $("save-config-backdrop")?.classList.add("open");
      $("save-config-name")?.focus();
    };
  }

  const saveConfigClose = $("save-config-close");
  if (saveConfigClose) saveConfigClose.onclick = () => $("save-config-backdrop")?.classList.remove("open");
  const saveConfigCancel = $("save-config-cancel");
  if (saveConfigCancel) saveConfigCancel.onclick = () => $("save-config-backdrop")?.classList.remove("open");
  const saveConfigConfirm = $("save-config-confirm");
  if (saveConfigConfirm) saveConfigConfirm.onclick = () => submitSaveConfig(false);

  const bgmUploadBtn = $("bgm-upload");
  const bgmFile = $("bgm-file");
  if (bgmUploadBtn && bgmFile) {
    bgmUploadBtn.onclick = () => bgmFile.click();
    bgmFile.onchange = async () => {
      const file = bgmFile.files[0];
      if (!file) return;
      try {
        await uploadFile(`/api/videos/${videoId}/bgm`, file);
        await showAlert("BGM uploaded.");
      } catch (e) {
        await showAlert("Upload failed: " + e.message);
      }
      bgmFile.value = "";
    };
  }

  const videoRenderBtn = $("video-render");
  if (videoRenderBtn) {
    videoRenderBtn.onclick = async () => {
      videoRenderBtn.disabled = true;
      const resEl = $("video-result");
      if (resEl) resEl.textContent = "Rendering… this can take a while.";
      try {
        const result = await api(`/api/videos/${videoId}/render`, { method: "POST" });
        if (resEl) resEl.textContent = "Video rendered: " + result.videoPath;
        const link = $("video-download");
        if (link) {
          link.href = `/api/videos/${videoId}/download`;
          link.style.display = "inline-block";
        }
      } catch (e) {
        if (resEl) resEl.textContent = "Render failed: " + e.message;
      } finally {
        videoRenderBtn.disabled = false;
      }
    };
  }
})();
