import { squareRect } from "./board.js";

export const TILE_DEFINITIONS = {
  LAVA: { id: "LAVA", name: "Lava", duration: 4 },
  ICE: { id: "ICE", name: "Ice", duration: 5 },
  PORTAL_A: { id: "PORTAL_A", name: "Portal A", duration: 6 },
  PORTAL_B: { id: "PORTAL_B", name: "Portal B", duration: 6 },
  GHOST_TILE: { id: "GHOST_TILE", name: "Ghost Zone", duration: 3, blocks: true },
  MINEFIELD: { id: "MINEFIELD", name: "Minefield", duration: null },
  AMPLIFIER: { id: "AMPLIFIER", name: "Amplifier", duration: 3 },
  VOID: { id: "VOID", name: "Void", duration: 5 },
  SWAP_ZONE: { id: "SWAP_ZONE", name: "Swap Zone", duration: 4 },
};

export function createTile(type, row, col, options = {}) {
  const definition = TILE_DEFINITIONS[type];
  if (!definition) {
    throw new Error(`Unknown tile type: ${type}`);
  }

  return {
    id: options.id || `${type.toLowerCase()}-${Date.now()}-${row}-${col}-${Math.random().toString(16).slice(2)}`,
    type,
    row,
    col,
    turnsLeft: options.turnsLeft ?? definition.duration,
    pairId: options.pairId || null,
    owner: options.owner || null,
    armed: options.armed ?? true,
    spawnedAt: options.spawnedAt || performanceNow(),
  };
}

export function spawnSpecialTile(state, type, row, col, options = {}) {
  const existingIndex = state.specialTiles.findIndex((tile) => tile.row === row && tile.col === col);
  if (existingIndex >= 0) {
    state.specialTiles.splice(existingIndex, 1);
  }

  const tile = createTile(type, row, col, options);
  state.specialTiles.push(tile);

  if (state.specialTiles.length > 6) {
    const removableIndex = state.specialTiles.findIndex((item) => item.turnsLeft !== null);
    if (removableIndex >= 0) {
      state.specialTiles.splice(removableIndex, 1);
    }
  }

  return tile;
}

export function spawnPortalPair(state, first, second) {
  const pairId = `portal-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const portalA = spawnSpecialTile(state, "PORTAL_A", first.row, first.col, { pairId });
  const portalB = spawnSpecialTile(state, "PORTAL_B", second.row, second.col, { pairId });
  return [portalA, portalB];
}

export function getTileAt(state, row, col, type = null) {
  return state.specialTiles.find((tile) => tile.row === row && tile.col === col && (!type || tile.type === type)) || null;
}

export function getTilesAt(state, row, col) {
  return state.specialTiles.filter((tile) => tile.row === row && tile.col === col);
}

export function isSquareBlockedByTile(state, row, col) {
  return getTilesAt(state, row, col).some((tile) => TILE_DEFINITIONS[tile.type]?.blocks);
}

export function ageTilesAfterFullRound(state) {
  const expired = [];
  for (const tile of state.specialTiles) {
    if (tile.turnsLeft === null) continue;
    tile.turnsLeft -= 1;
    if (tile.turnsLeft <= 0) {
      expired.push(tile);
    }
  }

  state.specialTiles = state.specialTiles.filter((tile) => tile.turnsLeft === null || tile.turnsLeft > 0);
  return expired;
}

export function removeTile(state, tileId) {
  const index = state.specialTiles.findIndex((tile) => tile.id === tileId);
  if (index < 0) return null;
  return state.specialTiles.splice(index, 1)[0];
}

export function drawTiles(ctx, metrics, tiles, frame) {
  for (const tile of tiles) {
    const { x, y, size } = squareRect(metrics, tile.row, tile.col);
    drawTile(ctx, tile, x, y, size, frame);
  }
}

function drawTile(ctx, tile, x, y, size, frame) {
  const pulse = Math.sin(frame / 12 + tile.row + tile.col) * 0.5 + 0.5;
  ctx.save();
  ctx.globalAlpha = 0.92;

  if (tile.type === "LAVA") drawLava(ctx, x, y, size, pulse, frame);
  if (tile.type === "ICE") drawIce(ctx, x, y, size, pulse, frame);
  if (tile.type === "PORTAL_A" || tile.type === "PORTAL_B") drawPortal(ctx, x, y, size, pulse, frame, tile.type);
  if (tile.type === "GHOST_TILE") drawGhost(ctx, x, y, size, pulse);
  if (tile.type === "MINEFIELD") drawMine(ctx, x, y, size, pulse);
  if (tile.type === "AMPLIFIER") drawAmplifier(ctx, x, y, size, pulse);
  if (tile.type === "VOID") drawVoid(ctx, x, y, size, pulse, frame);
  if (tile.type === "SWAP_ZONE") drawSwap(ctx, x, y, size, pulse, frame);

  if (tile.turnsLeft !== null && tile.turnsLeft <= 1) {
    ctx.fillStyle = `rgba(255, 255, 255, ${0.1 + pulse * 0.12})`;
    ctx.fillRect(x, y, size, size);
  }

  ctx.restore();
}

function drawLava(ctx, x, y, size, pulse, frame) {
  const gradient = ctx.createRadialGradient(x + size * 0.5, y + size * 0.5, size * 0.08, x + size * 0.5, y + size * 0.5, size * 0.65);
  gradient.addColorStop(0, `rgba(255, 138, 42, ${0.3 + pulse * 0.32})`);
  gradient.addColorStop(0.55, "rgba(255, 59, 92, 0.24)");
  gradient.addColorStop(1, "rgba(120, 20, 10, 0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(x, y, size, size);

  ctx.strokeStyle = "rgba(255, 138, 42, 0.62)";
  ctx.lineWidth = 2;
  for (let index = 0; index < 3; index += 1) {
    const offset = ((frame * 0.7 + index * 17) % size) / size;
    ctx.beginPath();
    ctx.moveTo(x + size * (0.22 + index * 0.24), y + size * 0.18);
    ctx.lineTo(x + size * (0.18 + index * 0.24), y + size * (0.34 + offset * 0.34));
    ctx.stroke();
  }
}

function drawIce(ctx, x, y, size, pulse, frame) {
  const shimmer = ((frame % 80) / 80) * size;
  ctx.fillStyle = `rgba(0, 229, 255, ${0.1 + pulse * 0.18})`;
  ctx.fillRect(x, y, size, size);
  const gradient = ctx.createLinearGradient(x + shimmer - size, y, x + shimmer, y + size);
  gradient.addColorStop(0, "rgba(255, 255, 255, 0)");
  gradient.addColorStop(0.5, "rgba(255, 255, 255, 0.28)");
  gradient.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(x, y, size, size);
  ctx.strokeStyle = "rgba(190, 245, 255, 0.7)";
  ctx.beginPath();
  ctx.moveTo(x + size * 0.5, y + size * 0.24);
  ctx.lineTo(x + size * 0.5, y + size * 0.76);
  ctx.moveTo(x + size * 0.26, y + size * 0.5);
  ctx.lineTo(x + size * 0.74, y + size * 0.5);
  ctx.stroke();
}

function drawPortal(ctx, x, y, size, pulse, frame, type) {
  ctx.translate(x + size / 2, y + size / 2);
  ctx.rotate((frame / 34) * (type === "PORTAL_A" ? 1 : -1));
  ctx.strokeStyle = type === "PORTAL_A" ? "rgba(192, 38, 211, 0.72)" : "rgba(0, 229, 255, 0.72)";
  ctx.lineWidth = 3;
  for (let radius = size * 0.16; radius < size * 0.42; radius += size * 0.1) {
    ctx.beginPath();
    ctx.arc(0, 0, radius + pulse * 3, 0.4, Math.PI * 1.72);
    ctx.stroke();
  }
}

function drawGhost(ctx, x, y, size, pulse) {
  ctx.fillStyle = `rgba(229, 231, 235, ${0.1 + pulse * 0.14})`;
  ctx.fillRect(x, y, size, size);
  ctx.fillStyle = "rgba(244, 239, 255, 0.34)";
  ctx.font = `${size * 0.52}px Georgia, serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("♙", x + size / 2, y + size * 0.55);
}

function drawMine(ctx, x, y, size, pulse) {
  ctx.fillStyle = `rgba(255, 59, 92, ${0.08 + pulse * 0.08})`;
  ctx.fillRect(x, y, size, size);
  ctx.fillStyle = "rgba(255, 59, 92, 0.78)";
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size * 0.08, 0, Math.PI * 2);
  ctx.fill();
}

function drawAmplifier(ctx, x, y, size, pulse) {
  ctx.fillStyle = `rgba(240, 192, 64, ${0.1 + pulse * 0.18})`;
  ctx.fillRect(x, y, size, size);
  ctx.fillStyle = "rgba(240, 192, 64, 0.85)";
  drawStar(ctx, x + size / 2, y + size / 2, size * 0.23, size * 0.1, 5);
}

function drawVoid(ctx, x, y, size, pulse, frame) {
  ctx.fillStyle = "rgba(0, 0, 0, 0.76)";
  ctx.fillRect(x, y, size, size);
  ctx.fillStyle = "rgba(255, 255, 255, 0.72)";
  for (let index = 0; index < 7; index += 1) {
    const px = x + ((index * 23 + frame * 0.25) % size);
    const py = y + ((index * 31 + frame * 0.14) % size);
    ctx.fillRect(px, py, 1.5 + pulse, 1.5 + pulse);
  }
}

function drawSwap(ctx, x, y, size, pulse, frame) {
  ctx.fillStyle = `rgba(41, 211, 180, ${0.08 + pulse * 0.14})`;
  ctx.fillRect(x, y, size, size);
  ctx.save();
  ctx.translate(x + size / 2, y + size / 2);
  ctx.rotate(frame / 26);
  ctx.strokeStyle = "rgba(41, 211, 180, 0.78)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(0, 0, size * 0.22, 0, Math.PI * 1.35);
  ctx.stroke();
  ctx.rotate(Math.PI);
  ctx.beginPath();
  ctx.arc(0, 0, size * 0.22, 0, Math.PI * 1.35);
  ctx.stroke();
  ctx.restore();
}

function drawStar(ctx, cx, cy, outer, inner, points) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i += 1) {
    const radius = i % 2 === 0 ? outer : inner;
    const angle = -Math.PI / 2 + (i * Math.PI) / points;
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
}

function performanceNow() {
  return typeof performance === "undefined" ? Date.now() : performance.now();
}
