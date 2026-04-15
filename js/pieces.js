import { squareRect } from "./board.js";

export const PIECE_TYPES = {
  p: { name: "Pawn", value: 1 },
  n: { name: "Knight", value: 3 },
  b: { name: "Bishop", value: 3 },
  r: { name: "Rook", value: 5 },
  q: { name: "Queen", value: 9 },
  k: { name: "King", value: Infinity },
};

export const PIECE_GLYPHS = {
  white: { k: "♔", q: "♕", r: "♖", b: "♗", n: "♘", p: "♙" },
  black: { k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" },
};

const BACK_RANK = ["r", "n", "b", "q", "k", "b", "n", "r"];

export function createInitialBoard() {
  const board = Array.from({ length: 8 }, () => Array(8).fill(null));
  const counters = { white: {}, black: {} };

  for (let col = 0; col < 8; col += 1) {
    board[0][col] = createPiece("black", BACK_RANK[col], counters);
    board[1][col] = createPiece("black", "p", counters);
    board[6][col] = createPiece("white", "p", counters);
    board[7][col] = createPiece("white", BACK_RANK[col], counters);
  }

  return board;
}

export function createPiece(color, type, counters = null) {
  const nextCounters = counters || { white: {}, black: {} };
  nextCounters[color][type] = (nextCounters[color][type] || 0) + 1;
  const index = nextCounters[color][type];

  return {
    id: `${color}-${type}-${index}`,
    type,
    color,
    mutations: [],
    hasMoved: false,
    frozenTurns: 0,
    promoted: false,
  };
}

export function clonePiece(piece) {
  return piece
    ? {
        ...piece,
        mutations: [...piece.mutations],
      }
    : null;
}

export function getPieceAt(board, row, col) {
  return board[row]?.[col] || null;
}

export function findPiecePosition(board, pieceId) {
  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      if (board[row][col]?.id === pieceId) {
        return { row, col };
      }
    }
  }

  return null;
}

export function pieceLabel(piece) {
  if (!piece) return "";
  return `${piece.color} ${PIECE_TYPES[piece.type].name}`;
}

export function drawPieces(ctx, metrics, state, frame, now) {
  drawCaptureEffects(ctx, metrics, state.effects.captures, now);
  const activeMove = getActiveMove(state.animation, now);

  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      const piece = state.board[row][col];
      if (!piece) continue;
      if (activeMove?.pieceId === piece.id) continue;
      drawPiece(ctx, metrics, piece, row, col, frame);
    }
  }

  if (activeMove) {
    const progress = easeOutCubic((now - activeMove.startedAt) / activeMove.duration);
    const from = squareRect(metrics, activeMove.from.row, activeMove.from.col);
    const to = squareRect(metrics, activeMove.to.row, activeMove.to.col);
    const x = from.x + (to.x - from.x) * progress;
    const y = from.y + (to.y - from.y) * progress;
    drawPieceAt(ctx, activeMove.piece, x, y, from.size, frame, true);
  }
}

export function drawPiece(ctx, metrics, piece, row, col, frame) {
  const { x, y, size } = squareRect(metrics, row, col);
  drawPieceAt(ctx, piece, x, y, size, frame, false);
}

function drawPieceAt(ctx, piece, x, y, size, frame, moving) {
  const glyph = PIECE_GLYPHS[piece.color][piece.type];
  const pulse = Math.sin(frame / 16 + piece.id.length) * 0.5 + 0.5;
  const centerX = x + size / 2;
  const centerY = y + size / 2;
  const fontSize = Math.max(34, size * 0.7);

  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `${fontSize}px Georgia, "Times New Roman", serif`;
  ctx.shadowBlur = moving ? 24 : 12 + pulse * 8;
  ctx.shadowColor = piece.color === "white" ? "rgba(240, 192, 64, 0.56)" : "rgba(0, 229, 255, 0.3)";
  ctx.fillStyle = piece.color === "white" ? "#f4efff" : "#150d20";
  ctx.strokeStyle = piece.color === "white" ? "rgba(10, 10, 15, 0.82)" : "rgba(240, 192, 64, 0.78)";
  ctx.lineWidth = Math.max(1.25, size * 0.025);
  ctx.strokeText(glyph, centerX, centerY + size * 0.035);
  ctx.fillText(glyph, centerX, centerY + size * 0.035);

  if (piece.frozenTurns > 0) {
    ctx.fillStyle = "rgba(0, 229, 255, 0.72)";
    ctx.beginPath();
    ctx.arc(x + size * 0.78, y + size * 0.22, size * 0.085, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function drawCaptureEffects(ctx, metrics, captures, now) {
  ctx.save();
  for (const capture of captures) {
    const age = now - capture.startedAt;
    const progress = Math.min(1, age / capture.duration);
    const { x, y, size } = squareRect(metrics, capture.row, capture.col);
    const alpha = 1 - progress;
    ctx.strokeStyle = `rgba(255, 59, 92, ${alpha * 0.76})`;
    ctx.fillStyle = `rgba(255, 59, 92, ${alpha * 0.16})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x + size / 2, y + size / 2, size * (0.18 + progress * 0.5), 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

function getActiveMove(animation, now) {
  if (!animation || now - animation.startedAt > animation.duration) {
    return null;
  }
  return animation;
}

function easeOutCubic(value) {
  const t = Math.min(1, Math.max(0, value));
  return 1 - (1 - t) ** 3;
}
