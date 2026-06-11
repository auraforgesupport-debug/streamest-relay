const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const { WebSocket, WebSocketServer } = require("ws");
const { createJsonStore } = require("./json-store");

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml"
};

function localNetworkUrls(port) {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((item) => item && item.family === "IPv4" && !item.internal)
    .map((item) => `http://${item.address}:${port}`);
}

function serveFile(rootDir, request, response) {
  const url = new URL(request.url, "http://127.0.0.1");
  const pathname = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  const safePath = path.normalize(pathname).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(rootDir, safePath);

  if (!filePath.startsWith(rootDir)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }

    response.writeHead(200, {
      "Content-Type": mimeTypes[path.extname(filePath)] || "application/octet-stream",
      "Cache-Control": "no-store"
    });
    response.end(data);
  });
}

function send(client, message) {
  if (client?.readyState === WebSocket.OPEN) {
    client.send(JSON.stringify(message));
  }
}

function startServer({ rootDir = __dirname, port = 0, host = "127.0.0.1", store = createJsonStore() } = {}) {
  let nextClientId = 1;
  const clients = new Map();
  const rooms = new Map();
  store.clearLiveStreams();

  const server = http.createServer((request, response) => {
    if (request.url === "/health") {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ ok: true }));
      return;
    }

    if (request.url === "/state") {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify(store.snapshot(), null, 2));
      return;
    }

    serveFile(rootDir, request, response);
  });

  const wss = new WebSocketServer({ server, path: "/signal" });

  function roomFor(code) {
    const roomCode = String(code || "LOCAL").replace(/[^a-z0-9]/gi, "").toUpperCase() || "LOCAL";
    if (!rooms.has(roomCode)) {
      rooms.set(roomCode, { broadcasterId: null });
    }
    return { code: roomCode, room: rooms.get(roomCode) };
  }

  function broadcaster(code) {
    const { room } = roomFor(code);
    return room.broadcasterId ? clients.get(room.broadcasterId) : null;
  }

  function viewerCount(code) {
    return Array.from(clients.values()).filter((client) => client.role === "viewer" && client.code === code).length;
  }

  function updateCounts(code) {
    store.updateViewerCount(code, viewerCount(code));
    send(broadcaster(code), { type: "viewer-count", viewers: viewerCount(code) });
    broadcastLiveList();
  }

  function liveList() {
    return Array.from(rooms.entries())
      .map(([code, room]) => {
        const live = room.broadcasterId ? clients.get(room.broadcasterId) : null;
        if (!live) return null;
        return {
          code,
          name: live.name,
          title: `${live.name}'s live stream`,
          game: live.game || "Live game",
          viewers: viewerCount(code),
          quality: "WebRTC",
          latency: "Low"
        };
      })
      .filter(Boolean);
  }

  function broadcastLiveList() {
    const streams = liveList();
    for (const client of clients.values()) {
      if (["directory", "viewer"].includes(client.role)) {
        send(client.ws, { type: "live-list", streams });
      }
    }
  }

  wss.on("connection", (ws) => {
    const id = String(nextClientId++);
    clients.set(id, { id, ws, role: "unknown", name: "Guest", code: "LOCAL" });
    send(ws, { type: "connected", id });

    ws.on("message", (rawMessage) => {
      let message;
      try {
        message = JSON.parse(rawMessage.toString());
      } catch {
        return;
      }

      const client = clients.get(id);
      if (!client) return;

      if (message.type === "hello") {
        const previousCode = client.code;
        const previousRole = client.role;
        const { code, room } = roomFor(message.code);
        client.role = message.role;
        client.name = message.name || client.name;
        client.game = message.game || client.game || "Live game";
        client.code = code;
        store.upsertProfile({ id, name: client.name, game: client.game });

        if (message.role === "directory") {
          send(ws, { type: "live-list", streams: liveList() });
          return;
        }

        if (previousRole === "broadcaster" && previousCode !== code) {
          const previousRoom = roomFor(previousCode).room;
          if (previousRoom.broadcasterId === id) {
            previousRoom.broadcasterId = null;
          }
        }

        if (message.role === "broadcaster") {
          if (room.broadcasterId && room.broadcasterId !== id) {
            send(ws, { type: "error", message: "Another streamer is already live." });
            return;
          }

          room.broadcasterId = id;
          store.setLive({
            code,
            id,
            name: client.name,
            game: client.game,
            viewers: viewerCount(code)
          });
          send(ws, { type: "broadcaster-ready", viewers: viewerCount(code), code });
          for (const viewer of clients.values()) {
            if (viewer.role === "viewer" && viewer.code === code) {
              send(ws, { type: "viewer-joined", viewerId: viewer.id, viewerName: viewer.name });
              send(viewer.ws, { type: "broadcaster-ready", broadcasterName: client.name, code });
            }
          }
          updateCounts(code);
          broadcastLiveList();
          return;
        }

        if (message.role === "viewer") {
          const live = broadcaster(code);
          if (live) {
            send(live.ws, { type: "viewer-joined", viewerId: id, viewerName: client.name });
            send(ws, { type: "broadcaster-ready", broadcasterName: live.name, code });
          } else {
            send(ws, { type: "no-broadcaster" });
          }
          updateCounts(code);
          broadcastLiveList();
        }
        return;
      }

      if (["offer", "answer", "ice"].includes(message.type) && message.target) {
        const target = clients.get(message.target);
        send(target?.ws, { ...message, from: id });
      }

      if (message.type === "end-stream") {
        const { room } = roomFor(client.code);
        if (id !== room.broadcasterId) return;
        room.broadcasterId = null;
        store.removeLive(client.code);
        for (const viewer of clients.values()) {
          if (viewer.role === "viewer" && viewer.code === client.code) {
            send(viewer.ws, { type: "stream-ended" });
          }
        }
        broadcastLiveList();
      }
    });

    ws.on("close", () => {
      const client = clients.get(id);
      clients.delete(id);
      if (!client) return;

      const { room } = roomFor(client.code);

      if (id === room.broadcasterId) {
        room.broadcasterId = null;
        store.removeLive(client.code);
        for (const viewer of clients.values()) {
          if (viewer.role === "viewer" && viewer.code === client.code) {
            send(viewer.ws, { type: "stream-ended" });
          }
        }
        broadcastLiveList();
        return;
      }

      if (client.role === "viewer") {
        send(broadcaster(client.code), { type: "viewer-left", viewerId: id });
        updateCounts(client.code);
      }
    });
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      const actualPort = server.address().port;
      const isLocalOnly = host === "127.0.0.1" || host === "localhost";
      resolve({
        port: actualPort,
        localUrl: `http://127.0.0.1:${actualPort}`,
        networkUrls: isLocalOnly ? [] : localNetworkUrls(actualPort),
        close: () => new Promise((done) => server.close(done))
      });
    });
  });
}

module.exports = { startServer };
