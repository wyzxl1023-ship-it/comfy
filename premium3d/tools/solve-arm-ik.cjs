// 离线工具：给定手的目标位置，反解 VRM 手臂骨骼角度（用于 gestures.js 里托腮/捂心/举伞等姿势）。
// 用法：npm run build && npx vite preview --port 4173 后，node tools/solve-arm-ik.cjs
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 200, height: 300 } });
  await p.goto('http://localhost:4173/?mute&kiosk');
  await p.waitForFunction(() => window.__ready, null, { timeout: 90000 });
  const res = await p.evaluate(() => {
    const a = window.xiaoyou.avatar; const vrm = a.vrm;
    a.update = () => {}; // stop the loop from touching bones
    const THREE = { };
    const H = vrm.humanoid;
    const wp = (n) => { const v = H.getRawBoneNode(n).getWorldPosition(H.getRawBoneNode(n).position.clone()); return [v.x, v.y, v.z]; };
    const reset = () => { for (const n of ['leftUpperArm','rightUpperArm','leftLowerArm','rightLowerArm','leftHand','rightHand','head','chest','spine','neck']) { const b = H.getNormalizedBoneNode(n); b && b.rotation.set(0,0,0); } };
    const apply = (side, v) => {
      H.getNormalizedBoneNode(side+'UpperArm').rotation.set(v[0], v[1], v[2]);
      const y = side === 'right' ? Math.min(Math.max(v[4], 0), 2.6) : Math.min(Math.max(v[4], -2.6), 0);
      v[3] = 0; v[5] = 0; v[4] = y;
      H.getNormalizedBoneNode(side+'LowerArm').rotation.set(0, y, 0);
      H.update(); vrm.scene.updateMatrixWorld(true);
    };
    reset(); H.update(); vrm.scene.updateMatrixWorld(true);
    const head = wp('head'), chest = wp('upperChest') ?? wp('chest'), hips = wp('hips'), neck = wp('neck');
    const ls = wp('leftUpperArm'), rs = wp('rightUpperArm');
    const solve = (side, target, init) => {
      const sx = side === 'right' ? -1 : 1;
      const cost = (v) => {
        apply(side, v);
        const h = wp(side+'Hand'), e = wp(side+'LowerArm');
        let c = Math.hypot(h[0]-target[0], h[1]-target[1], h[2]-target[2]);
        // 手肘别穿进身体：要在身体外侧或前面
        const sh = side === 'right' ? rs : ls;
        const lat = (e[0] - sh[0]) * sx; // 手肘相对肩膀的外侧距离
        if (lat < 0.0) c += -lat * 4;
        if (e[1] > sh[1] - 0.05) c += (e[1] - sh[1] + 0.05) * 4; // 手肘低于肩
        if (e[2] < -0.08) c += (-0.08 - e[2]) * 4;
        c += 0.01 * (Math.abs(v[0]) + Math.abs(v[1]) + Math.abs(v[2]));
        return c;
      };
      let best = init.slice(), bc = cost(best);
      let step = 0.6;
      for (let it = 0; it < 6000; it++) {
        const v = best.map((x, i) => x + (Math.random()*2-1) * step * (i===3?0.2:1));
        const c = cost(v);
        if (c < bc) { best = v; bc = c; }
        if (it % 600 === 599) step *= 0.6;
      }
      apply(side, best);
      return { v: best.map(x => +x.toFixed(2)), err: +bc.toFixed(3), elbow: wp(side+'LowerArm').map(x=>+x.toFixed(2)), hand: wp(side+'Hand').map(x=>+x.toFixed(2)) };
    };
    const out = { head, chest, hips, neck, rs, ls };
    out.think = solve('right', [head[0]-0.01, head[1]-0.06, head[2]+0.1], [0,0,1.2,0,0,0]); reset();
    out.heartR = solve('right', [chest[0]-0.05, chest[1]+0.0, chest[2]+0.13], [0,0,1.2,0,0,0]); reset();
    out.heartL = solve('left', [chest[0]+0.05, chest[1]+0.0, chest[2]+0.13], [0,0,-1.2,0,0,0]); reset();
    out.umbrella = solve('left', [ls[0]-0.02, chest[1]-0.02, chest[2]+0.28], [0,0,-1.2,0,0,0]); reset();
    out.talk = solve('right', [rs[0]+0.02, hips[1]+0.2, hips[2]+0.3], [0,0,1.2,0,0,0]); reset();
    out.chinL = solve('left', [head[0]+0.08, head[1]-0.12, head[2]+0.12], [0,0,-1.2,0,0,0]); reset();
    return out;
  });
  console.log(JSON.stringify(res, null, 0).replace(/},/g, '},\n'));
  await b.close();
})();
