import test from "node:test";
import assert from "node:assert/strict";
import { grantMutation } from "../js/mutations.js";
import { moveFromNotation } from "../js/rules.js";
import { createInitialState } from "../js/state.js";
import { drawCard, getCardTargetSquares, hasChaosEvent, playCard, setupChaosDeck } from "../js/chaos.js";

test("chaos deck contains forty cards and deals opening hands", () => {
  const state = createInitialState();
  setupChaosDeck(state);

  assert.equal(state.deck.remaining, 34);
  assert.equal(state.hands.white.length, 3);
  assert.equal(state.hands.black.length, 3);
});

test("discard pile reshuffles when deck runs out", () => {
  const state = createInitialState();
  state.deck.cards = [];
  state.deck.discard = [{ id: "FORTIFY", instanceId: "x" }];
  drawCard(state, "white");

  assert.equal(state.hands.white.length, 1);
  assert.equal(state.deck.discarded, 0);
});

test("fortify gives an own piece shield", () => {
  const state = createInitialState();
  state.hands.white = [{ id: "FORTIFY", instanceId: "fortify" }];
  const result = playCard(state, "white", 0, [{ row: 6, col: 4 }]);

  assert.equal(result.definition.name, "Fortify");
  assert.equal(state.board[6][4].mutations.includes("SHIELD"), true);
  assert.equal(state.deck.discarded, 1);
});

test("land mine card exposes empty square targets and places a mine", () => {
  const state = createInitialState();
  state.hands.white = [{ id: "LAND_MINE", instanceId: "mine" }];
  const targets = getCardTargetSquares(state, "white", 0);

  assert.equal(targets.some((target) => target.row === 4 && target.col === 4), true);
  playCard(state, "white", 0, [{ row: 4, col: 4 }]);
  assert.equal(state.specialTiles[0].type, "MINEFIELD");
});

test("nuclear option destroys non-kings and preserves kings", () => {
  const state = createInitialState();
  state.hands.white = [{ id: "NUCLEAR_OPTION", instanceId: "nuke" }];
  playCard(state, "white", 0, [{ row: 7, col: 4 }]);

  assert.equal(state.board[7][4].type, "k");
  assert.equal(state.board[7][3], null);
});

test("time warp grants one extra move before the turn changes", () => {
  const state = createInitialState();
  state.hands.white = [{ id: "TIME_WARP", instanceId: "time" }];
  playCard(state, "white", 0, []);
  moveFromNotation(state, "e2", "e4");

  assert.equal(state.turn, "white");
  moveFromNotation(state, "g1", "f3");
  assert.equal(state.turn, "black");
});

test("hasChaosEvent detects active events by type", () => {
  const state = createInitialState();
  assert.equal(hasChaosEvent(state, "GRAVITY_FLIP"), false);
  state.chaosEvents.push({ type: "GRAVITY_FLIP", name: "Gravity Flip", turnsLeft: 2, color: null });
  assert.equal(hasChaosEvent(state, "GRAVITY_FLIP"), true);
  assert.equal(hasChaosEvent(state, "THE_SWITCH"), false);
});

test("mutation injection can grant a mutation through card play", () => {
  const state = createInitialState({}, () => 0);
  state.hands.white = [{ id: "MUTATION_INJECTION", instanceId: "mutate" }];
  playCard(state, "white", 0, [{ row: 6, col: 4 }]);

  assert.equal(state.board[6][4].mutations.length, 1);
  assert.equal(grantMutation(state.board[7][4], "CLONER"), false);
});
