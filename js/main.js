import { createBoardMetrics, drawBoard } from "./board.js";
import { renderShell, showAnnouncement } from "./ui.js";

const STORAGE_KEY = "wacko-chess-settings-v1";
const STATS_KEY = "wacko-chess-stats-v1";

const elements = {
  appShell: document.querySelector("#appShell"),
  boardCanvas: document.querySelector("#boardCanvas"),
  menuCanvas: document.querySelector("#menuCanvas"),
  menuOverlay: document.querySelector("#menuOverlay"),
  startForm: document.querySelector("#startForm"),
  whiteNameInput: document.querySelector("#whiteNameInput"),
  blackNameInput: document.querySelector("#blackNameInput"),
  whiteHud: document.querySelector("#whiteHud"),
  blackHud: document.querySelector("#blackHud"),
  whiteHand: document.querySelector("#whiteHand"),
  blackHand: document.querySelector("#blackHand"),
  turnStatus: document.querySelector("#turnStatus"),
  roundStatus: document.querySelector("#roundStatus"),
  chaosCountdown: document.querySelector("#chaosCountdown"),
  chaosMeterFill: document.querySelector("#chaosMeterFill"),
  deckStatus: document.querySelector("#deckStatus"),
  activeEvents: document.querySelector("#activeEvents"),
  eventLog: document.querySelector("#eventLog"),
  announcement: document.querySelector("#announcement"),
  statsStrip: document.querySelector("#statsStrip"),
};

const state = {
  turn: "white",
  turnCount: 1,
  chaosMeter: 0,
  status: "Waiting at the table",
  selected: null,
  validMoves: [],
  targetSquares: [],
  hands: {
    white: [],
    black: [],
  },
  players: {
    white: { name: "White", captured: 0, mutations: 0, frozen: 0, clock: "--:--" },
    black: { name: "Black", captured: 0, mutations: 0, frozen: 0, clock: "--:--" },
  },
  deck: {
    remaining: 40,
    discarded: 0,
  },
  activeEvents: [],
  log: ["The board is armed."],
  stats: loadStats(),
};

let boardMetrics;
let frame = 0;

function init() {
  applyStoredSettings();
  bindEvents();
  resizeBoard();
  renderShell(state, elements);
  requestAnimationFrame(tick);
}

function bindEvents() {
  window.addEventListener("resize", resizeBoard);
  elements.startForm.addEventListener("submit", handleStart);
}

function handleStart(event) {
  event.preventDefault();
  const formData = new FormData(elements.startForm);
  const settings = {
    whiteName: cleanName(formData.get("whiteName"), "White"),
    blackName: cleanName(formData.get("blackName"), "Black"),
    intensity: String(formData.get("intensity") || "standard"),
    timer: String(formData.get("timer") || "unlimited"),
  };

  persistSettings(settings);
  state.players.white.name = settings.whiteName;
  state.players.black.name = settings.blackName;
  state.players.white.clock = settings.timer === "unlimited" ? "--:--" : `${settings.timer}:00`;
  state.players.black.clock = settings.timer === "unlimited" ? "--:--" : `${settings.timer}:00`;
  state.status = `${settings.intensity} chaos`;
  state.log = [`${settings.whiteName} and ${settings.blackName} begin.`];

  elements.menuOverlay.hidden = true;
  elements.appShell.dataset.screen = "game";
  renderShell(state, elements);
  showAnnouncement(elements, "Match begins", "warning");
}

function resizeBoard() {
  boardMetrics = createBoardMetrics(elements.boardCanvas);
  resizeMenuCanvas();
}

function resizeMenuCanvas() {
  const dpr = window.devicePixelRatio || 1;
  const rect = elements.menuCanvas.getBoundingClientRect();
  elements.menuCanvas.width = Math.floor(rect.width * dpr);
  elements.menuCanvas.height = Math.floor(rect.height * dpr);
  const ctx = elements.menuCanvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function tick() {
  frame += 1;
  const boardCtx = elements.boardCanvas.getContext("2d");
  drawBoard(boardCtx, boardMetrics, frame, {
    selected: state.selected,
    validMoves: state.validMoves,
    targetSquares: state.targetSquares,
  });
  drawMenuBackdrop(frame);
  requestAnimationFrame(tick);
}

function drawMenuBackdrop(currentFrame) {
  if (elements.menuOverlay.hidden) return;
  const ctx = elements.menuCanvas.getContext("2d");
  const width = elements.menuCanvas.clientWidth;
  const height = elements.menuCanvas.clientHeight;

  ctx.clearRect(0, 0, width, height);
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, "#08090f");
  gradient.addColorStop(0.42, "#17202a");
  gradient.addColorStop(0.72, "#160d19");
  gradient.addColorStop(1, "#090a0e");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  const tile = Math.max(72, Math.floor(Math.min(width, height) / 9));
  const offset = (currentFrame * 0.18) % tile;
  for (let y = -tile; y < height + tile; y += tile) {
    for (let x = -tile; x < width + tile; x += tile) {
      const row = Math.floor((y + offset) / tile);
      const col = Math.floor((x - offset) / tile);
      ctx.fillStyle = (row + col) % 2 === 0 ? "rgba(240, 192, 64, 0.06)" : "rgba(0, 229, 255, 0.055)";
      ctx.fillRect(x - offset, y + offset, tile, tile);
      ctx.strokeStyle = "rgba(255, 255, 255, 0.035)";
      ctx.strokeRect(x - offset, y + offset, tile, tile);
    }
  }

  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.fillStyle = "rgba(255, 59, 92, 0.12)";
  ctx.fillRect(width * 0.64, 0, 8 + Math.sin(currentFrame / 13) * 3, height);
  ctx.fillStyle = "rgba(57, 255, 20, 0.08)";
  ctx.fillRect(width * 0.2, 0, 4, height);
  ctx.restore();
}

function applyStoredSettings() {
  const settings = loadJson(STORAGE_KEY, null);
  if (!settings) return;

  elements.whiteNameInput.value = settings.whiteName || "White";
  elements.blackNameInput.value = settings.blackName || "Black";
  setRadio("intensity", settings.intensity || "standard");
  setRadio("timer", settings.timer || "unlimited");
}

function setRadio(name, value) {
  const input = elements.startForm.querySelector(`input[name="${name}"][value="${value}"]`);
  if (input) input.checked = true;
}

function persistSettings(settings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

function loadStats() {
  return {
    gamesPlayed: 0,
    whiteWins: 0,
    blackWins: 0,
    draws: 0,
    chaosSurvived: 0,
    mostMutations: 0,
    ...loadJson(STATS_KEY, {}),
  };
}

function loadJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function cleanName(value, fallback) {
  const next = String(value || "").trim();
  return next || fallback;
}

init();
