// 小柚摇杆遥控器（M5StickC Plus2 + Hat Joystick）
//
// 两个模式，侧面 B 键切换（记住上次的模式）：
//   「控 Mac」：当蓝牙键盘连 Mac，发 ⌃⌥⇧⌘+数字，Mac 小柚 App 收到后换衣服 / 换场景 / 做动作。
//   「控二号」：用 ESP-NOW 无线广播给小柚二号（StackChan），转头、开始说话。不用路由器。
//
// 按键对照（摇杆以"屏幕朝自己、摇杆在上"拿着为准）：
//              控 Mac                    控二号
//   摇杆 上    下一套衣服                抬头
//   摇杆 下    上一套衣服                低头
//   摇杆 左    上一个场景                向左转头
//   摇杆 右    下一个场景                向右转头
//   摇杆 按下  做个动作（轮流）          头回正
//   长按摇杆   显示 / 隐藏面板           —
//   正面 M5 键 自动搭配并说出今天穿什么  开始 / 结束说话
//   长按 M5 键 换发型（轮流）            打招呼
//
// Mac 那边的快捷键在 electron/remote.mjs，二号收的包格式在 remote/README.md。
#include <M5Unified.h>
#include <Wire.h>
#include <utility>
#include <WiFi.h>
#include <esp_now.h>
#include <esp_wifi.h>
#include <Preferences.h>
#include <BleKeyboard.h>

// ---------- 摇杆帽（STM32，I2C 0x38，SDA=G0 SCL=G26） ----------
static constexpr uint8_t JOY_ADDR = 0x38;
// 方向不对时改这三个（屏幕上会实时显示识别到的方向，方便对）
static constexpr bool SWAP_XY = false;
static constexpr bool FLIP_X = true;   // 官方例程：往左推 x≈+100，往右 x≈-100
static constexpr bool FLIP_Y = false;
static constexpr int TILT_ON = 60;     // 推过这个算一次
static constexpr int TILT_OFF = 30;    // 回到这个以内才算松开

enum Dir : uint8_t { DIR_NONE, DIR_UP, DIR_DOWN, DIR_LEFT, DIR_RIGHT };
static const char *DIR_NAME[] = {"·", "上", "下", "左", "右"};

struct Joy { int x = 0, y = 0; bool pressed = false; bool ok = false; };

Joy readJoy() {
  Joy j;
  Wire.beginTransmission(JOY_ADDR);
  Wire.write(0x02);
  if (Wire.endTransmission() != 0) return j;
  if (Wire.requestFrom(JOY_ADDR, (uint8_t)3) != 3) return j;
  int x = (int8_t)Wire.read();
  int y = (int8_t)Wire.read();
  j.pressed = Wire.read() == 0;  // 0 = 按下
  if (SWAP_XY) std::swap(x, y);
  j.x = FLIP_X ? -x : x;
  j.y = FLIP_Y ? -y : y;
  j.ok = true;
  return j;
}

// ---------- 模式 ----------
enum Mode : uint8_t { MODE_MAC = 0, MODE_BODY = 1 };
Mode mode = MODE_MAC;
Preferences prefs;

// ---------- 控 Mac：蓝牙键盘 ----------
BleKeyboard keyboard("XiaoYou Remote", "XiaoYou", 100);

// 和 electron/remote.mjs 一一对应：⌃⌥⇧⌘ + 数字
enum MacKey : char {
  MAC_NEXT_LOOK = '1', MAC_PREV_LOOK = '2', MAC_PREV_SCENE = '3', MAC_NEXT_SCENE = '4',
  MAC_GESTURE = '5', MAC_OUTFIT = '6', MAC_HAIR = '7', MAC_PANEL = '8',
};

bool sendMac(char key) {
  if (!keyboard.isConnected()) return false;
  keyboard.press(KEY_LEFT_CTRL);
  keyboard.press(KEY_LEFT_ALT);
  keyboard.press(KEY_LEFT_SHIFT);
  keyboard.press(KEY_LEFT_GUI);
  keyboard.press(key);
  delay(30);
  keyboard.releaseAll();
  return true;
}

// ---------- 控二号：ESP-NOW 广播 ----------
// 包格式见 remote/README.md。二号连着家里 Wi-Fi，信道不固定，所以 1~13 信道各发一遍，
// 二号按 seq 去重。
enum BodyAction : uint8_t {
  BODY_HEAD_LEFT = 0x01, BODY_HEAD_RIGHT = 0x02, BODY_HEAD_UP = 0x03, BODY_HEAD_DOWN = 0x04,
  BODY_HEAD_CENTER = 0x05, BODY_TALK = 0x10, BODY_GREET = 0x11,
};
struct __attribute__((packed)) XyrcPacket {
  char magic[4];   // "XYRC"
  uint8_t ver;     // 1
  uint8_t seq;     // 每按一次 +1
  uint8_t action;  // BodyAction
  int8_t arg;      // 转头：每步角度（度）
};
static const uint8_t BROADCAST[6] = {0xff, 0xff, 0xff, 0xff, 0xff, 0xff};
uint8_t seq = 0;
bool espnowOk = false;

void initEspNow() {
  WiFi.mode(WIFI_STA);
  WiFi.disconnect();
  espnowOk = esp_now_init() == ESP_OK;
  if (!espnowOk) return;
  esp_now_peer_info_t peer = {};
  memcpy(peer.peer_addr, BROADCAST, 6);
  peer.channel = 0;  // 跟随当前信道
  peer.encrypt = false;
  esp_now_add_peer(&peer);
}

bool sendBody(BodyAction action, int8_t arg = 0) {
  if (!espnowOk) return false;
  XyrcPacket p = {{'X', 'Y', 'R', 'C'}, 1, ++seq, action, arg};
  bool any = false;
  for (uint8_t ch = 1; ch <= 13; ch++) {
    esp_wifi_set_channel(ch, WIFI_SECOND_CHAN_NONE);
    any |= esp_now_send(BROADCAST, (const uint8_t *)&p, sizeof(p)) == ESP_OK;
    delay(4);
  }
  return any;
}

// ---------- 屏幕 ----------
String lastAction = "";
uint32_t lastInputMs = 0;
bool dimmed = false;

void draw(Dir live) {
  auto &d = M5.Display;
  d.startWrite();
  d.fillScreen(TFT_BLACK);
  d.setFont(&fonts::efontCN_16);
  d.setTextDatum(top_center);
  int cx = d.width() / 2;

  d.fillRoundRect(6, 6, d.width() - 12, 34, 8, mode == MODE_MAC ? 0xFC60 : 0x05BF);
  d.setTextColor(TFT_BLACK);
  d.drawString(mode == MODE_MAC ? "控 Mac" : "控二号", cx, 15);

  d.setTextColor(TFT_LIGHTGREY);
  if (mode == MODE_MAC) {
    bool c = keyboard.isConnected();
    d.setTextColor(c ? TFT_GREEN : TFT_ORANGE);
    d.drawString(c ? "蓝牙已连" : "等 Mac 配对", cx, 52);
  } else {
    d.setTextColor(espnowOk ? TFT_GREEN : TFT_RED);
    d.drawString(espnowOk ? "无线就绪" : "无线出错", cx, 52);
  }

  d.setTextColor(TFT_WHITE);
  d.setTextSize(2);
  d.drawString(DIR_NAME[live], cx, 86);
  d.setTextSize(1);

  d.setTextColor(TFT_YELLOW);
  d.drawString(lastAction, cx, 136);

  d.setTextColor(TFT_DARKGREY);
  d.drawString("B 键换模式", cx, 190);
  char bat[16];
  snprintf(bat, sizeof(bat), "电量 %d%%", (int)M5.Power.getBatteryLevel());
  d.drawString(bat, cx, 212);
  d.endWrite();
}

void wake() {
  lastInputMs = millis();
  if (dimmed) { M5.Display.setBrightness(160); dimmed = false; }
}

void act(const char *label, bool ok) {
  lastAction = ok ? String(label) : String(label) + "（没发出）";
  if (ok) M5.Speaker.tone(4000, 20);
}

// ---------- 动作分发 ----------
void onDir(Dir d, bool repeat) {
  if (mode == MODE_MAC) {
    if (repeat) return;  // Mac 模式推一下算一次
    switch (d) {
      case DIR_UP: act("下一套衣服", sendMac(MAC_NEXT_LOOK)); break;
      case DIR_DOWN: act("上一套衣服", sendMac(MAC_PREV_LOOK)); break;
      case DIR_LEFT: act("上一个场景", sendMac(MAC_PREV_SCENE)); break;
      case DIR_RIGHT: act("下一个场景", sendMac(MAC_NEXT_SCENE)); break;
      default: break;
    }
  } else {
    const int8_t step = 10;  // 每步 10 度，按住连续转
    switch (d) {
      case DIR_UP: act("抬头", sendBody(BODY_HEAD_UP, step)); break;
      case DIR_DOWN: act("低头", sendBody(BODY_HEAD_DOWN, step)); break;
      case DIR_LEFT: act("向左转", sendBody(BODY_HEAD_LEFT, step)); break;
      case DIR_RIGHT: act("向右转", sendBody(BODY_HEAD_RIGHT, step)); break;
      default: break;
    }
  }
}

void onStickClick() {
  if (mode == MODE_MAC) act("做个动作", sendMac(MAC_GESTURE));
  else act("头回正", sendBody(BODY_HEAD_CENTER));
}
void onStickHold() {
  if (mode == MODE_MAC) act("面板开/关", sendMac(MAC_PANEL));
}
void onAClick() {
  if (mode == MODE_MAC) act("自动搭配", sendMac(MAC_OUTFIT));
  else act("说话", sendBody(BODY_TALK));
}
void onAHold() {
  if (mode == MODE_MAC) act("换发型", sendMac(MAC_HAIR));
  else act("打招呼", sendBody(BODY_GREET));
}

// ---------- 主流程 ----------
void setup() {
  auto cfg = M5.config();
  M5.begin(cfg);
  M5.Display.setRotation(0);  // 竖着拿，摇杆在上
  M5.Display.setBrightness(160);
  M5.Speaker.setVolume(80);
  Wire.begin(0, 26, 100000UL);

  prefs.begin("xyrc", false);
  mode = (Mode)prefs.getUChar("mode", MODE_MAC);

  keyboard.begin();  // 蓝牙一直开着，两个模式之间切换不用重新配对
  initEspNow();
  lastAction = "准备好了";
  lastInputMs = millis();
}

void loop() {
  M5.update();
  static Dir held = DIR_NONE;
  static uint32_t heldSince = 0, lastRepeat = 0;
  static bool stickDown = false, stickHoldFired = false;
  static uint32_t stickDownMs = 0;
  static uint32_t lastDraw = 0;
  static Dir lastDrawn = DIR_NONE;
  static String lastDrawnAction;
  static bool lastConn = false;
  bool dirty = false;

  Joy j = readJoy();
  Dir live = DIR_NONE;
  if (j.ok) {
    int ax = abs(j.x), ay = abs(j.y);
    int th = held == DIR_NONE ? TILT_ON : TILT_OFF;
    if (max(ax, ay) >= th) live = ay >= ax ? (j.y > 0 ? DIR_UP : DIR_DOWN) : (j.x > 0 ? DIR_RIGHT : DIR_LEFT);
    if (live != held) {
      held = live;
      heldSince = lastRepeat = millis();
      if (live != DIR_NONE) { wake(); onDir(live, false); }
    } else if (held != DIR_NONE && millis() - heldSince > 400 && millis() - lastRepeat > 150) {
      lastRepeat = millis();
      onDir(held, true);
    }

    // 摇杆按下：短按 / 长按（>0.8 秒）
    if (j.pressed && !stickDown) { stickDown = true; stickHoldFired = false; stickDownMs = millis(); wake(); }
    if (j.pressed && stickDown && !stickHoldFired && millis() - stickDownMs > 800) { stickHoldFired = true; onStickHold(); }
    if (!j.pressed && stickDown) { stickDown = false; if (!stickHoldFired) onStickClick(); }
  } else if (lastAction != "没检测到摇杆帽") {
    lastAction = "没检测到摇杆帽";
  }

  if (M5.BtnA.wasHold()) { wake(); onAHold(); }
  else if (M5.BtnA.wasClicked()) { wake(); onAClick(); }
  if (M5.BtnB.wasClicked()) {
    wake();
    mode = mode == MODE_MAC ? MODE_BODY : MODE_MAC;
    prefs.putUChar("mode", mode);
    lastAction = "";
    dirty = true;
  }

  bool conn = keyboard.isConnected();
  if (conn != lastConn) { lastConn = conn; dirty = true; }
  if (live != lastDrawn || lastAction != lastDrawnAction) dirty = true;
  if (dirty || millis() - lastDraw > 30000) {  // 电量每 30 秒刷一次
    draw(live);
    lastDrawn = live;
    lastDrawnAction = lastAction;
    lastDraw = millis();
  }

  // 20 秒没动就调暗屏幕省电
  if (!dimmed && millis() - lastInputMs > 20000) { M5.Display.setBrightness(16); dimmed = true; }
  delay(15);
}
