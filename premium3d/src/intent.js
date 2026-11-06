// 话语 → 场景 / 动作 / 表情 的规则映射（纯函数，可在 Node 中测试）。
// 以后可以换成 LLM 打标签：只要输出同样的 Plan 结构即可。
//
// Plan = {
//   scene: 'home' | 'busStop' | 'office' | null,   // null = 保持当前场景
//   emotion: 'happy' | 'sad' | 'angry' | 'surprised' | 'relaxed' | 'neutral',
//   weather: 'sunny' | 'cloudy' | 'rain' | 'snow' | null,
//   beats: [{ start, end, text, gesture }]           // start/end 是字符下标
// }

export const SCENE_KEYWORDS = {
  home: ['在家', '回家', '家里', '客厅', '卧室', '沙发', '睡觉', '晚安', '做饭', '吃饭了', '起床', '周末宅'],
  busStop: ['公交', '车站', '站台', '等车', '坐车', '地铁', '出门', '通勤', '路上', '打车', '下雨'],
  office: ['公司', '上班', '办公室', '开会', '加班', '老板', '同事', '工作', '项目', '报告', '工位'],
};

// 顺序即优先级：靠前的先匹配
export const GESTURE_RULES = [
  { gesture: 'wave', words: ['你好', '嗨', '哈喽', 'hello', 'hi', '拜拜', '再见', '早上好', '晚上好', '回来啦', '欢迎'] },
  { gesture: 'bow', words: ['谢谢', '感谢', '对不起', '抱歉', '不好意思', '辛苦了'] },
  { gesture: 'cheer', words: ['太好了', '太棒了', '耶', '加油', '好开心', '开心', '恭喜', '成功了', '哇'] },
  { gesture: 'shrug', words: ['不知道', '不清楚', '也许', '可能吧', '随便', '无所谓', '谁知道'] },
  { gesture: 'shake', words: ['不是', '不行', '不要', '没有', '不对', '别', '不会'] },
  { gesture: 'think', words: ['让我想想', '想想', '我想', '为什么', '怎么办', '怎么', '嗯…', '嗯...', '考虑', '好像'] },
  { gesture: 'point', words: ['你看', '看那边', '那边', '这里', '那里', '这边', '前面', '左边', '右边'] },
  { gesture: 'heart', words: ['喜欢你', '爱你', '想你', '陪你', '放心', '别担心', '抱抱'] },
  { gesture: 'nod', words: ['好的', '好呀', '好啊', '对', '是的', '没问题', '当然', '可以', '嗯嗯', '明白', '知道了'] },
  { gesture: 'sad', words: ['难过', '伤心', '好累', '累了', '可惜', '唉', '委屈'] },
];

export const EMOTION_RULES = [
  { emotion: 'happy', words: ['开心', '哈哈', '太好了', '太棒了', '耶', '喜欢', '恭喜', '好玩', '嘻嘻'] },
  { emotion: 'sad', words: ['难过', '伤心', '可惜', '唉', '累', '委屈', '对不起'] },
  { emotion: 'angry', words: ['生气', '讨厌', '气死', '烦死'] },
  { emotion: 'surprised', words: ['哇', '真的吗', '天哪', '居然', '竟然', '什么？'] },
  { emotion: 'relaxed', words: ['晚安', '放松', '舒服', '慢慢来', '别担心', '放心'] },
];

const CLAUSE_SPLIT = /[^，,。.！!？?；;、…~\n]+[，,。.！!？?；;、…~\n]*/g;

export function splitClauses(text) {
  const out = [];
  for (const m of text.matchAll(CLAUSE_SPLIT)) {
    const raw = m[0];
    if (!raw.trim()) continue;
    out.push({ start: m.index, end: m.index + raw.length, text: raw });
  }
  return out;
}

function firstHit(text, words) {
  const lower = text.toLowerCase();
  let best = -1;
  for (const w of words) {
    const i = lower.indexOf(w.toLowerCase());
    if (i >= 0 && (best < 0 || i < best)) best = i;
  }
  return best;
}

export function detectScene(text) {
  let best = null;
  let bestScore = 0;
  for (const [scene, words] of Object.entries(SCENE_KEYWORDS)) {
    let score = 0;
    for (const w of words) if (text.includes(w)) score += w.length;
    if (score > bestScore) { best = scene; bestScore = score; }
  }
  return best;
}

// 话里提到天气时（"外面在下雨"），画面也跟着变；真实天气数据来了会再覆盖
export const WEATHER_KEYWORDS = {
  rain: ['下雨', '雨好大', '带伞', '淋雨', '雨天'],
  snow: ['下雪', '雪好大', '堆雪人'],
  sunny: ['大晴天', '太阳好大', '阳光很好', '晴天'],
  cloudy: ['阴天', '多云'],
};
export function detectWeather(text) {
  for (const [cond, words] of Object.entries(WEATHER_KEYWORDS)) {
    if (words.some((w) => text.includes(w))) return cond;
  }
  return null;
}

export function detectEmotion(text) {
  let best = 'neutral';
  let bestScore = 0;
  for (const { emotion, words } of EMOTION_RULES) {
    let score = 0;
    for (const w of words) if (text.includes(w)) score += 1;
    if (score > bestScore) { best = emotion; bestScore = score; }
  }
  return best;
}

export function gestureForClause(clause) {
  for (const { gesture, words } of GESTURE_RULES) {
    if (firstHit(clause, words) >= 0) return gesture;
  }
  return null;
}

// 每句选一个动作；没有关键词的句子用说话时的手势（talk），
// 但连续两句都只是 talk 时第二句留空，避免手一直在动。
export function planUtterance(text, opts = {}) {
  const clauses = splitClauses(text);
  const beats = [];
  let prevWasTalk = false;
  for (const c of clauses) {
    let g = gestureForClause(c.text);
    if (!g) {
      const longEnough = c.text.replace(/[\s，,。.！!？?；;、…~]/g, '').length >= 4;
      g = longEnough && !prevWasTalk ? 'talk' : null;
    }
    prevWasTalk = g === 'talk';
    beats.push({ ...c, gesture: g });
  }
  return {
    scene: opts.scene ?? detectScene(text),
    emotion: opts.emotion ?? detectEmotion(text),
    weather: detectWeather(text),
    beats,
  };
}
