/**
 * Visual Effects module — screen juice, particles, and animations.
 * Manages a stack of active visual effects rendered each frame.
 */

import { squareRect } from "./board.js";
import { isReducedMotion } from "./accessibility.js";

const activeEffects = [];

export function addEffect(effect) {
  if (isReducedMotion()) return; // Skip visual effects in reduced motion mode
  activeEffects.push({ ...effect, startedAt: performance.now() });
}

export function drawEffects(ctx, metrics, now) {
  for (let i = activeEffects.length - 1; i >= 0; i--) {
    const effect = activeEffects[i];
    const age = now - effect.startedAt;
    const progress = Math.min(1, age / effect.duration);

    if (progress >= 1) {
      activeEffects.splice(i, 1);
      continue;
    }

    const renderer = EFFECT_RENDERERS[effect.type];
    if (renderer) renderer(ctx, metrics, effect, progress, now);
  }
}

export function clearEffects() {
  activeEffects.length = 0;
}

// ── Effect triggers ──

export function triggerCheckFlash(kingRow, kingCol) {
  addEffect({
    type: "checkFlash",
    row: kingRow,
    col: kingCol,
    duration: 600,
  });
}

export function triggerMutationGlow(row, col, color) {
  addEffect({
    type: "mutationGlow",
    row,
    col,
    color,
    duration: 900,
  });
}

export function triggerCardFlash() {
  addEffect({
    type: "cardFlash",
    duration: 400,
  });
}

export function triggerChaosWave() {
  addEffect({
    type: "chaosWave",
    duration: 1200,
  });
}

export function triggerMoveTrail(fromRow, fromCol, toRow, toCol, color) {
  addEffect({
    type: "moveTrail",
    fromRow,
    fromCol,
    toRow,
    toCol,
    color,
    duration: 500,
  });
}

export function triggerTileSpawn(row, col, tileType) {
  addEffect({
    type: "tileSpawn",
    row,
    col,
    tileType,
    duration: 700,
  });
}

// ── Renderers ──

const EFFECT_RENDERERS = {
  checkFlash(ctx, metrics, effect, progress) {
    const { x, y, size } = squareRect(metrics, effect.row, effect.col);
    const alpha = (1 - progress) * 0.6;
    const expand = progress * size * 0.3;

    ctx.save();
    ctx.globalCompositeOperation = "screen";

    // Expanding red ring
    ctx.strokeStyle = `rgba(255, 59, 92, ${alpha})`;
    ctx.lineWidth = 4 * (1 - progress);
    ctx.beginPath();
    ctx.arc(x + size / 2, y + size / 2, size * 0.3 + expand, 0, Math.PI * 2);
    ctx.stroke();

    // Inner flash
    const gradient = ctx.createRadialGradient(
      x + size / 2, y + size / 2, 0,
      x + size / 2, y + size / 2, size * 0.5
    );
    gradient.addColorStop(0, `rgba(255, 59, 92, ${alpha * 0.5})`);
    gradient.addColorStop(1, "rgba(255, 59, 92, 0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(x - expand, y - expand, size + expand * 2, size + expand * 2);

    ctx.restore();
  },

  mutationGlow(ctx, metrics, effect, progress) {
    const { x, y, size } = squareRect(metrics, effect.row, effect.col);
    const alpha = (1 - progress) * 0.7;
    const pulse = Math.sin(progress * Math.PI * 3) * 0.3 + 0.7;
    const radius = size * 0.4 * pulse + size * 0.2 * progress;

    ctx.save();
    ctx.globalCompositeOperation = "screen";

    // Spiraling particles
    const particleCount = 8;
    for (let i = 0; i < particleCount; i++) {
      const angle = (i / particleCount) * Math.PI * 2 + progress * Math.PI * 4;
      const dist = radius * (0.5 + progress * 0.5);
      const px = x + size / 2 + Math.cos(angle) * dist;
      const py = y + size / 2 + Math.sin(angle) * dist;
      const pSize = 3 * (1 - progress);

      ctx.fillStyle = `rgba(192, 38, 211, ${alpha * pulse})`;
      ctx.beginPath();
      ctx.arc(px, py, pSize, 0, Math.PI * 2);
      ctx.fill();
    }

    // Central glow
    const gradient = ctx.createRadialGradient(
      x + size / 2, y + size / 2, 0,
      x + size / 2, y + size / 2, radius
    );
    gradient.addColorStop(0, `rgba(192, 38, 211, ${alpha * 0.4})`);
    gradient.addColorStop(1, "rgba(192, 38, 211, 0)");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x + size / 2, y + size / 2, radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  },

  cardFlash(ctx, metrics, effect, progress) {
    const alpha = (1 - progress) * 0.15;
    const boardSize = metrics.boardSize;

    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.fillStyle = `rgba(0, 229, 255, ${alpha})`;
    ctx.fillRect(metrics.originX, metrics.originY, boardSize, boardSize);
    ctx.restore();
  },

  chaosWave(ctx, metrics, effect, progress) {
    const cx = metrics.originX + metrics.boardSize / 2;
    const cy = metrics.originY + metrics.boardSize / 2;
    const maxRadius = metrics.boardSize * 0.8;
    const alpha = (1 - progress) * 0.4;

    ctx.save();
    ctx.globalCompositeOperation = "screen";

    // Multiple expanding rings
    for (let ring = 0; ring < 3; ring++) {
      const ringProgress = Math.max(0, progress - ring * 0.15);
      if (ringProgress <= 0) continue;
      const radius = maxRadius * ringProgress;
      const ringAlpha = alpha * (1 - ringProgress);

      ctx.strokeStyle = `rgba(255, 59, 92, ${ringAlpha})`;
      ctx.lineWidth = 3 * (1 - ringProgress);
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Color flash overlay
    if (progress < 0.3) {
      const flashAlpha = (1 - progress / 0.3) * 0.12;
      ctx.fillStyle = `rgba(255, 59, 92, ${flashAlpha})`;
      ctx.fillRect(metrics.originX, metrics.originY, metrics.boardSize, metrics.boardSize);
    }

    ctx.restore();
  },

  moveTrail(ctx, metrics, effect, progress) {
    const from = squareRect(metrics, effect.fromRow, effect.fromCol);
    const to = squareRect(metrics, effect.toRow, effect.toCol);
    const alpha = (1 - progress) * 0.5;
    const isWhite = effect.color === "white";
    const trailColor = isWhite ? "240, 192, 64" : "0, 229, 255";

    ctx.save();
    ctx.globalCompositeOperation = "screen";

    // Trail dots along the path
    const dotCount = 6;
    for (let i = 0; i < dotCount; i++) {
      const t = (i / dotCount) * progress;
      const px = from.x + from.size / 2 + (to.x - from.x + to.size / 2 - from.size / 2) * t;
      const py = from.y + from.size / 2 + (to.y - from.y + to.size / 2 - from.size / 2) * t;
      const dotAlpha = alpha * (1 - i / dotCount) * (1 - progress);
      const dotSize = 3 * (1 - progress) * (1 - i / dotCount);

      ctx.fillStyle = `rgba(${trailColor}, ${dotAlpha})`;
      ctx.beginPath();
      ctx.arc(px, py, dotSize, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  },

  tileSpawn(ctx, metrics, effect, progress) {
    const { x, y, size } = squareRect(metrics, effect.row, effect.col);
    const alpha = progress < 0.5 ? progress * 2 : (1 - progress) * 2;
    const scale = 0.5 + progress * 0.5;
    const cx = x + size / 2;
    const cy = y + size / 2;

    ctx.save();
    ctx.globalCompositeOperation = "screen";

    // Expanding diamond shape
    const halfSize = size * 0.4 * scale;
    ctx.strokeStyle = `rgba(0, 229, 255, ${alpha * 0.6})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy - halfSize);
    ctx.lineTo(cx + halfSize, cy);
    ctx.lineTo(cx, cy + halfSize);
    ctx.lineTo(cx - halfSize, cy);
    ctx.closePath();
    ctx.stroke();

    // Corner sparks
    const sparkDist = halfSize * 1.3;
    for (let i = 0; i < 4; i++) {
      const angle = (i * Math.PI / 2) + progress * Math.PI;
      const sx = cx + Math.cos(angle) * sparkDist;
      const sy = cy + Math.sin(angle) * sparkDist;
      ctx.fillStyle = `rgba(57, 255, 20, ${alpha * 0.5})`;
      ctx.beginPath();
      ctx.arc(sx, sy, 2 * (1 - progress), 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  },
};
