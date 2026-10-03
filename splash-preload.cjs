const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('sag', { action: (a) => ipcRenderer.send('setup-action', a) });
