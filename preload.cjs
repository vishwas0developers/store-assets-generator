const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronNative', {
  isElectron: true,
  send: (channel, data) => {
    const validChannels = [
      'send-touch-input',
      'start-android-stream',
      'stop-android-stream'
    ];
    if (validChannels.includes(channel)) {
      ipcRenderer.send(channel, data);
    }
  },
  invoke: (channel, data) => {
    const validChannels = [
      'get-gpu-caps',
      'ensure-binaries',
      'get-stream-frame',
      'choose-save-path',
      'choose-save-folder',
      'show-in-folder'
    ];
    if (validChannels.includes(channel)) {
      return ipcRenderer.invoke(channel, data);
    }
    return Promise.reject(new Error(`Invalid IPC channel: ${channel}`));
  },
  on: (channel, func) => {
    const validChannels = ['android-frame', 'stream-status'];
    if (validChannels.includes(channel)) {
      ipcRenderer.on(channel, (event, ...args) => func(...args));
    }
  },
});
