import * as THREE from 'three';

// 2.5D 背景：用一张画好的背景图（手绘/AI 出图）铺满画面，小柚站在画前面。
// 找图顺序：主人上传的 > public/backgrounds/ 里的文件；都没有就用程序化 3D 场景。
// 文件命名：{场景}-{天气}[-night].jpg，例如 busStop-rain.jpg、home-sunny-night.jpg；
//          也可以只放 {场景}.jpg，所有天气共用（雨雪粒子和光照仍会叠加）。
export function candidates(scene, weather) {
  const { condition, night } = weather;
  const out = [];
  if (night) out.push(`${scene}-${condition}-night`, `${scene}-night`);
  out.push(`${scene}-${condition}`, scene);
  return out;
}

export class Backdrop {
  constructor(scene, camera) {
    this.camera = camera;
    this.distance = 40;
    this.mat = new THREE.MeshBasicMaterial({ depthWrite: false, fog: false, toneMapped: false });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.mat);
    this.mesh.renderOrder = -10;
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    camera.add(this.mesh);
    scene.add(camera);
    // 只接收影子的透明地面，让人物脚下有影子
    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.ShadowMaterial({ opacity: 0.22 }));
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.receiveShadow = true;
    this.ground.visible = false;
    scene.add(this.ground);
    this.files = new Set();
    this.uploads = new Map(); // key -> dataURL
    this.cache = new Map();
    this.current = null;
  }

  async loadManifest(url) {
    try {
      const r = await fetch(url);
      if (r.ok) for (const f of await r.json()) this.files.add(f);
    } catch { /* 没有清单就只用上传的图 */ }
  }

  find(sceneKey, weather) {
    for (const key of candidates(sceneKey, weather)) {
      if (this.uploads.has(key)) return this.uploads.get(key);
      for (const ext of ['jpg', 'png', 'webp']) {
        if (this.files.has(`${key}.${ext}`)) return `./backgrounds/${key}.${ext}`;
      }
    }
    return null;
  }

  // 返回 true 表示用了背景图
  async show(sceneKey, weather) {
    const url = this.find(sceneKey, weather);
    if (!url) { this.hide(); return false; }
    if (url !== this.current) {
      let tex = this.cache.get(url);
      if (!tex) {
        tex = await new THREE.TextureLoader().loadAsync(url);
        tex.colorSpace = THREE.SRGBColorSpace;
        this.cache.set(url, tex);
      }
      this.mat.map = tex;
      this.mat.needsUpdate = true;
      this.current = url;
    }
    this.mesh.visible = true;
    this.ground.visible = true;
    this.fit();
    return true;
  }

  hide() {
    this.mesh.visible = false;
    this.ground.visible = false;
    this.current = null;
  }

  // 铺满画面（cover），底边对齐，让画里的地面贴近人物脚下
  fit() {
    const img = this.mat.map?.image;
    if (!img) return;
    const cam = this.camera;
    const viewH = 2 * this.distance * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    const viewW = viewH * cam.aspect * (cam.view?.enabled ? cam.view.fullWidth / cam.view.width : 1) * 1.02;
    const ia = img.width / img.height;
    let w = viewW; let h = viewW / ia;
    if (h < viewH) { h = viewH; w = viewH * ia; }
    this.mesh.scale.set(w, h, 1);
    this.mesh.position.set(0, (h - viewH) / 2, -this.distance);
  }
}
