/**
 * HUD 补场几何单测（v0.5.2）
 *
 * 补场存在的唯一理由是「给面板玻璃一片真实的场去模糊」，所以它必须落在面板所在的那一侧。
 * v0.5.1 及之前这里硬编码「left = 内容区右缘、width 铺到视口右缘」，
 * 面板一旦被停靠到左侧，补场要么落在面板对面那条空缝里、要么宽度为 0 直接不显示——
 * 表现就是「HUD 面板在左边时，面板背后没有动效背景」。
 *
 * 真值表全部在这条纯函数上钉死：node 里不建 DOM 也能验证左右两侧的边界，
 * 这正是把它从 placeHudBackdrop 里抽出来的原因。
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveHudStrip } from '../src/stage.js';

/** 一段典型的桌面端几何：侧栏 0–480、会话内容区 1015–2672、视口 2672×1569。 */
const VIEWPORT = { viewportWidth: 2672, viewportHeight: 1569 };
const CONTENT = { left: 1015, top: 60, right: 2672, width: 1657, height: 1509 };
const SIDEBAR_RIGHT = 480;

/** 一块面板矩形（带 right，与 getBoundingClientRect 的返回形状一致）。 */
function panelOf(left, width, top = 60, height = 1400) {
  return { left, top, width, height, right: left + width, bottom: top + height };
}

test('补场: 面板停在右侧时，带子从内容区右缘铺到视口右缘', () => {
  // 内容区没有铺到视口右缘（右栏存在）时才会出现可铺的带子。
  const box = { left: 1015, top: 60, right: 2400, width: 1385, height: 1509 };
  const strip = resolveHudStrip({
    panel: panelOf(2430, 220),
    box,
    sidebarRight: SIDEBAR_RIGHT,
    ...VIEWPORT,
  });
  assert.equal(strip.side, 'right');
  assert.equal(strip.left, 2400, '左缘贴住内容区右缘，绝不压进内容区');
  assert.equal(strip.left + strip.width, 2672, '右缘铺到视口边，避免硬边补丁');
  assert.equal(strip.top, 60, '上缘与内容区上沿对齐');
  assert.equal(strip.top + strip.height, 1569, '下缘铺到视口底部');
});

test('补场: 面板停在左侧时，带子铺在内容区左侧而不是右侧（v0.5.2 的核心修复）', () => {
  const strip = resolveHudStrip({
    panel: panelOf(510, 500),
    box: CONTENT,
    sidebarRight: SIDEBAR_RIGHT,
    ...VIEWPORT,
  });
  assert.equal(strip.side, 'left');
  assert.equal(strip.left, SIDEBAR_RIGHT, '左界取侧栏右缘：不得用场盖住侧栏（会话列表）');
  assert.equal(strip.left + strip.width, CONTENT.left, '右界贴住内容区左缘，不压进内容区');
  assert.equal(strip.width, 535, '覆盖侧栏与内容区之间的整条缝');
  assert.ok(strip.width > 2, '必须有实际宽度，否则面板背后又没场了');
});

test('补场: 左侧停靠时面板与侧栏之间有空缝也一并铺上', () => {
  // 面板没有紧贴侧栏（510 开始），带子仍从侧栏右缘 480 起——中间 30px 不能留白缝。
  const strip = resolveHudStrip({
    panel: panelOf(510, 400),
    box: CONTENT,
    sidebarRight: SIDEBAR_RIGHT,
    ...VIEWPORT,
  });
  assert.equal(strip.left, SIDEBAR_RIGHT);
  assert.ok(strip.left < 510, '带子应覆盖面板左侧那段空缝');
});

test('补场: 左停靠且正文让位（面板左缘与内容区左缘齐平）时仍要铺', () => {
  // dsh-awesome-hud 0.18+ 左停靠会把正文向右让位，于是面板左缘常与内容区左缘齐平：
  // 「面板是否伸出内容区」在这种布局下恒为 false，v0.5.2 初版因此整条不铺。
  const strip = resolveHudStrip({
    panel: { left: 260, top: 12, width: 297, height: 1500, right: 557 },
    box: { left: 260, top: 60, right: 2672, width: 2412, height: 1509 },
    sidebarRight: 260,
    ...VIEWPORT,
  });
  assert.equal(strip.side, 'left');
  assert.equal(strip.left, 260, '左界贴着侧栏右缘，不越过侧栏');
  assert.equal(strip.width, 297, '只铺面板自己那一段，不越过内容区的场');
  assert.equal(strip.top, 12, '上缘取面板与内容区上沿的较小值');
  assert.equal(strip.top + strip.height, 1569, '下缘铺到视口底部（面板下方不留纯白）');
});

test('补场: 面板被拖到侧栏上方时，左界退回面板自身左缘，不铺满侧栏', () => {
  const strip = resolveHudStrip({
    panel: panelOf(140, 300),
    box: CONTENT,
    sidebarRight: SIDEBAR_RIGHT,
    ...VIEWPORT,
  });
  assert.equal(strip.side, 'left');
  assert.equal(strip.left, 140, '面板压在侧栏上时，只铺面板自身那一段');
});

test('补场: 拿不到侧栏时退回面板左缘，宁可少铺也不越界', () => {
  const strip = resolveHudStrip({
    panel: panelOf(510, 500),
    box: CONTENT,
    sidebarRight: 0,
    ...VIEWPORT,
  });
  assert.equal(strip.left, 510);
  assert.equal(strip.left + strip.width, CONTENT.left);
});

test('补场: 内容区铺满视口（左右都没有缝）时不铺，避免和内容区的场叠成两层', () => {
  const full = resolveHudStrip({
    panel: panelOf(2660, 300),
    box: { left: 0, top: 60, right: 2672, width: 2672, height: 1509 },
    sidebarRight: 0,
    ...VIEWPORT,
  });
  assert.equal(full.side, 'none');
  assert.equal(full.width, 0);
});

test('补场: 面板浮在内容区中间（两边都不贴边）时不铺', () => {
  const strip = resolveHudStrip({
    panel: panelOf(1500, 400),
    box: CONTENT,
    sidebarRight: SIDEBAR_RIGHT,
    ...VIEWPORT,
  });
  // 既不贴内容区左缘、也不贴右缘：那一带本来就有内容区自己的场，叠上去只会发脏。
  assert.equal(strip.side, 'none');
});

test('补场: 内容区缺失时退回「面板外扩 pad」，仍按面板所在侧取边', () => {
  const strip = resolveHudStrip({
    panel: panelOf(510, 500),
    box: null,
    sidebarRight: SIDEBAR_RIGHT,
    ...VIEWPORT,
    pad: 24,
  });
  assert.equal(strip.side, 'right', '没有内容区时按默认（右侧）处理');
  assert.equal(strip.left, 486, '右侧无内容区时用面板左缘外扩 pad');
});

test('补场: 垃圾输入不抛错，一律返回空带子', () => {
  for (const input of [undefined, null, 0, '', [], {}, { panel: null }]) {
    const strip = resolveHudStrip(input);
    assert.deepEqual(strip, { side: 'none', left: 0, top: 0, width: 0, height: 0 });
  }
});

test('补场: 视口尺寸为零时不铺（首帧/隐藏状态）', () => {
  const strip = resolveHudStrip({
    panel: panelOf(510, 500),
    box: CONTENT,
    sidebarRight: SIDEBAR_RIGHT,
    viewportWidth: 0,
    viewportHeight: 0,
  });
  assert.equal(strip.side, 'none');
});
