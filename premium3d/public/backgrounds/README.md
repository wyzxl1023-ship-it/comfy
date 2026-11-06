# 背景图

把画好的背景图放在这里，并把文件名写进 `manifest.json`（JSON 数组），例如：

```json
["home.jpg", "busStop-sunny.jpg", "busStop-rain.jpg", "office.jpg", "home-sunny-night.jpg"]
```

命名：`{场景}-{天气}[-night].{jpg|png|webp}`，场景 = home / busStop / office，天气 = sunny / cloudy / rain / snow。
只放 `{场景}.jpg` 就是所有天气共用。找图顺序：面板里上传的 > 这里的文件 > 程序化 3D 场景。

构图建议：竖图（9:16 或更高），画面下方 1/5 左右是地面，人物站在画面中间偏下；不要在中间画人。
注意版权：AI 出图或网上找图只适合自己测试，商用前换成自己有授权的画。
