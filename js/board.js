const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];

export function createBoardMetrics(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const cssSize = Math.max(480, Math.floor(Math.min(rect.width, rect.height)));
  canvas.width = Math.floor(cssSize * dpr);
  canvas.height = Math.floor(cssSize * dpr);
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const padding = Math.max(28, Math.floor(cssSize * 0.052));
  const boardSize = cssSize - padding * 2;
  const squareSize = boardSize / 8;

  return {
    cssSize,
    padding,
    boardSize,
    squareSize,
    originX: padding,
    originY: padding,
  };
}

export function squareToNotation(row, col) {
  return `${FILES[col]}${8 - row}`;
}

export function notationToSquare(notation) {
  const file = notation?.[0]?.toLowerCase();
  const rank = Number(notation?.[1]);
  const col = FILES.indexOf(file);
  const row = 8 - rank;

  if (col < 0 || row < 0 || row > 7) {
    return null;
  }

  return { row, col };
}

export function pointToSquare(metrics, pointX, pointY) {
  const x = pointX - metrics.originX;
  const y = pointY - metrics.originY;

  if (x < 0 || y < 0 || x >= metrics.boardSize || y >= metrics.boardSize) {
    return null;
  }

  return {
    row: Math.floor(y / metrics.squareSize),
    col: Math.floor(x / metrics.squareSize),
  };
}

export function squareRect(metrics, row, col) {
  return {
    x: metrics.originX + col * metrics.squareSize,
    y: metrics.originY + row * metrics.squareSize,
    size: metrics.squareSize,
  };
}

export function drawBoard(ctx, metrics, frame, options = {}) {
  ctx.clearRect(0, 0, metrics.cssSize, metrics.cssSize);
  drawFrame(ctx, metrics, frame);

  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      drawSquare(ctx, metrics, row, col, frame);
    }
  }

  drawCoordinates(ctx, metrics);
  drawLastMove(ctx, metrics, options.lastMove);
  drawCheckHighlight(ctx, metrics, options.checkSquare, frame);
  drawSelection(ctx, metrics, options.selected, frame);
  drawValidMoves(ctx, metrics, options.validMoves || [], frame);
  drawTargeting(ctx, metrics, options.targetSquares || [], frame);
}

function drawCheckHighlight(ctx, metrics, square, frame) {
  if (!square) return;
  const { x, y, size } = squareRect(metrics, square.row, square.col);
  const pulse = Math.sin(frame / 6) * 0.5 + 0.5;
  ctx.save();
  const gradient = ctx.createRadialGradient(
    x + size / 2, y + size / 2, size * 0.15,
    x + size / 2, y + size / 2, size * 0.7
  );
  gradient.addColorStop(0, `rgba(255, 59, 92, ${0.55 + pulse * 0.2})`);
  gradient.addColorStop(1, "rgba(255, 59, 92, 0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(x, y, size, size);
  ctx.strokeStyle = `rgba(255, 59, 92, ${0.6 + pulse * 0.3})`;
  ctx.lineWidth = 3;
  ctx.strokeRect(x + 3, y + 3, size - 6, size - 6);
  ctx.restore();
}

function drawLastMove(ctx, metrics, lastMove) {
  if (!lastMove) return;
  ctx.save();
  ctx.fillStyle = "rgba(240, 192, 64, 0.18)";
  ctx.strokeStyle = "rgba(240, 192, 64, 0.45)";
  ctx.lineWidth = 2;
  for (const square of [lastMove.from, lastMove.to]) {
    const { x, y, size } = squareRect(metrics, square.row, square.col);
    ctx.fillRect(x, y, size, size);
    ctx.strokeRect(x + 2, y + 2, size - 4, size - 4);
  }
  ctx.restore();
}

function drawFrame(ctx, metrics, frame) {
  const pulse = Math.sin(frame / 34) * 0.5 + 0.5;
  const outer = metrics.originX - 16;
  const size = metrics.boardSize + 32;

  ctx.save();
  ctx.fillStyle = "#0a0b11";
  ctx.fillRect(0, 0, metrics.cssSize, metrics.cssSize);
  ctx.strokeStyle = `rgba(240, 192, 64, ${0.22 + pulse * 0.12})`;
  ctx.lineWidth = 2;
  roundRect(ctx, outer, outer, size, size, 8);
  ctx.stroke();

  ctx.strokeStyle = "rgba(0, 229, 255, 0.18)";
  ctx.lineWidth = 1;
  roundRect(ctx, metrics.originX - 8, metrics.originY - 8, metrics.boardSize + 16, metrics.boardSize + 16, 6);
  ctx.stroke();
  ctx.restore();
}

function drawSquare(ctx, metrics, row, col, frame) {
  const { x, y, size } = squareRect(metrics, row, col);
  const isLight = (row + col) % 2 === 0;
  const crackOffset = (row * 17 + col * 29 + frame * 0.22) % size;

  ctx.save();
  ctx.fillStyle = isLight ? "#27283a" : "#11131d";
  ctx.fillRect(x, y, size, size);

  const seamGradient = ctx.createLinearGradient(x, y, x + size, y + size);
  seamGradient.addColorStop(0, "rgba(0, 229, 255, 0)");
  seamGradient.addColorStop(0.48, isLight ? "rgba(240, 192, 64, 0.06)" : "rgba(0, 229, 255, 0.08)");
  seamGradient.addColorStop(1, "rgba(255, 59, 92, 0)");
  ctx.fillStyle = seamGradient;
  ctx.fillRect(x, y, size, size);

  ctx.strokeStyle = isLight ? "rgba(255, 255, 255, 0.025)" : "rgba(255, 255, 255, 0.018)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x + 8, y + crackOffset);
  ctx.lineTo(x + size * 0.42, y + size - crackOffset * 0.2);
  ctx.lineTo(x + size - 10, y + ((crackOffset * 0.7) % size));
  ctx.stroke();
  ctx.restore();
}

function drawCoordinates(ctx, metrics) {
  ctx.save();
  ctx.fillStyle = "rgba(201, 194, 223, 0.66)";
  ctx.font = '700 12px Inter, "Helvetica Neue", sans-serif';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  for (let index = 0; index < 8; index += 1) {
    const center = metrics.originX + index * metrics.squareSize + metrics.squareSize / 2;
    ctx.fillText(FILES[index], center, metrics.originY + metrics.boardSize + 17);
    ctx.fillText(String(8 - index), metrics.originX - 17, metrics.originY + index * metrics.squareSize + metrics.squareSize / 2);
  }

  ctx.restore();
}

function drawSelection(ctx, metrics, selected, frame) {
  if (!selected) return;
  const { x, y, size } = squareRect(metrics, selected.row, selected.col);
  const pulse = Math.sin(frame / 10) * 0.5 + 0.5;

  ctx.save();
  ctx.strokeStyle = `rgba(240, 192, 64, ${0.72 + pulse * 0.22})`;
  ctx.lineWidth = 4;
  ctx.shadowColor = "rgba(240, 192, 64, 0.62)";
  ctx.shadowBlur = 18;
  ctx.strokeRect(x + 5, y + 5, size - 10, size - 10);
  ctx.restore();
}

function drawValidMoves(ctx, metrics, moves, frame) {
  ctx.save();
  for (const move of moves) {
    const { x, y, size } = squareRect(metrics, move.row, move.col);
    const radius = Math.max(6, size * 0.12);
    const pulse = Math.sin(frame / 14 + move.row + move.col) * 0.5 + 0.5;
    ctx.fillStyle = `rgba(57, 255, 20, ${0.24 + pulse * 0.18})`;
    ctx.shadowColor = "rgba(57, 255, 20, 0.45)";
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.arc(x + size / 2, y + size / 2, radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawTargeting(ctx, metrics, squares, frame) {
  ctx.save();
  ctx.strokeStyle = `rgba(0, 229, 255, ${0.32 + (Math.sin(frame / 8) * 0.5 + 0.5) * 0.28})`;
  ctx.lineWidth = 2;

  for (const square of squares) {
    const { x, y, size } = squareRect(metrics, square.row, square.col);
    ctx.setLineDash([6, 6]);
    ctx.strokeRect(x + 8, y + 8, size - 16, size - 16);
  }

  ctx.restore();
}

function roundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}
