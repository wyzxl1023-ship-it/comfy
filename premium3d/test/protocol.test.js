import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validate } from '../bridge/protocol.mjs';
import { codeToCondition } from '../src/weather.js';

test('状态接口消息校验', () => {
  assert.equal(validate({ type: 'say', text: '你好' }), null);
  assert.equal(validate({ type: 'state', state: 'thinking' }), null);
  assert.equal(validate({ type: 'level', v: 0.3 }), null);
  assert.equal(validate({ type: 'weather', temp: 12, condition: 'rain' }), null);
  assert.ok(validate({ type: 'say' }));
  assert.ok(validate({ type: 'state', state: 'dancing' }));
  assert.ok(validate({ type: 'level', v: 2 }));
  assert.ok(validate({ type: 'boom' }));
  assert.ok(validate([]));
});

test('WMO 天气代码映射', () => {
  assert.equal(codeToCondition(0), 'sunny');
  assert.equal(codeToCondition(3), 'cloudy');
  assert.equal(codeToCondition(61), 'rain');
  assert.equal(codeToCondition(95), 'rain');
  assert.equal(codeToCondition(73), 'snow');
});

test('heard 消息和聊天日志行', async () => {
  const { validate } = await import('../bridge/protocol.mjs');
  const { chatLogLine } = await import('../bridge/bridge.mjs');
  assert.equal(validate({ type: 'heard', text: '今天有点累' }), null);
  assert.ok(validate({ type: 'heard' }));
  const r = chatLogLine({ type: 'heard', text: '今天有点累' }, new Date(2026, 10, 6, 9, 5));
  assert.equal(r.day, '2026-11-06');
  assert.deepEqual(JSON.parse(r.line).who, 'user');
  assert.equal(JSON.parse(chatLogLine({ type: 'say', text: '那先歇会儿', emotion: 'relaxed' }).line).emotion, 'relaxed');
  assert.equal(chatLogLine({ type: 'gesture', name: 'wave' }), null);
});
