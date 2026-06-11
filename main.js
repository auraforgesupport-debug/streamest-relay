const { app, BrowserWindow, desktopCapturer, ipcMain, shell, session } = require("electron");
const path = require("path");
const { startServer } = require("./server");

let streamServer = null;

async function startStreamServer() {
  try {
    return await startServer({ rootDir: __dirname, port: 3789, host: "127.0.0.1" });
  } catch {
    return startServer({ rootDir: __dirname, port: 0, host: "127.0.0.1" });
  }
}

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 980,
    minHeight: 640,
    title: "Streamest",
    backgroundColor: "#080a0f",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadURL(streamServer.localUrl);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
}

app.whenReady().then(async () => {
  streamServer = await startStreamServer();

  ipcMain.handle("server-info", () => ({
    localUrl: streamServer.localUrl,
    networkUrls: [],
    port: streamServer.port
  }));

  ipcMain.handle("primary-capture-source", async () => {
    const sources = await desktopCapturer.getSources({
      types: ["screen", "window"],
      thumbnailSize: { width: 320, height: 180 }
    });
    const screen = sources.find((source) => source.id.startsWith("screen:")) || sources[0];
    return screen ? { id: screen.id, name: screen.name } : null;
  });

  ipcMain.handle("capture-sources", async () => {
    const sources = await desktopCapturer.getSources({
      types: ["screen", "window"],
      thumbnailSize: { width: 320, height: 180 }
    });

    return sources.map((source) => ({
      id: source.id,
      name: source.name,
      thumbnail: source.thumbnail.toDataURL()
    }));
  });

  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    const allowed = ["display-capture", "media"];
    callback(allowed.includes(permission));
  });

  session.defaultSession.setDisplayMediaRequestHandler(async (request, callback) => {
    try {
      const sources = await desktopCapturer.getSources({
        types: ["screen", "window"],
        thumbnailSize: { width: 0, height: 0 }
      });
      const screen = sources.find((source) => source.id.startsWith("screen:")) || sources[0];

      if (!screen) {
        callback({});
        return;
      }

      callback({
        video: screen,
        audio: request.audioRequested ? "loopback" : false
      });
    } catch {
      callback({});
    }
  });

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  streamServer?.close();
});
