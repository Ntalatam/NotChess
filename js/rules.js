import { notationToSquare, squareToNotation } from "./board.js";
import { Chess } from "../vendor/chess.js";
import {
  clonePiece,
  createPiece,
  findPiecePosition,
  getPieceAt,
  pieceLabel,
  PIECE_TYPES,
} from "./pieces.js";
import { CONFIG, addLog } from "./state.js";
import {
  ageTilesAfterFullRound,
  getTileAt,
  getTilesAt,
  isSquareBlockedByTile,
  removeTile,
} from "./tiles.js";
import {
  grantMutation,
  grantRandomMutation,
  hasMutation,
  MUTATION_DEFINITIONS,
  removeMutation,
} from "./mutations.js";

const CHESS_TO_APP_COLOR = {
  w: "white",
  b: "black",
};

const APP_TO_CHESS_COLOR = {
  white: "w",
  black: "b",
};

const SLIDING_DIRECTIONS = {
  b: [
    [-1, -1],
    [-1, 1],
    [1, -1],
    [1, 1],
  ],
  r: [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ],
  q: [
    [-1, -1],
    [-1, 1],
    [1, -1],
    [1, 1],
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ],
};

const KNIGHT_DELTAS = [
  [-2, -1],
  [-2, 1],
  [-1, -2],
  [-1, 2],
  [1, -2],
  [1, 2],
  [2, -1],
  [2, 1],
];

const KING_DELTAS = [
  [-1, -1],
  [-1, 0],
  [-1, 1],
  [0, -1],
  [0, 1],
  [1, -1],
  [1, 0],
  [1, 1],
];

export function getLegalMoves(state, pieceId) {
  const position = findPiecePosition(state.board, pieceId);
  if (!position) return [];
  const piece = getPieceAt(state.board, position.row, position.col);
  if (!piece || piece.color !== state.turn || state.gameOver) return [];

  const square = squareToNotation(position.row, position.col);
  const baselineMoves = state.chess
    .moves({ square, verbose: true })
    .map((move) => moveToTarget(move, piece.id))
    .filter((move) => move.color === piece.color);

  const mutationMoves = getMutationMoves(state, piece, position, baselineMoves);
  const tileMoves = getAmplifierMoves(state, piece, position);
  const combined = mergeMoves([...baselineMoves, ...mutationMoves, ...tileMoves]);
  return filterMagneto(state, piece, position, combined)
    .filter((move) => !isSquareBlockedByTile(state, move.row, move.col))
    .filter((move) => isMoveSafe(state, piece, position, move));
}

export function getDisplayMoves(moves) {
  const seen = new Set();
  const display = [];

  for (const move of moves) {
    const key = `${move.row}:${move.col}`;
    if (seen.has(key)) continue;
    seen.add(key);
    display.push(move);
  }

  return display;
}

export function getPromotionChoices(moves, row, col) {
  return moves
    .filter((move) => move.row === row && move.col === col && move.promotion)
    .map((move) => move.promotion);
}

export function moveFromNotation(state, from, to, promotion = undefined) {
  const fromSquare = notationToSquare(from);
  const toSquare = notationToSquare(to);
  if (!fromSquare || !toSquare) {
    throw new Error(`Invalid square in move ${from}-${to}`);
  }
  return requestMove(state, fromSquare, toSquare, promotion);
}

export function requestMove(state, from, to, promotion = undefined) {
  const movingPiece = getPieceAt(state.board, from.row, from.col);
  if (!movingPiece || movingPiece.color !== state.turn || state.gameOver) {
    return null;
  }

  const legalMoves = getLegalMoves(state, movingPiece.id);
  const selectedMove = legalMoves.find((move) => move.row === to.row && move.col === to.col && (!move.promotion || move.promotion === promotion));
  if (!selectedMove) return null;

  if (selectedMove.special === "clone") {
    return activateClone(state, movingPiece, from, to);
  }

  if (selectedMove.wacko) {
    return requestWackoMove(state, movingPiece, from, to, selectedMove);
  }

  return requestStandardMove(state, from, to, promotion);
}

export function requestStandardMove(state, from, to, promotion = undefined) {
  const movingPiece = getPieceAt(state.board, from.row, from.col);
  if (!movingPiece || movingPiece.color !== state.turn || state.gameOver) {
    return null;
  }

  const targetPiece = getPieceAt(state.board, to.row, to.col);
  if (targetPiece && targetPiece.color !== movingPiece.color && hasMutation(targetPiece, "SHIELD")) {
    return blockCaptureWithShield(state, movingPiece, targetPiece, from, to);
  }

  const moveRequest = {
    from: squareToNotation(from.row, from.col),
    to: squareToNotation(to.row, to.col),
  };
  if (promotion) {
    moveRequest.promotion = promotion;
  }

  let move;
  try {
    move = state.chess.move(moveRequest);
  } catch {
    return null;
  }

  const boardResult = applyStandardMoveToBoard(state, move);
  afterSuccessfulMove(state, boardResult, move.san);

  return {
    move,
    ...boardResult,
  };
}

export function updateGameStatus(state) {
  let chessStatus;
  try {
    chessStatus = {
      check: state.chess.isCheck(),
      checkmate: state.chess.isCheckmate(),
      stalemate: state.chess.isStalemate(),
      draw: state.chess.isDraw(),
      gameOver: state.chess.isGameOver(),
      insufficient: state.chess.isInsufficientMaterial(),
    };
  } catch {
    chessStatus = {
      check: false,
      checkmate: false,
      stalemate: false,
      draw: false,
      gameOver: false,
      insufficient: false,
    };
  }

  state.check = chessStatus.check;
  state.checkmate = chessStatus.checkmate;
  state.stalemate = chessStatus.stalemate;
  state.draw = chessStatus.draw;
  state.gameOver = chessStatus.gameOver || Boolean(state.wackoGameOver);
  state.winner = null;
  state.gameOverReason = "";

  if (state.wackoGameOver) {
    state.winner = state.wackoGameOver.winner;
    state.gameOverReason = state.wackoGameOver.reason;
  } else if (state.checkmate) {
    state.winner = oppositeColor(state.turn);
    state.gameOverReason = `Checkmate - ${capitalize(state.winner)} wins`;
  } else if (state.stalemate) {
    state.gameOverReason = "Stalemate";
  } else if (chessStatus.insufficient) {
    state.gameOverReason = "Draw by insufficient material";
  } else if (state.draw) {
    state.gameOverReason = "Draw";
  }
}

export function isPlayersPiece(state, row, col) {
  return getPieceAt(state.board, row, col)?.color === state.turn;
}

export function oppositeColor(color) {
  return color === "white" ? "black" : "white";
}

export function appColorToChess(color) {
  return APP_TO_CHESS_COLOR[color];
}

export function syncChessToBoard(state, turn = state.turn) {
  state.chess.load(boardToFen(state, turn), { skipValidation: true });
}

export function boardToFen(state, turn = state.turn) {
  const rows = state.board.map((rank) => {
    let empty = 0;
    let text = "";

    for (const piece of rank) {
      if (!piece) {
        empty += 1;
        continue;
      }

      if (empty) {
        text += String(empty);
        empty = 0;
      }

      const letter = piece.color === "white" ? piece.type.toUpperCase() : piece.type;
      text += letter;
    }

    return text + (empty ? String(empty) : "");
  });

  return `${rows.join("/")} ${APP_TO_CHESS_COLOR[turn]} - - 0 ${state.turnCount}`;
}

export function grantMutationToPiece(state, pieceId, mutationId) {
  const position = findPiecePosition(state.board, pieceId);
  if (!position) return false;
  const piece = getPieceAt(state.board, position.row, position.col);
  const granted = grantMutation(piece, mutationId);
  if (granted) {
    state.mutationStats.total += 1;
    state.mutationStats.mostOnPiece = Math.max(state.mutationStats.mostOnPiece, piece.mutations.length);
    addLog(state, `${pieceLabel(piece)} gained ${MUTATION_DEFINITIONS[mutationId].name}.`);
  }
  return granted;
}

function requestWackoMove(state, movingPiece, from, to, selectedMove) {
  const targetPiece = getPieceAt(state.board, to.row, to.col);
  if (targetPiece && targetPiece.color !== movingPiece.color && hasMutation(targetPiece, "SHIELD")) {
    return blockCaptureWithShield(state, movingPiece, targetPiece, from, to);
  }

  const captured = targetPiece ? clonePiece(targetPiece) : null;
  state.board[from.row][from.col] = null;
  state.board[to.row][to.col] = movingPiece;
  movingPiece.hasMoved = true;

  if (captured) {
    state.capturedPieces[movingPiece.color].push(captured);
  }

  syncChessToBoard(state, oppositeColor(state.turn));
  const san = selectedMove.special === "friendly-capture" ? `${squareToNotation(from.row, from.col)}x${squareToNotation(to.row, to.col)}` : selectedMove.san;
  const result = { movingPiece, captured, from, to, move: { san } };
  afterSuccessfulMove(state, result, san);
  return result;
}

function activateClone(state, piece, from, to) {
  const clone = createPiece(piece.color, piece.type);
  clone.id = `${piece.id}-clone`;
  clone.mutations = piece.mutations.filter((mutationId) => mutationId !== "CLONER");
  clone.hasMoved = true;
  clone.promoted = piece.promoted;
  state.board[to.row][to.col] = clone;
  piece.clonerUsed = true;

  syncChessToBoard(state, oppositeColor(state.turn));
  const result = {
    movingPiece: piece,
    captured: null,
    from,
    to,
    move: { san: `Clone@${squareToNotation(to.row, to.col)}` },
    clonedPiece: clone,
  };
  afterSuccessfulMove(state, result, result.move.san, false);
  addLog(state, `${pieceLabel(piece)} split into ${squareToNotation(to.row, to.col)}.`);
  return result;
}

function afterSuccessfulMove(state, boardResult, san, allowMutation = true) {
  if (boardResult.captured) {
    resolveCapturedMutationHooks(state, boardResult);
    if (allowMutation && state.rng() < CONFIG.mutationChance) {
      const mutation = grantRandomMutation(state, boardResult.movingPiece);
      if (mutation) {
        boardResult.gainedMutation = mutation;
        addLog(state, `${pieceLabel(boardResult.movingPiece)} gained ${mutation.name}.`);
      }
    }
  }

  resolvePostMoveTiles(state, boardResult);
  state.turn = CHESS_TO_APP_COLOR[state.chess.turn()];
  state.turnCount = state.chess.moveNumber();
  state.selected = null;
  state.validMoves = [];
  state.targetSquares = [];
  state.pendingPromotion = null;
  state.wildcardRolls = {};
  updateGameStatus(state);
  if (state.turn === "white") {
    const expired = ageTilesAfterFullRound(state);
    for (const tile of expired) {
      addLog(state, `${tileName(tile)} dissolved.`);
    }
  }

  const captureText = boardResult.captured ? ` captures ${pieceLabel(boardResult.captured)}` : "";
  addLog(state, `${pieceLabel(boardResult.movingPiece)} ${san}${captureText}.`);
}

function resolvePostMoveTiles(state, boardResult) {
  let current = boardResult.to;
  let guard = 0;
  const usedPortals = new Set();

  while (guard < 5) {
    guard += 1;
    const piece = getPieceAt(state.board, current.row, current.col);
    if (!piece) return;

    const tiles = getTilesAt(state, current.row, current.col);
    if (!tiles.length) return;

    const mine = tiles.find((tile) => tile.type === "MINEFIELD");
    if (mine) {
      detonateMine(state, mine, current);
      return;
    }

    const lethal = tiles.find((tile) => tile.type === "LAVA" || tile.type === "VOID");
    if (lethal) {
      destroyPieceAt(state, current.row, current.col, lethal.type === "LAVA" ? "burned in Lava" : "fell into the Void");
      syncChessToBoard(state, CHESS_TO_APP_COLOR[state.chess.turn()]);
      return;
    }

    const ice = tiles.find((tile) => tile.type === "ICE");
    if (ice) {
      const next = getIceSlideTarget(state, boardResult.from, current);
      if (next) {
        state.board[next.row][next.col] = piece;
        state.board[current.row][current.col] = null;
        addLog(state, `${pieceLabel(piece)} slid to ${squareToNotation(next.row, next.col)}.`);
        boardResult.to = next;
        current = next;
        syncChessToBoard(state, CHESS_TO_APP_COLOR[state.chess.turn()]);
        continue;
      }
    }

    const portal = tiles.find((tile) => tile.type === "PORTAL_A" || tile.type === "PORTAL_B");
    if (portal && !usedPortals.has(portal.id)) {
      usedPortals.add(portal.id);
      const exit = getPortalExit(state, portal);
      if (exit && !getPieceAt(state.board, exit.row, exit.col)) {
        usedPortals.add(exit.id);
        state.board[exit.row][exit.col] = piece;
        state.board[current.row][current.col] = null;
        addLog(state, `${pieceLabel(piece)} warped to ${squareToNotation(exit.row, exit.col)}.`);
        boardResult.to = { row: exit.row, col: exit.col };
        current = boardResult.to;
        syncChessToBoard(state, CHESS_TO_APP_COLOR[state.chess.turn()]);
        continue;
      }
    }

    const swapZone = tiles.find((tile) => tile.type === "SWAP_ZONE");
    if (swapZone) {
      resolveSwapZone(state, swapZone, piece);
    }

    return;
  }
}

function getIceSlideTarget(state, from, current) {
  const deltaRow = Math.sign(current.row - from.row);
  const deltaCol = Math.sign(current.col - from.col);
  if (deltaRow === 0 && deltaCol === 0) return null;
  const row = current.row + deltaRow;
  const col = current.col + deltaCol;
  if (!isInside(row, col) || getPieceAt(state.board, row, col) || isSquareBlockedByTile(state, row, col)) return null;
  return { row, col };
}

function getPortalExit(state, portal) {
  if (!portal.pairId) return null;
  return state.specialTiles.find((tile) => tile.pairId === portal.pairId && tile.id !== portal.id) || null;
}

function detonateMine(state, mine, center) {
  removeTile(state, mine.id);
  destroyPieceAt(state, center.row, center.col, "triggered a Minefield");
  explodeFrom(state, center.row, center.col, null, new Set());
  syncChessToBoard(state, CHESS_TO_APP_COLOR[state.chess.turn()]);
}

function destroyPieceAt(state, row, col, reason) {
  const piece = getPieceAt(state.board, row, col);
  if (!piece) return null;
  state.board[row][col] = null;
  addLog(state, `${pieceLabel(piece)} ${reason}.`);
  if (piece.type === "k") {
    state.wackoGameOver = {
      winner: oppositeColor(piece.color),
      reason: `${capitalize(piece.color)} King ${reason}`,
    };
  }
  return piece;
}

function resolveSwapZone(state, tile, piece) {
  const entry = state.swapZoneEntries[tile.id];
  const currentEntry = {
    pieceId: piece.id,
    color: piece.color,
    turnCount: state.turnCount,
  };

  if (!entry || entry.turnCount !== state.turnCount || entry.color === piece.color) {
    state.swapZoneEntries[tile.id] = currentEntry;
    return;
  }

  const otherPosition = findPiecePosition(state.board, entry.pieceId);
  if (!otherPosition) {
    state.swapZoneEntries[tile.id] = currentEntry;
    return;
  }

  const otherPiece = getPieceAt(state.board, otherPosition.row, otherPosition.col);
  if (!otherPiece || otherPiece.color === piece.color) {
    state.swapZoneEntries[tile.id] = currentEntry;
    return;
  }

  const pieceColor = piece.color;
  piece.color = otherPiece.color;
  otherPiece.color = pieceColor;
  addLog(state, `${pieceLabel(piece)} and ${pieceLabel(otherPiece)} swapped ownership.`);
  state.swapZoneEntries[tile.id] = currentEntry;
  syncChessToBoard(state, CHESS_TO_APP_COLOR[state.chess.turn()]);
}

function blockCaptureWithShield(state, movingPiece, targetPiece, from, to) {
  removeMutation(targetPiece, "SHIELD");
  state.selected = null;
  state.validMoves = [];
  state.targetSquares = [];
  state.pendingPromotion = null;
  syncChessToBoard(state, oppositeColor(state.turn));
  state.turn = oppositeColor(state.turn);
  state.turnCount = state.chess.moveNumber();
  updateGameStatus(state);
  addLog(state, `${pieceLabel(targetPiece)}'s shield blocked ${pieceLabel(movingPiece)}.`);
  return {
    move: { san: "Shield" },
    movingPiece,
    captured: null,
    from,
    to,
    shieldBlocked: true,
  };
}

function applyStandardMoveToBoard(state, move) {
  const from = notationToSquare(move.from);
  const to = notationToSquare(move.to);
  const movingPiece = getPieceAt(state.board, from.row, from.col);
  let captured = null;

  if (move.isEnPassant()) {
    captured = state.board[from.row][to.col];
    state.board[from.row][to.col] = null;
  } else {
    captured = state.board[to.row][to.col];
  }

  state.board[from.row][from.col] = null;
  state.board[to.row][to.col] = movingPiece;
  movingPiece.hasMoved = true;

  if (move.isPromotion()) {
    movingPiece.type = move.promotion;
    movingPiece.promoted = true;
  }

  if (move.isKingsideCastle() || move.isQueensideCastle()) {
    const row = from.row;
    const rookFromCol = move.isKingsideCastle() ? 7 : 0;
    const rookToCol = move.isKingsideCastle() ? 5 : 3;
    const rook = state.board[row][rookFromCol];
    state.board[row][rookFromCol] = null;
    state.board[row][rookToCol] = rook;
    if (rook) rook.hasMoved = true;
  }

  if (captured) {
    state.capturedPieces[movingPiece.color].push(clonePiece(captured));
  }

  return {
    movingPiece,
    captured: captured ? clonePiece(captured) : null,
    from,
    to,
  };
}

function resolveCapturedMutationHooks(state, boardResult) {
  const captured = boardResult.captured;
  if (!captured) return;

  if (hasMutation(captured, "HAUNTED")) {
    state.specialTiles.push({
      id: `ghost-${Date.now()}-${boardResult.to.row}-${boardResult.to.col}`,
      row: boardResult.to.row,
      col: boardResult.to.col,
      type: "GHOST_TILE",
      turnsLeft: 3,
      source: "HAUNTED",
    });
    addLog(state, "A haunted piece left a Ghost Tile.");
  }

  if (hasMutation(captured, "EXPLOSIVE")) {
    explodeFrom(state, boardResult.to.row, boardResult.to.col, captured.color, new Set([captured.id]));
  }

  if (hasMutation(captured, "TITAN")) {
    state.wackoGameOver = {
      winner: boardResult.movingPiece.color,
      reason: `${capitalize(boardResult.movingPiece.color)} shattered a Titan`,
    };
  }
}

function explodeFrom(state, row, col, sourceColor, visited) {
  for (let nextRow = row - 1; nextRow <= row + 1; nextRow += 1) {
    for (let nextCol = col - 1; nextCol <= col + 1; nextCol += 1) {
      if (!isInside(nextRow, nextCol) || (nextRow === row && nextCol === col)) continue;
      const piece = state.board[nextRow][nextCol];
      if (!piece) continue;

      state.board[nextRow][nextCol] = null;
      addLog(state, `${pieceLabel(piece)} was caught in the blast.`);

      if (piece.type === "k") {
        state.wackoGameOver = {
          winner: oppositeColor(piece.color),
          reason: `${capitalize(piece.color)} King was destroyed`,
        };
      }

      if (hasMutation(piece, "HAUNTED")) {
        state.specialTiles.push({
          id: `ghost-${Date.now()}-${nextRow}-${nextCol}`,
          row: nextRow,
          col: nextCol,
          type: "GHOST_TILE",
          turnsLeft: 3,
          source: "HAUNTED",
        });
      }

      if (hasMutation(piece, "EXPLOSIVE") && !visited.has(piece.id)) {
        visited.add(piece.id);
        explodeFrom(state, nextRow, nextCol, sourceColor, visited);
      }
    }
  }
  syncChessToBoard(state, oppositeColor(state.turn));
}

function getMutationMoves(state, piece, position, baselineMoves) {
  const moves = [];

  if ((hasMutation(piece, "JUMPER") || hasMutation(piece, "GHOST")) && SLIDING_DIRECTIONS[piece.type]) {
    moves.push(...getPhaseMoves(state, piece, position));
  }

  if (hasMutation(piece, "BERSERKER")) {
    moves.push(...getFriendlyCaptures(state, piece, position));
  }

  if (hasMutation(piece, "REVERSO")) {
    moves.push(...getReversoMoves(state, piece, position, baselineMoves));
  }

  if (hasMutation(piece, "CLONER") && !piece.clonerUsed && piece.type !== "k") {
    moves.push(...getCloneMoves(state, piece, position));
  }

  if (hasMutation(piece, "WILDCARD")) {
    moves.push(...getWildcardMoves(state, piece, position));
  }

  return moves;
}

function getAmplifierMoves(state, piece, position) {
  if (!getTileAt(state, position.row, position.col, "AMPLIFIER")) return [];
  const moves = [];

  if (piece.type === "k") {
    for (let deltaRow = -2; deltaRow <= 2; deltaRow += 1) {
      for (let deltaCol = -2; deltaCol <= 2; deltaCol += 1) {
        if (deltaRow === 0 && deltaCol === 0) continue;
        const row = position.row + deltaRow;
        const col = position.col + deltaCol;
        if (!isInside(row, col)) continue;
        const target = getPieceAt(state.board, row, col);
        if (!target || target.color !== piece.color) {
          moves.push(makeWackoMove(piece, position, row, col, "amplified", Boolean(target)));
        }
      }
    }
  }

  if (piece.type === "n") {
    for (const [deltaRow, deltaCol] of KNIGHT_DELTAS) {
      const row = position.row + deltaRow * 2;
      const col = position.col + deltaCol * 2;
      if (!isInside(row, col)) continue;
      const target = getPieceAt(state.board, row, col);
      if (!target || target.color !== piece.color) {
        moves.push(makeWackoMove(piece, position, row, col, "amplified", Boolean(target)));
      }
    }
  }

  if (piece.type === "p") {
    const direction = piece.color === "white" ? -1 : 1;
    const row = position.row + direction * 2;
    if (isInside(row, position.col) && !getPieceAt(state.board, row, position.col)) {
      moves.push(makeWackoMove(piece, position, row, position.col, "amplified"));
    }
    for (const deltaCol of [-2, 2]) {
      const col = position.col + deltaCol;
      const target = getPieceAt(state.board, row, col);
      if (isInside(row, col) && target && target.color !== piece.color) {
        moves.push(makeWackoMove(piece, position, row, col, "amplified", true));
      }
    }
  }

  return moves;
}

function getPhaseMoves(state, piece, position) {
  const moves = [];
  const directions = SLIDING_DIRECTIONS[piece.type] || [];

  for (const [deltaRow, deltaCol] of directions) {
    let skipped = false;
    for (let step = 1; step < 8; step += 1) {
      const row = position.row + deltaRow * step;
      const col = position.col + deltaCol * step;
      if (!isInside(row, col)) break;
      const target = getPieceAt(state.board, row, col);

      if (!target) {
        if (skipped) moves.push(makeWackoMove(piece, position, row, col, "phase"));
        continue;
      }

      if (!skipped) {
        skipped = true;
        continue;
      }

      if (target.color !== piece.color) {
        moves.push(makeWackoMove(piece, position, row, col, "phase-capture", true));
      }
      break;
    }
  }

  return moves;
}

function getFriendlyCaptures(state, piece, position) {
  return getPseudoMovesForType(state, piece, position, piece.type, {
    includeFriendlyCaptures: true,
    friendlyOnly: true,
  }).filter((move) => getPieceAt(state.board, move.row, move.col)?.type !== "k");
}

function getReversoMoves(state, piece, position, baselineMoves) {
  const moves = [];
  for (const move of baselineMoves) {
    const mirroredCol = position.col - (move.col - position.col);
    if (!isInside(move.row, mirroredCol)) continue;
    const target = getPieceAt(state.board, move.row, mirroredCol);
    if (target?.color === piece.color) continue;
    moves.push(makeWackoMove(piece, position, move.row, mirroredCol, "reverso", Boolean(target)));
  }
  return moves;
}

function getCloneMoves(state, piece, position) {
  return KING_DELTAS.flatMap(([deltaRow, deltaCol]) => {
    const row = position.row + deltaRow;
    const col = position.col + deltaCol;
    if (!isInside(row, col) || getPieceAt(state.board, row, col)) return [];
    return [
      {
        ...makeWackoMove(piece, position, row, col, "clone"),
        special: "clone",
      },
    ];
  });
}

function getWildcardMoves(state, piece, position) {
  const roll = getWildcardRoll(state, piece);
  return getPseudoMovesForType(state, piece, position, roll, { includeEnemyCaptures: true }).map((move) => ({
    ...move,
    special: "wildcard",
    wildcardType: roll,
  }));
}

function getWildcardRoll(state, piece) {
  if (!state.wildcardRolls[piece.id]) {
    const types = Object.keys(PIECE_TYPES).filter((type) => type !== piece.type && type !== "k");
    state.wildcardRolls[piece.id] = types[Math.floor(state.rng() * types.length)];
  }
  return state.wildcardRolls[piece.id];
}

function getPseudoMovesForType(state, piece, position, type, options = {}) {
  if (type === "n") return getJumpMoves(state, piece, position, KNIGHT_DELTAS, options);
  if (type === "k") return getJumpMoves(state, piece, position, KING_DELTAS, options);
  if (type === "p") return getPawnLikeMoves(state, piece, position, options);
  return getSlidingPseudoMoves(state, piece, position, SLIDING_DIRECTIONS[type] || [], options);
}

function getJumpMoves(state, piece, position, deltas, options) {
  return deltas.flatMap(([deltaRow, deltaCol]) => {
    const row = position.row + deltaRow;
    const col = position.col + deltaCol;
    if (!isInside(row, col)) return [];
    const target = getPieceAt(state.board, row, col);
    return targetToMove(piece, position, row, col, target, options);
  });
}

function getSlidingPseudoMoves(state, piece, position, directions, options) {
  const moves = [];
  for (const [deltaRow, deltaCol] of directions) {
    for (let step = 1; step < 8; step += 1) {
      const row = position.row + deltaRow * step;
      const col = position.col + deltaCol * step;
      if (!isInside(row, col)) break;
      const target = getPieceAt(state.board, row, col);
      const next = targetToMove(piece, position, row, col, target, options);
      moves.push(...next);
      if (target) break;
    }
  }
  return moves;
}

function getPawnLikeMoves(state, piece, position, options) {
  const direction = piece.color === "white" ? -1 : 1;
  const moves = [];
  const oneRow = position.row + direction;

  if (isInside(oneRow, position.col) && !getPieceAt(state.board, oneRow, position.col) && !options.friendlyOnly) {
    moves.push(makeWackoMove(piece, position, oneRow, position.col, "wildcard"));
  }

  for (const deltaCol of [-1, 1]) {
    const row = oneRow;
    const col = position.col + deltaCol;
    if (!isInside(row, col)) continue;
    const target = getPieceAt(state.board, row, col);
    moves.push(...targetToMove(piece, position, row, col, target, options));
  }
  return moves;
}

function targetToMove(piece, position, row, col, target, options) {
  if (!target) {
    return options.friendlyOnly ? [] : [makeWackoMove(piece, position, row, col, "wildcard")];
  }

  if (target.color === piece.color) {
    if (!options.includeFriendlyCaptures || target.type === "k") return [];
    return [
      {
        ...makeWackoMove(piece, position, row, col, "friendly-capture", true),
        special: "friendly-capture",
      },
    ];
  }

  return options.friendlyOnly ? [] : [makeWackoMove(piece, position, row, col, "wildcard-capture", true)];
}

function filterMagneto(state, piece, position, moves) {
  const magnets = adjacentEnemyMagnets(state, piece, position);
  if (!magnets.length) return moves;

  return moves.filter((move) =>
    magnets.every((magnet) => {
      const capturesMagnet = move.row === magnet.row && move.col === magnet.col;
      const remainsAdjacent = Math.abs(move.row - magnet.row) <= 1 && Math.abs(move.col - magnet.col) <= 1;
      return capturesMagnet || remainsAdjacent;
    }),
  );
}

function adjacentEnemyMagnets(state, piece, position) {
  const magnets = [];
  for (const [deltaRow, deltaCol] of KING_DELTAS) {
    const row = position.row + deltaRow;
    const col = position.col + deltaCol;
    const target = getPieceAt(state.board, row, col);
    if (target && target.color !== piece.color && hasMutation(target, "MAGNETO")) {
      magnets.push({ row, col, piece: target });
    }
  }
  return magnets;
}

function isMoveSafe(state, piece, from, move) {
  const target = getPieceAt(state.board, move.row, move.col);
  if (target?.color === piece.color && move.special !== "friendly-capture") return false;
  if (target?.type === "k") return false;

  const cloneBoard = state.board.map((rank) => rank.map((item) => (item ? clonePiece(item) : null)));
  const movingClone = cloneBoard[from.row][from.col];
  cloneBoard[from.row][from.col] = null;
  if (move.special !== "clone") {
    cloneBoard[move.row][move.col] = movingClone;
  } else {
    cloneBoard[from.row][from.col] = movingClone;
    cloneBoard[move.row][move.col] = createPiece(piece.color, piece.type);
  }

  const testState = { ...state, board: cloneBoard };
  try {
    const testChess = new Chess(boardToFen(testState, piece.color), { skipValidation: true });
    return !testChess.isCheck();
  } catch {
    return false;
  }
}

function mergeMoves(moves) {
  const byKey = new Map();
  for (const move of moves) {
    const key = `${move.row}:${move.col}:${move.promotion || ""}:${move.special || ""}`;
    if (!byKey.has(key) || move.wacko) {
      byKey.set(key, move);
    }
  }
  return [...byKey.values()];
}

function makeWackoMove(piece, from, row, col, special, capture = false) {
  return {
    pieceId: piece.id,
    color: piece.color,
    from: squareToNotation(from.row, from.col),
    to: squareToNotation(row, col),
    row,
    col,
    san: `${squareToNotation(from.row, from.col)}-${squareToNotation(row, col)}`,
    flags: capture ? "c" : "",
    special,
    wacko: true,
  };
}

function moveToTarget(move, pieceId) {
  const square = notationToSquare(move.to);
  return {
    pieceId,
    color: CHESS_TO_APP_COLOR[move.color],
    from: move.from,
    to: move.to,
    row: square.row,
    col: square.col,
    captured: move.captured,
    promotion: move.promotion,
    san: move.san,
    flags: move.flags,
    special: move.isPromotion() ? "promotion" : move.isCapture() ? "capture" : null,
    wacko: false,
  };
}

function isInside(row, col) {
  return row >= 0 && row < 8 && col >= 0 && col < 8;
}

function tileName(tile) {
  return tile.type.replaceAll("_", " ");
}

function capitalize(value) {
  return `${value[0].toUpperCase()}${value.slice(1)}`;
}
