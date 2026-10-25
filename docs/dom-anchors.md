# DOM 锚点标定记录（dsh-signal-field v0.2.8）

本环境没有页面 DOM / 截图控制能力（认证后的页面不可从 shell 探测），因此锚点来自三处：
**DSH 0.2.1-rc.3 自带 Client 包源码**、**已装插件的实测用法**、以及插件内置「自检信息」在运行中回读的真实计算结果。
每条都注明来源与「缺失时会怎样」，末尾列出仍未验证项。

## 1. 交付环境

| 项 | 值 | 来源 |
| --- | --- | --- |
| DSH 版本 | `0.2.1-rc.3` | `app.asar/dsh/package.json` |
| 活动 profile | `desktop` | 运行进程 `cwd`、`lsof` 读到的 `package.json` / `cordis.patch.yml` |
| Web GUI | `http://127.0.0.1:52416`（`/` 返回 401，需页面内会话令牌） | `lsof -iTCP:52416` + `curl` |
| 同位置已装插件 | `dsh-ascii-whales@0.1.5` | profile `package.json` |

## 2. AppFrame 结构（运行时实测）

```
div.PIRFFq_frame 1470x863  bg=rgba(0,0,0,0)
├── div.PIRFFq_sidebarCol  280x863    bg=linear-gradient(...) + color-mix(40% 不透明)
├── div.PIRFFq_centerCol  1190x863    bg=rgb(255,255,255)（由插件/主题写入）
├── div.PIRFFq_rightbarCol   0x863
├── div.PIRFFq_bottomRow  1470x0
├── div.PIRFFq_overlayLayer 1470x863
└── div.PIRFFq_handle        8x863
```

- 与源码一致：`[data-shell-overlay]` 的父元素就是 AppFrame；`overlayLayer` 是 `shell.overlay` 的座位。
- 侧栏只有约 40% 不透明（`color-mix(... 40%, transparent)`），所以背景图层若落在框层之下、会透过侧栏隐约可见——这也是早期「只有侧栏能看到纹理」的原因。

## 3. 图层必须挂在内容面内部

第一次实现把图层插在 AppFrame 的第一个子节点、`z-index:-1`，结果中间内容区看不到效果。原因：
内容面自己的底色（`centerCol bg=rgb(255,255,255)`）会把框层之下的图层整块盖住。

正确做法（与 `dsh-ascii-whales` 一致）：把图层挂成**内容面的子节点**，并给内容面加
`position:relative; isolation:isolate`，图层用 `position:absolute; inset:0; z-index:-1`。
这样图层恰好压在该面自身底色**之上**、正文**之下**。

实测确认生效的画面：新增会话页、聊天会话页。实测结构：

```
[chat] conv=yes
center 1190x863 kids=1~2
  > div. 1190x863            ← 会话面（也就是 [data-conversation-content]）
surface = div.kiGsTW_body.dsh-whales-scene 890x787 / 1190x823
layer   = div 890x787 → canvas 1780x1574, opacity 0.55, z=-1, engine=webgl2
```

## 4. 页面分类

**v0.1.1 起判定只看 `[data-conversation-content]`**：存在即会话页，再按 `data-content-phase`
细分为 `hero`（空态）/ `chat`（已有会话）；不存在即不在作用范围（`none`）。
`ctx.layout` 依赖与 `activePanelId` 通道已从代码中移除，下表只作为当初的实测依据保留。

历史实测（v0.1.0 时期为双来源判定：`ctx.layout.panelInfo.getSnapshot().activePanelId`，
源码 `LayoutController.panelInfo`）：

| activePanelId | 页面 | `[data-conversation-content]` |
| --- | --- | --- |
| `null` | 会话页 / 新增会话页 | 存在 |
| `plugins` | 插件管理页 | 不存在 |
| `schedules` | 自动化任务页 | 不存在 |

会话页再按 `[data-conversation-content][data-content-phase]` 细分：实测空态为 `hero`、已有会话为 `active`。

~~兜底链：`activePanelId` 为空且没有会话面 → 归为「面板页」，任一背景开关开启即显示。~~
v0.1.1 起该兜底已废弃：没有会话面即完全不介入，也不写任何作用域属性。

## 5. 非会话面板页的落点（v0.1.1 起已移出作用范围）

> 本节记录的是 v0.1.0 时期为「让两个面板页也显示背景」所做的调查。该能力已在 v0.1.1 移除：
> 这两页现在不介入，相关定位代码（`resolveFrame` / `findCenterColumn` / `findPageHost`）已删除。
> 本节保留作为历史依据，不再代表当前行为。

`[plugins]` 与 `[schedules]` 的实测结构差异（自检 page captures 原文）：

```
[schedules] conv=no
center 1190x863 kids=1
    > div. 0x0 kids=1          ← 直接子节点是 0×0
host div.PIRFFq_centerCol bg=rgb(255,255,255)
```

即自动化任务页的内容容器是**脱离文档流、覆盖视口**的那一层，父链量出来是 `0×0`，
真正的可见盒子在更深一层且面积可能大于中间列（视口 1470×863 > 中间列 1190×863）。
因此当前实现改为「在中间列子树里按占位面积取最大元素（深度 ≤4）」。
**插件管理页已确认生效；自动化任务页该版改动尚未经过视觉确认。**

## 6. 标题挂载点

`conversation.hero.brand.mark` 是单值槽，ownerProps `{ size: number, className?: string }`
（"Requested square edge in pixels"），语义是标题前的小号品牌标，承载不了整行横幅标题。

实际落点算法：

1. 在 `[data-content-phase="hero"]` 内遍历 `h1..h4, p, div, span`，只取「无子元素、文本非空 ≤60 字、可见、字号 ≥15px」的叶子；
2. 取 `computedStyle.fontSize` 最大者，视为「探索未知之境」；
3. `closest("h1,h2,h3,h4,p")` 收敛到标题块，再向上收敛纯包装层（父节点只有唯一子元素时继续上溯），
   直到父节点出现同级兄弟——那一层就是「标题行」，把 `[data-mui-title]` 插在它前面；
4. 宽度 `clamp(父宽 × 0.78, 320, 880)`，高度 `clamp(宽 × 0.11, 72, 100)`，字号 = 高度 × 0.94
   （引擎的 fit 基本为 1，于是字形高度 ≈ 高度 × 0.72，实测约 65px）。

v0.1.x 时该算法把标题插进了 `titleGroup` 内部（见 §10），已被用户确认为「排列不整齐」。
v0.2.0 改为行内方案：先按 §10 的结构定位 headline 行与文案组，插到文案组之前；
盒子尺寸不再按父宽比例推算，而是用 `measureTitle()` 以目标字号 42px 反推
（`width = 墨宽/0.92`、`height = 墨高/0.72`，使引擎 fit≈1、实际字形≈42px）。

## 7. 主题

- 暗色判据：`body[data-ds-dark-theme]`（源码常量 `DARK_ATTRIBUTE`）。
- 主题 token 由 ThemePresenter 写在 `body` 行内样式上，用
  `getComputedStyle(document.body).getPropertyValue("--dsw-alias-…")` 读取。
- 实测 `body bg=rgba(0,0,0,0)`：底色不来自 body，而来自各内容面。

## 8. 毛玻璃

沿用 `dsh-ascii-whales` 已验证结构：卡片 `isolation:isolate` + `background:transparent`，
模糊放在 `::before`（若把 `backdrop-filter` 直接放卡片上，会建立包含块、破坏内联弹层的视口锚定）。

运行时实测（自检原文，已生效）：

```
composerCard: count=1 <div.JZLxKW_card> bg=rgba(0,0,0,0) iso=isolate
              beforeBackdrop=blur(14px) saturate(1.6) brightness(1.02)
              beforeBg=color(srgb 1 1 1 / 0.18)
```

两条经验：

1. 底色 45% 时在浅色主题下等同白卡，看不出「透」；压到 18% + 一层斜向高光才有玻璃感。
2. 设置面板打开时 `composerCard` 与 `composerBarSlot` 都会量到 `0×0`（内容被隐藏），
   所以自检必须在**页面切换时**先抓结构快照，不能只在打开设置时现算。

优先级：本插件 `html[data-mui][data-mui-glass-hero] [data-composer-card]::before` 特异性 `(0,3,2)`，
高于 ascii-whales 的 `.dsh-whales-scene[data-whales-glass] [data-composer-card]::before` `(0,3,1)`，
同时开启以本插件为准。

## 9. 设置面板结构（排查用）

```
0: div                                   0x0      ← settings.header 槽
1: div._77Pn0W_navTitle             164x24
2: nav._77Pn0W_nav                  188x727    内含「账号与余额 / 通用设置 / 模型 / 内置插件 …」
3: div._77Pn0W_panel                800x727
4: div._77Pn0W_overlay             1470x863    覆盖视口
```

结论：DSH 的「内置插件」是设置面板里的一个分区，与本插件的「插件管理页」（main 槽 `plugins` 页）不是同一个东西；
侧栏「插件」进入的是后者。

## 10. hero 行真实结构（v0.2.0 补录）

来源：`app.asar` → `dsh/node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js` 内的
`HeroShell.module.css` 与 `HeroShell` 组件源码（DSH 0.2.1-rc.3）。

```
div._8tPydW_root          justify-content:center;align-items:center;height:100%;padding:0 24px;display:flex
└ div._8tPydW_stack       flex-direction:column;align-items:stretch;gap:12px;max-width:var(--dsh-composer-card-max-width)
  └ div._8tPydW_headline  display:flex;flex-wrap:wrap;justify-content:center;align-items:center;gap:12px 10px;font-size:26px
    ├ span._8tPydW_fishHitbox     槽 conversation.hero.brand.mark（fallback HeroFish）
    └ span._8tPydW_titleGroup     display:flex;gap:4px 7px
      ├ span                      t("hero.headline") =「探索未至之境」
      └ span._8tPydW_previewBadge t("hero.preview")  =「预览版」（align-self:flex-start;margin-top:2px）
```

v0.1.x 把标题插进 `titleGroup` 内部，四者被挤成一行且整行偏移；v0.2.0 改为插到 `headline` 内、
`titleGroup` 之前，居中回归 DSH 自身的 `justify-content:center`。定位算法：从字号最大的叶子文本上溯，
**父级为纵向 flex 容器**的那一层即 headline 行，行内含该叶子的直接子元素即文案组。

## 11. 输入框条带的不透明遮罩（v0.2.0 补录）

来源：同包的 `ConversationRoot.module.css`。

```
.kiGsTW_root[data-phase=active] .kiGsTW_composerSeat{
  z-index:7;position:sticky;bottom:0;
  background:linear-gradient(180deg, color-mix(in srgb,var(--dsw-alias-bg-base) 0%,transparent) 0px,
                                     var(--dsw-alias-bg-base) 36px)
}
```

聊天页底部白底来自这条规则（hero 阶段没有它，所以只有聊天页白）。v0.2.0 用
`html[data-mui-active] [data-composer-seat]{--dsw-alias-bg-base:transparent}` 把变量在该子树下推为透明，
渐变自然失效，不需要写任何哈希类名。

**这条渐变同时是遮罩（v0.2.3 修正）**：座位在浮层输入框形态下是
`.scrollBody:has([data-conversation-composer-overlay]) > .composerSeat{position:absolute;bottom:0}`，
即绝对定位浮在滚动区之上；下方 `z-index:7` 的座位靠这条「0px 透明 → 36px 不透明」的渐变把滚动上来的
消息挡在输入框与状态栏背后。v0.2.0/0.2.1 把 token 下推成透明等于把遮罩一起删了，实测现象就是
聊天页滚动时消息文字压在「深度求索中… 200 tok/s · 缓存命中」这一行上。

v0.2.2 起保留下推（场不被白底盖住），另补一条遮罩带来挡住滚到座位下方的消息。
这条遮罩带前后改了三版，值得完整记下来：

| 版本 | 做法 | 结果 |
| --- | --- | --- |
| v0.2.2 | 座位自身 `background` 铺纯色渐变（场底色与中性底按 25% 混） | 实测 238，比场（249）暗 11 级，肉眼是色带；固定 76px 在 hero 页盖满整条座位 |
| v0.2.3 | 座位 `::after` + `backdrop-filter` + 轻着色，高度实测 | 伪元素默认画在子元素之上，**把状态栏文字一起模糊了**；展开的提问卡片下方也被盖住 |
| v0.2.4 | 滚动容器 `mask-image` 渐隐，**不加任何覆盖层** | 不加层是对的，但座位是滚动容器的子节点，整条座位被一起渐隐（状态栏文字消失、消息从半透明区透出）；mask 还在祖先建立 backdrop root，输入框毛玻璃失效 |
| v0.2.5 | 放弃 mask：改成**座位自己的 `::before` 背衬**（`backdrop-filter` + 压色，`z-index:-1`） | 背衬永远在座位子元素之下，文字与玻璃同时恢复；消息被模糊压住，且不涉及任何容器级遮罩 |

核心教训有两条：

1. **任何叠在 UI 之上的层（伪元素或独立 div）都会作用于它下面的一切**，只要它带
   `backdrop-filter` 就会把文字糊掉。所以遮挡层必须压在该区域子元素**之下**。
2. **`mask` / `backdrop-filter` 都作用于整棵子树**。挂错一层的代价是这一章反复出问题的根源：
   v0.2.4 把 `mask` 挂在滚动容器上，座位（它的子节点）被一起渐隐；
   `mask` 还在祖先建立 backdrop root，下游卡片再也采样不到背后的场。

### 11.1 v0.2.5 → v0.2.7 的最终做法：座位只在信息行那一条铺背衬

不给任何容器加遮罩，而是让座位给自己铺一条「模糊 + 压色」的背衬——**只盖输入框下方那一行信息文字**：

```css
/* 座位背衬：只在聊天页（hero 页座位在流内、下方没有内容） */
html[data-mui-active] [data-content-phase="active"] [data-composer-seat]{
  isolation:isolate;                     /* 层叠上下文：负 z 背衬才镇得住被钉住时盖住的消息 */
}
html[data-mui-active] [data-content-phase="active"] [data-composer-seat]::before{
  content:"";position:absolute;left:0;right:0;bottom:0;
  height:var(--mui-seat-band-h, 34px);   /* JS 实测：卡片底边 → 座位底边 */
  z-index:-1;pointer-events:none;
  background:linear-gradient(0deg,
    color-mix(in srgb, var(--mui-seat-scrim) 94%, transparent) 0,
    color-mix(in srgb, var(--mui-seat-scrim) 94%, transparent) calc(100% - 8px),
    transparent 100%);
  backdrop-filter:blur(calc(var(--mui-blur, 14px) * .9)) saturate(1.04);
}
```

五点说明：

1. **背衬在子元素之下**。`::before` + `z-index:-1`（配合座位的 `isolation:isolate`），
   卡片与信息行文字都在它之上，因此不可能像 v0.2.3 的 `::after` 那样把文字糊掉，
   也不可能盖住展开的提问卡片（那些弹层同样是座位的子元素）。
2. **座位必须建立层叠上下文**。座位被钉在视口底部时靠 `z-index:7` 盖住滚上来的消息；
   负 z 背衬只有落在座位自己的层叠上下文里才能一起盖住消息，否则会掉到消息之下、彻底失效。
3. **高度必须实测**（v0.2.7）。卡片高度随附件、多行输入、展开的提问卡片变化，
   写死像素要么盖不住信息行、要么把卡片下沿糊掉；实测取「卡片底边 → 座位底边」最稳。
4. **只能铺这一条**（v0.2.7）。v0.2.5 曾铺满整条座位，结果 `backdrop-filter` 把细颗粒的抖动
   纹理平均成一片平滑浅灰——整条输入框区域看起来就是「没有动效背景」，卡片采到的也变成糊过的场，
   观感反而离新增会话页更远。座位其余部分保持透明，动效背景才能一直透上来。
5. **不涉及任何容器级遮罩**：滚动容器与消息容器都没有 `mask`，
   因此既不会误伤座位，也不会给卡片的 `backdrop-filter` 制造 backdrop root。

已知取舍：`backdrop-filter` 不可用时（`@supports not`）退化为一条更不透明的纯压色，
仍能挡住消息；这一条与上方抖动场之间在卡片左右两侧各有一小段「纹理变柔」的接缝，
宽度就是卡片以外的座位边距，属已知取舍而非缺陷。

## 12. 右侧边栏（v0.2.0 补录，v0.2.4 移除）

> **v0.2.4 已整体移除该项能力**：按用户要求，插件的作用范围不再包含右侧边栏。
> 下面的标定记录与两轮踩坑分析保留，仅作为「若将来重新接入」的依据；
> 代码里已删除图层、观察器、CSS 选择器、`data-mui-rightbar-*` 属性与「右侧边栏背景」设置项。
> 顺带说明：这也是唯一一处能让「刚打开侧栏时闪一下 DSH 底色」的路径，移除后该现象不再存在。

`[data-rightbar-col]`（组件 `RightbarColumn`）里是 `rightbar` 槽，官方占用者为
`@deepseek-ai/dsh-client-ui-sidebar-right`。

- 分栏：`[data-platform=darwin] .PIRFFq_rightbarCol{background:var(--dsw-alias-bg-base)}`
- 标签页宿主（`dsh-web-frontend/dist/assets/index-*.css`）：
  `._tabHost_6nhg2_162:not(._float_6nhg2_156), ._emptyTabHost_6nhg2_143{background:var(--dsw-alias-bg-base)}`
- 面板：`.Dv5QdW_panel{position:absolute;top:0;bottom:0;right:0;pointer-events:none}`，内容由 dockkit 渲染。

结论：右栏白底只来自 `--dsw-alias-bg-base`，在该列子树内把变量置透明即可，无需依赖哈希类名；
内层标签页卡片保留自己的底色以保证可读性。

**陷阱：下推 token 之后，场失去了底色（v0.2.3 修正）**。会话内容区的场压的是
`.kiGsTW_root{background:var(--dsw-alias-bg-base)}`（会话根节点，白底）；
右栏把 token 下推成透明后，整列变成透明，场就直接压在了**外壳**底色上。实测同一张截图里
内容区场底 (249,249,251)、右栏场底 (229,220,223)，反解出右栏底下是约 #E3CCCA 的暖粉底色——
同一个场两处一发冷一发暖就是这么来的。

v0.2.2 的做法：在 `body` 上把原始值快照成 `--mui-surface-base`（`body` 正是 token 的持有者，
主题切换时快照自动更新），右栏图层自带 `background:var(--mui-surface-base)`，
并压到 `z-index:-1`（在列的底色之上、标签页内容之下，和内容区的叠法一致）。
注意 `z-index:0` 不够：那时图层与标签页同属正 z 层，谁在上面取决于树序。

**首帧闪白（v0.2.3 修）**：侧栏开合是 grid 列宽动画，从 0 过渡到目标宽度。原实现用
「列宽 > 1 才算展开」判断，动画头几帧宽度是 0/1，于是判定为未展开、不建图层，
用户就看到一瞬裸的 DSH 底座。现在 `rightbarColumn()` 只判断节点是否存在
（宽度为 0 时图层自然也是 0 宽、不可见，但动画一开始就已就位）；
同时列的底色不再退成透明，而是直接给 `background:var(--mui-surface-base)`——
图层挂上之前那几帧也有与内容区同源的中性底兜着。

## 13. HUD 面板（v0.2.0 补录，v0.2.1 修正）

来源：`dsh-awesome-hud@0.15.4` 的 `lib/client.js`。

```
.hud-panel{position:fixed;right:8px;width:300px;max-height:calc(100vh - 24px);
  overflow:hidden;
  background:var(--hud-surface-bg,var(--dsw-static-neutral-bluish-00));
  border:0.5px solid var(--dsw-alias-border-l2);border-radius:14px}
```

面板挂在 `shell.overlay`，是固定定位的悬浮层，`backdrop-filter` 取到的正是它背后的信号场，
因此复用输入框配方即可得到同款毛玻璃；未安装该插件时 `.hud-panel` 选择器不匹配，无副作用。

**补场必须与面板同层（v0.2.5 修正）**：v0.2.3/v0.2.4 把补场挂在 `body` 上并给 `z-index:-1`，
结果被外壳自己的不透明底色整个盖住——补场等于不存在：面板玻璃只能模糊到一片白，
面板下方露出的也是外壳白底（用户看到的就是「HUD 面板所属右侧区域下方一块纯白」）。
面板挂在 DSH 的 `shell.overlay`（`.PIRFFq_overlayLayer`，`z-index:20` 的层叠上下文）里，
补场插进同一层、DOM 顺序排在面板之前即可：`z-index:0`，压在页面内容之上、面板之下。
尺寸也不再是「面板矩形 + 24px」——面板高度由内容撑出，内容短时下方会露白——
而是一路铺到视口右下角。`test/parity.test.mjs` 同时锁 CSS 与实现：
CSS 不得出现负 z-index，JS 必须 `parent.insertBefore(hudBackdropEl, panel)`，
且宽高铺到视口宽高。

**补场的盒子要对齐「内容区那条带子」，不能用「面板矩形外扩」（v0.2.6 修正）**。
v0.2.5 按面板外扩 24px 铺，实机上露出两个问题：

1. **带硬边的补丁**：补场顶比会话内容区高出一截（实测 19px 对 35px），右栏就浮出一块矩形，
   顶边是一条直线；
2. **发脏的竖带**：左侧那圈 24px 外扩正好压在内容区自带的那层场之上。补场是 fixed 悬浮层、
   画在内容区**之上**，两层场叠加后不再是「同一份噪声」：亮格 233 → 243、暗格 233 → 218，
   统计上更密更暗，肉眼就是面板左侧一条脏带。

现在的做法有两条，缺一不可：

- **几何对齐**：补场左缘 = 内容区右缘（`[data-conversation-content]` 的 `rect.right`）、
  上缘 = 内容区上沿（`min(rect.top, panelTop)`）、右缘/下缘 = 视口边。这样补场与内容区的场并成
  同一条带子；两者是**同一套配色、同一份抖动统计**的独立实例，边界只是噪声相位不同，看不出接缝。
  左缘不能取「面板左缘 - pad」再往左推：那样会压进内容区，既叠场又盖住滚动条。
- **不透明同源底色**：补场的 CSS 带 `background:var(--mui-surface-base)`。即使某些布局下补场
  仍与内容区重叠，也是被它**盖住**而不是叠成两层场——与内容区同源的基底保证观感一致。

**包含块陷阱（v0.2.0 踩过，v0.2.1 修正）**：该插件把弹层直接渲染在面板子树里，且都是
`position:fixed`——`.hud-modal{position:fixed;inset:0}`（git graph、分支/提交/确认/计划弹窗）、
`.hud-git-menu`、`.hud-branch-menu`、`.hud-git-tip` 全部如此；只有设置小菜单与会话跳转菜单走
`createPortal(..., document.body)` 逃到了面板外。而 `backdrop-filter`（连同 `filter`）会为元素
建立 `fixed`/`absolute` 后代的包含块。v0.2.0 把模糊写在 `.hud-panel` 本身，于是这些弹层改以
`width:300px` 的面板为视口，`inset:0` 被解释成面板盒子，再被面板的 `overflow:hidden` 裁掉，
表现为「git graph 弹窗被关进 HUD 面板里」。修法与输入框一致：宿主只保留
`isolation:isolate;background:transparent`，模糊与玻璃底色放在 `.hud-panel::before`
（`position:absolute;inset:0;z-index:-1;pointer-events:none;border-radius:inherit`）。
`test/glass-contain.test.mjs` 固化了两条不变量：全文件 `backdrop-filter` 只允许出现在伪元素上；
`.hud-panel` 与 `[data-composer-card]` 自身的规则块不得携带模糊。

## 14. 标题拖动的裁切边界（v0.2.0 修复）

原实现 canvas 尺寸 = 设计盒尺寸（约 424×42），字形位移超出画布即被裁掉。v0.2.0 改为
「设计盒（布局 + 交互热区）+ 舞台（渲染）」：舞台取 `container.closest('[data-mui-surface]')` 的盒子，
上限 2000×1500 CSS px，canvas 绝对定位且 `pointer-events:none`，绘制时统一加上舞台原点偏移。
祖先 `[data-conversation-scroll]` 的 `overflow` 仍是硬边界——拖出内容视口的部分仍会被裁。

## 15. 仍未验证的部分

1. ~~自动化任务页背景~~（v0.1.1 已把该页移出作用范围，此条失效）。
2. 亮/暗两套配色下的玻璃观感、深色主题下标题墨色对比度。
3. 窗口变窄（<1024px 侧栏自动收起）时标题与背景的响应式表现。
4. 卸载后 `document.documentElement` 上 `data-mui*` 属性与注入 `<style>` 的清理（代码路径已实现，未实机复核）。
5. v0.2.0 新增三项的实机观感：HUD 面板毛玻璃、右侧边栏信号场、以及两者在暗色主题下的表现。
6. 右侧边栏各标签页（文件树 / 浏览器 / 终端）在「只透明最外层」策略下是否仍有自己的不透明底。
7. v0.2.1 修正后 HUD 各弹层（git graph、分支/提交/确认、文件与分支菜单、commit 提示）的实测位置与尺寸——机制已确定，观感待你确认。
8. v0.2.7 的座位背衬：条带高度已改为实测（卡片底边 → 座位底边），但**压色分界**仍是相对值
   （`100% - 8px` 往上全压）。若信息行变成两行或被塞进别的元素，分界线可能要跟着调。
9. v0.2.3 右栏基底修复后的实测色值是否与内容区一致（此前实测 229/220/223 对 249/249/251，
   修复后应在同一色域内）；暗色主题下同样需要复核一次。
10. 深色主题下座位背衬的观感：压色取自 `--mui-seat-scrim`（由场底色与内容基底混出），
    暗色下是否仍然贴合（理论上同源，仍建议复核一次）。
11. HUD 补场：面板背后那一层场与内容区的场是**两个独立实例**（各自噪声相位不同），
    面板边缘可能看出图案不连续。
12. HUD 补场在面板贴屏幕边缘时的裁切行为（`right:8px`，补场左缘外扩 24px，右下按视口裁齐）。
13. v0.2.6 把补场对齐到内容区那条带子后：补场自带不透明底色，因此内容区右缘以右、
    视口边以左那一竖条完全由补场负责——若窗口极窄（内容区与面板重叠），补场只会覆盖
    内容区右缘之外的区域，重叠部分仍由内容区自己的场承担，观感是否一致待确认。
14. 补场现在插在 `shell.overlay` 里、DOM 顺序在面板之前；若 `dsh-awesome-hud` 以后改用 portal 挂到
    `body`，JS 会退回 `z-index:-1` 的老路（此时面板玻璃会重新变白），需要一并复核。
