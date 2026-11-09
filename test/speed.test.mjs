/**
 * 动画速度倍率测试（v0.3.0）
 *
 * 「标题动画速度」与「背景动画速度」共用一套倍率语义，全部换算都收敛到这里的三个纯函数。
 * 最危险的一处是 `scaleTau` 的方向：引擎里 techApproach(cur, target, dt, tau) 的 tau 越小越快，
 * 所以「倍率变大」必须让 tau 变小。写反了功能照样能跑，只是滑块往右拖反而更慢——
 * 那种 bug 靠肉眼很难第一时间发现，所以这里用单调性断言钉死。
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  SPEED_RANGE,
  defaults,
  normalize,
  patch,
  scaleStep,
  scaleTau,
  speedValue,
} from '../src/settings.js';

test('速度范围: 0.25×–2×，步长 0.25', () => {
  assert.deepEqual({ ...SPEED_RANGE }, { min: 0.25, max: 2, step: 0.25 });
});

test('默认: 标题与两页背景速度都是 1×（等于不做任何缩放的原观感）', () => {
  const state = defaults();
  assert.equal(state.pages.hero.title.speed, 1);
  assert.equal(state.pages.hero.background.speed, 1);
  assert.equal(state.pages.chat.background.speed, 1);
});

test('speedValue: 非法值回落 1×，越界钳到边界', () => {
  for (const bad of [undefined, null, NaN, Infinity, 'x', {}, []]) {
    assert.equal(speedValue(bad), 1, `非法值 ${String(bad)} 应回落 1`);
  }
  assert.equal(speedValue(0.1), SPEED_RANGE.min);
  assert.equal(speedValue(0), SPEED_RANGE.min);
  assert.equal(speedValue(-3), SPEED_RANGE.min);
  assert.equal(speedValue(5), SPEED_RANGE.max);
  assert.equal(speedValue(1), 1);
  assert.equal(speedValue(0.5), 0.5);
});

test('scaleTau: 1× 恒等；倍率越大时间常数越小（不得写反）', () => {
  assert.equal(scaleTau(0.16, 1), 0.16);
  // 快 → tau 变小；慢 → tau 变大。这一对断言是本轮的防倒置护栏。
  assert.ok(scaleTau(0.16, 2) < scaleTau(0.16, 1), '2× 必须比 1× 更快（tau 更小）');
  assert.ok(scaleTau(0.16, 0.25) > scaleTau(0.16, 1), '0.25× 必须比 1× 更慢（tau 更大）');
});

test('scaleTau: 边界值——2× 减半、0.25× 放大四倍', () => {
  assert.equal(scaleTau(0.16, 2), 0.08);
  assert.equal(scaleTau(0.16, 0.25), 0.64);
  assert.equal(scaleTau(0.09, 2), 0.045);
});

test('scaleStep: 1× 恒等；与倍率成正比', () => {
  const dt = 1 / 60;
  assert.equal(scaleStep(dt, 1), dt);
  assert.ok(Math.abs(scaleStep(dt, 2) - dt * 2) < 1e-12);
  assert.ok(Math.abs(scaleStep(dt, 0.25) - dt * 0.25) < 1e-12);
});

test('scaleTau / scaleStep: 非法入参不抛错，按 1× 处理', () => {
  for (const bad of [undefined, null, NaN, 'x', {}]) {
    assert.doesNotThrow(() => scaleTau(0.16, bad));
    assert.doesNotThrow(() => scaleStep(0.016, bad));
    assert.equal(scaleTau(0.16, bad), 0.16);
    assert.equal(scaleStep(0.016, bad), 0.016);
  }
  // base / amount 非法时不能产生 NaN，否则会污染累加器、把动画冻住
  assert.equal(scaleTau(NaN, 2), 0);
  assert.equal(scaleStep(NaN, 2), 0);
});

test('normalize: 速度按步长吸附并钳位', () => {
  const hero = normalize({
    version: 3,
    pages: { hero: { title: { speed: 1.25 }, background: { speed: 0.1 } } },
  });
  assert.equal(hero.pages.hero.title.speed, 1.25);
  assert.equal(hero.pages.hero.background.speed, SPEED_RANGE.min);

  const chat = normalize({ version: 3, pages: { chat: { background: { speed: 9 } } } });
  assert.equal(chat.pages.chat.background.speed, SPEED_RANGE.max);

  // 非数字回落 1×（两个页面各自独立判定）
  const bad = normalize({
    version: 3,
    pages: {
      hero: { title: { speed: 1.1 }, background: { speed: '1.5' } },
      chat: { background: { speed: '1.5' } },
    },
  });
  assert.equal(bad.pages.hero.title.speed, 1);
  assert.equal(bad.pages.hero.background.speed, 1);
  assert.equal(bad.pages.chat.background.speed, 1);
});

test('patch: 标题速度与背景速度互不影响（含两页之间）', () => {
  const base = defaults();
  const titleOnly = patch(base, { pages: { hero: { title: { speed: 2 } } } });
  assert.equal(titleOnly.pages.hero.title.speed, 2);
  assert.equal(titleOnly.pages.hero.background.speed, 1);
  assert.equal(titleOnly.pages.chat.background.speed, 1);

  const bgOnly = patch(base, { pages: { hero: { background: { speed: 0.5 } } } });
  assert.equal(bgOnly.pages.hero.background.speed, 0.5);
  assert.equal(bgOnly.pages.hero.title.speed, 1);
  assert.equal(bgOnly.pages.chat.background.speed, 1);

  // 改聊天页背景速度不会影响新建会话页
  const chatOnly = patch(base, { pages: { chat: { background: { speed: 0.25 } } } });
  assert.equal(chatOnly.pages.chat.background.speed, 0.25);
  assert.equal(chatOnly.pages.hero.background.speed, 1);

  // 不传 speed 时保持原值，不被默认值悄悄覆盖
  const kept = patch(titleOnly, { pages: { hero: { title: { idle: false } } } });
  assert.equal(kept.pages.hero.title.speed, 2);
});

test('兼容: 旧 v2 存档里的速度与强度不迁移，帧率保留', () => {
  // 模拟 v0.2.11 时代的存档：只有全局 background/title，没有 per-page 结构
  const stripped = {
    version: 2,
    enabled: true,
    pages: { hero: true, chat: true },
    title: { idle: true, interact: true },
    background: { idle: true, interact: true, intensity: 0.55, fps: 45 },
    glass: { enabled: true, blur: 14 },
  };
  const state = normalize(stripped);
  assert.equal(state.pages.hero.title.speed, 1);
  assert.equal(state.pages.hero.background.speed, 1);
  assert.equal(state.pages.chat.background.speed, 1);
  // v0.5.0 升级语义：只有帧率保留，旧强度回默认 30%
  assert.equal(state.pages.hero.background.intensity, 0.3);
  assert.equal(state.frame.fps, 45);
});
