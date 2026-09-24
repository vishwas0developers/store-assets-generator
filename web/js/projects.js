// Projects module — Project management, tab gating, file explorer & settings modal.

import {
  activeProjectId,
  activeProject,
  setActiveProjectId,
  setActiveProject,
  mockupId
} from './state.js';
import { loadMockupProjectInto } from './templates.js';
import { api, showAlert, showConfirm } from './utils.js';

let projectSettingsTargetId = null;
let currentFileFilter = 'all';

/**
 * Updates navigation tabs accessibility based on active project state.
 */
export function updateTabGating() {
  const el = document.getElementById('tab-nav-capture');
  if (el) {
    if (activeProjectId) {
      el.classList.remove('disabled');
      el.removeAttribute('title');
    } else {
      el.classList.add('disabled');
      el.setAttribute('title', 'Select a project first');
    }
  }

  const brand = document.getElementById('brand-title');
  const activeCard = document.getElementById('active-project-card');
  const explorerCard = document.getElementById('project-explorer-card');

  if (activeProject) {
    if (brand) brand.textContent = `Store Assets Generator - ${activeProject.name}`;
    if (activeCard) activeCard.style.display = 'block';
    const nameDisp = document.getElementById('active-proj-name-display');
    const catDisp = document.getElementById('active-proj-cat-display');
    const urlDisp = document.getElementById('active-proj-url-display');
    if (nameDisp) nameDisp.textContent = activeProject.name;
    if (catDisp) catDisp.textContent = activeProject.appCategory || 'Education';
    if (urlDisp) urlDisp.textContent = activeProject.targetUrl || 'None';
    if (explorerCard) explorerCard.style.display = 'block';
    refreshFileExplorer();
  } else {
    if (brand) brand.textContent = 'Store Assets Generator';
    if (activeCard) activeCard.style.display = 'none';
    if (explorerCard) explorerCard.style.display = 'none';
  }
}

/**
 * Selects an active project by id.
 * @param {string} id
 */
export async function selectProject(id) {
  try {
    setActiveProjectId(id);
    const proj = await api(`/api/projects/${id}`);
    setActiveProject(proj);
    updateTabGating();
    await refreshProjectsList();
  } catch (e) {
    await showAlert('Failed to select project: ' + e.message);
  }
}

/**
 * Refreshes the projects list view.
 */
export async function refreshProjectsList() {
  const container = document.getElementById('projects-list-container');
  if (!container) return;
  container.innerHTML = 'Loading projects...';

  try {
    const { projects } = await api('/api/projects');
    container.innerHTML = '';

    const countBadge = document.getElementById('projects-count-badge');
    if (countBadge) {
      countBadge.textContent = `${projects.length} Project${projects.length === 1 ? '' : 's'}`;
    }

    if (projects.length === 0) {
      container.textContent = 'No projects found. Create one to get started!';
      return;
    }

    container.className = 'projects-grid';

    if (activeProjectId && !activeProject) {
      const p = projects.find((x) => x.id === activeProjectId);
      if (p) {
        setActiveProject(p);
        updateTabGating();
      }
    }

    for (const p of projects) {
      const isActive = Boolean(activeProjectId && activeProject && p.id === activeProjectId);
      const card = document.createElement('div');
      card.className = `project-item ${isActive ? 'active' : ''}`;

      card.innerHTML = `
        <button class="small project-item-corner left settings-btn" title="Project settings">&#9881;</button>
        <button class="small danger project-item-corner right delete-btn" title="Delete">&#128465;</button>
        <div class="project-item-title">
          ${isActive ? '<span class="active-check">&#10003;</span>' : ''}
          <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 11ch;">${p.name}</span>
        </div>
        <div class="project-item-meta">Created: ${new Date(p.createdAt).toLocaleDateString()}</div>
        <div class="project-stats">
          <span>📸 ${p.captures?.length ?? 0}</span>
          <span>📱 ${p.mockup?.columns?.length ?? 0}</span>
          <span>🎬 ${p.video?.scenes?.length ?? 0}</span>
        </div>
        <div style="margin-top: 0.35rem;">
          <button class="small select-btn" style="${isActive ? 'background:#10b981;' : ''}">${isActive ? 'Active' : 'Select'}</button>
        </div>
      `;

      card.querySelector('.select-btn').onclick = (e) => {
        e.stopPropagation();
        selectProject(p.id);
      };
      card.querySelector('.settings-btn').onclick = (e) => {
        e.stopPropagation();
        openProjectSettingsModal(p);
      };
      card.querySelector('.delete-btn').onclick = async (e) => {
        e.stopPropagation();
        if (await showConfirm(`Are you sure you want to delete project "${p.name}"? This deletes all files and is irreversible.`)) {
          await api(`/api/projects/${p.id}`, { method: 'DELETE' });
          if (activeProjectId === p.id) {
            setActiveProjectId(null);
            setActiveProject(null);
            updateTabGating();
          }
          await refreshProjectsList();
        }
      };

      card.onclick = () => selectProject(p.id);
      container.appendChild(card);
    }
  } catch (e) {
    container.textContent = 'Failed to load projects: ' + e.message;
  }
}

export function openProjectSettingsModal(p) {
  projectSettingsTargetId = p.id;
  const nameEl = document.getElementById('proj-settings-name');
  const catEl = document.getElementById('proj-settings-category');
  const urlEl = document.getElementById('proj-settings-url');
  const modalEl = document.getElementById('project-settings-modal');

  if (nameEl) nameEl.value = p.name || '';
  if (catEl) catEl.value = p.appCategory || '';
  if (urlEl) urlEl.value = p.targetUrl || '';
  for (const r of document.querySelectorAll('input[name="proj-settings-platform"]')) r.checked = r.value === (p.platform || 'play-store');
  if (modalEl) modalEl.style.display = 'flex';
}

export function closeProjectSettingsModal() {
  const modalEl = document.getElementById('project-settings-modal');
  if (modalEl) modalEl.style.display = 'none';
  projectSettingsTargetId = null;
}

export async function refreshFileExplorer() {
  const container = document.getElementById('project-files-list');
  if (!container) return;
  if (!activeProjectId) {
    container.innerHTML = 'Select a project to inspect files.';
    return;
  }
  container.innerHTML = 'Loading files...';

  try {
    const { files } = await api(`/api/projects/${activeProjectId}/files`);
    container.innerHTML = '';

    const filtered = files.filter((f) => {
      if (currentFileFilter === 'all') return true;
      if (currentFileFilter === 'captures') return f.path.startsWith('captures/');
      if (currentFileFilter === 'mockup') return f.path.startsWith('mockup/');
      if (currentFileFilter === 'video') return f.path.startsWith('video/');
      if (currentFileFilter === 'uploads') return f.path.startsWith('uploads/');
      return true;
    });

    if (filtered.length === 0) {
      container.innerHTML = `<div style="text-align:center; padding: 2rem 0;" class="hint">No files found matching the "${currentFileFilter}" category.</div>`;
      return;
    }

    const table = document.createElement('table');
    table.className = 'file-table';
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
    const tbody = table.querySelector('tbody');

    for (const f of filtered) {
      const tr = document.createElement('tr');
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
        if (['png', 'jpg', 'jpeg', 'webp'].includes(ext)) {
          const box = document.createElement('div');
          box.style = 'position:fixed; inset:0; background:rgba(0,0,0,0.85); display:flex; align-items:center; justify-content:center; z-index:100; cursor:pointer;';
          box.innerHTML = `<img src="${downloadUrl}" style="max-width:90%; max-height:90%; border-radius:8px; box-shadow:0 10px 30px rgba(0,0,0,0.5);" />`;
          box.onclick = () => box.remove();
          document.body.appendChild(box);
        } else if (ext === 'mp4') {
          const box = document.createElement('div');
          box.style = 'position:fixed; inset:0; background:rgba(0,0,0,0.85); display:flex; align-items:center; justify-content:center; z-index:100; cursor:pointer;';
          box.innerHTML = `<video src="${downloadUrl}" controls autoplay style="max-width:90%; max-height:90%; border-radius:8px;" />`;
          box.onclick = (e) => { if (e.target === box) box.remove(); };
          document.body.appendChild(box);
        } else {
          await showAlert('Cannot preview this file type. Please click Download to view.');
        }
      };

      tr.querySelector('.preview-link').onclick = triggerPreview;
      tr.querySelector('.download-file-btn').onclick = () => window.open(downloadUrl);
      tr.querySelector('.delete-file-btn').onclick = async () => {
        if (await showConfirm(`Delete file "${f.path}"?`)) {
          await api(`/api/projects/${activeProjectId}/file?p=${encodeURIComponent(f.path)}`, { method: 'DELETE' });
          refreshFileExplorer();
        }
      };

      tbody.appendChild(tr);
    }

    container.appendChild(table);
  } catch (e) {
    container.textContent = 'Failed to load files: ' + e.message;
  }
}

/**
 * Sets up project event listeners and bindings.
 */
export function setupProjectsHandlers() {
  const createBtn = document.getElementById('proj-create-btn');
  if (createBtn) {
    createBtn.onclick = async () => {
      const name = document.getElementById('proj-new-name')?.value.trim();
      const category = document.getElementById('proj-new-category')?.value;
      const targetUrl = document.getElementById('proj-new-url')?.value.trim();

      if (!name) {
        await showAlert('Project Name is required.');
        return;
      }
      const platform = document.querySelector('input[name="proj-new-platform"]:checked')?.value;
      if (!platform) {
        await showAlert('Choose Play Store or App Store.');
        return;
      }

      try {
        const project = await api('/api/projects', {
          method: 'POST',
          body: { name, appCategory: category, targetUrl, platform }
        });

        const nameEl = document.getElementById('proj-new-name');
        const catEl = document.getElementById('proj-new-category');
        const urlEl = document.getElementById('proj-new-url');
        if (nameEl) nameEl.value = '';
        if (catEl) catEl.value = 'Education';
        if (urlEl) urlEl.value = '';
        for (const r of document.querySelectorAll('input[name="proj-new-platform"]')) r.checked = false;

        await selectProject(project.id);
      } catch (e) {
        await showAlert('Failed to create project: ' + e.message);
      }
    };
  }

  const cancelBtn = document.getElementById('proj-settings-cancel');
  if (cancelBtn) cancelBtn.onclick = closeProjectSettingsModal;

  const modalEl = document.getElementById('project-settings-modal');
  if (modalEl) {
    modalEl.onclick = (e) => {
      if (e.target.id === 'project-settings-modal') closeProjectSettingsModal();
    };
  }

  const saveBtn = document.getElementById('proj-settings-save');
  if (saveBtn) {
    saveBtn.onclick = async () => {
      if (!projectSettingsTargetId) return;
      const body = {
        name: document.getElementById('proj-settings-name')?.value.trim(),
        appCategory: document.getElementById('proj-settings-category')?.value.trim(),
        targetUrl: document.getElementById('proj-settings-url')?.value.trim(),
        platform: document.querySelector('input[name="proj-settings-platform"]:checked')?.value,
      };
      const previousPlatform = (activeProjectId === projectSettingsTargetId ? activeProject?.platform : null) || 'play-store';
      const updated = await api(`/api/projects/${projectSettingsTargetId}`, { method: 'PUT', body });
      if (activeProjectId === projectSettingsTargetId) {
        setActiveProject(updated);
        updateTabGating();
        // Platform decides the size rows: if the mockup for this project is loaded, force a reload so they reconcile.
        if (updated.platform !== previousPlatform && mockupId === updated.id) await loadMockupProjectInto(updated.id, true);
      }
      closeProjectSettingsModal();
      await refreshProjectsList();
    };
  }

  const activeSettingsBtn = document.getElementById('active-proj-settings-btn');
  if (activeSettingsBtn) {
    activeSettingsBtn.onclick = () => {
      if (activeProject) openProjectSettingsModal(activeProject);
    };
  }

  const downloadZipBtn = document.getElementById('proj-download-zip-btn');
  if (downloadZipBtn) {
    downloadZipBtn.onclick = () => {
      if (!activeProjectId) return;
      window.open(`/api/projects/${activeProjectId}/download-zip`);
    };
  }

  document.querySelectorAll('#project-explorer-card .tab').forEach((tab) => {
    tab.onclick = () => {
      document.querySelectorAll('#project-explorer-card .tab').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      currentFileFilter = tab.dataset.fileFilter;
      refreshFileExplorer();
    };
  });
}
