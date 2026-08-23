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

  const selectedResolution = $("browser-resolution-select").value;
  const dims = selectedResolution.split("x");
  const targetWidth = Number(dims[0]);
  const targetHeight = Number(dims[1]);

  // Update Section Title with size info
  const titleEl = $("session-captures-title");
  if (titleEl) {
    titleEl.textContent = `Session Captures (${selectedResolution})`;
  }

  try {
    const proj = await api(`/api/projects/${activeProjectId}`);
    if (!proj.captures || proj.captures.length === 0) {
      gallery.innerHTML = `<div class="hint" style="grid-column: span 2; text-align: center; padding: 2rem 0;">No screenshots captured yet.</div>`;
      return;
    }

    const filtered = proj.captures.filter(c => {
      if (c.resolution === selectedResolution) return true;
      // Fallback matching logic for old/unlabeled captures
      return c.width === targetWidth && c.height === targetHeight;
    });

    if (filtered.length === 0) {
      gallery.innerHTML = `<div class="hint" style="grid-column: span 2; text-align: center; padding: 2rem 0;">No screenshots captured for ${selectedResolution} yet.<br><br><span style="font-size:0.8rem; color:#888;">Change resolution or capture a new screenshot at this size.</span></div>`;
      return;
    }

    for (const c of filtered) {
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

      delBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        e.preventDefault();

        const confirmed = await showConfirm(`Delete Screenshot ${c.id}? This cannot be undone.`, "Delete Screenshot", true);
        if (!confirmed) return;

        // Remove from DOM immediately for instant feedback
        item.remove();
        if (gallery.children.length === 0) {
          gallery.innerHTML = `<div class="hint" style="grid-column: span 2; text-align: center; padding: 2rem 0;">No screenshots captured for ${selectedResolution} yet.</div>`;
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
    const previewWidth = isTablet ? 420 : 360;
    const aspect = height / width;
    const frameEl = $("browser-viewport-container");
    frameEl.style.width = `${previewWidth}px`;
    frameEl.style.height = `${Math.round(previewWidth * aspect)}px`;

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
    if (videoDevices.length === 0) {
      const { devices } = await api("/api/devices");
      videoDevices = devices;
    }
    if (videoSceneOptions.animations.length === 0) videoSceneOptions = await api("/api/videos/scene-options");
  } catch (e) {
    console.error("Failed to load video reference data:", e);
  }

  renderVideoTemplateGrid();
  if (videoProject) {
    renderVideoScenes();
  } else {
    $("video-scene-nav").innerHTML = "";
  }
}

let videoTemplates = [];
let videoTemplateDetailId = null;
let videoDetailSceneIndex = 0;
let videoDetailState = "idle"; // idle | playing | paused | ended
let videoDetailMode = "sequence"; // sequence | scene
let videoDetailAudio = null;
let videoDetailResizeObserver = null;

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

  const dots = $("video-detail-dots");
  if (dots) {
    dots.querySelectorAll(".video-scene-dot").forEach((d, i) => {
      d.classList.toggle("active", i === videoDetailSceneIndex);
    });
  }
  const stage = $("video-template-stage");
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
      </div>
      <div class="template-detail-side">
        <div class="video-screen-list">
          ${t.scenes
            .map(
              (s, i) => `
            <div class="video-screen-card" data-scene-jump="${i}">
              <div class="video-screen-num">Screen ${i + 1}</div>
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

  // The side panel's height tracks exactly the rendered .video-player box
  // (the card around the stage, including its padding) -- never the taller
  // of the two columns, never the section's own height. The screen list
  // scrolls internally if it doesn't fit. A ResizeObserver (not a one-shot
  // measurement) keeps this correct across window resizes.
  const player = stage.querySelector(".video-player");
  const side = stage.querySelector(".template-detail-side");
  videoDetailResizeObserver = new ResizeObserver(() => {
    side.style.height = `${player.getBoundingClientRect().height}px`;
  });
  videoDetailResizeObserver.observe(player);
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
  $("sc-text").value = scene.text;
  $("sc-subtext").value = scene.subtext;
  $("sc-duration").value = scene.durationSeconds;
  $("sc-rotate").value = scene.rotate; $("sc-rotate-val").textContent = scene.rotate;
  $("sc-zoom").value = scene.zoom; $("sc-zoom-val").textContent = scene.zoom;
  $("sc-move").value = scene.move; $("sc-move-val").textContent = scene.move;
  if (scene.sourceId) $("sc-source").value = scene.sourceId;
  updateVariantSelect("sc-device", "sc-variant", scene.variant, videoDevices);
  updateSceneSpecialPanels(scene.sceneTemplate);
  renderFlowStepsEditor(scene.flowSteps);
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
    sceneTemplate: $("sc-template").value, layout: $("sc-layout").value || undefined,
    depth: $("sc-depth").value || "flat", transition: $("sc-transition").value || "cut",
    device: $("sc-device").value, variant: $("sc-variant").value || undefined,
    background: $("sc-background").value, text: $("sc-text").value, subtext: $("sc-subtext").value,
    durationSeconds: Number($("sc-duration").value) || 3, rotate: Number($("sc-rotate").value),
    zoom: Number($("sc-zoom").value), move: Number($("sc-move").value), sourceId: $("sc-source").value || undefined,
    flowSteps: currentSceneFlowSteps.length > 0 ? currentSceneFlowSteps : undefined,
  };
  try {
    const updated = await api(`/api/videos/${videoId}/scenes/${selectedSceneId}`, { method: "PUT", body });
    const idx = videoProject.scenes.findIndex((s) => s.id === selectedSceneId);
    videoProject.scenes[idx] = updated;
    showScenePreview();
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
