const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("streamestDesktop", {
  getCaptureSources: () => ipcRenderer.invoke("capture-sources"),
  getPrimaryCaptureSource: () => ipcRenderer.invoke("primary-capture-source"),
  getServerInfo: () => ipcRenderer.invoke("server-info"),
  supabase: {
    url: "https://jkahmxcoxpzmbsulomeb.supabase.co",
    publishableKey: "sb_publishable_EGq7wkeSZRLGSLX2M7dmbQ_M-cu7uwj"
  },
  platform: process.platform,
  isDesktop: true
});
