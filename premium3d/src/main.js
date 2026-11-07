import * as THREE from 'three';
import { Avatar } from './avatar.js';
import { Puppet2D } from './puppet2d.js';
import { SceneManager, SCENE_LABELS, WEATHER_LABELS } from './scenes.js';
import { LipSync } from './lipsync.js';
import { planUtterance } from './intent.js';
import { GESTURE_LABELS } from './gestures.js';
import { Dresser, dominantColor, compressImage } from './dress.js';
import { chooseOutfit, SLOTS, newItemFromUpload, hairFor, chooseLook, hairForLook, HAIR_STYLES } from './wardrobe.js';
import { loadItems, saveItem, deleteItem, recentWorn, recordWorn, loadBackgrounds, saveBackground, deleteBackground } from './store.js';
import { Backdrop, candidates } from './backdrop.js';
import { fetchWeather } from './weather.js';
import { connectBridge } from './bridge-client.js';
import { PaintedRenderer, paintCharacter } from './style.js';
import { cycle, REMOTE_GESTURES } from './remote.js';

const params = new URLSearchParams(location.search);
// 形象参考：黑色长直发、左脸泪痣（坐标是相对头骨的位置，换模型时要重新对）
const STYLE = params.get('style') || 'painted'; // painted = 手绘温暖风，plain = 原始渲染
const LOOK = params.has('rawlook') ? {} : {
  hairColor: '#2b2321', mole: [0.027, 0.034, 0.0918],
  ...(STYLE === 'painted' ? { irisScale: 0.74, irisColor: '#7a5a48' } : {}),
};
const $ = (s) => document.querySelector(s);

// ---------- 渲染器（自适应任意尺寸屏幕） ----------
const canvas = $('#stage');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: params.has('capture') });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, Number(params.get('dpr')) || 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = (new URLSearchParams(location.search).get('style') || 'painted') === 'painted' ? THREE.NeutralToneMapping : THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
const scenes = new SceneManager(scene, { painted: STYLE === 'painted' });
const painted = STYLE === 'painted' ? new PaintedRenderer(renderer, scene, camera) : null;
const vrmAvatar = new Avatar(scene);
let avatar = vrmAvatar;
const backdrop = new Backdrop(scene, camera);
const dresser = new Dresser(avatar);
const lips = new LipSync();

// 取景：竖屏看全身，横屏看大半身；人物始终在画面中间
const frame = { headY: 1.45, footY: 0 };
function layout() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  painted?.setSize(w, h);
  camera.aspect = w / h;
  const portrait = Math.min(Math.max((1.2 - camera.aspect) / 0.7, 0), 1); // 1=竖屏 0=横屏
  const top = frame.headY + (avatar.isPuppet ? 0.5 : 0.32); // 2D 挥手/欢呼时手会举过头顶
  // 2D 小柚：竖屏取到膝盖左右，人物更大，点头眨眼看得清；3D 版仍是全身
  const fullBottom = avatar.isPuppet ? frame.headY * 0.3 : frame.footY + 0.12;
  const bottom = THREE.MathUtils.lerp(frame.headY * 0.25, fullBottom, portrait);
  const span = top - bottom;
  const centerY = (top + bottom) / 2;
  camera.fov = 30;
  const vHalf = THREE.MathUtils.degToRad(camera.fov / 2);
  let dist = (span / 2 / Math.tan(vHalf)) * 1.08;
  // 窄屏还要保证张开手臂不出画
  const hHalf = Math.atan(Math.tan(vHalf) * camera.aspect);
  dist = Math.max(dist, (avatar.isPuppet ? 0.42 : 0.75) / Math.tan(hHalf));
  camera.position.set(0, centerY + 0.05, dist);
  camera.lookAt(0, centerY, 0);
  // 宽屏且面板打开时，把人物放到面板左边剩余区域的中间
  const panel = document.body.classList.contains('panel-hidden') ? 0 : $('#panel')?.offsetWidth ?? 0;
  if (panel && camera.aspect > 1.2 && panel < w * 0.5) camera.setViewOffset(w, h, panel / 2, 0, w, h);
  else camera.clearViewOffset();
  camera.updateProjectionMatrix();
  backdrop.fit();
}

// 有背景图就用 2.5D（画 + 人物），没有就用程序化 3D 场景
async function refreshBackdrop() {
  const used = await backdrop.show(state.scene, state.weather);
  if (scenes.current) scenes.current.group.visible = !used;
  scenes.sky.visible = !used;
  if (scenes.particles) scenes.particles.visible = !used || scenes.current?.outdoor;
  const label = $('#bgStatus');
  if (label) label.textContent = used ? '当前：背景图' : '当前：3D 场景（没有背景图）';
}
window.addEventListener('resize', layout);

// ---------- 状态 ----------
const state = {
  scene: params.get('scene') || 'home',
  weather: { temp: Number(params.get('temp') ?? 22), condition: params.get('weather') || 'sunny', night: params.has('night') },
  items: [],
  outfit: null,
  looks: [],
  look: null,
  voice: !params.has('mute'),
  speaking: null,
};

// ---------- 场景切换（淡入淡出） ----------
const fader = $('#fade');
let sceneSwitch = Promise.resolve();
function switchScene(key) {
  if (!SCENE_LABELS[key] || key === scenes.key) return sceneSwitch;
  sceneSwitch = sceneSwitch.then(async () => {
    fader.classList.add('on');
    await wait(450);
    scenes.set(key);
    state.scene = key;
    await refreshBackdrop();
    await dressAuto();
    fader.classList.remove('on');
    syncUI();
  });
  return sceneSwitch;
}

function setWeather(w) {
  state.weather = { ...state.weather, ...w };
  scenes.setWeather(state.weather);
  refreshBackdrop();
  dressAuto();
  syncUI();
}

// ---------- 衣橱 ----------
async function dressAuto({ announce = false } = {}) {
  if (!avatar.vrm && !avatar.isPuppet) return;
  const outfit = chooseOutfit(state.items, state.weather, state.scene, { recent: recentWorn() });
  state.outfit = outfit;
  if (!avatar.isPuppet) await dresser.apply(outfit);
  else if (state.looks.length) {
    // 2D 小柚：整套穿搭（character/outfits/），发型跟着这套走
    const look = chooseLook(state.looks, state.weather, state.scene, { recent: recentWorn() });
    state.look = look;
    await avatar.setOutfit?.(look?.id);
    await avatar.setHair?.(hairForLook(look, state.scene));
    if (look) { recordWorn([look.id]); outfit.say = `今天穿${look.name}～`; }
  } else await avatar.setHair?.(hairFor(outfit, state.scene));
  if (!(avatar.isPuppet && state.looks.length)) recordWorn(Object.values(outfit.items).map((i) => i.id));
  renderWardrobe();
  if (announce) say(outfit.say);
}

async function wearManually(item) {
  const items = { ...(state.outfit?.items ?? {}) };
  if (items[item.slot]?.id === item.id && !['top', 'bottom', 'shoes'].includes(item.slot)) delete items[item.slot];
  else items[item.slot] = item;
  state.outfit = { items, say: '' };
  if (!avatar.isPuppet) await dresser.apply(state.outfit);
  renderWardrobe();
}

// ---------- 说话：话语 → 场景 / 表情 / 动作 / 口型 ----------
async function say(text, msg = {}) {
  if (!text) return;
  stopSpeaking();
  const plan = planUtterance(text, { scene: msg.scene, emotion: msg.emotion });
  $('#caption').textContent = text;
  $('#caption').classList.add('on');
  logPlan(plan);
  if (plan.weather && plan.weather !== state.weather.condition) {
    state.weather = { ...state.weather, condition: plan.weather };
    scenes.setWeather(state.weather);
    refreshBackdrop();
  }
  if (plan.scene && plan.scene !== scenes.key) await switchScene(plan.scene);
  else if (plan.weather) await dressAuto();
  syncUI();
  avatar.setEmotion(plan.emotion);

  const fired = new Set();
  const fireAt = (charIndex) => {
    for (const [i, b] of plan.beats.entries()) {
      if (!fired.has(i) && charIndex >= b.start) {
        fired.add(i);
        if (b.gesture) avatar.play(b.gesture);
      }
    }
  };
  const token = {};
  state.speaking = token;
  const done = () => {
    if (state.speaking !== token) return;
    state.speaking = null;
    lips.stop();
    setTimeout(() => { if (!state.speaking) { avatar.setEmotion('neutral'); $('#caption').classList.remove('on'); } }, 1500);
  };

  if (msg.audioUrl) {
    const audio = new Audio(msg.audioUrl);
    audio.crossOrigin = 'anonymous';
    await new Promise((r) => { audio.onloadedmetadata = r; audio.onerror = r; });
    const dur = audio.duration || text.length / 4.6;
    for (const b of plan.beats) setTimeout(() => fireAt(b.start), (dur * b.start / text.length) * 1000);
    await lips.playAudio(audio);
    done();
  } else if (state.voice && 'speechSynthesis' in window) {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'zh-CN';
    u.rate = 1.05;
    u.pitch = 1.2;
    const v = speechSynthesis.getVoices().find((x) => /zh[-_]CN/i.test(x.lang) && /Ting|Mei|Xiao|female|女/i.test(x.name))
      || speechSynthesis.getVoices().find((x) => /zh/i.test(x.lang));
    if (v) u.voice = v;
    u.onstart = () => { lips.startText(text); fireAt(0); };
    u.onboundary = (e) => { lips.setCharIndex(e.charIndex); fireAt(e.charIndex); };
    u.onend = done;
    u.onerror = () => silent();
    speechSynthesis.speak(u);
  } else {
    silent();
  }

  function silent() {
    // 没有声音也按文字节奏动嘴、做动作
    lips.startText(text);
    const rate = lips.textRate;
    for (const b of plan.beats) setTimeout(() => state.speaking === token && fireAt(b.start), (b.start / rate) * 1000);
    setTimeout(done, (text.length / rate) * 1000 + 300);
  }
}

function stopSpeaking() {
  state.speaking = null;
  if ('speechSynthesis' in window) speechSynthesis.cancel();
  lips.stop();
}

function setConversationState(s) {
  // 听 / 想 / 说 / 待机：ESP32 状态接口直接映射
  if (s === 'listening') { avatar.setEmotion('relaxed'); avatar.play('nod'); }
  if (s === 'thinking') avatar.play('think');
  if (s === 'idle') avatar.setEmotion('neutral');
  $('#status').textContent = { listening: '在听…', thinking: '在想…', speaking: '在说…', idle: '' }[s] ?? '';
}

// ---------- 桥接（ESP32 → 状态接口 → 这里） ----------
function handleMessage(m) {
  switch (m.type) {
    case 'say': return say(m.text, m);
    case 'state': return setConversationState(m.state);
    case 'scene': return switchScene(m.scene);
    case 'weather': return setWeather(m);
    case 'level': return lips.pushLevel(m.v);
    case 'gesture': return avatar.play(m.name);
    case 'emotion': return avatar.setEmotion(m.emotion);
    case 'outfit': return dressAuto({ announce: !!m.announce });
    case 'hair': return avatar.setHair?.(m.name);
    case 'look': return avatar.setOutfit?.(m.name);
    case 'remote': return remoteAction(m.action);
    default: return null;
  }
}

// ---------- 摇杆遥控器 ----------
let toastTimer;
function toast(text) {
  const el = $('#toast');
  el.textContent = text;
  el.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('on'), 1800);
}

async function stepLook(step) {
  if (!avatar.isPuppet || !state.looks.length) return dressAuto();
  const look = cycle(state.looks, state.looks.find((l) => l.id === state.look?.id), step);
  state.look = look;
  toast(`换衣服：${look.name ?? look.id}`);
  await avatar.setOutfit?.(look.id);
  await avatar.setHair?.(hairForLook(look, state.scene));
}

function remoteAction(action) {
  lips.ensureCtx();
  switch (action) {
    case 'nextLook': return stepLook(1);
    case 'prevLook': return stepLook(-1);
    case 'nextScene':
    case 'prevScene': {
      const key = cycle(Object.keys(SCENE_LABELS), state.scene, action === 'nextScene' ? 1 : -1);
      toast(`换场景：${SCENE_LABELS[key]}`);
      return switchScene(key);
    }
    case 'gesture': {
      const g = cycle(REMOTE_GESTURES, state.remoteGesture);
      state.remoteGesture = g;
      toast(GESTURE_LABELS[g] ?? g);
      return avatar.play(g);
    }
    case 'outfit': return dressAuto({ announce: true });
    case 'hair': {
      if (!avatar.setHair) return null;
      const h = cycle(Object.keys(HAIR_STYLES), avatar.hairStyle ?? 'straight');
      toast(`换发型：${HAIR_STYLES[h]}`);
      return avatar.setHair?.(h);
    }
    case 'panel': document.body.classList.toggle('panel-hidden'); return layout();
    default: return null;
  }
}
window.xiaoyou = { say, handleMessage, avatar, scenes, state, camera, layout, dresser, THREE };

// ---------- 控制面板 ----------
function syncUI() {
  for (const b of document.querySelectorAll('[data-scene]')) b.classList.toggle('on', b.dataset.scene === state.scene);
  for (const b of document.querySelectorAll('[data-weather]')) b.classList.toggle('on', b.dataset.weather === state.weather.condition);
  $('#temp').value = state.weather.temp;
  $('#tempLabel').textContent = `${state.weather.temp}°C`;
  $('#night').checked = !!state.weather.night;
}

function buildUI() {
  $('#scenes').innerHTML = Object.entries(SCENE_LABELS).map(([k, v]) => `<button data-scene="${k}">${v}</button>`).join('');
  $('#weathers').innerHTML = Object.entries(WEATHER_LABELS).map(([k, v]) => `<button data-weather="${k}">${v}</button>`).join('');
  $('#gestures').innerHTML = Object.entries(GESTURE_LABELS).map(([k, v]) => `<button data-gesture="${k}">${v}</button>`).join('');
  $('#slot').innerHTML = Object.entries(SLOTS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
  document.addEventListener('click', (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    lips.ensureCtx();
    if (t.dataset.scene) switchScene(t.dataset.scene);
    if (t.dataset.weather) setWeather({ condition: t.dataset.weather });
    if (t.dataset.gesture) avatar.play(t.dataset.gesture);
    if (t.dataset.sample) { $('#text').value = t.dataset.sample; say(t.dataset.sample); }
    if (t.dataset.wear) wearManually(state.items.find((i) => i.id === t.dataset.wear));
    if (t.dataset.del) removeItem(t.dataset.del);
  });
  $('#sayBtn').onclick = () => say($('#text').value.trim());
  $('#text').addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) say($('#text').value.trim()); });
  $('#voice').checked = state.voice;
  $('#voice').onchange = (e) => { state.voice = e.target.checked; };
  $('#temp').oninput = (e) => { $('#tempLabel').textContent = `${e.target.value}°C`; };
  $('#temp').onchange = (e) => setWeather({ temp: Number(e.target.value) });
  $('#night').onchange = (e) => setWeather({ night: e.target.checked });
  $('#autoDress').onclick = () => dressAuto({ announce: true });
  $('#liveWeather').onclick = liveWeather;
  $('#audioFile').onchange = (e) => {
    const f = e.target.files[0];
    if (f) say($('#text').value.trim() || '（音频）', { audioUrl: URL.createObjectURL(f) });
  };
  $('#vrmFile').onchange = async (e) => {
    const f = e.target.files[0];
    if (f) await loadModel(URL.createObjectURL(f));
  };
  $('#upload').onsubmit = uploadItem;
  $('#bgFile').onchange = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const image = await compressImage(f, 2560);
    const key = $('#bgScope').value === 'weather' ? `${state.scene}-${state.weather.condition}` : state.scene;
    await saveBackground(key, image);
    backdrop.uploads.set(key, image);
    e.target.value = '';
    refreshBackdrop();
  };
  $('#bgClear').onclick = async () => {
    for (const key of candidates(state.scene, state.weather, { fallback: false })) { backdrop.uploads.delete(key); await deleteBackground(key); }
    refreshBackdrop();
  };
  $('#togglePanel').onclick = () => { document.body.classList.toggle('panel-hidden'); layout(); };
  window.addEventListener('keydown', (e) => { if (e.key === 'h' && e.target === document.body) { document.body.classList.toggle('panel-hidden'); layout(); } });
  if (params.has('kiosk')) document.body.classList.add('panel-hidden');
}

async function liveWeather() {
  const btn = $('#liveWeather');
  btn.textContent = '获取中…';
  try {
    const pos = await new Promise((res) => navigator.geolocation
      ? navigator.geolocation.getCurrentPosition((p) => res(p.coords), () => res(null), { timeout: 5000 })
      : res(null));
    const w = await fetchWeather(pos?.latitude ?? 31.23, pos?.longitude ?? 121.47);
    setWeather(w);
    btn.textContent = `实时：${WEATHER_LABELS[w.condition]} ${w.temp}°C`;
  } catch {
    btn.textContent = '获取失败，点我重试';
  }
}

async function uploadItem(e) {
  e.preventDefault();
  const f = $('#clothFile').files[0];
  if (!f) return;
  const image = await compressImage(f);
  const color = await dominantColor(image);
  const item = newItemFromUpload({
    name: $('#clothName').value.trim(),
    slot: $('#slot').value,
    warmth: Number($('#warmth').value),
    formal: Number($('#formal').value),
    image, color,
  });
  await saveItem(item);
  state.items = await loadItems();
  e.target.reset();
  await wearManually(item);
  say(`谢谢！这件${item.name}我收进衣橱啦，先穿上给你看看。`);
}

async function removeItem(id) {
  const item = state.items.find((i) => i.id === id);
  if (!item) return;
  await deleteItem(item);
  state.items = await loadItems();
  await dressAuto();
}

function renderWardrobe() {
  const worn = new Set(Object.values(state.outfit?.items ?? {}).map((i) => i.id));
  const groups = Object.entries(SLOTS).map(([slot, label]) => {
    const list = state.items.filter((i) => i.slot === slot);
    if (!list.length) return '';
    return `<div class="slot"><h4>${label}</h4><div class="items">${list.map((i) => `
      <div class="item ${worn.has(i.id) ? 'worn' : ''}">
        <button class="swatch" data-wear="${i.id}" title="穿上 / 脱下"
          style="background:${i.image ? `url(${i.image}) center/cover` : i.color}"></button>
        <span>${i.name}</span>
        ${i.builtin ? '' : `<button class="del" data-del="${i.id}" title="删除">×</button>`}
      </div>`).join('')}</div></div>`;
  });
  $('#wardrobe').innerHTML = groups.join('');
  $('#outfitSay').textContent = state.outfit?.say ?? '';
}

function logPlan(plan) {
  const g = plan.beats.map((b) => `「${b.text.trim()}」→ ${b.gesture ? GESTURE_LABELS[b.gesture] : '—'}`).join('\n');
  $('#plan').textContent = `场景：${plan.scene ? SCENE_LABELS[plan.scene] : '不变'}　天气：${plan.weather ? WEATHER_LABELS[plan.weather] : '不变'}　表情：${plan.emotion}\n${g}`;
}

// 2D 小柚的整套穿搭清单；没有就退回到按单品选（只换发型）
async function loadLooks(base) {
  try {
    const r = await fetch(`${base}/outfits/outfits.json`, { cache: 'no-store' });
    if (r.ok) { const j = await r.json(); if (Array.isArray(j)) return j.filter((l) => l && l.id); }
  } catch { /* 没有就算了 */ }
  return [];
}

// 2D 手绘小柚：character/ 文件夹里有 points.json 就用它（?character=路径 可指定，?model=xx.vrm 强制用 3D）
async function loadPuppet(base) {
  try {
    const r = await fetch(`${base}/points.json`, { cache: 'no-store' });
    if (!r.ok) return false;
    await r.json();
  } catch { return false; }
  $('#loading').classList.add('on');
  const puppet = new Puppet2D(scene);
  await puppet.load(base);
  state.looks = await loadLooks(base);
  if (avatar.isPuppet) avatar.dispose();
  avatar = puppet;
  window.xiaoyou.avatar = puppet;
  frame.headY = puppet.headY;
  layout();
  await dressAuto();
  $('#loading').classList.remove('on');
  return true;
}

async function loadModel(url) {
  $('#loading').classList.add('on');
  if (avatar.isPuppet) { avatar.dispose(); avatar = vrmAvatar; window.xiaoyou.avatar = vrmAvatar; }
  await avatar.load(url);
  dresser.originals.clear();
  const head = avatar.bone('head');
  if (head) {
    avatar.vrm.scene.updateMatrixWorld(true);
    frame.headY = head.getWorldPosition(new THREE.Vector3()).y;
    avatar.lookTarget.position.set(0, frame.headY, 3);
  }
  layout();
  if (STYLE === 'painted') paintCharacter(avatar.materials);
  dresser.applyLook(LOOK);
  await dressAuto();
  $('#loading').classList.remove('on');
}

// ---------- 主循环 ----------
// 自动降分辨率：大屏（如 5K 竖屏）跑不满 60 帧时逐步降低渲染像素比，够快时再升回去
const maxDpr = Math.min(window.devicePixelRatio, Number(params.get('dpr')) || 2);
let dpr = maxDpr;
let slowSeconds = 0;
let fastSeconds = 0;
function adaptResolution(fps) {
  if (params.has('dpr') || document.hidden) return;
  if (fps < 50) { slowSeconds++; fastSeconds = 0; } else if (fps >= 58) { fastSeconds++; slowSeconds = 0; }
  if (slowSeconds >= 2 && dpr > 0.75) { dpr = Math.max(0.75, dpr - 0.25); renderer.setPixelRatio(dpr); layout(); slowSeconds = 0; }
  if (fastSeconds >= 10 && dpr < maxDpr) { dpr = Math.min(maxDpr, dpr + 0.25); renderer.setPixelRatio(dpr); layout(); fastSeconds = 0; }
}

const clock = new THREE.Clock();
let fpsFrames = 0;
let fpsT = performance.now();
function tick() {
  const dt = Math.min(clock.getDelta(), 0.05);
  fpsFrames++;
  if (performance.now() - fpsT > 1000) {
    const el = $('#fps');
    if (el) el.textContent = `${fpsFrames} fps · ${renderer.domElement.width}×${renderer.domElement.height}`;
    adaptResolution(fpsFrames);
    fpsFrames = 0; fpsT = performance.now();
  }
  avatar.mouth = lips.update(dt);
  avatar.update(dt);
  if (!avatar.isPuppet) dresser.update();
  scenes.update(dt);
  if (painted) painted.render(dt);
  else renderer.render(scene, camera);
  requestAnimationFrame(tick);
}

function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }

(async function init() {
  buildUI();
  scenes.weather = state.weather;
  scenes.set(state.scene);
  layout();
  syncUI();
  state.items = await loadItems();
  await backdrop.loadManifest('./backgrounds/manifest.json');
  try { for (const b of await loadBackgrounds()) backdrop.uploads.set(b.key, b.image); } catch { /* 浏览器不支持就跳过 */ }
  await refreshBackdrop();
  tick();
  const usePuppet = !params.has('model') && await loadPuppet(params.get('character') || './character');
  if (!usePuppet) await loadModel(params.get('model') || './models/sample.vrm');
  connectBridge(params.get('bridge') || `ws://${location.hostname || 'localhost'}:8765`, handleMessage, (ok) => {
    $('#bridge').textContent = ok ? 'ESP32 桥接：已连接' : 'ESP32 桥接：未连接';
    $('#bridge').classList.toggle('ok', ok);
  });
  if (params.get('say')) say(params.get('say'));
  if (params.get('gesture')) avatar.play(params.get('gesture'));
  window.__ready = true;
})();
