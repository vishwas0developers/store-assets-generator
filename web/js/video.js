// Video Studio module — template & scene management, timeline, 3D device preview, and player bridge.
import {
  activeApplicationId,
  videoId,
  videoApplication,
  selectedSceneId,
  videoTemplates,
  setVideoId,
  setVideoApplication,
  setSelectedSceneId,
  setVideoTemplates
} from './state.js';
import { api, uploadFile, showAlert, showConfirm, showToast, showSaveAsDialog, showUpdateTemplateDialog, showUnsavedDialog, setEditingEmpty } from './utils.js';
import { populateSourceSelect } from './editor.js';
import { loadDeviceCategories, deviceCategoryLabel } from './deviceCategories.js';
import { ICONS } from './icons.js';

loadDeviceCategories();

let videoTemplateDetailId = null;
let videoDetailSceneIndex = 0;
let videoDetailState = "idle";
let videoDetailMode = "sequence";
let videoDetailAudio = null;
let videoDetailResizeObserver = null;
let hostPlaybackTick = null;
let videoDevices = [];
let videoDeviceRegistry = [];
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

export async function loadVideoApplicationInto(id) {
  if (id !== videoId) setVideoLoaded(null);
  setVideoId(id);
  if (id) {
    try {
      // No explicitly loaded template -> neutral fetch: the server's stale working scenes are never handed to the editor.
      const proj = await api(`/api/videos/${id}${videoLoadedTemplate ? "" : "?editing=none"}`);
      setVideoApplication(proj);
      const label = $("video-application-label");
      if (label) label.textContent = proj.name;
    } catch (e) {
      console.error("Failed to load video application:", e);
      setVideoApplication(null);
      const label = $("video-application-label");
      if (label) label.textContent = "No video loaded";
    }
  } else {
    setVideoApplication(null);
    const label = $("video-application-label");
    if (label) label.textContent = "No application selected";
  }

  try {
    if (!Array.isArray(videoDevices) || videoDevices.length === 0) {
      const res = await api("/api/devices");
      videoDevices = Array.isArray(res) ? res : (Array.isArray(res?.devices) ? res.devices : []);
    }
    if (videoDeviceRegistry.length === 0) {
      videoDeviceRegistry = (await api("/api/video-devices"))?.devices ?? [];
    }
    if (videoSceneOptions.animations.length === 0) {
      videoSceneOptions = await api("/api/videos/scene-options");
    }
  } catch (e) {
    console.error("Failed to load video reference data:", e);
  }

  await renderVideoTemplateGrid();
  const hasDraft = !!(videoLoadedTemplate && videoApplication && videoApplication.template && videoApplication.scenes?.length);
  setEditingEmpty("video-section-scene-editing", !hasDraft);
  if (hasDraft) renderVideoScenes();
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
  if (videoId) q.set("applicationId", videoId);
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
    videoDetailAudio.volume = 1;
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
    await showAlert("Select an application first.");
    return;
  }
  const t = videoTemplates.find((x) => x.id === id);
  if (!(await confirmDiscardVideoDraft())) return;
  const updatedProj = await api(`/api/videos/${videoId}/apply-template`, { method: "POST", body: { templateId: id } });
  setVideoLoaded({ source: "default", id, name: t ? t.name : id });
  setVideoApplication(updatedProj);
  renderVideoScenes();
  showToast(`Applied "${t ? t.name : id}" — ${updatedProj.scenes.length} scene(s) ready. Switch to Scenes to customize.`, "success");
}

export function renderVideoScenes() {
  // Nothing is rendered into the editor unless the user explicitly loaded a template.
  if (!videoLoadedTemplate || !videoApplication || !videoApplication.scenes) return;

  const scTemplate = $("sc-template");
  if (scTemplate && videoSceneOptions.animations) {
    scTemplate.innerHTML = videoSceneOptions.animations.map((a) => `<option value="${a.id}">${a.name}</option>`).join("");
  }
  const scBackground = $("sc-background");
  if (scBackground && videoSceneOptions.backgrounds) {
    scBackground.innerHTML = videoSceneOptions.backgrounds.map((b) => `<option value="${b}">${b}</option>`).join("");
  }
  // The named-gradient theme select only renders for code-gen device-preset
  // templates -- a tpl-* slots template ignores scene.background entirely and
  // keeps its own baked CSS, so showing the dropdown there would be a dead
  // control with no visible effect.
  const themeSection = $("sc-background-theme-section");
  if (themeSection) themeSection.style.display = videoApplication.template ? "none" : "";
  renderGlobalBackgroundPanel();
  if (!templateBackgrounds.length) {
    ensureTemplateBackgrounds().then(() => {
      renderGlobalBackgroundPanel();
      if (selectedSceneId) renderSceneBackgroundSlot(selectedSceneId);
    });
  }
  populateSceneDeviceSelect(videoApplication.scenes.find((s) => s.id === selectedSceneId));

  const orientation = (videoApplication.scenes[0] && videoApplication.scenes[0].aspectRatio) === "16:9" ? "16:9" : "9:16";
  const layouts = (videoSceneOptions.layouts && videoSceneOptions.layouts[orientation]) || [];
  const scLayout = $("sc-layout");
  if (scLayout) {
    scLayout.innerHTML = layouts.map((l) => `<option value="${l.id}">${l.name}</option>`).join("");
  }

  // Grouped and labeled by device size (Phone / 7-inch Tablet / 10-inch
  // Tablet), matching Screen Capture / Screenshot Source Mapping -- never by
  // resolution/pixel dimensions.
  const scSource = $("sc-source");
  if (scSource) populateSourceSelect(scSource, videoApplication.sources || [], null, { blankLabel: "(None)" });

  const templateLabel = $("video-selected-template-label");
  if (templateLabel) {
    const t = videoTemplates.find((x) => x.id === videoApplication.template);
    templateLabel.textContent = videoApplication.template ? `Template: ${t ? t.name : videoApplication.template}` : "";
  }

  const nav = $("video-scene-nav");
  if (nav) {
    nav.innerHTML = "";
    videoApplication.scenes.forEach((s, i) => {
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

  if (videoApplication.scenes.length) {
    const targetId = selectedSceneId && videoApplication.scenes.some(s => s.id === selectedSceneId) ? selectedSceneId : videoApplication.scenes[0].id;
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
      renderBtn.disabled = false;
      renderBtn.textContent = incomplete > 0 ? `Render Final Video (${incomplete} scene${incomplete === 1 ? "" : "s"} incomplete)` : "Render Final Video";
      renderBtn.onclick = () => {
        if (!videoId || !videoApplication) {
          showAlert("Please select an application first.");
          return;
        }
        openExportModal({
          title: "Export Video",
          subject: videoApplication.name || "Video Application",
          startUrl: `/api/videos/${videoId}/render`,
          application: videoApplication,
          defaultFileName: (videoApplication.name || "video-export").toLowerCase().replace(/[^a-z0-9]+/g, "-"),
        });
      };
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
  if (!videoLoadedTemplate) return;
  setSelectedSceneId(sceneId);
  for (const chip of document.querySelectorAll(".scene-chip")) {
    chip.classList.toggle("active", chip.dataset.sceneId === sceneId);
  }
  const scene = videoApplication?.scenes?.find((s) => s.id === sceneId);
  if (!scene) return;

  if ($("sc-template")) $("sc-template").value = scene.sceneTemplate || "";
  if ($("sc-layout")) $("sc-layout").value = scene.layout || "";
  if ($("sc-depth")) $("sc-depth").value = scene.depth || "flat";
  if ($("sc-transition")) $("sc-transition").value = scene.transition || "cut";
  populateSceneDeviceSelect(scene);
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
  syncVideoTimingUi(scene);
  renderFlowStepsEditor(scene.flowSteps);
  showScenePreview();
  updateScenePreviewScale();
  loadSceneContentPanel(sceneId);
}

/** A scene's rendering mode: its own `deviceMode`, else 3D. */
const sceneDeviceMode = (scene) => (scene?.deviceMode === "2D" ? "2D" : "3D");

const DEVICE_VALUE_RE = /^(2d|3d|css):/;

/** Option value = "<category>:<id>". The same catalogue id exists as both a 2D and a 3D device, so the category is
 *  part of the value; a CSS device is its own category (its rendering mode comes from its registry entry). */
function deviceOptionValue(d) {
  return d.sourceType === "CSS" ? `css:${d.id}` : `${String(d.deviceType).toLowerCase()}:${d.id}`;
}

/** { id, mode } for an option value; mode is "2D" | "3D" (null for a legacy bare id). */
function parseDeviceValue(value) {
  const m = String(value || "").match(/^(2d|3d|css):(.*)$/);
  if (!m) return { id: String(value || ""), mode: null };
  if (m[1] === "css") {
    const entry = videoDeviceRegistry.find((d) => d.sourceType === "CSS" && d.id === m[2]);
    return { id: m[2], mode: entry?.deviceType === "2D" ? "2D" : "3D" };
  }
  return { id: m[2], mode: m[1].toUpperCase() };
}

/** The option value matching what a scene currently renders with. */
function currentDeviceOptionValue(scene) {
  const mode = sceneDeviceMode(scene);
  const id = String(scene?.device || "").replace(DEVICE_VALUE_RE, "");
  const css = videoDeviceRegistry.find((d) => d.sourceType === "CSS" && d.id === id && d.deviceType === mode);
  return css ? `css:${id}` : `${mode.toLowerCase()}:${id}`;
}

/** Offers every device of every category (3D models, 2D frames, CSS rigs): the device is an independent property of
 *  the scene, not something locked to the template's original device. The scene's current category is listed first
 *  and its current device is always present and selected. */
function populateSceneDeviceSelect(scene) {
  const scDevice = $("sc-device");
  if (!scDevice) return;
  const label = (d) => `${d.vendor} — ${d.name}`;
  const groups = [
    { key: "3D", title: "3D Devices", list: videoDeviceRegistry.filter((d) => d.sourceType !== "CSS" && d.deviceType === "3D") },
    { key: "2D", title: "2D Devices", list: videoDeviceRegistry.filter((d) => d.sourceType !== "CSS" && d.deviceType === "2D") },
    { key: "CSS", title: "CSS Devices", list: videoApplication?.template ? videoDeviceRegistry.filter((d) => d.sourceType === "CSS") : [] },
  ];
  const currentValue = currentDeviceOptionValue(scene);
  const currentGroup = currentValue.startsWith("css:") ? "CSS" : sceneDeviceMode(scene);
  groups.sort((x, y) => (y.key === currentGroup) - (x.key === currentGroup));
  let html = groups
    .filter((g) => g.list.length)
    .map((g) => `<optgroup label="${g.title}">${g.list.map((d) => `<option value="${deviceOptionValue(d)}">${label(d)}</option>`).join("")}</optgroup>`)
    .join("");
  if (scene?.device && !html.includes(`value="${currentValue}"`)) {
    html = `<option value="${currentValue}">${scene.device} (current)</option>` + html;
  }
  scDevice.innerHTML = html;
  scDevice.value = currentValue;
}

/** Persists the device picked in the dropdown for the current scene and re-renders the preview with it. */
async function applySelectedSceneDevice() {
  try {
    await saveCurrentScene();
    const scene = videoApplication?.scenes?.find((s) => s.id === selectedSceneId);
    if (scene) populateSceneDeviceSelect(scene);
  } catch (e) {
    const scene = videoApplication?.scenes?.find((s) => s.id === selectedSceneId);
    if (scene) populateSceneDeviceSelect(scene);
    await showAlert("Could not change the device: " + e.message);
  }
}

/** Device Management -> "Use in selected scene". */
window.assignDeviceToSelectedScene = async (id, mode) => {
  const scene = videoApplication?.scenes?.find((s) => s.id === selectedSceneId);
  if (!scene) return { ok: false, message: "Open an application and select a scene first." };
  populateSceneDeviceSelect(scene);
  const dev = $("sc-device");
  const wanted = [`${String(mode).toLowerCase()}:${id}`, `css:${id}`].find((v) => dev && [...dev.options].some((o) => o.value === v));
  if (!wanted) return { ok: false, message: "That device can't be used by this application's scenes." };
  dev.value = wanted;
  await applySelectedSceneDevice();
  return { ok: true, message: "Device applied to the selected scene." };
};

function updateVariantSelect(deviceSelectId, variantSelectId, current, catalog) {
  const devSelect = $(deviceSelectId);
  const varSelect = $(variantSelectId);
  if (!devSelect || !varSelect) return;
  const device = catalog.find((d) => d.id === String(devSelect.value).replace(DEVICE_VALUE_RE, ""));
  varSelect.innerHTML = '<option value="">default</option>';
  if (device?.variants) {
    for (const v of device.variants) varSelect.innerHTML += `<option value="${v.id}">${v.name}</option>`;
  }
  varSelect.value = current || "";
}

function showScenePreview() {
  if (!videoLoadedTemplate) return;
  const frame = $("sc-preview");
  if (!frame || !videoId || !selectedSceneId) return;
  frame.src = `/api/videos/${videoId}/scene-preview/${selectedSceneId}?t=${Date.now()}`;
  frame.onload = () => {
    scTransportReset();
    updateScenePreviewScale();
  };
}

function updateScenePreviewScale() {
  const scene = videoApplication?.scenes?.find((s) => s.id === selectedSceneId);
  if (!scene) return;
  const isLandscape = scene.aspectRatio === "16:9";
  const nativeWidth = isLandscape ? 1920 : 1080;
  const nativeHeight = isLandscape ? 1080 : 1920;
  const box = document.querySelector(".studio-preview-box");
  const frameEl = document.querySelector(".preview-frame");
  if (!box || !frameEl) return;

  const availWidth = Math.max(160, frameEl.clientWidth);
  const availHeight = Math.min(Math.max(260, window.innerHeight * 0.52), 480);
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
  const scene = videoApplication?.scenes?.find((s) => s.id === selectedSceneId);
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
  try {
    $("sc-preview")?.contentWindow?.__bgmAudio?.pause();
  } catch {
    // Frame loading or cross-origin
  }
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
  // This transport drives the scene by calling only .seek() on its own manual
  // interval below (never the iframe's .play(), which would start that document's
  // own animation loop fighting this frame-stepping) -- so the scene's background
  // music has to be started here directly instead. .seek() already keeps its
  // currentTime in sync (see composeStandaloneHtml's window.seek wrapper), so once
  // started it plays in step with the scene for exactly the scene's own duration,
  // and scTransportStop() (reached at the scene's end or on pause) stops it again.
  try {
    $("sc-preview")?.contentWindow?.__bgmAudio?.play().catch(() => {});
  } catch {
    // Frame loading or cross-origin
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
  renderSceneBackgroundSlot(sceneId);
  renderSlotEditor(spec.specs, spec.values, spec.issues, sceneId);
  renderSegmentsPanel(sceneId, spec.specs, spec.values);
}

let templateBackgrounds = [];

async function ensureTemplateBackgrounds() {
  if (templateBackgrounds.length) return;
  try {
    templateBackgrounds = (await api("/api/videos/template-backgrounds")).backgrounds || [];
  } catch (e) {
    console.error("Failed to load template backgrounds:", e);
  }
}

/** The ref meaning "this application's own template, untouched" -- what every
 *  background control shows selected until something else is chosen. */
function nativeBackgroundRef() {
  return videoApplication?.template ? `template:${videoApplication.template}` : "";
}

/** Thumbnail + dropdown + Upload New Source + Remove, shared by the global
 *  (right) and per-scene (left) background pickers. A ref is either
 *  `template:<id>` (any existing template's own background, listed from the
 *  templates themselves) or the id of an image/SVG the user uploaded. */
function backgroundControl({ selectedRef, badge, canRemove, onChange }) {
  const wrap = document.createElement("div");
  wrap.className = "content-slot-image";

  const tb = templateBackgrounds.find((b) => b.ref === selectedRef);
  const source = !tb && selectedRef ? (videoApplication.sources || []).find((s) => s.id === selectedRef) : null;

  const thumb = document.createElement("div");
  thumb.className = "content-slot-thumb";
  thumb.style.position = "relative";
  if (tb) {
    thumb.style.background = tb.css;
  } else if (source) {
    const img = document.createElement("img");
    img.src = `/api/videos/${videoId}/file?p=${encodeURIComponent(source.file)}`;
    thumb.appendChild(img);
  } else {
    thumb.textContent = "Theme default";
  }
  if (badge) {
    const b = document.createElement("span");
    b.className = "file-card-badge";
    b.style.cssText = "position:absolute; bottom:4px; left:4px; top:auto; right:auto;";
    b.textContent = badge;
    thumb.appendChild(b);
  }
  const thumbCol = document.createElement("div");
  thumbCol.className = "content-slot-thumb-col";
  thumbCol.appendChild(thumb);
  wrap.appendChild(thumbCol);

  const controls = document.createElement("div");
  controls.className = "content-slot-image-controls";

  const select = document.createElement("select");
  select.style.cssText = "width:100%; font-size:0.78rem; margin-bottom:0.35rem;";
  const native = nativeBackgroundRef();
  if (!native) select.appendChild(new Option("Theme default", ""));
  const tGroup = document.createElement("optgroup");
  tGroup.label = "Template backgrounds";
  for (const b of templateBackgrounds) {
    tGroup.appendChild(new Option(b.ref === native ? `${b.name} (this template)` : b.name, b.ref));
  }
  if (tGroup.children.length) select.appendChild(tGroup);
  // Uploads only ever appear here because the user added them.
  const uploads = (videoApplication.sources || []).filter((s) => s.kind !== "video" && s.purpose === "background");
  if (uploads.length) {
    const uGroup = document.createElement("optgroup");
    uGroup.label = "Uploaded";
    for (const s of uploads) uGroup.appendChild(new Option(s.name, s.id));
    select.appendChild(uGroup);
  }
  select.value = selectedRef || "";
  select.onchange = () => onChange(select.value || null);
  controls.appendChild(select);

  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = "image/png,image/jpeg,image/webp,image/gif,image/svg+xml,.svg";
  fileInput.onchange = async () => {
    const file = fileInput.files[0];
    if (!file) return;
    try {
      const uploaded = await uploadFile(`/api/videos/${videoId}/sources?name=${encodeURIComponent(file.name)}&purpose=background`, file);
      videoApplication.sources.push(uploaded);
      onChange(uploaded.id);
    } catch (e) {
      await showAlert("Upload failed: " + e.message);
    }
  };
  controls.appendChild(fileInput);
  controls.appendChild(uploadButton(fileInput));

  if (canRemove) {
    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "secondary small";
    removeBtn.textContent = "Remove";
    removeBtn.onclick = () => onChange(null);
    controls.appendChild(removeBtn);
  }
  wrap.appendChild(controls);
  return wrap;
}

/** Global default background (application.backgroundImage). Null means "each scene
 *  keeps its template's own background", which the dropdown shows as the
 *  current template's entry. */
function renderGlobalBackgroundPanel() {
  const host = $("global-background-panel");
  if (!host || !videoApplication) return;
  host.innerHTML = "";
  const native = nativeBackgroundRef();
  const explicit = videoApplication.backgroundImage || null;
  host.appendChild(backgroundControl({
    selectedRef: explicit || native,
    badge: explicit ? null : "template default",
    canRemove: !!explicit,
    onChange: async (ref) => {
      const value = !ref || ref === native ? null : ref;
      const updated = await api(`/api/videos/${videoId}`, { method: "PUT", body: { backgroundImage: value } });
      videoApplication.backgroundImage = updated.backgroundImage ?? null;
      renderGlobalBackgroundPanel();
      if (selectedSceneId) renderSceneBackgroundSlot(selectedSceneId);
      showScenePreview();
    },
  }));
}

/** Per-scene background override, shown directly above the Screenshot content
 *  slot. Stored in scene.slotValues.background; with no override the scene
 *  shows the global default, else its template's own background. */
function renderSceneBackgroundSlot(sceneId) {
  const host = $("sc-background-panel");
  if (!host || !videoApplication) return;
  host.innerHTML = "";
  const scene = videoApplication.scenes.find((s) => s.id === sceneId);
  if (!scene) return;
  const wrap = document.createElement("div");
  wrap.className = "content-slot";
  const label = document.createElement("label");
  label.textContent = "Background Theme";
  wrap.appendChild(label);
  const value = scene.slotValues?.background;
  const override = value?.kind === "image" ? value.sourceId : null;
  const global = videoApplication.backgroundImage || null;
  wrap.appendChild(backgroundControl({
    selectedRef: override || global || nativeBackgroundRef(),
    badge: null,
    canRemove: !!override,
    onChange: async (ref) => {
      await saveSlotValue(sceneId, "background", { kind: "image", sourceId: ref });
      scene.slotValues = { ...(scene.slotValues || {}), background: { kind: "image", sourceId: ref } };
      renderSceneBackgroundSlot(sceneId);
      showScenePreview();
    },
  }));
  const note = document.createElement("p");
  note.className = "hint";
  note.style.cssText = "margin:.3rem 0 0;";
  note.textContent = override
    ? "Applies to this scene only. Remove it to fall back to the global background."
    : global
      ? "Using the global background. Pick one here to override it for this scene only."
      : "Using the template's own background. Pick one here to override it for this scene only.";
  wrap.appendChild(note);
  host.appendChild(wrap);
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
  const legacyScene = videoApplication?.scenes?.find((s) => s.id === sceneId) || {};
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

  if (screenshotSpec) panel.appendChild(videoSelectBlock(sceneId));
}

const videoDurationCache = new Map();
/** Length in seconds of an uploaded recording, read from its metadata (0 if unreadable). */
function probeVideoDuration(source) {
  if (!videoDurationCache.has(source.id)) {
    videoDurationCache.set(source.id, new Promise((resolve) => {
      const v = document.createElement("video");
      v.preload = "metadata";
      v.onloadedmetadata = () => resolve(Number.isFinite(v.duration) ? v.duration : 0);
      v.onerror = () => resolve(0);
      v.src = `/api/videos/${videoId}/file?p=${encodeURIComponent(source.file)}`;
    }));
  }
  return videoDurationCache.get(source.id);
}

const round1 = (n) => Math.round(n * 10) / 10;

/** "Select Video" control under the screenshot slot(s): pick or upload a recording
 *  that plays after the screenshot has been shown for its hold time. */
function videoSelectBlock(sceneId) {
  const scene = videoApplication.scenes.find((sc) => sc.id === sceneId) || {};
  const row = document.createElement("div");
  row.className = "content-slot";
  const label = document.createElement("label");
  label.textContent = "Select Video";
  row.appendChild(label);

  const select = document.createElement("select");
  populateSourceSelect(select, videoApplication.sources || [], scene.videoSourceId || "", { kind: "video", blankLabel: "No video (static screenshot)" });
  select.onchange = () => setSceneVideo(sceneId, select.value || null);
  row.appendChild(select);

  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = "video/mp4,video/webm";
  fileInput.onchange = async () => {
    const file = fileInput.files[0];
    if (!file) return;
    try {
      const uploaded = await uploadFile(`/api/videos/${videoId}/sources?name=${encodeURIComponent(file.name)}`, file);
      videoApplication.sources.push(uploaded);
      await setSceneVideo(sceneId, uploaded.id);
    } catch (e) {
      await showAlert("Upload failed: " + e.message);
    }
  };
  const btn = uploadButton(fileInput, "Upload New Video");
  btn.style.marginTop = ".35rem";
  row.appendChild(fileInput);
  row.appendChild(btn);
  return row;
}

/** Links (or, with null, unlinks) a recording to a scene and re-derives the scene length. */
async function setSceneVideo(sceneId, sourceId) {
  const scene = videoApplication.scenes.find((sc) => sc.id === sceneId);
  if (!scene) return;
  let patch;
  if (sourceId) {
    const source = videoApplication.sources.find((src) => src.id === sourceId);
    const clip = source ? await probeVideoDuration(source) : 0;
    const hold = scene.screenshotHoldSec ?? 2;
    patch = {
      videoSourceId: sourceId, screenshotHoldSec: hold, videoStartSec: 0, videoEndSec: round1(clip),
      durationSeconds: Math.max(1, round1(hold + clip)),
    };
  } else {
    // null (not undefined) so the server's merge actually clears the field.
    patch = { videoSourceId: null, videoStartSec: null, videoEndSec: null };
  }
  await saveLegacySceneField(sceneId, patch);
  if (sceneId !== selectedSceneId) return;
  const fresh = videoApplication.scenes.find((sc) => sc.id === sceneId);
  if ($("sc-duration") && fresh) $("sc-duration").value = fresh.durationSeconds;
  syncVideoTimingUi(fresh);
  loadSceneContentPanel(sceneId);
}

/** Right-panel timing: video controls only exist while a video is linked, and
 *  then Total Time is derived (hold + clip) and read-only. */
async function syncVideoTimingUi(scene) {
  const box = $("sc-video-timing");
  const total = $("sc-duration");
  if (!box || !total) return;
  const source = scene?.videoSourceId ? (videoApplication.sources || []).find((src) => src.id === scene.videoSourceId && src.kind === "video") : null;
  box.style.display = source ? "" : "none";
  total.readOnly = !!source;
  total.title = source ? "Screenshot time + video clip length (edit those instead)" : "";
  if (!source) return;
  const sourceLen = await probeVideoDuration(source);
  if (selectedSceneId !== scene.id) return;
  const start = scene.videoStartSec ?? 0;
  const end = scene.videoEndSec > start ? scene.videoEndSec : round1(sourceLen);
  $("sc-shot-hold").value = scene.screenshotHoldSec ?? 2;
  $("sc-video-start").value = start;
  $("sc-video-end").value = end;
  for (const id of ["sc-video-start", "sc-video-end"]) $(id).max = sourceLen || "";
  $("sc-video-source-len").textContent = sourceLen ? `Source length ${round1(sourceLen)}s` : "";
  updateVideoTotal();
}

function updateVideoTotal() {
  const hold = Math.max(0, Number($("sc-shot-hold").value) || 0);
  const clip = Math.max(0, (Number($("sc-video-end").value) || 0) - (Number($("sc-video-start").value) || 0));
  $("sc-duration").value = Math.max(1, round1(hold + clip));
  $("sc-video-clip-len").textContent = `Clip ${round1(clip)}s`;
}

function onVideoTimingInput() {
  const startEl = $("sc-video-start"), endEl = $("sc-video-end");
  if (Number(endEl.value) <= Number(startEl.value)) endEl.value = round1(Number(startEl.value) + 0.1);
  updateVideoTotal();
  saveLegacySceneField(selectedSceneId, {
    screenshotHoldSec: Math.max(0, Number($("sc-shot-hold").value) || 0),
    videoStartSec: Number(startEl.value) || 0,
    videoEndSec: Number(endEl.value) || 0,
    durationSeconds: Number($("sc-duration").value),
  });
}

async function saveLegacySceneField(sceneId, patch) {
  clearTimeout(legacyFieldSaveTimer);
  return new Promise((resolve) => {
    legacyFieldSaveTimer = setTimeout(async () => {
      const stateEl = $("sc-content-save-state");
      if (stateEl) stateEl.textContent = "Saving...";
      try {
        const updated = await api(`/api/videos/${videoId}/scenes/${sceneId}`, { method: "PUT", body: patch });
        const idx = videoApplication.scenes.findIndex((s) => s.id === sceneId);
        if (idx !== -1) videoApplication.scenes[idx] = updated;
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
  const source = sourceId ? (videoApplication.sources || []).find((s) => s.id === sourceId) : null;
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
      videoApplication.sources.push(uploaded);
      const legacyScene = videoApplication.scenes.find((s) => s.id === sceneId);
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
  const source = sourceId ? (videoApplication.sources || []).find((s) => s.id === sourceId) : null;
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

  // Reuse a screenshot already captured for this application -- same {device size
  // -> resolution -> screenshot} data (application.video.sources) the Screen
  // Capture tab writes and Studio Mockup's Screenshot Source Mapping reads
  // (see editor.js's populateSourceSelect), so picking here is consistent
  // with both other tabs instead of forcing a fresh upload every time.
  // Excludes background-purpose uploads too -- see backgroundImageControl's
  // matching filter, which excludes screenshots from its own dropdown.
  const sources = (videoApplication.sources || []).filter((src) => src.kind !== "video" && (src.purpose || "screenshot") !== "background");
  if (sources.length > 0) {
    const existingSelect = document.createElement("select");
    existingSelect.style.cssText = "width:100%; font-size:0.78rem; margin-bottom:0.35rem;";
    populateSourceSelect(existingSelect, sources, sourceId || "", { blankLabel: "Reuse existing screenshot…" });
    existingSelect.onchange = async () => {
      const chosenId = existingSelect.value || null;
      if (spec.kind === "imageList") {
        const scene = videoApplication.scenes.find((s) => s.id === sceneId);
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
      videoApplication.sources.push(uploaded);
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
        const scene = videoApplication.scenes.find((s) => s.id === sceneId);
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
  pendingSlotSave = { sceneId, key, value };
  contentSaveTimer = setTimeout(() => { pendingSlotSave = null; saveSlotValue(sceneId, key, value); }, 400);
}

async function saveSlotValue(sceneId, key, value) {
  try {
    await api(`/api/videos/${videoId}/scenes/${sceneId}/slots`, { method: "PUT", body: { slotValues: { [key]: value } } });
    const scene = videoApplication.scenes.find((s) => s.id === sceneId);
    if (scene) scene.slotValues = { ...(scene.slotValues || {}), [key]: value };
    setVideoDirty(true);
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
      const source = seg.sourceId ? (videoApplication.sources || []).find((s) => s.id === seg.sourceId) : null;
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
          videoApplication.sources.push(uploaded);
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
  if (!videoId || !selectedSceneId || !videoApplication) return;
  const selectedDevice = parseDeviceValue($("sc-device")?.value);
  const body = {
    sceneTemplate: $("sc-template")?.value,
    layout: $("sc-layout")?.value || undefined,
    depth: $("sc-depth")?.value || "flat",
    transition: $("sc-transition")?.value || "cut",
    device: selectedDevice.id || undefined,
    // The picked device decides the mode (3D model / 2D frame / CSS rig); only a scene with no device picked falls back.
    deviceMode: selectedDevice.mode ?? (videoApplication.template ? sceneDeviceMode(videoApplication.scenes.find((s) => s.id === selectedSceneId)) : (videoSceneOptions.animations.find((a) => a.id === $("sc-template")?.value)?.deviceMode ?? "3D")),
    // null (not undefined) so switching device really clears the previous device's variant on the server.
    variant: $("sc-variant")?.value || null,
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
  const idx = videoApplication.scenes.findIndex((s) => s.id === selectedSceneId);
  if (idx !== -1) videoApplication.scenes[idx] = updated;
  setVideoDirty(true);
  showScenePreview();
}

// ---- Template ownership rules (Video) ----
// Editing snapshot: the working document `application.video` (what every scene/slot edit endpoint mutates and what
// previews render). `videoApplication` mirrors it and is only updated after a successful server write. It is a separate
// store from Saved Templates (`application.video.savedConfigs`) and Default Templates (`templates/video/*.html`);
// scene/slot edits never touch either. Every action below flushes pending edits, then POSTS the snapshot explicitly:
//   Save                        -> {scenes,template,bgm*} to configs (mode "update", configId = loaded SAVED template)
//   Save As                     -> same payload to configs (mode "new")
//   Update Template: Update     -> {templateId = loaded DEFAULT template, scenes} to update-template
//   Update Template: Create New -> {baseTemplateId, name, description, scenes} to create-template
/** What the editor currently holds: {source:"default"|"saved", id, name, sourceTemplateId?}; in-memory only. */
let videoLoadedTemplate = null;
let videoIsDirty = false;
let pendingSlotSave = null;

function setVideoLoaded(v) {
  videoLoadedTemplate = v || null;
  setVideoDirty(false);
  setEditingEmpty("video-section-scene-editing", !videoLoadedTemplate);
}

export function hasUnsavedVideoDraft() {
  return !!(videoLoadedTemplate && videoIsDirty);
}

/** Drops the whole editing draft and its identity. The next Editing session starts empty. */
export function clearVideoDraft() {
  if (videoId && videoLoadedTemplate) api(`/api/videos/${videoId}/draft`, { method: "DELETE" }).catch(() => {});
  clearTimeout(contentSaveTimer);
  pendingSlotSave = null;
  setVideoLoaded(null);
  setSelectedSceneId(null);
  if (videoApplication) setVideoApplication({ ...videoApplication, template: null, scenes: [] });
}

/** Before leaving the editing context (tab/application switch): Save / Discard / Cancel. Resolves false on cancel. */
export async function guardLeaveVideoDraft() {
  if (!hasUnsavedVideoDraft()) return true;
  const choice = await showUnsavedDialog("You have unsaved changes. Do you want to save them before leaving?");
  if (choice === "cancel") return false;
  if (choice === "save") return handleVideoSave();
  return true;
}

export function setVideoDirty(v) {
  videoIsDirty = !!v;
  const badge = $("video-dirty-badge");
  if (badge) badge.style.display = videoIsDirty ? "inline-block" : "none";
}

async function flushPendingEdits() {
  if (!pendingSlotSave) return;
  clearTimeout(contentSaveTimer);
  const { sceneId, key, value } = pendingSlotSave;
  pendingSlotSave = null;
  await saveSlotValue(sceneId, key, value);
}

async function confirmDiscardVideoDraft() {
  if (!hasUnsavedVideoDraft()) return true;
  const choice = await showUnsavedDialog(
    "You have unsaved changes in the current template. Do you want to save them before loading another template?",
    "Save & Load New Template",
    "Discard & Load New Template",
  );
  if (choice === "cancel") return false;
  if (choice === "save") return handleVideoSave();
  return true;
}

function videoDraftSnapshot() {
  const p = videoApplication;
  return JSON.parse(JSON.stringify({
    template: p.template,
    scenes: p.scenes,
    bgm: p.bgm,
    bgmVolume: p.bgmVolume,
    bgmFadeInMs: p.bgmFadeInMs,
    bgmFadeOutMs: p.bgmFadeOutMs,
    backgroundImage: p.backgroundImage ?? null,
    brand: p.brand,
  }));
}

function requireVideoDraft() {
  if (!videoId || !videoLoadedTemplate || !videoApplication || !videoApplication.template || !videoApplication.scenes?.length) {
    showAlert("Please load a template before saving.");
    return false;
  }
  return true;
}

async function handleVideoSave() {
  if (!requireVideoDraft()) return false;
  const cur = videoLoadedTemplate;
  if (cur?.source !== "saved") return handleVideoSaveAs(true);
  try {
    await flushPendingEdits();
    savedConfigsCache = await api(`/api/videos/${videoId}/configs`, {
      method: "POST",
      body: { name: cur.name, mode: "update", configId: cur.id, snapshot: videoDraftSnapshot() },
    });
    setVideoDirty(false);
    renderSavedConfigsGrid();
    showToast(`Saved template "${cur.name}" updated.`, "success");
    return true;
  } catch (e) {
    await showAlert("Save failed: " + e.message);
    return false;
  }
}

async function handleVideoSaveAs(fromDefaultSave = false) {
  if (!requireVideoDraft()) return false;
  try {
    if (!savedConfigsCache.length) savedConfigsCache = await api(`/api/videos/${videoId}/configs`);
  } catch (_) {}
  const cur = videoLoadedTemplate;
  const base = cur?.name || templateLabel(videoApplication.template);
  const taken = new Set(savedConfigsCache.map((c) => c.name.toLowerCase()));
  let suggested = `${base} - My Version`;
  for (let n = 2; taken.has(suggested.toLowerCase()); n++) suggested = `${base} - My Version ${n}`;
  const name = await showSaveAsDialog({
    suggestedName: suggested,
    existingNames: savedConfigsCache.map((c) => c.name),
    note: fromDefaultSave
      ? "You are editing a default template. Saving stores a copy in this application's Saved Templates; the default is not changed."
      : "Creates a new template in this application's Saved Templates.",
  });
  if (!name) return false;
  try {
    await flushPendingEdits();
    const before = new Set(savedConfigsCache.map((c) => c.id));
    savedConfigsCache = await api(`/api/videos/${videoId}/configs`, { method: "POST", body: { name, mode: "new", snapshot: videoDraftSnapshot() } });
    const created = savedConfigsCache.find((c) => !before.has(c.id));
    videoLoadedTemplate = { source: "saved", id: created?.id, name, sourceTemplateId: videoApplication.template };
    setVideoDirty(false);
    renderSavedConfigsGrid();
    showToast(`Saved as new template "${name}".`, "success");
    return true;
  } catch (e) {
    await showAlert("Save failed: " + e.message);
    return false;
  }
}

async function handleVideoUpdateTemplate() {
  if (!requireVideoDraft()) return;
  await ensureVideoTemplates();
  const cur = videoLoadedTemplate;
  const loadedDefault = cur?.source === "default" && videoTemplates.some((t) => t.id === cur.id) ? cur : null;
  const choice = await showUpdateTemplateDialog({
    loaded: loadedDefault,
    existingNames: videoTemplates.map((t) => t.name),
    suggestedName: loadedDefault ? `${loadedDefault.name} - Copy` : "",
  });
  if (!choice) return;
  try {
    await flushPendingEdits();
    const scenes = videoDraftSnapshot().scenes;
    if (choice.action === "update") {
      // Target is always the loaded default's own id; there is no way to pick a different one here.
      await api(`/api/videos/${videoId}/update-template`, { method: "POST", body: { templateId: loadedDefault.id, scenes } });
      showToast(`Default template "${loadedDefault.name}" updated.`, "success");
    } else {
      const res = await api(`/api/videos/${videoId}/create-template`, {
        method: "POST",
        body: { baseTemplateId: videoApplication.template, name: choice.name, description: choice.description, scenes },
      });
      videoLoadedTemplate = { source: "default", id: res.templateId, name: res.name };
      showToast(`New default template "${res.name}" created.`, "success");
    }
    setVideoDirty(false);
    setVideoTemplates([]);
    await ensureVideoTemplates();
    await renderVideoTemplateGrid();
  } catch (e) {
    await showAlert("Update Template failed: " + e.message);
  }
}

export async function loadSavedConfigs() {
  const grid = $("saved-configs-grid");
  if (!grid) return;
  if (!videoId) {
    grid.innerHTML = '<div class="hint">No application loaded.</div>';
    return;
  }
  grid.innerHTML = '<div class="hint">Loading saved templates...</div>';
  try {
    savedConfigsCache = await api(`/api/videos/${videoId}/configs`);
    renderSavedConfigsGrid();
  } catch (e) {
    grid.innerHTML = `<div class="hint slot-issue error">Failed to load saved templates: ${e.message}</div>`;
  }
}

export function renderSavedConfigsGrid() {
  const grid = $("saved-configs-grid");
  if (!grid) return;
  if (savedConfigsCache.length === 0) {
    grid.innerHTML = '<div class="hint">No saved templates yet. Use "Save Template" in the Editing section.</div>';
    return;
  }

  grid.innerHTML = savedConfigsCache.map((c) => {
    const displayName = savedTemplateDisplayName(c);
    const firstScene = c.scenes[0] || {};
    const aspect = firstScene.aspectRatio === "16:9" ? "16:9" : "9:16";
    const isPortrait = aspect === "9:16";
    const previewUrl = `/api/videos/${videoId}/configs/${c.id}/preview`;
    const devicesUsed = [...new Set(c.scenes.map((s) => s.device || "default"))].join(", ");
    const totalSec = c.scenes.reduce((sum, s) => sum + Math.max(1, s.durationSeconds || 5), 0);
    const durationLabel = `${Math.floor(totalSec / 60)}:${String(Math.round(totalSec % 60)).padStart(2, "0")}`;
    // A saved config is a snapshot -- editing the live application's scenes afterward
    // (e.g. trimming a scene's duration) does not change what's already saved,
    // so this render/export still uses the durations as of savedAt. Surfacing
    // the total here is the visible cue to re-save if that's since gone stale.
    const savedAtLabel = c.savedAt ? new Date(c.savedAt).toLocaleString() : "";

    return `
      <div class="saved-template-card card" data-config-id="${c.id}">
        <!-- Top: Template Name & Badges (Centered) -->
        <div class="saved-template-card-header">
          <h3 class="saved-template-card-title">${displayName}</h3>
          <div class="saved-template-card-badges">
            <span class="saved-template-badge aspect">${aspect}</span>
            <span class="saved-template-badge scene-count">${c.scenes.length} Scenes</span>
            <span class="saved-template-badge" title="Total duration as saved${savedAtLabel ? ` (saved ${savedAtLabel})` : ""} -- re-save this template after editing scene durations to update it">⏱ ${durationLabel}</span>
          </div>
        </div>

        <!-- Middle: Single Live Video Player -->
        <div class="saved-template-preview-wrapper ${isPortrait ? "portrait" : "landscape"}">
          <iframe class="saved-template-preview-iframe"
                  id="saved-template-iframe-${c.id}"
                  src="${previewUrl}?t=${Date.now()}"
                  title="Preview ${displayName}"></iframe>
        </div>

        <!-- Action Buttons (Centered) -->
        <div class="saved-template-card-actions">
          <button class="icon-btn small secondary" data-act="preview-config" data-id="${c.id}" title="Play / Pause Preview">
            <span class="ico">&#9654;</span>
          </button>
          <button class="icon-btn small secondary" data-act="reedit-config" data-id="${c.id}" title="Reuse & Re-edit">
            <span class="ico">&#9998;</span>
          </button>
          <button class="icon-btn small secondary" data-act="export-config" data-id="${c.id}" title="Render / Export Video">
            <span class="ico">&#128229;</span>
          </button>
          <button class="icon-btn small secondary danger" data-act="delete-config" data-id="${c.id}" title="Delete Saved Template">
            <span class="ico">&#128465;</span>
          </button>
        </div>

        <!-- Bottom: Metadata Footer (Single line, horizontally centered) -->
        <div class="saved-template-card-footer">
          📱 ${devicesUsed} &nbsp;&middot;&nbsp; Saved ${new Date(c.savedAt).toLocaleDateString()}
        </div>
      </div>
    `;
  }).join("");

  // Template pages are fixed-size canvases (1920x1080 / 1080x1920): scale them to the card.
  const fitSavedPreview = (wrap) => {
    const f = wrap.querySelector("iframe");
    if (f) f.style.transform = `scale(${wrap.clientWidth / f.offsetWidth})`;
  };
  const ro = new ResizeObserver((entries) => entries.forEach((e) => fitSavedPreview(e.target)));
  grid.querySelectorAll(".saved-template-preview-wrapper").forEach((w) => { fitSavedPreview(w); ro.observe(w); });

  // Action button handlers
  // Card frames are still thumbnails: park each on a frame past the opening fade so it shows content.
  grid.querySelectorAll(".saved-template-preview-iframe").forEach((f) => {
    const park = () => {
      try {
        const w = f.contentWindow;
        const total = w.__videoPreview?.totalDuration || 3000;
        if (typeof w.seek === "function") w.seek(Math.min(1500, total / 2));
      } catch (_) {}
    };
    f.addEventListener("load", park);
    park();
  });

  grid.querySelectorAll('[data-act="preview-config"]').forEach((btn) => {
    btn.onclick = () => {
      const cfg = savedConfigsCache.find((c) => c.id === btn.dataset.id);
      if (cfg) openSavedTemplatePlayer(cfg);
    };
  });

  grid.querySelectorAll('[data-act="reedit-config"]').forEach((btn) => {
    btn.onclick = async () => {
      const id = btn.dataset.id;
      const cfg = savedConfigsCache.find((c) => c.id === id);
      const name = cfg?.name || "this saved template";
      if (!(await confirmDiscardVideoDraft())) return;

      const originalHtml = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = `<span class="ico animate-spin">&#8635;</span>`;

      try {
        const updated = await api(`/api/videos/${videoId}/configs/${id}/apply`, { method: "POST" });
        setVideoApplication(updated);
        setVideoLoaded({ source: "saved", id, name: cfg?.name || name, sourceTemplateId: cfg?.template });
        renderVideoScenes();
        if (updated.scenes?.length) {
          selectScene(updated.scenes[0].id);
        }
        showToast(`Template "${name}" loaded into Editing section.`, "success");
        const editingTab = document.querySelector('#tab-video .rail-btn[data-section="scene-editing"]');
        if (editingTab) editingTab.click();
      } catch (e) {
        await showAlert("Could not apply saved template: " + e.message);
      } finally {
        btn.disabled = false;
        btn.innerHTML = originalHtml;
      }
    };
  });

  grid.querySelectorAll('[data-act="export-config"], [data-act="render-config"]').forEach((btn) => {
    btn.onclick = async () => {
      const id = btn.dataset.id;
      const cfg = savedConfigsCache.find((c) => c.id === id);
      if (!cfg) return;

      openExportModal({
        title: "Export Template Video",
        subject: `Saved Template: ${savedTemplateDisplayName(cfg)}`,
        startUrl: `/api/videos/${videoId}/configs/${id}/render`,
        application: cfg,
        configId: id,
        defaultFileName: (cfg.name || "template-export").toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      });
    };
  });

  grid.querySelectorAll('[data-act="delete-config"]').forEach((btn) => {
    btn.onclick = async () => {
      const id = btn.dataset.id;
      const cfg = savedConfigsCache.find((c) => c.id === id);
      const name = cfg?.name || "this saved template";
      const ok = await showConfirm(`Delete "${name}"? This action cannot be undone.`);
      if (!ok) return;

      const originalHtml = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = `<span class="ico animate-spin">&#8635;</span>`;

      try {
        savedConfigsCache = await api(`/api/videos/${videoId}/configs/${id}`, { method: "DELETE" });
        if (videoApplication) videoApplication.savedConfigs = savedConfigsCache;
        renderSavedConfigsGrid();
        showToast(`Saved template "${name}" deleted.`, "success");
      } catch (e) {
        btn.disabled = false;
        btn.innerHTML = originalHtml;
        await showAlert("Could not delete saved template: " + e.message);
      }
    };
  });
}

// Wire scene transport and event handlers
(function initVideoStaticListeners() {
  if (typeof window === "undefined") return;

  window.addEventListener("resize", () => updateScenePreviewScale());
  const previewFrame = document.querySelector(".preview-frame");
  if (previewFrame && typeof ResizeObserver !== "undefined") {
    new ResizeObserver(() => updateScenePreviewScale()).observe(previewFrame);
  }

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
    scDevice.onchange = async () => {
      updateVariantSelect("sc-device", "sc-variant", "", videoDevices);
      await applySelectedSceneDevice();
    };
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
      loopBtn.classList.toggle("active", scTransport.loop);
      loopBtn.setAttribute("aria-pressed", scTransport.loop ? "true" : "false");
    };
  }

  const muteBtn = $("sc-tr-mute");
  if (muteBtn) {
    muteBtn.onclick = () => {
      scTransport.muted = !scTransport.muted;
      muteBtn.innerHTML = scTransport.muted ? (ICONS.volumeMute || "") : (ICONS.volumeHigh || "");
      muteBtn.classList.toggle("active", scTransport.muted);
      muteBtn.setAttribute("aria-pressed", scTransport.muted ? "true" : "false");
      muteBtn.title = scTransport.muted ? "Unmute" : "Mute";
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

  for (const id of ["sc-shot-hold", "sc-video-start", "sc-video-end"]) {
    const el = $(id);
    if (el) el.oninput = onVideoTimingInput;
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
        videoApplication.sources = videoApplication.sources || [];
        videoApplication.sources.push(uploaded);
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
        videoApplication.sources = videoApplication.sources || [];
        videoApplication.sources.push(uploaded);
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
      if (!videoId || !videoApplication || videoApplication.scenes.length === 0) {
        await showAlert("Load a template first.");
        return;
      }
      try {
        const updated = await api(`/api/videos/${videoId}/scenes`, { method: "POST" });
        setVideoApplication(updated);
        setVideoDirty(true);
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
      if (!selectedSceneId || !videoApplication) return;
      const ok = await showConfirm("Remove this scene? This cannot be undone.");
      if (!ok) return;
      try {
        const updated = await api(`/api/videos/${videoId}/scenes/${selectedSceneId}`, { method: "DELETE" });
        setVideoApplication(updated);
        setVideoDirty(true);
        renderVideoScenes();
      } catch (e) {
        await showAlert("Could not remove scene: " + e.message);
      }
    };
  }

  if ($("video-save-btn")) $("video-save-btn").onclick = () => handleVideoSave();
  if ($("video-save-as-btn")) $("video-save-as-btn").onclick = () => handleVideoSaveAs();
  if ($("video-update-template-btn")) $("video-update-template-btn").onclick = () => handleVideoUpdateTemplate();

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
    videoRenderBtn.onclick = () => {
      if (!videoId || !videoApplication) {
        showAlert("Please select an application first.");
        return;
      }
      openExportModal({
        title: "Export Video",
        subject: videoApplication.name || "Video Application",
        startUrl: `/api/videos/${videoId}/render`,
        application: videoApplication,
        defaultFileName: (videoApplication.name || "video-export").toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      });
    };
  }
  refreshRecentExportsList();
})();


/** Blurred-backdrop popup that plays a saved template scaled to fit the viewport,
 *  with an optional true-fullscreen toggle. */
function openSavedTemplatePlayer(cfg) {
  const landscape = (cfg.scenes[0] || {}).aspectRatio === "16:9";
  const W = landscape ? 1920 : 1080, H = landscape ? 1080 : 1920;
  const overlay = document.createElement("div");
  overlay.className = "saved-player-overlay";
  overlay.innerHTML = `
    <div class="saved-player-box">
      <div class="saved-player-bar">
        <span>${savedTemplateDisplayName(cfg)}</span>
        <button class="icon-btn small secondary" data-sp="fs" title="Fullscreen">&#x26F6;</button>
        <button class="icon-btn small secondary" data-sp="close" title="Close">&#10005;</button>
      </div>
      <div class="saved-player-stage">
        <iframe src="/api/videos/${videoId}/configs/${cfg.id}/preview?t=${Date.now()}" style="width:${W}px;height:${H}px" title="Saved template player"></iframe>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const stage = overlay.querySelector(".saved-player-stage");
  const frame = overlay.querySelector("iframe");

  const fit = () => {
    const full = document.fullscreenElement === stage;
    const maxW = full ? innerWidth : innerWidth * 0.9, maxH = full ? innerHeight : innerHeight * 0.82;
    const k = Math.min(maxW / W, maxH / H);
    stage.style.width = `${W * k}px`;
    stage.style.height = `${H * k}px`;
    frame.style.transform = `scale(${k})`;
    // The browser forces a fullscreen element to fill the screen, so centre the frame inside it.
    frame.style.left = full ? `${(innerWidth - W * k) / 2}px` : "0";
    frame.style.top = full ? `${(innerHeight - H * k) / 2}px` : "0";
  };
  fit();
  addEventListener("resize", fit);
  document.addEventListener("fullscreenchange", fit);

  const close = () => {
    try { frame.contentWindow.__videoPreview?.pause(); } catch (_) {}
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    removeEventListener("resize", fit);
    document.removeEventListener("fullscreenchange", fit);
    removeEventListener("keydown", onKey);
    overlay.remove();
  };
  const onKey = (e) => { if (e.key === "Escape" && !document.fullscreenElement) close(); };
  addEventListener("keydown", onKey);

  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
  overlay.querySelector('[data-sp="close"]').onclick = close;
  overlay.querySelector('[data-sp="fs"]').onclick = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else stage.requestFullscreen?.().catch(() => {});
  };
  frame.addEventListener("load", () => {
    try { frame.contentWindow.__videoPreview?.replay?.() ?? frame.contentWindow.__videoPreview?.play(); } catch (_) {}
  });
}

/** Human name of a template id ("galaxy-s25-landscape" -> its catalog name, else the id). */
function templateLabel(id) {
  return videoTemplates.find((t) => t.id === id)?.name || id || "Template";
}

/** Card/popup title. Bare numbers ("1") and blank names from older saves read as "<Template name> - N". */
function savedTemplateDisplayName(cfg) {
  const name = (cfg.name || "").trim();
  const base = templateLabel(cfg.template);
  if (!name) return `${base} - ${savedConfigsCache.indexOf(cfg) + 1}`;
  if (/^\d+$/.test(name)) return `${base} - ${name}`;
  return name;
}

let currentExportJobId = null;
let currentExportPollTimer = null;
let exportModalLocked = false;
let exportModalStartTime = 0;

// A chosen save folder must survive a page reload/new application ("remember this
// location by default for future rendering sessions"), and Electron paths are
// plain strings (localStorage is enough) while the browser's File System Access
// API hands back a FileSystemDirectoryHandle, which only IndexedDB can store.
const SAVE_DIR_DB = "sag-export-dir";
const SAVE_DIR_STORE = "handles";
function saveDirDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(SAVE_DIR_DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(SAVE_DIR_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function getSavedDirHandle() {
  try {
    const db = await saveDirDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(SAVE_DIR_STORE, "readonly").objectStore(SAVE_DIR_STORE).get("dir");
      tx.onsuccess = () => resolve(tx.result || null);
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    return null;
  }
}
async function setSavedDirHandle(handle) {
  try {
    const db = await saveDirDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(SAVE_DIR_STORE, "readwrite").objectStore(SAVE_DIR_STORE).put(handle, "dir");
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Not fatal -- the handle just won't be remembered next session.
  }
}

export function openExportModal({ title, subject, startUrl, application, configId, defaultFileName }) {
  const backdrop = $("export-video-backdrop");
  const modal = backdrop?.querySelector(".export-modal");
  if (!backdrop || !modal) return;

  const isElectron = !!(window.electronNative && window.electronNative.isElectron);

  // Set titles
  if ($("export-modal-title")) $("export-modal-title").textContent = title || "Export Video";
  if ($("export-modal-subject")) $("export-modal-subject").textContent = subject || "Application Export";

  // Pre-fill filename
  const filenameInput = $("export-filename-input");
  const initialName = defaultFileName || (application?.name || "video-export").toLowerCase().replace(/[^a-z0-9]+/g, "-");
  if (filenameInput) filenameInput.value = initialName;

  // Save location -- required before Start is enabled, remembered across sessions.
  // Electron: a real OS folder path (IPC dialog, saved to localStorage), and the
  // server writes the finished render there directly via `saveTo`. Plain browser:
  // no server-writable path exists, so a FileSystemDirectoryHandle (File System
  // Access API, Chromium-based browsers) is what's remembered (IndexedDB, handles
  // aren't string-serializable), and the finished file is written into it client
  // side once the render completes -- see the `job.state === "done"` branch below.
  const saveToInput = $("export-saveto-input");
  const saveToHint = $("export-saveto-hint");
  const saveToClear = $("export-saveto-clear");
  const hasFsAccess = typeof window.showDirectoryPicker === "function";
  let chosenFolderPath = isElectron ? localStorage.getItem("videoExportFolder") || "" : "";
  let chosenDirHandle = null;

  const currentFileName = () => {
    const fmt = getSelectedFormat();
    return (filenameInput?.value.trim() || initialName) + "." + (fmt === "webm" ? "webm" : "mp4");
  };

  function refreshSaveToUi() {
    const has = isElectron ? !!chosenFolderPath : !!chosenDirHandle;
    if (saveToInput) saveToInput.value = isElectron ? chosenFolderPath : chosenDirHandle ? `📁 ${chosenDirHandle.name}` : "";
    if (saveToHint) saveToHint.style.display = has ? "none" : "block";
    if (saveToClear) saveToClear.style.display = has ? "inline-block" : "none";
    if (startBtn) startBtn.disabled = !has;
    return has;
  }

  if (!isElectron && hasFsAccess) {
    getSavedDirHandle().then(async (handle) => {
      if (!handle) return refreshSaveToUi();
      try {
        // A stored handle's permission doesn't survive every browser restart --
        // re-querying (not re-requesting, that needs a user gesture) tells us
        // whether it's still usable without forcing a re-pick every time.
        if ((await handle.queryPermission({ mode: "readwrite" })) === "granted") {
          chosenDirHandle = handle;
        }
      } catch {}
      refreshSaveToUi();
    });
  } else if (!isElectron && !hasFsAccess && saveToHint) {
    saveToHint.textContent = "This browser can't remember a save folder -- Download will ask where to save each time.";
  }

  const saveToBtn = $("export-saveto-btn");
  if (saveToBtn) {
    saveToBtn.onclick = async () => {
      if (isElectron) {
        try {
          const selected = await window.electronNative.invoke("choose-save-folder");
          if (selected) {
            chosenFolderPath = selected;
            localStorage.setItem("videoExportFolder", selected);
          }
        } catch (err) {
          console.error("Failed to pick save folder:", err);
        }
      } else if (hasFsAccess) {
        try {
          const handle = await window.showDirectoryPicker({ mode: "readwrite" });
          chosenDirHandle = handle;
          await setSavedDirHandle(handle);
        } catch (err) {
          if (err?.name !== "AbortError") console.error("Failed to pick save folder:", err);
        }
      } else {
        showAlert("This browser doesn't support choosing a save folder. Downloads will use your browser's own save location.");
      }
      refreshSaveToUi();
    };
  }
  if (saveToClear) {
    saveToClear.onclick = () => {
      chosenFolderPath = "";
      chosenDirHandle = null;
      if (isElectron) localStorage.removeItem("videoExportFolder");
      else setSavedDirHandle(null);
      refreshSaveToUi();
    };
  }

  /** Writes a Blob into the chosen browser folder -- the completion handler and
   *  the Download button's "save a copy here" both funnel through this. */
  async function writeBlobToChosenDir(blob, name) {
    const fileHandle = await chosenDirHandle.getFileHandle(name, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(blob);
    await writable.close();
  }

  // Populate presets chips
  let selectedPreset = "app-store";
  const presetChips = $("export-preset-chips");
  const formatSegs = $("export-format-segmented");
  const resGrid = $("export-res-grid");
  const customResBox = $("export-custom-res-box");
  const customW = $("export-custom-w");
  const customH = $("export-custom-h");
  const orientationSelect = $("export-orientation-select");
  const fpsSelect = $("export-fps-select");
  const qualitySelect = $("export-quality-select");
  const audioToggle = $("export-audio-toggle");
  const audioVolume = $("export-audio-volume");
  const audioVolumeLabel = $("export-audio-volume-label");
  const rangeModeSelect = $("export-range-mode");
  const rangeInputs = $("export-range-inputs");
  const rangeFrom = $("export-range-from");
  const rangeTo = $("export-range-to");

  const scenes = application?.scenes || [];
  const sceneCount = scenes.length || 1;

  if (rangeFrom) { rangeFrom.max = sceneCount; rangeFrom.value = 1; }
  if (rangeTo) { rangeTo.max = sceneCount; rangeTo.value = sceneCount; }

  const updateSummary = () => {
    const fmt = getSelectedFormat();
    const extBadge = $("export-ext-badge");
    if (extBadge) extBadge.textContent = "." + fmt;

    const resCard = resGrid?.querySelector(".export-option-card.active")?.dataset.res || "native";
    let resText = "Native";
    if (resCard === "custom") {
      const w = parseInt(customW?.value || "1080", 10);
      const h = parseInt(customH?.value || "1920", 10);
      resText = `${w} × ${h}`;
    } else if (resCard === "1080") {
      resText = "1080p FHD";
    } else if (resCard === "720") {
      resText = "720p HD";
    } else {
      resText = "Native";
    }

    const ori = orientationSelect?.value || "native";
    const fps = fpsSelect?.value || "30";
    const qual = qualitySelect?.value || "standard";
    const audioOn = audioToggle ? audioToggle.checked : true;
    const vol = audioVolume ? Math.round(parseFloat(audioVolume.value) * 100) : 35;

    let rangeText = `${sceneCount} scene${sceneCount === 1 ? "" : "s"}`;
    let selDuration = scenes.reduce((sum, s) => sum + Math.max(1, s.durationSeconds || 5), 0);
    if (rangeModeSelect?.value === "range") {
      const f = Math.max(1, parseInt(rangeFrom?.value || "1", 10));
      const t = Math.min(sceneCount, parseInt(rangeTo?.value || String(sceneCount), 10));
      const rangeScenes = scenes.slice(f - 1, t);
      selDuration = rangeScenes.reduce((sum, s) => sum + Math.max(1, s.durationSeconds || 5), 0);
      rangeText = `Scenes ${f}–${t} (${rangeScenes.length})`;
    }

    const durationMinSec = `${Math.floor(selDuration / 60)}:${String(Math.floor(selDuration % 60)).padStart(2, "0")}`;
    const summaryText = `${fmt.toUpperCase()} · ${resText} · ${ori} · ${fps} fps · ${rangeText} (~${durationMinSec}) · ${qual} · Audio: ${audioOn ? `${vol}%` : "Off"}`;
    if ($("export-summary-text")) $("export-summary-text").textContent = summaryText;
  };

  function getSelectedFormat() {
    return formatSegs?.querySelector(".export-segment.active")?.dataset.value || "mp4";
  }

  // Shows which GPU/CPU will actually do the encoding for the currently selected
  // format -- not a forced choice, just what renderVideo's own hardware probe
  // (NVENC -> QSV -> libx264) finds, mirrored via /api/render-hardware. WebM has
  // no hardware path here (always software libvpx-vp9), so that one resolves
  // instantly with no probe; MP4 probes real hardware, which the server caches
  // after its first call.
  let hardwareReqId = 0;
  async function refreshHardwareBox() {
    const box = $("export-hardware-box");
    const text = $("export-hardware-text");
    if (!box) return;
    const fmt = getSelectedFormat();
    const reqId = ++hardwareReqId;
    box.classList.remove("gpu", "error");
    if (text) text.textContent = "Detecting...";
    try {
      const res = await fetch(`/api/render-hardware?format=${fmt}`);
      if (reqId !== hardwareReqId) return; // format changed again before this resolved
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Detection failed");
      box.classList.toggle("gpu", data.accelerator === "GPU");
      if (text) text.textContent = `${data.accelerator} — ${data.encoder}`;
    } catch (e) {
      if (reqId !== hardwareReqId) return;
      box.classList.add("error");
      if (text) text.textContent = "Could not detect (will fall back to CPU)";
    }
  }

  function applyPreset(presetId) {
    selectedPreset = presetId;
    presetChips?.querySelectorAll(".export-chip").forEach((chip) => {
      chip.classList.toggle("active", chip.dataset.preset === presetId);
    });

    if (presetId === "app-store") {
      setFormat("mp4");
      setResolution("native");
      if (orientationSelect) orientationSelect.value = "native";
      if (fpsSelect) fpsSelect.value = "30";
      if (qualitySelect) qualitySelect.value = "high";
    } else if (presetId === "social-square") {
      setFormat("mp4");
      setResolution("1080");
      if (orientationSelect) orientationSelect.value = "square";
      if (fpsSelect) fpsSelect.value = "30";
      if (qualitySelect) qualitySelect.value = "high";
    } else if (presetId === "web-720") {
      setFormat("webm");
      setResolution("720");
      if (orientationSelect) orientationSelect.value = "native";
      if (fpsSelect) fpsSelect.value = "30";
      if (qualitySelect) qualitySelect.value = "standard";
    } else if (presetId === "youtube-1080") {
      setFormat("mp4");
      setResolution("1080");
      if (orientationSelect) orientationSelect.value = "landscape";
      if (fpsSelect) fpsSelect.value = "30";
      if (qualitySelect) qualitySelect.value = "high";
    }
    updateSummary();
  }

  function markCustomPreset() {
    selectedPreset = "custom";
    presetChips?.querySelectorAll(".export-chip").forEach((chip) => {
      chip.classList.toggle("active", chip.dataset.preset === "custom");
    });
    updateSummary();
  }

  function setFormat(fmt) {
    formatSegs?.querySelectorAll(".export-segment").forEach((seg) => {
      seg.classList.toggle("active", seg.dataset.value === fmt);
    });
  }

  function setResolution(res) {
    resGrid?.querySelectorAll(".export-option-card").forEach((card) => {
      card.classList.toggle("active", card.dataset.res === res);
    });
    if (customResBox) customResBox.style.display = res === "custom" ? "flex" : "none";
  }

  presetChips?.querySelectorAll(".export-chip").forEach((chip) => {
    chip.onclick = () => applyPreset(chip.dataset.preset);
  });

  formatSegs?.querySelectorAll(".export-segment").forEach((seg) => {
    seg.onclick = () => {
      setFormat(seg.dataset.value);
      markCustomPreset();
      refreshHardwareBox();
    };
  });

  resGrid?.querySelectorAll(".export-option-card").forEach((card) => {
    card.onclick = () => {
      setResolution(card.dataset.res);
      markCustomPreset();
    };
  });

  if (customW) customW.oninput = markCustomPreset;
  if (customH) customH.oninput = markCustomPreset;
  if (orientationSelect) orientationSelect.onchange = markCustomPreset;
  if (fpsSelect) fpsSelect.onchange = markCustomPreset;
  if (qualitySelect) qualitySelect.onchange = markCustomPreset;
  if (audioToggle) audioToggle.onchange = markCustomPreset;
  if (audioVolume) {
    audioVolume.oninput = () => {
      if (audioVolumeLabel) audioVolumeLabel.textContent = Math.round(parseFloat(audioVolume.value) * 100) + "%";
      markCustomPreset();
    };
  }

  if (rangeModeSelect) {
    rangeModeSelect.onchange = () => {
      const isRange = rangeModeSelect.value === "range";
      if (rangeInputs) rangeInputs.style.display = isRange ? "flex" : "none";
      markCustomPreset();
    };
  }
  if (rangeFrom) rangeFrom.oninput = markCustomPreset;
  if (rangeTo) rangeTo.oninput = markCustomPreset;

  setModalState("config");
  applyPreset("app-store");
  refreshHardwareBox();
  backdrop.style.display = "flex";
  backdrop.classList.add("open");
  exportModalLocked = false;

  const onKeyDown = (e) => {
    if (e.key === "Escape") {
      if (exportModalLocked) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      tryClose();
    }
  };
  document.addEventListener("keydown", onKeyDown, true);

  const tryClose = () => {
    if (exportModalLocked) return;
    if (currentExportPollTimer) clearInterval(currentExportPollTimer);
    currentExportPollTimer = null;
    backdrop.style.display = "none";
    backdrop.classList.remove("open");
    document.removeEventListener("keydown", onKeyDown, true);
  };

  const closeBtn = $("export-modal-close");
  if (closeBtn) closeBtn.onclick = tryClose;
  const cancelConfigBtn = $("export-btn-cancel-config");
  if (cancelConfigBtn) cancelConfigBtn.onclick = tryClose;
  const closeCompleteBtn = $("export-btn-close-complete");
  if (closeCompleteBtn) closeCompleteBtn.onclick = tryClose;
  const closeErrorBtn = $("export-btn-close-error");
  if (closeErrorBtn) closeErrorBtn.onclick = tryClose;

  backdrop.onclick = (e) => {
    if (e.target === backdrop) tryClose();
  };

  const startBtn = $("export-btn-start");
  if (startBtn) {
    startBtn.onclick = async () => {
      if (exportModalLocked) return;
      if (!refreshSaveToUi()) {
        showToast("Choose a save location before rendering.", "error");
        return;
      }
      startBtn.disabled = true;

      const format = getSelectedFormat();
      const resCard = resGrid?.querySelector(".export-option-card.active")?.dataset.res || "native";
      let resolution = resCard;
      if (resCard === "custom") {
        resolution = {
          width: parseInt(customW?.value || "1080", 10),
          height: parseInt(customH?.value || "1920", 10),
        };
      }

      const orientation = orientationSelect?.value || "native";
      const fps = parseInt(fpsSelect?.value || "30", 10);
      const quality = qualitySelect?.value || "standard";
      const includeAudio = audioToggle ? audioToggle.checked : true;
      const audioVol = audioVolume ? parseFloat(audioVolume.value) : 1;
      const fileName = filenameInput?.value.trim() || initialName;

      let sceneRange;
      if (rangeModeSelect?.value === "range") {
        const f = Math.max(1, parseInt(rangeFrom?.value || "1", 10));
        const t = Math.min(sceneCount, parseInt(rangeTo?.value || String(sceneCount), 10));
        sceneRange = [f, t];
      }

      const payload = {
        format,
        resolution,
        orientation,
        fps,
        quality,
        includeAudio,
        audioVolume: audioVol,
        fileName,
        sceneRange,
        saveTo: isElectron && chosenFolderPath ? `${chosenFolderPath.replace(/[\\/]+$/, "")}/${currentFileName()}` : undefined,
      };

      try {
        const res = await fetch(startUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (res.status === 400) {
          const errData = await res.json();
          showErrorView(errData.error || "Validation failed before rendering.", errData);
          return;
        }

        if (res.status === 409) {
          const errData = await res.json();
          startPollingJob(errData.jobId || errData.job?.id);
          return;
        }

        if (!res.ok) {
          const text = await res.text();
          showErrorView(`Server error (${res.status}): ${text}`);
          return;
        }

        const data = await res.json();
        if (data.jobId) {
          startPollingJob(data.jobId);
        } else {
          showErrorView("Invalid response from render endpoint (missing jobId).");
        }
      } catch (err) {
        showErrorView(`Failed to initiate render: ${err.message}`);
      } finally {
        refreshSaveToUi();
      }
    };
  }
  refreshSaveToUi();

  function startPollingJob(jobId) {
    currentExportJobId = jobId;
    exportModalLocked = true;
    exportModalStartTime = Date.now();
    const closeBtn = $("export-modal-close");
    if (closeBtn) {
      closeBtn.disabled = true;
      closeBtn.setAttribute("aria-disabled", "true");
    }
    setModalState("rendering");

    if (currentExportPollTimer) clearInterval(currentExportPollTimer);

    const cancelBtn = $("export-cancel-btn");
    if (cancelBtn) {
      cancelBtn.disabled = false;
      cancelBtn.textContent = "Cancel Render";
      cancelBtn.onclick = async () => {
        const ok = await showConfirm("Stop rendering? Progress will be lost.");
        if (!ok) return;
        cancelBtn.disabled = true;
        cancelBtn.textContent = "Cancelling...";
        try {
          await api(`/api/videos/${videoId}/render-jobs/${jobId}/cancel`, { method: "POST" });
        } catch (e) {
          console.warn("Cancel request failed:", e);
        }
      };
    }

    currentExportPollTimer = setInterval(async () => {
      try {
        const res = await fetch(`/api/videos/${videoId}/render-jobs/${jobId}`);
        if (res.status === 404) {
          clearInterval(currentExportPollTimer);
          currentExportPollTimer = null;
          showErrorView("Render interrupted (job lost or server restarted).");
          return;
        }

        const job = await res.json();
        updateRenderingView(job);

        if (job.state === "done") {
          clearInterval(currentExportPollTimer);
          currentExportPollTimer = null;
          exportModalLocked = false;
          showCompleteView(job);
          refreshRecentExportsList();
        } else if (job.state === "error") {
          clearInterval(currentExportPollTimer);
          currentExportPollTimer = null;
          exportModalLocked = false;
          showErrorView(job.error || "Rendering failed.", job);
        } else if (job.state === "cancelled") {
          clearInterval(currentExportPollTimer);
          currentExportPollTimer = null;
          exportModalLocked = false;
          showCancelledView(job);
        }
      } catch (err) {
        console.warn("Poll error:", err);
      }
    }, 500);
  }

  function updateRenderingView(job) {
    const p = job.progress || {};
    const phaseMsgEl = $("export-render-phase-msg");
    if (phaseMsgEl) {
      if (p.phase === "frames" && p.scene && p.sceneCount) {
        // Split out "scene N of M" into its own colored badge -- as one plain
        // string it read as the same flat text as the frame count, easy to miss
        // that it's counting up through scenes rather than just frames.
        phaseMsgEl.innerHTML =
          `Rendering frame ${p.frame ?? 0} / ${p.totalFrames ?? 0} · ` +
          `<span class="export-scene-badge">Scene ${p.scene} of ${p.sceneCount}</span>`;
      } else {
        phaseMsgEl.textContent = p.message || "Rendering video...";
      }
    }
    if ($("export-render-pct")) $("export-render-pct").textContent = `${p.percent || 0}%`;
    if ($("export-progress-bar-fill")) $("export-progress-bar-fill").style.width = `${p.percent || 0}%`;

    const elapsedSec = Math.floor((Date.now() - exportModalStartTime) / 1000);
    const elapsedFormatted = `${Math.floor(elapsedSec / 60)}:${String(elapsedSec % 60).padStart(2, "0")}`;
    if ($("export-metric-elapsed")) $("export-metric-elapsed").textContent = `Elapsed: ${elapsedFormatted}`;

    if (p.etaSec != null) {
      const etaFormatted = `${Math.floor(p.etaSec / 60)}:${String(p.etaSec % 60).padStart(2, "0")}`;
      if ($("export-metric-eta")) $("export-metric-eta").textContent = `Remaining: ~${etaFormatted}`;
    } else {
      if ($("export-metric-eta")) $("export-metric-eta").textContent = "Remaining: --:--";
    }

    if (p.fps != null && p.fps > 0) {
      if ($("export-metric-fps")) $("export-metric-fps").textContent = `Speed: ${p.fps} fps`;
    } else {
      if ($("export-metric-fps")) $("export-metric-fps").textContent = "Speed: -- fps";
    }

    if ($("export-metric-accelerator")) {
      const acc = (p.accelerator || "GPU").toUpperCase();
      const shortBadge = acc.includes("CPU") ? "CPU" : "GPU";
      $("export-metric-accelerator").textContent = shortBadge;
      $("export-metric-accelerator").title = p.accelerator || shortBadge;
    }

    const phases = ["preparing", "frames", "encoding", "audio", "done"];
    const currentPhaseIdx = phases.indexOf(p.phase);
    const phasesList = $("export-phases-list");

    if (phasesList) {
      phasesList.querySelectorAll(".export-phase-item").forEach((item) => {
        const itemPhase = item.dataset.phase;
        const itemIdx = phases.indexOf(itemPhase);
        item.classList.remove("active", "done");
        if (itemIdx < currentPhaseIdx) {
          item.classList.add("done");
        } else if (itemIdx === currentPhaseIdx) {
          item.classList.add("active");
        }
      });
    }
  }

  async function showCompleteView(job) {
    exportModalLocked = false;
    const closeBtn = $("export-modal-close");
    if (closeBtn) {
      closeBtn.disabled = false;
      closeBtn.removeAttribute("aria-disabled");
    }
    setModalState("complete");
    refreshRecentExportsList();

    const player = $("export-preview-player");
    const fileUrl = `/api/videos/${videoId}/render-jobs/${job.id}/file`;
    if (player) {
      player.src = fileUrl;
    }

    const name = job.fileName || `promo.${job.format || "mp4"}`;
    let savedPath = job.savedPath || ""; // Electron: already written server-side via `saveTo`.
    let browserSaveError = "";
    if (!isElectron && chosenDirHandle) {
      // "Once rendering is complete, the file must be saved to the selected
      // location" -- the browser has no server-writable path, so this is done
      // here: fetch the finished render and write it straight into the folder
      // the user chose (and this session verified permission for) at modal-open.
      try {
        const blob = await (await fetch(fileUrl)).blob();
        await writeBlobToChosenDir(blob, name);
        savedPath = `📁 ${chosenDirHandle.name}/${name}`;
      } catch (err) {
        browserSaveError = err?.message || String(err);
        console.error("Failed to save into chosen folder:", err);
      }
    }

    const grid = $("export-complete-meta-grid");
    if (grid) {
      const sizeMb = job.sizeBytes ? (job.sizeBytes / (1024 * 1024)).toFixed(2) + " MB" : "Unknown";
      grid.innerHTML = `
        <div class="export-meta-item"><span class="export-meta-label">File Name</span><span class="export-meta-value">${name}</span></div>
        <div class="export-meta-item"><span class="export-meta-label">Format</span><span class="export-meta-value">${(job.format || "mp4").toUpperCase()}</span></div>
        <div class="export-meta-item"><span class="export-meta-label">Resolution</span><span class="export-meta-value">${job.width || 1080} × ${job.height || 1920}</span></div>
        <div class="export-meta-item"><span class="export-meta-label">Duration</span><span class="export-meta-value">${job.durationSec || 0}s</span></div>
        <div class="export-meta-item"><span class="export-meta-label">File Size</span><span class="export-meta-value">${sizeMb}</span></div>
        <div class="export-meta-item"><span class="export-meta-label">Save Path</span><span class="export-meta-value">${savedPath || (browserSaveError ? "Save failed -- see Download" : "Downloads / Local Storage")}</span></div>
      `;
    }
    if (browserSaveError) showToast(`Couldn't save into the chosen folder: ${browserSaveError}`, "error");
    else if (savedPath) showToast(`Saved to ${savedPath}`, "success");

    const triggerDownload = (url, fname) => {
      const a = document.createElement("a");
      a.href = url;
      if (fname) a.download = fname;
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      setTimeout(() => a.remove(), 100);
    };

    // "Download" is a deliberate Save As -- lets the user pick a location that
    // differs from the remembered default, instead of only ever landing there.
    const downloadBtn = $("export-btn-download");
    if (downloadBtn) {
      downloadBtn.onclick = async () => {
        if (isElectron) {
          try {
            const ext = job.format === "webm" ? "webm" : "mp4";
            const target = await window.electronNative.invoke("choose-save-path", { defaultName: name, ext });
            if (!target) return;
            await api(`/api/videos/${videoId}/render-jobs/${job.id}/save-as`, { method: "POST", body: { path: target } });
            showToast(`Saved to ${target}`, "success");
            tryClose();
          } catch (err) {
            showAlert("Could not save the file: " + err.message);
          }
        } else if (typeof window.showSaveFilePicker === "function") {
          try {
            const handle = await window.showSaveFilePicker({ suggestedName: name });
            const blob = await (await fetch(fileUrl)).blob();
            const writable = await handle.createWritable();
            await writable.write(blob);
            await writable.close();
            showToast("Video saved.", "success");
            tryClose();
          } catch (err) {
            if (err?.name !== "AbortError") showAlert("Could not save the file: " + err.message);
          }
        } else {
          triggerDownload(`${fileUrl}?download=1`, name);
          showToast("Video downloaded successfully.", "success");
          tryClose();
        }
      };
    }

    const openTabBtn = $("export-btn-open-tab");
    if (openTabBtn) {
      if (isElectron) {
        openTabBtn.style.display = "none";
      } else {
        openTabBtn.style.display = "inline-block";
        openTabBtn.onclick = () => {
          window.open(fileUrl, "_blank");
        };
      }
    }

    const showFolderBtn = $("export-btn-show-folder");
    if (showFolderBtn) {
      if (isElectron && job.savedPath) {
        showFolderBtn.style.display = "inline-block";
        showFolderBtn.onclick = () => {
          window.electronNative.invoke("show-in-folder", job.savedPath);
        };
      } else {
        showFolderBtn.style.display = "none";
      }
    }
  }

  function showErrorView(msg, details) {
    exportModalLocked = false;
    const closeBtn = $("export-modal-close");
    if (closeBtn) {
      closeBtn.disabled = false;
      closeBtn.removeAttribute("aria-disabled");
    }
    setModalState("error");
    if ($("export-error-message")) $("export-error-message").textContent = msg;
    if ($("export-error-stack")) $("export-error-stack").textContent = typeof details === "object" ? JSON.stringify(details, null, 2) : String(details || msg);

    const retryBtn = $("export-btn-retry");
    if (retryBtn) {
      retryBtn.onclick = () => setModalState("config");
    }
  }

  function showCancelledView(job) {
    exportModalLocked = false;
    const closeBtn = $("export-modal-close");
    if (closeBtn) {
      closeBtn.disabled = false;
      closeBtn.removeAttribute("aria-disabled");
    }
    setModalState("cancelled");
    const retryBtn = $("export-btn-retry");
    if (retryBtn) {
      retryBtn.onclick = () => setModalState("config");
    }
  }

  function setModalState(state) {
    modal.dataset.state = state;
    modal.querySelectorAll(".export-view").forEach((view) => {
      view.style.display = view.classList.contains(`export-view-${state}`) ? "block" : "none";
    });

    const isConfig = state === "config";
    const isComplete = state === "complete";
    const isError = state === "error" || state === "cancelled";

    if ($("export-btn-cancel-config")) $("export-btn-cancel-config").style.display = isConfig ? "inline-block" : "none";
    if ($("export-btn-start")) $("export-btn-start").style.display = isConfig ? "inline-block" : "none";

    if ($("export-btn-download")) $("export-btn-download").style.display = isComplete ? "inline-block" : "none";
    if ($("export-btn-open-tab")) $("export-btn-open-tab").style.display = isComplete ? "inline-block" : "none";
    if ($("export-btn-close-complete")) $("export-btn-close-complete").style.display = isComplete ? "inline-block" : "none";

    if ($("export-btn-retry")) $("export-btn-retry").style.display = isError ? "inline-block" : "none";
    if ($("export-btn-close-error")) $("export-btn-close-error").style.display = isError ? "inline-block" : "none";
  }
}

export async function refreshRecentExportsList() {
  const card = $("video-recent-exports-card");
  const list = $("recent-exports-list");
  const countBadge = $("recent-exports-count");
  if (!card || !list || !videoId) return;

  try {
    const exports = await api(`/api/videos/${videoId}/exports`);
    if (!Array.isArray(exports) || exports.length === 0) {
      card.style.display = "none";
      return;
    }

    card.style.display = "block";
    if (countBadge) countBadge.textContent = `${exports.length} file${exports.length === 1 ? "" : "s"}`;

    const isElectron = !!(window.electronNative && window.electronNative.isElectron);

    list.innerHTML = exports.map((exp) => {
      const fileUrl = `/api/videos/${videoId}/exports/${exp.id}/file`;
      const sizeMb = exp.sizeBytes ? (exp.sizeBytes / (1024 * 1024)).toFixed(2) + " MB" : "";
      const dateStr = exp.createdAt ? new Date(exp.createdAt).toLocaleDateString() : "";

      return `
        <div class="recent-export-row" data-export-id="${exp.id}">
          <div style="display:flex; flex-direction:column; gap:0.15rem; flex:1; min-width:0; padding-right:0.75rem;">
            <div style="font-weight:600; font-size:0.85rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${exp.fileName}</div>
            <div class="hint" style="font-size:0.75rem; color:#94a3b8;">
              ${exp.format.toUpperCase()} · ${exp.width}×${exp.height} · ${exp.fps} fps · ${exp.durationSec}s ${sizeMb ? `· ${sizeMb}` : ""} ${dateStr ? `· ${dateStr}` : ""}
            </div>
          </div>
          <div style="display:flex; gap:0.35rem; align-items:center;">
            ${isElectron && exp.savedPath ? `<button class="icon-btn small secondary" data-act="show-folder" data-path="${exp.savedPath}" title="Show in Folder">📁</button>` : ""}
            <button class="icon-btn small secondary" data-act="open-export" data-url="${fileUrl}" title="Open in New Tab">↗</button>
            <button class="icon-btn small secondary" data-act="download-export" data-url="${fileUrl}?download=1" title="Download File">⬇</button>
            <button class="icon-btn small secondary danger" data-act="delete-export" data-id="${exp.id}" title="Delete Export">🗑</button>
          </div>
        </div>
      `;
    }).join("");

    list.querySelectorAll('[data-act="show-folder"]').forEach((btn) => {
      btn.onclick = () => window.electronNative.invoke("show-in-folder", btn.dataset.path);
    });
    list.querySelectorAll('[data-act="open-export"]').forEach((btn) => {
      if (isElectron) {
        btn.style.display = "none";
      } else {
        btn.onclick = () => window.open(btn.dataset.url, "_blank");
      }
    });
    list.querySelectorAll('[data-act="download-export"]').forEach((btn) => {
      btn.onclick = () => {
        const a = document.createElement("a");
        a.href = btn.dataset.url;
        a.style.display = "none";
        document.body.appendChild(a);
        a.click();
        setTimeout(() => a.remove(), 100);
      };
    });
    list.querySelectorAll('[data-act="delete-export"]').forEach((btn) => {
      btn.onclick = async () => {
        const id = btn.dataset.id;
        const ok = await showConfirm("Delete this exported video file?");
        if (!ok) return;
        try {
          await api(`/api/videos/${videoId}/exports/${id}`, { method: "DELETE" });
          refreshRecentExportsList();
          showToast("Export deleted.", "success");
        } catch (e) {
          await showAlert("Failed to delete export: " + e.message);
        }
      };
    });
  } catch (err) {
    console.warn("Failed to load recent exports:", err);
  }
}
