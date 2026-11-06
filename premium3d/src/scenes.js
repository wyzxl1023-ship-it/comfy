import * as THREE from 'three';

// 程序化生成的场景（全部用基础几何体 + Canvas 贴图，不依赖外部素材，无版权问题）。
// 以后可替换为 Blender 做的 glTF 场景或 HDRI 全景图：只要实现同样的 build(ctx) 即可。

export const SCENE_LABELS = { home: '在家', busStop: '公交车站', office: '公司' };
export const WEATHER_LABELS = { sunny: '晴', cloudy: '多云', rain: '下雨', snow: '下雪' };

const SKY = {
  sunny: { top: '#5fa8ff', bottom: '#cfe8ff', sun: 2.6, hemi: 1.1, fog: '#cfe3f5' },
  cloudy: { top: '#8b97a6', bottom: '#d3d8de', sun: 1.2, hemi: 1.0, fog: '#c9ced4' },
  rain: { top: '#4b5560', bottom: '#8d969e', sun: 0.6, hemi: 0.8, fog: '#7f8890' },
  snow: { top: '#a9b6c4', bottom: '#eef2f6', sun: 1.0, hemi: 1.15, fog: '#e4e9ee' },
};
const NIGHT = { top: '#0b1430', bottom: '#2b3a66', sun: 0.15, hemi: 0.35, fog: '#1d2747' };

function mat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...opts });
}
function box(w, h, d, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}
function cyl(rt, rb, h, material, x = 0, y = 0, z = 0, seg = 24) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), material);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
function gradientTex(top, bottom) {
  return canvasTex(4, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, top); gr.addColorStop(1, bottom);
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
}
function windowGridTex(base, lit, cols = 6, rows = 12) {
  return canvasTex(256, 512, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    const cw = w / cols; const rh = h / rows;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      g.fillStyle = Math.random() < 0.35 ? lit : 'rgba(20,30,45,0.85)';
      g.fillRect(c * cw + cw * 0.18, r * rh + rh * 0.2, cw * 0.64, rh * 0.55);
    }
  });
}
function signTex(text, bg, fg, sub) {
  return canvasTex(512, 256, (g, w, h) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = 'bold 96px "PingFang SC", "Noto Sans CJK SC", sans-serif';
    g.fillText(text, w / 2, sub ? h * 0.4 : h / 2);
    if (sub) { g.font = '44px "PingFang SC", "Noto Sans CJK SC", sans-serif'; g.fillText(sub, w / 2, h * 0.78); }
  });
}

// ---------- 天气粒子 ----------
function makeRain(area) {
  const n = 2500;
  const pos = new Float32Array(n * 6);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const lines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xc8d4e0, transparent: true, opacity: 0.55 }));
  const seeds = [];
  for (let i = 0; i < n; i++) seeds.push([rand(area.x0, area.x1), rand(0, area.h), rand(area.z0, area.z1)]);
  lines.userData.tick = (dt) => {
    for (let i = 0; i < n; i++) {
      const s = seeds[i];
      s[1] -= dt * 9;
      if (s[1] < 0) s[1] += area.h;
      pos.set([s[0], s[1], s[2], s[0] + 0.03, s[1] + 0.35, s[2]], i * 6);
    }
    geo.attributes.position.needsUpdate = true;
  };
  lines.frustumCulled = false;
  return lines;
}
function makeSnow(area) {
  const n = 1800;
  const pos = new Float32Array(n * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const flake = canvasTex(32, 32, (g) => {
    const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 32, 32);
  });
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.06, map: flake, transparent: true, depthWrite: false }));
  const seeds = [];
  for (let i = 0; i < n; i++) seeds.push([rand(area.x0, area.x1), rand(0, area.h), rand(area.z0, area.z1), Math.random() * 6]);
  let t = 0;
  pts.userData.tick = (dt) => {
    t += dt;
    for (let i = 0; i < n; i++) {
      const s = seeds[i];
      s[1] -= dt * 0.7;
      if (s[1] < 0) s[1] += area.h;
      pos.set([s[0] + Math.sin(t + s[3]) * 0.15, s[1], s[2]], i * 3);
    }
    geo.attributes.position.needsUpdate = true;
  };
  pts.frustumCulled = false;
  return pts;
}
function rand(a, b) { return a + Math.random() * (b - a); }

// ---------- 场景 ----------
// 每个 builder 返回 { group, outdoor, weatherArea, sky? }
const BUILDERS = {
  home() {
    const g = new THREE.Group();
    const wall = mat('#efe3d3');
    const floorTex = canvasTex(512, 512, (c, w, h) => {
      for (let i = 0; i < 8; i++) {
        c.fillStyle = i % 2 ? '#b98a5e' : '#c4956a';
        c.fillRect(0, i * h / 8, w, h / 8);
        c.fillStyle = 'rgba(0,0,0,0.12)'; c.fillRect(0, i * h / 8, w, 2);
        c.fillRect(((i * 197) % 400) + 40, i * h / 8, 2, h / 8);
      }
    });
    floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping; floorTex.repeat.set(3, 3);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), mat('#ffffff', { map: floorTex, roughness: 0.6 }));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; g.add(floor);
    // 后墙（中间留窗洞）
    const z = -2.4;
    g.add(box(3.9, 3.2, 0.12, wall, -1.65, 1.6, z));
    g.add(box(1.7, 3.2, 0.12, wall, 2.75, 1.6, z));
    g.add(box(1.6, 0.9, 0.12, wall, 1.1, 0.45, z));
    g.add(box(1.6, 0.6, 0.12, wall, 1.1, 2.9, z));
    const frame = mat('#ffffff');
    g.add(box(1.7, 0.06, 0.18, frame, 1.1, 0.9, z));
    g.add(box(1.7, 0.06, 0.18, frame, 1.1, 2.6, z));
    g.add(box(0.06, 1.7, 0.18, frame, 0.28, 1.75, z));
    g.add(box(0.06, 1.7, 0.18, frame, 1.92, 1.75, z));
    g.add(box(0.04, 1.7, 0.1, frame, 1.1, 1.75, z));
    // 窗帘
    g.add(box(0.35, 2.3, 0.05, mat('#d9a7a0'), 0.05, 1.75, z + 0.12));
    g.add(box(0.35, 2.3, 0.05, mat('#d9a7a0'), 2.15, 1.75, z + 0.12));
    // 侧墙
    g.add(box(0.12, 3.2, 6, wall, -3.6, 1.6, 0.6));
    g.add(box(0.12, 3.2, 6, wall, 3.6, 1.6, 0.6));
    // 沙发
    const sofa = mat('#7d93a8');
    g.add(box(2.0, 0.42, 0.85, sofa, -1.8, 0.21, -1.8));
    g.add(box(2.0, 0.6, 0.22, sofa, -1.8, 0.6, -2.2));
    g.add(box(0.22, 0.6, 0.85, sofa, -2.8, 0.45, -1.8));
    g.add(box(0.22, 0.6, 0.85, sofa, -0.8, 0.45, -1.8));
    g.add(box(0.42, 0.38, 0.12, mat('#f2c46d'), -2.3, 0.62, -2.0));
    // 地毯、茶几
    const rug = new THREE.Mesh(new THREE.CircleGeometry(1.4, 40), mat('#e8d8c4'));
    rug.rotation.x = -Math.PI / 2; rug.position.set(-0.4, 0.005, -0.6); rug.receiveShadow = true; g.add(rug);
    g.add(cyl(0.45, 0.45, 0.05, mat('#8b6a4d'), -1.6, 0.42, -0.9));
    g.add(cyl(0.05, 0.05, 0.4, mat('#8b6a4d'), -1.6, 0.2, -0.9));
    g.add(cyl(0.07, 0.06, 0.12, mat('#ffffff'), -1.5, 0.5, -0.85));
    // 落地灯
    g.add(cyl(0.02, 0.02, 1.6, mat('#333333'), 2.9, 0.8, -1.9));
    const shade = cyl(0.18, 0.28, 0.32, mat('#fff4dc', { emissive: '#ffcf8a', emissiveIntensity: 0.6 }), 2.9, 1.7, -1.9);
    g.add(shade);
    const lamp = new THREE.PointLight('#ffcf8a', 3, 6, 1.6); lamp.position.set(2.9, 1.6, -1.7); g.add(lamp);
    // 植物
    g.add(cyl(0.18, 0.14, 0.35, mat('#c9784a'), -3.1, 0.18, -0.6));
    for (let i = 0; i < 7; i++) {
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8), mat('#4f8a4b'));
      leaf.position.set(-3.1 + Math.sin(i * 2.1) * 0.15, 0.55 + i * 0.07, -0.6 + Math.cos(i * 2.1) * 0.15);
      leaf.castShadow = true; g.add(leaf);
    }
    // 挂画
    g.add(box(0.9, 0.65, 0.04, mat('#ffffff', { map: canvasTex(256, 192, (c, w, h) => {
      c.fillStyle = '#fbe7d0'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#f19a7c'; c.beginPath(); c.arc(w * 0.65, h * 0.4, 30, 0, 7); c.fill();
      c.fillStyle = '#7fb2a4'; c.beginPath(); c.moveTo(0, h); c.lineTo(w * 0.4, h * 0.45); c.lineTo(w, h); c.fill();
    }) }), -1.8, 1.9, z + 0.08));
    return { group: g, outdoor: false, weatherArea: { x0: -0.5, x1: 3, z0: -5, z1: -2.6, h: 4 }, skyZ: -6 };
  },

  busStop() {
    const g = new THREE.Group();
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), mat('#9a9a96'));
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; g.add(ground);
    // 马路 + 车道线
    const road = new THREE.Mesh(new THREE.PlaneGeometry(30, 3.2), mat('#3d3f44', { roughness: 0.95 }));
    road.rotation.x = -Math.PI / 2; road.position.set(0, 0.003, 2.4); road.receiveShadow = true; g.add(road);
    for (let i = -7; i < 8; i++) {
      const line = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.08), mat('#f2f2f2'));
      line.rotation.x = -Math.PI / 2; line.position.set(i * 2, 0.006, 2.4); g.add(line);
    }
    g.add(box(30, 0.15, 0.2, mat('#c8c6c0'), 0, 0.075, 0.8)); // 路缘石
    // 站台雨棚
    const steel = mat('#5d6670', { metalness: 0.5, roughness: 0.4 });
    for (const x of [-2.9, -0.1]) g.add(box(0.08, 2.6, 0.08, steel, x, 1.3, -1.6));
    g.add(box(3.2, 0.08, 1.3, mat('#5b8fc4', { emissive: '#2f6fae', emissiveIntensity: 0.35 }), -1.5, 2.62, -1.1));
    const glass = new THREE.MeshPhysicalMaterial({ color: '#cfe6f2', transparent: true, opacity: 0.3, roughness: 0.05 });
    const back = box(2.8, 1.9, 0.03, glass, -1.5, 1.35, -1.65); back.castShadow = false; g.add(back);
    // 广告灯箱
    g.add(box(1.0, 1.6, 0.12, mat('#ffffff', { map: canvasTex(256, 400, (c, w, h) => {
      const gr = c.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#ffd1dc'); gr.addColorStop(1, '#ffe9b3');
      c.fillStyle = gr; c.fillRect(0, 0, w, h);
      c.fillStyle = '#d45d79'; c.font = 'bold 54px sans-serif'; c.textAlign = 'center'; c.fillText('今日好心情', w / 2, h * 0.3);
      c.fillStyle = '#ffffff'; c.beginPath(); c.arc(w / 2, h * 0.62, 70, 0, 7); c.fill();
    }), emissive: '#ffffff', emissiveIntensity: 0.25 }), 0.6, 1.35, -1.9));
    // 长椅
    const wood = mat('#a8774f');
    g.add(box(1.8, 0.06, 0.4, wood, -1.5, 0.48, -1.35));
    for (const x of [-2.25, -0.75]) g.add(box(0.06, 0.48, 0.35, steel, x, 0.24, -1.35));
    // 站牌
    g.add(cyl(0.04, 0.04, 2.8, steel, 1.9, 1.4, -0.6));
    g.add(box(0.9, 0.45, 0.04, mat('#ffffff', { map: signTex('公交站', '#1f7a4d', '#ffffff', '小柚路 · 18 / 26 路') }), 1.9, 2.55, -0.6));
    // 远处楼群
    const colors = ['#b7c3cf', '#c9b8a6', '#a9b9ad', '#d2c7b8', '#9fb0c4'];
    for (let i = 0; i < 9; i++) {
      const h = 5 + ((i * 37) % 7);
      const tex = windowGridTex(colors[i % colors.length], '#ffe9a8');
      const b = box(2.4, h, 2, mat('#ffffff', { map: tex }), -10 + i * 2.6, h / 2, -8 - (i % 3));
      b.castShadow = false; g.add(b);
    }
    // 行道树
    for (const x of [-4.5, 4.2]) {
      g.add(cyl(0.1, 0.13, 1.8, mat('#6b4f36'), x, 0.9, -1.2));
      const crown = new THREE.Mesh(new THREE.SphereGeometry(0.9, 16, 12), mat('#5b9a52'));
      crown.position.set(x, 2.3, -1.2); crown.castShadow = true; g.add(crown);
    }
    return { group: g, outdoor: true, weatherArea: { x0: -6, x1: 6, z0: -6, z1: 3, h: 6 } };
  },

  office() {
    const g = new THREE.Group();
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), mat('#8e949b', { roughness: 0.95 }));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; g.add(floor);
    const z = -2.8;
    // 落地玻璃窗 + 窗框
    const frame = mat('#3a3f45', { metalness: 0.4 });
    for (let i = -3; i <= 3; i++) g.add(box(0.07, 3.3, 0.1, frame, i * 1.1, 1.65, z));
    g.add(box(7.6, 0.1, 0.12, frame, 0, 3.25, z));
    g.add(box(7.6, 0.3, 0.12, frame, 0, 0.15, z));
    const glass = new THREE.MeshPhysicalMaterial({ color: '#dbeaf5', transparent: true, opacity: 0.12, roughness: 0.02 });
    const pane = box(7.6, 3.1, 0.02, glass, 0, 1.65, z); pane.castShadow = false; g.add(pane);
    // 天花板
    const ceil = box(12, 0.1, 8, mat('#f3f3f3'), 0, 3.35, 0.6); ceil.castShadow = false; g.add(ceil);
    for (const x of [-1.8, 1.8]) g.add(box(1.4, 0.03, 0.4, mat('#ffffff', { emissive: '#ffffff', emissiveIntensity: 1 }), x, 3.29, -0.6));
    const ceilLight = new THREE.PointLight('#ffffff', 4, 8, 1.4); ceilLight.position.set(0, 3.0, 0); g.add(ceilLight);
    // 窗外城市天际线（高层办公室：往下能看到别的楼）
    const colors = ['#7d8fa3', '#95a3b3', '#6f8299', '#a4afbd'];
    for (let i = 0; i < 14; i++) {
      const h = 14 + ((i * 53) % 16);
      const x = -16 + i * 2.5 + ((i * 7) % 3) * 0.4;
      const zz = -14 - (i % 4) * 4;
      const b = box(2.2, h, 2.2, mat('#ffffff', { map: windowGridTex(colors[i % 4], '#fff3c4', 5, 20) }), x, h / 2 - 14, zz);
      b.castShadow = false; g.add(b);
    }
    // 工位
    const desk = mat('#e8e2d8');
    const deskMetal = mat('#555b62', { metalness: 0.4 });
    for (const [x, zz] of [[-2.3, -1.6], [2.3, -1.6]]) {
      g.add(box(1.6, 0.05, 0.8, desk, x, 0.75, zz));
      for (const dx of [-0.75, 0.75]) g.add(box(0.05, 0.75, 0.7, deskMetal, x + dx, 0.375, zz));
      g.add(box(0.7, 0.42, 0.03, mat('#111111', { emissive: '#3a6ea5', emissiveIntensity: 0.5 }), x, 1.12, zz - 0.2));
      g.add(box(0.05, 0.2, 0.05, deskMetal, x, 0.88, zz - 0.2));
      g.add(box(0.45, 0.02, 0.15, mat('#d0d0d0'), x, 0.79, zz + 0.1));
      g.add(cyl(0.04, 0.035, 0.1, mat('#e06c5a'), x + 0.55, 0.83, zz + 0.1));
    }
    // 椅子
    for (const x of [-2.3, 2.3]) {
      g.add(box(0.5, 0.08, 0.5, mat('#2d3540'), x, 0.48, -0.9));
      g.add(box(0.5, 0.6, 0.08, mat('#2d3540'), x, 0.85, -0.66));
      g.add(cyl(0.03, 0.03, 0.44, deskMetal, x, 0.22, -0.9));
    }
    // 白板
    const board = box(1.4, 0.9, 0.04, mat('#ffffff', { map: canvasTex(320, 200, (c, w, h) => {
      c.fillStyle = '#fbfbfb'; c.fillRect(0, 0, w, h);
      c.strokeStyle = '#2f6fae'; c.lineWidth = 4; c.beginPath(); c.moveTo(20, 160); c.lineTo(90, 110); c.lineTo(160, 130); c.lineTo(290, 40); c.stroke();
      c.fillStyle = '#d45d79'; c.font = 'bold 28px sans-serif'; c.fillText('Q4 目标 ↑', 24, 44);
    }) }), -3.4, 1.6, -0.6);
    board.rotation.y = Math.PI / 2;
    g.add(board);
    // 植物
    g.add(cyl(0.22, 0.18, 0.5, mat('#f0f0f0'), 3.3, 0.25, -2.3));
    for (let i = 0; i < 6; i++) {
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.8, 8), mat('#3f7d48'));
      leaf.position.set(3.3 + Math.sin(i) * 0.1, 0.85, -2.3 + Math.cos(i) * 0.1);
      leaf.rotation.set(Math.sin(i * 1.7) * 0.4, 0, Math.cos(i * 1.7) * 0.4); leaf.castShadow = true; g.add(leaf);
    }
    return { group: g, outdoor: false, weatherArea: { x0: -5, x1: 5, z0: -10, z1: -3, h: 6 }, skyZ: -40 };
  },
};

export class SceneManager {
  constructor(scene) {
    this.scene = scene;
    this.current = null;
    this.key = null;
    this.weather = { condition: 'sunny', temp: 22, night: false };
    this.hemi = new THREE.HemisphereLight('#ffffff', '#6b5a48', 1);
    this.sun = new THREE.DirectionalLight('#fff3e0', 2);
    this.sun.position.set(2.5, 5, 3);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    Object.assign(this.sun.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4, near: 0.5, far: 15 });
    this.sun.shadow.bias = -0.0005;
    scene.add(this.hemi, this.sun);
    this.skyMat = new THREE.MeshBasicMaterial({ depthWrite: false, fog: false });
    this.sky = new THREE.Mesh(new THREE.PlaneGeometry(80, 40), this.skyMat);
    this.sky.position.set(0, 8, -25);
    scene.add(this.sky);
    this.particles = null;
  }

  set(key) {
    if (!BUILDERS[key] || key === this.key) return false;
    if (this.current) {
      this.scene.remove(this.current.group);
      this.current.group.traverse((o) => { o.geometry?.dispose(); });
    }
    this.current = BUILDERS[key]();
    this.key = key;
    this.scene.add(this.current.group);
    this.applyWeather();
    return true;
  }

  setWeather(w) {
    this.weather = { ...this.weather, ...w };
    this.applyWeather();
  }

  applyWeather() {
    if (!this.current) return;
    const { condition, night } = this.weather;
    const s = night ? NIGHT : SKY[condition] ?? SKY.sunny;
    this.skyMat.map?.dispose();
    this.skyMat.map = gradientTex(s.top, s.bottom);
    this.skyMat.needsUpdate = true;
    this.sky.position.z = this.current.skyZ ?? -25;
    this.scene.background = new THREE.Color(s.bottom);
    const outdoor = this.current.outdoor;
    this.scene.fog = outdoor ? new THREE.Fog(s.fog, 8, condition === 'rain' || condition === 'snow' ? 18 : 30) : null;
    this.sun.intensity = outdoor ? s.sun : 0.6 + s.sun * 0.35;
    this.hemi.intensity = outdoor ? s.hemi : 0.9 + s.hemi * 0.2;
    if (this.particles) { this.scene.remove(this.particles); this.particles.geometry.dispose(); this.particles = null; }
    if (condition === 'rain') this.particles = makeRain(this.current.weatherArea);
    if (condition === 'snow') this.particles = makeSnow(this.current.weatherArea);
    if (this.particles) this.scene.add(this.particles);
  }

  update(dt) { this.particles?.userData.tick(dt); }
}
