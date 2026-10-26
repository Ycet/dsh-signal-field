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

test('默认: 标题与背景速度都是 1×（等于不做任何缩放的原观感）', () => {
  const state = defaults();
  assert.equal(state.title.speed, 1);
  assert.equal(state.background.speed, 1);
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
  assert.equal(normalize({ title: { speed: 1.25 } }).title.speed, 1.25);
  assert.equal(normalize({ title: { speed: 1.1 } }).title.speed, 1);
  assert.equal(normalize({ title: { speed: 0.1 } }).title.speed, SPEED_RANGE.min);
  assert.equal(normalize({ background: { speed: 9 } }).background.speed, SPEED_RANGE.max);
  assert.equal(normalize({ background: { speed: '1.5' } }).background.speed, 1);
});

test('patch: 标题速度与背景速度互不影响', () => {
  const base = defaults();
  const titleOnly = patch(base, { title: { speed: 2 } });
  assert.equal(titleOnly.title.speed, 2);
  assert.equal(titleOnly.background.speed, 1);

  const bgOnly = patch(base, { background: { speed: 0.5 } });
  assert.equal(bgOnly.background.speed, 0.5);
  assert.equal(bgOnly.title.speed, 1);

  // 不传 speed 时保持原值，不被默认值悄悄覆盖
  const kept = patch(titleOnly, { title: { idle: false } });
  assert.equal(kept.title.speed, 2);
});

test('兼容: 没有 speed 的旧存档读出 1×，且不影响其余字段', () => {
  const legacy = {
    version: 2,
    enabled: true,
    pages: { hero: true, chat: true },
    title: { idle: true, interact: true },
    background: { idle: true, interact: true, intensity: 0.55, fps: 45, speed: 0.5 },
    glass: { enabled: true, blur: 14 },
  };
  // 只删掉 speed 两个键，模拟 v0.2.11 及更早的存档
  const stripped = {
    ...legacy,
    title: { idle: true, interact: true },
    background: { idle: true, interact: true, intensity: 0.55, fps: 45 },
  };
  const state = normalize(stripped);
  assert.equal(state.title.speed, 1);
  assert.equal(state.background.speed, 1);
  // 手调过的强度与帧率必须原样保留
  assert.equal(state.background.intensity, 0.55);
  assert.equal(state.background.fps, 45);
});
