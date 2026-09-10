// Export module — rendering to PNG, store package ZIP generation,
// and progress indicators.

import { mockupId, mockupProject, activeProjectId } from './state.js';
import { api } from './utils.js';

/**
 * Renders all mockup columns to a full store package ZIP.
 * Downloads via a hidden anchor to trigger browser save dialog.
 */
export async function generateStorePackage() {
  if (!mockupId || !mockupProject) return;

  const exportBtn = document.getElementById("mockup-export-btn");
  if (exportBtn) exportBtn.disabled = true;

  try {
    const res = await api(`/api/mockups/${mockupId}/render`, {
      method: "POST",
      body: { columns: mockupProject.columns, devices: mockupProject.devices, cells: mockupProject.cells },
    });

    // res.files contains URLs for rendered PNGs; trigger download
    if (res.files && res.files[0]) {
      const dlUrl = res.files[0].url || `/api/mockups/${mockupId}/file?p=${encodeURIComponent(res.files[0].path)}`;
      const a = document.createElement("a");
      a.href = dlUrl;
      a.download = "store-package.zip";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } else if (res.downloadUrl) {
      const a = document.createElement("a");
      a.href = res.downloadUrl;
      a.download = "store-package.zip";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  } finally {
    if (exportBtn) exportBtn.disabled = false;
  }
}

/**
 * Single-screen renderer — fetches and displays a server-rendered preview.
 */
export async function previewSingleScreen(columnId) {
  if (!mockupId || !mockupProject) return;
  const col = mockupProject.columns.find(c => c.id === columnId);
  if (!col) return;

  const res = await api(`/api/mockups/${mockupId}/render/preview`, {
    method: "POST",
    body: { column: col, device: mockupProject.devices?.[0] },
  });

  return res.previewUrl || null;
}

export function setupExportHandlers() {
  const btn = document.getElementById("mockup-export-btn");
  if (btn) btn.onclick = generateStorePackage;

  const pkgBtn = document.getElementById("mockup-package-btn");
  if (pkgBtn) pkgBtn.onclick = generateStorePackage;
}
