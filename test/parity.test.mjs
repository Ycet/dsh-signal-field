/**
 * 跨区域视觉一致性（v0.2.2）
 *
 * 锁住几件事，都是实际报障后补的：
 *   1. 右栏的信号场必须压在与内容区同源的底色上（v0.2.4 已整体移除右栏能力，规则随之删除）。
 *   2. 底部遮挡只能由座位自己的 ::before 背衬承担：不能挂在滚动容器/消息容器上（那会把座位
 *      或消息一起渐隐），也不能是叠在座位子元素之上的层（那会糊掉状态栏文字）（v0.2.5）。
 *   3. HUD 补场必须与面板同层、铺到视口右下角，否则面板下方露出一块纯白（v0.2.5）。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { CSS } from '../src/styles.js';

/** 把样式文本拆成「选择器 / 声明块」序列（只处理本插件用到的扁平结构）。 */
function blocks(css) {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
  return [...clean.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
    selector: m[1].trim(),
    body: m[2],
  }));
}

test('parity: body 上快照内容区底色与底部遮罩色', () => {
  const body = blocks(CSS).find((block) => /^html\[data-mui-scope\] body$/.test(block.selector));
  assert.ok(body, '缺少 body 上的基底快照规则');
  assert.match(
    body.body,
    /--mui-surface-base:\s*var\(--dsw-alias-bg-base\)/,
    '底色快照必须取自 --dsw-alias-bg-base',
  );
  assert.match(
    body.body,
    /--mui-seat-scrim:\s*color-mix\(in srgb,\s*var\(--mui-field-bg\)/,
    '遮罩色应由场的底色混出来',
  );
  assert.match(body.body, /var\(--mui-surface-base\)/, '遮罩色应混入同源底色');
});

test('parity: 右侧边栏动效背景已整体移除', () => {
  // v0.2.4：作用范围不再包含右侧边栏，CSS 里不应残留任何右栏选择器。
  const leftovers = blocks(CSS)
    .map((block) => block.selector)
    .filter((sel) => /rightbar/i.test(sel) || /data-mui-field-side/.test(sel));
  assert.deepEqual(leftovers, [], '仍残留右侧边栏相关选择器');
});

test('parity: 底部遮挡只由座位自己的 ::before 背衬承担，且只盖信息行那一条', async () => {
  // 三版教训连起来看：任何叠在座位子元素之上的层（v0.2.2 底色带 / v0.2.3 ::after 模糊）都会糊掉
  // 状态栏文字、盖住展开的提问卡片；v0.2.4 把 mask 挂在滚动容器上又把整条座位一起渐隐，
  // 并且 mask 建立的 backdrop root 让输入框玻璃失效。v0.2.5 只能让座位自己背衬：
  // ::before + z-index:-1，永远位于卡片与状态栏文字之下。
  const seatOverlays = blocks(CSS).filter(
    (block) => /composer-seat]:?:?:?after/.test(block.selector) && /position:absolute/.test(block.body),
  );
  assert.deepEqual(seatOverlays.map((b) => b.selector), [], '座位不得挂任何覆盖层（羽化做在 ::before 自己的上沿）');
  const shades = blocks(CSS).filter((block) => /seat-shade/.test(block.selector));
  assert.deepEqual(shades.map((b) => b.selector), [], '不应存在 seat-shade 覆盖层');

  // mask 只允许用在「座位背衬的上沿羽化」上：v0.2.4 把它挂在滚动容器上导致整条座位渐隐、
  // 输入框玻璃还采样不到背后的场，那一类写法永远不许回来。
  const masks = blocks(CSS).filter((block) => /mask-image/.test(block.body));
  assert.ok(masks.length >= 1, '缺少背衬上沿的 mask');
  for (const block of masks) {
    assert.match(
      block.selector,
      /composer-seat]\s*::before$/,
      `mask 只允许用于座位背衬的上沿羽化，实际：${block.selector}`,
    );
  }

  const seat = blocks(CSS).find(
    (block) => /\[data-composer-seat\]::before$/.test(block.selector) && /backdrop-filter/.test(block.body),
  );
  assert.ok(seat, '缺少座位背衬规则');
  assert.match(seat.selector, /\[data-mui-active\]/, '受动效开关控制');
  assert.match(seat.selector, /data-content-phase="active"/, '只在聊天页生效');
  assert.match(seat.body, /z-index:-1/, '背衬必须压在座位子元素之下');
  assert.match(seat.body, /position:absolute/, '背衬必须是绝对定位的伪元素');
  assert.match(seat.body, /var\(--mui-seat-scrim\)/, '压色应取自场底色混出的 --mui-seat-scrim');

  // v0.2.7：背衬只能覆盖「输入框下方信息行」那一条。
  // 铺满整条座位时 backdrop-filter 会把抖动的细颗粒平均成平滑浅灰，
  // 整条输入框区域都看着像「没有动效背景」；卡片采到的也变成糊过的场。
  assert.doesNotMatch(seat.body, /inset:0/, '座位背衬不得铺满整条座位');
  assert.match(seat.body, /bottom:0/, '背衬应贴住座位底边');
  assert.match(seat.body, /height:var\(--mui-seat-band-h/, '背衬高度应来自实测的信息行高度');
  const band = await readFile(new URL('../src/stage.js', import.meta.url), 'utf8');
  assert.match(band, /--mui-seat-band-h/, '必须写入 --mui-seat-band-h');
  assert.match(
    band,
    /seat\.getBoundingClientRect\(\)\.bottom - card\.getBoundingClientRect\(\)\.bottom/,
    '条带高度应量「卡片底边到座位底边」这一段',
  );

  // 座位自己必须建立层叠上下文，否则 z-index:-1 会掉到消息之下、遮不住消息
  const iso = blocks(CSS).find(
    (block) => /\[data-composer-seat\]$/.test(block.selector) && /isolation:isolate/.test(block.body),
  );
  assert.ok(iso, '座位需要 isolation:isolate 才能让负 z 背衬遮住消息');
});

test('parity: 底部信息栏背衬的上沿羽化，模糊与压色一起渐隐', () => {
  // v0.5.2：输入框下方这条纯色背衬（状态栏底板）与上方动效背景之间原本是一条硬边——
  // 场里的颗粒在边界上被切断。羽化必须做在**背衬自己的上沿**（蓝框位置），而不是卡片上方：
  // 卡片上方那条带子在实机上表现为一条比卡片更宽的浅色横带（v0.5.2 初版踩过）。
  const seat = blocks(CSS).find(
    (block) =>
      /\[data-composer-seat\]::before$/.test(block.selector) && /backdrop-filter/.test(block.body),
  );
  assert.ok(seat, '缺少座位背衬规则');
  // 羽化高度按条带高度取，避免把状态栏小字泡进半透明区
  assert.match(seat.body, /--mui-seat-feather:min\(20px, calc\(var\(--mui-seat-band-h/, '羽化高度应按条带高度取上限');
  // 关键：mask 同时作用于模糊结果与底色。只渐变背景色时 backdrop-filter 仍会在边界处
  // 突然出现（它不受 background 透明度影响），那正是 v0.5.1 之前 8px 渐变仍显生硬的原因。
  assert.match(seat.body, /mask-image:linear-gradient\(to bottom/, '羽化必须靠 mask，且方向是从上往下渐显');
  assert.match(seat.body, /transparent 0,/, '上沿必须从全透明起步');
  assert.match(seat.body, /#000 100%/, '下沿必须是满强度（状态栏文字要清楚）');
  // 底色必须是实色 + mask，而不是「自己再写一条渐变」：两边都渐变会在中段乘出亮度塌陷
  assert.match(
    seat.body,
    /background:color-mix\(in srgb, var\(--mui-seat-scrim\) 94%, transparent\)/,
    '底色应为实色（透明度交给 mask）',
  );
  assert.doesNotMatch(seat.body, /background:linear-gradient/, '底色不得再写成渐变');
  // 掩膜不可用 / 没有 backdrop-filter 时的两条退路都要在
  const fallback = blocks(CSS).find(
    (block) => /\[data-composer-seat\]::before$/.test(block.selector) && /linear-gradient\(180deg/.test(block.body),
  );
  assert.ok(fallback, '缺少 mask 不可用时的渐变兜底');
});

test('parity: 座位仍然保留下推透明，场不会被白底盖住', () => {
  const push = blocks(CSS).find((block) =>
    /^html\[data-mui-active\] \[data-composer-seat\]$/.test(block.selector),
  );
  assert.ok(push, '缺少座位上的 token 下推规则');
  assert.match(push.body, /--dsw-alias-bg-base:\s*transparent/);
});

test('parity: HUD 补场图层压在页面内容之上、面板之下', () => {
  const hud = blocks(CSS).find((block) => /\[data-mui-field\]\[data-mui-field-hud\]$/.test(block.selector));
  assert.ok(hud, '缺少 HUD 补场图层的定位覆盖规则');
  // 补场是 fixed 悬浮层，位置由 JS 按面板矩形写内联样式；若沿用 inset:0 会铺满整个视口
  assert.match(hud.body, /position:\s*fixed/, 'HUD 补场必须是 fixed 悬浮层');
  assert.match(hud.body, /inset:\s*auto/, 'HUD 补场必须让掉 inset:0');
  // v0.2.4 用 z-index:-1 挂在 body 上，被外壳自己的不透明底色整个盖住，
  // 面板玻璃只能模糊到白、面板下方露出外壳白底。补场必须与面板同层（z-index:0）。
  assert.doesNotMatch(hud.body, /z-index:\s*-1/, 'HUD 补场不得使用负 z-index');
  assert.match(hud.body, /z-index:\s*0/, 'HUD 补场应与面板同层、排在面板之前');
});

test('parity: HUD 补场按面板所在侧取带子，且不压进内容区', async () => {
  const source = await readFile(new URL('../src/stage.js', import.meta.url), 'utf8');
  assert.match(source, /parent\.insertBefore\(hudBackdropEl, panel\)/, '补场必须插在面板之前');
  // v0.5.2：几何计算抽成纯函数 resolveHudStrip()，由 placeHudBackdrop 调用
  assert.match(source, /function resolveHudStrip/, '几何计算应抽成可单测的纯函数');
  assert.match(source, /resolveHudStrip\(\{/, 'placeHudBackdrop 必须走纯函数');
  // 右侧停靠：带子右缘铺到视口边；上缘对齐内容区上沿（高出一截会在顶栏浮出带硬边的补丁）。
  assert.match(source, /right = viewportWidth/, '右侧带子应铺到视口右缘');
  assert.match(source, /height = Math\.max\(0, viewportHeight - top\)/, '带子高度应铺到视口底部');
  assert.match(source, /Math\.min\(box\.top, panel\.top\)/, '上缘应与内容区上沿对齐');
  // 侧别用「贴住内容区哪条边」判定，而不是「面板是否伸出内容区」：
  // awesome-hud 左停靠会把正文向右让位，面板左缘与内容区左缘齐平，「伸出」恒为 false。
  assert.match(source, /panel\.left <= box\.left \+ 2/, '左贴边判定：面板左缘贴住（或越过）内容区左缘');
  assert.match(source, /panelRight >= box\.right - 2/, '右贴边判定：面板右缘贴住内容区右缘');
  assert.doesNotMatch(source, /panelRight > box\.right \+ 2\) side = "right"/, '不得再用「伸出内容区」作为唯一判据');
  // 左右两条带子都不得压进内容区的正文区域
  assert.match(source, /left = clamp\(box \? box\.right : panel\.left - pad/, '右侧带子左缘取内容区右缘');
  assert.match(source, /Math\.max\(panelRight, box\.left\)/, '左侧带子右缘取 max(面板右缘, 内容区左缘)');
  // 左侧停靠时用侧栏右缘作左界：场不能盖住侧栏（会话列表），否则列表会被整块藏起来。
  assert.match(source, /\[data-slot="sidebar"\]/, '左停靠需要读侧栏右缘');
  assert.match(source, /Math\.min\(panel\.left, sidebarEdge\)/, '左界不得越过面板自身左缘');
});

test('parity: HUD 补场自带不透明同源底色，不与内容区的场叠加', () => {
  const hud = blocks(CSS).find((block) => /\[data-mui-field\]\[data-mui-field-hud\]$/.test(block.selector));
  assert.ok(hud, '缺少 HUD 补场图层的定位规则');
  // 补场画在内容区之上；自身透明时与内容区的场重叠就会叠成两层场（更密更暗）。
  assert.match(hud.body, /background:\s*var\(--mui-surface-base\)/, '补场必须自带同源不透明底色');
});

test('parity: 会话内视图（轨迹 / 统计）的不透明底色必须被清掉', () => {
  // 轨迹视图有三层自带 background: var(--dsw-alias-bg-layer-1)：视图根、分栏容器、表格本体。
  // 少清一层都看不到信号场，所以这里逐条钉住。
  const scope = '[data-conversation-content]';
  const root = '[data-conversation-composer-overlay]';
  const rules = blocks(CSS).filter((block) => block.body.includes('background-color:transparent'));
  const matches = (needle) => rules.some((block) => block.selector.includes(needle));

  assert.ok(
    rules.some((block) => block.selector.includes(scope) && block.selector.includes(root)),
    '缺少「会话视图根透明」规则',
  );
  assert.ok(matches(':has(> [data-trajectory-scroll])'), '缺少「轨迹分栏容器透明」规则');
  assert.ok(
    rules.some((block) => block.selector.includes(root) && block.selector.includes(' table')),
    '缺少「轨迹表格透明」规则',
  );
  for (const block of rules) {
    if (!block.selector.includes(root)) continue;
    assert.doesNotMatch(block.body, /(?:^|[;\s])background\s*:/, '只用 background-color，避免覆盖视图自定义背景');
    // v0.5.1：这组规则与内容容器那组同挂 data-mui-active，而该属性已扩成
    // 「信号场或鲸鱼在跑」——只开鲸鱼时视图底色也必须被清掉，否则鲸鱼被整片盖住。
    assert.match(block.selector, /\[data-mui-active\]/, '视图透明规则应受「有任意动效图层」控制');
  }
});

test('parity: data-mui-active 由「信号场或鲸鱼」共同决定，只开鲸鱼时也生效', async () => {
  // 这一条防的是「设置里鲸鱼开着，但聊天页/轨迹页看不到鲸鱼」：
  // 内容容器、座位与视图根的底色都靠 data-mui-active 清掉；
  // 若该属性只跟背景开关走，只开鲸鱼时这些底色会回来把鲸鱼盖住。
  const stage = await readFile(new URL('../src/stage.js', import.meta.url), 'utf8');
  assert.match(
    stage,
    /setFlag\(root, "data-mui-active", fieldWanted\(state\) \|\| whaleWanted\(state\)\)/,
    'data-mui-active 必须由信号场与鲸鱼共同决定',
  );
  // 写入点必须唯一：syncField 仍会自己清这个属性的话，两个写者会互相覆盖。
  assert.doesNotMatch(
    stage,
    /doc\.documentElement\.removeAttribute\("data-mui-active"\)/,
    '背景路径不应再单独清掉 data-mui-active',
  );
  // 样式层依赖该属性的三组规则必须都在（内容容器 / 视图底色 / 座位背衬）
  const css = await readFile(new URL('../src/styles.js', import.meta.url), 'utf8');
  const gated = [...css.matchAll(/html\[data-mui-active\][^{]*\{([^{}]*)\}/g)].map((m) => m[0]);
  assert.ok(
    gated.some((block) => block.includes('[data-conversation-composer-overlay]')),
    '视图底色规则应受 data-mui-active 控制',
  );
  assert.ok(
    gated.some((block) => block.includes('[data-composer-seat]::before')),
    '座位背衬规则应受 data-mui-active 控制',
  );
});
