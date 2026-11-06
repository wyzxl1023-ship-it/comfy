import * as THREE from 'three';

// 把衣橱里的搭配穿到 VRM 模型上。
// - 上衣/下装/鞋：改模型原有衣服材质的颜色；有上传照片时，把照片当面料平铺到衣服上
//   （保留原贴图的明暗和缝线）。
// - 外套：没有独立网格，先用外套颜色/面料覆盖上衣 + 加一个领口。
// - 帽子/围巾/墨镜/雨伞：程序化小模型，挂到对应骨骼上。
// 真正"换一件不同版型的衣服"需要做好的 3D 服装资产（VRoid 服装或 Blender 建模），见 README。

const SLOT_MATERIAL = { top: 'Tops', bottom: 'Bottoms', shoes: 'Shoes' };

export class Dresser {
  constructor(avatar) {
    this.avatar = avatar;
    this.originals = new Map(); // material -> { color, map, shade }
    this.accessories = [];
    this.texCache = new Map();
  }

  materialsFor(prefix) {
    const mats = [];
    for (const [name, list] of Object.entries(this.avatar.materials ?? {})) {
      if (name.startsWith(prefix)) mats.push(...list);
    }
    return mats;
  }

  remember(m) {
    if (!this.originals.has(m)) {
      this.originals.set(m, {
        color: m.color?.clone(),
        map: m.map ?? null,
        shade: m.shadeColorFactor?.clone?.(),
      });
    }
    return this.originals.get(m);
  }

  async apply(outfit) {
    const items = outfit.items ?? outfit;
    for (const [slot, prefix] of Object.entries(SLOT_MATERIAL)) {
      let item = items[slot];
      if (slot === 'top' && items.outer) item = items.outer; // 外套盖住上衣
      for (const m of this.materialsFor(prefix)) await this.paint(m, item);
    }
    this.clearAccessories();
    if (items.outer) this.addCollar(items.outer.color);
    if (items.hat) this.addHat(items.hat);
    if (items.scarf) this.addScarf(items.scarf.color);
    if (items.glasses) this.addGlasses(items.glasses.color);
    this.avatar.holdUmbrella = !!items.umbrella;
    if (items.umbrella) this.addUmbrella(items.umbrella.color);
  }

  async paint(m, item) {
    const orig = this.remember(m);
    if (!item) {
      if (orig.color) m.color.copy(orig.color);
      m.map = orig.map;
      if (orig.shade && m.shadeColorFactor) m.shadeColorFactor.copy(orig.shade);
      m.needsUpdate = true;
      return;
    }
    const c = new THREE.Color(item.color);
    if (item.image && orig.map) {
      m.map = await this.fabricTexture(orig.map, item.image);
      m.color?.set('#ffffff');
    } else {
      // 原贴图可能是深色（黑短裤、黑鞋），先转成浅灰保留褶皱，再染成目标颜色
      m.map = orig.map ? this.neutralTexture(orig.map) : null;
      m.color?.copy(c);
    }
    if (m.shadeColorFactor) m.shadeColorFactor.copy(c).multiplyScalar(0.72);
    if (m.shadeMultiplyTexture !== undefined) m.shadeMultiplyTexture = m.map;
    m.needsUpdate = true;
  }

  // 原贴图 → 浅灰底（保留明暗细节），方便任意染色
  neutralTexture(baseTex) {
    const key = baseTex.uuid + ':neutral';
    if (this.texCache.has(key)) return this.texCache.get(key);
    const src = baseTex.image;
    const c = document.createElement('canvas');
    c.width = src.width; c.height = src.height;
    const g = c.getContext('2d');
    g.drawImage(src, 0, 0);
    const img = g.getImageData(0, 0, c.width, c.height);
    const d = img.data;
    let sum = 0; let n = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 10) continue;
      sum += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; n++;
    }
    const mean = n ? sum / n : 128;
    for (let i = 0; i < d.length; i += 4) {
      const l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      const v = Math.max(0, Math.min(255, 225 + (l - mean) * 0.9));
      d[i] = d[i + 1] = d[i + 2] = v;
    }
    g.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.flipY = baseTex.flipY;
    t.wrapS = baseTex.wrapS; t.wrapT = baseTex.wrapT;
    this.texCache.set(key, t);
    return t;
  }

  // 浅灰底 × 上传照片平铺 = 新面料
  async fabricTexture(baseTex, imageUrl) {
    const key = baseTex.uuid + imageUrl.slice(-64);
    if (this.texCache.has(key)) return this.texCache.get(key);
    const img = await loadImage(imageUrl);
    const src = this.neutralTexture(baseTex).image;
    const w = src.width; const h = src.height;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    const tile = Math.round(w / 3);
    const pat = g.createPattern(scaleImage(img, tile), 'repeat');
    g.fillStyle = pat; g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = 'multiply';
    g.drawImage(src, 0, 0, w, h);
    g.globalCompositeOperation = 'destination-in';
    g.drawImage(src, 0, 0, w, h); // 保留原贴图透明区域
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.flipY = baseTex.flipY;
    t.wrapS = baseTex.wrapS; t.wrapT = baseTex.wrapT;
    this.texCache.set(key, t);
    return t;
  }

  attach(boneName, obj) {
    const bone = this.avatar.bone(boneName);
    if (!bone) return;
    obj.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
    bone.add(obj);
    this.accessories.push(obj);
  }

  clearAccessories() {
    for (const a of this.accessories) a.parent?.remove(a);
    this.accessories = [];
  }

  addCollar(color) {
    const m = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.022, 10, 28), toon(color));
    m.rotation.x = Math.PI / 2 + 0.25;
    m.position.set(0, 0.02, 0.005);
    m.scale.set(1.1, 1, 0.9);
    this.attach('neck', m);
  }

  addScarf(color) {
    const g = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.035, 12, 28), toon(color));
    ring.rotation.x = Math.PI / 2 + 0.2;
    ring.scale.set(1.15, 1, 0.95);
    g.add(ring);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.22, 0.03), toon(color));
    tail.position.set(0.04, -0.11, 0.08);
    tail.rotation.z = 0.12;
    g.add(tail);
    g.position.set(0, 0.03, 0);
    this.attach('neck', g);
  }

  addHat(item) {
    const g = new THREE.Group();
    const m = toon(item.color);
    if (item.warmth >= 2) {
      const dome = new THREE.Mesh(new THREE.SphereGeometry(0.115, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2), m);
      dome.scale.set(1.05, 1.0, 1.1);
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.122, 0.122, 0.04, 24), toon(shade(item.color, 0.85)));
      band.position.y = 0.005;
      const pom = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 10), toon('#ffffff'));
      pom.position.y = 0.12;
      g.add(dome, band, pom);
      g.position.set(0, 0.11, -0.01);
      g.rotation.x = -0.15;
    } else {
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.01, 32), m);
      const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.115, 0.09, 24), m);
      crown.position.y = 0.045;
      const ribbon = new THREE.Mesh(new THREE.CylinderGeometry(0.116, 0.116, 0.025, 24), toon('#d45d79'));
      ribbon.position.y = 0.015;
      g.add(brim, crown, ribbon);
      g.position.set(0, 0.15, -0.005);
      g.rotation.x = -0.12;
    }
    this.attach('head', g);
  }

  addGlasses(color) {
    const g = new THREE.Group();
    const lens = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.75 });
    for (const x of [-0.032, 0.032]) {
      const l = new THREE.Mesh(new THREE.CircleGeometry(0.024, 20), lens);
      l.position.set(x, 0, 0);
      g.add(l);
    }
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.004, 0.004), new THREE.MeshBasicMaterial({ color: '#222' }));
    g.add(bridge);
    g.position.set(0, 0.062, 0.088);
    this.attach('head', g);
  }

  addUmbrella(color) {
    const g = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.72, 8), toon('#444444'));
    shaft.position.y = 0.34;
    const canopy = new THREE.Mesh(
      new THREE.ConeGeometry(0.55, 0.22, 16, 1, true),
      new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.45, transparent: true, opacity: 0.6, side: THREE.DoubleSide, roughness: 0.2, depthWrite: false }),
    );
    canopy.position.y = 0.72;
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.008, 6, 12, Math.PI), toon('#444444'));
    handle.rotation.z = Math.PI;
    g.add(shaft, canopy, handle);
    this.umbrellaRoot = g;
    this.attach('leftHand', g);
  }

  // 雨伞要始终朝上：每帧把伞的世界朝向扶正
  update() {
    const u = this.umbrellaRoot;
    if (!u || !u.parent) return;
    const parentQ = new THREE.Quaternion();
    u.parent.getWorldQuaternion(parentQ);
    u.quaternion.copy(parentQ.invert());
    u.rotateZ(0.12);
    u.rotateX(-0.3);
  }
}

function toon(color) {
  return new THREE.MeshToonMaterial({ color });
}
function shade(hex, k) {
  return '#' + new THREE.Color(hex).multiplyScalar(k).getHexString();
}
function loadImage(url) {
  return new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = url;
  });
}
function scaleImage(img, size) {
  const c = document.createElement('canvas');
  const r = img.width / img.height;
  c.width = size; c.height = Math.round(size / r);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c;
}

// 从上传照片取主色（中心区域平均色，忽略近白背景）
export async function dominantColor(url) {
  const img = await loadImage(url);
  const c = document.createElement('canvas');
  c.width = 48; c.height = 48;
  const g = c.getContext('2d');
  g.drawImage(img, img.width * 0.2, img.height * 0.2, img.width * 0.6, img.height * 0.6, 0, 0, 48, 48);
  const d = g.getImageData(0, 0, 48, 48).data;
  let r = 0, gg = 0, b = 0, n = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i] > 235 && d[i + 1] > 235 && d[i + 2] > 235) continue;
    r += d[i]; gg += d[i + 1]; b += d[i + 2]; n++;
  }
  if (!n) return '#f0f0f0';
  const hex = (v) => Math.round(v / n).toString(16).padStart(2, '0');
  return `#${hex(r)}${hex(gg)}${hex(b)}`;
}

// 上传照片压缩到 512px JPEG 再保存
export async function compressImage(file, max = 512) {
  const url = URL.createObjectURL(file);
  const img = await loadImage(url);
  URL.revokeObjectURL(url);
  const s = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.85);
}
