import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// 手绘温暖风（吉卜力式的"感觉"，不是复制任何具体作品）：
// 1) 场景物体改成色块分明的卡通材质；2) 天空画成大朵积云；
// 3) 后期：暖色调、柔和对比、纸张颗粒、轻微暗角和水彩式边缘柔化。

let toonRamp = null;
function ramp() {
  if (toonRamp) return toonRamp;
  // 三阶明暗：阴影 / 中间 / 亮面
  const data = new Uint8Array([90, 90, 90, 255, 175, 175, 175, 255, 255, 255, 255, 255]);
  toonRamp = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
  toonRamp.minFilter = toonRamp.magFilter = THREE.NearestFilter;
  toonRamp.needsUpdate = true;
  return toonRamp;
}

// 把场景里的写实材质换成卡通材质（保留颜色、贴图、自发光）
export function paintMaterials(root) {
  root.traverse((o) => {
    if (!o.isMesh || o.userData.keepMaterial) return;
    const m = o.material;
    if (!m || m.isMeshToonMaterial || m.isMeshBasicMaterial) return;
    if (m.transparent && m.opacity < 0.5) return; // 玻璃保持原样
    const t = new THREE.MeshToonMaterial({
      color: m.color?.clone().lerp(new THREE.Color('#fff2dc'), 0.08),
      map: m.map ?? null,
      emissive: m.emissive?.clone() ?? new THREE.Color(0),
      emissiveIntensity: m.emissiveIntensity ?? 1,
      gradientMap: ramp(),
      transparent: m.transparent,
      opacity: m.opacity,
      side: m.side,
    });
    o.material = t;
    m.dispose();
  });
}

// 画一张带积云的天空（每种天气不同）
export function cloudSky(top, bottom, condition, night) {
  const w = 1024; const h = 512;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, h);
  gr.addColorStop(0, top); gr.addColorStop(1, bottom);
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  if (night) {
    for (let i = 0; i < 160; i++) {
      g.fillStyle = `rgba(255,255,240,${0.3 + rnd() * 0.7})`;
      g.fillRect(rnd() * w, rnd() * h * 0.7, 1.5, 1.5);
    }
    g.fillStyle = '#fff6d8';
    g.beginPath(); g.arc(w * 0.78, h * 0.18, 26, 0, 7); g.fill();
    return toTex(c);
  }
  const heavy = condition === 'rain' || condition === 'snow' || condition === 'cloudy';
  const n = heavy ? 9 : 5;
  for (let k = 0; k < n; k++) {
    const cx = rnd() * w; const cy = h * (0.25 + rnd() * (heavy ? 0.45 : 0.35));
    const size = (heavy ? 90 : 70) + rnd() * 70;
    // 一朵积云 = 许多软边圆叠起来，底部平、上面鼓
    for (let i = 0; i < 26; i++) {
      const ox = (rnd() - 0.5) * size * 2.4;
      const oy = -rnd() * size * 0.9;
      const r = size * (0.35 + rnd() * 0.45);
      const shade = heavy ? 200 + rnd() * 30 : 240 + rnd() * 15;
      const cg = g.createRadialGradient(cx + ox, cy + oy, r * 0.2, cx + ox, cy + oy, r);
      cg.addColorStop(0, `rgba(${shade},${shade},${shade + 5},0.95)`);
      cg.addColorStop(0.7, `rgba(${shade},${shade},${shade + 5},0.75)`);
      cg.addColorStop(1, `rgba(${shade},${shade},${shade + 5},0)`);
      g.fillStyle = cg;
      g.beginPath(); g.arc(cx + ox, cy + oy, r, 0, 7); g.fill();
    }
    // 云底阴影
    g.fillStyle = heavy ? 'rgba(120,130,145,0.18)' : 'rgba(150,170,200,0.15)';
    g.beginPath(); g.ellipse(cx, cy + size * 0.05, size * 1.3, size * 0.18, 0, 0, 7); g.fill();
  }
  return toTex(c);
}
function toTex(c) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const PaintShader = {
  uniforms: {
    tDiffuse: { value: null },
    resolution: { value: new THREE.Vector2(1, 1) },
    time: { value: 0 },
    warmth: { value: 1 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform vec2 resolution;
    uniform float time;
    uniform float warmth;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    float noise(vec2 p) {
      vec2 i = floor(p); vec2 f = fract(p);
      float a = hash(i), b = hash(i + vec2(1, 0)), c = hash(i + vec2(0, 1)), d = hash(i + vec2(1, 1));
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
    }
    void main() {
      vec2 px = 1.0 / resolution;
      // 水彩感：按纸纹轻微扰动取样位置，再做一点柔化
      float n = noise(vUv * resolution / 6.0);
      vec2 uv = vUv + (n - 0.5) * px * 1.6;
      vec3 col = texture2D(tDiffuse, uv).rgb * 0.5;
      col += texture2D(tDiffuse, uv + vec2(px.x, 0.0)).rgb * 0.125;
      col += texture2D(tDiffuse, uv - vec2(px.x, 0.0)).rgb * 0.125;
      col += texture2D(tDiffuse, uv + vec2(0.0, px.y)).rgb * 0.125;
      col += texture2D(tDiffuse, uv - vec2(0.0, px.y)).rgb * 0.125;
      // 暖色、提亮暗部、稍降饱和
      float l = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(vec3(l), col, 1.12);
      col = col * 0.95 + 0.035;
      col *= mix(vec3(1.0), vec3(1.04, 1.0, 0.92), warmth);
      // 纸张颗粒（静态，不闪）
      float paper = noise(vUv * resolution / 2.0) * 0.6 + noise(vUv * resolution / 23.0) * 0.4;
      col *= 0.965 + paper * 0.05;
      // 暗角
      vec2 d = vUv - 0.5;
      col *= 1.0 - dot(d, d) * 0.45;
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

export class PaintedRenderer {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(scene, camera));
    this.pass = new ShaderPass(PaintShader);
    this.composer.addPass(this.pass);
    this.composer.addPass(new OutputPass());
  }
  setSize(w, h) {
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(w, h);
    const v = new THREE.Vector2();
    this.renderer.getDrawingBufferSize(v);
    this.pass.uniforms.resolution.value.copy(v);
  }
  render(dt) {
    this.pass.uniforms.time.value += dt;
    this.composer.render(dt);
  }
}

// 角色材质的手绘化：描线变细、明暗分界更干脆、阴影偏暖
export function paintCharacter(materials) {
  for (const list of Object.values(materials ?? {})) {
    for (const m of list) {
      if (!m.isMToonMaterial) continue;
      if (m.outlineWidthFactor !== undefined) m.outlineWidthFactor *= 0.55;
      if (m.outlineColorFactor) m.outlineColorFactor.set('#5a3c32');
      if (m.shadingToonyFactor !== undefined) m.shadingToonyFactor = Math.max(m.shadingToonyFactor, 0.95);
      if (m.rimLightingMixFactor !== undefined) m.rimLightingMixFactor = 0.0;
      if (m.parametricRimColorFactor) m.parametricRimColorFactor.set('#000000');
      m.needsUpdate = true;
    }
  }
}
