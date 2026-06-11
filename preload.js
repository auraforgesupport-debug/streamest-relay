const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("streamestDesktop", {
  getCaptureSources: () => ipcRenderer.invoke("capture-sources"),
  getPrimaryCaptureSource: () => ipcRenderer.invoke("primary-capture-source"),
  getServerInfo: () => ipcRenderer.invoke("server-info"),
  platform: process.platform,
  isDesktop: true
});
