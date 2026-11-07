# 小柚摇杆遥控器

硬件：**M5StickC Plus2**（橙色）+ 顶上的 **Hat Joystick 摇杆帽**（STM32，I2C 0x38，SDA=G0 / SCL=G26）。
固件在 `stick/`（PlatformIO 工程）。

## 两个模式（侧面 B 键切换，记住上次的）

| 操作 | 控 Mac（蓝牙键盘） | 控二号（ESP-NOW 无线） |
| --- | --- | --- |
| 摇杆 上 / 下 | 下一套 / 上一套衣服 | 抬头 / 低头（按住连续转） |
| 摇杆 左 / 右 | 上一个 / 下一个场景 | 向左 / 向右转头（按住连续转） |
| 摇杆按下 | 做个动作（挥手、点头、欢呼……轮流） | 头回正 |
| 长按摇杆 | 显示 / 隐藏面板 | — |
| 正面 M5 键 | 自动搭配，并说出今天穿什么 | 开始 / 结束说话 |
| 长按 M5 键 | 换发型（轮流） | 打招呼 |

屏幕上显示当前模式、连接状态、摇杆方向和刚发出的动作；20 秒不动自动调暗。

## 刷机（在 Mac 上）

```bash
cd premium3d/remote/stick
pio run -t upload        # USB-C 插 Mac；没装 PlatformIO：pip3 install platformio
```

插上后看不到串口（`ls /dev/cu.*` 里没有 `usbserial` / `wchusbserial`），就装 WCH 的 CH9102 驱动。
开机：按左侧小键约 2 秒；关机：长按约 6 秒。

推摇杆时屏幕显示的方向和实际不一致，改 `src/main.cpp` 顶上的 `SWAP_XY` / `FLIP_X` / `FLIP_Y` 再刷。

## 控 Mac

1. Mac「系统设置 → 蓝牙」里连 **XiaoYou Remote**（弹出"键盘设置助理"直接关掉）。
2. 遥控器发 `⌃⌥⇧⌘ + 1~8`，小柚 App（`electron/remote.mjs`）注册成全局快捷键，小柚窗口不在前台也能用。
3. App 把按键转成桥接消息 `{"type":"remote","action":"nextLook"}` 发给页面。不用遥控器也能测：

```bash
curl -X POST http://127.0.0.1:8765/event -H 'content-type: application/json' -d '{"type":"remote","action":"nextScene"}'
```

| 数字 | action | 作用 |
| --- | --- | --- |
| 1 | `nextLook` | 下一套衣服 |
| 2 | `prevLook` | 上一套衣服 |
| 3 | `prevScene` | 上一个场景 |
| 4 | `nextScene` | 下一个场景 |
| 5 | `gesture` | 做个动作（轮流） |
| 6 | `outfit` | 自动搭配并播报 |
| 7 | `hair` | 换发型（轮流） |
| 8 | `panel` | 显示 / 隐藏面板 |

固件里的 `MacKey` 和 `bridge/protocol.mjs` 的 `REMOTE_ACTIONS` 顺序必须一致，`test/remote.test.js` 会检查。

## 控二号：ESP-NOW 包格式（二号固件要加接收）

遥控器把下面 8 个字节广播（目标 `FF:FF:FF:FF:FF:FF`）。二号连着家里 Wi-Fi，信道不固定，
所以遥控器在 1~13 信道各发一遍，**二号要按 `seq` 去重**（同一个 seq 只处理一次）。

```c
struct __attribute__((packed)) XyrcPacket {
  char    magic[4];  // "XYRC"
  uint8_t ver;       // 1
  uint8_t seq;       // 每按一次 +1（会回绕）
  uint8_t action;    // 见下表
  int8_t  arg;       // 转头：每步角度（度），现在固定 10
};
```

| action | 名字 | 二号该做什么 |
| --- | --- | --- |
| `0x01` | HEAD_LEFT | 头向左转 `arg` 度（到限位就停） |
| `0x02` | HEAD_RIGHT | 头向右转 `arg` 度 |
| `0x03` | HEAD_UP | 抬头 `arg` 度 |
| `0x04` | HEAD_DOWN | 低头 `arg` 度 |
| `0x05` | HEAD_CENTER | 头回正 |
| `0x10` | TALK | 等同按一下 / 喊唤醒词：空闲时开始听，说话时打断 |
| `0x11` | GREET | 打个招呼（点头 + 开心表情，或者让小柚主动说一句） |

接收端建议：

- 二号是 Wi-Fi STA，`esp_now_init()` 后注册接收回调即可，在当前信道收，不影响联网。
- 只认 `magic == "XYRC" && ver == 1`；最好再把遥控器的 MAC 记成白名单（第一次收到时在屏幕上让主人确认），防止邻居的设备乱发。
- 回调在 Wi-Fi 任务里跑，里面只把动作丢进队列，转舵机 / 开始对话放到主循环做。
