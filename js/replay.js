/**
 * Replay module — records game actions and plays them back.
 * Stores replay data as a compact JSON array of events.
 */

import { snapshotForUndo } from "./state.js";

const REPLAY_STORAGE_KEY = "wacko-chess-replays-v1";
const MAX_STORED_REPLAYS = 10;

let recording = null;

export function startRecording(settings) {
  recording = {
    version: 1,
    date: Date.now(),
    settings: { ...settings },
    events: [],
    result: null,
  };
}

export function recordEvent(type, payload) {
  if (!recording) return;
  recording.events.push({ type, payload, turn: payload?.turn || null });
}

export function recordMove(from, to, promotion, turn) {
  recordEvent("move", { from, to, promotion, turn });
}

export function recordCardPlay(color, handIndex, targets, cardId) {
  recordEvent("card", { color, handIndex, targets, cardId });
}

export function recordMajorChaos(name) {
  recordEvent("chaos", { name });
}

export function finishRecording(winner, reason, turnCount) {
  if (!recording) return null;
  recording.result = { winner, reason, turnCount };
  recording.duration = Date.now() - recording.date;
  const replay = recording;
  recording = null;
  saveReplay(replay);
  return replay;
}

export function isRecording() {
  return recording !== null;
}

// ── Storage ──

export function saveReplay(replay) {
  const replays = loadAllReplays();
  replays.unshift(replay);
  if (replays.length > MAX_STORED_REPLAYS) replays.length = MAX_STORED_REPLAYS;
  try {
    localStorage.setItem(REPLAY_STORAGE_KEY, JSON.stringify(replays));
  } catch {
    // Storage full — drop oldest
    replays.length = Math.max(1, replays.length - 3);
    try {
      localStorage.setItem(REPLAY_STORAGE_KEY, JSON.stringify(replays));
    } catch { /* give up */ }
  }
}

export function loadAllReplays() {
  try {
    const raw = localStorage.getItem(REPLAY_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function deleteReplay(index) {
  const replays = loadAllReplays();
  replays.splice(index, 1);
  localStorage.setItem(REPLAY_STORAGE_KEY, JSON.stringify(replays));
}

// ── Share (encode/decode) ──

export function encodeReplay(replay) {
  const compact = JSON.stringify(replay);
  return btoa(unescape(encodeURIComponent(compact)));
}

export function decodeReplay(encoded) {
  try {
    const json = decodeURIComponent(escape(atob(encoded)));
    return JSON.parse(json);
  } catch {
    return null;
  }
}

// ── Playback controller ──

export function createPlayback(replay) {
  return {
    replay,
    currentIndex: -1,
    playing: false,
    speed: 1000,
    get totalEvents() {
      return replay.events.length;
    },
    get currentEvent() {
      return replay.events[this.currentIndex] || null;
    },
    get progress() {
      if (!replay.events.length) return 0;
      return Math.max(0, (this.currentIndex + 1) / replay.events.length);
    },
    get isAtStart() {
      return this.currentIndex < 0;
    },
    get isAtEnd() {
      return this.currentIndex >= replay.events.length - 1;
    },
  };
}
