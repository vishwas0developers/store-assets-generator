// Capture module — Live browser (Playwright) stream + Android (ADB/scrcpy) capture,
// screenshots, H.264/WebCodecs demuxer, and stream recorder.
import { activeProjectId, activeProject } from './state.js';
import { api, uploadFile, showAlert, showToast } from './utils.js';

// Browser live state
let browserConnected = false;
let frameIntervalId = null;
let frameInFlight = false;
let isPointerDown = false;
let renderLiveBrowserCapturesRef = null;

// Android live state
let androidConnected = false;
let androidWs = null;
let androidRendering = false;
let androidPointerDown = false;
let androidCanvasCtx = null;
let androidPendingBitmap = null;
let webCodecsDecoder = null;
let h264SpsBuffer = null;
let h264PpsBuffer = null;
let decoderConfigured = false;
let allAndroidApps = [];
let selectedAndroidApp = null;
let activeComboboxIndex = -1;

export function loadCaptureTab() {
  if (activeProject && activeProject.targetUrl) {
    const urlEl = document.getElementById("browser-url-input");
    if (urlEl && !urlEl.value) urlEl.value = activeProject.targetUrl;
  }
  if (typeof renderLiveBrowserCapturesRef === 'function') renderLiveBrowserCapturesRef();
  if (typeof loadAndroidDevices === 'function') loadAndroidDevices();
  if (typeof renderAndroidCaptures === 'function') renderAndroidCaptures();
}

export async function connectLiveBrowser() {
  const url = (document.getElementById("browser-url-input")?.value || "").trim();
  if (!url) return alert("Enter a URL to capture from.");

  await api("/api/browser/start", { method: "POST", body: { url } });
  browserConnected = true;
  document.getElementById("btn-browser-connect")?.setAttribute("disabled", "");
  document.getElementById("btn-browser-disconnect")?.removeAttribute("disabled");
}

export async function disconnectLiveBrowser() {
  await api("/api/browser/stop", { method: "POST" });
  browserConnected = false;
  if (frameIntervalId) { clearInterval(frameIntervalId); frameIntervalId = null; }
  document.getElementById("btn-browser-disconnect")?.setAttribute("disabled", "");
  document.getElementById("btn-browser-connect")?.removeAttribute("disabled");
}

export function registerLiveBrowserCapturesRenderer(fn) {
  renderLiveBrowserCapturesRef = fn;
}

export async function triggerScreenshotCapture() {
  if (!activeProjectId) return;
  await api(`/api/projects/${activeProjectId}/captures`, { method: "POST", body: { kind: "screenshot" } });
}

// Android device functions
export async function loadAndroidDevices() {
  const sel = document.getElementById("android-device-select");
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

const ANDROID_CONNECT_ICON = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.55a11 11 0 0 1 14.08 0"></path><path d="M1.42 9a16 16 0 0 1 21.16 0"></path><path d="M8.53 16.11a6 6 0 0 1 6.95 0"></path><line x1="12" y1="20" x2="12.01" y2="20"></line></svg>`;
const ANDROID_DISCONNECT_ICON = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;

const ANDROID_BOTTOM_BTN_IDS = [
  "android-back-btn", "android-home-btn", "android-recents-btn", "android-power-btn",
  "android-screen-off-btn", "android-rotation-lock-btn", "android-rotate-btn", "android-bottom-capture", "android-bottom-record",
];

function setAndroidBottomControlsEnabled(enabled) {
  for (const id of ANDROID_BOTTOM_BTN_IDS) {
    const btn = document.getElementById(id);
    if (btn) btn.disabled = !enabled;
  }
}

function setAndroidConnectButtonState(connected) {
  const btn = document.getElementById("android-connect-btn");
  if (!btn) return;
  btn.innerHTML = connected ? ANDROID_DISCONNECT_ICON : ANDROID_CONNECT_ICON;
  btn.title = connected ? "Disconnect Device" : "Connect Device";
  btn.style.background = connected ? "#ef4444" : "#10b981";
}

export async function connectAndroidDevice() {
  const deviceId = document.getElementById("android-device-select")?.value;
  const connectBtn = document.getElementById("android-connect-btn");
  if (connectBtn) connectBtn.disabled = true;
  const statusEl = document.getElementById("android-status");
  if (statusEl) statusEl.textContent = "Connecting to device...";
  const loadingOverlay = document.getElementById("android-loading-overlay");
  if (loadingOverlay) loadingOverlay.style.display = "flex";

  try {
    const isElectron = Boolean(window.electronNative && typeof window.electronNative.invoke === "function");
    const startRes = await api("/api/android/start", {
      method: "POST",
      body: {
        projectId: activeProjectId,
        deviceId: deviceId || undefined,
        screenOff: true,
        nativePreview: isElectron,
      }
    });

    androidConnected = true;
    setAndroidConnectButtonState(true);
    const deviceFrame = document.getElementById("android-device-frame");
    if (deviceFrame) deviceFrame.style.display = "block";
    setAndroidBottomControlsEnabled(true);
    if (statusEl) statusEl.textContent = "Live mirror active -- interact directly using your mouse or controls below.";

    const searchInput = document.getElementById("android-app-search-input");
    const refreshAppsBtn = document.getElementById("android-refresh-apps-btn");
    if (searchInput) searchInput.disabled = false;
    if (refreshAppsBtn) refreshAppsBtn.disabled = false;

    window.androidDeviceWidth = startRes.width || 1080;
    window.androidDeviceHeight = startRes.height || 1920;
    resizeAndroidPreview();

    const overlay = document.getElementById("android-interaction-overlay");
    if (overlay) overlay.style.pointerEvents = "auto";
    startAndroidWs(loadingOverlay);

    setTimeout(() => {
      if (loadingOverlay && androidConnected) loadingOverlay.style.display = "none";
    }, 1500);

    await loadAndroidApps();
  } catch (e) {
    if (loadingOverlay) loadingOverlay.style.display = "none";
    showAlert("Connection failed: " + e.message, "error", "Connection Error");
    if (statusEl) statusEl.textContent = "Connection failed: " + e.message;
  } finally {
    if (connectBtn) connectBtn.disabled = false;
  }
}

export async function disconnectAndroidDevice() {
  const overlay = document.getElementById("android-interaction-overlay");
  if (overlay) overlay.style.pointerEvents = "auto";

  stopAndroidWs();
  const loadingOverlay = document.getElementById("android-loading-overlay");
  if (loadingOverlay) loadingOverlay.style.display = "none";
  const frameImg = document.getElementById("android-frame-img");
  if (frameImg) frameImg.src = "";
  const connectBtn = document.getElementById("android-connect-btn");
  if (connectBtn) connectBtn.disabled = true;

  try {
    await api("/api/android/stop", { method: "POST" });
  } catch (e) {}

  androidConnected = false;
  const viewportCard = document.getElementById("android-viewport-card");
  if (viewportCard) {
    viewportCard.classList.remove("is-landscape");
    viewportCard._landscapeSized = false;
  }
  setAndroidConnectButtonState(false);
  if (connectBtn) connectBtn.disabled = false;
  const statusEl = document.getElementById("android-status");
  if (statusEl) statusEl.textContent = "Session closed. Click 'Connect' to start a new live session.";
  const deviceFrame = document.getElementById("android-device-frame");
  if (deviceFrame) deviceFrame.style.display = "none";
  setAndroidBottomControlsEnabled(false);
  resetAndroidAppCombobox("Connect a device to list applications...");
  const refreshAppsBtn = document.getElementById("android-refresh-apps-btn");
  const launchAppBtn = document.getElementById("android-launch-app-btn");
  if (refreshAppsBtn) refreshAppsBtn.disabled = true;
  if (launchAppBtn) launchAppBtn.disabled = true;
}

function startAndroidWs(loadingOverlay) {
  stopAndroidWs();
  const canvas = document.getElementById("android-frame-canvas");
  const frameImg = document.getElementById("android-frame-img");
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

  function createVideoDecoder() {
    if (!useWebCodecs || !canvas || !androidCanvasCtx) return null;
    try {
      return new VideoDecoder({
        output: (frame) => {
          if (canvas.width !== frame.displayWidth || canvas.height !== frame.displayHeight) {
            canvas.width = frame.displayWidth;
            canvas.height = frame.displayHeight;
            window.androidDeviceWidth = frame.displayWidth;
            window.androidDeviceHeight = frame.displayHeight;
            resizeAndroidPreview();
          }
          if (canvas.style.display !== "block") canvas.style.display = "block";
          androidCanvasCtx.drawImage(frame, 0, 0);
          frame.close();
          if (loadingOverlay && loadingOverlay.style.display !== "none") {
            loadingOverlay.style.display = "none";
          }
        },
        error: (err) => {
          console.error("WebCodecs decode error:", err);
          decoderConfigured = false;
          hasDecodedFirstKeyFrame = false;
        },
      });
    } catch (err) {
      return null;
    }
  }

  webCodecsDecoder = createVideoDecoder();

  function parseAnnexBNALs(data) {
    const nals = [];
    let i = 0;
    while (i < data.length - 3) {
      let startLen = 0;
      if (data[i] === 0 && data[i+1] === 0 && data[i+2] === 1) startLen = 3;
      else if (data[i] === 0 && data[i+1] === 0 && data[i+2] === 0 && data[i+3] === 1) startLen = 4;
      if (startLen > 0) {
        const bodyStart = i + startLen;
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

  ws.onmessage = async (ev) => {
    let rawData = ev.data;
    if (rawData instanceof Blob) rawData = await rawData.arrayBuffer();
    if (!(rawData instanceof ArrayBuffer)) return;
    const data = new Uint8Array(rawData);

    if (webCodecsDecoder) {
      if (!containsStartCode(data)) return;
      const nals = parseAnnexBNALs(data);
      if (!nals.length) return;

      const spsNAL = nals.find(n => n.type === 7);
      const ppsNAL = nals.find(n => n.type === 8);
      const idrNAL = nals.find(n => n.type === 5);
      const hasNonConfig = nals.some(n => n.type !== 7 && n.type !== 8);

      if (webCodecsDecoder.state === "closed") {
        webCodecsDecoder = createVideoDecoder();
        decoderConfigured = false;
        hasDecodedFirstKeyFrame = false;
      }

      if (spsNAL && ppsNAL) {
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
            hasDecodedFirstKeyFrame = false;
          }
        } catch (e) {}
        if (!hasNonConfig) return;
      }

      if (!decoderConfigured || !webCodecsDecoder || webCodecsDecoder.state !== "configured") return;

      try {
        const isKeyFrame = !!idrNAL;
        if (!isKeyFrame && !hasDecodedFirstKeyFrame) return;
        const chunkType = isKeyFrame ? "key" : "delta";
        if (isKeyFrame && !hasDecodedFirstKeyFrame) hasDecodedFirstKeyFrame = true;

        webCodecsDecoder.decode(new EncodedVideoChunk({
          type: chunkType,
          timestamp: performance.now() * 1000,
          data,
        }));
      } catch (decErr) {}
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
}

function resizeAndroidPreview() {
  if (!androidConnected || !window.androidDeviceWidth || !window.androidDeviceHeight) return;
  const deviceFrame = document.getElementById("android-device-frame");
  const card = document.getElementById("android-viewport-card") || (deviceFrame && deviceFrame.parentElement);
  if (!card) return;

  const aspect = window.androidDeviceWidth / window.androidDeviceHeight;
  const isLandscape = window.androidDeviceWidth > window.androidDeviceHeight || aspect > 1.2;
  card.classList.toggle("is-landscape", isLandscape);

  const cardRect = card.getBoundingClientRect();
  const availW = Math.max(200, cardRect.width - 24);
  const availH = Math.max(200, cardRect.height - 100);

  let previewWidth = availW;
  let previewHeight = Math.round(previewWidth / aspect);
  if (previewHeight > availH) {
    previewHeight = availH;
    previewWidth = Math.round(previewHeight * aspect);
  }

  if (deviceFrame) {
    deviceFrame.style.width = `${Math.round(previewWidth)}px`;
    deviceFrame.style.height = `${Math.round(previewHeight)}px`;
  }
}

function resetAndroidAppCombobox(placeholder = "Connect a device to list applications...") {
  allAndroidApps = [];
  selectedAndroidApp = null;
  activeComboboxIndex = -1;
  const input = document.getElementById("android-app-search-input");
  const dropdown = document.getElementById("android-app-dropdown-list");
  if (input) {
    input.value = "";
    input.placeholder = placeholder;
    input.disabled = true;
  }
  if (dropdown) {
    dropdown.innerHTML = "";
    dropdown.style.display = "none";
  }
  const launchBtn = document.getElementById("android-launch-app-btn");
  if (launchBtn) launchBtn.disabled = true;
}

async function loadAndroidApps(forceRefresh = false) {
  const input = document.getElementById("android-app-search-input");
  if (!input) return;
  input.placeholder = "Loading applications...";
  const launchBtn = document.getElementById("android-launch-app-btn");
  if (launchBtn) launchBtn.disabled = true;
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

export async function triggerAndroidCapture() {
  if (!androidConnected || !activeProjectId) {
    showAlert("Please connect to an Android device first before capturing.", "warning");
    return;
  }

  const canvas = document.getElementById("android-frame-canvas");
  let imageData = undefined;
  if (canvas && canvas.width > 0 && canvas.height > 0) {
    try { imageData = canvas.toDataURL("image/png"); } catch (_) {}
  }

  try {
    const capture = await api("/api/android/capture", {
      method: "POST",
      body: { projectId: activeProjectId, imageData }
    });
    showToast(`Captured Screen ${capture.id} (${capture.file})`, "success");
    await renderAndroidCaptures();
  } catch (e) {
    showAlert("Capture failed: " + e.message, "error", "Capture Error");
  }
}

export async function renderAndroidCaptures() {
  // handled via projects file explorer or gallery refresh
}
