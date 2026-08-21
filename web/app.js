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

/* ================= Top-level tab / rail navigation ================= */

for (const tab of document.querySelectorAll(".topbar-tab")) {
  tab.onclick = () => {
    for (const t of document.querySelectorAll(".topbar-tab")) t.classList.remove("active");
    for (const p of document.querySelectorAll(".tab-page")) p.classList.remove("active");
    tab.classList.add("active");
    $("tab-" + tab.dataset.tab).classList.add("active");
  };
}

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
  if (!email) return alert("Email is required.");
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

/* ================= Projects modal ================= */

$("open-sessions").onclick = () => { $("sessions-backdrop").classList.add("open"); refreshAllProjectLists(); };
$("sessions-close").onclick = () => $("sessions-backdrop").classList.remove("open");
for (const tab of document.querySelectorAll("#sessions-backdrop .tab")) {
  tab.onclick = () => {
    for (const t of document.querySelectorAll("#sessions-backdrop .tab")) t.classList.remove("active");
    for (const p of document.querySelectorAll("#sessions-backdrop .tab-panel")) p.classList.remove("active");
    tab.classList.add("active");
    $("ptab-" + tab.dataset.ptab).classList.add("active");
  };
}
async function refreshAllProjectLists() {
  const { sessions } = await api("/api/captures");
  renderProjectRows($("sessions-list-capture"), sessions, (id) => loadCaptureProject(id));
  const { projects: mockups } = await api("/api/mockups");
  renderProjectRows($("sessions-list-mockup"), mockups, (id) => loadMockupProjectInto(id));
  const { projects: videos } = await api("/api/videos");
  renderProjectRows($("sessions-list-video"), videos, (id) => loadVideoProjectInto(id));
}
function renderProjectRows(container, rows, onOpen) {
  container.innerHTML = "";
  if (rows.length === 0) { container.textContent = "None yet."; return; }
  for (const r of rows) {
    const row = document.createElement("div");
    row.className = "session-row";
    row.innerHTML = `<span style="flex:1">${r.name || r.url || r.id}</span><span class="provider-meta">${new Date(r.createdAt).toLocaleString()}</span>`;
    const btn = document.createElement("button");
    btn.className = "small secondary";
    btn.textContent = "Open";
    btn.onclick = async () => { await onOpen(r.id); $("sessions-backdrop").classList.remove("open"); };
    row.appendChild(btn);
    container.appendChild(row);
  }
}

/* ============================================================
   Screen Capture tab
   ============================================================ */

let captureId = null;
let captureProject = null;

async function loadCaptureProject(id) {
  captureId = id;
  captureProject = await api(`/api/captures/${id}`);
  $("capture-session-label").textContent = `${captureProject.name} (${captureProject.source})`;
  renderCaptureThumbs();
}
function captureFileUrl(rel) { return `/api/captures/${captureId}/file?p=${encodeURIComponent(rel)}`; }
function renderCaptureThumbs() {
  const websiteGrid = $("cap-thumbs-website");
  const androidGrid = $("cap-thumbs-android");
  websiteGrid.innerHTML = ""; androidGrid.innerHTML = "";
  if (!captureProject) return;
  const grid = captureProject.source === "android" ? androidGrid : websiteGrid;
  for (const r of captureProject.raw) {
    const t = document.createElement("div");
    t.className = "thumb";
    t.innerHTML = `<img src="${captureFileUrl(r.file)}" /><div class="cap">${r.title}</div>`;
    grid.appendChild(t);
  }
}

/* Numbered URL slots -- one per screenshot to capture, count-driven.
   Each slot pairs a numeric identifier (auto 1..N, editable, digits only --
   just a slot label, never a page name) with the actual URL to capture
   from, entered separately and associated with that identifier. Capture
   order follows slot order, not the identifier value. */
function renderUrlGrid(count) {
  const grid = $("cap-url-grid");
  const existing = [...grid.children].map((slot) => ({
    id: slot.querySelector(".slot-id").value,
    url: slot.querySelector(".slot-url").value,
  }));
  grid.innerHTML = "";
  const n = Math.max(1, Math.min(30, Number(count) || 1));
  for (let i = 0; i < n; i++) {
    const prev = existing[i];
    const slot = document.createElement("div");
    slot.className = "url-slot";
    slot.innerHTML = `
      <input class="slot-id" type="number" min="1" step="1" inputmode="numeric" style="width:2.6rem;flex:0 0 auto;" value="${prev ? prev.id : i + 1}" title="Numeric identifier (slot label only, not order)" />
      <input class="slot-url" type="url" placeholder="https://example.com/page-${i + 1}" value="${prev ? prev.url : ""}" style="flex:1;" />
    `;
    // Digits only in the identifier field -- reject anything else as typed.
    slot.querySelector(".slot-id").addEventListener("input", (e) => {
      e.target.value = e.target.value.replace(/[^0-9]/g, "");
    });
    grid.appendChild(slot);
  }
}
$("cap-url-count").oninput = () => renderUrlGrid($("cap-url-count").value);
renderUrlGrid($("cap-url-count").value);

function collectUrlEntries() {
  return [...$("cap-url-grid").children]
    .map((slot) => ({ id: Number(slot.querySelector(".slot-id").value) || 0, url: slot.querySelector(".slot-url").value.trim() }))
    .filter((entry) => entry.url.length > 0);
}

$("cap-new-session").onclick = async () => {
  const url = $("cap-url").value.trim();
  if (!url) return alert("App URL is required.");
  const platforms = [];
  if ($("cap-plat-google").checked) platforms.push("google-play");
  if ($("cap-plat-apple").checked) platforms.push("apple-app-store");
  const session = await api("/api/captures", { method: "POST", body: { source: "website", url, slug: $("cap-slug").value.trim() || undefined, platforms: platforms.length ? platforms : ["google-play"] } });
  await loadCaptureProject(session.id);
};
$("cap-run").onclick = async () => {
  if (!captureId) return alert("Start a website capture project first.");
  const pages = collectUrlEntries();
  if (pages.length === 0) return alert("Enter at least one URL in the numbered fields above.");
  $("cap-run").disabled = true;
  $("cap-result").textContent = "Capturing… this can take a minute.";
  try {
    const result = await api(`/api/captures/${captureId}/website`, { method: "POST", body: { pages } });
    captureProject.raw = result.raw;
    $("cap-result").innerHTML = `<span class="count-badge">${result.count}</span> screenshots captured.`;
    renderCaptureThumbs();
  } catch (e) {
    $("cap-result").textContent = "Capture failed: " + e.message;
  } finally {
    $("cap-run").disabled = false;
  }
};

async function refreshAndroidDevices() {
  if (!captureId) return;
  try {
    const { devices } = await api(`/api/captures/${captureId}/android/devices`);
    $("cap-android-device").innerHTML = devices.length ? devices.map((d) => `<option value="${d}">${d}</option>`).join("") : '<option value="">No devices found</option>';
  } catch (e) {
    $("cap-android-device").innerHTML = '<option value="">Error listing devices</option>';
  }
}
$("cap-android-new-session").onclick = async () => {
  const session = await api("/api/captures", { method: "POST", body: { source: "android", name: "Android capture" } });
  await loadCaptureProject(session.id);
  refreshAndroidDevices();
};
$("cap-android-refresh").onclick = refreshAndroidDevices;
$("cap-android-run").onclick = async () => {
  if (!captureId) return alert("Start an Android capture project first.");
  $("cap-android-run").disabled = true;
  $("cap-android-result").textContent = "Capturing…";
  try {
    const result = await api(`/api/captures/${captureId}/android`, {
      method: "POST",
      body: { deviceId: $("cap-android-device").value || undefined, deepLink: $("cap-android-deeplink").value.trim() || undefined, title: $("cap-android-title").value.trim() || undefined },
    });
    captureProject.raw = result.raw;
    $("cap-android-result").innerHTML = `<span class="count-badge">${result.count}</span> screenshots captured.`;
    renderCaptureThumbs();
  } catch (e) {
    $("cap-android-result").textContent = "Capture failed: " + e.message;
  } finally {
    $("cap-android-run").disabled = false;
  }
};

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
  const name = prompt("Project name?", "My App");
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
      if (!mockupId) return alert("Start a project first.");
      mockupProject = await api(`/api/mockups/${mockupId}/apply-template`, { method: "POST", body: { templateId: t.id } });
      renderMockupMatrix();
      renderMockupDevicesSection();
      alert(`Applied "${t.name}" — ${mockupProject.devices.length} device row(s), ${mockupProject.columns.length} screen(s). Switch to Editor to customize.`);
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
  if (!mockupId) return alert("Start a project first.");
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
  const file = $("mk-source-file").files[0];
  if (!file || !mockupId) return alert("Choose an image first.");
  const source = await uploadFile(`/api/mockups/${mockupId}/sources`, file);
  mockupProject.sources.push(source);
  if (selectedCell) selectCell(selectedCell.deviceRowId, selectedCell.columnId);
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
  alert("Style copied across all device rows for this screen.");
};

$("mk-ai-text").onclick = async () => {
  const hint = prompt("Briefly describe this screen (used only to generate the title/subtitle):", $("mk-title").value);
  if (hint === null) return;
  try {
    const { title, subtitle } = await api(`/api/mockups/${mockupId}/ai-text`, { method: "POST", body: { hint } });
    if (title) $("mk-title").value = title;
    if (subtitle) $("mk-subtitle").value = subtitle;
  } catch (e) { alert("AI assist failed: " + e.message); }
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
  if (!mockupId) return alert("Start a project first.");
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
  if (!file || !mockupId) return alert("Choose an image first.");
  await uploadFile(`/api/mockups/${mockupId}/panoramic`, file);
  alert("Panorama uploaded. Set a column's background type to Panoramic in the Editor to use it.");
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
  const name = prompt("Project name?", "Promo Video");
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
      if (!videoId) return alert("Start a project first.");
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
  const file = $("sc-source-file").files[0];
  if (!file || !videoId) return alert("Choose an image first.");
  const source = await uploadFile(`/api/videos/${videoId}/sources`, file);
  videoProject.sources.push(source);
  $("sc-source").innerHTML = videoProject.sources.map((s) => `<option value="${s.id}">${s.name}</option>`).join("");
  $("sc-source").value = source.id;
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
  const hint = prompt("Briefly describe this scene (used only to generate the text/subtext):", $("sc-text").value);
  if (hint === null) return;
  try {
    const { text, subtext } = await api(`/api/videos/${videoId}/scenes/${selectedSceneId}/ai-text`, { method: "POST", body: { hint } });
    if (text) $("sc-text").value = text;
    if (subtext) $("sc-subtext").value = subtext;
  } catch (e) { alert("AI assist failed: " + e.message); }
};

$("bgm-upload").onclick = async () => {
  const file = $("bgm-file").files[0];
  if (!file) return alert("Choose an audio file first.");
  await uploadFile(`/api/videos/${videoId}/bgm`, file);
  alert("BGM uploaded.");
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
$("open-settings").onclick = () => { settingsBackdrop.classList.add("open"); loadProviders(); loadModelsTab(); };
$("settings-close").onclick = () => settingsBackdrop.classList.remove("open");
settingsBackdrop.onclick = (e) => { if (e.target === settingsBackdrop) settingsBackdrop.classList.remove("open"); };
$("credentials-backdrop").onclick = (e) => { if (e.target === $("credentials-backdrop")) $("credentials-backdrop").classList.remove("open"); };
$("sessions-backdrop").onclick = (e) => { if (e.target === $("sessions-backdrop")) $("sessions-backdrop").classList.remove("open"); };

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
   Init
   ============================================================ */

refreshAuthStatus();
