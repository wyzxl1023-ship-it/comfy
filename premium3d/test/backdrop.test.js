import { test } from 'node:test';
import assert from 'node:assert/strict';
import { candidates } from '../src/backdrop.js';

test('卧室没有专属背景时退回在家的背景', () => {
  const night = candidates('bedroom', { condition: 'rain', night: true });
  assert.deepEqual(night.slice(0, 4), ['bedroom-rain-night', 'bedroom-night', 'bedroom-rain', 'bedroom']);
  assert.ok(night.includes('home-rain-night'));
  assert.ok(night.indexOf('bedroom') < night.indexOf('home-rain-night'));
  assert.deepEqual(candidates('bedroom', { condition: 'sunny', night: false }, { fallback: false }), ['bedroom-sunny', 'bedroom']);
  assert.deepEqual(candidates('office', { condition: 'sunny', night: false }), ['office-sunny', 'office']);
});

import { closestFile } from '../src/backdrop.js';

test('closest background: same scene, then day/night, then weather', () => {
  const files = new Set(['noodleShop-rain-night.jpg', 'noodleShop-cloudy-night.jpg', 'home-sunny.jpg', 'cinema.jpg']);
  assert.equal(closestFile(files, 'noodleShop', { condition: 'sunny', night: false }), 'noodleShop-cloudy-night.jpg');
  assert.equal(closestFile(files, 'noodleShop', { condition: 'rain', night: true }), 'noodleShop-rain-night.jpg');
  assert.equal(closestFile(files, 'cinema', { condition: 'snow', night: true }), 'cinema.jpg');
  assert.equal(closestFile(files, 'mall', { condition: 'sunny', night: false }), null);
  assert.equal(closestFile(new Set(['homeOffice-sunny.jpg']), 'home', { condition: 'sunny' }), null);
});
