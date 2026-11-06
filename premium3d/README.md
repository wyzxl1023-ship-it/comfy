# 小柚 3D（高端版原型）

一个跑在浏览器里的 3D 小柚：会跟着说的话做动作、换场景、按天气换装，并保存主人送的衣服。
技术栈全部开源：[three.js](https://threejs.org)（MIT）+ [@pixiv/three-vrm](https://github.com/pixiv/three-vrm)（MIT）+ Vite。
Mac（Apple Silicon）上用 Safari / Chrome 直接跑，画面自适应任何尺寸的屏幕（竖屏看全身，横屏看大半身）。

## 跑起来

```bash
cd premium3d
npm install
npm run dev          # 打开终端里显示的地址，例如 http://localhost:5173
npm run bridge       # 另开一个终端：ESP32 状态接口桥接服务（可选）
npm test             # 规则 / 衣橱 / 协议的单元测试
```

全屏展示：地址后面加 `?kiosk`（隐藏面板，按 `H` 显示/隐藏），浏览器全屏即可。
其它调试参数：`?scene=office&weather=rain&temp=12&night&mute&model=xxx.vrm&say=你好`。

## Mac 应用

```bash
npm run app          # 开发时直接以应用方式运行
npm run app:build    # 打包 release/mac-arm64/小柚.app（在 Mac 上打包会自动本机签名）
```

- 打开就全屏铺在竖屏显示器上（有竖屏优先用竖屏），菜单「小柚」里可切换全屏展示、开机自动启动、换屏幕、选资产文件夹。
- 内置 ESP32 桥接（8765 端口），不用另开终端。
- 资产文件夹默认 `/Volumes/固态t800/小柚资产/`：`backgrounds/` 放背景图（丢进去就生效，不用写清单），`character/`、`wardrobe/` 留给 2D 人物部件和衣服。
- 在 Linux 上打包可得到未签名的 .app，拷到 Mac 后要执行 `xattr -cr 小柚.app && codesign --force --deep -s - 小柚.app`。
- 以后换成能渲染的板子（Linux + GPU），可以直接打 Linux arm64 版或用 Chromium 全屏打开同一个页面。

## 现在能做什么

| 能力 | 做法 | 位置 |
| --- | --- | --- |
| 话语 → 动作 | 按句切分，每句按关键词选动作：挥手、点头、摇头、托腮思考、指向、摊手、鞠躬、欢呼、捂心、低落、说话手势 | `src/intent.js`、`src/gestures.js` |
| 话语 → 表情 | 开心 / 难过 / 生气 / 惊讶 / 放松（VRM 表情） | `src/intent.js` |
| 话语 → 场景 | 提到"回家/沙发"→ 在家，"公交/等车"→ 公交车站，"公司/开会"→ 公司，白色淡入淡出切换 | `src/intent.js`、`src/scenes.js` |
| 天气 → 背景 | 晴 / 多云 / 下雨 / 下雪 / 夜晚：天空颜色、光照、雨丝和雪花（室内在窗外） | `src/scenes.js` |
| 天气 + 场景 → 穿搭 | 按温度选保暖档位，按场景选正式程度，下雨带伞穿防水外套，冷天围巾毛线帽，热天草帽墨镜，避免和最近两天重复，主人送的衣服优先 | `src/wardrobe.js` |
| 衣橱 | 上传衣服照片 → 自动取主色、压缩后存进浏览器 IndexedDB；照片当作面料贴到对应部位；可手动穿/脱/删除 | `src/store.js`、`src/dress.js` |
| 口型 | 真实音频的音量包络（首选）；或 ESP32 推送的实时音量；没有音频时按文字节奏 | `src/lipsync.js` |
| 实时天气 | Open-Meteo（免 key），或由 ESP32 推送 | `src/weather.js` |
| 换角色 | 面板里上传任意 `.vrm`，动作/衣橱/场景全部通用 | `src/avatar.js` |

## 状态接口（对接 ESP32 小柚）

ESP32 那边的业务和人格不变，只需要把事件发给 Mac 上的桥接服务：

```bash
curl -X POST http://<mac-ip>:8765/event -H 'content-type: application/json' -d '{"type":"say","text":"你好呀，今天在公司加班吗？","audioUrl":"http://.../tts.mp3"}'
```

| type | 字段 | 说明 |
| --- | --- | --- |
| `say` | `text`，可选 `audioUrl` `scene` `emotion` | 说一句话；有 `audioUrl` 就用真实 TTS 音频驱动口型和动作时间 |
| `state` | `state`: `idle` / `listening` / `thinking` / `speaking` | 对话状态（在听会点头，在想会托腮） |
| `level` | `v`: 0..1 | 实时音量（ESP32 自己播音频时用它驱动口型，建议 20~30 次/秒） |
| `scene` | `scene`: `home` / `busStop` / `office` | 直接切场景 |
| `weather` | `temp`，`condition`: `sunny` / `cloudy` / `rain` / `snow`，可选 `night` | 推送天气，背景和穿搭随之变化 |
| `gesture` / `emotion` | `name` / `emotion` | 直接指定动作 / 表情 |
| `outfit` | 可选 `announce` | 重新搭配；`announce: true` 时小柚会说出今天穿了什么 |
| `hair` | `name`：straight / ponytail / bun / halfUp / messyBun | 换发型（2D 小柚读 character/hair/名字/ 下的两层头发；平时换衣服会按场合自动搭配） |
| `look` | `name`：outfits.json 里的 id，`default` = 默认衣服 | 2D 小柚换整套穿搭（读 character/outfits/id/ 下的 body、arm 图层；平时按天气和场合自动挑） |
| `heard` | `text` | 用户对小柚说的话。页面不处理，只和 `say` 一起按天记进聊天记录（Mac 应用：文稿/AI语音伴侣项目/小柚聊天记录/YYYY-MM-DD.jsonl；命令行：设 `LOG_DIR`） |

也可以用 WebSocket 直接连 `ws://<mac-ip>:8765` 发同样的 JSON。

## 素材与许可

- 示例角色 `public/models/sample.vrm`：pixiv 官方 three-vrm 示例模型 `VRM1_Constraint_Twist_Sample`。模型自带的 VRM 许可：允许企业商用、允许再分发、允许修改，无需署名（©2022 pixiv Inc.，https://vrm.dev/licenses/1.0/ ）。它只是占位，正式形象要换成小柚自己的模型。
- 场景、动作、配饰全部是代码生成的，没有使用外部素材。
- Open-Meteo 免费接口仅限非商用；商用请换付费订阅/和风天气，或用 ESP32 端已有的天气数据。

## 已知限制 / 下一步

1. **形象**：现在是通用示例角色。动漫版下一步用 VRoid Studio 按参考形象捏一个小柚（发型、五官、气质），导出 VRM 后直接替换；写实版另做样片对比。
2. **衣服版型**：上传照片目前只是"换面料"，衣服形状还是模型自带的 T 恤和短裤。要真正换版型（连衣裙、大衣），需要做成 3D 服装资产（VRoid 服装或 Blender 建模，按部位做成可替换网格），衣橱逻辑不用改。
3. **动作**：目前是代码写的关键帧，够表达但偏简单。可接入 `.vrma` 动作文件或动捕数据，换成更自然的动作；话语 → 动作也可以换成大模型打标签（输出同样的 Plan 结构即可）。
4. **场景**：程序化场景用于验证切换逻辑，正式版可换成 Blender 制作的 glTF 场景或全景图。
