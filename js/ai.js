import { Chess } from "../vendor/chess.js";
import {
  canPlayCard,
  CARD_DEFINITIONS,
  getCardTargetSquares,
  getTargetCount,
  hasChaosEvent,
} from "./chaos.js";
import { findPiecePosition, getPieceAt, PIECE_TYPES } from "./pieces.js";
import { effectiveTurn, getLegalMoves, oppositeColor } from "./rules.js";

const DIFFICULTY_DEPTH = {
  easy: 0,
  standard: 2,
  hard: 3,
};

const DIFFICULTY_RANDOMNESS = {
  easy: 2.5,
  standard: 0.5,
  hard: 0.15,
};

const PIECE_MATERIAL = { p: 1, n: 3, b: 3.2, r: 5, q: 9, k: 1000 };

const CARD_PRIORITY = {
  NUCLEAR_OPTION: 100,
  CHAOS_NOVA: 90,
  TIME_WARP: 84,
  FREEZE: 78,
  MUTATION_INJECTION: 72,
  FORTIFY: 70,
  VOLCANO: 68,
  LAND_MINE: 64,
  AMPLIFY: 62,
  PORTAL_PAIR: 58,
  SWAP_AND_PRAY: 54,
  THE_CLONE_WARS: 52,
  PIECE_THIEF: 50,
  PROMOTION_RIOT: 48,
  HAUNTING: 44,
  REBELLION: 42,
  PIECE_STORM: 40,
  GRAVITY_FLIP: 36,
  KINGS_GAMBLE: 34,
  THE_SWITCH: 28,
};

export function chooseAiCardPlay(state, color = "black") {
  const options = state.hands[color]
    .map((card, handIndex) => ({ card, handIndex, priority: CARD_PRIORITY[card.id] || 0 }))
    .filter((option) => canPlayCard(state, color, option.handIndex))
    .sort((a, b) => b.priority - a.priority);

  for (const option of options) {
    const targetCount = getTargetCount(option.card);
    const targets = chooseCardTargets(state, color, option.handIndex, targetCount);
    if (targets.length === targetCount) {
      return {
        handIndex: option.handIndex,
        targets,
        definition: CARD_DEFINITIONS[option.card.id],
      };
    }
  }

  return null;
}

export function chooseAiMove(state, color = "black") {
  const difficulty = state.settings?.aiDifficulty || "standard";
  const depth = DIFFICULTY_DEPTH[difficulty] ?? 2;
  const randomness = DIFFICULTY_RANDOMNESS[difficulty] ?? 0.5;

  const candidates = [];
  const pieceColor = effectiveTurn(state) === color ? color : effectiveTurn(state);

  for (const { piece, row, col } of allPieces(state, pieceColor)) {
    const moves = getLegalMoves(state, piece.id);
    for (const move of moves) {
      candidates.push({
        from: { row, col },
        to: { row: move.row, col: move.col },
        promotion: move.promotion || (piece.type === "p" && (move.row === 0 || move.row === 7) ? "q" : undefined),
        score: scoreMove(state, color, piece, move),
        move,
      });
    }
  }

  if (!candidates.length) return null;

  if (depth > 0) {
    const searchDepth = depth;
    for (const candidate of candidates) {
      const lookahead = evaluateWithLookahead(state, color, candidate, searchDepth);
      if (lookahead != null) {
        candidate.score = candidate.score * 0.4 + lookahead;
      }
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  const topScore = candidates[0].score;
  const threshold = topScore - randomness;
  const best = candidates.filter((candidate) => candidate.score >= threshold);
  return best[Math.floor(state.rng() * best.length)];
}

function evaluateWithLookahead(state, color, candidate, depth) {
  const chessClone = new Chess(state.chess.fen());
  const uciMove = toUci(candidate);
  let applied;
  try {
    applied = chessClone.move(uciMove);
  } catch {
    return null;
  }
  if (!applied) return null;

  return -minimax(chessClone, depth - 1, -Infinity, Infinity, color, oppositeColor(color));
}

function minimax(chess, depth, alpha, beta, rootColor, activeColor) {
  if (depth <= 0 || chess.isGameOver()) {
    return materialEval(chess, rootColor);
  }

  const moves = chess.moves({ verbose: true });
  if (!moves.length) {
    if (chess.isCheckmate()) {
      return rootColor === activeColor ? -9999 : 9999;
    }
    return 0;
  }

  const maximizing = activeColor === rootColor;
  let best = maximizing ? -Infinity : Infinity;

  for (const move of moves) {
    chess.move(move);
    const score = minimax(chess, depth - 1, alpha, beta, rootColor, oppositeColor(activeColor));
    chess.undo();

    if (maximizing) {
      if (score > best) best = score;
      if (best > alpha) alpha = best;
    } else {
      if (score < best) best = score;
      if (best < beta) beta = best;
    }
    if (beta <= alpha) break;
  }

  return best;
}

function materialEval(chess, rootColor) {
  const board = chess.board();
  let score = 0;
  for (const row of board) {
    for (const cell of row) {
      if (!cell) continue;
      const value = PIECE_MATERIAL[cell.type] || 0;
      const isRoot = (cell.color === "w" && rootColor === "white") || (cell.color === "b" && rootColor === "black");
      score += isRoot ? value : -value;
    }
  }
  return score;
}

function toUci(candidate) {
  const from = `${"abcdefgh"[candidate.from.col]}${8 - candidate.from.row}`;
  const to = `${"abcdefgh"[candidate.to.col]}${8 - candidate.to.row}`;
  const uci = { from, to };
  if (candidate.promotion) uci.promotion = candidate.promotion;
  return uci;
}

function chooseCardTargets(state, color, handIndex, targetCount) {
  const card = state.hands[color][handIndex];
  if (targetCount === 0) return [];

  let selected = [];
  for (let index = 0; index < targetCount; index += 1) {
    const legal = getCardTargetSquares(state, color, handIndex, selected);
    if (!legal.length) return [];
    const scored = legal
      .map((target) => ({ target, score: scoreCardTarget(state, color, card.id, target) }))
      .sort((a, b) => b.score - a.score);
    selected = [...selected, scored[0].target];
  }

  return selected;
}

function scoreCardTarget(state, color, cardId, target) {
  const piece = getPieceAt(state.board, target.row, target.col);
  const enemyColor = oppositeColor(color);
  const center = 3.5 - (Math.abs(target.row - 3.5) + Math.abs(target.col - 3.5)) * 0.2;

  if (cardId === "FREEZE" || cardId === "REBELLION") {
    return pieceValue(piece) + (piece?.color === enemyColor ? 4 : 0);
  }

  if (cardId === "FORTIFY" || cardId === "MUTATION_INJECTION" || cardId === "THE_CLONE_WARS") {
    return pieceValue(piece) + (piece?.type === "k" ? 5 : 0);
  }

  if (cardId === "PROMOTION_RIOT") {
    return 8 - target.row;
  }

  if (cardId === "NUCLEAR_OPTION") {
    return zoneScore(state, color, target);
  }

  if (cardId === "VOLCANO" || cardId === "LAND_MINE" || cardId === "HAUNTING") {
    return nearbyEnemyPressure(state, enemyColor, target) + center;
  }

  if (cardId === "AMPLIFY" || cardId === "PORTAL_PAIR") {
    return nearbyEnemyPressure(state, color, target) + center;
  }

  if (cardId === "PIECE_THIEF") {
    return target.col === 3 || target.col === 4 ? 4 : 2;
  }

  return piece ? pieceValue(piece) : center;
}

function scoreMove(state, color, piece, move) {
  const target = getPieceAt(state.board, move.row, move.col);
  let score = state.rng() * 0.2;
  const captureMultiplier = hasChaosEvent(state, "RULE_INVERSION") ? 2 : 10;
  score += pieceValue(target) * (target?.color === oppositeColor(color) ? captureMultiplier : -4);
  score += move.promotion ? 18 : 0;
  score += move.special === "clone" ? 9 : 0;
  score += move.wacko ? 1.6 : 0;
  score += centerScore(move.row, move.col);
  score += tileScore(state, move.row, move.col);
  score += piece.mutations.length * 0.4;

  if (piece.type === "k") {
    score -= 1.5;
  }

  return score;
}

function tileScore(state, row, col) {
  let score = 0;
  for (const tile of state.specialTiles.filter((item) => item.row === row && item.col === col)) {
    if (tile.type === "LAVA" || tile.type === "VOID" || tile.type === "MINEFIELD") score -= 30;
    if (tile.type === "AMPLIFIER") score += 6;
    if (tile.type === "PORTAL_A" || tile.type === "PORTAL_B") score += 1;
  }
  return score;
}

function zoneScore(state, color, center) {
  let score = 0;
  for (let row = center.row - 1; row <= center.row + 1; row += 1) {
    for (let col = center.col - 1; col <= center.col + 1; col += 1) {
      const piece = getPieceAt(state.board, row, col);
      if (!piece || piece.type === "k") continue;
      score += piece.color === oppositeColor(color) ? pieceValue(piece) : -pieceValue(piece) * 0.8;
    }
  }
  return score;
}

function nearbyEnemyPressure(state, color, target) {
  let score = 0;
  for (let row = target.row - 1; row <= target.row + 1; row += 1) {
    for (let col = target.col - 1; col <= target.col + 1; col += 1) {
      const piece = getPieceAt(state.board, row, col);
      if (piece?.color === color) score += pieceValue(piece);
    }
  }
  return score;
}

function centerScore(row, col) {
  return 3.5 - (Math.abs(row - 3.5) + Math.abs(col - 3.5)) * 0.35;
}

function pieceValue(piece) {
  if (!piece) return 0;
  if (piece.type === "k") return 40;
  return PIECE_TYPES[piece.type]?.value || 0;
}

function allPieces(state, color) {
  const pieces = [];
  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      const piece = getPieceAt(state.board, row, col);
      if (piece?.color === color && findPiecePosition(state.board, piece.id)) {
        pieces.push({ piece, row, col });
      }
    }
  }
  return pieces;
}
