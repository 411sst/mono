import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createInitialState } from '../core/state.js';
import { applyAction, applyTimeout } from '../core/engine.js';
import { richupPreset } from '../rules/richupPreset.js';

const map = JSON.parse(fs.readFileSync('maps/classic.json', 'utf-8'));

test('initial state starts with configured cash', () => {
  const state = createInitialState({ map, rules: richupPreset, players: ['A', 'B'] });
  assert.equal(state.players[0].cash, 2000);
});

test('timeout applies progressive penalty', () => {
  const state = createInitialState({ map, rules: richupPreset, players: ['A', 'B'] });
  const before = state.players[0].cash;
  applyTimeout(state, richupPreset);
  assert.equal(state.players[0].cash, before - 50);
});

test('version conflict prevention pattern', () => {
  const state = createInitialState({ map, rules: richupPreset, players: ['A', 'B'] });
  const r = applyAction(state, { type: 'END_TURN' }, map, richupPreset);
  assert.equal(r.ok, true);
  assert.ok(state.version > 1);
});
