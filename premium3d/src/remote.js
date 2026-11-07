// 摇杆遥控器：轮流切换的小工具（Mac 应用把遥控按键转成 {type:'remote', action} 发过来）
// 遥控器"做个动作"轮流用的动作：挑看得清、不需要说话配合的
export const REMOTE_GESTURES = ['wave', 'nod', 'cheer', 'heart', 'shy', 'kiss', 'cute', 'wink', 'laugh', 'hug'];

// 在 list 里从 current 往前/往后走 step 步（循环）；current 不在 list 里时，往后从第一个开始、往前从最后一个开始
export function cycle(list, current, step = 1) {
  if (!list.length) return undefined;
  const i = list.indexOf(current);
  if (i < 0) return step > 0 ? list[0] : list[list.length - 1];
  return list[(((i + step) % list.length) + list.length) % list.length];
}
