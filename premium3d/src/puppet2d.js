import * as THREE from 'three';

// 2D 手绘小柚：ComfyUI 出的立绘拆成分层 PNG，这里用「网格变形」让她动起来（简化版绑骨，不依赖 Live2D）。
// 接口和 3D 的 Avatar 一样：play(动作) / setEmotion(情绪) / mouth(0..1 音量) / update(dt)，
// 所以话语→动作、场景、天气、ESP32 状态接口都不用改。
//
// 资产（character/ 文件夹，全部同一画布尺寸、透明背景、部件在原位置）：
//   hair_back.png body.png arm_l.png arm_r.png [arm_r_wave.png] head.png brows.png hair_front.png
//   eyes_open.png eyes_closed.png eyes_smile.png
//   mouth_closed.png mouth_half.png mouth_open.png mouth_smile.png
//   points.json：关键点像素坐标（左上为原点，y 向下），见 character/README.md
// arm_l = 画面左边的手臂，arm_r = 画面右边的手臂。

// 图层从后往前；group 决定跟哪个部位一起动；depth 是假转头时的前后层次（越大越靠前，移动越多）
const LAYERS = [
  { id: 'hairBack', group: 'head', depth: -0.5, hair: true, sprites: { default: 'hair_back.png' } },
  { id: 'body', group: 'body', hem: true, sprites: { default: 'body.png' } },
  { id: 'armL', group: 'armL', sprites: { default: 'arm_l.png' } },
  // arm_r_face.png（可选）：右手抬到下巴/嘴边的整条手臂，托腮、吃东西、喝奶茶、飞吻用；没有就用肘部弯折近似（手只到胸口）
  { id: 'armR', group: 'armR', sprites: { default: 'arm_r.png', wave: 'arm_r_wave.png', face: 'arm_r_face.png' } },
  { id: 'head', group: 'head', depth: 0.35, face: true, sprites: { default: 'head.png' } },
  { id: 'eyes', group: 'head', depth: 0.75, sprites: { open: 'eyes_open.png', closed: 'eyes_closed.png', smile: 'eyes_smile.png', wink: 'eyes_wink.png', default: 'eyes_open.png' } },
  { id: 'brows', group: 'head', depth: 0.8, sprites: { default: 'brows.png' } },
  { id: 'mouth', group: 'head', depth: 0.65, sprites: { closed: 'mouth_closed.png', half: 'mouth_half.png', open: 'mouth_open.png', smile: 'mouth_smile.png', default: 'mouth_closed.png' } },
  // 脸红：有 blush.png 就用画好的；没有就按 points.json 的 eyes/mouth（或 cheeks）程序化画两团粉色
  { id: 'blush', group: 'head', depth: 0.7, procedural: 'blush', fade: true, sprites: { default: 'blush.png' } },
  { id: 'tears', group: 'head', depth: 0.72, procedural: 'tears', fade: true, sprites: { default: 'tears.png' } },
  { id: 'hairFront', group: 'head', depth: 1.0, hair: true, sprites: { default: 'hair_front.png' } },
];

// 动作：手臂外展角度（弧度，正 = 向外张开）、头的歪/转/点、持续时间
export const PUPPET_GESTURES = {
  // elbowR/elbowL：小臂绕肘弯起的角度（没有 arm_r_wave.png 时靠它挥手）
  wave: { duration: 2.6, armR: 0.42, elbowR: 2.25, elbowROsc: [0.32, 1.8], spriteR: 'wave', tilt: 0.05, turn: 0.25, eyes: 'smile' },
  nod: { duration: 1.8, nod: 1 },
  shake: { duration: 1.4, shake: 1 },
  think: { duration: 2.8, tilt: 0.09, turn: 0.45, lookUp: 1, armR: -0.05 },
  point: { duration: 2.2, armR: 0.65, turn: 0.4, tilt: 0.03 },
  shrug: { duration: 1.9, armR: 0.15, armL: 0.15, shoulders: 1, tilt: 0.08 },
  bow: { duration: 2.2, bow: 1, eyes: 'closed' },
  cheer: { duration: 1.9, armR: 0.3, armL: 0.3, elbowR: 2.0, elbowL: 2.0, bounce: 1, eyes: 'smile' },
  heart: { duration: 2.3, armR: -0.12, armL: -0.12, tilt: 0.1, eyes: 'smile' },
  sad: { duration: 2.6, down: 1, armR: -0.04, armL: -0.04 },
  shy: { duration: 2.8, blush: 1, tilt: 0.08, turn: -0.35, nod0: 0.35, eyes: 'smile', armR: -0.06, armL: -0.06 },
  talk: { duration: 1.8, armR: 0.14, armROsc: [0.05, 0.9], turn: 0.15 },
  // ---- 11-07 从聊天记录补的动作。值可以是函数 (u 0..1 进度, gt 秒) → 数值，用来做分段动作 ----
  hug: { duration: 2.6, armR: 0.36, armL: 0.36, elbowR: 0.55, elbowL: 0.55, tilt: 0.06, bounce: 0.4, eyes: 'smile', blush: 0.35 },
  kiss: {
    duration: 2.4, blush: 0.5, tilt: 0.07,
    spriteR: (u) => (u < 0.45 ? 'face' : null),
    armR: (u) => (u < 0.45 ? 0.2 : 0.2 + 0.25 * smooth((u - 0.45) / 0.3)),
    elbowR: (u) => (u < 0.45 ? -1.9 : -1.9 + 2.5 * smooth((u - 0.45) / 0.3)),
    eyes: (u) => (u < 0.45 ? 'closed' : 'smile'),
    mouth: (u) => (u < 0.45 ? 'closed' : 'smile'),
  },
  chin: { duration: 3.2, spriteR: 'face', armR: 0.08, elbowR: -2.6, tilt: -0.11, turn: 0.2, eyes: 'smile' },
  cry: { duration: 3.0, tears: 1, eyes: 'closed', mouth: 'half', down: 1, sob: 1, armR: 0.04, armL: 0.04, elbowR: -1.5, elbowL: -1.5 },
  angry: { duration: 2.2, turn: -0.7, lookUp: 0.6, tilt: -0.05, eyes: 'closed', mouth: 'closed', armR: 0.1, armL: 0.1, hop: 1 },
  eat: { duration: 2.8, spriteR: 'face', armR: 0.08, elbowR: -2.4, elbowROsc: [0.22, 1.4], eyes: 'smile', mouth: (u, gt) => (Math.sin(gt * 9) > 0 ? 'half' : 'closed') },
  cute: { duration: 2.6, tiltOsc: [0.11, 1.5], bounce: 0.35, eyes: 'smile', blush: 0.4, mouth: 'smile' },
  drink: { duration: 2.8, spriteR: 'face', armR: 0.08, elbowR: -2.55, lookUp: (u) => 0.45 * Math.sin(Math.PI * u), eyes: (u) => (u > 0.3 && u < 0.75 ? 'closed' : 'smile') },
  laugh: { duration: 2.2, lookUp: 0.8, bounce: 0.8, eyes: 'smile', mouth: 'open', armR: 0.05, armL: 0.05 },
  wink: { duration: 1.8, eyes: 'wink', tilt: 0.1, turn: 0.2, mouth: 'smile' },
  yawn: {
    duration: 3.2, eyes: 'closed', lookUp: 0.45, tilt: 0.05,
    mouthScale: (u) => 1 + 0.9 * Math.sin(Math.PI * Math.min(1, Math.max(0, (u - 0.12) / 0.6))),
    mouth: (u) => (u > 0.15 && u < 0.7 ? 'open' : 'closed'),
    armR: (u) => 0.28 * Math.sin(Math.PI * u), armL: (u) => 0.28 * Math.sin(Math.PI * u),
    elbowR: (u) => 1.9 * Math.sin(Math.PI * u), elbowL: (u) => 1.9 * Math.sin(Math.PI * u),
  },
  surprised: { duration: 1.6, lookUp: 0.35, eyes: 'open', mouth: 'open', armR: 0.12, armL: 0.12, shoulders: 1, hop: 1 },
  // 手够不到耳朵（要专门的手臂图），先做成缩脖子、闭眼、摇头的“不听不听”
  coverEars: { duration: 2.4, shoulders: 1, eyes: 'closed', mouth: 'closed', shake: 0.45, nod0: 0.3, armR: -0.04, armL: -0.04 },
  leaveBack: {
    duration: 3.2,
    turn: (u) => (u < 0.55 ? -0.85 : -0.85 + 1.15 * smooth((u - 0.55) / 0.2)),
    shiftX: (u) => -0.05 * Math.sin(Math.PI * Math.min(1, u / 0.85)),
    eyes: (u) => (u < 0.55 ? 'closed' : 'smile'),
    mouth: (u) => (u < 0.55 ? 'closed' : 'smile'),
  },
};

// 某个动作在进度 u 时的参数（函数值展开成数值）
export function resolveGesture(G, gt) {
  const u = Math.min(Math.max(gt / G.duration, 0), 1);
  const g = {};
  for (const [k, v] of Object.entries(G)) g[k] = typeof v === 'function' ? v(u, gt) : v;
  return g;
}

const smooth = (x) => { x = Math.min(Math.max(x, 0), 1); return x * x * (3 - 2 * x); };
const clamp01 = (x) => Math.min(Math.max(x, 0), 1);

function loadImage(url) {
  return new Promise((res) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => res(null);
    img.src = url;
  });
}

// 不透明区域的包围盒（只在这块区域铺网格，省顶点也让网格更密）
function alphaBox(img) {
  const step = 4;
  const c = document.createElement('canvas');
  c.width = Math.ceil(img.width / step); c.height = Math.ceil(img.height / step);
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0, c.width, c.height);
  const d = g.getImageData(0, 0, c.width, c.height).data;
  let x0 = c.width; let y0 = c.height; let x1 = -1; let y1 = -1;
  for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
    if (d[(y * c.width + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  if (x1 < 0) return null;
  const pad = 2;
  return [Math.max(0, (x0 - pad) * step), Math.max(0, (y0 - pad) * step), Math.min(img.width, (x1 + 1 + pad) * step), Math.min(img.height, (y1 + 1 + pad) * step)];
}

// 两团柔和的腮红，画在和人物同尺寸（缩小 4 倍）的透明画布上，UV 直接对齐原图
function blushCanvas(W, H, p) {
  const s = 4;
  const c = document.createElement('canvas');
  c.width = Math.ceil(W / s); c.height = Math.ceil(H / s);
  const g = c.getContext('2d');
  const eyes = p.eyes ?? [W / 2, H * 0.12];
  const mouth = p.mouth ?? [eyes[0], eyes[1] + H * 0.03];
  const d = Math.max(H * 0.012, mouth[1] - eyes[1]);
  const cheeks = p.cheeks ?? [[eyes[0] - d * 1.05, eyes[1] + d * 0.55], [eyes[0] + d * 1.05, eyes[1] + d * 0.55]];
  const r = (p.blushRadius ?? d * 0.42) / s;
  for (const [x, y] of cheeks) {
    g.save();
    g.translate(x / s, y / s);
    g.scale(1.45, 1);
    const grd = g.createRadialGradient(0, 0, 0, 0, 0, r);
    grd.addColorStop(0, 'rgba(240,110,120,0.55)');
    grd.addColorStop(0.6, 'rgba(240,120,125,0.28)');
    grd.addColorStop(1, 'rgba(240,130,130,0)');
    g.fillStyle = grd;
    g.fillRect(-r, -r, 2 * r, 2 * r);
    g.restore();
  }
  const box = cheeks.reduce((b, [x, y]) => [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)], [W, H, 0, 0]);
  const R = r * s * 1.5 + 8;
  return { canvas: c, box: [Math.max(0, box[0] - R), Math.max(0, box[1] - R), Math.min(W, box[2] + R), Math.min(H, box[3] + R)] };
}

// 没有 eyes_wink.png 时自己拼：画面左半边用睁眼图，右半边用闭眼图（以两眼中点为界）
function winkTexture(openImg, closedImg, midX) {
  const c = document.createElement('canvas');
  c.width = openImg.width; c.height = openImg.height;
  const g = c.getContext('2d');
  g.drawImage(openImg, 0, 0);
  g.clearRect(midX, 0, c.width - midX, c.height);
  g.save();
  g.beginPath(); g.rect(midX, 0, c.width - midX, c.height); g.clip();
  g.drawImage(closedImg, 0, 0);
  g.restore();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// 两道泪痕：从眼睛下方往下流的浅蓝色细条
function tearsCanvas(W, H, p) {
  const s = 4;
  const c = document.createElement('canvas');
  c.width = Math.ceil(W / s); c.height = Math.ceil(H / s);
  const g = c.getContext('2d');
  const eyes = p.eyes ?? [W / 2, H * 0.12];
  const mouth = p.mouth ?? [eyes[0], eyes[1] + H * 0.03];
  const d = Math.max(H * 0.012, mouth[1] - eyes[1]);
  const pts = p.tearStart ?? [[eyes[0] - d * 0.62, eyes[1] + d * 0.18], [eyes[0] + d * 0.62, eyes[1] + d * 0.18]];
  const len = d * 0.75; const wd = Math.max(2, d * 0.07);
  for (const [x, y] of pts) {
    const grd = g.createLinearGradient(0, y / s, 0, (y + len) / s);
    grd.addColorStop(0, 'rgba(150,200,240,0.85)');
    grd.addColorStop(1, 'rgba(150,200,240,0)');
    g.fillStyle = grd;
    g.beginPath();
    g.ellipse(x / s, (y + len / 2) / s, wd / s, len / 2 / s, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(190,225,250,0.9)';
    g.beginPath();
    g.arc(x / s, (y + len * 0.8) / s, (wd * 1.4) / s, 0, Math.PI * 2);
    g.fill();
  }
  const R = d;
  const xs = pts.map((q) => q[0]); const ys = pts.map((q) => q[1]);
  return { canvas: c, box: [Math.max(0, Math.min(...xs) - R), Math.max(0, Math.min(...ys) - R * 0.3), Math.min(W, Math.max(...xs) + R), Math.min(H, Math.max(...ys) + len + R * 0.3)] };
}

function shadowTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 32;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 16, 2, 64, 16, 64);
  grd.addColorStop(0, 'rgba(60,40,30,0.45)');
  grd.addColorStop(1, 'rgba(60,40,30,0)');
  g.fillStyle = grd;
  g.scale(1, 0.5); g.fillRect(0, 0, 128, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Puppet2D {
  constructor(scene) {
    this.scene = scene;
    this.root = new THREE.Group();
    this.root.name = 'puppet2d';
    scene.add(this.root);
    this.layers = [];
    this.byId = {};
    this.active = null;
    this.emotion = 'neutral';
    this.mouth = 0;
    this.time = 0;
    this.blinkTimer = 1.5;
    this.blinkT = -1;
    this.isPuppet = true;
    this.materials = {};
    this.hairLag = 0;
    this.hairVel = 0;
  }

  async load(base) {
    this.base = base.replace(/\/$/, '');
    const p = await (await fetch(`${this.base}/points.json`)).json();
    this.p = p;
    const [W, H] = p.canvas;
    this.W = W; this.H = H;
    const feet = p.feet ?? [W / 2, H];
    const top = p.headTop ?? H * 0.05;
    this.unit = (p.heightMeters ?? 1.6) / (feet[1] - top); // 像素 → 米
    this.origin = feet;
    this.root.clear();
    this.layers = []; this.byId = {};
    for (const [i, def] of LAYERS.entries()) {
      const tex = {};
      let box = null;
      for (const [name, file] of Object.entries(def.sprites)) {
        const img = await loadImage(`${this.base}/${file}`);
        if (!img) continue;
        const t = new THREE.Texture(img);
        t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = 8;
        t.needsUpdate = true;
        tex[name] = t;
        const b = alphaBox(img);
        if (b) box = box ? [Math.min(box[0], b[0]), Math.min(box[1], b[1]), Math.max(box[2], b[2]), Math.max(box[3], b[3])] : b;
      }
      if (!Object.keys(tex).length && def.procedural) {
        const b = (def.procedural === 'tears' ? tearsCanvas : blushCanvas)(W, H, p);
        const t = new THREE.CanvasTexture(b.canvas);
        t.colorSpace = THREE.SRGBColorSpace;
        tex.default = t;
        box = b.box;
      }
      if (def.id === 'eyes' && !tex.wink && tex.open && tex.closed) tex.wink = winkTexture(tex.open.image, tex.closed.image, p.eyes?.[0] ?? W / 2);
      if (!Object.keys(tex).length || !box) continue;
      const layer = this.buildLayer(def, tex, box, i);
      layer.order = i;
      this.layers.push(layer);
      this.byId[def.id] = layer;
    }
    // 脚下的软阴影
    const sh = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.22), new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false, toneMapped: false }));
    sh.position.set(0, 0.005, -0.02);
    sh.renderOrder = 5;
    this.root.add(sh);
    this.shadow = sh;
    this.hairStyle = 'straight';
    this.hairTipY = null;
    this.update(0);
    return this;
  }

  buildLayer(def, tex, box, order) {
    const [x0, y0, x1, y1] = box;
    const segX = Math.min(48, Math.max(2, Math.round((x1 - x0) / 32)));
    const segY = Math.min(64, Math.max(2, Math.round((y1 - y0) / 32)));
    const n = (segX + 1) * (segY + 1);
    const basePx = new Float32Array(n * 2);
    const pos = new Float32Array(n * 3);
    const uv = new Float32Array(n * 2);
    let k = 0;
    for (let j = 0; j <= segY; j++) for (let i = 0; i <= segX; i++, k++) {
      const x = x0 + (x1 - x0) * (i / segX);
      const y = y0 + (y1 - y0) * (j / segY);
      basePx[k * 2] = x; basePx[k * 2 + 1] = y;
      uv[k * 2] = x / this.W; uv[k * 2 + 1] = 1 - y / this.H;
    }
    const idx = [];
    for (let j = 0; j < segY; j++) for (let i = 0; i < segX; i++) {
      const a = j * (segX + 1) + i; const b = a + 1; const c = a + segX + 1; const d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(idx);
    const first = tex.default ?? Object.values(tex)[0];
    const mat = new THREE.MeshBasicMaterial({ map: first, transparent: true, depthWrite: false, depthTest: false, toneMapped: false, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = 10 + order;
    mesh.frustumCulled = false;
    mesh.position.z = order * 0.001;
    this.root.add(mesh);
    if (def.fade) { mat.opacity = 0; mesh.visible = false; }
    this.materials[def.id] = [mat];
    return { def, tex, mesh, mat, basePx, pos, n };
  }

  setSprite(id, name) {
    const L = this.byId[id];
    if (!L) return;
    const t = L.tex[name] ?? L.tex.default;
    if (t && L.mat.map !== t) { L.mat.map = t; L.mat.needsUpdate = true; }
  }

  // 和 3D Avatar 对齐的接口
  bone() { return null; }
  // 换发型：读 hair/<名字>/hair_back.png、hair_front.png（和 hair.json 里的 hairTipY），
  // 换掉当前的前后两层头发；'straight' 或空 = 用 character/ 顶层的默认头发。文件夹不存在就保持不变。
  setHair(style) {
    // 排队执行，连着换几次也不会互相打架
    this.hairQueue = (this.hairQueue ?? Promise.resolve()).then(() => this.loadHair(style)).catch(() => false);
    return this.hairQueue;
  }

  async loadHair(style) {
    style = style || 'straight';
    if (!this.p || style === this.hairStyle) return false;
    const dir = style === 'straight' ? this.base : `${this.base}/hair/${style}`;
    let tip = null;
    if (style !== 'straight') {
      try { const r = await fetch(`${dir}/hair.json`, { cache: 'no-store' }); if (r.ok) tip = (await r.json()).hairTipY ?? null; } catch { /* 没写就用默认 */ }
    }
    const built = [];
    for (const id of ['hairBack', 'hairFront']) {
      const order = LAYERS.findIndex((d) => d.id === id);
      const def = LAYERS[order];
      const img = await loadImage(`${dir}/${def.sprites.default}`);
      if (!img) return false;
      const t = new THREE.Texture(img);
      t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.needsUpdate = true;
      const box = alphaBox(img);
      if (!box) return false;
      built.push({ id, order, def, tex: { default: t }, box });
    }
    for (const b of built) {
      const old = this.byId[b.id];
      const layer = this.buildLayer(b.def, b.tex, b.box, b.order);
      layer.order = b.order;
      if (old) {
        this.root.remove(old.mesh);
        old.mesh.geometry.dispose();
        old.tex.default?.dispose?.();
        this.layers[this.layers.indexOf(old)] = layer;
      } else {
        this.layers.push(layer);
        this.layers.sort((a, c) => a.order - c.order);
      }
      this.byId[b.id] = layer;
    }
    this.hairTipY = tip;
    this.hairStyle = style;
    this.update(0);
    return true;
  }

  play(name) { if (PUPPET_GESTURES[name]) this.active = { name, t: 0 }; }
  setEmotion(e) { this.emotion = e; }
  // 取景用：眼睛高度（米）
  get headY() { return (this.origin[1] - (this.p?.eyes?.[1] ?? this.H * 0.12)) * this.unit; }
  get topY() { return (this.origin[1] - (this.p?.headTop ?? 0)) * this.unit; }

  update(dt) {
    if (!this.p) return;
    this.time += dt;
    const t = this.time;
    const p = this.p;
    const H = this.H;
    // ---------- 当前动作的权重 ----------
    let g = {}; let gt = 0; let w = 0;
    if (this.active) {
      const G = PUPPET_GESTURES[this.active.name];
      this.active.t += dt;
      gt = this.active.t;
      if (gt >= G.duration) this.active = null;
      else { g = resolveGesture(G, gt); w = smooth(Math.min(gt / 0.35, (G.duration - gt) / 0.45)); }
    }
    // ---------- 姿态参数（像素/弧度） ----------
    const breath = Math.sin(t * 1.55) * 0.5 + 0.5;
    let breathPx = breath * H * 0.0022 + (g.shoulders ? w * H * 0.012 * Math.max(0, Math.sin(gt * 4)) : 0);
    if (g.sob) breathPx += w * H * 0.005 * Math.max(0, Math.sin(gt * 13)); // 抽泣：肩膀快速一抽一抽
    const bodyRot = 0.004 * Math.sin(t * 0.5) + 0.002 * Math.sin(t * 0.83);
    let bounce = g.bounce ? Math.abs(Math.sin(gt * 7.5)) * H * 0.012 * g.bounce * w : 0;
    if (g.hop) bounce += Math.max(0, Math.sin(Math.min(gt, 0.4) * Math.PI / 0.4)) * H * 0.01 * g.hop; // 开头轻轻一跳
    const shiftX = (g.shiftX ?? 0) * H * w;
    // 头：歪（绕脖子转）、假转头（分层视差）、点头
    let tilt = 0.022 * Math.sin(t * 0.43) + 0.009 * Math.sin(t * 0.97) + (g.tilt ?? 0) * w;
    if (g.tiltOsc) tilt += Math.sin(gt * Math.PI * 2 * g.tiltOsc[1]) * g.tiltOsc[0] * w;
    if (this.emotion === 'happy') tilt += 0.03;
    let turn = 0.18 * Math.sin(t * 0.31) + (g.turn ?? 0) * w;
    if (g.shake) turn += Math.sin(gt * 11) * 0.7 * g.shake * w;
    let nod = (g.lookUp ? -0.5 * g.lookUp * w : 0);
    if (g.nod) nod += Math.max(0, Math.sin(gt * 7)) * w; // 点两下
    if (g.bow) nod += 1.6 * w;
    if (g.nod0) nod += g.nod0 * w;
    if (g.down || this.emotion === 'sad') nod += 0.6 * (g.down ? w : 1);
    // 手臂外展
    const armIdle = 0.012 * Math.sin(t * 1.55);
    let armR = armIdle + (g.armR ?? 0) * w;
    let armL = armIdle + (g.armL ?? 0) * w;
    if (g.armROsc) armR += Math.sin(gt * Math.PI * 2 * g.armROsc[1]) * g.armROsc[0] * w;
    const waveSprite = g.spriteR && this.byId.armR?.tex[g.spriteR]; // 有专门的手臂图就不靠弯肘
    let bendR = waveSprite ? 0 : (g.elbowR ?? 0) * w;
    const bendL = (g.elbowL ?? 0) * w;
    if (g.elbowROsc && !waveSprite) bendR += Math.sin(gt * Math.PI * 2 * g.elbowROsc[1]) * g.elbowROsc[0] * w;
    // 头发惯性：头左右动时发梢慢半拍
    const headDx = turn + tilt * 6;
    for (let left = dt; left > 0; left -= 0.02) { // 小步积分，帧率掉了也不会抖飞
      const h = Math.min(left, 0.02);
      this.hairVel += ((headDx - this.hairLag) * 30 - this.hairVel * 7) * h;
      this.hairLag += this.hairVel * h;
    }
    const hairInertia = Math.max(-0.8, Math.min(0.8, this.hairLag - headDx));
    const wind = Math.sin(t * 1.1) * 0.6 + Math.sin(t * 1.73 + 1) * 0.4;

    // ---------- 关键点 ----------
    const neck = p.neck ?? [this.W / 2, H * 0.2];
    const eyes = p.eyes ?? [neck[0], neck[1] - H * 0.06];
    const waist = p.waist ?? [neck[0], H * 0.5];
    const feet = this.origin;
    const shL = p.shoulderL ?? [neck[0] - H * 0.06, neck[1] + H * 0.03];
    const shR = p.shoulderR ?? [neck[0] + H * 0.06, neck[1] + H * 0.03];
    const hairTip = this.hairTipY ?? p.hairTipY ?? waist[1];
    const elR = p.elbowR ?? [shR[0] + H * 0.02, (shR[1] + waist[1]) / 2 + H * 0.02];
    const elL = p.elbowL ?? [2 * neck[0] - elR[0], elR[1]]; // 没量左肘就按脖子中线镜像
    const elbowBand = H * 0.025;
    const hem = p.hem;
    const top = p.headTop ?? H * 0.05;
    const faceR = Math.max(H * 0.045, Math.abs(neck[1] - eyes[1]) * 1.3);
    const turnPx = H * 0.011;
    const nodPx = H * 0.014;
    const torsoLen = Math.max(1, waist[1] - neck[1]);

    // 换图：眼、嘴、挥手
    this.blinkTimer -= dt;
    if (this.blinkTimer <= 0 && this.blinkT < 0) { this.blinkT = 0; this.blinkTimer = 2.2 + Math.random() * 3.5; }
    let eyeName = (w > 0.5 && g.eyes) || ({ happy: 'smile', relaxed: 'smile' }[this.emotion] ?? 'open');
    if (eyeName === 'wink' && !this.byId.eyes?.tex.wink) eyeName = 'smile';
    if (this.blinkT >= 0 && w > 0.5 && g.eyes) this.blinkT = -1; // 做动作时不眨眼，免得打断表情
    if (this.blinkT >= 0) { this.blinkT += dt; if (this.blinkT < 0.13) eyeName = 'closed'; else this.blinkT = -1; }
    this.setSprite('eyes', eyeName);
    const m = this.mouth;
    let mouthName = m > 0.45 ? 'open' : m > 0.12 ? 'half' : (this.emotion === 'happy' ? 'smile' : 'closed');
    if (g.mouth && w > 0.4 && m < 0.12) mouthName = g.mouth; // 说话时以口型为准
    this.setSprite('mouth', mouthName);
    // 脸红：害羞动作时淡入，情绪是 shy 时一直微红
    const blush = Math.max((g.blush ?? 0) * w, this.emotion === 'shy' ? 0.7 : 0);
    const B = this.byId.blush;
    if (B) { B.mat.opacity = blush; B.mesh.visible = blush > 0.01; }
    const tears = (g.tears ?? 0) * w;
    const T = this.byId.tears;
    if (T) { T.mat.opacity = tears; T.mesh.visible = tears > 0.01; }
    const armSprite = g.spriteR && w > 0.4 && this.byId.armR?.tex[g.spriteR] ? g.spriteR : 'default';
    this.setSprite('armR', armSprite);
    // 手到脸的手臂图要盖在前发上面，否则长刘海会把手挡住
    const AR = this.byId.armR;
    if (AR) AR.mesh.renderOrder = 10 + (armSprite === 'face' ? LAYERS.length + 1 : AR.order ?? 0);

    // ---------- 逐顶点变形 ----------
    const rot = (x, y, cx, cy, a) => {
      // 像素坐标 y 向下；a > 0 表示画面上逆时针
      const c = Math.cos(a); const s = Math.sin(a);
      const dx = x - cx; const dy = y - cy;
      return [cx + dx * c + dy * s, cy - dx * s + dy * c];
    };
    for (const L of this.layers) {
      const { def, basePx, pos, n } = L;
      for (let k = 0; k < n; k++) {
        let x = basePx[k * 2]; let y = basePx[k * 2 + 1];
        // 1) 局部：头发飘、衣摆飘
        if (def.hair) {
          const s = clamp01((y - eyes[1]) / Math.max(1, hairTip - eyes[1])) ** 2;
          x += s * (H * 0.004 * wind - hairInertia * turnPx * 1.4);
        }
        if (def.hem && hem) {
          let s = clamp01((y - waist[1]) / Math.max(1, hem - waist[1])) ** 2;
          if (y > hem) s *= clamp01(1 - (y - hem) / (H * 0.03));
          x += s * H * 0.003 * Math.sin(t * 1.3 + 0.5);
        }
        // 打哈欠：嘴巴图层以嘴为中心竖向拉大
        if (def.id === 'mouth' && g.mouthScale && p.mouth) {
          const sc = 1 + (g.mouthScale - 1) * w;
          y = p.mouth[1] + (y - p.mouth[1]) * sc;
          x = p.mouth[0] + (x - p.mouth[0]) * (1 + (sc - 1) * 0.35);
        }
        // 2) 组内运动
        if (def.group === 'head') {
          // 假转头：越靠前的层移得越多；脸的中心比轮廓移得多
          let dep = def.depth;
          if (def.face) { const r2 = ((x - eyes[0]) ** 2 + (y - eyes[1]) ** 2) / (faceR * faceR); dep *= Math.exp(-r2); }
          x += turn * dep * turnPx;
          // 点头：头发和脸轮廓一起下移（不露出头顶补色），五官多移一点藏进刘海；
          // 脖子附近几乎不动，压扁只作用在脖子以上
          if (nod) {
            const above = y < neck[1];
            const nearNeck = above ? smooth(((neck[1] - y) / Math.max(1, neck[1] - top)) * 4) : 1;
            const feature = def.id === 'eyes' || def.id === 'brows' || def.id === 'mouth';
            y += nod * nodPx * (0.45 + (feature ? 0.5 : 0)) * nearNeck;
            if (above) y = neck[1] + (y - neck[1]) * (1 - 0.045 * nod);
          }
          [x, y] = rot(x, y, neck[0], neck[1], tilt);
          y -= breathPx;
        } else if (def.group === 'armL' || def.group === 'armR') {
          const left = def.group === 'armL';
          const sh = left ? shL : shR;
          const a = left ? -armL : armR;
          const bend = left ? -bendL : bendR;
          if (bend) {
            // 肘部以下（小臂+手）绕肘转，肘附近渐变，避免折痕
            const el = left ? elL : elR;
            const wb = smooth((y - el[1] + elbowBand) / (2 * elbowBand));
            if (wb > 0) [x, y] = rot(x, y, el[0], el[1], bend * wb);
          }
          [x, y] = rot(x, y, sh[0], sh[1], a);
          y -= breathPx;
          if (g.bow) y += nod * nodPx * 0.4;
        } else if (def.group === 'body') {
          // 呼吸：腰以上往上抬，越靠近肩越明显
          const s = clamp01((waist[1] - y) / torsoLen);
          y -= breathPx * s;
          if (g.bow) y += nod * nodPx * 0.4 * s;
        }
        // 3) 全身轻微摆动 + 跳
        [x, y] = rot(x, y, feet[0], feet[1], bodyRot);
        y -= bounce;
        x += shiftX;
        pos[k * 3] = (x - feet[0]) * this.unit;
        pos[k * 3 + 1] = (feet[1] - y) * this.unit;
        pos[k * 3 + 2] = 0;
      }
      L.mesh.geometry.attributes.position.needsUpdate = true;
    }
    if (this.shadow) this.shadow.position.x = shiftX * this.unit;
  }

  dispose() {
    this.scene.remove(this.root);
  }
}
