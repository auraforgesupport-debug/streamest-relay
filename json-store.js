const fs = require("fs");
const path = require("path");

const defaultState = {
  profiles: {},
  liveStreams: {},
  updatedAt: null
};

function cloneDefaultState() {
  return JSON.parse(JSON.stringify(defaultState));
}

function createJsonStore(filePath = process.env.STREAMEST_DATA_FILE || path.join(process.cwd(), "data", "streamest-state.json")) {
  function ensureFile() {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    if (!fs.existsSync(filePath)) {
      write(cloneDefaultState());
    }
  }

  function read() {
    ensureFile();
    try {
      return { ...cloneDefaultState(), ...JSON.parse(fs.readFileSync(filePath, "utf8")) };
    } catch {
      const state = cloneDefaultState();
      write(state);
      return state;
    }
  }

  function write(state) {
    const nextState = {
      ...cloneDefaultState(),
      ...state,
      updatedAt: new Date().toISOString()
    };
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `${JSON.stringify(nextState, null, 2)}\n`);
  }

  function upsertProfile({ id, name, game }) {
    const state = read();
    state.profiles[id] = {
      id,
      name,
      game: game || "Live game",
      updatedAt: new Date().toISOString()
    };
    write(state);
  }

  function setLive({ code, id, name, game, viewers = 0 }) {
    const state = read();
    state.liveStreams[code] = {
      code,
      broadcasterId: id,
      name,
      title: `${name}'s live stream`,
      game: game || "Live game",
      viewers,
      quality: "WebRTC",
      latency: "Low",
      startedAt: state.liveStreams[code]?.startedAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    write(state);
  }

  function updateViewerCount(code, viewers) {
    const state = read();
    if (state.liveStreams[code]) {
      state.liveStreams[code].viewers = viewers;
      state.liveStreams[code].updatedAt = new Date().toISOString();
      write(state);
    }
  }

  function removeLive(code) {
    const state = read();
    delete state.liveStreams[code];
    write(state);
  }

  function clearLiveStreams() {
    const state = read();
    state.liveStreams = {};
    write(state);
  }

  function getLiveStreams() {
    return Object.values(read().liveStreams);
  }

  function snapshot() {
    return read();
  }

  ensureFile();

  return {
    filePath,
    upsertProfile,
    setLive,
    updateViewerCount,
    removeLive,
    clearLiveStreams,
    getLiveStreams,
    snapshot
  };
}

module.exports = { createJsonStore };
