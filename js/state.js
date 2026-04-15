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
  const timerLabel = settings.timer && settings.timer !== "unlimited" ? `${settings.timer}:00` : "--:--";
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
        name: settings.blackName || "Black",
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
