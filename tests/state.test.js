import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_STATE, parseScene, serializeScene, normalizeState } from '../src/state.js';

test('shared scene restores the five creative choices without autoplay preferences', () => {
  const state = { scene: 2, palette: 1, speed: 1.23, intensity: .78, seed: 4294967295, paused: true };
  assert.deepEqual(parseScene(serializeScene(state)), { ...state, paused: false });
});
test('unknown versions and oversized payloads use a known usable scene', () => {
  for (const hash of ['', '#v=2&scene=2', '#v=1&scene=2&x=' + 'x'.repeat(512)]) assert.deepEqual(parseScene(hash), DEFAULT_STATE);
});
test('untrusted non-finite and extreme inputs cannot reach rendering', () => {
  const scene = parseScene('#v=1&scene=99&palette=-2&speed=Infinity&intensity=NaN&seed=-7');
  assert.deepEqual(scene, { scene: 2, palette: 0, speed: .65, intensity: .55, seed: 1, paused: false });
  assert.deepEqual(parseScene('#v=1&scene=&speed=&seed='), DEFAULT_STATE);
  assert.equal(normalizeState({ speed: -10, intensity: 50 }).speed, .25);
  assert.equal(normalizeState({ speed: -10, intensity: 50 }).intensity, 1);
});
test('URL text is data, never executable content', () => {
  assert.deepEqual(parseScene('#v=1&scene=%3Cscript%3Ealert(1)%3C/script%3E&seed=constructor'), DEFAULT_STATE);
});
