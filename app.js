const adjectives = ["Swift", "Nova", "Clutch", "Turbo", "Prime", "Flux", "Apex", "Neon"];
const nouns = ["Rift", "Viper", "Pulse", "Knight", "Vector", "Raider", "Drift", "Cipher"];

const peerConfig = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" }
  ]
};

const localRoomCode = "LOCAL";
const liveTopic = "streamest-live";

const state = {
  username: "",
  isLive: false,
  localStream: null,
  remoteStream: null,
  selectedId: null,
  streams: [],
  socket: null,
  supabase: null,
  liveChannel: null,
  streamChannel: null,
  clientId: null,
  serverInfo: null,
  viewerCount: 0,
  broadcasterName: "",
  broadcasterPeer: null,
  broadcasterPeers: new Map(),
  watchMode: false,
  signalBaseUrl: "",
  relayUrl: "",
  streamCode: "",
  isSupabaseReady: false,
  liveInterval: null,
  joinInterval: null,
  waitingViewers: new Map()
};

const els = {
  username: document.querySelector("#username"),
  usernameInput: document.querySelector("#usernameInput"),
  avatarInitial: document.querySelector("#avatarInitial"),
  statusText: document.querySelector("#statusText"),
  qualityMetric: document.querySelector("#qualityMetric"),
  latencyMetric: document.querySelector("#latencyMetric"),
  performanceMode: document.querySelector("#performanceMode"),
  goLiveButton: document.querySelector("#goLiveButton"),
  endStreamButton: document.querySelector("#endStreamButton"),
  copyLinkButton: document.querySelector("#copyLinkButton"),
  viewerVideo: document.querySelector("#viewerVideo"),
  poster: document.querySelector("#poster"),
  posterTitle: document.querySelector("#posterTitle"),
  posterSubtitle: document.querySelector("#posterSubtitle"),
  watchTitle: document.querySelector("#watchTitle"),
  viewerCount: document.querySelector("#viewerCount"),
  streamQuality: document.querySelector("#streamQuality"),
  streamList: document.querySelector("#streamList"),
  streamCount: document.querySelector("#streamCount"),
  toast: document.querySelector("#toast"),
  viewerLink: document.querySelector("#viewerLink"),
  connectionStatus: document.querySelector("#connectionStatus"),
  joinStreamInput: document.querySelector("#joinStreamInput"),
  joinStreamButton: document.querySelector("#joinStreamButton"),
  relayServerInput: document.querySelector("#relayServerInput"),
  relayStatus: document.querySelector("#relayStatus"),
  backendStatus: document.querySelector("#backendStatus"),
  signalStatus: document.querySelector("#signalStatus"),
  waitingList: document.querySelector("#waitingList"),
  captureModal: document.querySelector("#captureModal"),
  closeCaptureModal: document.querySelector("#closeCaptureModal"),
  sourceGrid: document.querySelector("#sourceGrid")
};

function randomUsername() {
  const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  const number = Math.floor(100 + Math.random() * 900);
  return `${adjective}${noun}${number}`;
}

function savedUsername() {
  return localStorage.getItem("streamest-username") || randomUsername();
}

function randomStreamCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function savedStreamCode() {
  const existing = localStorage.getItem("streamest-stream-code");
  if (existing) return existing;
  const code = randomStreamCode();
  localStorage.setItem("streamest-stream-code", code);
  return code;
}

function createPeerConnection() {
  return new RTCPeerConnection(peerConfig);
}

function setUsername(value) {
  state.username = value.trim() || randomUsername();
  localStorage.setItem("streamest-username", state.username);
  els.username.textContent = state.username;
  els.usernameInput.value = state.username;
  els.avatarInitial.textContent = state.username.charAt(0).toUpperCase();
  updateLocalStreamCard();
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => els.toast.classList.remove("show"), 3000);
}

function normalizeRelayUrl(value) {
  const trimmed = value.trim();
  if (!trimmed) return "";

  try {
    const url = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
    url.pathname = "";
    url.search = "";
    url.hash = "";
    return url.origin;
  } catch {
    return "";
  }
}

function currentSignalBase() {
  return state.relayUrl || state.serverInfo?.localUrl || "http://127.0.0.1";
}

function updateSharePanel() {
  if (state.isSupabaseReady) {
    els.viewerLink.textContent = "Your profile appears in Browse when you go live.";
    els.relayStatus.textContent = "Supabase Realtime is connected. Viewers open the app and press your live profile.";
  } else {
    els.viewerLink.textContent = "Connecting to Supabase live directory...";
    els.relayStatus.textContent = "Live discovery needs Supabase Realtime.";
  }
}

function viewerUrl() {
  return state.relayUrl ? state.streamCode : "";
}

async function loadServerInfo() {
  if (window.streamestDesktop?.getServerInfo) {
    state.serverInfo = await window.streamestDesktop.getServerInfo();
  } else {
    state.serverInfo = {
      localUrl: "http://127.0.0.1",
      networkUrls: [],
      port: ""
    };
  }

  state.relayUrl = "";
  state.streamCode = savedStreamCode();
  if (els.relayServerInput) {
    els.relayServerInput.value = state.relayUrl;
  }
  els.joinStreamInput.value = localStorage.getItem("streamest-watch-code") || "";
  updateSharePanel();
}

function updateControls() {
  els.statusText.textContent = state.isLive ? "Live now" : state.watchMode ? "Watching" : "Ready to stream";
  els.goLiveButton.classList.toggle("hidden", state.isLive || state.watchMode);
  els.endStreamButton.classList.toggle("hidden", !state.isLive || state.watchMode);
  els.usernameInput.disabled = state.isLive;
  els.joinStreamInput.disabled = state.isLive;
  els.joinStreamButton.disabled = state.isLive;
}

function setRelayUrl(value) {
  state.relayUrl = normalizeRelayUrl(value);
  localStorage.setItem("streamest-relay-url", state.relayUrl);
  els.relayServerInput.value = state.relayUrl;
  updateSharePanel();
  connectDirectory();
}

function streamCardTemplate(stream) {
  const button = document.createElement("button");
  button.className = `stream-card ${state.selectedId === stream.id ? "active" : ""}`;
  button.type = "button";
  button.dataset.streamId = stream.id;
  button.innerHTML = `
    <div class="stream-info">
      <span class="stream-title"></span>
      <div class="stream-meta">
        <span></span>
        <span></span>
        <span></span>
      </div>
    </div>
    <span class="live-pill">Live</span>
  `;
  button.querySelector(".stream-title").textContent = stream.title;
  const meta = button.querySelectorAll(".stream-meta span");
  meta[0].textContent = stream.name;
  meta[1].textContent = stream.game;
  meta[2].textContent = `${stream.viewers} viewers`;
  button.addEventListener("click", () => {
    if (stream.code && stream.id.startsWith("remote:")) {
      joinLiveStream(stream);
      return;
    }

    selectStream(stream.id);
  });
  return button;
}

function renderStreams() {
  if (state.streams.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = state.isSupabaseReady ? "No one is live right now." : "Connecting to Supabase live directory.";
    els.streamList.replaceChildren(empty);
  } else {
    els.streamList.replaceChildren(...state.streams.map(streamCardTemplate));
  }
  els.streamCount.textContent = String(state.streams.length);
}

function selectStream(id) {
  const stream = state.streams.find((item) => item.id === id);
  if (!stream) return;

  state.selectedId = id;
  els.watchTitle.textContent = `${stream.name} - ${stream.game}`;
  els.viewerCount.textContent = `${stream.viewers} viewers`;
  els.streamQuality.textContent = `${stream.quality} / ${stream.latency} latency`;

  if (id === "local" && state.localStream) {
    els.viewerVideo.srcObject = state.localStream;
    els.viewerVideo.muted = true;
    els.poster.classList.add("hidden");
  }

  if (id.startsWith("remote") && state.remoteStream) {
    els.viewerVideo.srcObject = state.remoteStream;
    els.viewerVideo.muted = false;
    els.poster.classList.add("hidden");
  } else if (id.startsWith("remote")) {
    showPoster("Connecting to stream", "The video will start as soon as the connection is ready.");
  }

  renderStreams();
}

function showPoster(title, subtitle) {
  els.viewerVideo.srcObject = null;
  els.poster.classList.remove("hidden");
  els.posterTitle.textContent = title;
  els.posterSubtitle.textContent = subtitle;
}

function showRemoteStream(stream) {
  state.remoteStream = stream;
  els.viewerVideo.srcObject = stream;
  els.viewerVideo.muted = false;
  els.poster.classList.add("hidden");
  els.viewerVideo.play().catch(() => {
    setSignalStatus("Video ready. Click the video if it does not play.");
  });
}

function updateLocalStreamCard() {
  const stream = state.streams.find((item) => item.id === "local");
  if (!stream) return;
  stream.name = state.username;
  stream.title = `${state.username}'s live stream`;
  stream.viewers = Math.max(1, state.viewerCount + 1);
  renderStreams();
}

function setConnectionStatus(message) {
  els.connectionStatus.textContent = message;
}

function setSignalStatus(message) {
  els.signalStatus.textContent = message;
}

function renderWaitingViewers() {
  if (!state.isLive || state.waitingViewers.size === 0) {
    els.waitingList.replaceChildren();
    return;
  }

  const buttons = Array.from(state.waitingViewers.values()).map((viewer) => {
    const button = document.createElement("button");
    button.className = "waiting-button";
    button.type = "button";
    button.textContent = `Connect ${viewer.name}`;
    button.addEventListener("click", () => createBroadcasterPeer(viewer.id));
    return button;
  });
  els.waitingList.replaceChildren(...buttons);
}

function normalizeStreamCode(value) {
  return value.trim().replace(/[^a-z0-9]/gi, "").toUpperCase();
}

function normalizeSupabaseUrl(value) {
  const url = new URL(value);
  url.pathname = "";
  url.search = "";
  url.hash = "";
  return url.origin;
}

function streamTopic(code) {
  return `streamest-stream-${code}`;
}

async function initSupabase() {
  const config = window.streamestDesktop?.supabase;
  if (!config?.url || !config?.publishableKey || !window.supabase?.createClient) {
    els.backendStatus.textContent = "Supabase config missing.";
    return;
  }

  state.supabase = window.supabase.createClient(
    normalizeSupabaseUrl(config.url),
    config.publishableKey
  );

  state.liveChannel = state.supabase.channel(liveTopic, {
    config: { broadcast: { self: true } }
  });

  state.liveChannel
    .on("broadcast", { event: "live-list" }, ({ payload }) => updateLiveDirectory(payload.streams || []))
    .on("broadcast", { event: "live-started" }, ({ payload }) => upsertLiveStream(payload.stream))
    .on("broadcast", { event: "live-ended" }, ({ payload }) => removeLiveStream(payload.code))
    .on("broadcast", { event: "viewer-joined" }, async ({ payload }) => {
      if (state.isLive && state.localStream && payload.code === state.streamCode) {
        state.waitingViewers.set(payload.viewerId, {
          id: payload.viewerId,
          name: payload.viewerName || "Viewer"
        });
        renderWaitingViewers();
        setSignalStatus(`${payload.viewerName || "A viewer"} requested stream`);
        showToast(`${payload.viewerName || "A viewer"} is connecting.`);
        await createBroadcasterPeer(payload.viewerId);
      }
    })
    .on("broadcast", { event: "offer" }, async ({ payload }) => {
      if (state.watchMode && payload.code === state.streamCode && payload.target === state.clientId) {
        stopJoinRequests();
        setConnectionStatus("Received stream offer");
        setSignalStatus("Received stream offer");
        await acceptOffer(payload.from, payload.sdp);
      }
    })
    .on("broadcast", { event: "answer" }, async ({ payload }) => {
      if (state.isLive && payload.code === state.streamCode && payload.target === state.clientId) {
        const peer = state.broadcasterPeers.get(payload.from);
        if (peer) {
          await peer.setRemoteDescription(new RTCSessionDescription(payload.sdp));
          setSignalStatus(`Answer received from ${payload.from}`);
        }
      }
    })
    .on("broadcast", { event: "ice" }, async ({ payload }) => {
      if (payload.code !== state.streamCode || payload.target !== state.clientId) return;
      const peer = state.watchMode ? state.broadcasterPeer : state.broadcasterPeers.get(payload.from);
      if (peer && payload.candidate) {
        await peer.addIceCandidate(new RTCIceCandidate(payload.candidate));
      }
    })
    .on("broadcast", { event: "stream-ended" }, ({ payload }) => {
      if (state.watchMode && payload.code === state.streamCode) {
        closeViewerPeer();
        showPoster("Stream ended", "The streamer has ended the broadcast.");
      }
    })
    .subscribe((status) => {
      state.isSupabaseReady = status === "SUBSCRIBED";
      els.backendStatus.textContent = state.isSupabaseReady ? "Connected to Supabase." : `Supabase: ${status}`;
      updateSharePanel();
      renderStreams();
    });
}

function upsertLiveStream(stream) {
  if (!stream || state.isLive) return;
  const next = {
    id: `remote:${stream.code}`,
    code: stream.code,
    name: stream.name,
    game: stream.game || "Live game",
    title: stream.title || `${stream.name}'s live stream`,
    viewers: stream.viewers || 0,
    quality: stream.quality || "WebRTC",
    latency: stream.latency || "Low"
  };
  state.streams = [next, ...state.streams.filter((item) => item.code !== next.code)];
  renderStreams();
  if (!state.selectedId) {
    showPoster("Live profiles found", "Press a stream card to watch.");
  }
}

function updateLiveDirectory(streams) {
  if (state.isLive) return;
  state.streams = streams.map((stream) => ({
    id: `remote:${stream.code}`,
    code: stream.code,
    name: stream.name,
    game: stream.game || "Live game",
    title: stream.title || `${stream.name}'s live stream`,
    viewers: stream.viewers || 0,
    quality: stream.quality || "WebRTC",
    latency: stream.latency || "Low"
  }));
  renderStreams();
}

function removeLiveStream(code) {
  state.streams = state.streams.filter((stream) => stream.code !== code);
  renderStreams();
}

async function announceLive() {
  const stream = {
    code: state.streamCode,
    name: state.username,
    game: "Live game",
    title: `${state.username}'s live stream`,
    viewers: state.viewerCount,
    quality: "WebRTC",
    latency: "Low"
  };
  await state.liveChannel?.send({ type: "broadcast", event: "live-started", payload: { stream } });
}

function startLiveAnnouncements() {
  window.clearInterval(state.liveInterval);
  announceLive();
  state.liveInterval = window.setInterval(announceLive, 5000);
}

function stopLiveAnnouncements() {
  window.clearInterval(state.liveInterval);
  state.liveInterval = null;
}

async function announceEnded() {
  await state.liveChannel?.send({ type: "broadcast", event: "live-ended", payload: { code: state.streamCode } });
}

async function sendViewerJoined() {
  if (!state.liveChannel || !state.streamCode || !state.clientId) return;
  const payload = { code: state.streamCode, viewerId: state.clientId, viewerName: state.username };
  await state.liveChannel.send({ type: "broadcast", event: "viewer-joined", payload });
  await state.streamChannel?.send({ type: "broadcast", event: "viewer-joined", payload });
}

function startJoinRequests() {
  window.clearInterval(state.joinInterval);
  sendViewerJoined();
  state.joinInterval = window.setInterval(sendViewerJoined, 2000);
}

function stopJoinRequests() {
  window.clearInterval(state.joinInterval);
  state.joinInterval = null;
}

function openStreamChannel(code, mode) {
  state.streamChannel?.unsubscribe();
  state.streamChannel = state.supabase.channel(streamTopic(code), {
    config: { broadcast: { self: false } }
  });

  state.streamChannel
    .on("broadcast", { event: "viewer-joined" }, async ({ payload }) => {
      if (mode === "broadcaster" && state.localStream) {
        await createBroadcasterPeer(payload.viewerId);
      }
    })
    .on("broadcast", { event: "viewer-left" }, ({ payload }) => {
      if (mode === "broadcaster") {
        closeBroadcasterPeer(payload.viewerId);
      }
    })
    .on("broadcast", { event: "offer" }, async ({ payload }) => {
      if (mode === "viewer" && payload.target === state.clientId) {
        await acceptOffer(payload.from, payload.sdp);
      }
    })
    .on("broadcast", { event: "answer" }, async ({ payload }) => {
      if (mode === "broadcaster" && payload.target === state.clientId) {
        const peer = state.broadcasterPeers.get(payload.from);
        if (peer) {
          await peer.setRemoteDescription(new RTCSessionDescription(payload.sdp));
        }
      }
    })
    .on("broadcast", { event: "ice" }, async ({ payload }) => {
      if (payload.target !== state.clientId) return;
      const peer = mode === "viewer" ? state.broadcasterPeer : state.broadcasterPeers.get(payload.from);
      if (peer && payload.candidate) {
        await peer.addIceCandidate(new RTCIceCandidate(payload.candidate));
      }
    })
    .on("broadcast", { event: "stream-ended" }, () => {
      if (mode === "viewer") {
        closeViewerPeer();
        showPoster("Stream ended", "The streamer has ended the broadcast.");
      }
    });

  return new Promise((resolve) => {
    state.streamChannel.subscribe((status) => {
      if (status === "SUBSCRIBED") resolve();
    });
  });
}

function sendSignal(message) {
  let sent = false;
  const event = message.type;
  const payload = {
    ...message,
    code: state.streamCode,
    from: state.clientId
  };

  if (state.liveChannel) {
    state.liveChannel.send({
      type: "broadcast",
      event,
      payload
    });
    sent = true;
  }

  if (state.streamChannel) {
    state.streamChannel.send({
      type: "broadcast",
      event,
      payload
    });
    sent = true;
  }

  if (sent) {
    return;
  }

  if (state.socket?.readyState === WebSocket.OPEN) {
    state.socket.send(JSON.stringify(message));
  }
}

function connectSignal(role) {
  return new Promise((resolve, reject) => {
    if (state.socket?.readyState === WebSocket.OPEN) {
      sendSignal({
        type: "hello",
        role,
        name: state.username,
        code: state.relayUrl ? state.streamCode : localRoomCode
      });
      resolve();
      return;
    }

    const signalBase = state.signalBaseUrl || currentSignalBase();
    const signalUrl = new URL(signalBase);
    signalUrl.protocol = signalUrl.protocol === "https:" ? "wss:" : "ws:";
    signalUrl.pathname = "/signal";
    signalUrl.search = "";
    signalUrl.hash = "";
    const socketUrl = signalUrl.toString();
    state.socket = new WebSocket(socketUrl);

    state.socket.addEventListener("open", () => {
      setConnectionStatus("Connected to stream server");
      sendSignal({
        type: "hello",
        role,
        name: state.username,
        code: state.relayUrl ? state.streamCode : localRoomCode
      });
      resolve();
    });

    state.socket.addEventListener("message", (event) => handleSignalMessage(JSON.parse(event.data)));
    state.socket.addEventListener("close", () => {
      setConnectionStatus("Disconnected from stream server");
      if (state.watchMode) {
        showPoster("Connection closed", "Reconnect when the streamer goes live again.");
      }
    });
    state.socket.addEventListener("error", () => {
      setConnectionStatus("Could not connect to stream server");
      reject(new Error("WebSocket connection failed"));
    });
  });
}

async function handleSignalMessage(message) {
  if (message.type === "connected") {
    state.clientId = message.id;
  }

  if (message.type === "viewer-count") {
    state.viewerCount = message.viewers || 0;
    updateLocalStreamCard();
    if (state.selectedId === "local") {
      els.viewerCount.textContent = `${Math.max(1, state.viewerCount + 1)} viewers`;
    }
  }

  if (message.type === "live-list" && !state.isLive) {
    state.streams = (message.streams || []).map((stream) => ({
      id: `remote:${stream.code}`,
      code: stream.code,
      name: stream.name,
      game: stream.game || "Live game",
      title: stream.title || `${stream.name}'s live stream`,
      viewers: stream.viewers || 0,
      quality: stream.quality || "WebRTC",
      latency: stream.latency || "Low"
    }));
    renderStreams();
    if (state.streams.length > 0 && !state.selectedId) {
      showPoster("Live profiles found", "Press a stream card to watch.");
    }
  }

  if (message.type === "viewer-joined" && state.localStream) {
    await createBroadcasterPeer(message.viewerId);
    showToast(`${message.viewerName || "A viewer"} joined.`);
  }

  if (message.type === "viewer-left") {
    closeBroadcasterPeer(message.viewerId);
  }

  if (message.type === "broadcaster-ready" && state.watchMode) {
    state.broadcasterName = message.broadcasterName || "Streamer";
    const code = message.code || state.streamCode;
    state.streams = [
      {
        id: `remote:${code}`,
        code,
        name: state.broadcasterName,
        game: "Live game",
        title: `${state.broadcasterName}'s live stream`,
        viewers: 1,
        quality: "WebRTC",
        latency: "Low"
      }
    ];
    renderStreams();
    showPoster("Stream found", "Press the stream card to watch.");
  }

  if (message.type === "no-broadcaster" && state.watchMode) {
    state.streams = [];
    renderStreams();
    showPoster("No one is live yet", "Keep this page open or refresh after the streamer clicks Go Live.");
  }

  if (message.type === "offer" && state.watchMode) {
    await acceptOffer(message.from, message.sdp);
  }

  if (message.type === "answer") {
    const peer = state.broadcasterPeers.get(message.from);
    if (peer) {
      await peer.setRemoteDescription(new RTCSessionDescription(message.sdp));
    }
  }

  if (message.type === "ice") {
    const peer = state.watchMode ? state.broadcasterPeer : state.broadcasterPeers.get(message.from);
    if (peer && message.candidate) {
      await peer.addIceCandidate(new RTCIceCandidate(message.candidate));
    }
  }

  if (message.type === "stream-ended" && state.watchMode) {
    closeViewerPeer();
    state.streams = [];
    state.selectedId = null;
    renderStreams();
    showPoster("Stream ended", "The streamer has ended the broadcast.");
    els.watchTitle.textContent = "No stream selected";
    els.viewerCount.textContent = "0 viewers";
    els.streamQuality.textContent = "Idle";
  }

  if (message.type === "error") {
    showToast(message.message || "Stream server error.");
  }
}

async function createBroadcasterPeer(viewerId) {
  if (!viewerId || !state.localStream) return;
  closeBroadcasterPeer(viewerId);

  const peer = createPeerConnection();
  state.broadcasterPeers.set(viewerId, peer);
  state.localStream.getTracks().forEach((track) => peer.addTrack(track, state.localStream));

  peer.addEventListener("icecandidate", (event) => {
    if (event.candidate) {
      sendSignal({ type: "ice", target: viewerId, candidate: event.candidate.toJSON() });
    }
  });

  peer.addEventListener("connectionstatechange", () => {
    setSignalStatus(`Viewer ${viewerId}: ${peer.connectionState}`);
    if (["closed", "failed", "disconnected"].includes(peer.connectionState)) {
      closeBroadcasterPeer(viewerId);
    }
  });

  const offer = await peer.createOffer();
  await peer.setLocalDescription(offer);
  sendSignal({ type: "offer", target: viewerId, sdp: peer.localDescription.toJSON() });
  state.waitingViewers.delete(viewerId);
  renderWaitingViewers();
  setSignalStatus(`Offer sent to ${viewerId}`);
}

async function acceptOffer(broadcasterId, sdp) {
  closeViewerPeer();

  const peer = createPeerConnection();
  const remoteStream = new MediaStream();
  state.broadcasterPeer = peer;
  state.remoteStream = remoteStream;

  peer.addEventListener("track", (event) => {
    if (event.streams[0]) {
      showRemoteStream(event.streams[0]);
      setSignalStatus("Remote video track received");
      return;
    }

    remoteStream.addTrack(event.track);
    showRemoteStream(remoteStream);
    setSignalStatus("Remote video track received");
    if (state.selectedId?.startsWith("remote")) {
      selectStream(state.selectedId);
    }
  });

  peer.addEventListener("icecandidate", (event) => {
    if (event.candidate) {
      sendSignal({ type: "ice", target: broadcasterId, candidate: event.candidate.toJSON() });
    }
  });

  peer.addEventListener("connectionstatechange", () => {
    setSignalStatus(`WebRTC ${peer.connectionState}`);
    if (peer.connectionState === "connected") {
      stopJoinRequests();
      setConnectionStatus("Watching live");
    }

    if (["failed", "disconnected"].includes(peer.connectionState)) {
      setConnectionStatus(`WebRTC ${peer.connectionState}`);
      showPoster("Connection problem", "The stream was found, but the video connection did not complete.");
    }
  });

  await peer.setRemoteDescription(new RTCSessionDescription(sdp));
  setSignalStatus("Remote offer accepted");
  const answer = await peer.createAnswer();
  await peer.setLocalDescription(answer);
  sendSignal({ type: "answer", target: broadcasterId, sdp: peer.localDescription.toJSON() });
  setSignalStatus("Answer sent to streamer");
}

function closeBroadcasterPeer(viewerId) {
  const peer = state.broadcasterPeers.get(viewerId);
  if (peer) {
    peer.close();
    state.broadcasterPeers.delete(viewerId);
  }
}

function closeViewerPeer() {
  state.broadcasterPeer?.close();
  state.broadcasterPeer = null;
  state.remoteStream = null;
}

async function getElectronDesktopStream(videoSettings, source) {
  if (!source?.id) {
    throw new Error("No desktop capture source found");
  }

  return navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      mandatory: {
        chromeMediaSource: "desktop",
        chromeMediaSourceId: source.id,
        minWidth: 640,
        minHeight: 360,
        maxFrameRate: videoSettings.frameRate,
        maxWidth: videoSettings.width.ideal,
        maxHeight: videoSettings.height.ideal
      }
    }
  });
}

function captureSources() {
  if (!window.streamestDesktop?.getCaptureSources) {
    return Promise.resolve([]);
  }

  return window.streamestDesktop.getCaptureSources();
}

function closeCapturePicker() {
  els.captureModal.classList.add("hidden");
  els.sourceGrid.replaceChildren();
}

function chooseCaptureSource() {
  return new Promise(async (resolve, reject) => {
    let sources = [];

    try {
      sources = await captureSources();
    } catch (error) {
      reject(error);
      return;
    }

    if (sources.length === 0) {
      reject(new Error("No screens or windows were found"));
      return;
    }

    els.sourceGrid.replaceChildren(
      ...sources.map((source) => {
        const button = document.createElement("button");
        button.className = "source-card";
        button.type = "button";
        button.innerHTML = `
          <img alt="" />
          <span></span>
        `;
        button.querySelector("img").src = source.thumbnail;
        button.querySelector("span").textContent = source.name;
        button.addEventListener("click", () => {
          closeCapturePicker();
          resolve(source);
        });
        return button;
      })
    );

    els.captureModal.classList.remove("hidden");

    const cancel = () => {
      closeCapturePicker();
      reject(new Error("Capture selection cancelled"));
    };

    els.closeCaptureModal.addEventListener("click", cancel, { once: true });
  });
}

async function getScreenStream(source) {
  const video = {
    frameRate: els.performanceMode.checked ? 60 : 30,
    width: { ideal: els.performanceMode.checked ? 1920 : 1280 },
    height: { ideal: els.performanceMode.checked ? 1080 : 720 }
  };

  try {
    const desktopStream = await getElectronDesktopStream(video, source);
    if (desktopStream) {
      return desktopStream;
    }
  } catch (error) {
    console.warn("Electron desktop capture failed.", error);
  }

  if (!navigator.mediaDevices?.getDisplayMedia) {
    throw new Error("Screen capture is not available");
  }

  try {
    return await navigator.mediaDevices.getDisplayMedia({ video, audio: true });
  } catch (error) {
    if (error.name === "NotAllowedError") {
      throw error;
    }
    return navigator.mediaDevices.getDisplayMedia({ video, audio: false });
  }
}

async function goLive() {
  if (!state.isSupabaseReady) {
    showToast("Supabase is still connecting. Try again in a moment.");
    return;
  }

  try {
    const source = await chooseCaptureSource();
    const stream = await getScreenStream(source);

    state.localStream = stream;
    state.isLive = true;
    state.viewerCount = 0;
    state.waitingViewers.clear();
    state.streams = [
      {
        id: "local",
        name: state.username,
        game: "Your game",
        title: `${state.username}'s live stream`,
        viewers: 1,
        quality: els.performanceMode.checked ? "1080p60" : "720p30",
        latency: "Low"
      }
    ];

    state.clientId = `${state.username}-${Math.random().toString(36).slice(2)}`;
    await openStreamChannel(state.streamCode, "broadcaster");
    startLiveAnnouncements();
    stream.getVideoTracks()[0]?.addEventListener("ended", endStream);
    updateControls();
    renderStreams();
    selectStream("local");
    showToast("You are live. Viewers can press your profile in Browse.");
  } catch (error) {
    if (error.name !== "NotAllowedError" && error.message !== "Capture selection cancelled") {
      showToast(`Capture failed: ${error.name || "Error"} - ${error.message || "Unknown reason"}.`);
    }
  }
}

function endStream() {
  announceEnded();
  stopLiveAnnouncements();
  state.liveChannel?.send({ type: "broadcast", event: "stream-ended", payload: { code: state.streamCode } });
  state.broadcasterPeers.forEach((peer) => peer.close());
  state.broadcasterPeers.clear();
  state.waitingViewers.clear();
  renderWaitingViewers();
  state.streamChannel?.unsubscribe();
  state.streamChannel = null;
  stopJoinRequests();
  state.localStream?.getTracks().forEach((track) => track.stop());
  state.localStream = null;
  state.isLive = false;
  state.viewerCount = 0;
  state.streams = [];
  state.selectedId = null;
  showPoster("Stream ended", "Click Go Live when you are ready to broadcast again.");
  els.watchTitle.textContent = "No stream selected";
  els.viewerCount.textContent = "0 viewers";
  els.streamQuality.textContent = "Idle";
  updateControls();
  renderStreams();
  showToast("Stream ended.");
}

function updateQualityLabels() {
  const performance = els.performanceMode.checked;
  els.qualityMetric.textContent = performance ? "1080p" : "720p";
  els.latencyMetric.textContent = performance ? "Low" : "Stable";
}

async function copyChannelLink() {
  await connectDirectory();
  showToast("Live profiles refreshed.");
}

async function joinStream() {
  const code = normalizeStreamCode(els.joinStreamInput.value);
  if (!state.relayUrl) {
    showToast("Add a relay server URL first to watch by code without using an IP.");
    return;
  }

  if (!code) {
    showToast("Enter a valid stream code.");
    return;
  }

  if (state.socket) {
    state.socket.close();
    state.socket = null;
  }

  closeViewerPeer();
  state.watchMode = true;
  state.signalBaseUrl = state.relayUrl;
  state.streamCode = code;
  state.streams = [];
  state.selectedId = null;
  localStorage.setItem("streamest-watch-code", code);
  els.joinStreamInput.value = code;
  updateControls();
  renderStreams();
  showPoster("Finding stream", "The stream will appear in Browse when it is live.");

  try {
    await connectSignal("viewer");
    showToast("Connected. Press the stream card when it appears.");
  } catch {
    showToast("Could not connect to the relay server.");
  }
}

async function connectDirectory() {
  if (!state.isSupabaseReady || state.isLive || state.watchMode) {
    renderStreams();
    return;
  }

  setConnectionStatus("Connected to live directory");
}

async function joinLiveStream(stream) {
  if (!state.isSupabaseReady) {
    showToast("Supabase is still connecting. Try again in a moment.");
    return;
  }

  closeViewerPeer();
  state.watchMode = true;
  state.streamCode = stream.code;
  state.clientId = `${state.username}-${Math.random().toString(36).slice(2)}`;
  state.selectedId = stream.id;
  updateControls();
  renderStreams();
  showPoster("Connecting to stream", "The video will start as soon as the streamer accepts your connection.");

  try {
    startJoinRequests();
    await openStreamChannel(stream.code, "viewer");
    sendViewerJoined();
    setConnectionStatus("Waiting for streamer response");
    setSignalStatus("Asking streamer to connect");
  } catch {
    showToast("Could not connect to that live stream.");
  }
}

async function init() {
  setUsername(savedUsername());
  await loadServerInfo();
  await initSupabase();
  updateQualityLabels();
  updateControls();
  renderStreams();
}

els.usernameInput.addEventListener("change", (event) => setUsername(event.target.value));
els.performanceMode.addEventListener("change", updateQualityLabels);
els.goLiveButton.addEventListener("click", goLive);
els.endStreamButton.addEventListener("click", endStream);
els.copyLinkButton.addEventListener("click", copyChannelLink);
els.joinStreamButton.addEventListener("click", joinStream);
els.relayServerInput?.addEventListener("change", (event) => setRelayUrl(event.target.value));

init();
