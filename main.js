import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// GPU Hardware Acceleration Switches
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-hardware-overlays', 'single-fullscreen,single-on-top');
app.commandLine.appendSwitch('enable-features', 'VaapiVideoDecoder,D3D11VideoDecoder,WebGPU');

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
