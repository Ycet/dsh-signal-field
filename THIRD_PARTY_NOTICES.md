# 第三方来源与许可

本文件列出 `dsh-signal-field` 中**非原创**的部分、它们的上游来源、许可与改编范围。
本插件自身以 MIT 许可发布（见 `LICENSE`），**但不重新许可**下列上游源码。

---

## 1. ASCII 鲸鱼动画引擎 — `stackedlol/ascii-sharks`

- 上游仓库：<https://github.com/stackedlol/ascii-sharks>
- 固定快照：[`c521e24a787e6d4cc460d4cf2b9815f25e4fe453`](https://github.com/stackedlol/ascii-sharks/tree/c521e24a787e6d4cc460d4cf2b9815f25e4fe453)
- 许可：**MIT**，Copyright (c) 2026 drewdi
- 本插件中的落点：`src/whale-engine.js` 里标注为「上游移植段」的区块
  （对应上游 `cells` / `math` / `species` / `world` / `whales` / `renderer` / `engine`）

保留的部分：固定步长引擎、鱼群集群与追逐、柔性脊柱、单元格栅格化、光照、字形浓淡与尾迹扩散。

本插件的改编（共 5 处，源码内以「`[适配 N]`」标注）：

1. 整块包进 IIFE 以隔离顶层标识符（避免与插件自身的 `clamp` 等同名声明互相覆盖）；
2. 移除 Kanji 渲染器与汉字字形表（本插件的字符风格固定 ASCII）；
3. 移除 `prefers-reduced-motion` 判定与 `drawStill()`（鲸鱼按配置帧率运行）；
4. 新增帧率上限门控；
5. 新增指针监听的运行期拆装。

> 说明：上游仓库**当前**带有 MIT 许可文件，但本插件移植所依据的那个快照
> （`c521e24`，经 `dsh-ascii-whales` 转述）当时尚未包含独立的许可文件。
> 此处按上游现行 MIT 授权标注并保留作者署名；如上游后续调整许可，应以最新声明为准。

### MIT 许可全文（上游 `LICENSE`）

```text
MIT License

Copyright (c) 2026 drewdi

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## 2. 鲸鱼几何与 DSH 集成参照 — `dsh-ascii-whales`

- 上游包：`dsh-ascii-whales@0.1.5`（作者 Chael-Chael）
- 许可：**MIT**，Copyright (c) 2026 Chael-Chael
- 本插件迁移自它的部分：
  - 鲸鱼几何（圆头、长胸鳍、宽尾鳍，无鳃裂与腹鳍）——这一层是它对 `ascii-sharks` 鲨鱼几何的改编；
  - 透明画布 + 浅色/深色双主题取色、固定主色的处理方式；
  - 「只在 `contentPhase === "hero"` 渲染」「进入内容面内部作为 `z-index:-1` 图层」的接入结构；
  - 等宽字体子集的选取与打包方式。

本插件**没有**迁移它的设置项全集：海洋颜色、眼睛底色、彩色闪烁、玻璃开关、字体来源与本地字体扫描、
字符风格切换（ASCII / 汉字 / Kanji）都不是本插件的能力。

### MIT 许可全文（上游 `LICENSE`）

```text
MIT License

Copyright (c) 2026 Chael-Chael

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## 3. 内嵌等宽字体 — Geist Mono

- 字体：**Geist Mono**（The Geist Project Authors）
- 许可：**SIL Open Font License 1.1**（<https://openfontlicense.org>）
- 本插件中的落点：`src/whale-fonts.js` 的 `WHALE_MONO_URI`（weight 600 的 WOFF 子集，
  以 `data:` URI 形式内嵌，构建后进入 `client.js`）
- 子集只包含绘制 ASCII 鲸鱼所需的字符，不含完整字库。

字体以 OFL 1.1 授权，允许随软件分发与再分发；本插件未对字体本身做改名或售卖。

---

## 4. 未使用的上游代码

`dsh-ascii-whales` 还包含 `michikusa404/ascii-kanji-sharks`（MIT，Copyright (c) 2026 michikusa404）
的汉字/假名字形绘制代码与第二套字库。本插件的字符风格固定为 ASCII，
因此**这部分代码与字库均未进入本仓库，也未进入构建产物**。
