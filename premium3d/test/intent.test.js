import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planUtterance, detectWeather, detectScene, detectEmotion, splitClauses, gestureForClause } from '../src/intent.js';
import { GESTURES, sampleGesture } from '../src/gestures.js';

test('场景识别：家 / 车站 / 公司', () => {
  assert.equal(detectScene('我回家啦，躺在沙发上'), 'home');
  assert.equal(detectScene('我在公交车站等车'), 'busStop');
  assert.equal(detectScene('今天公司开会到很晚'), 'office');
  assert.equal(detectScene('今天吃了什么'), null);
});

test('情绪识别', () => {
  assert.equal(detectEmotion('哈哈，太好了！'), 'happy');
  assert.equal(detectEmotion('唉，有点难过'), 'sad');
  assert.equal(detectEmotion('哇，真的吗'), 'surprised');
  assert.equal(detectEmotion('好的'), 'neutral');
});

test('分句保留标点和下标', () => {
  const c = splitClauses('你好呀！今天开会，好累。');
  assert.deepEqual(c.map((x) => x.text), ['你好呀！', '今天开会，', '好累。']);
  assert.equal(c[1].start, 4);
});

test('每句对应动作', () => {
  assert.equal(gestureForClause('你好呀！'), 'wave');
  assert.equal(gestureForClause('谢谢你'), 'bow');
  assert.equal(gestureForClause('让我想想'), 'think');
  assert.equal(gestureForClause('你看那边'), 'point');
  assert.equal(gestureForClause('不行不行'), 'shake');
  assert.equal(gestureForClause('太好了'), 'cheer');
});

test('整段计划：场景 + 动作序列', () => {
  const p = planUtterance('早上好！我在公交车站等车，你看那边，车来了！');
  assert.equal(p.scene, 'busStop');
  assert.equal(p.beats[0].gesture, 'wave');
  assert.ok(p.beats.some((b) => b.gesture === 'point'));
});

test('外部可以指定场景和表情', () => {
  const p = planUtterance('随便说点什么', { scene: 'office', emotion: 'happy' });
  assert.equal(p.scene, 'office');
  assert.equal(p.emotion, 'happy');
});

test('没关键词的长句用说话手势，但不连续两句都比划', () => {
  const p = planUtterance('今天天气不错适合出去走走，晚上我们一起看个电影吧。');
  assert.equal(p.beats[0].gesture, 'talk');
  assert.equal(p.beats[1].gesture, null);
});

test('所有规则里的动作都存在，且关键帧能采样', () => {
  for (const name of [...Object.keys(GESTURES)]) {
    const g = GESTURES[name];
    for (const t of [0, g.duration / 3, g.duration, g.duration * 2]) {
      const s = sampleGesture(name, t);
      for (const v of Object.values(s)) {
        assert.equal(v.length, 3);
        v.forEach((x) => assert.ok(Number.isFinite(x)));
      }
    }
  }
  assert.equal(sampleGesture('nope', 0), null);
});

test('话里提到天气', () => {
  assert.equal(detectWeather('外面在下雨'), 'rain');
  assert.equal(detectWeather('明天会下雪吗'), 'snow');
  assert.equal(detectWeather('你好'), null);
});

test('卧室场景和害羞动作', () => {
  assert.equal(detectScene('好困了，我要去睡觉啦，晚安'), 'bedroom');
  assert.equal(detectScene('我回家啦，躺在沙发上'), 'home');
  assert.equal(gestureForClause('哎呀你这样说我好害羞'), 'shy');
  assert.ok(GESTURES.shy);
});
