# 2D 小柚分层立绘格式

把这些文件放进资产盘的 `小柚资产/character/`（网页版放 `site/character/`），App 启动时发现 `points.json` 就会用 2D 小柚，否则退回 3D 模型。
这个 `character-demo/` 是几何占位，测试用：`?character=./character-demo`。

所有 PNG：同一画布尺寸、透明背景、部件画在原来的位置（叠起来就是完整立绘）。

| 文件 | 内容 | 必需 |
|---|---|---|
| hair_back.png | 后面的头发（被挡住的部分要补全） | 建议 |
| body.png | 脖子以下身体、腿、鞋，不含手臂 | 是 |
| arm_l.png / arm_r.png | 画面左 / 右边的手臂（含手） | 建议 |
| arm_r_wave.png | 右手举起挥手 | 可选 |
| head.png | 脸、耳朵、脖子上半；眼睛和嘴的位置补成皮肤 | 是 |
| eyes_open / eyes_closed / eyes_smile .png | 睁眼 / 闭眼 / 眯眼笑 | 是 |
| brows.png | 眉毛 | 可选 |
| mouth_closed / mouth_half / mouth_open / mouth_smile .png | 嘴型 | 是 |
| hair_front.png | 刘海和前侧发 | 建议 |

`points.json`（像素坐标，左上为原点，y 向下）：

```json
{"canvas":[宽,高],"headTop":y,"neck":[x,y],"shoulderL":[x,y],"shoulderR":[x,y],
 "waist":[x,y],"hem":y,"feet":[x,y],"eyes":[x,y],"mouth":[x,y],"hairTipY":y}
```

`hem`（衣服下摆底边）没有可以省略；`heightMeters` 可选，默认 1.6。
动起来的方式（src/puppet2d.js）：呼吸、全身轻摆、头歪/点/假转头（分层视差）、头发和衣摆飘动带惯性、眨眼、按音量换嘴型、手臂绕肩转动做手势。
