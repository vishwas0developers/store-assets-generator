import { app, BrowserWindow, ipcMain, session } from 'electron';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// GPU Hardware Acceleration Switches
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-hardware-overlays', 'single-fullscreen,single-on-top');
app.commandLine.appendSwitch('enable-features', 'VaapiVideoDecoder,D3D11VideoDecoder,WebGPU');

// ---- Logging: mirror everything to logs/app.log (recreated each launch) ----
const LOG_DIR = path.join(__dirname, 'logs');
fs.mkdirSync(LOG_DIR, { recursive: true });
const LOG_FILE = path.join(LOG_DIR, 'app.log');
fs.writeFileSync(LOG_FILE, '');
for (const level of ['log', 'info', 'warn', 'error']) {
  const orig = console[level].bind(console);
  console[level] = (...args) => {
    orig(...args);
    try {
      const text = args.map((a) => (typeof a === 'string' ? a : a instanceof Error ? a.stack : JSON.stringify(a))).join(' ');
      fs.appendFileSync(LOG_FILE, `${new Date().toISOString()} [${level.toUpperCase()}] ${text}\n`);
    } catch {}
  };
}

/** Newest mtime of any file under dir (skipping node_modules), for the stale-build check. */
function newestMtime(dir, exts) {
  let newest = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) newest = Math.max(newest, newestMtime(full, exts));
    else if (exts.some((e) => entry.name.endsWith(e))) newest = Math.max(newest, fs.statSync(full).mtimeMs);
  }
  return newest;
}

/** dist/ is compiled TypeScript: if src/ or web/server.ts is newer, the app is running OLD code. */
function logBuildStatus() {
  console.log(`[SAG-ELECTRON] Electron ${process.versions.electron} / Chrome ${process.versions.chrome} / Node ${process.versions.node}`);
  console.log(`[SAG-ELECTRON] App dir: ${__dirname}`);
  console.log(`[SAG-ELECTRON] Logs: ${LOG_FILE}`);
  try {
    const distServer = path.join(__dirname, 'dist', 'web', 'server.js');
    const distTime = fs.statSync(distServer).mtimeMs;
    const srcTime = Math.max(newestMtime(path.join(__dirname, 'src'), ['.ts']), fs.statSync(path.join(__dirname, 'web', 'server.ts')).mtimeMs);
    console.log(`[SAG-ELECTRON] dist build: ${new Date(distTime).toISOString()} | newest source: ${new Date(srcTime).toISOString()}`);
    if (srcTime > distTime) {
      console.warn('[SAG-ELECTRON] *** dist/ is STALE -- source is newer than the compiled build. Run "npm run build" (start.bat does this automatically). Old code/templates will be served until then. ***');
    }
  } catch (err) {
    console.warn('[SAG-ELECTRON] Could not verify build freshness:', err.message);
  }
}

let mainWindow = null;
let serverPort = 8787;

async function startBackgroundServer() {
  try {
    const serverModule = await import('./dist/web/server.js');
    if (serverModule && typeof serverModule.startWebServer === 'function') {
      const server = await serverModule.startWebServer({ port: 8787, host: '127.0.0.1', openBrowser: false });
      const addr = server.address();
      if (addr && typeof addr === 'object') {
        serverPort = addr.port;
      }
    }
  } catch (err) {
    console.error('[SAG-ELECTRON] Failed to start internal services:', err);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'Store Assets Generator',
    backgroundColor: '#0f172a',
    titleBarStyle: 'default',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
      backgroundThrottling: false,
    },
  });

  mainWindow.loadURL(`http://127.0.0.1:${serverPort}`);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  logBuildStatus();
  // Never let Chromium reuse a previously cached copy of the UI/templates.
  try {
    await session.defaultSession.clearCache();
    await session.defaultSession.clearStorageData({ storages: ['serviceworkers', 'cachestorage'] });
    console.log('[SAG-ELECTRON] Cleared Electron HTTP/service-worker cache');
  } catch (err) {
    console.warn('[SAG-ELECTRON] Cache clear failed:', err.message);
  }
  await startBackgroundServer();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
