/**
 * dsh-signal-field · 注入样式
 *
 * 约定：
 *   - 颜色只读宿主 token（`--dsw-alias-*`）或本插件自己的 `--mui-*` 变量，不写死产品色；
 *   - 页面作用域用 `<html>` 上的属性开关，避免影响未勾选的页面；
 *   - 所有选择器都挂在插件自有属性 / 自有类名上，卸载时随 <style> 一起消失。
 */

// v0.4.0：鲸鱼等宽字体的内嵌 data URI。构建时本行被剥离，
// 产物里 WHALE_MONO_URI 由前面的 src/whale-fonts.js 提供（ORDER 保证顺序）。
import { WHALE_MONO_URI } from './whale-fonts.js';

export const STYLE_ATTR = 'data-plugin';
export const STYLE_ID = 'dsh-signal-field:styles';

export const CSS = `
/* ===== 舞台：信号场图层 ===== */
/* 内容面作为图层宿主：isolation 让它成为独立的层叠上下文，
   图层 z-index:-1 于是正好压在该面自身底色之上、正文之下。 */
[data-mui-surface]{position:relative;isolation:isolate}
[data-mui-field]{
  position:absolute;inset:0;z-index:-1;pointer-events:none;overflow:hidden;
  opacity:0;transition:opacity .5s var(--ds-ease-in-out,ease);
}
[data-mui-field][data-on]{opacity:1}
/* HUD 面板背后的补场：它是 fixed 悬浮层，位置由 JS 写成内联样式，
   所以这里必须让掉 inset:0，否则会铺满整个视口（HUD 面板是浮层，整页铺场会盖到侧栏上）。
   z-index 也不能是 -1：v0.2.4 把它挂在 body 上并用 -1 压到最底层，结果被外壳自己的
   不透明底色整个盖住，面板玻璃只能模糊到一片白——面板下方那段「纯白」就是这么来的。
   现在由 JS 把它插进面板的同层（DSH 的 shell.overlay，本身是 z-index:20 的层叠上下文）
   并且排在面板之前，z-index:0 就够：压在页面内容之上、面板之下。

   background 必须是**不透明**的同源基底（v0.2.6）：补场画在内容区之上，若自身透明，
   与内容区那层场重叠的地方就会叠成两层场（亮格 233→243、暗格 233→218），
   肉眼是面板左侧一条发脏的竖带。自带一层与内容区同源的底色后，重叠处只会被它盖掉，
   场的观感处处一致；同时它也让「面板下方那一竖条」不再露出外壳白底。 */
[data-mui-field][data-mui-field-hud]{
  position:fixed;inset:auto;z-index:0;background:var(--mui-surface-base);
  /* v0.3.1：补场不做淡入。它每次进聊天页都会重建，0.5s 过渡叠上入场揭示，
     观感就是「面板背后那块背景要过两三秒才出来」。内容区仍保留上面那条 0.5s 过渡。 */
  transition:none;
}
/* 内容区默认应该是透明的（底色由壳层给）。这里把已知的几层容器显式放开，
   避免主题或页面自带底色盖住信号场；只动「会包住正文」的容器，不动侧栏。 */
html[data-mui-active] [data-conversation-content],
html[data-mui-active] [data-conversation-scroll],
html[data-mui-active] [data-slot="main"],
html[data-mui-active] [data-slot="main.conversation"],
html[data-mui-active] [data-slot="conversation.session"],
html[data-mui-active] [data-slot="conversation.composer.bar"]{background-color:transparent}
[data-mui-field] > canvas{position:absolute;inset:0;display:block;width:100%;height:100%}
/* WebGL2 不可用时的静态降级底：一层柔和径向渐变，不抖动、不交互 */
[data-mui-field][data-fallback]{
  background:
    radial-gradient(120% 90% at 50% 38%, color-mix(in srgb, var(--mui-field-wave) 42%, transparent), transparent 68%),
    var(--mui-field-bg);
}

/* ===== 鲸鱼图层（v0.4.0，从 dsh-ascii-whales 迁移）=====
   与信号场一样挂在内容面内部、同为 z-index:-1：两者都在内容面自身底色之上、正文之下，
   谁在上只取决于插入顺序（信号场先插入、鲸鱼后插入，所以鲸鱼压在信号场之上）。
   鲸鱼画布是透明的（alpha:true + clearRect），因此叠加时是「鲸鱼游在抖动天空前」，
   不会像自带底色的图层那样把信号场整片盖掉。
   字体在这里声明：Whale Mono 是内嵌子集，data URI 由 whale-fonts.js 提供。 */
@font-face{
  font-family:"Whales Mono";
  src:url("${WHALE_MONO_URI}") format("woff");
  font-style:normal;font-weight:600;font-display:swap;
}
[data-mui-whale]{
  position:absolute;inset:0;z-index:-1;pointer-events:none;overflow:hidden;
  opacity:var(--mui-whale-opacity,1);
}
[data-mui-whale] > canvas{
  position:absolute;inset:0;display:block;width:100%;height:100%;
  font-family:"Whales Mono",ui-monospace,Menlo,monospace;font-weight:600;
}

/* ===== 蓝图标题 =====
   标题现在是 hero 行内的一个块：宽高由 JS 按目标字号（42px）反推后写成内联样式，
   所以这里不给固定宽度、也不留外边距，避免把整行推歪。
   canvas 由引擎放大成「舞台」并绝对定位，用来承载拖出设计盒的字形，因此它自己不吃指针事件。 */
[data-mui-title]{
  display:block;flex:none;position:relative;margin:0;touch-action:none;
}
[data-mui-title] > canvas{
  display:block;position:absolute;pointer-events:none;touch-action:none;
}
/* 「预览版」徽标原本 align-self:flex-start，在 42px 标题撑高的行里会顶到上沿，改为垂直居中 */
[data-content-phase="hero"] [data-mui-title] ~ span > span + span{align-self:center;margin-top:0}
/* 关掉鼠标交互时标题只是装饰，不该再吃掉它上方区域里的点击 */
html[data-mui-title-static] [data-mui-title]{touch-action:auto;pointer-events:none}

/* ===== 毛玻璃输入框 =====
   卡片上 isolation:isolate + 透明底色，模糊放在 ::before 上，
   以免 backdrop-filter 建立包含块、破坏内联弹层的视口锚定。
   底色只留 18% 并用一层斜向高光模拟玻璃厚度：45% 在浅色主题下等于白卡，看不出「透」。 */
html[data-mui][data-mui-glass-hero] [data-composer-card],
html[data-mui][data-mui-glass-chat] [data-composer-card]{
  isolation:isolate;background:transparent;--dsw-specific-input-major:transparent;
  border-color:rgba(255,255,255,.55);
  box-shadow:0 16px 44px rgba(20,28,60,.08), 0 1px 2px rgba(20,28,60,.04), inset 0 1px 0 rgba(255,255,255,.7);
}
html[data-mui][data-mui-glass-hero] [data-composer-card]::before,
html[data-mui][data-mui-glass-chat] [data-composer-card]::before{
  content:"";position:absolute;inset:0;z-index:-1;pointer-events:none;border-radius:inherit;
  background:
    linear-gradient(158deg, rgba(255,255,255,.42), rgba(255,255,255,.08) 52%, rgba(255,255,255,.22)),
    color-mix(in srgb, var(--dsw-alias-bg-layer-1) 18%, transparent);
  -webkit-backdrop-filter:blur(var(--mui-blur, 14px)) saturate(1.6) brightness(1.02);
  backdrop-filter:blur(var(--mui-blur, 14px)) saturate(1.6) brightness(1.02);
}
html[data-mui][data-mui-dark][data-mui-glass-hero] [data-composer-card],
html[data-mui][data-mui-dark][data-mui-glass-chat] [data-composer-card]{
  border-color:rgba(255,255,255,.16);
  box-shadow:0 16px 44px rgba(0,0,0,.35), inset 0 1px 0 rgba(255,255,255,.14);
}
html[data-mui][data-mui-dark][data-mui-glass-hero] [data-composer-card]::before,
html[data-mui][data-mui-dark][data-mui-glass-chat] [data-composer-card]::before{
  background:
    linear-gradient(158deg, rgba(255,255,255,.12), rgba(255,255,255,.02) 52%, rgba(255,255,255,.06)),
    rgba(28,30,36,.30);
}
@supports not (backdrop-filter: blur(1px)){
  html[data-mui][data-mui-glass-hero] [data-composer-card]::before,
  html[data-mui][data-mui-glass-chat] [data-composer-card]::before{
    background:color-mix(in srgb, var(--dsw-alias-bg-layer-1) 92%, transparent);
  }
}

/* ===== 基底快照 =====
   内容区的信号场压的是会话根节点 .root 的 --dsw-alias-bg-base（白底），而右栏与输入框座位
   为了不遮住场，会把该 token 在子树内下推成透明。两边基底不同，同一个 55% 的场就会一冷一暖
   （v0.2.1 之前右栏实测偏暗发红就是这个原因）。
   这里先在 body 上把原始值快照成 --mui-surface-base：body 正是 token 的持有者，
   主题切换时快照随之更新，子孙元素再也不会被下推出来的 transparent 污染。 */
html[data-mui-scope] body{
  --mui-surface-base:var(--dsw-alias-bg-base);
  /* 信号场在页面上的实际观感：画布名义不透明度 55%，但抖动覆盖率让它看起来只压了约 25%，
     所以「和底色按 25% 混」得到的颜色，才是需要假装成场时该用的颜色（实测 249 vs 场 249）。 */
  --mui-seat-scrim:color-mix(in srgb, var(--mui-field-bg) 25%, var(--mui-surface-base));
}

/* ===== 输入框条带 =====
   DSH 在 [data-phase=active] 上给座位铺一层不透明贴底渐变，它同时是**遮罩**：
   座位是 position:sticky + z-index:7，滚到下方时会被钉在视口底部、盖在消息之上，
   没有这层底色，消息文字就压在状态栏上。v0.2.0 把 --dsw-alias-bg-base 下推成透明
   = 连遮罩一起删了（文字重叠）；v0.2.2/v0.2.3 又把遮罩做成「叠在座位上的图层」，
   伪元素默认画在子元素之上，于是把状态栏文字一起糊掉、还盖住了展开的提问卡片。
   v0.2.4 改用 mask 让容器自己渐隐，但挂在了滚动容器 [data-conversation-scroll] 上，
   而座位正是它的子节点，整条座位被一起渐隐（状态栏文字消失）；
   同时 mask 会在祖先上建立 backdrop root，输入框卡片 ::before 的 backdrop-filter
   采样不到背后的场，毛玻璃退化成一张能看见噪点的透明卡——v0.2.5 两个问题都要修。

   v0.2.5 的做法：座位自己带一层「模糊 + 底部压色」的背衬，挂在座位 ::before 上。
     - 挂在 ::before 且 z-index:-1：位于座位子元素（卡片、状态栏文字）之下，
       不可能糊到任何 UI（这正是 v0.2.3 用 ::after 踩坑的地方）；
       座位自身 isolation 建立层叠上下文，负 z 层才镇得住座位自己被钉住时盖住的消息。
     - 背衬只在**输入框下方那一行信息文字**的范围里（高度由 JS 实测卡片底边到座位底边
       写成 --mui-seat-band-h）。v0.2.5 曾铺满整条座位，结果整条座位都被糊成一片平滑的浅灰：
       backdrop-filter 会把细颗粒的抖动纹理平均掉，看起来就是「这里没有动效背景」，
       连输入框卡片自己采到的也变成了糊过的场，观感反而离新增会话页更远。
     - 这一条同时要挡住滚上来的消息、让「19 轮 864 步 · 162 tok/s」这类小字清楚，
       所以用「模糊 + 压色」：模糊压掉文字，压色把残留压成底色。
   不遮滚动容器、不遮消息容器，因此不可能影响浮层、弹层与任何座位外的 UI。 */

html[data-mui-active] [data-composer-seat]{--dsw-alias-bg-base:transparent}

/* 座位背衬：只在聊天页（hero 页座位在流内、下方没有内容，不需要），
   而且只盖「输入框下方那一行信息文字」那一条——高度由 JS 实测写入 --mui-seat-band-h。
   其余部分保持透明，动效背景就能一直透上来（这才是「输入框区域有动效背景」的观感）。 */
html[data-mui-active] [data-content-phase="active"] [data-composer-seat]{
  isolation:isolate;
}
html[data-mui-active] [data-content-phase="active"] [data-composer-seat]::before{
  content:"";position:absolute;left:0;right:0;bottom:0;
  height:var(--mui-seat-band-h, 34px);
  z-index:-1;pointer-events:none;
  background:linear-gradient(0deg,
    color-mix(in srgb, var(--mui-seat-scrim) 94%, transparent) 0,
    color-mix(in srgb, var(--mui-seat-scrim) 94%, transparent) calc(100% - 8px),
    transparent 100%);
  -webkit-backdrop-filter:blur(calc(var(--mui-blur, 14px) * .9)) saturate(1.04);
  backdrop-filter:blur(calc(var(--mui-blur, 14px) * .9)) saturate(1.04);
}
@supports not (backdrop-filter: blur(1px)){
  html[data-mui-active] [data-content-phase="active"] [data-composer-seat]::before{
    background:color-mix(in srgb, var(--mui-seat-scrim) 96%, transparent);
  }
}

/* ===== HUD 面板（dsh-awesome-hud）=====
   面板是 position:fixed 的悬浮层，backdrop-filter 取到的正是它背后的信号场。
   模糊必须挂在 ::before 上：backdrop-filter 会为该元素建立 fixed 后代的包含块，
   一旦写在 .hud-panel 本身，面板自己的弹层（.hud-modal / .hud-git-menu / .hud-branch-menu
   / .hud-git-tip 都是面板子树里的 position:fixed 节点）就会以 300px 宽的面板为视口，
   再被 overflow:hidden 裁掉——v0.2.0 正是踩了这个坑。写法与输入框保持一致。
   未安装该插件时选择器不匹配，无副作用。 */
html[data-mui-scope][data-mui-hud-glass] .hud-panel{
  isolation:isolate;background:transparent;
}
html[data-mui-scope][data-mui-hud-glass] .hud-panel::before{
  content:"";position:absolute;inset:0;z-index:-1;pointer-events:none;border-radius:inherit;
  background:
    linear-gradient(158deg, rgba(255,255,255,.42), rgba(255,255,255,.08) 52%, rgba(255,255,255,.22)),
    color-mix(in srgb, var(--dsw-alias-bg-layer-1) 18%, transparent);
  -webkit-backdrop-filter:blur(var(--mui-blur, 14px)) saturate(1.6) brightness(1.02);
  backdrop-filter:blur(var(--mui-blur, 14px)) saturate(1.6) brightness(1.02);
}
html[data-mui-scope][data-mui-hud-glass][data-mui-dark] .hud-panel::before{
  background:
    linear-gradient(158deg, rgba(255,255,255,.12), rgba(255,255,255,.02) 52%, rgba(255,255,255,.06)),
    rgba(28,30,36,.30);
}
@supports not (backdrop-filter: blur(1px)){
  html[data-mui-scope][data-mui-hud-glass] .hud-panel::before{
    background:color-mix(in srgb, var(--dsw-alias-bg-layer-1) 92%, transparent);
  }
}

/* ===== 「UI 动画」设置页 ===== */.mui-page{display:flex;flex-direction:column;gap:16px;padding:2px 0 24px;font-size:13px;line-height:20px;color:var(--dsw-alias-label-primary)}
.mui-lead{margin:0;color:var(--dsw-alias-label-secondary);font-size:13px;line-height:20px}
/* 卡片（v0.4.0）：每个模块一张。只用主题 token 的**描边式**卡片（圆角 + 1px 边 + 透明底），
   不引入新色块：浅色主题下用底色区分容易与页面底色接近而看不出边界，描边最稳。
   注意：DSH Web 前端用的是 CSS Modules 哈希类名（_divider_6nhg2_39 这种），
   没有可复用的官方卡片类，所以这里必须自绘——与插件「自绘控件」的既有做法一致。 */
.mui-card{
  display:flex;flex-direction:column;gap:2px;min-width:0;
  padding:14px 16px;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;
  background:transparent;
}
/* 卡片标题：比卡内行文字更大更重，用来与分组小标题拉开一级。 */
.mui-card-title{
  margin:0 0 6px;font-size:13px;line-height:20px;font-weight:600;
  color:var(--dsw-alias-label-primary);
}
/* 分组小标题（v0.4.0）：动效卡片内部五组（背景 / 标题 / 鲸鱼 / 输入框 / 帧率）的抬头，
   与卡片标题拉开二级：更小、更淡。 */
.mui-group-title{
  margin:8px 0 2px;font-size:12px;line-height:18px;font-weight:600;letter-spacing:.02em;
  color:var(--dsw-alias-label-secondary);
}
/* 分组之间的分割线（v0.4.0 起只出现在动效卡片内部；卡片之间靠卡片边框分隔）。 */
.mui-divider{
  height:1px;margin:6px 0 2px;border:0;
  background:color-mix(in srgb, var(--dsw-alias-label-primary) 9%, transparent);
}
.mui-row{display:flex;align-items:flex-start;gap:16px;padding:8px 0;min-width:0}
.mui-row-text{display:flex;flex-direction:column;gap:2px;min-width:0;flex:1 1 auto}
.mui-row-label{font-size:13px;line-height:20px;color:var(--dsw-alias-label-primary)}
.mui-row-hint{font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}
.mui-row-control{flex:none;display:flex;align-items:center;gap:8px;padding-top:1px}
.mui-switch{
  position:relative;flex:none;width:34px;height:20px;padding:0;border:0;border-radius:999px;cursor:pointer;
  background:color-mix(in srgb, var(--dsw-alias-label-primary) 18%, transparent);
  transition:background .18s var(--ds-ease-in-out, ease);
}
.mui-switch::after{
  content:"";position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;
  background:var(--dsw-alias-bg-layer-1);box-shadow:0 1px 2px rgba(0,0,0,.18);
  transition:left .18s var(--ds-ease-in-out, ease);
}
.mui-switch[aria-checked="true"]{background:var(--dsw-alias-brand-primary)}
.mui-switch[aria-checked="true"]::after{left:16px}
.mui-switch:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}
.mui-switch:disabled{opacity:.5;cursor:not-allowed}
.mui-range{
  /* 保留原生外观，只统一尺寸与强调色：自绘 track/thumb 在跨浏览器时会踩到样式差异 */
  flex:none;width:132px;height:20px;background:transparent;cursor:pointer;
  accent-color:var(--dsw-alias-brand-primary);
}
.mui-range:disabled{opacity:.5;cursor:not-allowed}
.mui-range:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:4px;border-radius:4px}
.mui-range-value{
  flex:none;min-width:40px;text-align:right;font-variant-numeric:tabular-nums;
  font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary);
}
/* 分段选择（v0.4.0，用于「鲸鱼种类」）。
   自绘成两个并排按钮而不是用 select：选项只有 2 个，按钮一眼可见当前值，
   且 aria-pressed 的读屏语义比 select 更贴近「在这几个里选一个」。 */
.mui-seg{flex:none;display:flex;gap:6px;flex-wrap:wrap}
.mui-seg-item{
  border:1px solid var(--dsw-alias-border-l2);background:transparent;cursor:pointer;
  color:var(--dsw-alias-label-primary);border-radius:8px;padding:3px 12px;
  font-size:12px;line-height:18px;font-family:inherit;
  transition:background .15s var(--ds-ease-in-out, ease);
}
.mui-seg-item:hover{background:color-mix(in srgb, var(--dsw-alias-label-primary) 7%, transparent)}
.mui-seg-item[aria-pressed="true"]{
  background:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary);color:#fff;
}
.mui-seg-item:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}
.mui-seg-item:disabled{opacity:.5;cursor:not-allowed}
/* 两列数字输入网格（v0.4.0，鲸鱼的 11 个数值项）。
   为什么不用 .mui-row：11 条单列行会把设置页拉得很长，而这些都是「一个数」的短参数，
   两列并排更省纵向空间。minmax(220px,1fr) 让窄窗口自动折成一列。 */
.mui-numgrid{
  /* v0.4.0：固定两列（与最初选「数字输入框」时的两列排布一致）。
     之前是 auto-fit，卡片不限宽后宽窗口会排到 3–4 列，与既定排布不符。
     minmax(0,1fr) 保证长标签不会把列撑破（标签另有 ellipsis）。 */
  display:grid;grid-template-columns:repeat(2,minmax(0,1fr));
  gap:4px 24px;padding:2px 0 4px;
}
/* 极窄视口下折成单列：两列会把标签与输入框挤在一起。 */
@media (max-width:560px){.mui-numgrid{grid-template-columns:1fr}}
.mui-num{display:flex;align-items:center;justify-content:space-between;gap:12px;min-width:0;padding:4px 0}
.mui-num-label{
  font-size:13px;line-height:20px;color:var(--dsw-alias-label-primary);
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
}
.mui-num-input{
  flex:none;width:88px;height:26px;padding:0 8px;border-radius:8px;
  border:1px solid var(--dsw-alias-border-l2);background:transparent;
  color:var(--dsw-alias-label-primary);font-family:inherit;font-size:12px;line-height:24px;
  font-variant-numeric:tabular-nums;text-align:right;
}
.mui-num-input:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
.mui-num-input:disabled{opacity:.5;cursor:not-allowed}
.mui-note{
  display:flex;gap:8px;align-items:flex-start;margin:0;padding:8px 10px;border-radius:8px;
  font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary);
  background:color-mix(in srgb, var(--dsw-alias-label-primary) 5%, transparent);
}.mui-note[data-tone="warn"]{
  color:var(--dsw-alias-state-warn-primary);
  background:color-mix(in srgb, var(--dsw-alias-state-warn-primary) 12%, transparent);
}
.mui-footer{display:flex;align-items:center;gap:10px;padding-top:4px}
.mui-button{
  flex:none;border:1px solid var(--dsw-alias-border-l2);background:transparent;cursor:pointer;
  color:var(--dsw-alias-label-primary);border-radius:8px;padding:3px 12px;font-size:12px;line-height:18px;
  font-family:inherit;transition:background .15s var(--ds-ease-in-out, ease);
}
.mui-button:hover{background:color-mix(in srgb, var(--dsw-alias-label-primary) 7%, transparent)}
.mui-button:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}
.mui-toast{font-size:12px;line-height:18px;color:var(--dsw-alias-state-success-primary)}
@media (prefers-reduced-motion: reduce){
  [data-mui-field],[data-mui-field] > canvas,.mui-switch,.mui-switch::after,.mui-button{transition:none}
}
`;

/** 把样式表挂到文档里，返回移除函数。 */
export function installStyles(documentRef) {
  const doc = documentRef;
  const existing = doc.querySelector(`style[${STYLE_ATTR}="${STYLE_ID}"]`);
  if (existing) return () => existing.remove();
  const tag = doc.createElement('style');
  tag.setAttribute(STYLE_ATTR, STYLE_ID);
  tag.textContent = CSS;
  doc.head.append(tag);
  return () => tag.remove();
}
