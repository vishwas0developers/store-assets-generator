// Video Studio module — template & scene management, timeline, and 3D device preview setup.
import { activeProjectId, videoId, videoProject, selectedSceneId, videoTemplates, setVideoId, setVideoProject, setSelectedSceneId, setVideoTemplates } from './state.js';
import { api, showAlert, showConfirm, showToast } from './utils.js';

let videoTemplateDetailId = null;
let videoDetailSceneIndex = 0;
let videoDetailState = "idle";
let videoDetailMode = "sequence";
let videoDetailAudio = null;
let videoDetailResizeObserver = null;
let hostPlaybackTick = null;
let videoDevices = [];
let videoSceneOptions = { animations: [], backgrounds: [], layouts: {} };

export async function loadVideoProjectInto(id) {
  setVideoId(id);
  if (id) {
    try {
      const proj = await api(`/api/videos/${id}`);
      setVideoProject(proj);
      const label = document.getElementById("video-project-label");
      if (label) label.textContent = proj.name;
    } catch (e) {
      console.error("Failed to load video project:", e);
      setVideoProject(null);
      const label = document.getElementById("video-project-label");
      if (label) label.textContent = "No video project loaded";
    }
  } else {
    setVideoProject(null);
    const label = document.getElementById("video-project-label");
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
  const list = document.getElementById("video-template-list");
  const stage = document.getElementById("video-template-stage");
  if (list) list.innerHTML = "";
  if (stage) stage.innerHTML = "";
  const templates = await ensureVideoTemplates();
  const keepId = videoTemplateDetailId && templates.some((t) => t.id === videoTemplateDetailId) ? videoTemplateDetailId : templates[0]?.id;
  if (keepId) openVideoTemplateDetail(keepId);
}

function totalDuration(t) {
  return t.scenes.reduce((sum, s) => sum + s.durationSeconds, 0);
}

function isLandscapeTemplate(t) { return t.aspectRatio === "16:9"; }
function canvasSizeFor(t) { return isLandscapeTemplate(t) ? "1920 × 1080 (16:9)" : "1080 × 1920 (9:16)"; }
function orientationFor(t) { return isLandscapeTemplate(t) ? "Landscape" : "Portrait"; }

function renderVideoTemplateList(templates, activeId) {
  const list = document.getElementById("video-template-list");
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

export function openVideoTemplateDetail(id) {
  const t = videoTemplates.find((x) => x.id === id);
  if (!t) return;
  if (videoDetailResizeObserver) { videoDetailResizeObserver.disconnect(); videoDetailResizeObserver = null; }
  videoTemplateDetailId = id;
  videoDetailSceneIndex = 0;
  videoDetailMode = "sequence";
  videoDetailState = "idle";

  renderVideoTemplateList(videoTemplates, id);

  const stage = document.getElementById("video-template-stage");
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
      </div>
    </div>
  `;
  const loadBtn = document.getElementById("video-detail-load-btn");
  if (loadBtn) loadBtn.onclick = () => loadVideoTemplateNow(id);
}

async function loadVideoTemplateNow(id) {
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
  showToast(`Applied "${t ? t.name : id}" — ${updatedProj.scenes.length} scene(s) ready.`, "success");
}

export function renderVideoScenes() {
  const container = document.getElementById("video-scenes-list");
  if (!container || !videoProject) return;

  const scenes = videoProject.scenes || [];
  if (scenes.length === 0) {
    container.innerHTML = `<div class="hint" style="text-align: center; padding: 2rem 0;">No scenes yet. Use the templates above to add one.</div>`;
    return;
  }

  container.innerHTML = scenes.map((scene, idx) => `
    <div class="video-scene-card ${selectedSceneId === scene.id ? 'selected' : ''}" data-scene-id="${scene.id}">
      <span class="scene-idx">#${idx + 1}</span>
      <span class="scene-title">${scene.title || scene.id}</span>
      <button class="small danger scene-del-btn" data-scene-id="${scene.id}" title="Delete">🗑️</button>
    </div>
  `).join('');

  container.querySelectorAll(".video-scene-card").forEach(card => {
    card.onclick = (e) => {
      const id = card.dataset.sceneId;
      if (e.target.closest(".scene-del-btn")) {
        e.stopPropagation();
        deleteVideoScene(id);
      } else {
        setSelectedSceneId(id);
        renderVideoScenes();
      }
    };
  });
}

async function deleteVideoScene(sceneId) {
  if (!videoProject) return;
  videoProject.scenes = (videoProject.scenes || []).filter(s => s.id !== sceneId);
  if (selectedSceneId === sceneId) setSelectedSceneId(null);
  if (videoId) await api(`/api/video/${videoId}`, { method: "PUT", body: videoProject });
  renderVideoScenes();
}
