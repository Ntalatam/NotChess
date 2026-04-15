import test from "node:test";
import assert from "node:assert/strict";
import { notationToSquare } from "../js/board.js";
import { getLegalMoves, moveFromNotation } from "../js/rules.js";
import { createInitialState } from "../js/state.js";
import { ageTilesAfterFullRound, spawnPortalPair, spawnSpecialTile } from "../js/tiles.js";

test("ghost tiles block movement into their square", () => {
  const state = createInitialState();
  spawnSpecialTile(state, "GHOST_TILE", 4, 4);
  const pawn = state.board[6][4];
  const moves = getLegalMoves(state, pawn.id).map((move) => move.to);

  assert.equal(moves.includes("e4"), false);
  assert.equal(moves.includes("e3"), true);
});

test("lava destroys a piece that stops on it", () => {
  const state = createInitialState();
  spawnSpecialTile(state, "LAVA", 4, 4);
  moveFromNotation(state, "e2", "e4");

  assert.equal(state.board[4][4], null);
});

test("ice slides a piece one extra square in its movement direction", () => {
  const state = createInitialState();
  spawnSpecialTile(state, "ICE", 4, 4);
  moveFromNotation(state, "e2", "e4");

  assert.equal(state.board[3][4].type, "p");
  assert.equal(state.board[4][4], null);
});

test("portal pairs teleport entering pieces to the paired exit", () => {
  const state = createInitialState();
  spawnPortalPair(state, notationToSquare("e4"), notationToSquare("h4"));
  moveFromNotation(state, "e2", "e4");

  assert.equal(state.board[4][7].type, "p");
  assert.equal(state.board[4][4], null);
});

test("minefields detonate and remove themselves", () => {
  const state = createInitialState();
  spawnSpecialTile(state, "MINEFIELD", 4, 4);
  moveFromNotation(state, "e2", "e4");

  assert.equal(state.board[4][4], null);
  assert.equal(state.specialTiles.some((tile) => tile.type === "MINEFIELD"), false);
});

test("tile durations age after full rounds", () => {
  const state = createInitialState();
  spawnSpecialTile(state, "LAVA", 4, 4, { turnsLeft: 1 });
  const expired = ageTilesAfterFullRound(state);

  assert.equal(expired.length, 1);
  assert.equal(state.specialTiles.length, 0);
});
