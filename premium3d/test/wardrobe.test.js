import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chooseOutfit, STARTER_ITEMS, targetWarmth, optionalSlotsFor, colorHarmony, newItemFromUpload } from '../src/wardrobe.js';

const noRandom = () => 0.5;

test('温度 → 保暖档位', () => {
  assert.equal(targetWarmth(30), 0);
  assert.equal(targetWarmth(20), 1);
  assert.equal(targetWarmth(12), 2);
  assert.equal(targetWarmth(-2), 3);
});

test('下雨去车站：带伞、穿外套', () => {
  const o = chooseOutfit(STARTER_ITEMS, { temp: 14, condition: 'rain' }, 'busStop', { random: noRandom });
  assert.ok(o.items.umbrella);
  assert.ok(o.items.outer);
  assert.ok(o.items.outer.waterproof);
  assert.match(o.say, /带了伞/);
});

test('下雪很冷：厚衣服 + 围巾 + 毛线帽', () => {
  const o = chooseOutfit(STARTER_ITEMS, { temp: -3, condition: 'snow' }, 'busStop', { random: noRandom });
  assert.equal(o.items.top.warmth, 3);
  assert.ok(o.items.scarf);
  assert.equal(o.items.hat.id, 'hat-beanie');
  assert.equal(o.items.outer.id, 'outer-down');
});

test('大热天出门：清凉 + 遮阳帽 + 墨镜', () => {
  const o = chooseOutfit(STARTER_ITEMS, { temp: 32, condition: 'sunny' }, 'busStop', { random: noRandom });
  assert.equal(o.items.top.warmth, 0);
  assert.equal(o.items.hat.id, 'hat-sun');
  assert.ok(o.items.glasses);
  assert.equal(o.items.outer, undefined);
});

test('在家不穿外套、不戴帽子，偏居家', () => {
  const o = chooseOutfit(STARTER_ITEMS, { temp: 5, condition: 'snow' }, 'home', { random: noRandom });
  assert.equal(o.items.outer, undefined);
  assert.equal(o.items.hat, undefined);
  assert.equal(o.items.shoes.id, 'shoes-slipper');
});

test('上班穿得正式', () => {
  const o = chooseOutfit(STARTER_ITEMS, { temp: 22, condition: 'cloudy' }, 'office', { random: noRandom });
  assert.equal(o.items.top.formal, 2);
  assert.equal(o.items.shoes.id, 'shoes-loafer');
});

test('最近穿过的会换一换', () => {
  const w = { temp: 22, condition: 'cloudy' };
  const a = chooseOutfit(STARTER_ITEMS, w, 'busStop', { random: noRandom });
  const b = chooseOutfit(STARTER_ITEMS, w, 'busStop', { random: noRandom, recent: [a.items.top.id] });
  assert.notEqual(a.items.top.id, b.items.top.id);
});

test('主人上传的衣服会优先穿', () => {
  const mine = newItemFromUpload({ name: '主人送的白T', slot: 'top', color: '#f5f5f5', warmth: 1, formal: 1, image: 'data:,' });
  const o = chooseOutfit([...STARTER_ITEMS, mine], { temp: 22, condition: 'sunny' }, 'busStop', { random: noRandom });
  assert.equal(o.items.top.id, mine.id);
  assert.equal(mine.builtin, false);
});

test('撞色判断', () => {
  assert.equal(colorHarmony('#ffffff', '#ff0000'), 1);
  assert.ok(colorHarmony('#ff0000', '#00c000') < 0);
});

test('天气 → 需要的配饰', () => {
  assert.deepEqual(optionalSlotsFor({ temp: 22, condition: 'sunny' }, 'home'), []);
  assert.ok(optionalSlotsFor({ temp: 15, condition: 'rain' }, 'busStop').includes('umbrella'));
  assert.ok(!optionalSlotsFor({ temp: 15, condition: 'rain' }, 'office').includes('umbrella'));
});
