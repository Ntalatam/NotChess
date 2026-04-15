import test from "node:test";
import assert from "node:assert/strict";
import { notationToSquare } from "../js/board.js";
import { grantMutation, hasMutation } from "../js/mutations.js";
import { createInitialState } from "../js/state.js";
import { getLegalMoves, moveFromNotation, requestMove } from "../js/rules.js";
import { createPiece } from "../js/pieces.js";

test("captures can grant deterministic mutations", () => {
  const rolls = [0, 0];
  const state = createInitialState({}, () => rolls.shift() ?? 0);
  moveFromNotation(state, "e2", "e4");
  moveFromNotation(state, "d7", "d5");
  const result = moveFromNotation(state, "e4", "d5");

  assert.equal(result.gainedMutation.name, "Leaper");
  assert.deepEqual(state.board[3][3].mutations, ["JUMPER"]);
});

test("shield blocks a capture attempt and then breaks", () => {
  const state = createInitialState();
  moveFromNotation(state, "e2", "e4");
  moveFromNotation(state, "d7", "d5");
  grantMutation(state.board[3][3], "SHIELD");

  const result = moveFromNotation(state, "e4", "d5");

  assert.equal(result.shieldBlocked, true);
  assert.equal(state.board[3][3].color, "black");
  assert.equal(state.board[4][4].color, "white");
  assert.equal(hasMutation(state.board[3][3], "SHIELD"), false);
  assert.equal(state.capturedPieces.white.length, 0);
  assert.equal(state.turn, "black");
});

test("explosive captured pieces destroy adjacent pieces without triggering shield edge cases", () => {
  const state = createInitialState();
  moveFromNotation(state, "e2", "e4");
  moveFromNotation(state, "d7", "d5");
  state.board[3][2] = createPiece("white", "n");
  grantMutation(state.board[3][3], "EXPLOSIVE");

  const result = moveFromNotation(state, "e4", "d5");

  assert.equal(result.captured.mutations.includes("EXPLOSIVE"), true);
  assert.equal(state.board[3][2], null);
});

test("cloner mutation is never granted to kings", () => {
  const state = createInitialState();
  assert.equal(grantMutation(state.board[7][4], "CLONER"), false);
});

test("berserker pieces can capture friendly non-king blockers", () => {
  const state = createInitialState();
  const rook = state.board[7][0];
  grantMutation(rook, "BERSERKER");
  const moves = getLegalMoves(state, rook.id);

  assert.equal(moves.some((move) => move.to === "a2" && move.special === "friendly-capture"), true);
  assert.equal(moves.some((move) => move.to === "e1"), false);
});

test("cloner pieces can split into adjacent empty squares", () => {
  const state = createInitialState();
  moveFromNotation(state, "g1", "f3");
  moveFromNotation(state, "a7", "a6");
  const knight = state.board[5][5];
  grantMutation(knight, "CLONER");
  const cloneTarget = notationToSquare("e3");
  const result = requestMove(state, { row: 5, col: 5 }, cloneTarget);

  assert.equal(result.clonedPiece.type, "n");
  assert.equal(state.board[5][4].type, "n");
  assert.equal(state.board[5][5].clonerUsed, true);
});
