// 摇杆遥控器（M5StickC Plus2 + 摇杆帽，固件在 remote/stick/）：
// 它配对成 Mac 的蓝牙键盘，按 ⌃⌥⇧⌘ + 数字。这里注册成全局快捷键，小柚窗口不在前台也能收到，
// 再转成 {type:'remote', action} 发给页面。数字和动作的对应要和固件里的 MacKey 一致。
import { globalShortcut } from 'electron';
import { REMOTE_ACTIONS } from '../bridge/protocol.mjs';

export const REMOTE_KEYS = Object.fromEntries(REMOTE_ACTIONS.map((a, i) => [`Control+Alt+Shift+Command+${i + 1}`, a]));

export function registerRemote(send, log = console.log) {
  for (const [accel, action] of Object.entries(REMOTE_KEYS)) {
    if (!globalShortcut.register(accel, () => send({ type: 'remote', action }))) log(`遥控快捷键被占用：${accel}`);
  }
}
