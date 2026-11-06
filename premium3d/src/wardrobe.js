// 小柚的衣橱：衣物数据 + 按天气/场景自动搭配（纯逻辑，可在 Node 中测试）。
// 把衣物穿到 3D 模型上的部分在 dress.js。
//
// Item = {
//   id, name, slot,            // slot 见 SLOTS
//   color: '#rrggbb',
//   warmth: 0..3,              // 0 清凉 1 单衣 2 秋装 3 厚冬装
//   formal: 0..2,              // 0 居家 1 日常 2 正式
//   waterproof?: bool,
//   image?: dataURL,           // 用户上传的衣服照片（用作面料贴图）
//   favorite?: bool,
//   builtin?: bool,
// }

export const SLOTS = {
  top: '上衣', bottom: '下装', shoes: '鞋子', outer: '外套',
  hat: '帽子', scarf: '围巾', umbrella: '雨伞', glasses: '墨镜',
};
export const REQUIRED_SLOTS = ['top', 'bottom', 'shoes'];

export const STARTER_ITEMS = [
  { id: 'top-white-tee', name: '白色短袖T恤', slot: 'top', color: '#f4f4f2', warmth: 0, formal: 1, builtin: true },
  { id: 'top-pink-knit', name: '粉色针织衫', slot: 'top', color: '#f2b8c6', warmth: 2, formal: 1, builtin: true },
  { id: 'top-blue-shirt', name: '浅蓝衬衫', slot: 'top', color: '#bcd4ee', warmth: 1, formal: 2, builtin: true },
  { id: 'top-cream-hoodie', name: '奶油色卫衣', slot: 'top', color: '#efe2c8', warmth: 2, formal: 0, builtin: true },
  { id: 'top-red-sweater', name: '红色高领毛衣', slot: 'top', color: '#b8333a', warmth: 3, formal: 1, builtin: true },
  { id: 'bottom-denim', name: '牛仔短裤', slot: 'bottom', color: '#5a7fae', warmth: 1, formal: 1, builtin: true },
  { id: 'bottom-black-skirt', name: '黑色西装短裤', slot: 'bottom', color: '#2a2a30', warmth: 1, formal: 2, builtin: true },
  { id: 'bottom-plaid', name: '格纹呢子短裤', slot: 'bottom', color: '#8a5a44', warmth: 3, formal: 1, builtin: true },
  { id: 'bottom-shorts', name: '浅卡其短裤', slot: 'bottom', color: '#d8c49c', warmth: 0, formal: 0, builtin: true },
  { id: 'bottom-lounge', name: '灰色家居短裤', slot: 'bottom', color: '#a6a8ad', warmth: 2, formal: 0, builtin: true },
  { id: 'shoes-white', name: '小白鞋', slot: 'shoes', color: '#f2f2f2', warmth: 1, formal: 1, builtin: true },
  { id: 'shoes-loafer', name: '黑色乐福鞋', slot: 'shoes', color: '#222225', warmth: 1, formal: 2, builtin: true },
  { id: 'shoes-boots', name: '棕色短靴', slot: 'shoes', color: '#6b4630', warmth: 3, formal: 1, waterproof: true, builtin: true },
  { id: 'shoes-slipper', name: '毛绒拖鞋', slot: 'shoes', color: '#f7d9e0', warmth: 2, formal: 0, builtin: true },
  { id: 'outer-trench', name: '卡其风衣', slot: 'outer', color: '#c7a77a', warmth: 2, formal: 2, waterproof: true, builtin: true },
  { id: 'outer-down', name: '白色羽绒服', slot: 'outer', color: '#f0f0ee', warmth: 3, formal: 1, builtin: true },
  { id: 'outer-rain', name: '黄色雨衣', slot: 'outer', color: '#f2c230', warmth: 1, formal: 0, waterproof: true, builtin: true },
  { id: 'hat-beanie', name: '针织毛线帽', slot: 'hat', color: '#c95a6a', warmth: 3, formal: 0, builtin: true },
  { id: 'hat-sun', name: '草编遮阳帽', slot: 'hat', color: '#e6cf98', warmth: 0, formal: 1, builtin: true },
  { id: 'scarf-gray', name: '灰色羊绒围巾', slot: 'scarf', color: '#9a9ca3', warmth: 3, formal: 1, builtin: true },
  { id: 'umbrella-clear', name: '透明雨伞', slot: 'umbrella', color: '#dfeefa', warmth: 0, formal: 1, builtin: true },
  { id: 'glasses-sun', name: '茶色墨镜', slot: 'glasses', color: '#4a3424', warmth: 0, formal: 1, builtin: true },
];

export function targetWarmth(temp) {
  if (temp >= 26) return 0;
  if (temp >= 18) return 1;
  if (temp >= 9) return 2;
  return 3;
}

const OUTDOOR = new Set(['busStop']);
const SCENE_FORMAL = { office: 2, busStop: 1, home: 0, bedroom: 0 };
const AT_HOME = new Set(['home', 'bedroom']);

// 什么天气需要哪些可选单品
export function optionalSlotsFor(weather, scene) {
  const { temp, condition } = weather;
  const out = [];
  const wet = condition === 'rain' || condition === 'snow';
  const goingOut = !AT_HOME.has(scene);
  if (goingOut && (temp < 18 || condition === 'rain')) out.push('outer');
  if (goingOut && (temp < 5 || (condition === 'sunny' && temp >= 28))) out.push('hat');
  if (goingOut && temp < 8) out.push('scarf');
  if (OUTDOOR.has(scene) && wet) out.push('umbrella');
  if (OUTDOOR.has(scene) && condition === 'sunny' && temp >= 24) out.push('glasses');
  return out;
}

function hexToHsl(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255; const g = ((n >> 8) & 255) / 255; const b = (n & 255) / 255;
  const max = Math.max(r, g, b); const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h * 60, s, l];
}

// 颜色是否好搭：中性色（低饱和）跟什么都搭；两个高饱和色色相差 40°~150° 容易撞色
export function colorHarmony(a, b) {
  const [ha, sa] = hexToHsl(a);
  const [hb, sb] = hexToHsl(b);
  if (sa < 0.25 || sb < 0.25) return 1;
  const dh = Math.min(Math.abs(ha - hb), 360 - Math.abs(ha - hb));
  if (dh < 30) return 0.6; // 同色系
  if (dh > 150) return 0.4; // 撞色但可接受
  return -0.8;
}

export function scoreItem(item, ctx) {
  const { weather, scene, chosen, recent = [], random = Math.random } = ctx;
  const want = targetWarmth(weather.temp);
  let s = 0;
  // 鞋子、配饰对温度不那么敏感
  const warmthWeight = item.slot === 'shoes' ? 1 : item.slot === 'umbrella' || item.slot === 'glasses' ? 0 : 2;
  s -= Math.abs((item.warmth ?? 1) - want) * warmthWeight;
  const formalWant = SCENE_FORMAL[scene] ?? 1;
  s -= Math.abs((item.formal ?? 1) - formalWant) * 1.2;
  if (AT_HOME.has(scene) && item.formal === 0) s += 1; // 在家就穿舒服的
  if (!AT_HOME.has(scene) && (weather.condition === 'rain' || weather.condition === 'snow') && (item.slot === 'shoes' || item.slot === 'outer')) {
    s += item.waterproof ? 1.5 : 0;
  }
  if (item.slot === 'hat') {
    if (weather.temp < 5) s += item.warmth >= 2 ? 2 : -3;
    else s += item.warmth === 0 ? 2 : -3;
  }
  for (const other of Object.values(chosen)) s += colorHarmony(item.color, other.color) * 0.8;
  if (item.favorite) s += 1;
  if (!item.builtin) s += 0.5; // 主人送的衣服多穿穿
  if (recent.includes(item.id)) s -= 1.5;
  s += random() * 0.6; // 每天有点变化
  return s;
}

export function chooseOutfit(items, weather, scene, opts = {}) {
  const slots = [...REQUIRED_SLOTS, ...optionalSlotsFor(weather, scene)];
  const chosen = {};
  for (const slot of slots) {
    const candidates = items.filter((i) => i.slot === slot);
    if (!candidates.length) continue;
    let best = null;
    let bestScore = -Infinity;
    for (const item of candidates) {
      const sc = scoreItem(item, { weather, scene, chosen, recent: opts.recent, random: opts.random });
      if (sc > bestScore) { best = item; bestScore = sc; }
    }
    chosen[slot] = best;
  }
  return { items: chosen, say: describeOutfit(chosen, weather, scene) };
}

const COND_TEXT = { sunny: '大晴天', cloudy: '多云', rain: '在下雨', snow: '在下雪' };

export function describeOutfit(chosen, weather, scene) {
  const parts = [];
  const main = ['outer', 'top', 'bottom', 'shoes'].map((s) => chosen[s]?.name).filter(Boolean);
  parts.push(`今天${weather.temp}度，${COND_TEXT[weather.condition] ?? ''}`);
  if (main.length) parts.push(`我穿了${main.join('、')}`);
  if (chosen.umbrella) parts.push('带了伞');
  if (chosen.scarf) parts.push('围上了围巾');
  if (chosen.hat) parts.push(`戴了${chosen.hat.name}`);
  if (chosen.glasses) parts.push('还戴了墨镜防晒');
  if (scene === 'office') parts.push('上班要精神一点');
  return parts.join('，') + '。';
}

// 新上传的衣服：给出默认属性（用户在界面上可以改）
export function newItemFromUpload({ name, slot, color, image, warmth = 1, formal = 1 }) {
  return {
    id: `u-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    name: name || `${SLOTS[slot] ?? '衣服'}`,
    slot, color, image, warmth, formal, builtin: false,
  };
}

// 发型跟着穿搭和场合走：单品上写了 hair 就听单品的（比如运动服 → 高马尾），
// 否则按场合：在家/卧室 → 随手丸子头，上班 → 低盘发，其它 → 长直发。
export const HAIR_STYLES = { straight: '长直发', ponytail: '高马尾', bun: '低盘发', halfUp: '半扎发', messyBun: '丸子头' };
const HAIR_BY_SCENE = { home: 'messyBun', bedroom: 'messyBun', office: 'bun' };
export function hairFor(outfit, scene) {
  for (const slot of ['outer', 'top', 'dress', 'bottom', 'shoes', 'hat']) {
    const h = outfit?.items?.[slot]?.hair;
    if (h && HAIR_STYLES[h]) return h;
  }
  return HAIR_BY_SCENE[scene] ?? 'straight';
}

// ---------- 2D 小柚的整套穿搭（look） ----------
// 2D 人物没法一件一件叠穿，衣服是整套在原图上局部重绘、再切成 body/arm 图层的，
// 清单在 character/outfits/outfits.json：
//   [{ id, name, warmth: 0..3, formal: 0..2, rain?: bool, beach?: bool, hair?: 发型名 }]
// 按天气（冷暖、下雨）和场合（正式度、海边）挑一套，最近穿过的往后排。
export const BEACH_SCENES = new Set(['beach', 'pool', 'sunMoonLake']);
export function sceneFormal(scene) {
  return SCENE_FORMAL[scene] ?? (AT_HOME.has(scene) ? 0 : 1);
}

export function scoreLook(look, weather, scene, { recent = [] } = {}) {
  if (look.beach && !BEACH_SCENES.has(scene)) return -Infinity; // 泳装只在海边/泳池
  const target = targetWarmth(weather.temp ?? 22);
  let s = 10;
  s -= 2.5 * Math.abs((look.warmth ?? 1) - target);
  s -= 1.5 * Math.abs((look.formal ?? 1) - sceneFormal(scene));
  const wet = weather.condition === 'rain' && !AT_HOME.has(scene);
  if (wet && look.rain) s += 2;
  if (!wet && look.rain) s -= 1;
  if (look.beach) s += 3; // 到了海边就穿泳装
  const i = recent.indexOf(look.id);
  if (i >= 0) s -= 2 / (i + 1);
  return s;
}

export function chooseLook(looks, weather, scene, opts = {}) {
  let best = null; let bestScore = -Infinity;
  for (const look of looks ?? []) {
    const s = scoreLook(look, weather, scene, opts) + (opts.random ?? Math.random)() * 0.5;
    if (s > bestScore) { best = look; bestScore = s; }
  }
  return best;
}

export function hairForLook(look, scene) {
  if (look?.hair && HAIR_STYLES[look.hair]) return look.hair;
  return HAIR_BY_SCENE[scene] ?? 'straight';
}
