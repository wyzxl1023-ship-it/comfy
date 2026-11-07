import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validate, REMOTE_ACTIONS } from '../bridge/protocol.mjs';
import { cycle, REMOTE_GESTURES } from '../src/remote.js';
import { GESTURE_LABELS } from '../src/gestures.js';

test('remote 消息校验', () => {
  assert.equal(validate({ type: 'remote', action: 'nextLook' }), null);
  assert.ok(validate({ type: 'remote', action: 'dance' }));
  assert.ok(validate({ type: 'remote' }));
});

test('轮流切换', () => {
  const l = ['a', 'b', 'c'];
  assert.equal(cycle(l, 'a'), 'b');
  assert.equal(cycle(l, 'c'), 'a');
  assert.equal(cycle(l, 'a', -1), 'c');
  assert.equal(cycle(l, undefined), 'a');
  assert.equal(cycle(l, undefined, -1), 'c');
  assert.equal(cycle([], 'a'), undefined);
});

test('遥控动作都是已有动作', () => {
  for (const g of REMOTE_GESTURES) assert.ok(GESTURE_LABELS[g], g);
});

// Mac 端快捷键 = ⌃⌥⇧⌘ + (REMOTE_ACTIONS 下标 + 1)，固件 MacKey 必须一一对上
test('固件按键和 Mac 端快捷键对得上', () => {
  const src = fs.readFileSync(new URL('../remote/stick/src/main.cpp', import.meta.url), 'utf8');
  const keys = Object.fromEntries([...src.matchAll(/MAC_([A-Z_]+) = '(\d)'/g)].map((m) => [m[1], Number(m[2])]));
  const expect = { NEXT_LOOK: 'nextLook', PREV_LOOK: 'prevLook', PREV_SCENE: 'prevScene', NEXT_SCENE: 'nextScene', GESTURE: 'gesture', OUTFIT: 'outfit', HAIR: 'hair', PANEL: 'panel' };
  assert.equal(Object.keys(keys).length, REMOTE_ACTIONS.length);
  for (const [k, n] of Object.entries(keys)) assert.equal(REMOTE_ACTIONS[n - 1], expect[k], k);
});
