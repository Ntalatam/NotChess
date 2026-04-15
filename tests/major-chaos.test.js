import test from "node:test";
import assert from "node:assert/strict";
import { createInitialState } from "../js/state.js";
import { MAJOR_CHAOS_EVENTS, setupChaosDeck, startTurn, triggerMajorChaos } from "../js/chaos.js";

test("all ten major chaos events are registered", () => {
  assert.equal(MAJOR_CHAOS_EVENTS.length, 10);
});

test("chaos meter triggers a major chaos event at one hundred", () => {
  const state = createInitialState({ intensity: "standard" }, () => 0);
  setupChaosDeck(state);
  state.chaosMeter = 90;
  const event = startTurn(state);

  assert.equal(event.name, "The Great Scramble");
  assert.equal(state.chaosMeter, 0);
  assert.equal(state.majorChaosCount, 1);
});

test("mutation cascade grants board-wide mutations", () => {
  const state = createInitialState({}, () => 0.2);
  MAJOR_CHAOS_EVENTS.find((event) => event.id === "MUTATION_CASCADE").resolve(state);

  assert.ok(state.board.flat().filter(Boolean).every((piece) => piece.mutations.length === 1));
});

test("hands reset discards and redraws four cards each", () => {
  const state = createInitialState();
  setupChaosDeck(state);
  MAJOR_CHAOS_EVENTS.find((event) => event.id === "HANDS_RESET").resolve(state);

  assert.equal(state.hands.white.length, 4);
  assert.equal(state.hands.black.length, 4);
});

test("piece destruction never removes kings", () => {
  const state = createInitialState({}, () => 0);
  MAJOR_CHAOS_EVENTS.find((event) => event.id === "PIECE_DESTRUCTION").resolve(state);
  const kings = state.board.flat().filter((piece) => piece?.type === "k");

  assert.equal(kings.length, 2);
});

test("triggerMajorChaos records the event and syncs state", () => {
  const state = createInitialState({}, () => 0);
  const event = triggerMajorChaos(state);

  assert.equal(event.name, "The Great Scramble");
  assert.equal(state.lastMajorChaos.name, "The Great Scramble");
  assert.equal(state.majorChaosCount, 1);
});
