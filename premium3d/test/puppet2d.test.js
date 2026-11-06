import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PUPPET_GESTURES, resolveGesture } from '../src/puppet2d.js';
import { GESTURE_RULES, gestureForClause } from '../src/intent.js';
import { GESTURE_LABELS } from '../src/gestures.js';

test('规则和按钮里的每个动作 2D 小柚都会做', () => {
  for (const { gesture } of GESTURE_RULES) assert.ok(PUPPET_GESTURES[gesture], gesture);
  for (const name of Object.keys(GESTURE_LABELS)) assert.ok(PUPPET_GESTURES[name], name);
});

test('分段动作在整个时长内参数都是有效值', () => {
  for (const [name, G] of Object.entries(PUPPET_GESTURES)) {
    for (let i = 0; i <= 20; i++) {
      const g = resolveGesture(G, (G.duration * i) / 20);
      for (const [k, v] of Object.entries(g)) {
        if (typeof v === 'number') assert.ok(Number.isFinite(v), `${name}.${k}`);
      }
    }
  }
});

test('新动作的关键词', () => {
  assert.equal(gestureForClause('来抱抱'), 'hug');
  assert.equal(gestureForClause('么么哒'), 'kiss');
  assert.equal(gestureForClause('呜呜呜'), 'cry');
  assert.equal(gestureForClause('哼，不理你'), 'angry');
  assert.equal(gestureForClause('好困啊'), 'yawn');
  assert.equal(gestureForClause('哈哈哈哈'), 'laugh');
  assert.equal(gestureForClause('真的吗'), 'surprised');
  assert.equal(gestureForClause('那我走啦'), 'leaveBack');
  assert.equal(gestureForClause('讨厌啦'), 'shy');
  assert.equal(gestureForClause('来杯奶茶'), 'drink');
});
