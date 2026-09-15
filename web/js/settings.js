// Settings, Modals, Toolchain, Credentials, and 3D Device Catalogue Management
import { activeProjectId, videoDevices } from './state.js';
import { api, uploadFile, showAlert, showToast } from './utils.js';

const $ = (id) => document.getElementById(id);

/* ================= Credentials ================= */
export async function refreshAuthStatus() {
  try {
    const status = await api("/api/auth/status");
    const el = $("cred-status");
    if (el) {
      if (status.passwordSet) {
        el.textContent = `configured — ${status.email}`;
        el.className = "status ok";
      } else {
        el.textContent = "not configured";
        el.className = "status warn";
      }
    }
    if ($("cred-email") && document.activeElement !== $("cred-email")) $("cred-email").value = status.email || "";
    if ($("cred-admin-domain") && document.activeElement !== $("cred-admin-domain")) $("cred-admin-domain").value = status.adminApiBaseUrl || "";
    if ($("cred-app-code") && document.activeElement !== $("cred-app-code")) $("cred-app-code").value = status.appCode || "";
  } catch (e) {
    const el = $("cred-status");
    if (el) { el.textContent = "error"; el.className = "status bad"; }
  }
}

/* ================= Toolchain Status & Modal ================= */
export function openToolchainModal() {
  const backdrop = $("toolchain-backdrop");
  if (backdrop) backdrop.classList.add("open");
  refreshToolchainStatus();
}

export function closeToolchainModal() {
  const backdrop = $("toolchain-backdrop");
  if (backdrop) backdrop.classList.remove("open");
}

export async function refreshToolchainStatus() {
  const summaryEl = $("toolchain-status-summary");
  const listEl = $("toolchain-tools-list");
  const customDirInput = $("toolchain-custom-dir");
  if (!summaryEl || !listEl) return;

  try {
    const status = await api("/api/toolchain/status");
    if (customDirInput) customDirInput.value = status.customDir || "";

    if (status.ready) {
      summaryEl.style.background = "rgba(16, 185, 129, 0.15)";
      summaryEl.style.border = "1px solid rgba(16, 185, 129, 0.3)";
      summaryEl.style.color = "#10b981";
      summaryEl.innerHTML = "&#10003; Toolchain Ready: ADB, scrcpy, and FFmpeg are installed and accessible.";
    } else {
      summaryEl.style.background = "rgba(239, 68, 68, 0.15)";
      summaryEl.style.border = "1px solid rgba(239, 68, 68, 0.3)";
      summaryEl.style.color = "#ef4444";
      summaryEl.innerHTML = "&#9888; Action Required: One or more required binaries are missing.";
    }

    listEl.innerHTML = "";
    const toolNames = ["adb", "scrcpy", "ffmpeg"];
    for (const name of toolNames) {
      const t = status.tools?.[name];
      if (!t) continue;
      const row = document.createElement("div");
      row.style.cssText = "display: flex; justify-content: space-between; align-items: center; padding: 0.6rem 0.8rem; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 6px;";

      const badgeBg = t.available ? (t.source === "custom" ? "#8b5cf6" : "#10b981") : "#ef4444";
      const badgeText = t.available ? (t.source === "custom" ? "Custom" : t.source === "vendor" ? "Vendor" : "PATH") : "Missing";

      row.innerHTML = `
        <div>
          <strong style="text-transform: uppercase; letter-spacing: 0.05em; font-size: 0.85rem;">${t.name}</strong>
          <span style="margin-left: 0.5rem; font-family: monospace; font-size: 0.8rem; color: #9aa0a6;">${t.version || (t.available ? "Unknown version" : "Not installed")}</span>
          <div style="font-size: 0.75rem; color: #6b7280; font-family: monospace; margin-top: 0.2rem; word-break: break-all;">${t.path || "No binary path found"}</div>
        </div>
        <span style="padding: 2px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 600; background: ${badgeBg}; color: white;">${badgeText}</span>
      `;
      listEl.appendChild(row);
    }
  } catch (e) {
    summaryEl.textContent = "Failed to load status: " + e.message;
  }
}

export async function checkToolchainStatusOnStartup() {
  try {
    const status = await api("/api/toolchain/status");
    if (!status.ready) {
      openToolchainModal();
    }
  } catch (_) {}
}

/* ================= AI Providers & Models Settings ================= */
export async function loadProviders() {
  const container = $("providers-list");
  if (!container) return;
  container.textContent = "Loading…";
  try {
    const { providers } = await api("/api/ai/providers");
    container.innerHTML = "";
    const discoverSelect = $("discover-provider");
    if (discoverSelect) discoverSelect.innerHTML = "";
    for (const p of providers) {
      const row = document.createElement("div");
      row.className = "provider-row";
      row.innerHTML = `
        <span class="provider-name">${p.id}</span>
        <span class="badge">${p.adapter}</span>
        <span class="provider-meta">${p.baseUrl}</span>
        <input class="key-input" type="password" placeholder="${p.keySet ? "•••••••• (set)" : p.requiresKey ? "API key" : "no key needed"}" ${p.requiresKey ? "" : "disabled"} />
        <button class="small secondary" data-act="save-key">Save Key</button>
        <button class="small secondary" data-act="test">Test</button>
        <button class="small danger" data-act="delete">Delete</button>
        <span class="test-result" style="font-size:.75rem;"></span>
      `;
      row.querySelector('[data-act="save-key"]').onclick = async () => {
        const keyInput = row.querySelector(".key-input");
        const apiKey = keyInput.value;
        if (!apiKey) return;
        await api("/api/ai/providers", { method: "POST", body: { id: p.id, apiKey } });
        keyInput.value = "";
        keyInput.placeholder = "•••••••• (set)";
      };
      row.querySelector('[data-act="test"]').onclick = async () => {
        const resultEl = row.querySelector(".test-result");
        resultEl.textContent = "testing…";
        try {
          const r = await api(`/api/ai/providers/${encodeURIComponent(p.id)}/test`, { method: "POST" });
          resultEl.textContent = r.ok ? `OK (${r.latencyMs}ms, ${r.modelCount} models)` : `FAILED: ${r.reason}`;
          resultEl.style.color = r.ok ? "#86efac" : "#fca5a5";
        } catch (e) {
          resultEl.textContent = "error: " + e.message;
          resultEl.style.color = "#fca5a5";
        }
      };
      row.querySelector('[data-act="delete"]').onclick = async () => {
        await api(`/api/ai/providers/${encodeURIComponent(p.id)}`, { method: "DELETE" });
        loadProviders();
      };
      container.appendChild(row);
      if (discoverSelect) {
        const opt = document.createElement("option");
        opt.value = p.id;
        opt.textContent = `${p.id} (${p.adapter})`;
        discoverSelect.appendChild(opt);
      }
    }
  } catch (e) {
    container.textContent = "Failed to load providers: " + e.message;
  }
}

export async function loadModelsTab() {
  const listEl = $("saved-models-list");
  if (!listEl) return;
  try {
    const { models, defaultModel } = await api("/api/ai/models");
    if (models.length === 0) { listEl.textContent = "None yet."; return; }
    listEl.innerHTML = "";
    for (const m of models) {
      const row = document.createElement("div");
      row.className = "model-row";
      const isDefault = defaultModel && defaultModel.provider === m.provider && defaultModel.modelId === m.modelId;
      row.innerHTML = `
        <span>${m.provider} / ${m.displayName}</span>
        ${m.vision ? '<span class="badge vision">vision</span>' : ""}
        ${isDefault ? '<span class="badge">default</span>' : '<button class="small secondary" data-act="default">Set default</button>'}
        <button class="small danger" data-act="delete">Remove</button>
      `;
      const defaultBtn = row.querySelector('[data-act="default"]');
      if (defaultBtn) defaultBtn.onclick = async () => {
        await api("/api/ai/models/default", { method: "POST", body: { provider: m.provider, modelId: m.modelId } });
        loadModelsTab();
      };
      row.querySelector('[data-act="delete"]').onclick = async () => {
        await api(`/api/ai/models/${encodeURIComponent(m.provider)}/${encodeURIComponent(m.modelId)}`, { method: "DELETE" });
        loadModelsTab();
      };
      listEl.appendChild(row);
    }
  } catch (e) { listEl.textContent = "Failed to load: " + e.message; }
}

/* ================= Universal Upload Modal ================= */
let currentUploadCallback = null;

export function openUniversalUploadModal(onSelectCallback) {
  currentUploadCallback = onSelectCallback;
  const backdrop = $("universal-upload-backdrop");
  if (backdrop) backdrop.classList.add("open");

  document.querySelectorAll("#universal-upload-backdrop .tab").forEach((t) => t.classList.remove("active"));
  document.querySelectorAll("#universal-upload-backdrop .tab-panel").forEach((p) => p.classList.remove("active"));
  const tabBtn = $("tab-btn-project-assets");
  if (tabBtn) tabBtn.classList.add("active");
  const panel = $("upload-panel-project");
  if (panel) panel.classList.add("active");

  refreshUniversalProjectAssets();
}

export async function refreshUniversalProjectAssets() {
  const grid = $("universal-project-assets-grid");
  const useBtn = $("universal-use-selected-btn");
  if (!grid) return;
  grid.innerHTML = "Loading assets...";
  if (useBtn) useBtn.disabled = true;

  if (!activeProjectId) return;

  try {
    const { files } = await api(`/api/projects/${activeProjectId}/files`);
    grid.innerHTML = "";
    const assets = files.filter((f) => f.path.startsWith("captures/") || f.path.startsWith("uploads/"));

    if (assets.length === 0) {
      grid.innerHTML = '<div style="grid-column: span 4; text-align: center; padding: 2rem 0;" class="hint">No screenshots captured or uploaded yet.</div>';
      return;
    }

    let selectedPath = null;
    for (const asset of assets) {
      const card = document.createElement("div");
      card.className = "asset-select-card";
      const fileUrl = `/api/projects/${activeProjectId}/file?p=${encodeURIComponent(asset.path)}`;
      card.innerHTML = `
        <img src="${fileUrl}" />
        <div class="badge-overlay">${asset.path.startsWith("captures/") ? "Cap " : ""}${asset.name}</div>
      `;

      card.onclick = () => {
        document.querySelectorAll(".asset-select-card").forEach((c) => c.classList.remove("selected"));
        card.classList.add("selected");
        selectedPath = asset.path;
        if (useBtn) useBtn.disabled = false;
      };

      grid.appendChild(card);
    }

    if (useBtn) {
      useBtn.onclick = () => {
        if (selectedPath && currentUploadCallback) {
          currentUploadCallback(selectedPath);
          $("universal-upload-backdrop")?.classList.remove("open");
        }
      };
    }
  } catch (e) {
    grid.innerHTML = "Error loading assets: " + e.message;
  }
}

async function handleDirectComputerUpload(file) {
  const statusEl = $("computer-upload-status");
  if (statusEl) {
    statusEl.textContent = "Uploading image...";
    statusEl.style.color = "#9aa0a6";
  }

  try {
    const url = `/api/projects/${activeProjectId}/upload?name=${encodeURIComponent(file.name)}`;
    await uploadFile(url, file);
    if (statusEl) {
      statusEl.textContent = `Upload successful: ${file.name}`;
      statusEl.style.color = "#10b981";
    }
    setTimeout(() => {
      document.querySelector('#universal-upload-backdrop .tab[data-upload-tab="project"]')?.click();
      refreshUniversalProjectAssets();
    }, 800);
  } catch (e) {
    if (statusEl) {
      statusEl.textContent = "Upload failed: " + e.message;
      statusEl.style.color = "#ef4444";
    }
  }
}

/* ================= 3D Device Registry & Management ================= */
let __threeModulePromise = null;
function loadThreeModule() {
  if (!__threeModulePromise) {
    __threeModulePromise = Promise.all([
      import("/vendor/three/build/three.module.js"),
      import("/vendor/three/examples/jsm/loaders/GLTFLoader.js"),
    ]).then(([THREE, { GLTFLoader }]) => ({ THREE, GLTFLoader }));
  }
  return __threeModulePromise;
}

export async function loadDevicesCatalogue() {
  const grid = $("dev-grid");
  if (!grid) return;
  grid.innerHTML = '<div class="hint">Loading devices...</div>';

  try {
    let devices = videoDevices;
    if (!Array.isArray(devices) || devices.length === 0) {
      const res = await api("/api/devices");
      devices = Array.isArray(res) ? res : (Array.isArray(res?.devices) ? res.devices : []);
    }
    renderDevicesCatalogueList(devices);
  } catch (err) {
    grid.innerHTML = `<div class="hint slot-issue error">Failed to load device catalogue: ${err.message}</div>`;
  }
}

export function renderDevicesCatalogueList(devicesList) {
  const grid = $("dev-grid");
  if (!grid) return;

  const list = devicesList || videoDevices || [];
  const searchVal = $("dev-search")?.value.toLowerCase() || "";
  const platformVal = $("dev-filter-platform")?.value || "";
  const formFactorVal = $("dev-filter-formfactor")?.value || "";

  const filtered = list.filter((d) => {
    const matchesSearch = d.name.toLowerCase().includes(searchVal) || d.vendor.toLowerCase().includes(searchVal);
    const matchesPlatform = !platformVal || d.platforms.includes(platformVal);
    const matchesForm = !formFactorVal || d.formFactor === formFactorVal;
    return matchesSearch && matchesPlatform && matchesForm;
  });

  if (filtered.length === 0) {
    grid.innerHTML = '<div class="hint">No matching devices found.</div>';
    return;
  }

  grid.innerHTML = filtered.map((d) => {
    const platformBadges = d.platforms.map((p) => {
      const cls = p === "apple-app-store" ? "platform-ios" : "platform-android";
      const lbl = p === "apple-app-store" ? "iOS" : "Android";
      return `<span class="device-tag ${cls}">${lbl}</span>`;
    }).join(" ");

    return `
      <div class="device-card" data-device-id="${d.id}">
        <div class="device-3d-viewport" style="width:100%; height:190px;" data-device-id="${d.id}">
          <canvas class="device-3d-canvas" style="width:100%; height:100%; display:block;"></canvas>
          <div class="device-3d-controls">
            <button type="button" class="secondary small d3-orbit-btn" title="Toggle auto-orbit">&#8635; Orbit</button>
            <button type="button" class="secondary small d3-reset-btn" title="Reset view">&#8634; Reset</button>
          </div>
        </div>
        <div class="device-card-header">
          <div>
            <div class="device-vendor">${d.vendor}</div>
            <h3 class="device-name">${d.name}</h3>
          </div>
          <div style="display:flex; flex-direction:column; gap:4px; align-items:flex-end;">
            ${platformBadges}
          </div>
        </div>
        <div class="device-specs-list">
          <div class="device-spec-item">
            <span class="device-spec-label">Form Factor:</span>
            <span>${d.formFactor}</span>
          </div>
          <div class="device-spec-item">
            <span class="device-spec-label">Screen Inset:</span>
            <span>T:${d.geometry.screenInset.top} L:${d.geometry.screenInset.left} W:${d.geometry.screenInset.width} H:${d.geometry.screenInset.height}</span>
          </div>
          <div class="device-spec-item">
            <span class="device-spec-label">Bezel Width:</span>
            <span>${d.frame.bezelWidth}px</span>
          </div>
          <div class="device-spec-item">
            <span class="device-spec-label">Cutout Type:</span>
            <span>${d.frame.cutout}</span>
          </div>
        </div>
      </div>
    `;
  }).join("");

  bind3dDeviceViewers(grid);
}

function bind3dDeviceViewers(grid) {
  const viewports = Array.from(grid.querySelectorAll(".device-3d-viewport"));

  const io = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) init3dDeviceViewport(entry.target);
    }
  }, { root: null, rootMargin: "200px" });
  viewports.forEach((vp) => io.observe(vp));

  viewports.forEach((vp) => {
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    let orbitTimer = null;

    const state = () => vp.__d3;
    const stopOrbit = () => {
      if (orbitTimer) { clearInterval(orbitTimer); orbitTimer = null; }
      const btn = vp.querySelector(".d3-orbit-btn");
      if (btn) btn.textContent = "↻ Orbit";
    };
    const startOrbit = () => {
      orbitTimer = setInterval(() => {
        const s = state();
        if (!s) return;
        s.ry = (s.ry + 0.6) % 360;
        s.apply();
      }, 30);
      const btn = vp.querySelector(".d3-orbit-btn");
      if (btn) btn.textContent = "⏸ Stop";
    };

    vp.addEventListener("pointerdown", (e) => {
      if (e.target.closest("button")) return;
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      stopOrbit();
      vp.setPointerCapture(e.pointerId);
    });
    vp.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      const s = state();
      if (!s) return;
      s.ry += (e.clientX - lastX) * 0.5;
      s.rx = Math.max(-80, Math.min(80, s.rx - (e.clientY - lastY) * 0.5));
      lastX = e.clientX;
      lastY = e.clientY;
      s.apply();
    });
    vp.addEventListener("pointerup", () => { dragging = false; });
    vp.addEventListener("pointerleave", () => { dragging = false; });

    const orbitBtn = vp.querySelector(".d3-orbit-btn");
    if (orbitBtn) orbitBtn.onclick = () => { if (orbitTimer) stopOrbit(); else startOrbit(); };
    const resetBtn = vp.querySelector(".d3-reset-btn");
    if (resetBtn) resetBtn.onclick = () => { stopOrbit(); const s = state(); if (s) { s.rx = -8; s.ry = 18; s.apply(); } };
  });
}

async function init3dDeviceViewport(vp) {
  if (vp.dataset.d3Inited) return;
  vp.dataset.d3Inited = "1";
  const deviceId = vp.dataset.deviceId;
  const canvas = vp.querySelector(".device-3d-canvas");
  if (!canvas || !deviceId) return;

  try {
    const { THREE, GLTFLoader } = await loadThreeModule();
    const w = canvas.clientWidth || 220;
    const h = canvas.clientHeight || 190;
    canvas.width = w;
    canvas.height = h;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setSize(w, h, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, w / h, 0.01, 100);
    scene.add(new THREE.AmbientLight(0xffffff, 1.8));
    const key = new THREE.DirectionalLight(0xfff4e6, 3.5);
    key.position.set(3, 4, 5);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xd6e4ff, 2.0);
    fill.position.set(-4, 2, 4);
    scene.add(fill);
    const rim = new THREE.DirectionalLight(0xffffff, 2.2);
    rim.position.set(-1.5, 3, -4);
    scene.add(rim);

    let root = null;
    let dist = 0.3;
    const buf = await fetch(`/api/devices/${encodeURIComponent(deviceId)}/glb`).then((r) => r.arrayBuffer());
    const gltf = await new Promise((resolve, reject) => new GLTFLoader().parse(buf, "", resolve, reject));
    root = gltf.scene.children.find((n) => n.userData?.role === "device-root") || gltf.scene.children[0];
    scene.add(root);
    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    dist = Math.max(size.x, size.y, size.z) * 1.8 + 0.05;

    let rx = -8;
    let ry = 18;
    const apply = () => {
      if (!root) return;
      const phi = (90 - rx) * (Math.PI / 180);
      const theta = ry * (Math.PI / 180);
      camera.position.set(
        dist * Math.sin(phi) * Math.sin(theta),
        dist * Math.cos(phi),
        dist * Math.sin(phi) * Math.cos(theta)
      );
      camera.lookAt(0, 0, 0);
      renderer.render(scene, camera);
    };
    apply();

    vp.__d3 = { apply, get rx() { return rx; }, set rx(v) { rx = v; }, get ry() { return ry; }, set ry(v) { ry = v; } };
  } catch (e) {
    console.error("3D device preview failed to load " + deviceId, e);
  }
}

// Static setup
export function setupSettingsAndModals() {
  if (typeof window === "undefined") return;

  // Credentials
  const openCred = $("open-credentials");
  if (openCred) openCred.onclick = () => { $("credentials-backdrop")?.classList.add("open"); refreshAuthStatus(); };
  const closeCred = $("credentials-close");
  if (closeCred) closeCred.onclick = () => $("credentials-backdrop")?.classList.remove("open");
  const credBackdrop = $("credentials-backdrop");
  if (credBackdrop) credBackdrop.onclick = (e) => { if (e.target === credBackdrop) credBackdrop.classList.remove("open"); };

  const credSave = $("cred-save");
  if (credSave) {
    credSave.onclick = async () => {
      const email = $("cred-email")?.value.trim();
      const password = $("cred-password")?.value;
      if (!email) return await showAlert("Email is required.");
      await api("/api/auth/credentials", {
        method: "POST",
        body: {
          email,
          password: password || undefined,
          adminApiBaseUrl: $("cred-admin-domain")?.value.trim(),
          appCode: $("cred-app-code")?.value.trim(),
        },
      });
      if ($("cred-password")) $("cred-password").value = "";
      refreshAuthStatus();
    };
  }
  const credClear = $("cred-clear");
  if (credClear) credClear.onclick = async () => { await api("/api/auth/credentials", { method: "DELETE" }); refreshAuthStatus(); };

  // Settings
  const settingsBackdrop = $("settings-backdrop");
  const openSettings = $("open-settings");
  if (openSettings) openSettings.onclick = () => { if (settingsBackdrop) settingsBackdrop.classList.add("open"); loadProviders(); loadModelsTab(); };
  const closeSettings = $("settings-close");
  if (closeSettings) closeSettings.onclick = () => { if (settingsBackdrop) settingsBackdrop.classList.remove("open"); };
  if (settingsBackdrop) settingsBackdrop.onclick = (e) => { if (e.target === settingsBackdrop) settingsBackdrop.classList.remove("open"); };

  for (const tab of document.querySelectorAll("#settings-backdrop .tab")) {
    tab.onclick = () => {
      for (const t of document.querySelectorAll("#settings-backdrop .tab")) t.classList.remove("active");
      for (const p of document.querySelectorAll("#settings-backdrop .tab-panel")) p.classList.remove("active");
      tab.classList.add("active");
      $("tab-" + tab.dataset.tab)?.classList.add("active");
    };
  }

  const discoverRun = $("discover-run");
  if (discoverRun) {
    discoverRun.onclick = async () => {
      const providerId = $("discover-provider")?.value;
      const resultEl = $("discover-result");
      if (!providerId || !resultEl) return;
      resultEl.innerHTML = "Fetching…";
      try {
        const { models, error, message } = await api(`/api/ai/providers/${encodeURIComponent(providerId)}/fetch-models`);
        if (error) { resultEl.innerHTML = `<div class="discovery-msg error">${message}</div>`; return; }
        if (models.length === 0) { resultEl.innerHTML = `<div class="discovery-msg error">No models returned.</div>`; return; }
        resultEl.innerHTML = "";
        const list = document.createElement("div");
        for (const m of models) {
          const row = document.createElement("div");
          row.className = "checkbox-row";
          row.innerHTML = `<input type="checkbox" data-model-id="${m.modelId}" data-vision="${m.vision}" /> <span>${m.displayName}${m.vision ? " 👁" : ""}</span>`;
          list.appendChild(row);
        }
        resultEl.appendChild(list);
        const saveBtn = document.createElement("button");
        saveBtn.className = "small";
        saveBtn.textContent = "Save Selected";
        saveBtn.onclick = async () => {
          const checked = [...list.querySelectorAll("input[type=checkbox]:checked")];
          const toSave = checked.map((c) => ({ provider: providerId, modelId: c.dataset.modelId, displayName: c.parentElement.querySelector("span").textContent.replace(" 👁", ""), vision: c.dataset.vision === "true" }));
          if (toSave.length === 0) return;
          await api("/api/ai/models", { method: "POST", body: { models: toSave } });
          loadModelsTab();
        };
        resultEl.appendChild(saveBtn);
      } catch (e) { resultEl.innerHTML = `<div class="discovery-msg error">${e.message}</div>`; }
    };
  }

  const addProviderSave = $("add-provider-save");
  if (addProviderSave) {
    addProviderSave.onclick = async () => {
      const id = $("add-id")?.value.trim();
      const adapter = $("add-adapter")?.value;
      const baseUrl = $("add-baseurl")?.value.trim();
      const requiresKey = $("add-requires-key")?.checked;
      if (!id || !baseUrl) return;
      await api("/api/ai/providers", { method: "POST", body: { id, adapter, baseUrl, enabled: true, requiresKey } });
      if ($("add-id")) $("add-id").value = "";
      if ($("add-baseurl")) $("add-baseurl").value = "";
      document.querySelector('#settings-backdrop .tab[data-tab="providers"]')?.click();
      loadProviders();
    };
  }

  // Toolchain
  const openToolchain = $("open-toolchain");
  if (openToolchain) openToolchain.onclick = () => openToolchainModal();
  const toolchainClose = $("toolchain-close");
  if (toolchainClose) toolchainClose.onclick = () => closeToolchainModal();
  const toolchainBackdrop = $("toolchain-backdrop");
  if (toolchainBackdrop) toolchainBackdrop.onclick = (e) => { if (e.target === toolchainBackdrop) closeToolchainModal(); };

  const toolchainSaveDir = $("toolchain-save-dir");
  if (toolchainSaveDir) {
    toolchainSaveDir.onclick = async () => {
      const customDir = $("toolchain-custom-dir")?.value.trim();
      try {
        await api("/api/toolchain/config", { method: "POST", body: { customDir: customDir || null } });
        await refreshToolchainStatus();
      } catch (e) {
        await showAlert("Failed to set directory: " + e.message);
      }
    };
  }

  const toolchainResetDir = $("toolchain-reset-dir");
  if (toolchainResetDir) {
    toolchainResetDir.onclick = async () => {
      if ($("toolchain-custom-dir")) $("toolchain-custom-dir").value = "";
      try {
        await api("/api/toolchain/config", { method: "POST", body: { customDir: null } });
        await refreshToolchainStatus();
      } catch (e) {
        await showAlert("Failed to reset directory: " + e.message);
      }
    };
  }

  const toolchainDownloadBtn = $("toolchain-download-btn");
  if (toolchainDownloadBtn) {
    toolchainDownloadBtn.onclick = async () => {
      const btn = toolchainDownloadBtn;
      const progressContainer = $("toolchain-progress-container");
      const msgEl = $("toolchain-progress-msg");
      const pctEl = $("toolchain-progress-pct");
      const barEl = $("toolchain-progress-bar");

      btn.disabled = true;
      if (progressContainer) progressContainer.style.display = "block";
      if (msgEl) msgEl.textContent = "Initiating download...";
      if (pctEl) pctEl.textContent = "0%";
      if (barEl) barEl.style.width = "0%";

      const eventSource = new EventSource("/api/toolchain/download-stream");
      eventSource.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data);
          if (msgEl) msgEl.textContent = data.message || "Downloading...";
          const pct = Math.min(100, Math.max(0, data.progress || 0));
          if (pctEl) pctEl.textContent = `${pct}%`;
          if (barEl) barEl.style.width = `${pct}%`;

          if (data.status === "complete") {
            eventSource.close();
            btn.disabled = false;
            refreshToolchainStatus();
          } else if (data.status === "error") {
            eventSource.close();
            btn.disabled = false;
            showAlert("Download failed: " + data.message);
          }
        } catch (_) {}
      };
      eventSource.onerror = () => {
        eventSource.close();
        btn.disabled = false;
      };
      try {
        await api("/api/toolchain/download", { method: "POST" });
      } catch (e) {
        eventSource.close();
        btn.disabled = false;
        await showAlert("Failed to start download: " + e.message);
      }
    };
  }

  // Universal Upload
  const uploadClose = $("universal-upload-close");
  if (uploadClose) uploadClose.onclick = () => $("universal-upload-backdrop")?.classList.remove("open");
  const uploadBackdrop = $("universal-upload-backdrop");
  if (uploadBackdrop) uploadBackdrop.onclick = (e) => { if (e.target === uploadBackdrop) uploadBackdrop.classList.remove("open"); };

  document.querySelectorAll("#universal-upload-backdrop .tab").forEach((tab) => {
    tab.onclick = () => {
      document.querySelectorAll("#universal-upload-backdrop .tab").forEach((t) => t.classList.remove("active"));
      document.querySelectorAll("#universal-upload-backdrop .tab-panel").forEach((p) => p.classList.remove("active"));
      tab.classList.add("active");
      $("upload-panel-" + tab.dataset.uploadTab)?.classList.add("active");
    };
  });

  const dropzone = $("universal-dropzone");
  const filePicker = $("universal-file-picker");
  if (dropzone && filePicker) {
    dropzone.onclick = () => filePicker.click();
    filePicker.onchange = async () => {
      const file = filePicker.files[0];
      if (!file) return;
      await handleDirectComputerUpload(file);
    };
    dropzone.ondragover = (e) => { e.preventDefault(); dropzone.style.borderColor = "#3b82f6"; };
    dropzone.ondragleave = () => { dropzone.style.borderColor = "#262a33"; };
    dropzone.ondrop = async (e) => {
      e.preventDefault();
      dropzone.style.borderColor = "#262a33";
      const file = e.dataTransfer.files[0];
      if (file && file.type.startsWith("image/")) await handleDirectComputerUpload(file);
    };
  }

  // Device Catalogue Filters
  const devSearch = $("dev-search");
  if (devSearch) devSearch.oninput = () => renderDevicesCatalogueList();
  const devFilterPlatform = $("dev-filter-platform");
  if (devFilterPlatform) devFilterPlatform.onchange = () => renderDevicesCatalogueList();
  const devFilterFormfactor = $("dev-filter-formfactor");
  if (devFilterFormfactor) devFilterFormfactor.onchange = () => renderDevicesCatalogueList();

  const devExportBtn = $("dev-export-btn");
  if (devExportBtn) devExportBtn.onclick = () => { window.location.href = "/api/devices/export"; };

  const devImportBtn = $("dev-import-btn");
  const devImportFile = $("dev-import-file");
  if (devImportBtn && devImportFile) {
    devImportBtn.onclick = () => devImportFile.click();
    devImportFile.onchange = async () => {
      const file = devImportFile.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        const parsed = JSON.parse(text);
        await api("/api/devices/import", { method: "POST", body: parsed });
        await loadDevicesCatalogue();
        showToast("Device catalogue successfully imported!", "success");
      } catch (err) {
        await showAlert("Failed to import device catalogue: " + err.message);
      }
    };
  }
}
