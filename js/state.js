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
      aiDifficulty: settings.aiDifficulty || "standard",
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
    moveHistory: [],
    lastMove: null,
    undoStack: [],
    dragging: null,
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

const UNDO_STACK_MAX = 16;

export function snapshotForUndo(state) {
  return {
    board: clone(state.board),
    fen: state.chess.fen(),
    turn: state.turn,
    turnCount: state.turnCount,
    hands: clone(state.hands),
    deck: clone(state.deck),
    chaosEvents: clone(state.chaosEvents),
    specialTiles: clone(state.specialTiles),
    chaosMeter: state.chaosMeter,
    majorChaosCount: state.majorChaosCount,
    cardsPlayed: state.cardsPlayed,
    capturedPieces: clone(state.capturedPieces),
    extraMoves: { ...state.extraMoves },
    enPassantTarget: state.enPassantTarget ? { ...state.enPassantTarget } : null,
    halfMoveClock: state.halfMoveClock,
    check: state.check,
    moveHistory: clone(state.moveHistory),
    lastMove: state.lastMove ? { ...state.lastMove } : null,
    turnActions: { ...state.turnActions },
    log: [...state.log],
    mutationStats: { ...state.mutationStats },
    wildcardRolls: { ...state.wildcardRolls },
    swapZoneEntries: { ...state.swapZoneEntries },
    clocks: { ...state.clocks },
    players: {
      white: { ...state.players.white },
      black: { ...state.players.black },
    },
  };
}

export function pushUndoSnapshot(state) {
  state.undoStack.push(snapshotForUndo(state));
  if (state.undoStack.length > UNDO_STACK_MAX) {
    state.undoStack.shift();
  }
}

export function restoreUndoSnapshot(state) {
  const snap = state.undoStack.pop();
  if (!snap) return false;
  state.board = snap.board;
  state.chess.load(snap.fen);
  state.turn = snap.turn;
  state.turnCount = snap.turnCount;
  state.hands = snap.hands;
  state.deck = snap.deck;
  state.chaosEvents = snap.chaosEvents;
  state.specialTiles = snap.specialTiles;
  state.chaosMeter = snap.chaosMeter;
  state.majorChaosCount = snap.majorChaosCount;
  state.cardsPlayed = snap.cardsPlayed;
  state.capturedPieces = snap.capturedPieces;
  state.extraMoves = snap.extraMoves;
  state.enPassantTarget = snap.enPassantTarget;
  state.halfMoveClock = snap.halfMoveClock;
  state.check = snap.check;
  state.moveHistory = snap.moveHistory;
  state.lastMove = snap.lastMove;
  state.turnActions = snap.turnActions;
  state.log = snap.log;
  state.mutationStats = snap.mutationStats;
  state.wildcardRolls = snap.wildcardRolls;
  state.swapZoneEntries = snap.swapZoneEntries;
  state.clocks = snap.clocks;
  state.players = snap.players;
  // Clear ephemeral selection/animation state
  state.selected = null;
  state.validMoves = [];
  state.targetSquares = [];
  state.pendingPromotion = null;
  state.targeting = null;
  state.animation = null;
  state.gameOver = false;
  state.winner = null;
  state.gameOverReason = "";
  state.wackoGameOver = null;
  state.checkmate = false;
  state.stalemate = false;
  state.draw = false;
  return true;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function resignGame(state, color) {
  if (state.gameOver) return false;
  const winner = color === "white" ? "black" : "white";
  state.gameOver = true;
  state.winner = winner;
  state.gameOverReason = `${capitalizeColor(color)} resigned`;
  state.wackoGameOver = { winner, reason: state.gameOverReason };
  state.clocks.paused = true;
  state.clocks.startedAt = null;
  addLog(state, `${capitalizeColor(color)} resigned.`);
  return true;
}

export function agreeDraw(state) {
  if (state.gameOver) return false;
  state.gameOver = true;
  state.winner = null;
  state.gameOverReason = "Draw by agreement";
  state.wackoGameOver = { winner: null, reason: state.gameOverReason };
  state.draw = true;
  state.clocks.paused = true;
  state.clocks.startedAt = null;
  addLog(state, "Players agreed to a draw.");
  return true;
}

function capitalizeColor(color) {
  return color[0].toUpperCase() + color.slice(1);
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
