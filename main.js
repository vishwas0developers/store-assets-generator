import { app, BrowserWindow, ipcMain, session, dialog, shell } from 'electron';
import path from 'path';
import fs from 'fs';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// All backend code resolves templates/devices/output via process.cwd(); pin it to the app folder
// (installed apps start with cwd = install dir, not resources/app).
process.chdir(__dirname);

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
let splash = null;
let serverPort = 8787;
const ICON = path.join(__dirname, 'build', 'icon.png');

function createSplash() {
  splash = new BrowserWindow({
    width: 460, height: 320, frame: false, transparent: true, resizable: false,
    movable: true, show: false, skipTaskbar: true, alwaysOnTop: true, icon: ICON,
    webPreferences: { contextIsolation: true, nodeIntegration: false, preload: path.join(__dirname, 'splash-preload.cjs') },
  });
  splash.once('ready-to-show', () => splash && splash.show());
  splash.loadFile(path.join(__dirname, 'build', 'splash.html'));
}

function setSplashStatus(text, isError = false, percent) {
  if (splash && !splash.isDestroyed()) {
    splash.webContents.executeJavaScript(`setStatus(${JSON.stringify(text)}, ${isError}, ${typeof percent === 'number' ? percent : 'undefined'})`).catch(() => {});
  }
}

const waitForAction = () => new Promise((resolve) => ipcMain.once('setup-action', (_e, action) => resolve(action)));

function sendSetup(state) {
  if (splash && !splash.isDestroyed()) {
    splash.webContents.executeJavaScript(`window.setup(${JSON.stringify(state)})`).catch(() => {});
  }
}

/**
 * One continuous first-run flow inside the splash window: detect -> download -> install -> configure -> verify
 * -> finalize, every step visible. Skipped entirely (plain splash) when everything is already in place.
 */
async function runSetupFlow() {
  const { getToolchainStatus } = await import('./dist/src/toolchain/binaries.js');
  if (getToolchainStatus().ready) return;
  const { runSetup } = await import('./dist/src/toolchain/setup.js');
  splash.setSize(620, 720);
  splash.center();
  sendSetup({ mode: 'start' });
  for (;;) {
    try {
      await runSetup(sendSetup);
      break;
    } catch (err) {
      console.error('[SAG-ELECTRON] Setup step failed:', err && err.message ? err.message : err);
      if ((await waitForAction()) === 'skip') return;
    }
  }
  await waitForAction(); // "Launch Application"
  splash.setSize(460, 320);
  splash.center();
  splash.webContents.executeJavaScript('window.simple()').catch(() => {});
}

/** Startup failed: say so (never leave a blank window), point at the log, quit. */
function failStartup(message) {
  console.error('[SAG-ELECTRON] Startup failed:', message);
  if (splash && !splash.isDestroyed()) splash.close();
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.destroy();
  dialog.showErrorBox('Store Assets Generator could not start', `${message}

Details: ${LOG_FILE}`);
  app.quit();
}

/**
 * Port 8787 held by a stale copy of THIS app (an older build or an orphan from a crashed
 * launch)? End it so we can bind. Anything that isn't our own executable is left alone.
 */
function freePortFromStaleInstance(port) {
  if (process.platform !== 'win32') return false;
  try {
    const out = execFileSync('netstat', ['-ano', '-p', 'TCP'], { encoding: 'utf8' });
    const pids = new Set();
    for (const line of out.split(/\r?\n/)) {
      const c = line.trim().split(/\s+/);
      if (c[3] === 'LISTENING' && c[1].endsWith(`:${port}`)) pids.add(Number(c[4]));
    }
    pids.delete(process.pid);
    const ours = path.basename(process.execPath).toLowerCase();
    let killed = false;
    for (const pid of pids) {
      const row = execFileSync('tasklist', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'], { encoding: 'utf8' });
      if (row.toLowerCase().includes(`"${ours}"`)) {
        execFileSync('taskkill', ['/PID', String(pid), '/T', '/F']);
        console.warn(`[SAG-ELECTRON] Ended stale instance (pid ${pid}) holding port ${port}`);
        killed = true;
      } else {
        console.warn(`[SAG-ELECTRON] Port ${port} is held by another program (pid ${pid}); not touching it`);
      }
    }
    return killed;
  } catch (err) {
    console.warn('[SAG-ELECTRON] Stale-instance check failed:', err.message);
    return false;
  }
}

// Resolves only once the HTTP server is really listening; rejects on any startup error.
async function startBackgroundServer() {
  // dependencies.js must load first: it points Playwright at the managed Chromium folder before Playwright is imported.
  await import('./dist/src/toolchain/dependencies.js');
  const serverModule = await import('./dist/web/server.js');
  const start = (port) => serverModule.startWebServer({ port, host: '127.0.0.1', openBrowser: false });
  // Prefer 8787: reclaim it from a stale copy of this app; if a foreign program owns it, use any free port.
  const server = await start(8787).catch(async (err) => {
    if (!err || err.code !== 'EADDRINUSE') throw err;
    if (freePortFromStaleInstance(8787)) {
      await new Promise((r) => setTimeout(r, 500));
      try { return await start(8787); } catch (e) { if (e.code !== 'EADDRINUSE') throw e; }
    }
    console.warn('[SAG-ELECTRON] Port 8787 unavailable, falling back to a free port');
    return start(0);
  });
  const addr = server.address();
  if (addr && typeof addr === 'object') serverPort = addr.port;
}

function createWindow() {
  return new Promise((resolve, reject) => {
    mainWindow = new BrowserWindow({
      width: 1440,
      height: 900,
      minWidth: 1024,
      minHeight: 700,
      show: false,
      icon: ICON,
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

    // Show the main window only after the UI has actually loaded, then drop the splash.
    mainWindow.webContents.once('did-finish-load', () => {
      // maximize() before show(): the window appears once, already full-size (no resize flash).
      mainWindow.maximize();
      mainWindow.show();
      if (splash && !splash.isDestroyed()) splash.close();
      resolve();
    });
    mainWindow.webContents.once('did-fail-load', (_e, code, desc, url) => reject(new Error(`Could not load ${url}: ${desc} (${code})`)));
    mainWindow.loadURL(`http://127.0.0.1:${serverPort}`);

    // Prevent window.open or target="_blank" from spawning blank native windows
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
      if (url.startsWith('http://') || url.startsWith('https://')) {
        if (!url.startsWith(`http://127.0.0.1:${serverPort}`)) {
          shell.openExternal(url);
        }
      }
      return { action: 'deny' };
    });

    mainWindow.on('closed', () => {
      mainWindow = null;
    });
  });
}

// Only one instance: a second launch just focuses the first window.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

app.whenReady().then(async () => {
  if (!gotLock) return;
  createSplash();
  logBuildStatus();
  // Never let Chromium reuse a previously cached copy of the UI/templates.
  try {
    await session.defaultSession.clearCache();
    await session.defaultSession.clearStorageData({ storages: ['serviceworkers', 'cachestorage'] });
    console.log('[SAG-ELECTRON] Cleared Electron HTTP/service-worker cache');
  } catch (err) {
    console.warn('[SAG-ELECTRON] Cache clear failed:', err.message);
  }
  try {
    // dependencies.js first: it points Playwright at the managed Chromium folder before Playwright is imported.
    await import('./dist/src/toolchain/dependencies.js');
    await runSetupFlow();
    setSplashStatus('Starting services...');
    await startBackgroundServer();
    setSplashStatus('Loading interface...');
    await createWindow();
  } catch (err) {
    return failStartup(err && err.message ? err.message : String(err));
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow().catch((e) => failStartup(e.message));
  });

  ipcMain.handle('choose-save-path', async (event, { defaultName, ext } = {}) => {
    if (!mainWindow) return null;
    const filters = ext === 'webm'
      ? [{ name: 'WebM Video', extensions: ['webm'] }]
      : [{ name: 'MP4 Video', extensions: ['mp4'] }];
    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath: defaultName || `video.${ext || 'mp4'}`,
      filters,
    });
    if (result.canceled || !result.filePath) return null;
    return result.filePath;
  });

  ipcMain.handle('choose-save-folder', async () => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory', 'createDirectory'],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    return result.filePaths[0];
  });

  ipcMain.handle('show-in-folder', async (event, targetPath) => {
    if (targetPath && typeof targetPath === 'string') {
      shell.showItemInFolder(targetPath);
      return true;
    }
    return false;
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
