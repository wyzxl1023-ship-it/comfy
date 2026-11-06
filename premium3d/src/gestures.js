// 动作库：用 VRM 归一化骨骼的欧拉角（弧度）写关键帧，不依赖任何第三方动作文件，
// 所以没有动作素材的版权问题；换任何 VRM 模型都能直接用。
// 关键帧 t 取 0..1（占动作时长的比例）。没写到的骨骼保持基础姿势。
// 以后可以加载 .vrma（VRM Animation）或动捕数据替换这里。
// 托腮/捂心/说话手势/举伞的手臂角度是用手部目标位置反解（IK）算出来的（离线求解，不在运行时）。

// 基础站姿：双臂自然下垂、手肘微弯
export const BASE_POSE = {
  leftUpperArm: [0, 0, -1.3],
  rightUpperArm: [0, 0, 1.3],
  leftLowerArm: [0, -0.25, 0],
  rightLowerArm: [0, 0.25, 0],
  leftHand: [0, 0, -0.1],
  rightHand: [0, 0, 0.1],
};

const k = (t, pose) => ({ t, pose });

export const GESTURES = {
  // 挥手：右臂抬起，前臂左右摆
  wave: {
    duration: 2.2,
    frames: [
      k(0.0, { rightUpperArm: [0, 0.35, 0.1], rightLowerArm: [0, 0, -1.4], rightHand: [0, 0, 0], head: [0, 0, 0.08] }),
      k(0.25, { rightUpperArm: [0, 0.35, 0.1], rightLowerArm: [0, 0, -1.1], rightHand: [0, 0, 0.2], head: [0, 0, 0.08] }),
      k(0.45, { rightUpperArm: [0, 0.35, 0.1], rightLowerArm: [0, 0, -1.7], rightHand: [0, 0, -0.2], head: [0, 0, 0.08] }),
      k(0.65, { rightUpperArm: [0, 0.35, 0.1], rightLowerArm: [0, 0, -1.1], rightHand: [0, 0, 0.2], head: [0, 0, 0.08] }),
      k(0.85, { rightUpperArm: [0, 0.35, 0.1], rightLowerArm: [0, 0, -1.7], rightHand: [0, 0, -0.2], head: [0, 0, 0.08] }),
      k(1.0, { rightUpperArm: [0, 0.35, 0.1], rightLowerArm: [0, 0, -1.4], rightHand: [0, 0, 0], head: [0, 0, 0.08] }),
    ],
  },
  // 点头
  nod: {
    duration: 1.2,
    frames: [
      k(0.0, { head: [0, 0, 0], neck: [0, 0, 0] }),
      k(0.25, { head: [0.25, 0, 0], neck: [0.08, 0, 0] }),
      k(0.5, { head: [-0.05, 0, 0], neck: [0, 0, 0] }),
      k(0.75, { head: [0.2, 0, 0], neck: [0.06, 0, 0] }),
      k(1.0, { head: [0, 0, 0], neck: [0, 0, 0] }),
    ],
  },
  // 摇头
  shake: {
    duration: 1.3,
    frames: [
      k(0.0, { head: [0, 0, 0] }),
      k(0.2, { head: [0, 0.3, 0] }),
      k(0.45, { head: [0, -0.3, 0] }),
      k(0.7, { head: [0, 0.25, 0] }),
      k(0.9, { head: [0, -0.1, 0] }),
      k(1.0, { head: [0, 0, 0] }),
    ],
  },
  // 思考：右手托下巴，头歪一点
  think: {
    duration: 2.6,
    frames: [
      k(0.0, { rightUpperArm: [-0.96, 0.91, 1.22], rightLowerArm: [0, 2.43, 0], rightHand: [0, 0, -0.3], head: [0.05, -0.1, 0.15] }),
      k(1.0, { rightUpperArm: [-0.96, 0.91, 1.22], rightLowerArm: [0, 2.43, 0], rightHand: [0, 0, -0.3], head: [0.05, -0.15, 0.18] }),
    ],
  },

  // 指向：右臂往右前方伸出
  point: {
    duration: 2.0,
    frames: [
      k(0.0, { rightUpperArm: [0, 1.15, 0.2], rightLowerArm: [0, 0.15, 0], head: [0, -0.35, 0], spine: [0, -0.1, 0] }),
      k(1.0, { rightUpperArm: [0, 1.15, 0.2], rightLowerArm: [0, 0.15, 0], head: [0, -0.35, 0], spine: [0, -0.1, 0] }),
    ],
  },
  // 耸肩摊手
  shrug: {
    duration: 1.8,
    frames: [
      k(0.0, { leftUpperArm: [0, 0, -1.25], rightUpperArm: [0, 0, 1.25], leftLowerArm: [0, -1.4, 0.3], rightLowerArm: [0, 1.4, -0.3], leftShoulder: [0, 0, 0.15], rightShoulder: [0, 0, -0.15], head: [0, 0, 0.15] }),
      k(1.0, { leftUpperArm: [0, 0, -1.25], rightUpperArm: [0, 0, 1.25], leftLowerArm: [0, -1.4, 0.3], rightLowerArm: [0, 1.4, -0.3], leftShoulder: [0, 0, 0.15], rightShoulder: [0, 0, -0.15], head: [0, 0, 0.15] }),
    ],
  },
  // 鞠躬
  bow: {
    duration: 2.0,
    frames: [
      k(0.0, { spine: [0, 0, 0], chest: [0, 0, 0], head: [0, 0, 0] }),
      k(0.35, { spine: [0.35, 0, 0], chest: [0.15, 0, 0], head: [0.2, 0, 0] }),
      k(0.65, { spine: [0.35, 0, 0], chest: [0.15, 0, 0], head: [0.2, 0, 0] }),
      k(1.0, { spine: [0, 0, 0], chest: [0, 0, 0], head: [0, 0, 0] }),
    ],
  },
  // 欢呼：双手举高
  cheer: {
    duration: 1.8,
    frames: [
      k(0.0, { leftUpperArm: [0, 0, 0.9], rightUpperArm: [0, 0, -0.9], leftLowerArm: [0, 0, 0.4], rightLowerArm: [0, 0, -0.4], head: [-0.1, 0, 0] }),
      k(0.5, { leftUpperArm: [0, 0, 1.1], rightUpperArm: [0, 0, -1.1], leftLowerArm: [0, 0, 0.2], rightLowerArm: [0, 0, -0.2], head: [-0.15, 0, 0] }),
      k(1.0, { leftUpperArm: [0, 0, 0.9], rightUpperArm: [0, 0, -0.9], leftLowerArm: [0, 0, 0.4], rightLowerArm: [0, 0, -0.4], head: [-0.1, 0, 0] }),
    ],
  },
  // 双手放胸口
  heart: {
    duration: 2.2,
    frames: [
      k(0.0, { leftUpperArm: [0.53, -0.79, 0], rightUpperArm: [0.53, 0.79, 0], leftLowerArm: [0, -2.21, 0], rightLowerArm: [0, 2.21, 0], head: [0.08, 0, 0.12] }),
      k(1.0, { leftUpperArm: [0.53, -0.79, 0], rightUpperArm: [0.53, 0.79, 0], leftLowerArm: [0, -2.21, 0], rightLowerArm: [0, 2.21, 0], head: [0.08, 0, 0.12] }),
    ],
  },

  // 害羞：低头、头扭向一边、肩膀微缩（2D 版还会脸红）
  shy: {
    duration: 2.6,
    frames: [
      k(0.0, { head: [0.2, -0.3, 0.12], neck: [0.05, -0.08, 0], spine: [0.04, 0.06, 0], leftShoulder: [0, 0, 0.06], rightShoulder: [0, 0, -0.06] }),
      k(1.0, { head: [0.2, -0.3, 0.12], neck: [0.05, -0.08, 0], spine: [0.04, 0.06, 0], leftShoulder: [0, 0, 0.06], rightShoulder: [0, 0, -0.06] }),
    ],
  },

  // 低落：低头、肩膀垂下
  sad: {
    duration: 2.4,
    frames: [
      k(0.0, { head: [0.3, 0, 0], neck: [0.1, 0, 0], spine: [0.08, 0, 0], leftShoulder: [0, 0, -0.08], rightShoulder: [0, 0, 0.08] }),
      k(1.0, { head: [0.3, 0, 0], neck: [0.1, 0, 0], spine: [0.08, 0, 0], leftShoulder: [0, 0, -0.08], rightShoulder: [0, 0, 0.08] }),
    ],
  },
  // 说话时的普通手势：右前臂抬起比划
  talk: {
    duration: 1.8,
    frames: [
      k(0.0, { rightUpperArm: [-0.12, 0.96, 0.7], rightLowerArm: [0, 1.11, 0], rightHand: [0, 0, 0] }),
      k(0.4, { rightUpperArm: [-0.2, 0.9, 0.62], rightLowerArm: [0, 1.25, 0], rightHand: [0, 0.25, 0.1] }),
      k(0.7, { rightUpperArm: [-0.08, 1.0, 0.75], rightLowerArm: [0, 1.0, 0], rightHand: [0, -0.15, 0] }),
      k(1.0, { rightUpperArm: [-0.12, 0.96, 0.7], rightLowerArm: [0, 1.11, 0], rightHand: [0, 0, 0] }),
    ],
  },

};

export const GESTURE_LABELS = {
  wave: '挥手', nod: '点头', shake: '摇头', think: '思考', point: '指向',
  shrug: '摊手', bow: '鞠躬', cheer: '欢呼', heart: '捂心', shy: '害羞', sad: '低落', talk: '说话手势',
  hug: '要抱抱', kiss: '飞吻', chin: '托腮', cry: '哭唧唧', angry: '哼', eat: '吃东西', cute: '撒娇',
  drink: '喝奶茶', laugh: '大笑', wink: '眨眼', yawn: '打哈欠', surprised: '惊讶', coverEars: '捂耳朵', leaveBack: '假装要走',
};

// 采样某个动作在 t 秒时的姿势
export function sampleGesture(name, t) {
  const g = GESTURES[name];
  if (!g) return null;
  const u = Math.min(Math.max(t / g.duration, 0), 1);
  const f = g.frames;
  let i = 0;
  while (i < f.length - 2 && u > f[i + 1].t) i++;
  const a = f[i];
  const b = f[Math.min(i + 1, f.length - 1)];
  const span = b.t - a.t || 1;
  let w = Math.min(Math.max((u - a.t) / span, 0), 1);
  w = w * w * (3 - 2 * w); // smoothstep
  const out = {};
  const bones = new Set([...Object.keys(a.pose), ...Object.keys(b.pose)]);
  for (const bone of bones) {
    const pa = a.pose[bone] ?? b.pose[bone];
    const pb = b.pose[bone] ?? a.pose[bone];
    out[bone] = [0, 1, 2].map((j) => pa[j] + (pb[j] - pa[j]) * w);
  }
  return out;
}
