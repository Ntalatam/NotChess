import { squareRect } from "./board.js";
import { MUTATION_DEFINITIONS } from "./mutations.js";
import { getTheme, getPieceStyle } from "./themes.js";
import { getColorblindPalette } from "./accessibility.js";

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
  const dragging = state.dragging;

  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      const piece = state.board[row][col];
      if (!piece) continue;
      if (activeMove?.pieceId === piece.id) continue;
      if (dragging?.pieceId === piece.id) continue;
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

  if (dragging && dragging.cursorX != null) {
    const piece = findPieceById(state.board, dragging.pieceId);
    if (piece) {
      const size = metrics.squareSize;
      drawPieceAt(ctx, piece, dragging.cursorX - size / 2, dragging.cursorY - size / 2, size, frame, true);
    }
  }
}

function findPieceById(board, pieceId) {
  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      if (board[row][col]?.id === pieceId) return board[row][col];
    }
  }
  return null;
}

export function drawPiece(ctx, metrics, piece, row, col, frame) {
  const { x, y, size } = squareRect(metrics, row, col);
  drawPieceAt(ctx, piece, x, y, size, frame, false);
}

function drawPieceAt(ctx, piece, x, y, size, frame, moving) {
  const theme = getTheme();
  const pieceStyle = getPieceStyle();
  const glyph = PIECE_GLYPHS[piece.color][piece.type];
  const pulse = Math.sin(frame / 16 + piece.id.length) * 0.5 + 0.5;
  const centerX = x + size / 2;
  const centerY = y + size / 2;
  const fontSize = Math.max(34, size * pieceStyle.sizeMultiplier);
  const colors = theme.pieces[piece.color];

  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `${fontSize}px ${pieceStyle.font}`;
  ctx.shadowBlur = moving ? 24 : 12 + pulse * 8;
  ctx.shadowColor = colors.glow;
  ctx.fillStyle = colors.fill;
  ctx.strokeStyle = colors.stroke;
  ctx.lineWidth = Math.max(1.25, size * 0.025);
  ctx.strokeText(glyph, centerX, centerY + size * 0.035);
  ctx.fillText(glyph, centerX, centerY + size * 0.035);

  if (piece.frozenTurns > 0) {
    ctx.fillStyle = "rgba(0, 229, 255, 0.72)";
    ctx.beginPath();
    ctx.arc(x + size * 0.78, y + size * 0.22, size * 0.085, 0, Math.PI * 2);
    ctx.fill();
  }

  // Colorblind indicator: circle for white, diamond for black
  const cbPalette = getColorblindPalette();
  if (cbPalette) {
    const markerSize = size * 0.08;
    const mx = x + size * 0.14;
    const my = y + size * 0.14;
    ctx.shadowBlur = 0;
    ctx.lineWidth = 1.5;
    if (piece.color === "white") {
      ctx.strokeStyle = cbPalette.white;
      ctx.fillStyle = cbPalette.white;
      ctx.beginPath();
      ctx.arc(mx, my, markerSize, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.strokeStyle = cbPalette.black;
      ctx.fillStyle = cbPalette.black;
      ctx.beginPath();
      ctx.moveTo(mx, my - markerSize);
      ctx.lineTo(mx + markerSize, my);
      ctx.lineTo(mx, my + markerSize);
      ctx.lineTo(mx - markerSize, my);
      ctx.closePath();
      ctx.fill();
    }
  }

  drawMutationBadges(ctx, piece, x, y, size);

  ctx.restore();
}

function drawMutationBadges(ctx, piece, x, y, size) {
  if (!piece.mutations.length) return;

  const radius = Math.max(3.5, size * 0.055);
  const gap = radius * 0.72;
  const startX = x + size - radius - size * 0.11;
  const startY = y + size - radius - size * 0.1;

  piece.mutations.slice(0, 4).forEach((mutationId, index) => {
    const mutation = MUTATION_DEFINITIONS[mutationId];
    if (!mutation) return;
    const row = Math.floor(index / 2);
    const col = index % 2;
    const cx = startX - col * (radius * 2 + gap);
    const cy = startY - row * (radius * 2 + gap);

    ctx.save();
    ctx.shadowColor = mutation.badgeColor;
    ctx.shadowBlur = 8;
    if (mutationId === "WILDCARD") {
      const gradient = ctx.createLinearGradient(cx - radius, cy - radius, cx + radius, cy + radius);
      gradient.addColorStop(0, "#00e5ff");
      gradient.addColorStop(0.34, "#f0c040");
      gradient.addColorStop(0.68, "#ff3b5c");
      gradient.addColorStop(1, "#39ff14");
      ctx.fillStyle = gradient;
    } else {
      ctx.fillStyle = mutation.badgeColor;
    }
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(8, 10, 16, 0.92)";
    ctx.stroke();
    ctx.restore();
  });
}

const PARTICLE_COUNT = 10;
const PARTICLE_COLORS = [
  "255, 59, 92",
  "240, 192, 64",
  "0, 229, 255",
];

function drawCaptureEffects(ctx, metrics, captures, now) {
  ctx.save();
  for (const capture of captures) {
    const age = now - capture.startedAt;
    const progress = Math.min(1, age / capture.duration);
    const { x, y, size } = squareRect(metrics, capture.row, capture.col);
    const cx = x + size / 2;
    const cy = y + size / 2;
    const alpha = 1 - progress;

    // Expanding ring
    ctx.strokeStyle = `rgba(255, 59, 92, ${alpha * 0.76})`;
    ctx.fillStyle = `rgba(255, 59, 92, ${alpha * 0.16})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, cy, size * (0.18 + progress * 0.5), 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Particle burst
    if (!capture.particles) {
      capture.particles = [];
      const seed = capture.row * 8 + capture.col;
      for (let i = 0; i < PARTICLE_COUNT; i += 1) {
        const angle = ((seed * 7 + i * 137.5) % 360) * (Math.PI / 180);
        const speed = 0.6 + ((seed * 3 + i * 17) % 50) / 100;
        const colorIdx = (seed + i) % PARTICLE_COLORS.length;
        capture.particles.push({ angle, speed, color: PARTICLE_COLORS[colorIdx] });
      }
    }

    for (const p of capture.particles) {
      const dist = size * progress * p.speed;
      const px = cx + Math.cos(p.angle) * dist;
      const py = cy + Math.sin(p.angle) * dist;
      const radius = Math.max(1.5, size * 0.04 * (1 - progress));
      ctx.fillStyle = `rgba(${p.color}, ${alpha * 0.9})`;
      ctx.beginPath();
      ctx.arc(px, py, radius, 0, Math.PI * 2);
      ctx.fill();
    }
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
