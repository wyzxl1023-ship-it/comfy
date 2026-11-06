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
