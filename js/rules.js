import { notationToSquare, squareToNotation } from "./board.js";
import { clonePiece, findPiecePosition, getPieceAt, pieceLabel } from "./pieces.js";
import { addLog } from "./state.js";

const CHESS_TO_APP_COLOR = {
  w: "white",
  b: "black",
};

const APP_TO_CHESS_COLOR = {
  white: "w",
  black: "b",
};

export function getLegalMoves(state, pieceId) {
  const position = findPiecePosition(state.board, pieceId);
  if (!position) return [];
  const piece = getPieceAt(state.board, position.row, position.col);
  if (!piece || piece.color !== state.turn || state.gameOver) return [];

  const square = squareToNotation(position.row, position.col);
  return state.chess
    .moves({ square, verbose: true })
    .map((move) => moveToTarget(move, piece.id))
    .filter((move) => move.color === piece.color);
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
  return requestStandardMove(state, fromSquare, toSquare, promotion);
}

export function requestStandardMove(state, from, to, promotion = undefined) {
  const movingPiece = getPieceAt(state.board, from.row, from.col);
  if (!movingPiece || movingPiece.color !== state.turn || state.gameOver) {
    return null;
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

  const boardResult = applyMoveToBoard(state, move);
  state.turn = CHESS_TO_APP_COLOR[state.chess.turn()];
  state.turnCount = state.chess.moveNumber();
  state.selected = null;
  state.validMoves = [];
  state.targetSquares = [];
  state.pendingPromotion = null;
  updateGameStatus(state);

  const captureText = boardResult.captured ? ` captures ${pieceLabel(boardResult.captured)}` : "";
  addLog(state, `${pieceLabel(boardResult.movingPiece)} ${move.san}${captureText}.`);

  return {
    move,
    ...boardResult,
  };
}

export function updateGameStatus(state) {
  state.check = state.chess.isCheck();
  state.checkmate = state.chess.isCheckmate();
  state.stalemate = state.chess.isStalemate();
  state.draw = state.chess.isDraw();
  state.gameOver = state.chess.isGameOver();
  state.winner = null;
  state.gameOverReason = "";

  if (state.checkmate) {
    state.winner = oppositeColor(state.turn);
    state.gameOverReason = `Checkmate - ${capitalize(state.winner)} wins`;
  } else if (state.stalemate) {
    state.gameOverReason = "Stalemate";
  } else if (state.chess.isInsufficientMaterial()) {
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

function applyMoveToBoard(state, move) {
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
    captured,
    from,
    to,
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
  };
}

function capitalize(value) {
  return `${value[0].toUpperCase()}${value.slice(1)}`;
}
