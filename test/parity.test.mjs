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
  const overlays = blocks(CSS).filter(
    (block) => /composer-seat]:?:?:?after/.test(block.selector) || /seat-shade/.test(block.selector),
  );
  assert.deepEqual(overlays.map((b) => b.selector), [], '不应存在叠在座位上的覆盖层');

  // 不许再给滚动容器 / 消息容器挂 mask（v0.2.4 的写法）
  const masks = blocks(CSS).filter((block) => /mask-image/.test(block.body));
  assert.deepEqual(masks.map((b) => b.selector), [], '不应再对滚动容器或消息容器使用 mask');

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

test('parity: HUD 补场对齐内容区那条带子，铺到视口右下角且不压进内容区', async () => {
  const source = await readFile(new URL('../src/stage.js', import.meta.url), 'utf8');
  assert.match(source, /parent\.insertBefore\(hudBackdropEl, panel\)/, '补场必须插在面板之前');
  assert.match(source, /viewportWidth - left/, '补场宽度应铺到视口右缘');
  assert.match(source, /viewportHeight - top/, '补场高度应铺到视口底部');
  // 左缘必须与内容区右缘对齐：压进去会盖住滚动条，也会把两层场叠成一条发脏的竖带。
  assert.match(source, /box\.right/, '补场左缘应对齐内容区右缘');
  // 上缘必须对齐内容区上沿；比内容区高出一截就会在顶栏那片白里浮出一块带硬边的补丁。
  assert.match(source, /Math\.min\(box\.top, rect\.top\)/, '补场上缘应与内容区上沿对齐');
});

test('parity: HUD 补场自带不透明同源底色，不与内容区的场叠加', () => {
  const hud = blocks(CSS).find((block) => /\[data-mui-field\]\[data-mui-field-hud\]$/.test(block.selector));
  assert.ok(hud, '缺少 HUD 补场图层的定位规则');
  // 补场画在内容区之上；自身透明时与内容区的场重叠就会叠成两层场（更密更暗）。
  assert.match(hud.body, /background:\s*var\(--mui-surface-base\)/, '补场必须自带同源不透明底色');
});
