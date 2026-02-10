import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateMap } from '../maps/validator.js';

const map = JSON.parse(fs.readFileSync('maps/classic.json', 'utf-8'));

test('valid map passes', () => {
  const result = validateMap(map);
  assert.equal(result.ok, true);
});

test('map with duplicate Start fails', () => {
  const bad = structuredClone(map);
  bad.spaces.push({ index: 13, type: 'Start', name: 'Extra GO' });
  const result = validateMap(bad);
  assert.equal(result.ok, false);
  assert.match(result.issues.join('\n'), /exactly one Start/);
});
