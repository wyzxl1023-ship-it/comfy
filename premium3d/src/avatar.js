import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import { BASE_POSE, GESTURES, sampleGesture } from './gestures.js';

const FADE_IN = 0.3;
const FADE_OUT = 0.35;
const EMOTIONS = ['happy', 'sad', 'angry', 'surprised', 'relaxed'];

export class Avatar {
  constructor(scene) {
    this.scene = scene;
    this.vrm = null;
    this.active = []; // { name, t }
    this.emotion = 'neutral';
    this.emotionWeights = Object.fromEntries(EMOTIONS.map((e) => [e, 0]));
    this.mouth = 0; // 0..1，由口型模块写入
    this.blinkTimer = 2;
    this.blinkT = -1;
    this.time = 0;
    this.lookTarget = new THREE.Object3D();
    this.lookTarget.position.set(0, 1.35, 3);
    scene.add(this.lookTarget);
    this._qa = new THREE.Quaternion();
    this._qb = new THREE.Quaternion();
    this._e = new THREE.Euler();
  }

  async load(url) {
    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));
    const gltf = await loader.loadAsync(url);
    const vrm = gltf.userData.vrm;
    VRMUtils.removeUnnecessaryVertices(gltf.scene);
    VRMUtils.combineSkeletons(gltf.scene);
    VRMUtils.rotateVRM0(vrm); // VRM0 模型朝向修正（VRM1 无影响）
    if (this.vrm) {
      this.scene.remove(this.vrm.scene);
      VRMUtils.deepDispose(this.vrm.scene);
    }
    vrm.scene.traverse((o) => {
      if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; }
    });
    if (vrm.lookAt) vrm.lookAt.target = this.lookTarget;
    this.vrm = vrm;
    this.scene.add(vrm.scene);
    this.materials = collectMaterials(vrm.scene);
    return vrm;
  }

  bone(name) {
    return this.vrm?.humanoid?.getNormalizedBoneNode(name) ?? null;
  }

  play(name) {
    if (!GESTURES[name]) return;
    // 同一时刻只保留一个手势，新的会把旧的淡出
    for (const a of this.active) if (!a.fadingOut) { a.fadingOut = true; a.fadeStart = a.t; }
    this.active.push({ name, t: 0 });
  }

  setEmotion(e) { this.emotion = EMOTIONS.includes(e) ? e : 'neutral'; }

  update(dt) {
    const vrm = this.vrm;
    if (!vrm) return;
    this.time += dt;

    // 1) 汇总每根骨骼的目标姿势
    const pose = {};
    for (const [b, r] of Object.entries(BASE_POSE)) pose[b] = r.slice();

    // 呼吸和身体轻微摆动
    const breath = Math.sin(this.time * 1.6);
    pose.spine = [0.02 * breath, 0.03 * Math.sin(this.time * 0.37), 0.015 * Math.sin(this.time * 0.5)];
    pose.chest = [0.015 * breath, 0, 0];
    pose.head = [0.03 * Math.sin(this.time * 0.7), 0.06 * Math.sin(this.time * 0.29), 0.03 * Math.sin(this.time * 0.43)];
    if (this.holdUmbrella) {
      // 左手在胸前举伞
      pose.leftUpperArm = [0.02, -0.89, -0.44];
      pose.leftLowerArm = [0, -1.41, 0];
      pose.leftHand = [0, 0, 0];
    }
    pose.leftUpperArm[2] += 0.02 * breath;
    pose.rightUpperArm[2] -= 0.02 * breath;

    const weights = {};
    this.active = this.active.filter((a) => {
      a.t += dt;
      const g = GESTURES[a.name];
      const end = a.fadingOut ? a.fadeStart + FADE_OUT : g.duration;
      return a.t < end;
    });
    for (const a of this.active) {
      const g = GESTURES[a.name];
      let w = Math.min(a.t / FADE_IN, 1);
      w = Math.min(w, Math.max((g.duration - a.t) / FADE_OUT, 0));
      if (a.fadingOut) w = Math.min(w, Math.max(1 - (a.t - a.fadeStart) / FADE_OUT, 0));
      w = w * w * (3 - 2 * w);
      const s = sampleGesture(a.name, Math.min(a.t, g.duration));
      for (const [b, r] of Object.entries(s)) {
        if (!weights[b]) weights[b] = [];
        weights[b].push({ r, w });
      }
    }

    // 2) 写入骨骼：基础 → 手势（球面插值）
    const bones = new Set([...Object.keys(pose), ...Object.keys(weights)]);
    for (const b of bones) {
      const node = this.bone(b);
      if (!node) continue;
      const base = pose[b] ?? [0, 0, 0];
      this._qa.setFromEuler(this._e.set(base[0], base[1], base[2]));
      for (const { r, w } of weights[b] ?? []) {
        // 头部动作叠加在呼吸摆动上，其它骨骼直接替换
        const add = b === 'head' || b === 'neck' || b === 'spine' || b === 'chest';
        const rr = add ? [r[0] + base[0], r[1] + base[1], r[2] + base[2]] : r;
        this._qb.setFromEuler(this._e.set(rr[0], rr[1], rr[2]));
        this._qa.slerp(this._qb, w);
      }
      node.quaternion.copy(this._qa);
    }

    // 3) 表情：情绪淡入淡出 + 眨眼 + 口型
    const em = vrm.expressionManager;
    if (em) {
      for (const e of EMOTIONS) {
        const target = e === this.emotion ? (e === 'surprised' ? 0.8 : 0.7) : 0;
        this.emotionWeights[e] += (target - this.emotionWeights[e]) * Math.min(dt * 4, 1);
        em.setValue(e, this.emotionWeights[e]);
      }
      this.blinkTimer -= dt;
      if (this.blinkTimer <= 0 && this.blinkT < 0) { this.blinkT = 0; this.blinkTimer = 2 + Math.random() * 3; }
      let blink = 0;
      if (this.blinkT >= 0) {
        this.blinkT += dt;
        blink = Math.sin(Math.min(this.blinkT / 0.16, 1) * Math.PI);
        if (this.blinkT > 0.16) this.blinkT = -1;
      }
      // 开心时眼睛本身会眯，眨眼减弱避免穿模
      em.setValue('blink', blink * (1 - this.emotionWeights.happy));
      const m = this.mouth;
      const wob = 0.5 + 0.5 * Math.sin(this.time * 17);
      em.setValue('aa', m * (0.6 + 0.4 * wob));
      em.setValue('oh', m * 0.35 * (1 - wob));
      em.setValue('ih', m * 0.2 * wob);
    }

    vrm.update(dt);
  }
}

function collectMaterials(root) {
  const out = {};
  root.traverse((o) => {
    if (!o.isMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      const name = m.name.replace(/ \(Outline\)$/, '');
      (out[name] ??= []).push(m);
    }
  });
  return out;
}
