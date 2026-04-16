import { Chess } from "../vendor/chess.js";
import { createInitialBoard } from "./pieces.js";

export const CONFIG = {
  boardSize: 8,
  handSizeMax: 4,
  deckSize: 40,
  chaosMax: 100,
  mutationChance: 0.35,
  maxMutationsPerPiece: 4,
  moveAnimMs: 200,
  bannerDisplayMs: 2000,
};

export function createInitialState(settings = {}, rng = Math.random) {
  const timerMs = resolveTimerMs(settings.timer);
  const timerLabel = formatClock(timerMs);
  const stats = settings.stats || {
    gamesPlayed: 0,
    whiteWins: 0,
    blackWins: 0,
    draws: 0,
    chaosSurvived: 0,
    mostMutations: 0,
  };

  return {
    chess: new Chess(),
    board: createInitialBoard(),
    rng,
    settings: {
      intensity: settings.intensity || "standard",
      timer: settings.timer || "unlimited",
      aiOpponent: Boolean(settings.aiOpponent),
    },
    turn: "white",
    turnCount: 1,
    selected: null,
    validMoves: [],
    targetSquares: [],
    check: false,
    checkmate: false,
    stalemate: false,
    draw: false,
    winner: null,
    gameOver: false,
    gameOverReason: "",
    wackoGameOver: null,
    pendingPromotion: null,
    wildcardRolls: {},
    mutationStats: {
      total: 0,
      mostOnPiece: 0,
    },
    hands: {
      white: [],
      black: [],
    },
    turnActions: {
      cardPlayed: false,
    },
    targeting: null,
    extraMoves: {
      white: 0,
      black: 0,
    },
    specialTiles: [],
    swapZoneEntries: {},
    chaosEvents: [],
    activeEvents: [],
    chaosMeter: 0,
    majorChaosCount: 0,
    lastMajorChaos: null,
    cardsPlayed: 0,
    deck: {
      cards: [],
      discard: [],
      remaining: 40,
      discarded: 0,
    },
    capturedPieces: {
      white: [],
      black: [],
    },
    enPassantTarget: null,
    halfMoveClock: 0,
    clocks: {
      white: timerMs,
      black: timerMs,
      activeColor: "white",
      startedAt: null,
      paused: true,
    },
    log: ["The board is armed."],
    players: {
      white: {
        name: settings.whiteName || "White",
        captured: 0,
        mutations: 0,
        frozen: 0,
        clock: timerLabel,
      },
      black: {
        name: settings.aiOpponent ? "Wacko AI" : settings.blackName || "Black",
        captured: 0,
        mutations: 0,
        frozen: 0,
        clock: timerLabel,
      },
    },
    stats,
    animation: null,
    effects: {
      captures: [],
    },
  };
}

export function addLog(state, message) {
  state.log.push(message);
  if (state.log.length > 80) {
    state.log.splice(0, state.log.length - 80);
  }
}

export function syncHudStats(state) {
  for (const color of ["white", "black"]) {
    state.players[color].captured = state.capturedPieces[color].length;
    state.players[color].mutations = countMutations(state, color);
    state.players[color].frozen = countFrozen(state, color);
  }
}

function countMutations(state, color) {
  return state.board.flat().reduce((total, piece) => {
    if (!piece || piece.color !== color) return total;
    return total + piece.mutations.length;
  }, 0);
}

function countFrozen(state, color) {
  return state.board.flat().filter((piece) => piece?.color === color && piece.frozenTurns > 0).length;
}

export function resolveTimerMs(timer) {
  if (!timer || timer === "unlimited") return null;
  const minutes = Number(timer);
  if (!Number.isFinite(minutes) || minutes <= 0) return null;
  return minutes * 60 * 1000;
}

export function formatClock(ms) {
  if (ms == null) return "--:--";
  const clamped = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(clamped / 60);
  const seconds = clamped % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function getRemainingMs(state, color, now = Date.now()) {
  const clocks = state.clocks;
  const base = clocks[color];
  if (base == null) return null;
  if (clocks.paused || clocks.activeColor !== color || clocks.startedAt == null) return base;
  return Math.max(0, base - (now - clocks.startedAt));
}

export function isUnlimited(state) {
  return state.clocks.white == null;
}

export function startClock(state, color, now = Date.now()) {
  const clocks = state.clocks;
  if (clocks.white == null) return;
  flushActiveClock(state, now);
  clocks.activeColor = color;
  clocks.startedAt = now;
  clocks.paused = false;
}

export function pauseClock(state, now = Date.now()) {
  const clocks = state.clocks;
  if (clocks.white == null || clocks.paused) return;
  flushActiveClock(state, now);
  clocks.paused = true;
  clocks.startedAt = null;
}

export function resumeClock(state, now = Date.now()) {
  const clocks = state.clocks;
  if (clocks.white == null || !clocks.paused) return;
  clocks.paused = false;
  clocks.startedAt = now;
}

export function flushActiveClock(state, now = Date.now()) {
  const clocks = state.clocks;
  if (clocks.white == null || clocks.paused || clocks.startedAt == null) return;
  const elapsed = now - clocks.startedAt;
  clocks[clocks.activeColor] = Math.max(0, clocks[clocks.activeColor] - elapsed);
  clocks.startedAt = now;
}

export function checkTimeout(state, now = Date.now()) {
  if (state.clocks.white == null || state.gameOver) return false;
  flushActiveClock(state, now);
  const active = state.clocks.activeColor;
  if (state.clocks[active] > 0) return false;
  const winner = active === "white" ? "black" : "white";
  state.gameOver = true;
  state.winner = winner;
  state.gameOverReason = `${winner[0].toUpperCase()}${winner.slice(1)} wins on time`;
  state.clocks.paused = true;
  state.clocks.startedAt = null;
  return true;
}
