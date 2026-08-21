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

/* ================= Custom Dialog & Toast System ================= */

function showAlert(message, type = "warning", title = "Alert") {
  return new Promise((resolve) => {
    const modal = $("custom-alert-modal");
    const titleEl = $("custom-alert-title");
    const msgEl = $("custom-alert-message");
    const iconEl = $("custom-alert-icon");
    const okBtn = $("custom-alert-ok-btn");

    titleEl.textContent = title;
    msgEl.textContent = message;
    
    if (type === "error") { iconEl.innerHTML = "&#10060;"; iconEl.style.color = "#ef4444"; }
    else if (type === "success") { iconEl.innerHTML = "&#9989;"; iconEl.style.color = "#10b981"; }
    else if (type === "warning") { iconEl.innerHTML = "&#9888;"; iconEl.style.color = "#f59e0b"; }
    else { iconEl.innerHTML = "&#8505;"; iconEl.style.color = "#3b82f6"; }

    modal.classList.add("open");

    okBtn.onclick = () => {
      modal.classList.remove("open");
      resolve();
    };
  });
}

function showConfirm(message, title = "Confirm Action") {
  return new Promise((resolve) => {
    const modal = $("custom-confirm-modal");
    const titleEl = $("custom-confirm-title");
    const msgEl = $("custom-confirm-message");
    const okBtn = $("custom-confirm-ok-btn");
    const cancelBtn = $("custom-confirm-cancel-btn");

    titleEl.textContent = title;
    msgEl.textContent = message;
    modal.classList.add("open");

    okBtn.onclick = () => {
      modal.classList.remove("open");
      resolve(true);
    };

    cancelBtn.onclick = () => {
      modal.classList.remove("open");
      resolve(false);
    };
  });
}

function showPrompt(message, defaultValue = "", title = "Input Required") {
  return new Promise((resolve) => {
    const modal = $("custom-prompt-modal");
    const titleEl = $("custom-prompt-title");
    const msgEl = $("custom-prompt-message");
    const inputEl = $("custom-prompt-input");
    const submitBtn = $("custom-prompt-submit-btn");
    const cancelBtn = $("custom-prompt-cancel-btn");

    titleEl.textContent = title;
    msgEl.textContent = message;
    inputEl.value = defaultValue;
    modal.classList.add("open");
    inputEl.focus();

    submitBtn.onclick = () => {
      modal.classList.remove("open");
      resolve(inputEl.value);
    };

    cancelBtn.onclick = () => {
      modal.classList.remove("open");
      resolve(null);
    };
    
    inputEl.onkeydown = (e) => {
      if (e.key === "Enter") {
        submitBtn.click();
      }
    };
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
    if (targetTab !== "projects" && !activeProjectId) {
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
  const tabs = ["capture", "mockup", "video"];
  for (const t of tabs) {
    const el = $("tab-nav-" + t);
    if (activeProjectId) {
      el.classList.remove("disabled");
      el.removeAttribute("title");
    } else {
      el.classList.add("disabled");
      el.setAttribute("title", "Select a project first");
    }
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
    
    if (projects.length === 0) {
      container.textContent = "No projects found. Create one to get started!";
      return;
    }

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
        <div style="flex: 1;">
          <div class="project-item-title">
            ${isActive ? '<span class="active-check">&#10003;</span>' : ''}
            <span>${p.name}</span>
          </div>
          <div class="project-item-meta">Created: ${new Date(p.createdAt).toLocaleString()}</div>
          <div class="project-stats">
            <span>Screenshots: ${p.captures?.length ?? 0}</span>
            <span>Mockup screens: ${p.mockup?.columns?.length ?? 0}</span>
            <span>Video scenes: ${p.video?.scenes?.length ?? 0}</span>
          </div>
        </div>
        <div style="display: flex; gap: 0.5rem; align-items: center;">
          <button class="small select-btn" style="${isActive ? 'background:#10b981;' : 'background:#262a33;'}">${isActive ? 'Active' : 'Select'}</button>
          <button class="small danger delete-btn">&#128465;</button>
        </div>
      `;

      card.querySelector(".select-btn").onclick = () => selectProject(p.id);
      card.querySelector(".delete-btn").onclick = async () => {
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

// Initial loading check on start
setTimeout(() => {
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
}

async function renderLiveBrowserCaptures() {
  const gallery = $("live-captures-gallery");
  gallery.innerHTML = "";

  if (!activeProjectId) return;

  try {
    const proj = await api(`/api/projects/${activeProjectId}`);
    if (!proj.captures || proj.captures.length === 0) {
      gallery.innerHTML = `<div class="hint" style="grid-column: span 2; text-align: center; padding: 2rem 0;">No screenshots captured yet.</div>`;
      return;
    }

    for (const c of proj.captures) {
      const item = document.createElement("div");
      item.className = "thumb";
      item.style = "height: fit-content; align-self: start;";
      const fileUrl = `/api/projects/${activeProjectId}/file?p=${encodeURIComponent(c.file)}`;

      // Build card manually via DOM (no innerHTML) to guarantee onclick works
      const img = document.createElement("img");
      img.src = fileUrl;
      img.style.cssText = "cursor:pointer; width:100%; height:auto; max-height:220px; display:block; aspect-ratio:9/16; object-fit:contain; background:#000;";

      const cap = document.createElement("div");
      cap.style.cssText = "display:flex; justify-content:space-between; align-items:center; padding:0.35rem 0.5rem; background:#14171f; border-top:1px solid #21252f;";

      const label = document.createElement("span");
      label.style.cssText = "font-weight:600; color:#e5e7eb; font-size:0.75rem;";
      label.textContent = `Screen ${c.id}`;

      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.style.cssText = "padding:0.25rem 0.35rem; border-radius:4px; display:inline-flex; align-items:center; justify-content:center; cursor:pointer; color:#fff; background:#dc2626; border:none; transition:background 0.2s;";
      delBtn.title = "Delete screenshot";
      delBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>`;

      // Two-click inline confirm — no modal dependency
      let confirmTimer = null;
      let confirming = false;

      delBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        e.preventDefault();

        if (!confirming) {
          // First click: enter confirm state
          confirming = true;
          delBtn.style.background = "#f59e0b";
          delBtn.title = "Click again to confirm delete";
          delBtn.innerHTML = `<span style="font-size:10px; font-weight:800;">✓?</span>`;
          confirmTimer = setTimeout(() => {
            // Timed out without second click — reset
            confirming = false;
            delBtn.style.background = "#dc2626";
            delBtn.title = "Delete screenshot";
            delBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>`;
          }, 2500);
        } else {
          // Second click: confirmed — execute delete
          clearTimeout(confirmTimer);
          confirming = false;

          // Remove from DOM immediately for instant feedback
          item.remove();
          if (gallery.children.length === 0) {
            gallery.innerHTML = `<div class="hint" style="grid-column:span 2; text-align:center; padding:2rem 0;">No screenshots captured yet.</div>`;
          }

          try {
            await api(`/api/projects/${activeProjectId}/captures/${c.id}`, { method: "DELETE" });
          } catch (_) {
            // Fallback to file path delete
            try {
              await api(`/api/projects/${activeProjectId}/file?p=${encodeURIComponent(c.file)}`, { method: "DELETE" });
            } catch (err2) {
              showToast("Delete failed: " + err2.message, "error");
              renderLiveBrowserCaptures();
              return;
            }
          }

          showToast(`Screenshot ${c.id} deleted`, "info");
          activeProject = await api(`/api/projects/${activeProjectId}`).catch(() => activeProject);
          if (typeof refreshFileExplorer === "function") refreshFileExplorer();
        }
      });

      img.addEventListener("click", () => {
        const box = document.createElement("div");
        box.style.cssText = "position:fixed; inset:0; background:rgba(0,0,0,0.85); display:flex; align-items:center; justify-content:center; z-index:200; cursor:pointer;";
        box.innerHTML = `<img src="${fileUrl}" style="max-width:90%; max-height:90%; border-radius:8px;" />`;
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

// Connect / Disconnect Live Session
$("browser-connect-btn").onclick = async () => {
  if (browserConnected) {
    await disconnectLiveBrowser();
  } else {
    await connectLiveBrowser();
  }
};

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
      await alert(res.message || "Demo login session has expired or is invalid. Please log in again.", "warning");
    }

    browserConnected = true;
    $("browser-connect-btn").disabled = false;
    $("browser-connect-btn").textContent = "Disconnect";
    $("browser-connect-btn").style.background = "#ef4444";
    $("live-browser-status").textContent = "Live mobile session active. Click inside the device frame to interact.";
    $("browser-device-frame").style.display = "block";
    $("browser-bottom-controls").style.display = "flex";

    // Set viewport scaling preview aspect ratio matching the target mobile resolution
    const isTablet = resolutionKey === "2048x2732" || resolutionKey === "1200x1920";
    const previewWidth = isTablet ? 420 : 360;
    const aspect = height / width;
    const frameEl = $("browser-viewport-container");
    frameEl.style.width = `${previewWidth}px`;
    frameEl.style.height = `${Math.round(previewWidth * aspect)}px`;

    // Start frame streaming interval
    startFrameStream();
  } catch (e) {
    await alert("Connection failed: " + e.message);
    $("browser-connect-btn").disabled = false;
    $("browser-connect-btn").textContent = "Connect";
    $("live-browser-status").textContent = "Connection failed. Please check the URL and try again.";
  }
}

async function disconnectLiveBrowser() {
  clearInterval(frameIntervalId);
  $("browser-connect-btn").disabled = true;
  $("browser-connect-btn").textContent = "Disconnecting...";

  try {
    await api("/api/browser/stop", { method: "POST" });
  } catch (e) {}

  browserConnected = false;
  $("browser-connect-btn").disabled = false;
  $("browser-connect-btn").textContent = "Connect";
  $("browser-connect-btn").style.background = "#3b82f6";
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

imgEl.addEventListener("pointerdown", (e) => {
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
  try { imgEl.setPointerCapture(e.pointerId); } catch (err) {}
});

imgEl.addEventListener("pointermove", (e) => {
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

      const rect = imgEl.getBoundingClientRect();
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
  
  try { imgEl.releasePointerCapture(e.pointerId); } catch (err) {}

  const rect = imgEl.getBoundingClientRect();
  const xPct = ((e.clientX - rect.left) / rect.width) * 100;
  const yPct = ((e.clientY - rect.top) / rect.height) * 100;

  if (!hasDragged && elapsed < 350) {
    // Instant single tap
    try {
      await api("/api/browser/action", {
        method: "POST",
        body: { type: "click", xPct, yPct }
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

imgEl.addEventListener("pointerup", handlePointerEnd);
imgEl.addEventListener("pointercancel", handlePointerEnd);

// Wheel & Trackpad scroll listener
imgEl.addEventListener("wheel", (e) => {
  if (!browserConnected) return;
  e.preventDefault();
  cancelAnimationFrame(inertiaRafId);
  const rect = imgEl.getBoundingClientRect();
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

// Auto-fill Demo credentials helper
$("browser-autofill-btn").onclick = async () => {
  if (!browserConnected) {
    await alert("Start session and connect first.");
    return;
  }
  try {
    const status = await api("/api/auth/status");
    if (!status.email) {
      await alert("Demo email/password not set. Please configure in the Demo Access modal (key icon).");
      return;
    }
    
    // Type credentials sequentially using Playwright action keyboard dispatching
    // We send tab and typing actions
    await alert("Attempting to auto-fill. Click in the email field first, then click OK.");
    await api("/api/browser/action", { method: "POST", body: { type: "type", text: status.email } });
    await api("/api/browser/action", { method: "POST", body: { type: "press", key: "Tab" } });
    if (status.passwordSet) {
      // Prompt user or type placeholder/real password
      const pw = await prompt("Please enter password to type:", "");
      if (pw) {
        await api("/api/browser/action", { method: "POST", body: { type: "type", text: pw } });
      }
    }
  } catch (e) {
    await alert("Autofill failed: " + e.message);
  }
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
    await triggerScreenshotCapture();
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
  mockupProject = await api(`/api/mockups/${id}`);
  $("mockup-project-label").textContent = mockupProject.name;
  await ensureMockupReferenceData();
  renderMockupTemplateGrid();
  renderMockupMatrix();
  renderMockupDevicesSection();
  renderMockupSettingsSection();
  $("mockup-panorama-flip").checked = mockupProject.globalPanoramic.flip;
}

async function ensureMockupReferenceData() {
  if (mockupDevicesCatalog.length === 0) {
    const { devices } = await api("/api/devices");
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

$("mockup-new-project").onclick = async () => {
  const name = await prompt("Project name?", "My App");
  if (!name) return;
  const project = await api("/api/mockups", { method: "POST", body: { name } });
  await loadMockupProjectInto(project.id);
};

/* ---- Templates section ---- */
async function renderMockupTemplateGrid() {
  const { templates } = await api("/api/mockups/templates");
  const grid = $("mockup-template-grid");
  grid.innerHTML = "";
  for (const t of templates) {
    const card = document.createElement("div");
    card.className = "template-card";
    card.innerHTML = `<div class="cat">${t.category}</div><h4>${t.name}</h4>`;
    card.onclick = async () => {
      if (!mockupId) {
        await alert("Start a project first.");
        return;
      }
      mockupProject = await api(`/api/mockups/${mockupId}/apply-template`, { method: "POST", body: { templateId: t.id } });
      renderMockupMatrix();
      renderMockupDevicesSection();
      await alert(`Applied "${t.name}" — ${mockupProject.devices.length} device row(s), ${mockupProject.columns.length} screen(s). Switch to Editor to customize.`);
    };
    grid.appendChild(card);
  }
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

  $("mk-source").innerHTML = mockupProject.sources.map((s) => `<option value="${s.id}">${s.name}</option>`).join("");
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
let videoSceneOptions = { animations: [], backgrounds: [] };
let videoDevices = [];
let selectedSceneId = null;

function videoFileUrl(rel) { return `/api/videos/${videoId}/file?p=${encodeURIComponent(rel)}`; }

async function loadVideoProjectInto(id) {
  videoId = id;
  videoProject = await api(`/api/videos/${id}`);
  $("video-project-label").textContent = videoProject.name;
  if (videoDevices.length === 0) {
    const { devices } = await api("/api/devices");
    videoDevices = devices;
  }
  if (videoSceneOptions.animations.length === 0) videoSceneOptions = await api("/api/videos/scene-options");
  renderVideoTemplateGrid();
  renderVideoScenes();
}
$("video-new-project").onclick = async () => {
  const name = await prompt("Project name?", "Promo Video");
  if (!name) return;
  const project = await api("/api/videos", { method: "POST", body: { name } });
  await loadVideoProjectInto(project.id);
};

async function renderVideoTemplateGrid() {
  const { templates } = await api("/api/videos/templates");
  const grid = $("video-template-grid");
  grid.innerHTML = "";
  for (const t of templates) {
    const card = document.createElement("div");
    card.className = "template-card";
    card.innerHTML = `<h4>${t.name}</h4><div class="desc">${t.description}</div><div class="hint">${t.sceneCount} scenes</div>`;
    card.onclick = async () => {
      if (!videoId) {
        await alert("Start a project first.");
        return;
      }
      videoProject = await api(`/api/videos/${videoId}/apply-template`, { method: "POST", body: { templateId: t.id, device: "phone" } });
      renderVideoScenes();
      $("video-template-preview-card").style.display = "block";
      $("video-template-preview").src = `/api/videos/${videoId}/template-preview?t=${Date.now()}`;
    };
    grid.appendChild(card);
  }
}

function renderVideoScenes() {
  $("sc-template").innerHTML = videoSceneOptions.animations.map((a) => `<option value="${a.id}">${a.name}</option>`).join("");
  $("sc-background").innerHTML = videoSceneOptions.backgrounds.map((b) => `<option value="${b}">${b}</option>`).join("");
  $("sc-device").innerHTML = videoDevices.map((d) => `<option value="${d.id}">${d.vendor} — ${d.name}</option>`).join("");
  $("sc-source").innerHTML = (videoProject.sources || []).map((s) => `<option value="${s.id}">${s.name}</option>`).join("");

  const nav = $("video-scene-nav");
  nav.innerHTML = "";
  videoProject.scenes.forEach((s, i) => {
    const chip = document.createElement("div");
    chip.className = "scene-chip" + (i === 0 ? " active" : "");
    chip.textContent = `Scene ${i + 1}`;
    chip.dataset.sceneId = s.id;
    chip.onclick = () => selectScene(s.id);
    nav.appendChild(chip);
  });
  if (videoProject.scenes.length) selectScene(videoProject.scenes[0].id);
}

function selectScene(sceneId) {
  selectedSceneId = sceneId;
  for (const chip of document.querySelectorAll(".scene-chip")) chip.classList.toggle("active", chip.dataset.sceneId === sceneId);
  const scene = videoProject.scenes.find((s) => s.id === sceneId);
  $("sc-template").value = scene.sceneTemplate;
  $("sc-device").value = scene.device;
  $("sc-background").value = scene.background;
  $("sc-text").value = scene.text;
  $("sc-subtext").value = scene.subtext;
  $("sc-duration").value = scene.durationSeconds;
  $("sc-rotate").value = scene.rotate; $("sc-rotate-val").textContent = scene.rotate;
  $("sc-zoom").value = scene.zoom; $("sc-zoom-val").textContent = scene.zoom;
  $("sc-move").value = scene.move; $("sc-move-val").textContent = scene.move;
  if (scene.sourceId) $("sc-source").value = scene.sourceId;
  updateVariantSelect("sc-device", "sc-variant", scene.variant, videoDevices);
  showScenePreview();
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
function showScenePreview() { $("sc-preview").src = `/api/videos/${videoId}/scene-preview/${selectedSceneId}?t=${Date.now()}`; }

$("sc-source-upload").onclick = async () => {
  if (!activeProjectId) {
    await alert("Select a project first.");
    return;
  }
  openUniversalUploadModal((selectedPath) => {
    setTimeout(async () => {
      videoProject = await api(`/api/videos/${activeProjectId}`);
      // Re-populate the source dropdown and select the newly selected screenshot
      $("sc-source").innerHTML = (videoProject.sources || []).map((s) => `<option value="${s.id}">${s.name}</option>`).join("");
      const src = videoProject.sources.find(s => s.file === selectedPath);
      if (src) {
        $("sc-source").value = src.id;
      }
    }, 200);
  });
};

$("sc-save").onclick = async () => {
  const body = {
    sceneTemplate: $("sc-template").value, device: $("sc-device").value, variant: $("sc-variant").value || undefined,
    background: $("sc-background").value, text: $("sc-text").value, subtext: $("sc-subtext").value,
    durationSeconds: Number($("sc-duration").value) || 3, rotate: Number($("sc-rotate").value),
    zoom: Number($("sc-zoom").value), move: Number($("sc-move").value), sourceId: $("sc-source").value || undefined,
  };
  const updated = await api(`/api/videos/${videoId}/scenes/${selectedSceneId}`, { method: "PUT", body });
  const idx = videoProject.scenes.findIndex((s) => s.id === selectedSceneId);
  videoProject.scenes[idx] = updated;
  showScenePreview();
};

$("sc-ai-text").onclick = async () => {
  const hint = await prompt("Briefly describe this scene (used only to generate the text/subtext):", $("sc-text").value);
  if (hint === null) return;
  try {
    const { text, subtext } = await api(`/api/videos/${videoId}/scenes/${selectedSceneId}/ai-text`, { method: "POST", body: { hint } });
    if (text) $("sc-text").value = text;
    if (subtext) $("sc-subtext").value = subtext;
  } catch (e) { await alert("AI assist failed: " + e.message); }
};

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

/* ============================================================
   Init
   ============================================================ */

refreshAuthStatus();
