// Capture module — Live browser (Playwright) stream + Android (ADB/scrcpy) capture,
// screenshots, H.264/WebCodecs demuxer, and stream recorder.
import { activeProjectId, activeProject } from './state.js';
import { api, uploadFile, showAlert, showToast } from './utils.js';

// Browser live state
let browserConnected = false;
let frameIntervalId = null;
let frameInFlight = false;
let isFastStream = false;
let boostTimer = null;
let isPointerDown = false;
let hasDragged = false;
let startX = 0, startY = 0, lastX = 0, lastY = 0, pointerStartTime = 0;
let moveHistory = [];
let inertiaRafId = null;
let accumDeltaX = 0, accumDeltaY = 0, lastCursorXPct = 50, lastCursorYPct = 50, rafScheduled = false;
let browserInteractionBound = false;
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

function loadNextFrame() {
  if (!browserConnected || frameInFlight) return;
  frameInFlight = true;
  const img = document.getElementById("browser-frame-img");
  const newImg = new Image();
  newImg.onload = () => { if (img) img.src = newImg.src; frameInFlight = false; };
  newImg.onerror = () => { frameInFlight = false; };
  newImg.src = `/api/browser/frame?t=${Date.now()}`;
}

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

function recordMoveSample(x, y) {
  const now = performance.now();
  moveHistory.push({ x, y, t: now });
  while (moveHistory.length > 0 && now - moveHistory[0].t > 120) moveHistory.shift();
}

function getInstantVelocity() {
  if (moveHistory.length < 2) return { vx: 0, vy: 0 };
  const first = moveHistory[0];
  const last = moveHistory[moveHistory.length - 1];
  const dt = last.t - first.t;
  if (dt <= 0) return { vx: 0, vy: 0 };
  return { vx: (last.x - first.x) / dt, vy: (last.y - first.y) / dt };
}

function flushScrollAccumulator() {
  if (!browserConnected) { accumDeltaX = 0; accumDeltaY = 0; rafScheduled = false; return; }
  const dx = accumDeltaX, dy = accumDeltaY, xPct = lastCursorXPct, yPct = lastCursorYPct;
  accumDeltaX = 0; accumDeltaY = 0; rafScheduled = false;
  if (dx !== 0 || dy !== 0) {
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
  if (!rafScheduled) { rafScheduled = true; requestAnimationFrame(flushScrollAccumulator); }
}

function startMomentumInertia(vx, vy) {
  cancelAnimationFrame(inertiaRafId);
  const speed = Math.hypot(vx, vy);
  if (speed < 0.12) return;
  let momentumDx = -vx * 18 * 1.5;
  let momentumDy = -vy * 18 * 1.5;
  const friction = 0.91;
  const stepInertia = () => {
    if (!browserConnected) return;
    queueScroll(momentumDx, momentumDy, lastCursorXPct, lastCursorYPct);
    boostFrameStream();
    momentumDx *= friction;
    momentumDy *= friction;
    if (Math.hypot(momentumDx, momentumDy) > 0.4) inertiaRafId = requestAnimationFrame(stepInertia);
  };
  inertiaRafId = requestAnimationFrame(stepInertia);
}

// Interactive touch & scroll — bound once; the overlay stays in the DOM across connect/disconnect.
function bindBrowserInteraction() {
  if (browserInteractionBound) return;
  const overlayEl = document.getElementById("browser-interaction-overlay");
  const imgEl = document.getElementById("browser-frame-img");
  if (!overlayEl || !imgEl) return;
  browserInteractionBound = true;

  overlayEl.addEventListener("pointerdown", (e) => {
    if (!browserConnected) return;
    e.preventDefault();
    cancelAnimationFrame(inertiaRafId);
    isPointerDown = true;
    hasDragged = false;
    startX = e.clientX; startY = e.clientY;
    lastX = e.clientX; lastY = e.clientY;
    pointerStartTime = Date.now();
    moveHistory = [{ x: e.clientX, y: e.clientY, t: performance.now() }];
    try { overlayEl.setPointerCapture(e.pointerId); } catch (_) {}
  });

  overlayEl.addEventListener("pointermove", (e) => {
    if (!browserConnected || !isPointerDown) return;
    e.preventDefault();
    recordMoveSample(e.clientX, e.clientY);
    const totalDist = Math.hypot(e.clientX - startX, e.clientY - startY);
    if (totalDist > 3) hasDragged = true;
    if (!hasDragged) return;
    const distX = e.clientX - lastX, distY = e.clientY - lastY;
    if (distX === 0 && distY === 0) return;
    lastX = e.clientX; lastY = e.clientY;
    const rect = overlayEl.getBoundingClientRect();
    const xPct = ((e.clientX - rect.left) / rect.width) * 100;
    const yPct = ((e.clientY - rect.top) / rect.height) * 100;
    const stepSpeed = Math.hypot(distX, distY);
    const sensitivity = Math.min(Math.max(stepSpeed * 0.16, 1.4), 3.8);
    queueScroll(-distX * sensitivity, -distY * sensitivity, xPct, yPct);
    boostFrameStream();
  });

  const handlePointerEnd = async (e) => {
    if (!browserConnected || !isPointerDown) return;
    const elapsed = Date.now() - pointerStartTime;
    try { overlayEl.releasePointerCapture(e.pointerId); } catch (_) {}
    const rect = overlayEl.getBoundingClientRect();
    if (!hasDragged && elapsed < 350) {
      const tapXPct = Math.min(100, Math.max(0, ((startX - rect.left) / rect.width) * 100));
      const tapYPct = Math.min(100, Math.max(0, ((startY - rect.top) / rect.height) * 100));
      try {
        await api("/api/browser/action", { method: "POST", body: { type: "click", xPct: tapXPct, yPct: tapYPct } });
        boostFrameStream();
        imgEl.src = `/api/browser/frame?t=${Date.now()}`;
      } catch (_) {}
    } else if (hasDragged) {
      const { vx, vy } = getInstantVelocity();
      startMomentumInertia(vx, vy);
    }
    isPointerDown = false;
    hasDragged = false;
  };
  overlayEl.addEventListener("pointerup", handlePointerEnd);
  overlayEl.addEventListener("pointercancel", handlePointerEnd);

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

  const urlInput = document.getElementById("browser-url-input");
  if (urlInput) {
    urlInput.addEventListener("keydown", async (e) => {
      if (e.key !== "Enter" || !browserConnected) return;
      const url = urlInput.value.trim();
      if (url) await api("/api/browser/action", { method: "POST", body: { type: "navigate", url } });
    });
  }
}

export async function connectLiveBrowser() {
  const urlEl = document.getElementById("browser-url-input");
  const url = (urlEl?.value || "").trim();
  if (!url) return showAlert("Please enter a starting URL.");

  const resolutionKey = document.getElementById("browser-resolution-select")?.value || "375x812";
  const [width, height] = resolutionKey.split("x").map(Number);
  const connectBtn = document.getElementById("browser-connect-btn");
  const disconnectBtn = document.getElementById("browser-disconnect-btn");
  const statusEl = document.getElementById("live-browser-status");
  if (connectBtn) { connectBtn.disabled = true; connectBtn.textContent = "Connecting..."; }
  if (statusEl) statusEl.textContent = "Launching Playwright mobile Chromium browser...";

  try {
    await api("/api/browser/start", { method: "POST", body: { projectId: activeProjectId, url, resolution: resolutionKey, width, height } });

    browserConnected = true;
    if (connectBtn) { connectBtn.style.display = "none"; connectBtn.disabled = false; connectBtn.textContent = "Connect"; }
    if (disconnectBtn) { disconnectBtn.style.display = "inline-flex"; disconnectBtn.disabled = false; }
    if (statusEl) statusEl.textContent = "Live mobile session active. Click inside the device frame to interact.";
    const deviceFrame = document.getElementById("browser-device-frame");
    if (deviceFrame) deviceFrame.style.display = "block";
    const bottomControls = document.getElementById("browser-bottom-controls");
    if (bottomControls) bottomControls.style.display = "flex";

    const isTablet = resolutionKey === "2048x2732" || resolutionKey === "1200x1920";
    const aspect = height / width;
    const maxAvailableHeight = Math.max(400, window.innerHeight - 300);
    const standardWidth = isTablet ? 420 : 360;
    let previewWidth = standardWidth;
    let previewHeight = Math.round(previewWidth * aspect);
    if (previewHeight > maxAvailableHeight) {
      previewHeight = maxAvailableHeight;
      previewWidth = Math.round(previewHeight / aspect);
    }
    const frameEl = document.getElementById("browser-viewport-container");
    if (frameEl) { frameEl.style.width = `${previewWidth}px`; frameEl.style.height = `${previewHeight}px`; }
    if (deviceFrame) { deviceFrame.style.width = `${previewWidth}px`; deviceFrame.style.height = `${previewHeight}px`; }

    bindBrowserInteraction();
    startFrameStream();
  } catch (e) {
    const cleanMsg = (e.message || "Unknown error").replace(/Call log:[\s\S]*/gi, "").trim();
    await showAlert("Connection failed: " + cleanMsg);
    if (connectBtn) { connectBtn.style.display = "inline-flex"; connectBtn.disabled = false; connectBtn.textContent = "Connect"; }
    if (disconnectBtn) disconnectBtn.style.display = "none";
    if (statusEl) statusEl.textContent = "Connection failed. Please check the URL and try again.";
  }
}

export async function disconnectLiveBrowser() {
  clearInterval(frameIntervalId);
  frameIntervalId = null;
  const connectBtn = document.getElementById("browser-connect-btn");
  const disconnectBtn = document.getElementById("browser-disconnect-btn");
  if (disconnectBtn) { disconnectBtn.disabled = true; disconnectBtn.textContent = "Disconnecting..."; }

  try { await api("/api/browser/stop", { method: "POST" }); } catch (_) {}

  browserConnected = false;
  if (connectBtn) { connectBtn.style.display = "inline-flex"; connectBtn.disabled = false; connectBtn.textContent = "Connect"; }
  if (disconnectBtn) { disconnectBtn.disabled = false; disconnectBtn.textContent = "Disconnect"; disconnectBtn.style.display = "none"; }
  const statusEl = document.getElementById("live-browser-status");
  if (statusEl) statusEl.textContent = "Session closed. Click 'Connect' to start a new live session.";
  const deviceFrame = document.getElementById("browser-device-frame");
  if (deviceFrame) deviceFrame.style.display = "none";
  const bottomControls = document.getElementById("browser-bottom-controls");
  if (bottomControls) bottomControls.style.display = "none";
}

async function browserNavAction(type) {
  if (!browserConnected) return;
  await api("/api/browser/action", { method: "POST", body: { type } });
}

export async function triggerScreenshotCapture() {
  if (!browserConnected || !activeProjectId) {
    await showAlert("Please connect to a live browser session first before capturing.");
    return;
  }
  const imgEl = document.getElementById("browser-frame-img");
  if (imgEl) { imgEl.style.opacity = "0.3"; setTimeout(() => { imgEl.style.opacity = "1"; }, 150); }
  try {
    const capture = await api("/api/browser/capture", { method: "POST", body: { projectId: activeProjectId } });
    showToast(`Captured Screen ${capture.id} (${capture.file})`, "success");
    if (typeof renderLiveBrowserCapturesRef === "function") await renderLiveBrowserCapturesRef();
  } catch (e) {
    await showAlert("Capture failed: " + e.message);
  }
}

export function setupCaptureHandlers() {
  const $id = (id) => document.getElementById(id);
  if ($id("browser-connect-btn")) $id("browser-connect-btn").onclick = connectLiveBrowser;
  if ($id("browser-disconnect-btn")) $id("browser-disconnect-btn").onclick = disconnectLiveBrowser;
  if ($id("browser-resolution-select")) {
    $id("browser-resolution-select").addEventListener("change", async () => {
      if (browserConnected) { await disconnectLiveBrowser(); await connectLiveBrowser(); }
    });
  }
  if ($id("browser-back")) $id("browser-back").onclick = () => browserNavAction("back");
  if ($id("browser-forward")) $id("browser-forward").onclick = () => browserNavAction("forward");
  if ($id("browser-reload")) $id("browser-reload").onclick = () => browserNavAction("reload");
  if ($id("browser-bottom-back")) $id("browser-bottom-back").onclick = () => browserNavAction("back");
  if ($id("browser-bottom-forward")) $id("browser-bottom-forward").onclick = () => browserNavAction("forward");
  if ($id("browser-bottom-reload")) $id("browser-bottom-reload").onclick = () => browserNavAction("reload");
  if ($id("browser-top-capture-btn")) $id("browser-top-capture-btn").onclick = triggerScreenshotCapture;
  if ($id("browser-bottom-capture")) $id("browser-bottom-capture").onclick = triggerScreenshotCapture;
  if ($id("android-refresh-devices-btn")) $id("android-refresh-devices-btn").onclick = () => loadAndroidDevices();
}

export function registerLiveBrowserCapturesRenderer(fn) {
  renderLiveBrowserCapturesRef = fn;
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
