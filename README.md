# dsh-signal-field v0.2.8

[![中文](https://img.shields.io/badge/简体中文-red?style=for-the-badge)](README.md)
[![EN](https://img.shields.io/badge/English-blue?style=for-the-badge)](README_en.md)

![version](https://img.shields.io/badge/version-v0.2.8-blue?style=for-the-badge)
![license](https://img.shields.io/badge/license-MIT-green?style=for-the-badge)
![platform](https://img.shields.io/badge/platform-DSH%20Web%20%2F%20Desktop-informational?style=for-the-badge)

DSH（DeepSeek Harness）Web / 桌面端动效界面插件：把「抖动信号场」背景、「蓝图标题」文字动效与「毛玻璃输入框」接进新增会话页与聊天会话页，并把同一套背景与玻璃延伸到 HUD 面板与右侧边栏；全部效果都能在「设置 → UI 动画」逐项开关。

> 视觉语言来自参考文档 `AI相关每周资讯_2026-H2.html` 的 FX 引擎（Dither 信号场 + TechText 蓝图标题）。本插件是它在 DSH 内的移植与工程化版本，只保留了与该需求相关的两个引擎。

> [!NOTE]
> 作用范围只有**新增会话页**与**聊天会话页**两类页面。插件管理页、自动化任务页以及其它面板页保持 DSH 原生外观：v0.1.1 起本插件在这两页上不创建图层、不写作用域属性、不注入样式，切走时会把已经存在的图层与画布一并销毁。
>
> v0.2.0 起再覆盖三块区域：聊天页的**输入框条带**、`dsh-awesome-hud` 的**HUD 面板毛玻璃**、DSH **右侧边栏背景**。

---

## 效果一览

| 区域 | 背景信号场 | 蓝图标题 | 毛玻璃 |
| --- | --- | --- | --- |
| 新增会话页（`data-content-phase="hero"`） | ✓ | ✓「DEEPSEEK HARNESS」 | ✓ 输入框 |
| 聊天会话页 | ✓（含输入框条带） | — | ✓ 输入框 |
| HUD 面板（`dsh-awesome-hud`，两页通用） | ✓ 透出并模糊 | — | ✓ 面板 |
| 右侧边栏（两页通用，展开时） | ✓ 独立一层 | — | — |

- 信号场铺满内容区，但**不覆盖**左侧导航栏（保留 DSH 原生填充），避免与 `dsh-better-sidebar` 等插件的配色叠加冲突；右侧边栏按 v0.2.0 需求改为与内容区同一套背景。
- 亮/暗两套配色自动跟随 DSH 主题：亮色 `#e7e9f0 / #b6bfd8 / 光标擦除`，暗色 `#070a12 / #3a4a7a / 光标点亮`。
- 背景交互：噪声波自走 + 指针拖尾擦除/点亮 + 点击涟漪。
- 标题交互：入场揭示、指针靠近时字形转虚线矢量轮廓（可选选框、拖动字块、飞白微粒）。
- 标题与「鲸鱼图标 + 探索未至之境 + 预览版」同处 hero 行并整体居中；字形可拖到页面任意位置而不会被画布裁切，松手回弹。
- 右侧边栏与内容区各用一层画布，因此交界处的噪声图案不连续（同一配色、同一开关、同一交互）。
- 输入框与 HUD 面板的模糊层都挂在宿主的 `::before` 上，而不是宿主元素本身：`backdrop-filter` 会为该元素建立 `position:fixed` 后代的包含块，写在宿主上会让它子树里的弹层以宿主为视口并被 `overflow:hidden` 裁掉。v0.2.0 的 HUD 面板曾因此把 `dsh-awesome-hud` 自己的 git graph 等弹窗关进了 300px 面板，v0.2.1 修正并加了自动化断言。
- 右栏的信号场图层自带一层「与内容区同源」的底色（`--mui-surface-base`，取自 `body` 上的 `--dsw-alias-bg-base` 快照，v0.2.2 起）。此前右栏把该 token 下推成透明后，场是直接压在外壳底色上的，同一个场在内容区偏冷白、在右栏偏暖发暗。
- 滚动到输入框下方的消息不再压到状态栏上：v0.2.5 起由**输入框座位自己的 `::before` 背衬**承担遮挡——`backdrop-filter` 模糊 + 底边压色，`z-index:-1` 永远位于卡片与状态栏文字之下，因此不可能糊到任何 UI。v0.2.2 的纯色带、v0.2.3 的 `::after` 模糊层都叠在子元素之上；v0.2.4 改用 `mask` 但挂在了滚动容器上，而座位正是它的子节点——整条座位被一起渐隐（状态栏文字消失），`mask` 建立的 backdrop root 还让输入框卡片采样不到背后的场，毛玻璃退化成能看见噪点的透明卡。v0.2.5 一并修正。
v0.2.7 再把背衬缩小到**只盖「输入框下方那一行信息文字」**那一条（高度由 JS 实测「卡片底边 → 座位底边」得到，写成 `--mui-seat-band-h`）：v0.2.5 铺满整条座位时，`backdrop-filter` 会把抖动的细颗粒平均成一片平滑浅灰，整条输入框区域看起来都像「没有动效背景」，卡片采到的也是糊过的场；现在座位其余部分保持透明，动效背景一直透到输入框区域。
- HUD 面板是浮在内容区右侧的悬浮层，那一带原本没有信号场，玻璃只能模糊到白、看起来像不透明；v0.2.3 起在它背后补一层同样的场，玻璃才有东西可透。v0.2.5 修正两层问题：补场改为插进面板所在的同一层（DSH 的 `shell.overlay`）并排在面板之前（原来挂在 `body` 上用 `z-index:-1`，被外壳底色整块盖住，等于不存在），且尺寸从「面板矩形 + 24px」改为一路铺到视口右下角——面板高度由内容撑出，内容短时它下方原本会露出一块纯白。
v0.2.6 再修两处观感问题：补场原来按「面板外扩 24px」铺，顶上比会话内容区高出一截，右栏于是浮出一块**带硬边的补丁**；左侧那圈外扩又落在内容区之上，两层场叠成一条**发脏的竖带**（亮格 233 → 243、暗格 233 → 218）。现在补场的盒子直接对齐「内容区那条带子」（左缘 = 内容区右缘、上缘 = 内容区上沿、右/下到视口边），并自带一层同源不透明底色（`--mui-surface-base`），重叠处只会被它盖掉，不再叠两层场。
- v0.2.4 起**作用范围不再包含右侧边栏**：右栏的动效背景整块移除（图层、观察器、CSS 与设置项一并删除），右栏回到 DSH 原生外观；设置页总开关数由 11 降为 10。HUD 面板自己那一条竖带仍由补场覆盖（否则面板玻璃无场可模糊、面板下方也露白），面板关闭时补场随之移除。

---

## 设置页

「设置 → UI 动画」（`settings.section` 的 `signal-field`，位置 58，紧跟 `dsh-ascii-whales`）：

| 分组 | 条目 |
| --- | --- |
| 总开关 | 启用全部动效 |
| 新增会话页 | 标题文字 / 背景 / 输入框毛玻璃 |
| 聊天会话页 | 背景 / 输入框毛玻璃 |
| 其它区域 | HUD 面板毛玻璃 / 右侧边栏背景 |
| 动效细节 | 标题默认动效 / 标题鼠标交互 / 背景默认动效 / 背景鼠标交互 |
| 参数 | 背景强度（0–100%）/ 毛玻璃模糊（0–32px） |

- 共 **11 个独立开关 + 1 个总开关 + 2 个滑块**，切换即时生效。
- 「其它区域」与页面无关：HUD 玻璃复用输入框同一个模糊滑块；右侧边栏只在展开时生效。
- 「页面」分组顶部有一行静态说明，注明动效只在新增会话页与聊天会话页生效。
- 页面底部另有「自检信息」：一打开就自动生成锚点、图层尺寸、计算样式与页面历史，用于在没有 devtools 的环境里定位「某个页面没有动效」的问题；其中 `page=none` 表示当前页不在作用范围。v0.2.0 起另有 `--- panels ---` 一节，输出右栏展开状态/底色/图层尺寸与 HUD 面板的计算样式。
- 配置写入浏览器 `localStorage`（键 `dsh-signal-field:v1`），重开应用后保持；「恢复默认」可一键清零。旧版本遗留的两页开关字段会在加载时被静默丢弃，其余设置保留；更名前的 `dsh-motion-ui:v1` 会自动迁移一次（见上文「从 dsh-motion-ui 升级」）。
- 关闭总开关后：画布被销毁、动画停止、注入的作用域属性全部移除，界面回到 DSH 原生外观。

---

## 无障碍与降级

- 系统开启「减少动效」（`prefers-reduced-motion: reduce`）时，首次安装会把「默认动效」与「鼠标交互」初始化为关，设置页给出说明，可手动打开。
- WebGL2 不可用或上下文丢失时，背景降级为一层柔和径向渐变（`[data-mui-field][data-fallback]`），不抖动、不交互，功能不受影响。
- 标题挂载点缺失时，设置页会显示「当前 DSH 版本未找到新增会话页标题挂载点」，其它效果照常。

---

## 安装 / 升级 / 卸载

```text
# 安装（target 为插件包目录的绝对路径）
plugin_manager install_bundle  target=<absolute-path-to-plugin>/dsh-signal-field

# 升级：改完源码后
node scripts/build.mjs        # 重新生成 client.js
# 目录链接安装：刷新页面即可加载新 bundle；package.json / exports 变更时需重新 install_bundle
# 若刷新未生效：plugin_manager set_plugin 关→开，或重启 DeepSeek Harness

# 卸载
plugin_manager remove_bundle  target=dsh-signal-field
```

---

## 从 dsh-motion-ui 升级

本插件 v0.2.8 起更名为 **dsh-signal-field**（原名 `dsh-motion-ui`），功能、外观与设置项完全不变，只是包名、插件 id 与设置存储键一起对齐了新名字。

```text
# 1. 先移除旧包，避免新旧两份同时启用（会出现两套样式与两个信号场实例）
plugin_manager remove_bundle  target=dsh-motion-ui

# 2. 安装新包（target 指向改名后的目录）
plugin_manager install_bundle  target=<absolute-path-to-plugin>/dsh-signal-field

# 3. 刷新页面
```

迁移细节：

- 首次启动时会把旧键 `dsh-motion-ui:v1` 的配置搬到新键 `dsh-signal-field:v1`，然后删除旧键——**10 个开关与 2 个滑块都不需要重设**；
- 若新键已有值，则以新键为准，只清理残留的旧键；
- 旧键数据损坏时静默回默认值，不影响启动；
- 插件 id 由 `motion-ui` 变为 `signal-field`，若你的 agent preset 或其它 cordis 组合里显式写过旧 id，需要同步改一次。

---

## 已知限制与版本耦合

本插件刻意保持「只读宿主、不改宿主」，但仍依赖几个 DSH 的 DOM 契约。DSH 大版本升级后若动效消失，按下面的锚点表排查：

| 用途 | 依赖的锚点 | 缺失时的行为 |
| --- | --- | --- |
| 页面识别 | `[data-conversation-content]` 是否存在 | 整页不介入：不建图层、不写属性、不挂标题 |
| 新增会话 / 聊天区分 | `[data-conversation-content][data-content-phase]` | 无 `hero` 阶段时按聊天页处理，标题不挂载 |
| 背景图层落点 | 会话内容面 `[data-conversation-content]` 自身 | 不安装背景，其它效果照常 |
| 标题挂载点 | `[data-content-phase="hero"]` 内字号最大的叶子文本块 | 不挂载标题，设置页提示不可用 |
| 标题插入位置 | 从该文本上溯到「父级为纵向 flex」的 hero 行，插在行内文案组之前 | 找不到行结构时不挂载标题 |
| 输入框卡片 | `[data-composer-card]` | 毛玻璃不生效 |
| 输入框条带 | `[data-composer-seat]` 及其对 `--dsw-alias-bg-base` 的引用 | 条带恢复不透明渐变，背景在该处断开 |
| 输入框条带 | `[data-composer-seat]::before` 的模糊 + 底边压色（`z-index:-1`，仅聊天页生效） | 消息滚动到状态栏上不再被遮挡，卡片玻璃仍有真实的场可模糊，状态栏文字不受影响 |
| HUD 面板 | `dsh-awesome-hud` 的 `.hud-panel`（模糊只在 `.hud-panel::before` 上） | 毛玻璃不生效（未安装该插件时无副作用） |
| 暗色主题 | `body[data-ds-dark-theme]` | 固定按亮色配色 |
| 主题取色 | `--dsw-alias-label-primary` / `--dsw-alias-brand-primary` | 回落到插件内置的中性色 |

`[data-conversation-content]` 是本插件唯一的页面判定依据，也是当前的单点依赖（v0.1.1 起不再读取 `ctx.layout`）。

与 `dsh-ascii-whales` 的关系：两者都会作用于 `[data-composer-card]`。本插件的玻璃选择器特异性更高（`html[data-mui][data-mui-glass-*] [data-composer-card]::before`），同时开启时**以本插件为准**，设置页有对应提示。

---

## 升级回归清单

1. 新增会话页：鲸鱼图标 / 「DEEPSEEK HARNESS」/「探索未至之境」/「预览版」是否同一行且整体居中。
2. 新增会话页：输入框**下方**是否整片都有动效背景。
3. 聊天会话页：输入框条带是否不再有白色底，背景是否一直铺到页面底部；输入框卡片的毛玻璃观感是否与新增会话页一致（v0.2.5 修正了 mask 破坏 backdrop-filter 导致的「透明卡」）。
4. 聊天会话页上下滚动消息：文字是否**不再压到状态栏**上；输入框下方的状态栏文字（「工作区修改」「模型名」那两行）是否**完整可见、不透明、不发虚**（v0.2.5 的重点回归项）。
5. 展开提问卡片 / 计划清单等浮层：浮层下方是否**没有被任何东西遮挡或模糊**（v0.2.4 的重点回归项）。
6. 右侧边栏：应回到 DSH 原生外观，**不再有**信号场背景。
7. HUD 面板：是否呈毛玻璃、能否透出并模糊背后信号场；面板**下方**那一竖条是否也是动效背景、而不是一块纯白（v0.2.5 的重点回归项）；面板四周是否**没有**硬边补丁、也没有比周围更密的竖带（v0.2.6 的重点回归项）；关掉「HUD 面板毛玻璃」后是否复原、补场是否一并消失。
8. HUD 自带的弹层（git graph、分支 / 提交 / 确认弹窗、文件操作与分支菜单、commit 悬停提示）是否仍按视口居中或贴合触发位置，**没有被关进面板或被裁切**。
9. 拖动标题到页面四角与输入框上方：文字是否始终可见、松手是否回弹。
10. 回归：两页背景/标题/输入框毛玻璃、明暗主题切换、设置页 10 开关与 2 滑块即时生效并刷新后保持；插件管理页与自动化任务页仍保持 DSH 原生外观。
11. 总开关关闭后：`document.documentElement` 上不应残留 `data-mui*` 属性，`<style data-plugin="dsh-signal-field:styles">` 应被移除。

---

## 开发

```text
node scripts/build.mjs     # src/*.js → client.js（零依赖，内置语法与残留检查）
node --test test/*.test.mjs
```

```text
dsh-signal-field/
├── package.json          # bundle 行 + client 入口 + exports + files
├── cordis.patch.yml      # insert: signal-field
├── index.js              # Host 侧空 apply（能力全在 Client）
├── client.js             # 构建产物，勿手改
├── icon.svg              # Bayer 阵点 + 消失点图标
├── locale/{zh,en}.json   # meta（插件管理器显示）+ runtime（设置页文案）
├── src/
│   ├── settings.js       # 默认值/归一化/钳位/store（纯函数，可单测）
│   ├── page.js           # 页面分类与跨区域作用域（纯函数）
│   ├── glsl.js           # 顶点 + 波纹 + 抖动着色器
│   ├── field.js          # WebGL2 信号场引擎
│   ├── techtext.js       # Canvas2D 蓝图标题引擎
│   ├── styles.js         # 注入样式
│   ├── stage.js          # 锚点解析与装配
│   ├── settings-page.js  # 「UI 动画」设置页
│   └── client.js         # 模块入口
├── scripts/build.mjs
├── test/{settings,page,techtext,hero-layout,build,wiring}.test.mjs
└── docs/dom-anchors.md
```

`src/*.js` 的书写约定（构建脚本会校验）：`import` 单行且以 `;` 结束；只用具名 `export`；所有文件共享一个闭包，顶层标识符不能重名。

---

## 许可

MIT。
