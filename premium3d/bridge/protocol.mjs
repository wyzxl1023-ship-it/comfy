// 状态接口消息校验（桥接服务和测试共用）
// heard = 用户对小柚说的话（只记日志，页面不处理）
export const TYPES = ['say', 'heard', 'state', 'scene', 'weather', 'level', 'gesture', 'emotion', 'outfit'];
export const STATES = ['idle', 'listening', 'thinking', 'speaking'];

export function validate(m) {
  if (!m || typeof m !== 'object' || Array.isArray(m)) return 'body must be a JSON object';
  if (!TYPES.includes(m.type)) return `unknown type: ${m.type}`;
  if ((m.type === 'say' || m.type === 'heard') && (typeof m.text !== 'string' || !m.text)) return `${m.type}.text required`;
  if (m.type === 'state' && !STATES.includes(m.state)) return `state must be one of ${STATES.join('/')}`;
  if (m.type === 'level' && (typeof m.v !== 'number' || m.v < 0 || m.v > 1)) return 'level.v must be 0..1';
  if (m.type === 'weather' && m.temp !== undefined && typeof m.temp !== 'number') return 'weather.temp must be a number';
  return null;
}
