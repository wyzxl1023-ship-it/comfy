import * as THREE from 'three';

// 2D 分层手绘角色（ComfyUI 出图 → 拆部件 → 这里动起来）。
// 和 3D 的 Avatar 接口一致：play(动作) / setEmotion / mouth / update(dt)，
// 所以话语→动作、场景、天气、衣橱、ESP32 接口都不用改。
//
// 资产：character/manifest.json + 一组同尺寸透明 PNG（每张都是整张画布大小，部件画在原位置，
// 这样 AI 拆出来的图不用对齐，直接叠就是完整立绘）。格式见 character/README.md。

const loader = new THREE.TextureLoader();

const DEFAULT_GESTURES = {
  // 每个动作：用哪些手臂图、头怎么动、持续多久
  wave: { duration: 2.2, armR: 'wave', armSwing: { arm: 'armR', amp: 0.12, freq: 3 }, head: { tilt: 0.06 } },
  nod: { duration: 1.2, head: { nod: 1 } },
  shake: { duration: 1.3, head: { shake: 1 } },
  think: { duration: 2.6, armR: 'chin', head: { tilt: 0.1 }, eyes: 'up' },
  point: { duration: 2.0, armR: 'point', head: { turn: -0.04 } },
  shrug: { duration: 1.8, armR: 'open', armL: 'open', head: { tilt: 0.08 } },
  bow: { duration: 2.0, head: { bow: 1 }, body: { bow: 1 } },
  cheer: { duration: 1.8, armR: 'up', armL: 'up', bounce: 1, eyes: 'smile' },
  heart: { duration: 2.2, armR: 'chest', armL: 'chest', head: { tilt: 0.08 }, eyes: 'smile' },
  sad: { duration: 2.4, head: { down: 1 }, eyes: 'sad' },
  talk: { duration: 1.8, armR: 'talk', armSwing: { arm: 'armR', amp: 0.04, freq: 1.5 } },
};

export class Puppet2D {
  constructor(scene) {
    this.scene = scene;
    this.root = new THREE.Group();
    scene.add(this.root);
    this.nodes = {};
    this.sprites = {};
    this.state = { eyes: 'open', mouth: 'closed', armR: 'down', armL: 'down' };
    this.active = [];
    this.emotion = 'neutral';
    this.mouth = 0;
    this.time = 0;
    this.blinkTimer = 2;
    this.blinkT = -1;
    this.isPuppet = true;
    this.materials = {};
  }

  async load(base) {
    const m = await (await fetch(`${base}/manifest.json`)).json();
    this.base = base;
    this.manifest = m;
    const [cw, ch] = m.canvas;
    this.cw = cw; this.ch = ch;
    this.scale = m.height / ch; // 像素 → 米
    this.gestures = { ...DEFAULT_GESTURES, ...(m.gestures ?? {}) };
    this.root.clear();
    this.nodes = {};
    // 每个图层：一个 pivot 组（旋转中心）+ 一张铺满画布的平面
    for (const [i, L] of m.layers.entries()) {
      const pivot = new THREE.Group();
      const [px, py] = L.pivot ?? [cw / 2, ch];
      pivot.position.copy(this.px(px, py));
      const parent = L.parent ? this.nodes[L.parent]?.pivot : this.root;
      if (L.parent && this.nodes[L.parent]) pivot.position.sub(this.px(...(m.layers.find((x) => x.id === L.parent).pivot ?? [cw / 2, ch])));
      (parent ?? this.root).add(pivot);
      const mat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false });
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(cw * this.scale, ch * this.scale), mat);
      // 平面中心相对 pivot 的偏移
      const center = this.px(cw / 2, ch / 2).sub(this.px(px, py));
      plane.position.copy(center);
      plane.renderOrder = 10 + i;
      pivot.add(plane);
      this.nodes[L.id] = { pivot, plane, mat, def: L };
      if (L.src) mat.map = await this.tex(L.src);
      else plane.visible = false;
    }
    // 可切换的图：eyes / mouth / armR / armL / 以及衣橱槽位
    for (const [group, variants] of Object.entries(m.sprites ?? {})) {
      this.sprites[group] = {};
      for (const [name, src] of Object.entries(variants)) this.sprites[group][name] = await this.tex(src);
    }
    for (const g of ['eyes', 'mouth', 'armR', 'armL']) this.setSprite(g, this.state[g]);
    this.headBase = this.nodes.head?.pivot.position.clone();
    this.bodyBase = this.nodes.body?.pivot.position.clone();
    return this;
  }

  // 画布像素坐标（左上为原点）→ 世界坐标（脚底中心为原点，y 向上）
  px(x, y) {
    return new THREE.Vector3((x - this.cw / 2) * this.scale, (this.ch - y) * this.scale, 0);
  }

  async tex(src) {
    const t = await loader.loadAsync(`${this.base}/${src}`);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  }

  setSprite(group, name) {
    const node = this.nodes[group];
    const set = this.sprites[group];
    if (!node || !set) return;
    const t = set[name] ?? set.default ?? set.down ?? set.open ?? set.closed;
    if (t && node.mat.map !== t) { node.mat.map = t; node.mat.needsUpdate = true; }
    node.plane.visible = !!t;
  }

  // 衣橱：槽位（top / bottom / shoes / hat ...）换成对应衣服图层，没有图就隐藏/保持默认
  wear(slot, itemId) {
    const set = this.sprites[slot];
    const node = this.nodes[slot];
    if (!set || !node) return false;
    const t = (itemId && set[itemId]) || set.default;
    node.mat.map = t ?? null;
    node.plane.visible = !!t;
    node.mat.needsUpdate = true;
    return !!(itemId && set[itemId]);
  }

  bone() { return null; }
  play(name) {
    if (!this.gestures[name]) return;
    this.active = [{ name, t: 0 }];
  }
  setEmotion(e) { this.emotion = e; }

  get headY() { return (this.manifest?.headY ?? this.ch * 0.15) ? this.px(0, this.manifest?.headY ?? this.ch * 0.15).y : 1.4; }

  update(dt) {
    if (!this.manifest) return;
    this.time += dt;
    const t = this.time;
    // 当前动作
    let g = null; let gt = 0; let w = 0;
    this.active = this.active.filter((a) => (a.t += dt) < this.gestures[a.name].duration);
    if (this.active[0]) {
      const a = this.active[0];
      g = this.gestures[a.name]; gt = a.t;
      w = Math.min(gt / 0.25, 1, (g.duration - gt) / 0.3);
      w = w * w * (3 - 2 * w);
    }
    const gw = w > 0.5 ? g : null; // 换图在动作中段生效

    // 呼吸 + 轻微晃动
    const body = this.nodes.body?.pivot;
    if (body) {
      body.scale.set(1, 1 + 0.006 * Math.sin(t * 1.6), 1);
      body.rotation.z = 0.006 * Math.sin(t * 0.5);
      body.position.y = (this.bodyBase?.y ?? 0) + (g?.bounce ? Math.abs(Math.sin(gt * 7)) * 0.03 * w : 0);
      if (g?.body?.bow) body.rotation.x = 0; // 2D 里鞠躬主要靠头
    }
    const head = this.nodes.head?.pivot;
    if (head && this.headBase) {
      let rz = 0.025 * Math.sin(t * 0.43) + 0.01 * Math.sin(t * 0.91);
      let dx = 0; let dy = 0; let sy = 1;
      const h = g?.head ?? {};
      if (h.tilt) rz += h.tilt * w;
      if (h.turn) dx += h.turn * w;
      if (h.nod) { const n = Math.max(0, Math.sin(gt * 10)) * w; dy -= 0.012 * n; sy -= 0.03 * n; }
      if (h.shake) dx += Math.sin(gt * 12) * 0.012 * w;
      if (h.bow) { dy -= 0.05 * w; sy -= 0.06 * w; }
      if (h.down) { dy -= 0.02 * w; sy -= 0.04 * w; }
      head.rotation.z = rz;
      head.position.set(this.headBase.x + dx, this.headBase.y + dy, this.headBase.z);
      head.scale.set(1, sy, 1);
    }
    // 手臂：动作时换图，带一点摆动
    for (const arm of ['armR', 'armL']) {
      this.setSprite(arm, gw?.[arm] ?? 'down');
      const node = this.nodes[arm]?.pivot;
      if (node) {
        const sw = g?.armSwing?.arm === arm ? Math.sin(gt * g.armSwing.freq * Math.PI * 2) * g.armSwing.amp * w : 0;
        node.rotation.z = sw + (arm === 'armR' ? -1 : 1) * 0.01 * Math.sin(t * 1.6);
      }
    }
    // 眼睛：眨眼 > 动作 > 情绪
    this.blinkTimer -= dt;
    if (this.blinkTimer <= 0 && this.blinkT < 0) { this.blinkT = 0; this.blinkTimer = 2 + Math.random() * 3; }
    let eyes = gw?.eyes ?? ({ happy: 'smile', sad: 'sad', surprised: 'wide', relaxed: 'smile' }[this.emotion] ?? 'open');
    if (this.blinkT >= 0) { this.blinkT += dt; if (this.blinkT < 0.14) eyes = 'closed'; else this.blinkT = -1; }
    this.setSprite('eyes', eyes);
    // 嘴：按音量换图
    const m = this.mouth;
    const mouth = m > 0.5 ? 'open' : m > 0.18 ? 'half' : (this.emotion === 'happy' ? 'smile' : 'closed');
    this.setSprite('mouth', mouth);
  }
}
