const $ = (id) => document.getElementById(id);

async function api(path, options) {
  const resp = await fetch(path, {
    method: options?.method ?? "GET",
    headers: options?.body ? { "Content-Type": "application/json" } : undefined,
    body: options?.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`);
  return data;
}

async function uploadFile(path, file) {
  const resp = await fetch(path, { method: "POST", headers: { "Content-Type": file.type || "application/octet-stream" }, body: file });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`);
  return data;
}

// Best-effort cleanup so closing the tab without clicking Disconnect doesn't leak a
// headless Chromium/ADB session server-side. sendBeacon fires a fire-and-forget POST
// that survives page teardown (fetch would get cancelled).
window.addEventListener("beforeunload", () => {
  if (typeof browserConnected !== "undefined" && browserConnected) {
    navigator.sendBeacon("/api/browser/stop");
  }
  if (typeof androidConnected !== "undefined" && androidConnected) {
    navigator.sendBeacon("/api/android/stop");
  }
});

/* ================= Custom Dialog & Toast System ================= */

function showAlert(message, type = "warning", title = "Alert") {
  let icon = "warning";
  if (type === "error") icon = "error";
  if (type === "success") icon = "success";
  if (type === "info") icon = "info";

  return Swal.fire({
    title: title,
    text: message,
    icon: icon,
    confirmButtonText: "OK",
    background: "#14161c",
    color: "#e6e6e6",
    confirmButtonColor: "#3b82f6"
  });
}

function showConfirm(message, title = "Confirm Action", danger = false) {
  return Swal.fire({
    title: title,
    text: message,
    icon: danger ? "warning" : "question",
    showCancelButton: true,
    confirmButtonText: danger ? "Delete" : "Confirm",
    cancelButtonText: "Cancel",
    background: "#14161c",
    color: "#e6e6e6",
    confirmButtonColor: danger ? "#dc2626" : "#3b82f6",
    cancelButtonColor: "#374151"
  }).then((result) => {
    return result.isConfirmed;
  });
}

function showPrompt(message, defaultValue = "", title = "Input Required") {
  return Swal.fire({
    title: title,
    text: message,
    input: "text",
    inputValue: defaultValue,
    showCancelButton: true,
    confirmButtonText: "Submit",
    cancelButtonText: "Cancel",
    background: "#14161c",
    color: "#e6e6e6",
    confirmButtonColor: "#3b82f6",
    cancelButtonColor: "#374151"
  }).then((result) => {
    return result.value !== undefined ? result.value : null;
  });
}

function showToast(message, type = "info") {
  const container = $("custom-toast-container");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `custom-toast ${type}`;
  
  let icon = "&#8505;";
  if (type === "success") icon = "&#9989;";
  if (type === "error") icon = "&#10060;";
  if (type === "warning") icon = "&#9888;";

  toast.innerHTML = `<span style="font-size:1.1rem;">${icon}</span><span style="flex:1;">${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = "fadeOut 0.3s ease-in forwards";
    toast.addEventListener("animationend", () => {
      toast.remove();
    });
  }, 3500);
}

// Mask native blocking alerts with async wrapper calls
const alert = (msg, type = "warning") => showAlert(msg, type);
const confirm = (msg) => showConfirm(msg);
const prompt = (msg, def) => showPrompt(msg, def);


/* ================= Project State & Navigation Gating ================= */

let activeProjectId = localStorage.getItem("activeProjectId") || null;
let activeProject = null;

// Gated tab navigation click handlers
for (const tab of document.querySelectorAll(".topbar-tab")) {
  tab.onclick = async () => {
    const targetTab = tab.dataset.tab;
    if (targetTab === "capture" && !activeProjectId) {
      await alert("Please select or create a project first from the Projects List.");
      return;
    }
    
    // Switch active tab styling
    for (const t of document.querySelectorAll(".topbar-tab")) t.classList.remove("active");
    for (const p of document.querySelectorAll(".tab-page")) p.classList.remove("active");
    tab.classList.add("active");
    $("tab-" + targetTab).classList.add("active");

    // Load content dynamically for target tab
    if (targetTab === "projects") {
      await refreshProjectsList();
    } else if (targetTab === "capture") {
      await loadCaptureTab();
    } else if (targetTab === "mockup") {
      await loadMockupProjectInto(activeProjectId);
    } else if (targetTab === "video") {
      await loadVideoProjectInto(activeProjectId);
    }
  };
}

// Enable/disable navigation tabs dynamically based on active project state
function updateTabGating() {
  const el = $("tab-nav-capture");
  if (activeProjectId) {
    el.classList.remove("disabled");
    el.removeAttribute("title");
  } else {
    el.classList.add("disabled");
    el.setAttribute("title", "Select a project first");
  }

  const brand = $("brand-title");
  if (activeProject) {
    brand.textContent = `Store Assets Generator - ${activeProject.name}`;
    $("active-project-card").style.display = "block";
    $("active-proj-name-display").textContent = activeProject.name;
    $("active-proj-cat-display").textContent = activeProject.appCategory || "Education";
    $("active-proj-url-display").textContent = activeProject.targetUrl || "None";
    $("project-explorer-card").style.display = "block";
    refreshFileExplorer();
  } else {
    brand.textContent = "Store Assets Generator";
    $("active-project-card").style.display = "none";
    $("project-explorer-card").style.display = "none";
  }
}

async function selectProject(id) {
  try {
    activeProjectId = id;
    localStorage.setItem("activeProjectId", id);
    activeProject = await api(`/api/projects/${id}`);
    updateTabGating();
    await refreshProjectsList();
  } catch (e) {
    await alert("Failed to select project: " + e.message);
  }
}

/* ================= Projects List Tab Logic ================= */

$("proj-create-btn").onclick = async () => {
  const name = $("proj-new-name").value.trim();
  const category = $("proj-new-category").value;
  const targetUrl = $("proj-new-url").value.trim();

  if (!name) {
    await alert("Project Name is required.");
    return;
  }

  try {
    const project = await api("/api/projects", {
      method: "POST",
      body: { name, appCategory: category, targetUrl }
    });
    
    // Clear inputs
    $("proj-new-name").value = "";
    $("proj-new-category").value = "Education";
    $("proj-new-url").value = "";

    await selectProject(project.id);
  } catch (e) {
    await alert("Failed to create project: " + e.message);
  }
};

async function refreshProjectsList() {
  const container = $("projects-list-container");
  container.innerHTML = "Loading projects...";
  
  try {
    const { projects } = await api("/api/projects");
    container.innerHTML = "";
    
    // Update project count badge in the library title
    const countBadge = $("projects-count-badge");
    if (countBadge) {
      countBadge.textContent = `${projects.length} Project${projects.length === 1 ? '' : 's'}`;
    }

    if (projects.length === 0) {
      container.textContent = "No projects found. Create one to get started!";
      return;
    }

    // Assign grid class
    container.className = "projects-grid";

    // If active project is set, make sure we sync it
    if (activeProjectId && !activeProject) {
      activeProject = projects.find(p => p.id === activeProjectId);
      updateTabGating();
    }

    for (const p of projects) {
      const isActive = p.id === activeProjectId;
      const card = document.createElement("div");
      card.className = `project-item ${isActive ? 'active' : ''}`;
      
      card.innerHTML = `
        <div style="min-width: 0;">
          <div class="project-item-title">
            ${isActive ? '<span class="active-check">&#10003;</span>' : ''}
            <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${p.name}</span>
          </div>
          <div class="project-item-meta">Created: ${new Date(p.createdAt).toLocaleDateString()}</div>
          <div class="project-stats">
            <span>📸 ${p.captures?.length ?? 0}</span>
            <span>📱 ${p.mockup?.columns?.length ?? 0}</span>
            <span>🎬 ${p.video?.scenes?.length ?? 0}</span>
          </div>
        </div>
        <div style="display: flex; gap: 0.5rem; justify-content: flex-end; margin-top: 0.5rem;">
          <button class="small select-btn" style="flex: 1; ${isActive ? 'background:#10b981;' : ''}">${isActive ? 'Active' : 'Select'}</button>
          <button class="small danger delete-btn" style="padding: 0.35rem 0.5rem;">&#128465;</button>
        </div>
      `;

      card.querySelector(".select-btn").onclick = (e) => {
        e.stopPropagation();
        selectProject(p.id);
      };
      card.querySelector(".delete-btn").onclick = async (e) => {
        e.stopPropagation();
        if (await confirm(`Are you sure you want to delete project "${p.name}"? This deletes all files and is irreversible.`)) {
          await api(`/api/projects/${p.id}`, { method: "DELETE" });
          if (activeProjectId === p.id) {
            activeProjectId = null;
            activeProject = null;
            localStorage.removeItem("activeProjectId");
            updateTabGating();
          }
          await refreshProjectsList();
        }
      };
      
      card.onclick = () => selectProject(p.id);

      container.appendChild(card);
    }
  } catch (e) {
    container.textContent = "Failed to load projects: " + e.message;
  }
}

/* ================= Embedded Project File Explorer ================= */

let currentFileFilter = "all";
document.querySelectorAll("#project-explorer-card .tab").forEach(tab => {
  tab.onclick = () => {
    document.querySelectorAll("#project-explorer-card .tab").forEach(t => t.classList.remove("active"));
    tab.classList.add("active");
    currentFileFilter = tab.dataset.fileFilter;
    refreshFileExplorer();
  };
});

$("proj-download-zip-btn").onclick = () => {
  if (!activeProjectId) return;
  window.open(`/api/projects/${activeProjectId}/download-zip`);
};

async function refreshFileExplorer() {
  const container = $("project-files-list");
  if (!activeProjectId) {
    container.innerHTML = "Select a project to inspect files.";
    return;
  }
  container.innerHTML = "Loading files...";

  try {
    const { files } = await api(`/api/projects/${activeProjectId}/files`);
    container.innerHTML = "";

    // Filter files
    const filtered = files.filter(f => {
      if (currentFileFilter === "all") return true;
      if (currentFileFilter === "captures") return f.path.startsWith("captures/");
      if (currentFileFilter === "mockup") return f.path.startsWith("mockup/");
      if (currentFileFilter === "video") return f.path.startsWith("video/");
      if (currentFileFilter === "uploads") return f.path.startsWith("uploads/");
      return true;
    });

    if (filtered.length === 0) {
      container.innerHTML = `<div style="text-align:center; padding: 2rem 0;" class="hint">No files found matching the "${currentFileFilter}" category.</div>`;
      return;
    }

    const table = document.createElement("table");
    table.className = "file-table";
    table.innerHTML = `
      <thead>
        <tr>
          <th>File Path</th>
          <th>Size</th>
          <th>Last Modified</th>
          <th style="text-align: right;">Actions</th>
        </tr>
      </thead>
      <tbody></tbody>
    `;
    const tbody = table.querySelector("tbody");

    for (const f of filtered) {
      const tr = document.createElement("tr");
      const sizeKB = (f.size / 1024).toFixed(1);
      tr.innerHTML = `
        <td><strong style="color: #3b82f6; cursor: pointer;" class="preview-link">${f.path}</strong></td>
        <td>${sizeKB} KB</td>
        <td>${new Date(f.mtime).toLocaleString()}</td>
        <td style="text-align: right; display: flex; gap: 0.5rem; justify-content: flex-end;">
          <button class="small secondary download-file-btn">Download</button>
          <button class="small danger delete-file-btn">&#128465;</button>
        </td>
      `;

      const downloadUrl = `/api/projects/${activeProjectId}/file?p=${encodeURIComponent(f.path)}`;

      const triggerPreview = async () => {
        const ext = f.path.split('.').pop().toLowerCase();
        if (["png", "jpg", "jpeg", "webp"].includes(ext)) {
          // Open fullscreen lightbox
          const box = document.createElement("div");
          box.style = "position:fixed; inset:0; background:rgba(0,0,0,0.85); display:flex; align-items:center; justify-content:center; z-index:100; cursor:pointer;";
          box.innerHTML = `<img src="${downloadUrl}" style="max-width:90%; max-height:90%; border-radius:8px; box-shadow:0 10px 30px rgba(0,0,0,0.5);" />`;
          box.onclick = () => box.remove();
          document.body.appendChild(box);
        } else if (ext === "mp4") {
          const box = document.createElement("div");
          box.style = "position:fixed; inset:0; background:rgba(0,0,0,0.85); display:flex; align-items:center; justify-content:center; z-index:100; cursor:pointer;";
          box.innerHTML = `<video src="${downloadUrl}" controls autoplay style="max-width:90%; max-height:90%; border-radius:8px;" />`;
          box.onclick = (e) => { if (e.target === box) box.remove(); };
          document.body.appendChild(box);
        } else {
          await alert(`Cannot preview this file type. Please click 'Download' to view.`);
        }
      };

      tr.querySelector(".preview-link").onclick = triggerPreview;
      tr.querySelector(".download-file-btn").onclick = () => window.open(downloadUrl);
      tr.querySelector(".delete-file-btn").onclick = async () => {
        if (await confirm(`Delete file "${f.path}"?`)) {
          await api(`/api/projects/${activeProjectId}/file?p=${encodeURIComponent(f.path)}`, { method: "DELETE" });
          refreshFileExplorer();
        }
      };

      tbody.appendChild(tr);
    }

    container.appendChild(table);
  } catch (e) {
    container.textContent = "Failed to load files: " + e.message;
  }
}

// Theme Toggling Logic
function initTheme() {
  const savedTheme = localStorage.getItem("sag-theme") || "dark";
  applyTheme(savedTheme);
}

function applyTheme(theme) {
  const htmlEl = document.documentElement;
  const themeIcon = $("theme-icon");
  if (theme === "light") {
    htmlEl.classList.remove("dark");
    htmlEl.classList.add("light");
    if (themeIcon) themeIcon.innerHTML = "&#9790;"; // Moon icon
  } else {
    htmlEl.classList.add("dark");
    htmlEl.classList.remove("light");
    if (themeIcon) themeIcon.innerHTML = "&#9788;"; // Sun icon
  }
  localStorage.setItem("sag-theme", theme);
}

const themeToggle = $("theme-toggle-btn");
if (themeToggle) {
  themeToggle.onclick = () => {
    const currentTheme = localStorage.getItem("sag-theme") || "dark";
    applyTheme(currentTheme === "dark" ? "light" : "dark");
  };
}

// Initial loading check on start
setTimeout(() => {
  initTheme();
  refreshProjectsList();
  if (activeProjectId) {
    selectProject(activeProjectId);
  } else {
    updateTabGating();
  }
}, 100);

for (const railBtn of document.querySelectorAll(".rail-btn")) {
  railBtn.onclick = () => {
    const rail = railBtn.closest(".rail");
    const tabPage = railBtn.closest(".tab-page");
    for (const b of rail.querySelectorAll(".rail-btn")) b.classList.remove("active");
    for (const s of tabPage.querySelectorAll(".section-page")) s.classList.remove("active");
    railBtn.classList.add("active");
    const prefix = tabPage.id === "tab-capture" ? "capture" : tabPage.id === "tab-mockup" ? "mockup" : "video";
    $(prefix + "-section-" + railBtn.dataset.section).classList.add("active");

    if (prefix === "mockup") $("mockup-inspector").style.display = railBtn.dataset.section === "editor" ? "block" : "none";
    if (prefix === "video" && railBtn.dataset.section === "scenes") {
      if (videoProject) {
        renderVideoScenes();
      } else if (activeProjectId) {
        loadVideoProjectInto(activeProjectId).then(() => {
          if (videoProject) renderVideoScenes();
        });
      }
      setTimeout(() => {
        updateScenePreviewScale();
        showScenePreview();
      }, 50);
    }
    if (prefix === "video" && railBtn.dataset.section === "devices") {
      loadDevicesCatalogue();
    }
    if (prefix === "video" && railBtn.dataset.section === "saved-configs") {
      loadSavedConfigs();
    }
  };
}

/* ================= Credentials (shared) ================= */

async function refreshAuthStatus() {
  try {
    const status = await api("/api/auth/status");
    const el = $("cred-status");
    if (status.passwordSet) { el.textContent = `configured — ${status.email}`; el.className = "status ok"; }
    else { el.textContent = "not configured"; el.className = "status warn"; }
    if (document.activeElement !== $("cred-email")) $("cred-email").value = status.email || "";
    if (document.activeElement !== $("cred-admin-domain")) $("cred-admin-domain").value = status.adminApiBaseUrl || "";
    if (document.activeElement !== $("cred-app-code")) $("cred-app-code").value = status.appCode || "";
  } catch (e) { $("cred-status").textContent = "error"; $("cred-status").className = "status bad"; }
}
$("open-credentials").onclick = () => { $("credentials-backdrop").classList.add("open"); refreshAuthStatus(); };
$("credentials-close").onclick = () => $("credentials-backdrop").classList.remove("open");
$("cred-save").onclick = async () => {
  const email = $("cred-email").value.trim();
  const password = $("cred-password").value;
  if (!email) return await alert("Email is required.");
  await api("/api/auth/credentials", {
    method: "POST",
    body: {
      email,
      password: password || undefined,
      adminApiBaseUrl: $("cred-admin-domain").value.trim(),
      appCode: $("cred-app-code").value.trim(),
    },
  });
  $("cred-password").value = "";
  refreshAuthStatus();
};
$("cred-clear").onclick = async () => { await api("/api/auth/credentials", { method: "DELETE" }); refreshAuthStatus(); };

/* ============================================================
   Screen Capture tab -- Live Interactive Playwright Browser
   ============================================================ */

let browserConnected = false;
let frameIntervalId = null;

async function loadCaptureTab() {
  if (activeProject && activeProject.targetUrl) {
    if (!$("browser-url-input").value) {
      $("browser-url-input").value = activeProject.targetUrl;
    }
  }
  await renderLiveBrowserCaptures();
  await loadAndroidDevices();
  await renderAndroidCaptures();
}

// Shared by both the Live Web and Android galleries — same card markup/delete/lightbox
// behavior, differing only in which captures to show and what to say when there are none.
async function renderCaptureGallery(galleryId, filterFn, emptyMessage) {
  const gallery = $(galleryId);
  if (!gallery) return;
  gallery.innerHTML = "";

  if (!activeProjectId) return;

  const showEmpty = () => {
    gallery.innerHTML = `<div class="hint" style="grid-column: span 2; text-align: center; padding: 2rem 0;">${emptyMessage}</div>`;
  };

  try {
    const proj = await api(`/api/projects/${activeProjectId}`);
    const filtered = (proj.captures || []).filter(filterFn);

    if (filtered.length === 0) {
      showEmpty();
      return;
    }

    for (const c of filtered) {
      const isVideo = c.kind === "video" || /\.mp4$/i.test(c.file);
      const item = document.createElement("div");
      item.className = "thumb";
      item.style = "height: fit-content; align-self: start; position: relative;";
      const fileUrl = `/api/projects/${activeProjectId}/file?p=${encodeURIComponent(c.file)}`;

      // Build card manually via DOM (no innerHTML) to guarantee onclick works
      const img = document.createElement(isVideo ? "video" : "img");
      img.src = fileUrl;
      img.style.cssText = "cursor:pointer; width:100%; height:auto; max-height:220px; display:block; aspect-ratio:9/16; object-fit:contain; background:#000;";
      if (isVideo) {
        // Metadata only: enough to paint the first frame, without pulling the
        // whole MP4 for every card in the gallery.
        img.preload = "metadata";
        img.muted = true;
        const badge = document.createElement("span");
        badge.className = "video-badge";
        badge.textContent = "VIDEO";
        item.appendChild(badge);
      }

      const cap = document.createElement("div");
      cap.style.cssText = "display:flex; justify-content:space-between; align-items:center; padding:0.35rem 0.5rem; background:#14171f; border-top:1px solid #21252f;";

      const label = document.createElement("span");
      label.style.cssText = "font-weight:600; color:#e5e7eb; font-size:0.75rem;";
      label.textContent = isVideo ? `Video ${c.id} (${c.durationSec ?? "?"}s)` : `Screen ${c.id}`;

      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.style.cssText = "padding:0.25rem 0.35rem; border-radius:4px; display:inline-flex; align-items:center; justify-content:center; cursor:pointer; color:#fff; background:#dc2626; border:none; transition:background 0.2s;";
      delBtn.title = isVideo ? "Delete recording" : "Delete screenshot";
      delBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>`;

      delBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        e.preventDefault();

        const noun = isVideo ? "Recording" : "Screenshot";
        const confirmed = await showConfirm(`Delete ${noun} ${c.id}? This cannot be undone.`, `Delete ${noun}`, true);
        if (!confirmed) return;

        // Remove from DOM immediately for instant feedback
        item.remove();
        if (gallery.children.length === 0) showEmpty();

        try {
          await api(`/api/projects/${activeProjectId}/captures/${c.id}`, { method: "DELETE" });
        } catch (_) {
          // Fallback to file path delete
          try {
            await api(`/api/projects/${activeProjectId}/file?p=${encodeURIComponent(c.file)}`, { method: "DELETE" });
          } catch (err2) {
            showToast("Delete failed: " + err2.message, "error");
            renderCaptureGallery(galleryId, filterFn, emptyMessage);
            return;
          }
        }

        showToast(`${noun} ${c.id} deleted`, "info");
        activeProject = await api(`/api/projects/${activeProjectId}`).catch(() => activeProject);
        if (typeof refreshFileExplorer === "function") refreshFileExplorer();
      });

      img.addEventListener("click", () => {
        const box = document.createElement("div");
        box.style.cssText = "position:fixed; inset:0; background:rgba(0,0,0,0.85); display:flex; align-items:center; justify-content:center; z-index:200; cursor:pointer;";
        const media = document.createElement(isVideo ? "video" : "img");
        media.src = fileUrl;
        media.style.cssText = "max-width:90%; max-height:90%; border-radius:8px;";
        if (isVideo) {
          media.controls = true;
          media.autoplay = true;
          // Clicking the scrub bar shouldn't dismiss the lightbox.
          media.addEventListener("click", (ev) => ev.stopPropagation());
        }
        box.appendChild(media);
        box.addEventListener("click", () => box.remove());
        document.body.appendChild(box);
      });

      cap.appendChild(label);
      cap.appendChild(delBtn);
      item.appendChild(img);
      item.appendChild(cap);
      gallery.appendChild(item);
    }
  } catch (e) {
    gallery.innerHTML = `<div class="hint">Failed to load captures: ${e.message}</div>`;
  }
}

async function renderLiveBrowserCaptures() {
  const selectedResolution = $("browser-resolution-select").value;
  const dims = selectedResolution.split("x");
  const targetWidth = Number(dims[0]);
  const targetHeight = Number(dims[1]);

  const titleEl = $("session-captures-title");
  if (titleEl) titleEl.textContent = `Session Captures (${selectedResolution})`;

  await renderCaptureGallery(
    "live-captures-gallery",
    (c) => c.resolution === selectedResolution || (c.width === targetWidth && c.height === targetHeight),
    `No screenshots captured for ${selectedResolution} yet.<br><br><span style="font-size:0.8rem; color:#888;">Change resolution or capture a new screenshot at this size.</span>`
  );
}

/* ============================================================
   Screen Capture tab -- Live Android Device (via ADB)
   ============================================================ */

let androidConnected = false;

async function loadAndroidDevices() {
  const sel = $("android-device-select");
  if (!sel) return;
  const previousValue = sel.value;
  try {
    const { devices } = await api("/api/android/devices");
    sel.innerHTML = "";
    if (!devices || devices.length === 0) {
      sel.innerHTML = `<option value="">No devices found</option>`;
      return;
    }
    for (const d of devices) {
      const opt = document.createElement("option");
      opt.value = d;
      opt.textContent = d;
      sel.appendChild(opt);
    }
    if (devices.includes(previousValue)) sel.value = previousValue;
  } catch (e) {
    sel.innerHTML = `<option value="">Error listing devices</option>`;
  }
}

$("android-refresh-devices-btn").onclick = loadAndroidDevices;

const ANDROID_CONNECT_ICON = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.55a11 11 0 0 1 14.08 0"></path><path d="M1.42 9a16 16 0 0 1 21.16 0"></path><path d="M8.53 16.11a6 6 0 0 1 6.95 0"></path><line x1="12" y1="20" x2="12.01" y2="20"></line></svg>`;
const ANDROID_DISCONNECT_ICON = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;

// #android-bottom-controls stays visible at all times; only its buttons
// toggle enabled/disabled based on connection state.
const ANDROID_BOTTOM_BTN_IDS = [
  "android-back-btn", "android-home-btn", "android-recents-btn", "android-power-btn",
  "android-screen-off-btn", "android-bottom-capture", "android-bottom-record",
];
function setAndroidBottomControlsEnabled(enabled) {
  for (const id of ANDROID_BOTTOM_BTN_IDS) {
    const btn = $(id);
    if (btn) btn.disabled = !enabled;
  }
}

function setAndroidConnectButtonState(connected) {
  const btn = $("android-connect-btn");
  btn.innerHTML = connected ? ANDROID_DISCONNECT_ICON : ANDROID_CONNECT_ICON;
  btn.title = connected ? "Disconnect Device" : "Connect Device";
  btn.style.background = connected ? "#ef4444" : "#10b981";
}

$("android-connect-btn").onclick = async () => {
  if (androidConnected) {
    await disconnectAndroidDevice();
  } else {
    await connectAndroidDevice();
  }
};

async function connectAndroidDevice() {
  const deviceId = $("android-device-select").value;
  $("android-connect-btn").disabled = true;
  $("android-status").textContent = "Connecting to device...";
  const loadingOverlay = $("android-loading-overlay");
  if (loadingOverlay) loadingOverlay.style.display = "flex";

  try {
    const isElectron = Boolean(window.electronNative && typeof window.electronNative.invoke === "function");
    const startRes = await api("/api/android/start", {
      method: "POST",
      body: {
        projectId: activeProjectId,
        deviceId: deviceId || undefined,
        screenOff: false,
        nativePreview: isElectron,
      }
    });

    androidConnected = true;
    updateScreenOffUI(startRes.screenOff !== false);
    setAndroidConnectButtonState(true);
    $("android-device-frame").style.display = "block";
    setAndroidBottomControlsEnabled(true);
    $("android-status").textContent = "Live mirror active -- interact directly using your mouse or controls below.";
    $("android-app-search-input").disabled = false;
    $("android-refresh-apps-btn").disabled = false;

    // Store device dimensions for aspect-ratio responsive scaling
    window.androidDeviceWidth = startRes.width || 1080;
    window.androidDeviceHeight = startRes.height || 1920;
    resizeAndroidPreview();

    // Enable interaction overlay and start WebCodecs GPU hardware stream
    const overlay = $("android-interaction-overlay");
    if (overlay) overlay.style.pointerEvents = "auto";
    startAndroidWs(loadingOverlay);

    setTimeout(() => {
      if (loadingOverlay && androidConnected) loadingOverlay.style.display = "none";
    }, 1500);

    await loadAndroidApps();
  } catch (e) {
    if (loadingOverlay) loadingOverlay.style.display = "none";
    showAlert("Connection failed: " + e.message, "error", "Connection Error");
    $("android-status").textContent = "Connection failed: " + e.message;
  } finally {
    $("android-connect-btn").disabled = false;
  }
}

class AnnexBParser {
  constructor() {
    this.buffer = new Uint8Array(0);
  }

  append(data) {
    const next = new Uint8Array(this.buffer.length + data.byteLength);
    next.set(this.buffer);
    next.set(new Uint8Array(data), this.buffer.length);
    this.buffer = next;
  }

  extractNALs() {
    const nals = [];
    let start = -1;
    const buf = this.buffer;
    const len = buf.length;

    let i = 0;
    while (i < len - 3) {
      if (buf[i] === 0 && buf[i + 1] === 0) {
        let prefixLen = 0;
        if (buf[i + 2] === 1) prefixLen = 3;
        else if (buf[i + 2] === 0 && buf[i + 3] === 1) prefixLen = 4;

        if (prefixLen > 0) {
          if (start >= 0 && i > start) {
            nals.push(buf.subarray(start, i));
          }
          i += prefixLen;
          start = i;
          continue;
        }
      }
      i++;
    }

    if (start >= 0) {
      this.buffer = buf.subarray(start);
    }
    return nals;
  }
}

function getAvcCodecString(sps) {
  if (sps && sps.length >= 4) {
    const profile = sps[1].toString(16).padStart(2, "0");
    const compat = sps[2].toString(16).padStart(2, "0");
    const level = sps[3].toString(16).padStart(2, "0");
    return `avc1.${profile}${compat}${level}`;
  }
  return "avc1.42e01f";
}

let androidWs = null;
let androidWsFrameUrl = null;
let androidCanvasCtx = null;
let androidRendering = false;
let androidPendingBitmap = null;
let webCodecsDecoder = null;
let h264SpsBuffer = null;
let h264PpsBuffer = null;
let decoderConfigured = false;

function maybeFindStartCode(buf) {
  for (let i = 0; i < buf.length - 3; i++) {
    if (buf[i] === 0 && buf[i + 1] === 0 && buf[i + 2] === 1) return i;
    if (buf[i] === 0 && buf[i + 1] === 0 && buf[i + 2] === 0 && buf[i + 3] === 1) return i;
  }
  return -1;
}

function extractSpsCodecString(nalBytes) {
  const offset = maybeFindStartCode(nalBytes);
  if (offset < 0) return "avc1.42e01f";
  const prefixLen = nalBytes[offset + 2] === 1 ? 3 : 4;
  const start = offset + prefixLen;
  if (start + 3 <= nalBytes.length) {
    const profile = nalBytes[start + 1].toString(16).padStart(2, "0");
    const compat = nalBytes[start + 2].toString(16).padStart(2, "0");
    const level = nalBytes[start + 3].toString(16).padStart(2, "0");
    return `avc1.${profile}${compat}${level}`;
  }
  return "avc1.42e01f";
}

function serializeBinaryTouch(action, x, y, width, height) {
  const buf = new ArrayBuffer(32);
  const v = new DataView(buf);
  v.setUint8(0, 2); // INJECT_TOUCH_EVENT
  v.setUint8(1, action === "down" ? 0 : action === "up" ? 1 : 2);
  v.setBigInt64(2, -2n, false); // GENERIC_FINGER (-2n)
  v.setInt32(10, Math.round(x), false);
  v.setInt32(14, Math.round(y), false);
  v.setUint16(18, Math.round(width), false);
  v.setUint16(20, Math.round(height), false);
  v.setUint16(22, action === "up" ? 0 : 0xffff, false);
  v.setUint32(24, 0, false);
  v.setUint32(28, action === "up" ? 0 : 1, false);
  return buf;
}

function serializeBinaryKey(action, keycode) {
  const buf = new ArrayBuffer(14);
  const v = new DataView(buf);
  v.setUint8(0, 0); // INJECT_KEYCODE
  v.setUint8(1, action); // 0=DOWN, 1=UP
  v.setUint32(2, keycode, false);
  v.setUint32(6, 0, false);
  v.setUint32(10, 0, false);
  return buf;
}

// High-speed live mirror over WebSocket using hardware WebCodecs VideoDecoder:
// decodes incoming H.264 NAL stream on GPU and renders via desynchronized 2D context.
function startAndroidWs(loadingOverlay) {
  stopAndroidWs();
  const canvas = $("android-frame-canvas");
  const frameImg = $("android-frame-img");
  if (canvas) {
    canvas.style.display = "block";
    androidCanvasCtx = canvas.getContext("2d", { alpha: false, desynchronized: true });
  }
  if (frameImg) {
    frameImg.style.display = "none";
  }

  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  const ws = new WebSocket(`${proto}//${location.host}/api/android/h264-ws`);
  ws.binaryType = "arraybuffer";
  androidWs = ws;
  window.androidWs = ws;

  decoderConfigured = false;
  h264SpsBuffer = null;
  h264PpsBuffer = null;
  let hasDecodedFirstKeyFrame = false;

  const useWebCodecs = typeof window.VideoDecoder === "function";

  window.androidDebug = {
    wsPacketCount: 0,
    frameRenderCount: 0,
    lastNals: [],
    lastError: null,
    getDecoderState: () => webCodecsDecoder ? webCodecsDecoder.state : 'none',
    getHasKeyFrame: () => hasDecodedFirstKeyFrame,
    getConfigured: () => decoderConfigured,
  };

  let frameRenderCount = 0;

  function createVideoDecoder() {
    if (!useWebCodecs || !canvas || !androidCanvasCtx) return null;
    try {
      let lastRenderTime = performance.now();
      return new VideoDecoder({
        output: (frame) => {
          frameRenderCount++;
          if (window.androidDebug) window.androidDebug.frameRenderCount = frameRenderCount;
          const now = performance.now();
          const frameDelta = (now - lastRenderTime).toFixed(1);
          lastRenderTime = now;
          if (canvas.width !== frame.displayWidth || canvas.height !== frame.displayHeight) {
            canvas.width = frame.displayWidth;
            canvas.height = frame.displayHeight;
          }
          if (canvas.style.display !== "block") {
            canvas.style.display = "block";
          }
          androidCanvasCtx.drawImage(frame, 0, 0);
          frame.close();
          if (loadingOverlay && loadingOverlay.style.display !== "none") {
            loadingOverlay.style.display = "none";
          }
          if (frameRenderCount === 1 || frameRenderCount <= 5 || frameRenderCount % 120 === 0) {
            console.log(`[${new Date().toISOString()}] [SAG-RENDERER] Frame #${frameRenderCount} rendered to canvas (${canvas.width}x${canvas.height}) delta=${frameDelta}ms`);
          }
        },
        error: (err) => {
          console.error(`[${new Date().toISOString()}] [SAG-DECODER] WebCodecs decode error:`, err);
          if (window.androidDebug) window.androidDebug.lastError = err.message || String(err);
          decoderConfigured = false;
          hasDecodedFirstKeyFrame = false;
        },
      });
    } catch (err) {
      console.warn("[SAG-CLIENT] Failed to create WebCodecs VideoDecoder:", err);
      return null;
    }
  }

  webCodecsDecoder = createVideoDecoder();

  // --- Scrcpy WebCodecs demuxer ---
  // scrcpy sends H.264 packets framed by ScrcpyStreamParser in androidStream.ts:
  //   - Config (SPS/PPS) packet: one Annex-B buffer with SPS NAL (type 7) followed by PPS NAL (type 8).
  //   - Keyframe (IDR) packet: Annex-B IDR NAL, sometimes preceded by SPS+PPS again.
  //   - Delta packet: Annex-B non-IDR NAL.
  // On WebSocket connect, server.ts flushes latestH264Header (config) then latestKeyFrame.
  // We configure VideoDecoder the moment we see SPS and keep the SPS/PPS to prepend onto IDR frames.

  // Build AVCC extradata from Annex-B SPS/PPS nalBytes (for VideoDecoder description).
  function buildAvcCExtraData(spsNAL, ppsNAL) {
    // spsNAL/ppsNAL are Uint8Array of the raw NAL body (without start code prefix)
    const out = new Uint8Array(11 + spsNAL.length + ppsNAL.length);
    let i = 0;
    out[i++] = 1;                 // configurationVersion
    out[i++] = spsNAL[1];         // AVCProfileIndication
    out[i++] = spsNAL[2];         // profile_compatibility
    out[i++] = spsNAL[3];         // AVCLevelIndication
    out[i++] = 0xff;              // lengthSizeMinusOne = 3 (4-byte NAL lengths)
    out[i++] = 0xe1;              // numSequenceParameterSets = 1
    out[i++] = (spsNAL.length >> 8) & 0xff;
    out[i++] = spsNAL.length & 0xff;
    for (let j = 0; j < spsNAL.length; j++) out[i++] = spsNAL[j];
    out[i++] = 1;                 // numPictureParameterSets = 1
    out[i++] = (ppsNAL.length >> 8) & 0xff;
    out[i++] = ppsNAL.length & 0xff;
    for (let j = 0; j < ppsNAL.length; j++) out[i++] = ppsNAL[j];
    return out;
  }

  // Parse all NAL units out of an Annex-B buffer. Returns [{type, body}] where body excludes start code.
  function parseAnnexBNALs(data) {
    const nals = [];
    let i = 0;
    while (i < data.length - 3) {
      let startLen = 0;
      if (data[i] === 0 && data[i+1] === 0 && data[i+2] === 1) startLen = 3;
      else if (data[i] === 0 && data[i+1] === 0 && data[i+2] === 0 && data[i+3] === 1) startLen = 4;
      if (startLen > 0) {
        const bodyStart = i + startLen;
        // find next start code
        let end = data.length;
        for (let j = bodyStart + 1; j < data.length - 3; j++) {
          if (data[j] === 0 && data[j+1] === 0 && (data[j+2] === 1 || (data[j+2] === 0 && data[j+3] === 1))) {
            end = j; break;
          }
        }
        if (bodyStart < end) {
          nals.push({ type: data[bodyStart] & 0x1f, body: data.subarray(bodyStart, end) });
        }
        i = end;
      } else {
        i++;
      }
    }
    return nals;
  }

  function containsStartCode(data) {
    for (let i = 0; i < data.length - 3; i++) {
      if (data[i] === 0 && data[i+1] === 0 && (data[i+2] === 1 || (data[i+2] === 0 && data[i+3] === 1))) return true;
    }
    return false;
  }

  let wsPacketCount = 0;

  ws.onmessage = async (ev) => {
    let rawData = ev.data;
    if (rawData instanceof Blob) {
      rawData = await rawData.arrayBuffer();
    }
    if (!(rawData instanceof ArrayBuffer)) return;
    wsPacketCount++;
    if (window.androidDebug) {
      window.androidDebug.wsPacketCount = wsPacketCount;
    }
    const now = new Date().toISOString();
    const data = new Uint8Array(rawData);
    if (wsPacketCount === 1 || wsPacketCount <= 5 || wsPacketCount % 120 === 0) {
      console.log(`[${now}] [SAG-CLIENT] WS packet #${wsPacketCount}: ${data.length} bytes, configured=${decoderConfigured}, first4=[${data[0]},${data[1]},${data[2]},${data[3]}]`);
    }

    if (webCodecsDecoder) {
      if (!containsStartCode(data)) return; // not a valid Annex-B packet, skip

      const nals = parseAnnexBNALs(data);
      if (!nals.length) return;

      if (wsPacketCount <= 5 || wsPacketCount % 120 === 0) {
        console.log(`[${now}] [SAG-CLIENT] Packet #${wsPacketCount} NALs: [${nals.map(n => n.type).join(",")}]`);
      }

      const spsNAL = nals.find(n => n.type === 7);
      const ppsNAL = nals.find(n => n.type === 8);
      const idrNAL = nals.find(n => n.type === 5);
      const hasNonConfig = nals.some(n => n.type !== 7 && n.type !== 8);

      // --- Configure or recover decoder on SPS encounter or closed state ---
      if (webCodecsDecoder.state === "closed") {
        console.warn(`[${now}] [SAG-DECODER] VideoDecoder was closed, recreating...`);
        webCodecsDecoder = createVideoDecoder();
        decoderConfigured = false;
        hasDecodedFirstKeyFrame = false;
      }

      if (spsNAL && ppsNAL && (!decoderConfigured || webCodecsDecoder.state === "unconfigured")) {
        h264SpsBuffer = spsNAL.body;
        h264PpsBuffer = ppsNAL.body;
        const codecStr = `avc1.${spsNAL.body[1].toString(16).padStart(2,"0")}${spsNAL.body[2].toString(16).padStart(2,"0")}${spsNAL.body[3].toString(16).padStart(2,"0")}`;
        try {
          if (webCodecsDecoder && webCodecsDecoder.state !== "closed") {
            webCodecsDecoder.configure({
              codec: codecStr,
              optimizeForLatency: true,
              hardwareAcceleration: "prefer-hardware",
            });
            decoderConfigured = true;
            console.log(`[${now}] [SAG-DECODER] VideoDecoder configured (Annex-B): ${codecStr}, spsLen=${spsNAL.body.length}, ppsLen=${ppsNAL.body.length}`);
          }
        } catch (e) {
          console.error(`[${now}] [SAG-DECODER] VideoDecoder configure failed:`, e);
        }
        if (!hasNonConfig) return; // pure config packet (SPS+PPS only), no frame to decode
      } else if (spsNAL) {
        h264SpsBuffer = spsNAL.body;
        if (!hasNonConfig) return;
      }

      if (!decoderConfigured || !webCodecsDecoder || webCodecsDecoder.state !== "configured") {
        return;
      }

      try {
        // Determine keyframe: packet contains IDR NAL (type 5)
        const isKeyFrame = !!idrNAL;

        // Track first keyframe, but also accept delta frames once the decoder is configured.
        if (isKeyFrame) {
          hasDecodedFirstKeyFrame = true;
        } else if (!hasDecodedFirstKeyFrame && !h264SpsBuffer) {
          // Haven't seen SPS yet at all — truly no decoder init data, skip
          return;
        }

        // For IDR frames: ensure SPS+PPS are prepended (some decoders require it on every keyframe)
        let payload = data;
        if (isKeyFrame && h264SpsBuffer && h264PpsBuffer) {
          const hasSps = nals[0] && nals[0].type === 7;
          if (!hasSps) {
            const sc4 = new Uint8Array([0, 0, 0, 1]);
            const combined = new Uint8Array(sc4.length + h264SpsBuffer.length + sc4.length + h264PpsBuffer.length + data.length);
            let off = 0;
            combined.set(sc4, off); off += sc4.length;
            combined.set(h264SpsBuffer, off); off += h264SpsBuffer.length;
            combined.set(sc4, off); off += sc4.length;
            combined.set(h264PpsBuffer, off); off += h264PpsBuffer.length;
            combined.set(data, off);
            payload = combined;
          }
        }

        // ponytail: WebCodecs VideoDecoder requires a real IDR as the first "key" chunk.
        // Labeling a non-IDR P-frame as "key" causes DataError → error-callback reset loop → black screen.
        // Drop all non-IDR frames until the first genuine IDR is decoded.
        if (!isKeyFrame && !hasDecodedFirstKeyFrame) {
          return; // wait for a real IDR keyframe
        }
        const chunkType = isKeyFrame ? "key" : "delta";
        if (isKeyFrame && !hasDecodedFirstKeyFrame) hasDecodedFirstKeyFrame = true;

        if (wsPacketCount <= 5 || wsPacketCount % 120 === 0) {
          console.log(`[${now}] [SAG-DECODER] decode() pkt#${wsPacketCount}: type=${chunkType}, size=${payload.length}b, isIDR=${isKeyFrame}`);
        }
        webCodecsDecoder.decode(new EncodedVideoChunk({
          type: chunkType,
          timestamp: performance.now() * 1000,
          data: payload,
        }));
      } catch (decErr) {
        console.error(`[${now}] [SAG-DECODER] decode error:`, decErr);
      }
    } else if (canvas && androidCanvasCtx && typeof window.createImageBitmap === "function") {
      try {
        const blob = new Blob([data], { type: "image/jpeg" });
        const bmp = await createImageBitmap(blob);
        if (androidPendingBitmap) androidPendingBitmap.close();
        androidPendingBitmap = bmp;
        if (!androidRendering) {
          androidRendering = true;
          requestAnimationFrame(() => {
            if (androidPendingBitmap) {
              if (canvas.width !== androidPendingBitmap.width || canvas.height !== androidPendingBitmap.height) {
                canvas.width = androidPendingBitmap.width;
                canvas.height = androidPendingBitmap.height;
              }
              androidCanvasCtx.drawImage(androidPendingBitmap, 0, 0);
              androidPendingBitmap.close();
              androidPendingBitmap = null;
            }
            androidRendering = false;
            if (loadingOverlay) loadingOverlay.style.display = "none";
          });
        }
      } catch (_) {}
    }
  };

  ws.onopen = () => {
    console.log("[SAG-CLIENT] Android H.264 WebSocket connected successfully");
  };

  ws.onerror = (err) => {
    console.error("[SAG-CLIENT] Android H.264 WebSocket error:", err);
  };

  ws.onclose = (ev) => {
    console.log(`[SAG-CLIENT] Android H.264 WebSocket closed (code=${ev.code})`);
    if (androidConnected && !ws._closedManually) {
      console.log("[SAG-CLIENT] Attempting WebSocket reconnect in 1000ms...");
      setTimeout(() => {
        if (androidConnected) startAndroidWs(loadingOverlay);
      }, 1000);
    }
  };

  androidWs = ws;
}

function stopAndroidWs() {
  if (androidWs) {
    androidWs._closedManually = true;
    try { androidWs.close(); } catch (_) {}
    androidWs = null;
  }
  if (androidPendingBitmap) {
    try { androidPendingBitmap.close(); } catch (_) {}
    androidPendingBitmap = null;
  }
  if (androidWsFrameUrl) {
    URL.revokeObjectURL(androidWsFrameUrl);
    androidWsFrameUrl = null;
  }
}

// Fits the live preview to the actual space available inside its card, using
// the connected device's real aspect ratio -- never larger than the viewport,
// scaled down as needed, and re-run on window resize.
function resizeAndroidPreview() {
  if (!androidConnected || !window.androidDeviceWidth || !window.androidDeviceHeight) return;
  const deviceFrame = $("android-device-frame");
  const card = deviceFrame && deviceFrame.parentElement;
  if (!card) return;

  const cardRect = card.getBoundingClientRect();
  const cs = getComputedStyle(card);
  const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
  const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);

  const statusEl = $("android-status");
  const statusH = statusEl ? statusEl.getBoundingClientRect().height + 12 : 0;
  const bottomControls = $("android-bottom-controls");
  const controlsH = bottomControls ? bottomControls.getBoundingClientRect().height + 16 : 0;

  const availW = Math.max(200, cardRect.width - padX);
  const availH = Math.max(200, cardRect.height - padY - statusH - controlsH);

  const aspect = window.androidDeviceWidth / window.androidDeviceHeight; // w/h
  let previewWidth = availW;
  let previewHeight = Math.round(previewWidth / aspect);
  if (previewHeight > availH) {
    previewHeight = availH;
    previewWidth = Math.round(previewHeight * aspect);
  }
  previewWidth = Math.round(previewWidth);

  const frameEl = $("android-viewport-container");
  if (frameEl) {
    frameEl.style.width = `${previewWidth}px`;
    frameEl.style.height = `${previewHeight}px`;
  }
  if (deviceFrame) {
    deviceFrame.style.width = `${previewWidth}px`;
    deviceFrame.style.height = `${previewHeight}px`;
  }
}

window.addEventListener("resize", () => {
  if (androidConnected) resizeAndroidPreview();
});

async function disconnectAndroidDevice() {
  await androidRecorder.stopIfActive();

  const overlay = $("android-interaction-overlay");
  if (overlay) overlay.style.pointerEvents = "auto";

  stopAndroidWs();
  const loadingOverlay = $("android-loading-overlay");
  if (loadingOverlay) loadingOverlay.style.display = "none";
  $("android-frame-img").src = "";
  $("android-connect-btn").disabled = true;

  try {
    await api("/api/android/stop", { method: "POST" });
  } catch (e) {}

  androidConnected = false;
  setAndroidConnectButtonState(false);
  $("android-connect-btn").disabled = false;
  $("android-status").textContent = "Session closed. Click 'Connect' to start a new live session.";
  $("android-device-frame").style.display = "none";
  setAndroidBottomControlsEnabled(false);
  resetAndroidAppCombobox("Connect a device to list applications...");
  $("android-refresh-apps-btn").disabled = true;
  $("android-launch-app-btn").disabled = true;
}

let allAndroidApps = [];
let selectedAndroidApp = null;
let activeComboboxIndex = -1;

function resetAndroidAppCombobox(placeholder = "Connect a device to list applications...") {
  allAndroidApps = [];
  selectedAndroidApp = null;
  activeComboboxIndex = -1;
  const input = $("android-app-search-input");
  const dropdown = $("android-app-dropdown-list");
  if (input) {
    input.value = "";
    input.placeholder = placeholder;
    input.disabled = true;
  }
  if (dropdown) {
    dropdown.innerHTML = "";
    dropdown.style.display = "none";
  }
  $("android-launch-app-btn").disabled = true;
}

function renderComboboxDropdown(filterText = "") {
  const dropdown = $("android-app-dropdown-list");
  if (!dropdown) return;
  const query = filterText.trim().toLowerCase();
  const matches = allAndroidApps.filter((app) =>
    app.label.toLowerCase().includes(query) || app.packageName.toLowerCase().includes(query)
  );

  dropdown.innerHTML = "";
  if (matches.length === 0) {
    const empty = document.createElement("div");
    empty.className = "combobox-empty";
    empty.textContent = query ? "No matching applications found" : "No applications available";
    dropdown.appendChild(empty);
    dropdown.style.display = "block";
    return;
  }

  matches.forEach((app, idx) => {
    const item = document.createElement("div");
    item.className = `combobox-item ${idx === activeComboboxIndex ? "active" : ""}`;
    item.dataset.pkg = app.packageName;

    const labelSpan = document.createElement("span");
    labelSpan.className = "combobox-item-label";
    labelSpan.textContent = app.label;

    const pkgSpan = document.createElement("span");
    pkgSpan.className = "combobox-item-pkg";
    pkgSpan.textContent = `(${app.packageName})`;

    item.appendChild(labelSpan);
    item.appendChild(pkgSpan);

    item.addEventListener("mousedown", (e) => {
      e.preventDefault();
      selectAndroidApp(app);
    });

    dropdown.appendChild(item);
  });

  dropdown.style.display = "block";
}

function selectAndroidApp(app) {
  selectedAndroidApp = app;
  const input = $("android-app-search-input");
  const dropdown = $("android-app-dropdown-list");
  if (input) {
    input.value = `${app.label} (${app.packageName})`;
  }
  if (dropdown) {
    dropdown.style.display = "none";
  }
  $("android-app-select").value = app.packageName;
  $("android-launch-app-btn").disabled = false;
}

const searchInput = $("android-app-search-input");
const comboboxDropdown = $("android-app-dropdown-list");

searchInput.addEventListener("focus", () => {
  if (!searchInput.disabled && allAndroidApps.length > 0) {
    activeComboboxIndex = -1;
    renderComboboxDropdown(selectedAndroidApp ? "" : searchInput.value);
  }
});

searchInput.addEventListener("input", () => {
  selectedAndroidApp = null;
  $("android-launch-app-btn").disabled = true;
  activeComboboxIndex = -1;
  renderComboboxDropdown(searchInput.value);
});

searchInput.addEventListener("keydown", (e) => {
  if (comboboxDropdown.style.display === "none") return;
  const items = comboboxDropdown.querySelectorAll(".combobox-item");
  if (!items.length) return;

  if (e.key === "ArrowDown") {
    e.preventDefault();
    activeComboboxIndex = (activeComboboxIndex + 1) % items.length;
    renderComboboxDropdown(searchInput.value);
    items[activeComboboxIndex]?.scrollIntoView({ block: "nearest" });
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    activeComboboxIndex = (activeComboboxIndex - 1 + items.length) % items.length;
    renderComboboxDropdown(searchInput.value);
    items[activeComboboxIndex]?.scrollIntoView({ block: "nearest" });
  } else if (e.key === "Enter") {
    e.preventDefault();
    if (activeComboboxIndex >= 0 && activeComboboxIndex < items.length) {
      const pkg = items[activeComboboxIndex].dataset.pkg;
      const app = allAndroidApps.find((a) => a.packageName === pkg);
      if (app) selectAndroidApp(app);
    }
  } else if (e.key === "Escape") {
    comboboxDropdown.style.display = "none";
  }
});

document.addEventListener("click", (e) => {
  const container = $("android-app-combobox");
  if (container && !container.contains(e.target)) {
    comboboxDropdown.style.display = "none";
  }
});

async function loadAndroidApps(forceRefresh = false) {
  const input = $("android-app-search-input");
  input.placeholder = "Loading applications...";
  $("android-launch-app-btn").disabled = true;
  try {
    const url = forceRefresh ? "/api/android/apps?refresh=1" : "/api/android/apps";
    const { apps } = await api(url);
    if (!apps || apps.length === 0) {
      input.placeholder = "No third-party apps found";
      allAndroidApps = [];
      return;
    }
    allAndroidApps = apps;
    input.placeholder = "Search application...";
    input.disabled = false;
  } catch (e) {
    input.placeholder = "Failed to list applications";
  }
}

$("android-refresh-apps-btn").onclick = () => loadAndroidApps(true);

// Run/Launch app button handler
$("android-launch-app-btn").onclick = async () => {
  const pkg = selectedAndroidApp?.packageName || $("android-app-select").value;
  if (!pkg || !androidConnected) return;
  $("android-launch-app-btn").disabled = true;
  try {
    await api("/api/android/launch", { method: "POST", body: { packageName: pkg } });
    $("android-status").textContent = `Opened ${selectedAndroidApp ? selectedAndroidApp.label : pkg}. Explore the app in the preview below.`;
  } catch (e) {
    await alert("Failed to launch app: " + e.message);
  } finally {
    $("android-launch-app-btn").disabled = false;
  }
};

function sendAndroidAction(action) {
  if (!androidConnected) return;
  if (androidWs && androidWs.readyState === WebSocket.OPEN) {
    if (action.type === "touch" && action.xPct !== undefined && action.yPct !== undefined) {
      const w = window.androidDeviceWidth || 1080;
      const h = window.androidDeviceHeight || 2400;
      const x = Math.round((action.xPct / 100) * w);
      const y = Math.round((action.yPct / 100) * h);
      const bin = serializeBinaryTouch(action.action || "down", x, y, w, h);
      androidWs.send(bin);
      return;
    } else if (action.type === "key" && action.keycode !== undefined) {
      const down = serializeBinaryKey(0, action.keycode);
      const up = serializeBinaryKey(1, action.keycode);
      androidWs.send(down);
      androidWs.send(up);
      return;
    }
    androidWs.send(JSON.stringify(action));
  } else {
    api("/api/android/action", { method: "POST", body: action }).catch(() => {});
  }
}

async function sendAndroidKey(keycode) {
  sendAndroidAction({ type: "key", keycode });
}

$("android-back-btn").onclick = () => sendAndroidKey(4);
$("android-home-btn").onclick = () => sendAndroidKey(3);
$("android-recents-btn").onclick = () => sendAndroidKey(187);
$("android-power-btn").onclick = () => sendAndroidKey(26);

let androidScreenOffState = true;

function updateScreenOffUI(isOff) {
  androidScreenOffState = isOff;
  const btn = $("android-screen-off-btn");
  if (btn) {
    btn.style.color = isOff ? "#10b981" : "var(--text-secondary)";
    btn.title = isOff
      ? "Screen Off (Phone display light is OFF -- click to turn on)"
      : "Screen Off (Phone display light is ON -- click to turn off)";
  }
}

$("android-screen-off-btn").onclick = async () => {
  if (!androidConnected) return;
  const nextState = !androidScreenOffState;
  try {
    const res = await api("/api/android/screen-off", {
      method: "POST",
      body: { screenOff: nextState },
    });
    updateScreenOffUI(res.screenOff);
  } catch (e) {
    console.error("Failed to toggle screen off:", e);
  }
};

// Interactive real-time continuous touch & drag on the Android device frame
const androidImgEl = $("android-frame-img");
const androidOverlayEl = $("android-interaction-overlay");
let androidPointerDown = false;
let androidDragged = false;
let androidStartX = 0;
let androidStartY = 0;
let androidLastMoveTime = 0;

function showTouchRipple(x, y) {
  const ripple = document.createElement("div");
  ripple.className = "android-touch-ripple";
  ripple.style.left = `${x}px`;
  ripple.style.top = `${y}px`;
  androidOverlayEl.appendChild(ripple);
  setTimeout(() => ripple.remove(), 400);
}

function getPointerCoords(e) {
  const rect = androidOverlayEl.getBoundingClientRect();
  const clamp = (val, min, max) => Math.min(Math.max(val, min), max);
  const xPct = clamp(((e.clientX - rect.left) / rect.width) * 100, 0, 100);
  const yPct = clamp(((e.clientY - rect.top) / rect.height) * 100, 0, 100);
  return { xPct, yPct, relX: e.clientX - rect.left, relY: e.clientY - rect.top };
}

androidOverlayEl.addEventListener("pointerdown", (e) => {
  if (!androidConnected) return;
  e.preventDefault();
  androidPointerDown = true;
  androidDragged = false;
  androidStartX = e.clientX;
  androidStartY = e.clientY;
  try { androidOverlayEl.setPointerCapture(e.pointerId); } catch (err) {}

  const coords = getPointerCoords(e);
  showTouchRipple(coords.relX, coords.relY);
  sendAndroidAction({ type: "touch", action: "down", xPct: coords.xPct, yPct: coords.yPct });
});

androidOverlayEl.addEventListener("pointermove", (e) => {
  if (!androidConnected || !androidPointerDown) return;
  e.preventDefault();
  const dist = Math.hypot(e.clientX - androidStartX, e.clientY - androidStartY);
  if (dist > 5) androidDragged = true;

  const now = Date.now();
  if (now - androidLastMoveTime >= 16) {
    androidLastMoveTime = now;
    const coords = getPointerCoords(e);
    sendAndroidAction({ type: "touch", action: "move", xPct: coords.xPct, yPct: coords.yPct });
  }
});

const handleAndroidPointerEnd = async (e) => {
  if (!androidConnected || !androidPointerDown) return;
  try { androidOverlayEl.releasePointerCapture(e.pointerId); } catch (err) {}

  const coords = getPointerCoords(e);
  const wasDragged = androidDragged;
  androidPointerDown = false;
  androidDragged = false;

  sendAndroidAction({ type: "touch", action: "up", xPct: coords.xPct, yPct: coords.yPct, wasDragged });
};

androidOverlayEl.addEventListener("pointerup", handleAndroidPointerEnd);
androidOverlayEl.addEventListener("pointercancel", handleAndroidPointerEnd);

async function triggerAndroidCapture() {
  if (!androidConnected || !activeProjectId) {
    await alert("Please connect to an Android device first before capturing.", "warning");
    return;
  }

  const canvas = $("android-frame-canvas");
  const img = $("android-frame-img");
  const target = (canvas && canvas.style.display !== "none") ? canvas : img;
  if (target) {
    target.style.opacity = "0.3";
    setTimeout(() => { target.style.opacity = "1"; }, 150);
  }

  try {
    const capture = await api("/api/android/capture", {
      method: "POST",
      body: { projectId: activeProjectId }
    });
    showToast(`Captured Screen ${capture.id} (${capture.file})`, "success");
    await renderAndroidCaptures();
  } catch (e) {
    await alert("Capture failed: " + e.message);
  }
}

$("android-bottom-capture").onclick = triggerAndroidCapture;

async function renderAndroidCaptures() {
  await renderCaptureGallery(
    "android-captures-gallery",
    (c) => c.deviceLabel && c.deviceLabel.startsWith("Android"),
    "No screenshots captured yet."
  );
}

/* ============================================================
   Screen recording -- shared by the Live Web and Android views.
   Both expose the same /api/<view>/record/{start,stop} contract, so the only
   per-view differences are which button, which connected flag, and which
   gallery to refresh.
   ============================================================ */

const REC_ICON = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="7"></circle><circle cx="12" cy="12" r="3.5" fill="currentColor" stroke="none"></circle></svg>`;
const STOP_ICON = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" stroke="none"></rect></svg>`;

function setupRecorder(view, btnId, timerId, isConnected, refreshGallery) {
  const btn = $(btnId);
  const timer = $(timerId);
  if (!btn) return { stopIfActive: async () => {} };

  let active = false;
  let busy = false;
  let startedAt = 0;
  let tick = null;

  const paint = () => {
    btn.classList.toggle("recording", active);
    btn.innerHTML = active ? STOP_ICON : REC_ICON;
    btn.title = active ? "Stop Screen Recording" : "Start Screen Recording (MP4)";
    if (timer) timer.classList.toggle("active", active);
  };

  const showElapsed = () => {
    if (!timer) return;
    const s = Math.floor((Date.now() - startedAt) / 1000);
    const pad = (n) => String(n).padStart(2, "0");
    timer.textContent = `REC ${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
  };

  const finish = async () => {
    clearInterval(tick);
    tick = null;
    active = false;
    paint();
    try {
      const rec = await api(`/api/${view}/record/stop`, { method: "POST" });
      showToast(`Recorded Video ${rec.id} (${rec.durationSec}s)`, "success");
      await refreshGallery();
    } catch (e) {
      await alert("Recording failed: " + e.message);
    }
  };

  btn.onclick = async () => {
    if (busy) return;
    busy = true;
    try {
      if (active) {
        await finish();
        return;
      }
      if (!isConnected() || !activeProjectId) {
        await alert("Please connect a live session first before recording.", "warning");
        return;
      }
      await api(`/api/${view}/record/start`, { method: "POST", body: { projectId: activeProjectId } });
      active = true;
      startedAt = Date.now();
      paint();
      showElapsed();
      tick = setInterval(showElapsed, 500);
      showToast("Recording started", "info");
    } catch (e) {
      active = false;
      paint();
      await alert("Could not start recording: " + e.message);
    } finally {
      busy = false;
    }
  };

  paint();
  // Called before a disconnect: finalise rather than let the server abort and
  // throw the footage away.
  return { stopIfActive: async () => { if (active) await finish(); } };
}

const browserRecorder = setupRecorder("browser", "browser-bottom-record", "browser-rec-timer", () => browserConnected, renderLiveBrowserCaptures);
const androidRecorder = setupRecorder("android", "android-bottom-record", "android-rec-timer", () => androidConnected, renderAndroidCaptures);

// Connect / Disconnect Live Session
$("browser-connect-btn").onclick = async () => {
  await connectLiveBrowser();
};

const disconnectBtn = $("browser-disconnect-btn");
if (disconnectBtn) {
  disconnectBtn.onclick = async () => {
    await disconnectLiveBrowser();
  };
}

// Auto-reconnect when user changes resolution select while connected
$("browser-resolution-select").addEventListener("change", async () => {
  await renderLiveBrowserCaptures();
  if (browserConnected) {
    await disconnectLiveBrowser();
    await connectLiveBrowser();
  }
});

async function connectLiveBrowser() {
  const url = $("browser-url-input").value.trim();
  if (!url) {
    await alert("Please enter a starting URL.");
    return;
  }

  const resolutionKey = $("browser-resolution-select").value;
  const dims = resolutionKey.split("x");
  const width = Number(dims[0]);
  const height = Number(dims[1]);

  $("browser-connect-btn").disabled = true;
  $("browser-connect-btn").textContent = "Connecting...";
  $("live-browser-status").textContent = "Launching Playwright mobile Chromium browser...";

  try {
    const res = await api("/api/browser/start", {
      method: "POST",
      body: { projectId: activeProjectId, url, resolution: resolutionKey, width, height }
    });

    if (res.sessionExpired) {
      await Swal.fire({
        title: "Session Expired",
        text: "Demo login session has expired. Please login again.",
        icon: "warning",
        background: "#14161c",
        color: "#e6e6e6",
        confirmButtonColor: "#3b82f6",
        confirmButtonText: "OK"
      });
    }

    browserConnected = true;
    $("browser-connect-btn").style.display = "none";
    $("browser-connect-btn").disabled = false;
    $("browser-connect-btn").textContent = "Connect";
    if ($("browser-disconnect-btn")) {
      $("browser-disconnect-btn").style.display = "inline-flex";
      $("browser-disconnect-btn").disabled = false;
    }
    $("live-browser-status").textContent = "Live mobile session active. Click inside the device frame to interact.";
    $("browser-device-frame").style.display = "block";
    $("browser-bottom-controls").style.display = "flex";

    // Set viewport scaling preview aspect ratio matching the target mobile resolution
    const isTablet = resolutionKey === "2048x2732" || resolutionKey === "1200x1920";
    const aspect = height / width;
    
    // Calculate max height available dynamically (viewport height minus top bars/margins)
    const maxAvailableHeight = Math.max(400, window.innerHeight - 300);
    const standardWidth = isTablet ? 420 : 360;
    
    let previewWidth = standardWidth;
    let previewHeight = Math.round(previewWidth * aspect);
    
    if (previewHeight > maxAvailableHeight) {
      previewHeight = maxAvailableHeight;
      previewWidth = Math.round(previewHeight / aspect);
    }
    
    const frameEl = $("browser-viewport-container");
    frameEl.style.width = `${previewWidth}px`;
    frameEl.style.height = `${previewHeight}px`;
    
    const deviceFrame = $("browser-device-frame");
    if (deviceFrame) {
      deviceFrame.style.width = `${previewWidth}px`;
      deviceFrame.style.height = `${previewHeight}px`;
    }

    // Start frame streaming interval
    startFrameStream();
  } catch (e) {
    let cleanMsg = e.message || "Unknown error";
    cleanMsg = cleanMsg.replace(/Call log:[\s\S]*/gi, "").replace(/\[2m|\[22m/g, "").trim();

    if (/expired|session.*invalid|login again/i.test(cleanMsg)) {
      await Swal.fire({
        title: "Session Expired",
        text: "Demo login session has expired. Please login again.",
        icon: "warning",
        background: "#14161c",
        color: "#e6e6e6",
        confirmButtonColor: "#3b82f6",
        confirmButtonText: "OK"
      });
    } else if (/timeout|timed out/i.test(cleanMsg)) {
      await Swal.fire({
        title: "Connection Timeout",
        text: "The website took too long to respond. Please check the URL and try again.",
        icon: "error",
        background: "#14161c",
        color: "#e6e6e6",
        confirmButtonColor: "#3b82f6",
        confirmButtonText: "OK"
      });
    } else {
      await showAlert("Connection failed: " + cleanMsg, "error", "Connection Failed");
    }

    $("browser-connect-btn").style.display = "inline-flex";
    $("browser-connect-btn").disabled = false;
    $("browser-connect-btn").textContent = "Connect";
    if ($("browser-disconnect-btn")) $("browser-disconnect-btn").style.display = "none";
    $("live-browser-status").textContent = "Connection failed. Please check the URL and try again.";
  }
}

async function disconnectLiveBrowser() {
  await browserRecorder.stopIfActive();
  clearInterval(frameIntervalId);
  if ($("browser-disconnect-btn")) {
    $("browser-disconnect-btn").disabled = true;
    $("browser-disconnect-btn").textContent = "Disconnecting...";
  }

  try {
    await api("/api/browser/stop", { method: "POST" });
  } catch (e) {}

  browserConnected = false;
  $("browser-connect-btn").style.display = "inline-flex";
  $("browser-connect-btn").disabled = false;
  $("browser-connect-btn").textContent = "Connect";
  if ($("browser-disconnect-btn")) {
    $("browser-disconnect-btn").disabled = false;
    $("browser-disconnect-btn").textContent = "Disconnect";
    $("browser-disconnect-btn").style.display = "none";
  }
  $("live-browser-status").textContent = "Session closed. Click 'Connect' to start a new live session.";
  $("browser-device-frame").style.display = "none";
  $("browser-bottom-controls").style.display = "none";
}

let frameInFlight = false;
let isFastStream = false;
let boostTimer = null;

const loadNextFrame = () => {
  if (!browserConnected || frameInFlight) return;
  frameInFlight = true;
  const img = $("browser-frame-img");
  const newImg = new Image();
  newImg.onload = () => {
    img.src = newImg.src;
    frameInFlight = false;
  };
  newImg.onerror = () => {
    frameInFlight = false;
  };
  newImg.src = `/api/browser/frame?t=${Date.now()}`;
};

function startFrameStream() {
  clearInterval(frameIntervalId);
  loadNextFrame();
  frameIntervalId = setInterval(loadNextFrame, 200);
}

function boostFrameStream() {
  if (!browserConnected) return;
  if (!isFastStream) {
    isFastStream = true;
    clearInterval(frameIntervalId);
    frameIntervalId = setInterval(loadNextFrame, 75); // ~13 fps during active motion
  }
  clearTimeout(boostTimer);
  boostTimer = setTimeout(() => {
    isFastStream = false;
    clearInterval(frameIntervalId);
    frameIntervalId = setInterval(loadNextFrame, 200); // idle 5 fps
  }, 1000);
}

// Interactive touch & scroll events on the device frame
const imgEl = $("browser-frame-img");
const overlayEl = $("browser-interaction-overlay");

let isPointerDown = false;
let hasDragged = false;
let startX = 0;
let startY = 0;
let lastX = 0;
let lastY = 0;
let pointerStartTime = 0;

// Velocity Tracker History (last 120ms)
let moveHistory = [];

function recordMoveSample(x, y) {
  const now = performance.now();
  moveHistory.push({ x, y, t: now });
  while (moveHistory.length > 0 && now - moveHistory[0].t > 120) {
    moveHistory.shift();
  }
}

function getInstantVelocity() {
  if (moveHistory.length < 2) return { vx: 0, vy: 0 };
  const first = moveHistory[0];
  const last = moveHistory[moveHistory.length - 1];
  const dt = last.t - first.t;
  if (dt <= 0) return { vx: 0, vy: 0 };
  return {
    vx: (last.x - first.x) / dt,
    vy: (last.y - first.y) / dt
  };
}

// Kinetic Inertia Loop
let inertiaRafId = null;

function startMomentumInertia(vx, vy, xPct, yPct) {
  cancelAnimationFrame(inertiaRafId);
  const speed = Math.hypot(vx, vy);
  if (speed < 0.12) return; // Ignore very subtle slow releases

  // Initial impulse scaled to frame rate
  let momentumDx = -vx * 18 * 1.5;
  let momentumDy = -vy * 18 * 1.5;
  const friction = 0.91; // Smooth mobile friction deceleration

  const stepInertia = () => {
    if (!browserConnected) return;
    
    queueScroll(momentumDx, momentumDy, xPct, yPct);
    boostFrameStream();

    momentumDx *= friction;
    momentumDy *= friction;

    if (Math.hypot(momentumDx, momentumDy) > 0.4) {
      inertiaRafId = requestAnimationFrame(stepInertia);
    }
  };

  inertiaRafId = requestAnimationFrame(stepInertia);
}

// Non-blocking rAF scroll accumulator
let accumDeltaX = 0;
let accumDeltaY = 0;
let lastCursorXPct = 50;
let lastCursorYPct = 50;
let rafScheduled = false;

function flushScrollAccumulator() {
  if (!browserConnected) {
    accumDeltaX = 0;
    accumDeltaY = 0;
    rafScheduled = false;
    return;
  }

  const dx = accumDeltaX;
  const dy = accumDeltaY;
  const xPct = lastCursorXPct;
  const yPct = lastCursorYPct;

  accumDeltaX = 0;
  accumDeltaY = 0;
  rafScheduled = false;

  if (dx !== 0 || dy !== 0) {
    // Non-blocking fire-and-forget POST
    fetch("/api/browser/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "scroll", deltaX: dx, deltaY: dy, xPct, yPct })
    }).catch(() => {});
  }
}

function queueScroll(dx, dy, xPct, yPct) {
  accumDeltaX += dx;
  accumDeltaY += dy;
  if (xPct !== undefined) lastCursorXPct = xPct;
  if (yPct !== undefined) lastCursorYPct = yPct;

  if (!rafScheduled) {
    rafScheduled = true;
    requestAnimationFrame(flushScrollAccumulator);
  }
}

overlayEl.addEventListener("pointerdown", (e) => {
  if (!browserConnected) return;
  e.preventDefault();
  cancelAnimationFrame(inertiaRafId); // Catch moving screen instantly
  isPointerDown = true;
  hasDragged = false;
  startX = e.clientX;
  startY = e.clientY;
  lastX = e.clientX;
  lastY = e.clientY;
  pointerStartTime = Date.now();
  moveHistory = [{ x: e.clientX, y: e.clientY, t: performance.now() }];
  try { overlayEl.setPointerCapture(e.pointerId); } catch (err) {}
});

overlayEl.addEventListener("pointermove", (e) => {
  if (!browserConnected || !isPointerDown) return;
  e.preventDefault();

  recordMoveSample(e.clientX, e.clientY);

  const totalDist = Math.hypot(e.clientX - startX, e.clientY - startY);
  if (totalDist > 3) {
    hasDragged = true;
  }

  if (hasDragged) {
    const distX = e.clientX - lastX;
    const distY = e.clientY - lastY;

    if (distX !== 0 || distY !== 0) {
      lastX = e.clientX;
      lastY = e.clientY;

      const rect = overlayEl.getBoundingClientRect();
      const xPct = ((e.clientX - rect.left) / rect.width) * 100;
      const yPct = ((e.clientY - rect.top) / rect.height) * 100;

      // Dynamic velocity-sensitive scroll multiplier
      const stepSpeed = Math.hypot(distX, distY);
      const sensitivity = Math.min(Math.max(stepSpeed * 0.16, 1.4), 3.8);

      const deltaX = -distX * sensitivity;
      const deltaY = -distY * sensitivity;

      queueScroll(deltaX, deltaY, xPct, yPct);
      boostFrameStream();
    }
  }
});

const handlePointerEnd = async (e) => {
  if (!browserConnected || !isPointerDown) return;
  const elapsed = Date.now() - pointerStartTime;
  
  try { overlayEl.releasePointerCapture(e.pointerId); } catch (err) {}

  const rect = overlayEl.getBoundingClientRect();
  const xPct = Math.min(100, Math.max(0, ((e.clientX - rect.left) / rect.width) * 100));
  const yPct = Math.min(100, Math.max(0, ((e.clientY - rect.top) / rect.height) * 100));

  if (!hasDragged && elapsed < 350) {
    // Calculate exact contact coordinates using stable start coordinates to avoid release drift
    const tapXPct = Math.min(100, Math.max(0, ((startX - rect.left) / rect.width) * 100));
    const tapYPct = Math.min(100, Math.max(0, ((startY - rect.top) / rect.height) * 100));
    try {
      await api("/api/browser/action", {
        method: "POST",
        body: { type: "click", xPct: tapXPct, yPct: tapYPct }
      });
      boostFrameStream();
      imgEl.src = `/api/browser/frame?t=${Date.now()}`;
    } catch (err) {}
  } else if (hasDragged) {
    // Launch natural momentum inertia glide
    const { vx, vy } = getInstantVelocity();
    startMomentumInertia(vx, vy, xPct, yPct);
  }

  isPointerDown = false;
  hasDragged = false;
};

overlayEl.addEventListener("pointerup", handlePointerEnd);
overlayEl.addEventListener("pointercancel", handlePointerEnd);

// Wheel & Trackpad scroll listener
overlayEl.addEventListener("wheel", (e) => {
  if (!browserConnected) return;
  e.preventDefault();
  cancelAnimationFrame(inertiaRafId);
  const rect = overlayEl.getBoundingClientRect();
  const xPct = ((e.clientX - rect.left) / rect.width) * 100;
  const yPct = ((e.clientY - rect.top) / rect.height) * 100;
  
  queueScroll(e.deltaX * 1.5, e.deltaY * 1.5, xPct, yPct);
  boostFrameStream();
}, { passive: false });

// Keyboard text input helper when focusing the browser URL input
$("browser-url-input").addEventListener("keydown", async (e) => {
  if (e.key === "Enter" && browserConnected) {
    const url = $("browser-url-input").value.trim();
    if (url) {
      await api("/api/browser/action", {
        method: "POST",
        body: { type: "navigate", url }
      });
    }
  }
});

// Browser Navigation Actions
$("browser-back").onclick = async () => {
  if (!browserConnected) return;
  await api("/api/browser/action", { method: "POST", body: { type: "back" } });
};
$("browser-forward").onclick = async () => {
  if (!browserConnected) return;
  await api("/api/browser/action", { method: "POST", body: { type: "forward" } });
};
$("browser-reload").onclick = async () => {
  if (!browserConnected) return;
  await api("/api/browser/action", { method: "POST", body: { type: "reload" } });
};

// Bottom Controls Bar Actions
$("browser-bottom-back").onclick = async () => {
  if (!browserConnected) return;
  await api("/api/browser/action", { method: "POST", body: { type: "back" } });
};
$("browser-bottom-forward").onclick = async () => {
  if (!browserConnected) return;
  await api("/api/browser/action", { method: "POST", body: { type: "forward" } });
};
$("browser-bottom-reload").onclick = async () => {
  if (!browserConnected) return;
  await api("/api/browser/action", { method: "POST", body: { type: "reload" } });
};

// Capture Button Trigger
async function triggerScreenshotCapture() {
  if (!browserConnected || !activeProjectId) {
    await alert("Please connect to a live browser session first before capturing.", "warning");
    return;
  }
  
  // Visual flash feedback on the preview frame
  imgEl.style.opacity = "0.3";
  setTimeout(() => { imgEl.style.opacity = "1"; }, 150);

  try {
    const capture = await api("/api/browser/capture", {
      method: "POST",
      body: { projectId: activeProjectId }
    });
    showToast(`Captured Screen ${capture.id} (${capture.file})`, "success");
    await renderLiveBrowserCaptures();
  } catch (e) {
    await alert("Capture failed: " + e.message);
  }
}

// Bind Capture buttons (top bar and below phone frame)
$("browser-top-capture-btn").onclick = triggerScreenshotCapture;
$("browser-bottom-capture").onclick = triggerScreenshotCapture;

// Global hotkey Alt+C to capture screen when capture tab is active
document.addEventListener("keydown", async (e) => {
  const isCaptureTabActive = $("tab-capture").classList.contains("active");
  if (isCaptureTabActive && e.altKey && e.key.toLowerCase() === 'c') {
    e.preventDefault();
    const isAndroidSectionActive = $("capture-section-android").classList.contains("active");
    if (isAndroidSectionActive) {
      await triggerAndroidCapture();
    } else {
      await triggerScreenshotCapture();
    }
  }
});

/* ============================================================
   Studio Mockup tab
   ============================================================ */

let mockupId = null;
let mockupProject = null;
let mockupDevicesCatalog = [];
let mockupLayouts = { presets: [], grouped: [] };
let mockupOptions = { gradients: [], solids: [], patterns: [] };
let selectedCell = null; // { deviceRowId, columnId }

function mockupFileUrl(rel) { return `/api/mockups/${mockupId}/file?p=${encodeURIComponent(rel)}`; }

async function loadMockupProjectInto(id) {
  mockupId = id;
  if (id) {
    try {
      mockupProject = await api(`/api/mockups/${id}`);
      $("mockup-project-label").textContent = mockupProject.name;
      $("mockup-panorama-flip").checked = mockupProject.globalPanoramic?.flip || false;
    } catch (e) {
      console.error("Failed to load mockup project:", e);
      mockupProject = null;
      $("mockup-project-label").textContent = "No mockup project loaded";
    }
  } else {
    mockupProject = null;
    $("mockup-project-label").textContent = "No mockup project selected";
  }

  await ensureMockupReferenceData();
  renderMockupTemplateGrid();

  if (mockupProject) {
    renderMockupMatrix();
    renderMockupDevicesSection();
    renderMockupSettingsSection();
  } else {
    $("mockup-matrix").innerHTML = `<tr><td class="hint" style="padding:2rem; text-align:center;">Select or create a project first from the Projects List.</td></tr>`;
  }
}

async function ensureMockupReferenceData() {
  if (mockupDevicesCatalog.length === 0) {
    const res = await api("/api/devices");
    const devices = Array.isArray(res) ? res : (Array.isArray(res?.devices) ? res.devices : []);
    mockupDevicesCatalog = devices;
    $("mockup-add-device-select").innerHTML = devices.map((d) => `<option value="${d.id}">${d.vendor} — ${d.name}</option>`).join("");
    $("mockup-preview-device").innerHTML = "";
  }
  if (mockupLayouts.presets.length === 0) {
    mockupLayouts = await api("/api/mockups/layouts");
    $("mk-layout").innerHTML = mockupLayouts.grouped
      .map((g) => `<optgroup label="${g.name}">${g.slugs.map((s) => `<option value="${s}">${mockupLayouts.presets.find((p) => p.slug === s)?.name ?? s}</option>`).join("")}</optgroup>`)
      .join("");
  }
  if (mockupOptions.gradients.length === 0) {
    const opts = mockupOptions;
    // gradients/solids/patterns are static lists baked into shared.ts -- fetch once via a lightweight probe using an empty background resolve on the server is unnecessary; declare them here to match render/shared.ts exactly.
    opts.gradients = ["ocean", "royal", "sunset", "mint", "graphite", "light", "candy", "aurora", "citrus", "violet"];
    opts.solids = ["solid-navy", "solid-charcoal", "solid-white", "solid-cream", "solid-indigo", "solid-forest"];
    opts.patterns = ["dots", "grid", "diagonal", "mesh", "waves"];
  }
}

const CATEGORY_LABELS = {
  "travel-and-local": "Travel & Local",
  music: "Music",
  business: "Business",
  books: "Books",
  productivity: "Productivity",
  "social-networking": "Social Networking",
  entertainment: "Entertainment",
  "food-and-drink": "Food & Drink",
  "photo-and-video": "Photo & Video",
  utilities: "Utilities",
  education: "Education",
};

function categoryLabel(id) { return CATEGORY_LABELS[id] || id; }

let mockupTemplates = [];
let mockupTemplateCategory = "all";
let mockupTemplateDetailId = null;

async function ensureMockupTemplates() {
  if (mockupTemplates.length === 0) {
    const { templates } = await api("/api/mockups/templates");
    mockupTemplates = templates;
  }
  return mockupTemplates;
}

function templateCategoryCounts(templates) {
  const counts = {};
  for (const t of templates) counts[t.category] = (counts[t.category] || 0) + 1;
  return Object.keys(counts)
    .sort((a, b) => categoryLabel(a).localeCompare(categoryLabel(b)))
    .map((id) => ({ id, label: categoryLabel(id), count: counts[id] }));
}

function renderMockupTemplateFilters(templates) {
  const rail = $("mockup-template-filters");
  const cats = templateCategoryCounts(templates);
  rail.innerHTML = [`<div class="filter-item ${mockupTemplateCategory === "all" ? "active" : ""}" data-cat="all">All <span class="count">${templates.length}</span></div>`]
    .concat(cats.map((c) => `<div class="filter-item ${mockupTemplateCategory === c.id ? "active" : ""}" data-cat="${c.id}">${c.label} <span class="count">${c.count}</span></div>`))
    .join("");
  rail.querySelectorAll(".filter-item").forEach((el) => {
    el.onclick = () => {
      mockupTemplateCategory = el.dataset.cat;
      renderMockupTemplateFilters(templates);
      renderMockupTemplateCards(templates);
    };
  });
}

function renderMockupTemplateCards(templates) {
  const grid = $("mockup-template-grid");
  const filtered = mockupTemplateCategory === "all" ? templates : templates.filter((t) => t.category === mockupTemplateCategory);

  if (filtered.length === 0) {
    grid.innerHTML = `<div class="template-empty">No templates in this category.</div>`;
    return;
  }

  grid.innerHTML = filtered
    .map(
      (t) => `
    <div class="template-card" data-id="${t.id}">
      <div class="template-thumb">
        <img src="/api/mockups/template-thumb/${encodeURIComponent(t.id)}.png" alt="${t.name}" loading="lazy" onload="this.classList.add('loaded')" />
      </div>
      <div class="template-card-body">
        <div class="template-card-row">
          <div>
            <div class="template-cat">${categoryLabel(t.category)}</div>
            <h4>${t.name}</h4>
          </div>
          <span class="pill">${t.columnCount} screens</span>
        </div>
        <div class="template-card-actions">
          <button type="button" class="secondary small" data-action="preview">Preview</button>
          <button type="button" class="small" data-action="load">Load</button>
        </div>
      </div>
    </div>`
    )
    .join("");

  grid.querySelectorAll(".template-card").forEach((card) => {
    const id = card.dataset.id;
    card.querySelector('[data-action="preview"]').onclick = (e) => { e.stopPropagation(); openMockupTemplateDetail(id); };
    card.querySelector('[data-action="load"]').onclick = (e) => { e.stopPropagation(); loadMockupTemplateNow(id); };
    card.onclick = () => openMockupTemplateDetail(id);
  });
}

function renderTemplateSkeletons(gridId, count = 8) {
  const grid = $(gridId);
  if (!grid) return;
  grid.innerHTML = Array.from({ length: count })
    .map(
      () => `<div class="template-card skeleton">
        <div class="template-thumb skeleton-block"></div>
        <div class="template-card-body">
          <div class="skeleton-line" style="width:40%"></div>
          <div class="skeleton-line" style="width:70%; height:1.1rem;"></div>
          <div class="skeleton-line" style="width:100%; height:2rem; margin-top:auto;"></div>
        </div>
      </div>`
    )
    .join("");
}

async function renderMockupTemplateGrid() {
  renderTemplateSkeletons("mockup-template-grid");
  const templates = await ensureMockupTemplates();
  closeMockupTemplateDetail();
  renderMockupTemplateFilters(templates);
  renderMockupTemplateCards(templates);
}

function openMockupTemplateDetail(id) {
  const t = mockupTemplates.find((x) => x.id === id);
  if (!t) return;
  mockupTemplateDetailId = id;
  $("mockup-template-browse").style.display = "none";
  const detail = $("mockup-template-detail");
  detail.style.display = "block";
  detail.innerHTML = `
    <div class="detail-topbar">
      <button type="button" class="secondary small" id="mockup-detail-back">&larr; Back to templates</button>
      <button type="button" id="mockup-detail-load-btn">Load Template</button>
    </div>
    <div class="template-detail template-detail-mockup">
      <div class="template-detail-thumb">
        <img src="/api/mockups/template-detail-thumb/${encodeURIComponent(t.id)}.png" alt="${t.name}" />
      </div>
      <div class="template-detail-side">
        <div class="template-cat">${categoryLabel(t.category)}</div>
        <h2 style="margin:.2rem 0;">${t.name}</h2>
        <p class="hint" style="margin:.3rem 0 1rem;">${t.description || ""}</p>
        <div class="detail-facts">
          <div><span>Screens</span><strong>${t.columnCount}</strong></div>
          <div><span>Layout</span><strong>${t.layout.replace("snapshot-", "Snapshot ").replace(/-/g, " ")}</strong></div>
          <div><span>Devices</span><strong>${t.devices.map((d) => d.label).join(", ")}</strong></div>
        </div>
        ${t.titles && t.titles.length ? `<div class="detail-screens"><span>Screen titles</span><ul>${t.titles.map((x) => `<li>${x}</li>`).join("")}</ul></div>` : ""}
      </div>
    </div>
  `;
  $("mockup-detail-back").onclick = closeMockupTemplateDetail;
  $("mockup-detail-load-btn").onclick = () => loadMockupTemplateNow(id);
}

function closeMockupTemplateDetail() {
  mockupTemplateDetailId = null;
  $("mockup-template-browse").style.display = "";
  $("mockup-template-detail").style.display = "none";
  $("mockup-template-detail").innerHTML = "";
}

async function loadMockupTemplateNow(id) {
  if (!mockupId) {
    await alert("Start a mockup project first.");
    return;
  }
  const t = mockupTemplates.find((x) => x.id === id);
  if (mockupProject && (mockupProject.devices.length > 0 || mockupProject.columns.length > 0)) {
    const ok = await confirm("You have unsaved screenshots. Are you sure you want a new project?");
    if (!ok) return;
  }
  mockupProject = await api(`/api/mockups/${mockupId}/apply-template`, { method: "POST", body: { templateId: id } });
  renderMockupMatrix();
  renderMockupDevicesSection();
  closeMockupTemplateDetail();
  showToast(`Applied "${t ? t.name : id}" — ${mockupProject.devices.length} device row(s), ${mockupProject.columns.length} screen(s).`, "success");
}


/* ---- Editor section: devices x columns matrix ---- */
function renderMockupMatrix() {
  const table = $("mockup-matrix");
  table.innerHTML = "";
  if (!mockupProject) return;
  const columns = [...mockupProject.columns].sort((a, b) => a.order - b.order);

  const headRow = document.createElement("tr");
  headRow.innerHTML = '<th class="row-head">Device</th>' + columns.map((c, i) => `<th class="col-head">Screen ${i + 1}</th>`).join("") + '<th class="matrix-add-col"></th>';
  table.appendChild(headRow);

  for (const row of mockupProject.devices) {
    const tr = document.createElement("tr");
    const head = document.createElement("td");
    head.className = "row-head";
    head.textContent = row.label + (row.previewsVisible ? "" : " (hidden)");
    tr.appendChild(head);
    for (const col of columns) {
      const td = document.createElement("td");
      td.className = "cell";
      const isSelected = selectedCell && selectedCell.deviceRowId === row.id && selectedCell.columnId === col.id;
      if (isSelected) td.classList.add("selected");
      td.innerHTML = `<iframe src="/api/mockups/${mockupId}/cell-preview/${row.id}/${col.id}?width=220&height=390" width="220" height="390"></iframe>`;
      td.onclick = () => selectCell(row.id, col.id);
      tr.appendChild(td);
    }
    table.appendChild(tr);
  }

  if (mockupProject.devices.length === 0) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td class="row-head">No device rows yet</td><td colspan="${columns.length + 1}" class="hint" style="padding:1rem;">Add a device row from the Devices section.</td>`;
    table.appendChild(tr);
  }
}

$("mockup-add-column").onclick = async () => {
  if (!mockupId) {
    await alert("Start a project first.");
    return;
  }
  const { project } = await api(`/api/mockups/${mockupId}/columns`, { method: "POST" });
  mockupProject = project;
  renderMockupMatrix();
};

function selectCell(deviceRowId, columnId) {
  selectedCell = { deviceRowId, columnId };
  renderMockupMatrix();
  $("mockup-inspector").style.display = "block";
  const row = mockupProject.devices.find((d) => d.id === deviceRowId);
  const colIndex = mockupProject.columns.findIndex((c) => c.id === columnId) + 1;
  $("mockup-inspector-target").textContent = `${row.label} — Screen ${colIndex}`;

  const cellKey = `${deviceRowId}:${columnId}`;
  const hasOverride = Boolean(mockupProject.cells[cellKey]);
  $("mk-cell-override").checked = hasOverride;
  const column = mockupProject.columns.find((c) => c.id === columnId);
  const style = hasOverride ? { ...column.style, ...mockupProject.cells[cellKey] } : column.style;

  $("mk-layout").value = style.layout;
  $("mk-title").value = style.title.text;
  $("mk-title-color").value = style.title.color;
  $("mk-subtitle").value = style.subtitle.text;

  $("mk-bg-type").value = style.background.type;
  populateBgValueSelect(style.background.type, style.background.value);

  const mockupGroups = {};
  for (const s of mockupProject.sources || []) {
    const res = s.resolution || "Uploads / General";
    if (!mockupGroups[res]) mockupGroups[res] = [];
    mockupGroups[res].push(s);
  }
  let mockupSourceHtml = '<option value="">(None)</option>';
  for (const [res, items] of Object.entries(mockupGroups)) {
    mockupSourceHtml += `<optgroup label="${res}">`;
    for (const s of items) {
      mockupSourceHtml += `<option value="${s.id}">${s.name}</option>`;
    }
    mockupSourceHtml += `</optgroup>`;
  }
  $("mk-source").innerHTML = mockupSourceHtml;
  if (style.deviceOne.sourceId) $("mk-source").value = style.deviceOne.sourceId;

  $("mk-d1-size").value = style.deviceOne.size; $("mk-d1-size-val").textContent = style.deviceOne.size;
  $("mk-d1-x").value = style.deviceOne.x; $("mk-d1-x-val").textContent = style.deviceOne.x;
  $("mk-d1-y").value = style.deviceOne.y; $("mk-d1-y-val").textContent = style.deviceOne.y;
  $("mk-d1-rotate").value = style.deviceOne.rotation; $("mk-d1-rotate-val").textContent = style.deviceOne.rotation;
  $("mk-d1-brightness").value = style.deviceOne.brightness; $("mk-d1-brightness-val").textContent = style.deviceOne.brightness;
  $("mk-d1-frameless").checked = style.deviceOne.frameless;

  renderMkDecorations(style.decorations || []);
}

function populateBgValueSelect(type, current) {
  const select = $("mk-bg-value");
  const list = type === "solid" ? mockupOptions.solids : type === "pattern" ? mockupOptions.patterns : type === "gradient" ? mockupOptions.gradients : [];
  select.style.display = list.length ? "" : "none";
  select.innerHTML = list.map((v) => `<option value="${v}">${v.replace("solid-", "")}</option>`).join("");
  if (current) select.value = current;
}
$("mk-bg-type").onchange = () => populateBgValueSelect($("mk-bg-type").value, "");

for (const [id, out] of [
  ["mk-d1-size", "mk-d1-size-val"], ["mk-d1-x", "mk-d1-x-val"], ["mk-d1-y", "mk-d1-y-val"],
  ["mk-d1-rotate", "mk-d1-rotate-val"], ["mk-d1-brightness", "mk-d1-brightness-val"],
]) {
  $(id).oninput = () => { $(out).textContent = $(id).value; };
}

let mkDecorationCounter = 0;
function renderMkDecorations(decorations) {
  const container = $("mk-decorations");
  container.innerHTML = "";
  for (const d of decorations) container.appendChild(mkDecorationRow(d));
}
function mkDecorationRow(d) {
  const row = document.createElement("div");
  row.className = "decoration-row";
  row.innerHTML = `
    <select class="dec-kind">
      <option value="icon" ${d.kind === "icon" ? "selected" : ""}>Icon</option>
      <option value="badge" ${d.kind === "badge" ? "selected" : ""}>Badge</option>
      <option value="shape" ${d.kind === "shape" ? "selected" : ""}>Shape</option>
    </select>
    <input class="dec-content" type="text" value="${d.content ?? ""}" placeholder="emoji / text / shape id" />
    <input class="dec-color" type="color" value="${d.color || "#ffffff"}" />
    <input class="dec-size" type="number" value="${d.sizePct || 10}" min="2" max="60" style="width:4rem" title="size %" />
    <input class="dec-rotate" type="number" value="${d.rotate || 0}" min="-180" max="180" style="width:4rem" title="rotate deg" />
    <button type="button" class="small danger dec-remove">&times;</button>
  `;
  row.querySelector(".dec-remove").onclick = () => row.remove();
  return row;
}
$("mk-decoration-add").onclick = () => {
  const id = "dec_" + (++mkDecorationCounter) + "_" + Date.now();
  $("mk-decorations").appendChild(mkDecorationRow({ id, kind: "icon", content: "⭐", color: "#ffe066", sizePct: 12, rotate: 0 }));
};
function mkDecorationsFromForm() {
  return [...$("mk-decorations").children].map((row, i) => ({
    id: "dec_" + i,
    kind: row.querySelector(".dec-kind").value,
    content: row.querySelector(".dec-content").value,
    color: row.querySelector(".dec-color").value,
    sizePct: Number(row.querySelector(".dec-size").value) || 10,
    rotate: Number(row.querySelector(".dec-rotate").value) || 0,
    xPct: 50, yPct: 15,
  }));
}

function buildCellStyleFromForm() {
  return {
    layout: $("mk-layout").value,
    title: { text: $("mk-title").value, color: $("mk-title-color").value, size: 58, align: "center" },
    subtitle: { text: $("mk-subtitle").value, color: $("mk-title-color").value, size: 58, align: "center" },
    background: { type: $("mk-bg-type").value, value: $("mk-bg-value").value },
    deviceOne: {
      sourceId: $("mk-source").value || undefined,
      size: Number($("mk-d1-size").value), x: Number($("mk-d1-x").value), y: Number($("mk-d1-y").value),
      rotation: Number($("mk-d1-rotate").value), brightness: Number($("mk-d1-brightness").value),
      frameless: $("mk-d1-frameless").checked,
    },
    decorations: mkDecorationsFromForm(),
  };
}

$("mk-source-upload").onclick = async () => {
  if (!activeProjectId) {
    await alert("Select a project first.");
    return;
  }
  openUniversalUploadModal((selectedPath) => {
    setTimeout(async () => {
      mockupProject = await api(`/api/mockups/${activeProjectId}`);
      // Re-populate the source dropdown and select the newly selected screenshot
      $("mk-source").innerHTML = (mockupProject.sources || []).map((s) => `<option value="${s.id}">${s.name}</option>`).join("");
      const src = mockupProject.sources.find(s => s.file === selectedPath);
      if (src) {
        $("mk-source").value = src.id;
      }
    }, 200);
  });
};

$("mk-save").onclick = async () => {
  if (!selectedCell) return;
  const style = buildCellStyleFromForm();
  if ($("mk-cell-override").checked) {
    await api(`/api/mockups/${mockupId}/cells/${selectedCell.deviceRowId}/${selectedCell.columnId}`, { method: "PUT", body: { override: style } });
  } else {
    await api(`/api/mockups/${mockupId}/columns/${selectedCell.columnId}`, { method: "PUT", body: { style } });
    await api(`/api/mockups/${mockupId}/cells/${selectedCell.deviceRowId}/${selectedCell.columnId}`, { method: "PUT", body: { override: null } });
  }
  mockupProject = await api(`/api/mockups/${mockupId}`);
  renderMockupMatrix();
};

$("mk-copy-style").onclick = async () => {
  if (!selectedCell) return;
  const style = buildCellStyleFromForm();
  await api(`/api/mockups/${mockupId}/columns/${selectedCell.columnId}`, { method: "PUT", body: { style } });
  for (const row of mockupProject.devices) {
    await api(`/api/mockups/${mockupId}/cells/${row.id}/${selectedCell.columnId}`, { method: "PUT", body: { override: null } });
  }
  mockupProject = await api(`/api/mockups/${mockupId}`);
  renderMockupMatrix();
  await alert("Style copied across all device rows for this screen.");
};

$("mk-ai-text").onclick = async () => {
  const hint = await prompt("Briefly describe this screen (used only to generate the title/subtitle):", $("mk-title").value);
  if (hint === null) return;
  try {
    const { title, subtitle } = await api(`/api/mockups/${mockupId}/ai-text`, { method: "POST", body: { hint } });
    if (title) $("mk-title").value = title;
    if (subtitle) $("mk-subtitle").value = subtitle;
  } catch (e) { await alert("AI assist failed: " + e.message); }
};

/* ---- Devices section ---- */
function renderMockupDevicesSection() {
  const list = $("mockup-device-list");
  list.innerHTML = "";
  if (!mockupProject) return;
  $("mockup-preview-device").innerHTML = mockupProject.devices.map((d) => `<option value="${d.id}">${d.label}</option>`).join("");
  for (const row of mockupProject.devices) {
    const el = document.createElement("div");
    el.className = "provider-row";
    el.innerHTML = `
      <span class="provider-name">${row.label}</span>
      <span class="provider-meta">${row.deviceId}${row.isBase ? " (base)" : ""}</span>
      <label class="checkbox-row" style="margin:0"><input type="checkbox" ${row.previewsVisible ? "checked" : ""} class="row-visible" /> Visible</label>
      <button class="small danger" type="button">Remove</button>
    `;
    el.querySelector(".row-visible").onchange = async (e) => {
      await api(`/api/mockups/${mockupId}/devices/${row.id}`, { method: "PATCH", body: { previewsVisible: e.target.checked } });
      mockupProject = await api(`/api/mockups/${mockupId}`);
    };
    el.querySelector("button.danger").onclick = async () => {
      await api(`/api/mockups/${mockupId}/devices/${row.id}`, { method: "DELETE" });
      mockupProject = await api(`/api/mockups/${mockupId}`);
      renderMockupDevicesSection();
      renderMockupMatrix();
    };
    list.appendChild(el);
  }
}
$("mockup-add-device-select").onchange = () => {
  const device = mockupDevicesCatalog.find((d) => d.id === $("mockup-add-device-select").value);
  const select = $("mockup-add-device-variant");
  select.innerHTML = '<option value="">default</option>';
  if (device?.variants) for (const v of device.variants) select.innerHTML += `<option value="${v.id}">${v.name}</option>`;
};
$("mockup-add-device-btn").onclick = async () => {
  if (!mockupId) {
    await alert("Start a project first.");
    return;
  }
  const deviceId = $("mockup-add-device-select").value;
  const label = $("mockup-add-device-label").value.trim() || deviceId;
  const { project } = await api(`/api/mockups/${mockupId}/devices`, { method: "POST", body: { deviceId, variant: $("mockup-add-device-variant").value || undefined, label } });
  mockupProject = project;
  $("mockup-add-device-label").value = "";
  renderMockupDevicesSection();
  renderMockupMatrix();
};

/* ---- Panoramic section ---- */
$("mockup-panorama-upload").onclick = async () => {
  const file = $("mockup-panorama-file").files[0];
  if (!file || !mockupId) {
    await alert("Choose an image first.");
    return;
  }
  await uploadFile(`/api/mockups/${mockupId}/panoramic`, file);
  await alert("Panorama uploaded. Set a column's background type to Panoramic in the Editor to use it.");
};
$("mockup-panorama-flip").onchange = async () => {
  await api(`/api/mockups/${mockupId}/panoramic`, { method: "PATCH", body: { flip: $("mockup-panorama-flip").checked } });
};

/* ---- Preview section ---- */
$("mockup-preview-refresh").onclick = () => {
  const deviceRowId = $("mockup-preview-device").value;
  const strip = $("mockup-preview-strip");
  strip.innerHTML = "";
  if (!mockupProject || !deviceRowId) return;
  const columns = [...mockupProject.columns].sort((a, b) => a.order - b.order);
  for (const col of columns) {
    const frame = document.createElement("iframe");
    frame.src = `/api/mockups/${mockupId}/cell-preview/${deviceRowId}/${col.id}?width=320&height=568`;
    frame.width = 320; frame.height = 568; frame.style.border = "1px solid #21252f"; frame.style.borderRadius = "8px"; frame.style.flex = "0 0 auto";
    strip.appendChild(frame);
  }
};

/* ---- Settings section ---- */
function renderMockupSettingsSection() {
  if (!mockupProject) return;
  $("mockup-set-name").value = mockupProject.name;
  $("mockup-set-category").value = mockupProject.appCategory;
  $("mockup-set-inspector-position").value = mockupProject.settings.inspectorPosition;
}
$("mockup-settings-save").onclick = async () => {
  mockupProject = await api(`/api/mockups/${mockupId}/settings`, {
    method: "PATCH",
    body: { name: $("mockup-set-name").value, appCategory: $("mockup-set-category").value, inspectorPosition: $("mockup-set-inspector-position").value },
  });
  $("mockup-project-label").textContent = mockupProject.name;
  $("mockup-inspector").classList.toggle("left", mockupProject.settings.inspectorPosition === "left");
};

/* ---- Template level import/export ---- */
$("mockup-export-template-btn").onclick = async () => {
  if (!mockupId || !mockupProject) {
    await alert("Please select or create a project first from the Projects List.");
    return;
  }
  const exportData = {
    devices: mockupProject.devices,
    columns: mockupProject.columns,
    cells: mockupProject.cells,
    globalPanoramic: mockupProject.globalPanoramic
  };
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportData, null, 2));
  const downloadAnchor = document.createElement("a");
  downloadAnchor.setAttribute("href", dataStr);
  downloadAnchor.setAttribute("download", `${mockupProject.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-template.json`);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
};

$("mockup-import-template-btn").onclick = async () => {
  if (!mockupId || !mockupProject) {
    await alert("Please select or create a project first from the Projects List.");
    return;
  }
  $("mockup-import-file-input").click();
};

$("mockup-import-file-input").onchange = async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async (event) => {
    try {
      const data = JSON.parse(event.target.result);
      if (!data.devices || !data.columns) {
        throw new Error("Invalid template format: Missing devices or columns");
      }
      mockupProject = await api(`/api/mockups/${mockupId}/import-template`, {
        method: "POST",
        body: data
      });
      await alert("Template imported successfully!", "success");
      // Reload UI
      renderMockupMatrix();
      renderMockupDevicesSection();
      renderMockupSettingsSection();
    } catch (err) {
      await alert("Failed to import template: " + err.message, "error");
    }
  };
  reader.readAsText(file);
  e.target.value = "";
};

/* ---- Export section ---- */
$("mockup-export-run").onclick = async () => {
  $("mockup-export-run").disabled = true;
  $("mockup-export-result").textContent = "Exporting…";
  try {
    const result = await api(`/api/mockups/${mockupId}/export`, { method: "POST" });
    const kb = (result.bytes / 1024).toFixed(1);
    let html = `<div>ZIP ready — ${kb} KB. <a href="/api/mockups/${mockupId}/download/zip" target="_blank"><button type="button" class="secondary small">Download ZIP</button></a></div>`;
    html += "<ul>" + result.entries.map((e) => `<li>${e.label}: ${e.files} files (${e.width}&times;${e.height})</li>`).join("") + "</ul>";
    $("mockup-export-result").innerHTML = html;
  } catch (e) {
    $("mockup-export-result").textContent = "Export failed: " + e.message;
  } finally {
    $("mockup-export-run").disabled = false;
  }
};

/* ============================================================
   Video tab
   ============================================================ */

let videoId = null;
let videoProject = null;
let videoSceneOptions = { animations: [], backgrounds: [], layouts: { "9:16": [], "16:9": [] } };
let videoDevices = [];
let selectedSceneId = null;

function videoFileUrl(rel) { return `/api/videos/${videoId}/file?p=${encodeURIComponent(rel)}`; }

async function loadVideoProjectInto(id) {
  videoId = id;
  if (id) {
    try {
      videoProject = await api(`/api/videos/${id}`);
      $("video-project-label").textContent = videoProject.name;
    } catch (e) {
      console.error("Failed to load video project:", e);
      videoProject = null;
      $("video-project-label").textContent = "No video project loaded";
    }
  } else {
    videoProject = null;
    $("video-project-label").textContent = "No video project selected";
  }

  try {
    if (!Array.isArray(videoDevices) || videoDevices.length === 0) {
      const res = await api("/api/devices");
      videoDevices = Array.isArray(res) ? res : (Array.isArray(res?.devices) ? res.devices : []);
    }
    if (videoSceneOptions.animations.length === 0) videoSceneOptions = await api("/api/videos/scene-options");
  } catch (e) {
    console.error("Failed to load video reference data:", e);
  }

  renderVideoTemplateGrid();
  if (videoProject && videoProject.template && videoProject.scenes?.length) {
    renderVideoScenes();
    const scenesRailBtn = document.querySelector('#tab-video .rail-btn[data-section="scenes"]');
    if (scenesRailBtn) scenesRailBtn.classList.add("active");
    const templatesRailBtn = document.querySelector('#tab-video .rail-btn[data-section="templates"]');
    if (templatesRailBtn) templatesRailBtn.classList.remove("active");
    $("video-section-scenes").classList.add("active");
    $("video-section-templates").classList.remove("active");
  } else {
    $("video-scene-nav").innerHTML = "";
    const scenesRailBtn = document.querySelector('#tab-video .rail-btn[data-section="scenes"]');
    if (scenesRailBtn) scenesRailBtn.classList.remove("active");
    const templatesRailBtn = document.querySelector('#tab-video .rail-btn[data-section="templates"]');
    if (templatesRailBtn) templatesRailBtn.classList.add("active");
    $("video-section-scenes").classList.remove("active");
    $("video-section-templates").classList.add("active");
  }
}

let videoTemplates = [];
let videoTemplateDetailId = null;
let videoDetailSceneIndex = 0;
let videoDetailState = "idle"; // idle | playing | paused | ended
let videoDetailMode = "sequence"; // sequence | scene
let videoDetailAudio = null;
let videoDetailResizeObserver = null;
let hostPlaybackTick = null;

async function ensureVideoTemplates() {
  if (videoTemplates.length === 0) {
    const { templates } = await api("/api/videos/templates");
    videoTemplates = templates;
  }
  return videoTemplates;
}

function totalDuration(t) {
  return t.scenes.reduce((sum, s) => sum + s.durationSeconds, 0);
}

/** Persistent secondary nav (mirrors Studio Mockup's rail pattern): a
 *  vertical list of template cards down the left side of the section,
 *  always visible, with the selected one's preview shown in the stage next
 *  to it -- no separate browse/detail screens to navigate between. */
function isLandscapeTemplate(t) { return t.aspectRatio === "16:9"; }
function canvasSizeFor(t) { return isLandscapeTemplate(t) ? "1920 × 1080 (16:9)" : "1080 × 1920 (9:16)"; }
function orientationFor(t) { return isLandscapeTemplate(t) ? "Landscape" : "Portrait"; }

function renderVideoTemplateList(templates, activeId) {
  const list = $("video-template-list");
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

async function renderVideoTemplateGrid() {
  $("video-template-list").innerHTML = "";
  $("video-template-stage").innerHTML = "";
  const templates = await ensureVideoTemplates();
  const keepId = videoTemplateDetailId && templates.some((t) => t.id === videoTemplateDetailId) ? videoTemplateDetailId : templates[0]?.id;
  if (keepId) openVideoTemplateDetail(keepId);
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
 *  <audio> element kept in lockstep with the iframe player's pushed state
 *  (see onState below), so the preview is never silent for a template that
 *  will ship with music in the rendered MP4, and always stops hard when the
 *  sequence ends (never auto-restarts). */
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
  playBtn.innerHTML = ended ? "&#8635; Replay" : playing ? "&#10074;&#10074; Pause" : "&#9654; Play";
  $("video-detail-prev").disabled = videoDetailSceneIndex <= 0;
  $("video-detail-next").disabled = videoDetailSceneIndex >= t.scenes.length - 1;

  const hostPlayBtn = $("host-play-btn");
  if (hostPlayBtn) {
    hostPlayBtn.innerHTML = ended ? "&#8635;" : playing ? "&#10074;&#10074;" : "&#9654;";
  }

  const stage = $("video-template-stage");
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
  // Auto-scroll the (independently-scrolling) scene list to keep the active
  // card visible during playback, without moving the video box or the page.
  if (activeCard) activeCard.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

/** Selects one scene and holds it, unplayed -- clicking a scene card must
 *  show only that scene, never start playback of it or of anything after. */
function videoDetailShowScene(id, index) {
  const t = videoTemplates.find((x) => x.id === id);
  if (!t) return;
  const api = videoPlayerApi();
  videoDetailSceneIndex = Math.max(0, Math.min(index, t.scenes.length - 1));
  if (api) api.goto(videoDetailSceneIndex);
  else { videoDetailMode = "scene"; videoDetailState = "idle"; videoDetailRefreshUi(t); }
}

/** Plays exactly one scene, once -- distinct from the main Play control,
 *  which plays the full sequence. Never advances into the next scene. */
function videoDetailPlayScene(id, index) {
  const api = videoPlayerApi();
  if (!api) return;
  videoDetailSceneIndex = Math.max(0, index);
  api.playScene(index);
}

function videoDetailTogglePlay(id) {
  const api = videoPlayerApi();
  if (!api) return;
  if (videoDetailState === "playing") {
    api.pause();
  } else {
    if (videoDetailState === "ended") api.replay();
    else api.play();
  }
}

function startHostPlaybackTick(id) {
  if (hostPlaybackTick) clearInterval(hostPlaybackTick);
  hostPlaybackTick = setInterval(() => {
    const api = videoPlayerApi();
    if (!api) return;
    
    const currentMs = api.globalTimeMs || 0;
    const totalMs = api.totalDuration || 1;
    
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

/** Registered once per iframe load: the preview document pushes every
 *  playback transition here instead of the host polling it, so there is no
 *  race and no missed "ended" transition. Drives the BGM <audio> element in
 *  lockstep -- starts/stops/pauses with the CSS player, hard-stops on
 *  "ended" so it never lingers or auto-restarts. */
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

/** Renders the selected template's preview into the persistent stage next
 *  to the template list -- no browse/detail screens to navigate between,
 *  same structural pattern as Studio Mockup's rail + content area. */
function openVideoTemplateDetail(id) {
  const t = videoTemplates.find((x) => x.id === id);
  if (!t) return;
  if (videoDetailResizeObserver) { videoDetailResizeObserver.disconnect(); videoDetailResizeObserver = null; }
  videoTemplateDetailId = id;
  videoDetailSceneIndex = 0;
  videoDetailMode = "sequence";
  videoDetailState = "idle";

  renderVideoTemplateList(videoTemplates, id);

  const stage = $("video-template-stage");
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
      const api = videoPlayerApi();
      if (!api) return;
      const rect = hostScrubber.getBoundingClientRect();
      const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const totalDur = api.totalDuration || (t.scenes.reduce((sum, s) => sum + (s.durationSeconds || 5), 0) * 1000);
      api.seek(pos * totalDur);
    };
    hostScrubber.onmousedown = (e) => {
      e.stopPropagation();
      const api = videoPlayerApi();
      isDragging = true;
      resumeAfterDrag = (videoDetailState === "playing");
      if (resumeAfterDrag && api) {
        api.pause();
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
          if (resumeAfterDrag && api) {
            api.play();
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
  document.addEventListener("keydown", videoDetailKeyHandler);

  // Every template ships its own generated background music -- the preview
  // audio element is pointed at it up front and driven by onState below.
  const audio = ensureVideoDetailAudio();
  audio.pause();
  audio.src = `/api/videos/templates/${encodeURIComponent(id)}/bgm.wav`;
  audio.currentTime = 0;

  // The rendered document is always native pixel size (1080x1920 portrait or
  // 1920x1080 landscape) and CSS-scaled down to fit whichever shaped box
  // (.portrait/.landscape) this template got above. The box's width is set
  // directly here (not left to the CSS class alone) so it can never end up
  // stretched to the flex column's full width -- a narrow mobile-shaped
  // player for portrait, a wider one for landscape, always exactly this size.
  const isLandscape = t.aspectRatio === "16:9";
  const nativeWidth = isLandscape ? 1920 : 1080;
  const nativeHeight = isLandscape ? 1080 : 1920;
  // Portrait stays a deliberately compact, mobile-shaped preview. Landscape
  // is a real widescreen player -- as large as the center column allows
  // (up to 720px), not a small box shrunk to match the portrait player.
  const mainCol = stage.querySelector(".video-detail-main");
  const availableWidth = Math.max(320, mainCol.clientWidth - 16);
  const boxWidth = isLandscape ? Math.min(720, availableWidth) : 280;
  const box = stage.querySelector(".video-preview-scale");
  box.style.width = `${boxWidth}px`;
  box.style.maxWidth = `${boxWidth}px`;
  box.style.aspectRatio = isLandscape ? "16 / 9" : "9 / 16";
  const frame = $("video-detail-preview");
  frame.style.width = `${nativeWidth}px`;
  frame.style.height = `${nativeHeight}px`;
  const scale = boxWidth / nativeWidth;
  frame.style.transform = `scale(${scale})`;
  // The preview document loads paused on scene 0 and does NOT autoplay (see
  // templatePreviewHtml's player script) -- onState registration below is
  // what starts tracking playback; nothing here triggers it.
  frame.onload = () => {
    const api = videoPlayerApi();
    if (api) api.onState = (evt) => videoDetailOnPlayerState(id, evt);
    videoDetailSceneIndex = 0;
    videoDetailMode = "sequence";
    videoDetailState = "idle";
    videoDetailRefreshUi(t);
  };
  frame.src = `/api/videos/templates/${encodeURIComponent(id)}/preview?${videoDetailPreviewQuery().toString()}`;

  // The side panel's height tracks exactly the rendered .video-detail-main box
  // (the column including the player and the externalized player bar) -- never the taller
  // of the two columns, never the section's own height. The screen list
  // scrolls internally if it doesn't fit. A ResizeObserver (not a one-shot
  // measurement) keeps this correct across window resizes.
  const side = stage.querySelector(".template-detail-side");
  videoDetailResizeObserver = new ResizeObserver(() => {
    side.style.height = `${mainCol.getBoundingClientRect().height}px`;
  });
  videoDetailResizeObserver.observe(mainCol);
}

function videoDetailKeyHandler(ev) {
  if (!videoTemplateDetailId) return;
  if (!$("video-section-templates").classList.contains("active")) return;
  if (ev.target && ["INPUT", "TEXTAREA", "SELECT"].includes(ev.target.tagName)) return;
  if (ev.code === "Space") { ev.preventDefault(); videoDetailTogglePlay(videoTemplateDetailId); }
  if (ev.code === "ArrowRight") videoDetailShowScene(videoTemplateDetailId, videoDetailSceneIndex + 1);
  if (ev.code === "ArrowLeft") videoDetailShowScene(videoTemplateDetailId, videoDetailSceneIndex - 1);
}

async function loadVideoTemplateNow(id) {
  if (!videoId) {
    await alert("Start a video project first.");
    return;
  }
  const t = videoTemplates.find((x) => x.id === id);
  if (videoProject && videoProject.scenes.length > 0) {
    const ok = await confirm("You have an existing scene sequence. Are you sure you want to load a new template?");
    if (!ok) return;
  }
  videoProject = await api(`/api/videos/${videoId}/apply-template`, { method: "POST", body: { templateId: id } });
  renderVideoScenes();
  showToast(`Applied "${t ? t.name : id}" — ${videoProject.scenes.length} scene(s) ready. Switch to Scenes to customize.`, "success");
}



function renderVideoScenes() {
  $("sc-template").innerHTML = videoSceneOptions.animations.map((a) => `<option value="${a.id}">${a.name}</option>`).join("");
  $("sc-background").innerHTML = videoSceneOptions.backgrounds.map((b) => `<option value="${b}">${b}</option>`).join("");
  $("sc-device").innerHTML = videoDevices.map((d) => `<option value="${d.id}">${d.vendor} — ${d.name}</option>`).join("");
  const orientation = (videoProject.scenes[0] && videoProject.scenes[0].aspectRatio) === "16:9" ? "16:9" : "9:16";
  const layouts = (videoSceneOptions.layouts && videoSceneOptions.layouts[orientation]) || [];
  $("sc-layout").innerHTML = layouts.map((l) => `<option value="${l.id}">${l.name}</option>`).join("");
  const videoGroups = {};
  for (const s of videoProject.sources || []) {
    const res = s.resolution || "Uploads / General";
    if (!videoGroups[res]) videoGroups[res] = [];
    videoGroups[res].push(s);
  }
  let videoSourceHtml = '<option value="">(None)</option>';
  for (const [res, items] of Object.entries(videoGroups)) {
    videoSourceHtml += `<optgroup label="${res}">`;
    for (const s of items) {
      videoSourceHtml += `<option value="${s.id}">${s.name}</option>`;
    }
    videoSourceHtml += `</optgroup>`;
  }
  $("sc-source").innerHTML = videoSourceHtml;

  const templateLabel = $("video-selected-template-label");
  if (templateLabel) {
    const t = videoTemplates.find((x) => x.id === videoProject.template);
    templateLabel.textContent = videoProject.template ? `Template: ${t ? t.name : videoProject.template}` : "";
  }

  const nav = $("video-scene-nav");
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
  if (videoProject.scenes.length) selectScene(videoProject.scenes[0].id);
  refreshSceneCompleteness();
}

/** Pulls GET .../validate once and paints each scene chip's status dot --
 *  green (complete), amber (needs content), or no dot (scene genuinely has
 *  no dynamic content to fill). Also gates the Render button so a missing
 *  required asset is caught before a multi-minute render, not after. */
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
    // Validation is a convenience overlay -- never block the editor on it.
  }
}

let currentSceneFlowSteps = [];

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

$("sc-flow-add-btn").onclick = () => {
  const lastStart = currentSceneFlowSteps.length > 0 ? (currentSceneFlowSteps.at(-1).startSec + currentSceneFlowSteps.at(-1).durationSec + 0.5) : 0.5;
  const lastSide = currentSceneFlowSteps.length > 0 ? (currentSceneFlowSteps.at(-1).side === "left" ? "right" : "left") : "left";
  currentSceneFlowSteps.push({ label: "Next Feature", startSec: Math.round(lastStart * 10) / 10, durationSec: 2.2, side: lastSide });
  renderFlowStepsEditor(currentSceneFlowSteps);
};

function updateSceneSpecialPanels(templateVal) {
  const isLandscapeFlow = templateVal === "landscape-flow";
  const isPortraitFlow = templateVal === "portrait-flow";
  $("sc-flow-panel").style.display = isLandscapeFlow ? "block" : "none";
  $("sc-portrait-flow-note").style.display = isPortraitFlow ? "block" : "none";
}

$("sc-template").onchange = () => {
  updateSceneSpecialPanels($("sc-template").value);
};

function selectScene(sceneId) {
  selectedSceneId = sceneId;
  for (const chip of document.querySelectorAll(".scene-chip")) chip.classList.toggle("active", chip.dataset.sceneId === sceneId);
  const scene = videoProject.scenes.find((s) => s.id === sceneId);
  $("sc-template").value = scene.sceneTemplate;
  $("sc-layout").value = scene.layout || "";
  $("sc-depth").value = scene.depth || "flat";
  $("sc-transition").value = scene.transition || "cut";
  $("sc-device").value = scene.device;
  $("sc-background").value = scene.background;
  // Headline/subtext are edited in the Content panel (left column) now --
  // via the dynamic slot editor for slot-driven templates, or legacyTextField
  // for device presets -- not here.
  $("sc-duration").value = scene.durationSeconds;
  $("sc-rotate").value = scene.rotate; $("sc-rotate-val").textContent = scene.rotate;
  $("sc-zoom").value = scene.zoom; $("sc-zoom-val").textContent = scene.zoom;
  $("sc-move").value = scene.move; $("sc-move-val").textContent = scene.move;
  const textAnim = scene.textAnimation || {};
  $("sc-text-preset").value = textAnim.preset || "fade-up";
  $("sc-text-speed").value = String(textAnim.speed ?? 1);
  $("sc-text-delay").value = textAnim.delayMs ?? 0; $("sc-text-delay-val").textContent = textAnim.delayMs ?? 0;
  $("sc-text-scale").value = textAnim.scale ?? 1; $("sc-text-scale-val").textContent = (textAnim.scale ?? 1).toFixed(2);
  if (scene.sourceId) $("sc-source").value = scene.sourceId;
  updateVariantSelect("sc-device", "sc-variant", scene.variant, videoDevices);
  updateSceneSpecialPanels(scene.sceneTemplate);
  renderFlowStepsEditor(scene.flowSteps);
  showScenePreview();
  updateScenePreviewScale();
  loadSceneContentPanel(sceneId);
}
function updateVariantSelect(deviceSelectId, variantSelectId, current, catalog) {
  const device = catalog.find((d) => d.id === $(deviceSelectId).value);
  const select = $(variantSelectId);
  select.innerHTML = '<option value="">default</option>';
  if (device?.variants) for (const v of device.variants) select.innerHTML += `<option value="${v.id}">${v.name}</option>`;
  select.value = current || "";
}
$("sc-device").onchange = () => updateVariantSelect("sc-device", "sc-variant", "", videoDevices);
for (const [id, out] of [["sc-rotate", "sc-rotate-val"], ["sc-zoom", "sc-zoom-val"], ["sc-move", "sc-move-val"]]) {
  $(id).oninput = () => { $(out).textContent = $(id).value; };
}
$("sc-text-delay").oninput = () => { $("sc-text-delay-val").textContent = $("sc-text-delay").value; };
$("sc-text-scale").oninput = () => { $("sc-text-scale-val").textContent = Number($("sc-text-scale").value).toFixed(2); };
function showScenePreview() {
  const frame = $("sc-preview");
  frame.src = `/api/videos/${videoId}/scene-preview/${selectedSceneId}?t=${Date.now()}`;
  frame.onload = () => { scTransportReset(); updateScenePreviewScale(); };
}

/** Sizes #sc-preview to fill its box without cropping. The iframe's own
 *  DOCUMENT is a fixed native pixel canvas (1080x1920 or 1920x1080); setting
 *  the <iframe> element's CSS size alone only changes its VIEWPORT, not the
 *  page's scale, so the document still renders at 1:1 and only the top-left
 *  corner is visible through a smaller viewport. Instead: size the iframe at
 *  its true native pixels and apply transform:scale() to shrink the whole
 *  rendered page uniformly inside a clipping box -- same technique as the
 *  Templates-tab stage's .video-preview-scale (see videoDetailRefreshUi). */
function updateScenePreviewScale() {
  const scene = videoProject?.scenes.find((s) => s.id === selectedSceneId);
  if (!scene) return;
  // Native canvas for THIS scene's own device/aspect ratio -- portrait
  // (9:16) and landscape (16:9) templates are genuinely different shapes,
  // never forced into one box.
  const isLandscape = scene.aspectRatio === "16:9";
  const nativeWidth = isLandscape ? 1920 : 1080;
  const nativeHeight = isLandscape ? 1080 : 1920;
  const box = document.querySelector(".studio-preview-box");
  const frameEl = document.querySelector(".preview-frame");
  if (!box || !frameEl) return;

  // Fit-within-box math done in JS with explicit px, not CSS aspect-ratio --
  // aspect-ratio does not reliably resolve a size for a flex child with no
  // definite width or height (it can collapse toward zero), which is what
  // produced the earlier "thin strip" preview.
  const availWidth = Math.max(160, frameEl.clientWidth - 24); // minus .preview-frame's own padding
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
  frame.style.width = `${nativeWidth}px`;
  frame.style.height = `${nativeHeight}px`;
  frame.style.transform = `scale(${boxWidth / nativeWidth})`;
}
window.addEventListener("resize", () => updateScenePreviewScale());

// ---------------------------------------------------------------------------
// Playback transport -- Play/Pause/frame-step/±1s, placed BELOW the player
// (not inside it) per the studio's professional-editor requirement. Driven
// entirely through window.seek(ms), where ms is SCENE-RELATIVE (the scene-
// preview document's seek is already scene-offset -- see composeStandaloneHtml's
// sceneStartMs adapter -- and the code-generated single-scene documents used
// by the device-preset templates are scene-relative natively). Driving
// exclusively through window.seek, rather than the page's own internal Play
// button / window.goto (which animate via a separate renderFrameAt call the
// page never exposes), is also what makes the within-scene screenshot
// timeline (scTransport ticks -> wrapped window.seek -> segment swap) work
// correctly during THIS preview, matching how the final video render also
// drives every frame exclusively through repeated window.seek calls.
// ---------------------------------------------------------------------------

let scTransport = { playing: false, elapsedMs: 0, durationMs: 5000, timer: null, loop: false, muted: false, speed: 1.0 };

function scTransportReset() {
  scTransportStop();
  const scene = videoProject?.scenes.find((s) => s.id === selectedSceneId);
  scTransport.durationMs = Math.max(1, scene?.durationSeconds || 5) * 1000;
  scTransport.elapsedMs = 0;
  scTransportSeek(0);
}

function scTransportSeek(ms) {
  scTransport.elapsedMs = Math.max(0, Math.min(ms, scTransport.durationMs));
  const frame = $("sc-preview");
  try {
    if (frame.contentWindow && typeof frame.contentWindow.seek === "function") {
      frame.contentWindow.seek(scTransport.elapsedMs);
    }
  } catch {
    // Cross-origin or not-yet-loaded -- next tick will retry via user input.
  }
  const timeEl = $("sc-tr-time");
  if (timeEl) timeEl.textContent = `${(scTransport.elapsedMs / 1000).toFixed(1)}s / ${(scTransport.durationMs / 1000).toFixed(1)}s`;
}

function scTransportStop() {
  scTransport.playing = false;
  if (scTransport.timer) clearInterval(scTransport.timer);
  scTransport.timer = null;
  const btn = $("sc-tr-play");
  if (btn) {
    if (scTransport.elapsedMs >= scTransport.durationMs) {
      btn.innerHTML = "&#8635;"; // Replay icon
      btn.title = "Replay Scene";
    } else {
      btn.innerHTML = "&#9654;"; // Play icon
      btn.title = "Play";
    }
  }
}

function scTransportPlay() {
  if (scTransport.playing) return;
  scTransport.playing = true;
  const btn = $("sc-tr-play");
  if (btn) {
    btn.innerHTML = "&#9208;"; // Pause icon
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

(function initSceneTransport() {
  const playBtn = $("sc-tr-play");
  if (!playBtn) return; // scenes section not present yet at parse time is fine -- these are static ids
  playBtn.onclick = () => {
    if (scTransport.elapsedMs >= scTransport.durationMs) {
      scTransportSeek(0);
    }
    scTransport.playing ? scTransportStop() : scTransportPlay();
  };
  $("sc-tr-back").onclick = () => { scTransportStop(); scTransportSeek(scTransport.elapsedMs - 1000); };
  $("sc-tr-fwd").onclick = () => { scTransportStop(); scTransportSeek(scTransport.elapsedMs + 1000); };
  $("sc-tr-prev-frame").onclick = () => { scTransportStop(); scTransportSeek(scTransport.elapsedMs - 1000 / 30); };
  $("sc-tr-next-frame").onclick = () => { scTransportStop(); scTransportSeek(scTransport.elapsedMs + 1000 / 30); };

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
})();

// ---------------------------------------------------------------------------
// Dynamic content panel -- driven by GET /scene-spec, the SAME SlotSpec[]
// the renderer resolves against (src/video/slots.ts), so this form can never
// describe a scene's needs differently than the video actually gets built.
// ---------------------------------------------------------------------------

let contentPanelSceneId = null;
let contentSaveTimer = null;

async function loadSceneContentPanel(sceneId) {
  contentPanelSceneId = sceneId;
  const panel = $("sc-content-panel");
  if (!videoId) { panel.innerHTML = ""; return; }
  panel.innerHTML = '<p class="hint">Loading...</p>';
  let spec;
  try {
    spec = await api(`/api/videos/${videoId}/scene-spec/${sceneId}`);
  } catch (e) {
    panel.innerHTML = `<p class="hint">Could not load content requirements: ${e.message}</p>`;
    return;
  }
  if (contentPanelSceneId !== sceneId) return; // scene changed again while this was in flight
  renderSlotEditor(spec.specs, spec.values, spec.issues, sceneId);
  renderSegmentsPanel(sceneId, spec.specs, spec.values);
}

/** Specs with `targets.length === 0` are the 10 device-preset templates,
 *  which have no `slots` config at all -- slotSpecsForScene synthesizes
 *  text/subtext/screenshots specs for them so the SHAPE of this form is
 *  uniform across all 16 templates, but there's no DOM selector to inject
 *  into (their code-generated renderer reads scene.text/sourceId/screenIds
 *  directly instead). Those are edited here via the legacy PUT
 *  /scenes/:sceneId route rather than the slotValues route. */
function renderSlotEditor(specs, values, issues, sceneId) {
  const panel = $("sc-content-panel");
  panel.innerHTML = "";
  if (specs.length === 0) {
    panel.innerHTML = '<p class="hint">This scene needs no content.</p>';
    return;
  }
  const legacyScene = videoProject.scenes.find((s) => s.id === sceneId) || {};
  const issuesByKey = {};
  for (const issue of issues || []) (issuesByKey[issue.slotKey] ??= []).push(issue);

  const screenshotSpec = specs.find((s) => s.key === "screenshot" || s.key === "screenshots");
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

let legacyFieldSaveTimer = null;
async function saveLegacySceneField(sceneId, patch) {
  clearTimeout(legacyFieldSaveTimer);
  return new Promise((resolve) => {
    legacyFieldSaveTimer = setTimeout(async () => {
      $("sc-content-save-state").textContent = "Saving...";
      try {
        const updated = await api(`/api/videos/${videoId}/scenes/${sceneId}`, { method: "PUT", body: patch });
        const idx = videoProject.scenes.findIndex((s) => s.id === sceneId);
        if (idx !== -1) videoProject.scenes[idx] = updated;
        $("sc-content-save-state").textContent = `Saved · ${new Date().toLocaleTimeString()}`;
        refreshSceneCompleteness();
        if (sceneId === selectedSceneId) showScenePreview();
      } catch (e) {
        $("sc-content-save-state").textContent = "Save failed";
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
  // No live-patch here -- the device-preset renderer bakes the headline as
  // per-word animated spans server-side (see sceneContentHtml/textBlockHtml
  // in render.ts), so there's no simple selector to write text into
  // client-side; the debounced save + full preview reload is the only path.
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
      await alert("Upload failed: " + e.message);
    }
  };
  controls.appendChild(fileInput);
  wrap.appendChild(controls);
  return wrap;
}

// ---------------------------------------------------------------------------
// Live preview patching -- reaches directly into #sc-preview's document and
// applies a value to the SAME selectors (spec.targets, from GET /scene-spec)
// the server-side injector uses, so edits show up instantly instead of
// waiting for the debounced save round-trip + full iframe reload. This is a
// visual-only fast path: the debounced saveSlotValue(Debounced) call is
// still what persists the value and is the source of truth on reload/
// navigate-away-and-back; this just avoids a flicker/lag on every keystroke.
// ---------------------------------------------------------------------------

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
    return; // not loaded yet, or cross-origin -- the debounced save+reload will still land it
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

/** Positioning wrapper for a text input + its corner AI button (item 3:
 *  UI-only for now -- see aiButton). */
function aiFieldWrap() {
  const wrap = document.createElement("div");
  wrap.className = "ai-field";
  return wrap;
}

/** Field-level "AI assist" affordance -- UI only, per this pass's explicit
 *  scope ("implement only the UI/design ... do not implement any AI
 *  functionality or generation logic"). Replaces the old single global
 *  "AI Assist" button that used to sit above the Duration field. */
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
  wrap.appendChild(thumb);

  const controls = document.createElement("div");
  controls.className = "content-slot-image-controls";

  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = "image/png,image/jpeg,image/webp,image/gif";
  fileInput.onchange = async () => {
    const file = fileInput.files[0];
    if (!file) return;
    const localUrl = URL.createObjectURL(file);
    // Only op:"src" (plain <img src>) slots -- op:"html" (e.g. logo) needs the
    // full wrapper markup the server builds; skip the instant patch there and
    // let the upload-then-reload path (below) handle it, still fast enough.
    if (spec.op === "src") livePatchSlot(spec, localUrl, spec.kind === "imageList" ? index : undefined);
    try {
      const slotParam = spec.kind === "imageList" ? `${sceneId}:${spec.key}:${index}` : `${sceneId}:${spec.key}`;
      const uploaded = await uploadFile(`/api/videos/${videoId}/sources?name=${encodeURIComponent(file.name)}&slot=${encodeURIComponent(slotParam)}`, file);
      videoProject.sources.push(uploaded);
      loadSceneContentPanel(sceneId);
      refreshSceneCompleteness();
      showScenePreview();
    } catch (e) {
      await alert("Upload failed: " + e.message);
    } finally {
      URL.revokeObjectURL(localUrl);
    }
  };
  controls.appendChild(fileInput);

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
  const current = items.map((i) => ({ ...i }));
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
  $("sc-content-save-state").textContent = "Saving...";
  clearTimeout(contentSaveTimer);
  contentSaveTimer = setTimeout(() => saveSlotValue(sceneId, key, value), 400);
}

async function saveSlotValue(sceneId, key, value) {
  try {
    await api(`/api/videos/${videoId}/scenes/${sceneId}/slots`, { method: "PUT", body: { slotValues: { [key]: value } } });
    const scene = videoProject.scenes.find((s) => s.id === sceneId);
    if (scene) scene.slotValues = { ...(scene.slotValues || {}), [key]: value };
    $("sc-content-save-state").textContent = `Saved · ${new Date().toLocaleTimeString()}`;
    refreshSceneCompleteness();
    if (sceneId === selectedSceneId) showScenePreview();
  } catch (e) {
    $("sc-content-save-state").textContent = "Save failed";
  }
}

// ---------------------------------------------------------------------------
// Within-scene multi-screenshot timeline. Only offered for scenes with a
// single `screenshot` role (the common case across nearly every template) --
// `screenshots` (imageList, simultaneous multi-image layouts like the trio
// fan lineup) is a different feature and unaffected by this. Persisted as
// an `imageSequence` SlotValue under the same "screenshot" key -- see
// src/video/slots.ts's resolveImageSequences for how it renders.
// ---------------------------------------------------------------------------

let segmentsSaveTimer = null;

function renderSegmentsPanel(sceneId, specs, values) {
  const panel = $("sc-segments-panel");
  const spec = specs.find((s) => s.key === "screenshot");
  if (!spec) { panel.style.display = "none"; return; }
  panel.style.display = "";

  const value = values.screenshot;
  const isSequence = value?.kind === "imageSequence";
  const list = $("sc-segments-list");
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

  $("sc-segment-add").style.display = isSequence ? "" : "none";
  if (!isSequence) return;

  const segments = value.segments.map((s) => ({ ...s }));

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
          await alert("Upload failed: " + e.message);
        }
      };
      row.appendChild(fileInput);

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

  $("sc-segment-add").onclick = () => {
    segments.push({ sourceId: null, durationSec: 3 });
    persist();
    draw();
  };
}

$("sc-source-upload").onclick = async () => {
  if (!activeProjectId) {
    await alert("Select a project first.");
    return;
  }
  openUniversalUploadModal((selectedPath) => {
    setTimeout(async () => {
      videoProject = await api(`/api/videos/${activeProjectId}`);
      $("sc-source").innerHTML = (videoProject.sources || []).map((s) => `<option value="${s.id}">${s.name}</option>`).join("");
      const src = videoProject.sources.find(s => s.file === selectedPath);
      if (src) {
        $("sc-source").value = src.id;
      }
    }, 200);
  });
};

async function saveCurrentScene() {
  const body = {
    sceneTemplate: $("sc-template").value, layout: $("sc-layout").value || undefined,
    depth: $("sc-depth").value || "flat", transition: $("sc-transition").value || "cut",
    device: $("sc-device").value, variant: $("sc-variant").value || undefined,
    background: $("sc-background").value,
    // text/subtext are intentionally omitted -- they're saved independently
    // by the Content panel (left column), and the PUT route merges rather
    // than replaces, so leaving them out here can't clobber that.
    durationSeconds: Number($("sc-duration").value) || 3, rotate: Number($("sc-rotate").value),
    zoom: Number($("sc-zoom").value), move: Number($("sc-move").value), sourceId: $("sc-source").value || undefined,
    flowSteps: currentSceneFlowSteps.length > 0 ? currentSceneFlowSteps : undefined,
    textAnimation: {
      preset: $("sc-text-preset").value,
      speed: Number($("sc-text-speed").value) || 1,
      delayMs: Number($("sc-text-delay").value) || 0,
      scale: Number($("sc-text-scale").value) || 1,
    },
  };
  const updated = await api(`/api/videos/${videoId}/scenes/${selectedSceneId}`, { method: "PUT", body });
  const idx = videoProject.scenes.findIndex((s) => s.id === selectedSceneId);
  videoProject.scenes[idx] = updated;
  showScenePreview();
}

$("sc-save").onclick = async () => {
  try {
    await saveCurrentScene();
  } catch (e) {
    await alert("Save failed: " + e.message);
  }
};

$("sc-add").onclick = async () => {
  if (!videoId || !videoProject || videoProject.scenes.length === 0) {
    await alert("Load a template first.");
    return;
  }
  try {
    videoProject = await api(`/api/videos/${videoId}/scenes`, { method: "POST" });
    renderVideoScenes();
    selectScene(videoProject.scenes.at(-1).id);
    showToast(`Scene ${videoProject.scenes.length} added.`, "success");
  } catch (e) {
    await alert("Could not add scene: " + e.message);
  }
};

$("sc-remove").onclick = async () => {
  if (!selectedSceneId || !videoProject) return;
  const ok = await confirm("Remove this scene? This cannot be undone.");
  if (!ok) return;
  try {
    videoProject = await api(`/api/videos/${videoId}/scenes/${selectedSceneId}`, { method: "DELETE" });
    renderVideoScenes();
  } catch (e) {
    await alert("Could not remove scene: " + e.message);
  }
};

// "Save Template Configuration" opens a named-snapshot modal (project.savedConfigs);
// individual scene edits already persist live via saveCurrentScene()/the Content
// panel, so this doesn't need to re-flush the whole project first.
let savedConfigsCache = [];

$("video-save-config-btn").onclick = () => {
  if (!videoId || !videoProject || !videoProject.template) {
    alert("Load a template first.");
    return;
  }
  $("save-config-name").value = "";
  $("save-config-warning").style.display = "none";
  $("save-config-backdrop").classList.add("open");
  $("save-config-name").focus();
};

$("save-config-close").onclick = () => $("save-config-backdrop").classList.remove("open");
$("save-config-cancel").onclick = () => $("save-config-backdrop").classList.remove("open");

async function submitSaveConfig(overwrite) {
  const name = $("save-config-name").value.trim();
  if (!name) {
    $("save-config-warning").textContent = "A configuration name is required.";
    $("save-config-warning").style.display = "block";
    return;
  }
  try {
    savedConfigsCache = await api(`/api/videos/${videoId}/configs`, { method: "POST", body: { name, overwrite } });
    $("save-config-backdrop").classList.remove("open");
    showToast(`Configuration "${name}" saved.`, "success");
    renderSavedConfigsGrid();
  } catch (e) {
    if (!overwrite && /already exists/i.test(e.message)) {
      const ok = await confirm(`A configuration named "${name}" already exists. Overwrite it?`);
      if (ok) return submitSaveConfig(true);
      return;
    }
    $("save-config-warning").textContent = e.message;
    $("save-config-warning").style.display = "block";
  }
}
$("save-config-confirm").onclick = () => submitSaveConfig(false);

async function loadSavedConfigs() {
  const grid = $("saved-configs-grid");
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

function renderSavedConfigsGrid() {
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
        <div class="hint" style="margin-bottom:.2rem;">Template: ${c.template}</div>
        <div class="hint" style="margin-bottom:.2rem;">${c.scenes.length} scene(s) · ${aspect}</div>
        <div class="hint" style="margin-bottom:.8rem;">Saved ${new Date(c.savedAt).toLocaleString()}</div>
        <div class="row" style="gap:8px;">
          <button class="secondary small config-apply-btn" type="button" style="flex:1;">Apply to Video</button>
          <button class="secondary small danger config-delete-btn" type="button">Delete</button>
        </div>
      </div>
    `;
  }).join("");
  grid.querySelectorAll(".config-apply-btn").forEach((btn) => {
    btn.onclick = async () => {
      const id = btn.closest("[data-config-id]").dataset.configId;
      try {
        videoProject = await api(`/api/videos/${videoId}/configs/${id}/apply`, { method: "POST" });
        showToast("Configuration applied.", "success");
        renderVideoScenes();
      } catch (e) {
        await alert("Could not apply configuration: " + e.message);
      }
    };
  });
  grid.querySelectorAll(".config-delete-btn").forEach((btn) => {
    btn.onclick = async () => {
      const id = btn.closest("[data-config-id]").dataset.configId;
      const ok = await confirm("Delete this saved configuration? This cannot be undone.");
      if (!ok) return;
      try {
        savedConfigsCache = await api(`/api/videos/${videoId}/configs/${id}`, { method: "DELETE" });
        renderSavedConfigsGrid();
      } catch (e) {
        await alert("Could not delete configuration: " + e.message);
      }
    };
  });
}

// The old global "AI Assist" button (above Duration) is gone -- AI is now a
// per-field affordance (see aiButton() in the content-panel section above).
// It's UI-only for this pass; the /ai-text endpoint it used to call is still
// there and unused, ready for the field-level buttons to wire up later.

$("bgm-upload").onclick = async () => {
  const file = $("bgm-file").files[0];
  if (!file) {
    await alert("Choose an audio file first.");
    return;
  }
  await uploadFile(`/api/videos/${videoId}/bgm`, file);
  await alert("BGM uploaded.");
};
$("video-render").onclick = async () => {
  $("video-render").disabled = true;
  $("video-result").textContent = "Rendering… this can take a while.";
  try {
    const result = await api(`/api/videos/${videoId}/render`, { method: "POST" });
    $("video-result").textContent = "Video rendered: " + result.videoPath;
    const link = $("video-download");
    link.href = `/api/videos/${videoId}/download`;
    link.style.display = "inline-block";
  } catch (e) {
    $("video-result").textContent = "Render failed: " + e.message;
  } finally {
    $("video-render").disabled = false;
  }
};

/* ============================================================
   Toolchain & Binaries Settings Modal + First-Launch Check
   ============================================================ */

const toolchainBackdrop = $("toolchain-backdrop");

if ($("open-toolchain")) {
  $("open-toolchain").onclick = () => openToolchainModal();
}
if ($("toolchain-close")) {
  $("toolchain-close").onclick = () => closeToolchainModal();
}
if (toolchainBackdrop) {
  toolchainBackdrop.onclick = (e) => {
    if (e.target === toolchainBackdrop) closeToolchainModal();
  };
}

function openToolchainModal() {
  if (toolchainBackdrop) toolchainBackdrop.classList.add("open");
  refreshToolchainStatus();
}

function closeToolchainModal() {
  if (toolchainBackdrop) toolchainBackdrop.classList.remove("open");
}

async function refreshToolchainStatus() {
  const summaryEl = $("toolchain-status-summary");
  const listEl = $("toolchain-tools-list");
  const customDirInput = $("toolchain-custom-dir");
  if (!summaryEl || !listEl) return;

  try {
    const status = await api("/api/toolchain/status");
    customDirInput.value = status.customDir || "";

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
      const t = status.tools[name];
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

if ($("toolchain-save-dir")) {
  $("toolchain-save-dir").onclick = async () => {
    const customDir = $("toolchain-custom-dir").value.trim();
    try {
      await api("/api/toolchain/config", { method: "POST", body: { customDir: customDir || null } });
      await refreshToolchainStatus();
    } catch (e) {
      await alert("Failed to set directory: " + e.message);
    }
  };
}

if ($("toolchain-reset-dir")) {
  $("toolchain-reset-dir").onclick = async () => {
    $("toolchain-custom-dir").value = "";
    try {
      await api("/api/toolchain/config", { method: "POST", body: { customDir: null } });
      await refreshToolchainStatus();
    } catch (e) {
      await alert("Failed to reset directory: " + e.message);
    }
  };
}

if ($("toolchain-download-btn")) {
  $("toolchain-download-btn").onclick = async () => {
    const btn = $("toolchain-download-btn");
    const progressContainer = $("toolchain-progress-container");
    const msgEl = $("toolchain-progress-msg");
    const pctEl = $("toolchain-progress-pct");
    const barEl = $("toolchain-progress-bar");

    btn.disabled = true;
    progressContainer.style.display = "block";
    msgEl.textContent = "Initiating download...";
    pctEl.textContent = "0%";
    barEl.style.width = "0%";

    const eventSource = new EventSource("/api/toolchain/download-stream");
    eventSource.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data);
        msgEl.textContent = data.message || "Downloading...";
        const pct = Math.min(100, Math.max(0, data.progress || 0));
        pctEl.textContent = `${pct}%`;
        barEl.style.width = `${pct}%`;

        if (data.status === "complete") {
          eventSource.close();
          btn.disabled = false;
          refreshToolchainStatus();
        } else if (data.status === "error") {
          eventSource.close();
          btn.disabled = false;
          alert("Download failed: " + data.message);
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
      await alert("Failed to start download: " + e.message);
    }
  };
}

async function checkToolchainStatusOnStartup() {
  try {
    const status = await api("/api/toolchain/status");
    if (!status.ready) {
      openToolchainModal();
    }
  } catch (_) {}
}

/* ============================================================
   Settings modal (AI providers/models) -- shared config
   ============================================================ */

const settingsBackdrop = $("settings-backdrop");
if ($("open-settings")) $("open-settings").onclick = () => { if (settingsBackdrop) settingsBackdrop.classList.add("open"); loadProviders(); loadModelsTab(); };
if ($("settings-close")) $("settings-close").onclick = () => { if (settingsBackdrop) settingsBackdrop.classList.remove("open"); };
if (settingsBackdrop) settingsBackdrop.onclick = (e) => { if (e.target === settingsBackdrop) settingsBackdrop.classList.remove("open"); };
if ($("credentials-backdrop")) $("credentials-backdrop").onclick = (e) => { if (e.target === $("credentials-backdrop")) $("credentials-backdrop").classList.remove("open"); };
if ($("sessions-backdrop")) $("sessions-backdrop").onclick = (e) => { if (e.target === $("sessions-backdrop")) $("sessions-backdrop").classList.remove("open"); };

for (const tab of document.querySelectorAll("#settings-backdrop .tab")) {
  tab.onclick = () => {
    for (const t of document.querySelectorAll("#settings-backdrop .tab")) t.classList.remove("active");
    for (const p of document.querySelectorAll("#settings-backdrop .tab-panel")) p.classList.remove("active");
    tab.classList.add("active");
    $("tab-" + tab.dataset.tab).classList.add("active");
  };
}

async function loadProviders() {
  const container = $("providers-list");
  container.textContent = "Loading…";
  try {
    const { providers } = await api("/api/ai/providers");
    container.innerHTML = "";
    const discoverSelect = $("discover-provider");
    discoverSelect.innerHTML = "";
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
        keyInput.value = ""; keyInput.placeholder = "•••••••• (set)";
      };
      row.querySelector('[data-act="test"]').onclick = async () => {
        const resultEl = row.querySelector(".test-result");
        resultEl.textContent = "testing…";
        try {
          const r = await api(`/api/ai/providers/${encodeURIComponent(p.id)}/test`, { method: "POST" });
          resultEl.textContent = r.ok ? `OK (${r.latencyMs}ms, ${r.modelCount} models)` : `FAILED: ${r.reason}`;
          resultEl.style.color = r.ok ? "#86efac" : "#fca5a5";
        } catch (e) { resultEl.textContent = "error: " + e.message; resultEl.style.color = "#fca5a5"; }
      };
      row.querySelector('[data-act="delete"]').onclick = async () => { await api(`/api/ai/providers/${encodeURIComponent(p.id)}`, { method: "DELETE" }); loadProviders(); };
      container.appendChild(row);
      const opt = document.createElement("option");
      opt.value = p.id; opt.textContent = `${p.id} (${p.adapter})`;
      discoverSelect.appendChild(opt);
    }
  } catch (e) { container.textContent = "Failed to load providers: " + e.message; }
}

async function loadModelsTab() {
  const listEl = $("saved-models-list");
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
      if (defaultBtn) defaultBtn.onclick = async () => { await api("/api/ai/models/default", { method: "POST", body: { provider: m.provider, modelId: m.modelId } }); loadModelsTab(); };
      row.querySelector('[data-act="delete"]').onclick = async () => { await api(`/api/ai/models/${encodeURIComponent(m.provider)}/${encodeURIComponent(m.modelId)}`, { method: "DELETE" }); loadModelsTab(); };
      listEl.appendChild(row);
    }
  } catch (e) { listEl.textContent = "Failed to load: " + e.message; }
}

$("discover-run").onclick = async () => {
  const providerId = $("discover-provider").value;
  const resultEl = $("discover-result");
  if (!providerId) return;
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
    saveBtn.className = "small"; saveBtn.textContent = "Save Selected";
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

$("add-provider-save").onclick = async () => {
  const id = $("add-id").value.trim();
  const adapter = $("add-adapter").value;
  const baseUrl = $("add-baseurl").value.trim();
  const requiresKey = $("add-requires-key").checked;
  if (!id || !baseUrl) return;
  await api("/api/ai/providers", { method: "POST", body: { id, adapter, baseUrl, enabled: true, requiresKey } });
  $("add-id").value = ""; $("add-baseurl").value = "";
  document.querySelector('#settings-backdrop .tab[data-tab="providers"]').click();
  loadProviders();
};

/* ============================================================
   Universal Screenshot Upload Popup
   ============================================================ */

let currentUploadCallback = null;

function openUniversalUploadModal(onSelectCallback) {
  currentUploadCallback = onSelectCallback;
  $("universal-upload-backdrop").classList.add("open");
  
  // Reset tabs to project view
  document.querySelectorAll("#universal-upload-backdrop .tab").forEach(t => t.classList.remove("active"));
  document.querySelectorAll("#universal-upload-backdrop .tab-panel").forEach(p => p.classList.remove("active"));
  $("tab-btn-project-assets").classList.add("active");
  $("upload-panel-project").classList.add("active");
  
  refreshUniversalProjectAssets();
}

$("universal-upload-close").onclick = () => {
  $("universal-upload-backdrop").classList.remove("open");
};

// Switch tabs inside upload modal
document.querySelectorAll("#universal-upload-backdrop .tab").forEach(tab => {
  tab.onclick = () => {
    document.querySelectorAll("#universal-upload-backdrop .tab").forEach(t => t.classList.remove("active"));
    document.querySelectorAll("#universal-upload-backdrop .tab-panel").forEach(p => p.classList.remove("active"));
    tab.classList.add("active");
    $("upload-panel-" + tab.dataset.uploadTab).classList.add("active");
  };
});

async function refreshUniversalProjectAssets() {
  const grid = $("universal-project-assets-grid");
  grid.innerHTML = "Loading assets...";
  $("universal-use-selected-btn").disabled = true;
  
  if (!activeProjectId) return;

  try {
    const { files } = await api(`/api/projects/${activeProjectId}/files`);
    grid.innerHTML = "";
    
    // Only captures (screenshots) or uploads
    const assets = files.filter(f => f.path.startsWith("captures/") || f.path.startsWith("uploads/"));
    
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
        <div class="badge-overlay">${asset.path.startsWith("captures/") ? 'Cap ' : ''}${asset.name}</div>
      `;
      
      card.onclick = () => {
        document.querySelectorAll(".asset-select-card").forEach(c => c.classList.remove("selected"));
        card.classList.add("selected");
        selectedPath = asset.path;
        $("universal-use-selected-btn").disabled = false;
      };
      
      grid.appendChild(card);
    }
    
    $("universal-use-selected-btn").onclick = () => {
      if (selectedPath && currentUploadCallback) {
        currentUploadCallback(selectedPath);
        $("universal-upload-backdrop").classList.remove("open");
      }
    };
  } catch (e) {
    grid.innerHTML = "Error loading assets: " + e.message;
  }
}

// Drag & Drop / File Picker for direct uploads
const dropzone = $("universal-dropzone");
const filePicker = $("universal-file-picker");

dropzone.onclick = () => filePicker.click();

filePicker.onchange = async () => {
  const file = filePicker.files[0];
  if (!file) return;
  await handleDirectComputerUpload(file);
};

dropzone.ondragover = (e) => {
  e.preventDefault();
  dropzone.style.borderColor = "#3b82f6";
};

dropzone.ondragleave = () => {
  dropzone.style.borderColor = "#262a33";
};

dropzone.ondrop = async (e) => {
  e.preventDefault();
  dropzone.style.borderColor = "#262a33";
  const file = e.dataTransfer.files[0];
  if (file && file.type.startsWith("image/")) {
    await handleDirectComputerUpload(file);
  }
};

async function handleDirectComputerUpload(file) {
  const statusEl = $("computer-upload-status");
  statusEl.textContent = "Uploading image...";
  statusEl.style.color = "#9aa0a6";

  try {
    const url = `/api/projects/${activeProjectId}/upload?name=${encodeURIComponent(file.name)}`;
    const source = await uploadFile(url, file);
    
    statusEl.textContent = `Upload successful: ${file.name}`;
    statusEl.style.color = "#10b981";
    
    // Switch to project assets tab, refresh list, and auto-select new upload
    setTimeout(() => {
      document.querySelector('#universal-upload-backdrop .tab[data-upload-tab="project"]').click();
      refreshUniversalProjectAssets();
    }, 800);
  } catch (e) {
    statusEl.textContent = "Upload failed: " + e.message;
    statusEl.style.color = "#ef4444";
  }
}

window.addEventListener("message", (e) => {
  if (e.data && e.data.type === "video-mute-toggle") {
    const audio = ensureVideoDetailAudio();
    audio.muted = !!e.data.muted;
    const hostMuteBtn = $("host-mute-btn");
    if (hostMuteBtn) {
      hostMuteBtn.innerHTML = audio.muted ? "&#128263;" : "&#128266;";
      hostMuteBtn.title = audio.muted ? "Unmute Audio" : "Mute Audio";
    }
  }
});

/* ============================================================
   Device Management System
   ============================================================ */

async function loadDevicesCatalogue() {
  const grid = $("dev-grid");
  if (!grid) return;
  grid.innerHTML = '<div class="hint">Loading devices...</div>';
  
  try {
    if (!Array.isArray(videoDevices) || videoDevices.length === 0) {
      const res = await api("/api/devices");
      videoDevices = Array.isArray(res) ? res : (Array.isArray(res?.devices) ? res.devices : []);
    }
    renderDevicesCatalogueList();
  } catch (err) {
    grid.innerHTML = `<div class="hint slot-issue error">Failed to load device catalogue: ${err.message}</div>`;
  }
}

function renderDevicesCatalogueList() {
  const grid = $("dev-grid");
  if (!grid) return;
  
  if (!Array.isArray(videoDevices)) videoDevices = [];

  const searchVal = $("dev-search").value.toLowerCase();
  const platformVal = $("dev-filter-platform").value;
  const formFactorVal = $("dev-filter-formfactor").value;

  const filtered = videoDevices.filter(d => {
    const matchesSearch = d.name.toLowerCase().includes(searchVal) || d.vendor.toLowerCase().includes(searchVal);
    const matchesPlatform = !platformVal || d.platforms.includes(platformVal);
    const matchesForm = !formFactorVal || d.formFactor === formFactorVal;
    return matchesSearch && matchesPlatform && matchesForm;
  });
  
  if (filtered.length === 0) {
    grid.innerHTML = '<div class="hint">No matching devices found.</div>';
    return;
  }
  
  grid.innerHTML = filtered.map(d => {
    const platformBadges = d.platforms.map(p => {
      const cls = p === "apple-app-store" ? "platform-ios" : "platform-android";
      const lbl = p === "apple-app-store" ? "iOS" : "Android";
      return `<span class="device-tag ${cls}">${lbl}</span>`;
    }).join(" ");

    return `
      <div class="device-card" data-device-id="${d.id}">
        ${device3dViewerHtml(d)}
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

/** Real per-model 3D preview -- a <canvas> painted from the device's actual
 *  GLB (init3dDeviceViewport, below) instead of a generic hardcoded box, so
 *  different devices show genuinely different geometry (camera island
 *  shape/lens layout, edge profile, button placement), not just a
 *  differently-sized identical box. */
function device3dViewerHtml(d) {
  return `
    <div class="device-3d-viewport" style="width:100%; height:190px;" data-device-id="${d.id}">
      <canvas class="device-3d-canvas" style="width:100%; height:100%; display:block;"></canvas>
      <div class="device-3d-controls">
        <button type="button" class="secondary small d3-orbit-btn" title="Toggle auto-orbit">&#8635; Orbit</button>
        <button type="button" class="secondary small d3-reset-btn" title="Reset view">&#8634; Reset</button>
      </div>
    </div>
  `;
}

/** Real per-model 3D preview: loads the device's actual GLB (real body
 *  geometry, camera island/lenses, buttons, edge profile -- see
 *  src/devices/) via three.js instead of the old six-hardcoded-div box.
 *  Served same-origin by web/server.ts's /vendor/three/ and
 *  /api/devices/:id/glb routes (see plan "Catalogue rendering strategy").
 *
 *  ponytail: one WebGLRenderer per *visible* card (via IntersectionObserver
 *  virtualization below), not the plan's fully shared single-renderer/blit
 *  approach -- simpler, and in practice keeps concurrent contexts well
 *  under the browser's ~8-16 cap since the grid rarely has that many cards
 *  scrolled into view at once. Upgrade to a shared renderer if a real
 *  catalogue size/scroll pattern ever proves this insufficient. */
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

async function init3dDeviceViewport(vp) {
  if (vp.dataset.d3Inited) return;
  vp.dataset.d3Inited = "1";
  const deviceId = vp.dataset.deviceId;
  const canvas = vp.querySelector(".device-3d-canvas");
  if (!canvas || !deviceId) return;

  const { THREE, GLTFLoader } = await loadThreeModule();
  const w = canvas.clientWidth || 220, h = canvas.clientHeight || 190;
  canvas.width = w; canvas.height = h;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setSize(w, h, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, w / h, 0.01, 100);
  // Product-shot rig: strong ambient floor so the body is never pitch black
  // regardless of orbit angle, a key light for the dominant highlight, and
  // a rim light for the curved-edge metal glint (see
  // src/render/three-bridge.ts's addStudioLighting for the same recipe).
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
  try {
    const buf = await fetch(`/api/devices/${encodeURIComponent(deviceId)}/glb`).then((r) => r.arrayBuffer());
    const gltf = await new Promise((resolve, reject) => new GLTFLoader().parse(buf, "", resolve, reject));
    root = gltf.scene.children.find((n) => n.userData?.role === "device-root") || gltf.scene.children[0];
    scene.add(root);
    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    dist = Math.max(size.x, size.y, size.z) * 1.8 + 0.05;

    // ponytail: a default "powered on" screen texture (glass-black ->
    // generic list-UI) was attempted here but only ever displayed on the
    // first catalogue card, reproducibly, with zero console errors across
    // several fix attempts (per-card Image instead of shared TextureLoader
    // cache, explicit SVG width/height, forced re-render) -- reverted
    // rather than ship an inconsistent 1-of-N result. The glass-black idle
    // screen material (in build-glb.ts) is the real, working improvement
    // from this pass. Re-add the default screenshot once root-caused.
  } catch (e) {
    console.error("device catalogue 3D preview failed to load " + deviceId, e);
  }

  let rx = -8, ry = 18;
  const apply = () => {
    if (!root) return;
    const phi = (90 - rx) * (Math.PI / 180);
    const theta = ry * (Math.PI / 180);
    camera.position.set(
      dist * Math.sin(phi) * Math.sin(theta),
      dist * Math.cos(phi),
      dist * Math.sin(phi) * Math.cos(theta),
    );
    camera.lookAt(0, 0, 0);
    renderer.render(scene, camera);
  };
  apply();

  vp.__d3 = { apply, get rx() { return rx; }, set rx(v) { rx = v; }, get ry() { return ry; }, set ry(v) { ry = v; } };
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
    let dragging = false, lastX = 0, lastY = 0;
    let orbitTimer = null;

    const state = () => vp.__d3;

    const stopOrbit = () => { if (orbitTimer) { clearInterval(orbitTimer); orbitTimer = null; } vp.querySelector(".d3-orbit-btn").textContent = "↻ Orbit"; };
    const startOrbit = () => {
      orbitTimer = setInterval(() => { const s = state(); if (!s) return; s.ry = (s.ry + 0.6) % 360; s.apply(); }, 30);
      vp.querySelector(".d3-orbit-btn").textContent = "⏸ Stop";
    };

    vp.addEventListener("pointerdown", (e) => {
      if (e.target.closest("button")) return;
      dragging = true; lastX = e.clientX; lastY = e.clientY;
      stopOrbit();
      vp.setPointerCapture(e.pointerId);
    });
    vp.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      const s = state();
      if (!s) return;
      s.ry += (e.clientX - lastX) * 0.5;
      s.rx = Math.max(-80, Math.min(80, s.rx - (e.clientY - lastY) * 0.5));
      lastX = e.clientX; lastY = e.clientY;
      s.apply();
    });
    vp.addEventListener("pointerup", () => { dragging = false; });
    vp.addEventListener("pointerleave", () => { dragging = false; });

    vp.querySelector(".d3-orbit-btn").onclick = () => { if (orbitTimer) stopOrbit(); else startOrbit(); };
    vp.querySelector(".d3-reset-btn").onclick = () => { stopOrbit(); const s = state(); if (s) { s.rx = -8; s.ry = 18; s.apply(); } };
  });
}

// Bind search and filter events
const devSearch = $("dev-search");
if (devSearch) devSearch.oninput = renderDevicesCatalogueList;
const devFilterPlatform = $("dev-filter-platform");
if (devFilterPlatform) devFilterPlatform.onchange = renderDevicesCatalogueList;
const devFilterFormfactor = $("dev-filter-formfactor");
if (devFilterFormfactor) devFilterFormfactor.onchange = renderDevicesCatalogueList;

// Export button handler
const devExportBtn = $("dev-export-btn");
if (devExportBtn) {
  devExportBtn.onclick = () => {
    window.location.href = "/api/devices/export";
  };
}

// Import button handler
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
      videoDevices = []; // Clear local cache to force reload
      await loadDevicesCatalogue();
      showToast("Device catalogue successfully imported!", "success");
    } catch(err) {
      await alert("Failed to import device catalogue: " + err.message);
    }
  };
}

refreshAuthStatus();
checkToolchainStatusOnStartup();
