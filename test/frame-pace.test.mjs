/**
 * 帧预算测试（v0.2.11）
 *
 * `framePaceDecision` 是场引擎里唯一决定「这一帧到底画不画」的地方。
 * 它之所以被抽成纯函数，就是为了能在没有 WebGL / DOM / rAF 的 node 环境里锁住行为：
 * 限帧一旦算错，表现是「动画偶尔停一拍」或「帧率根本没降下来」，两种都很难靠肉眼定位。
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { framePaceDecision } from '../src/field.js';

/** 某个帧率对应的一帧间隔（ms）。 */
const interval = (fps) => 1000 / fps;

test('framePaceDecision: 30fps 上限下 16.7ms 的间隔必须跳帧', () => {
  const decision = framePaceDecision({ now: 1000 + interval(60), lastRenderAt: 1000, fps: 30 });
  assert.equal(decision.render, false, '16.7ms 对 30fps 的 33.3ms 预算来说还太早');
  assert.equal(decision.effectiveFps, 30);
});

test('framePaceDecision: 到达预算就画，差 5ms 不提前画', () => {
  const almost = framePaceDecision({ now: 1000 + interval(30) - 5, lastRenderAt: 1000, fps: 30 });
  assert.equal(almost.render, false);
  const reached = framePaceDecision({ now: 1000 + interval(30), lastRenderAt: 1000, fps: 30 });
  assert.equal(reached.render, true);
});

test('framePaceDecision: 首帧（没有绘制基准）必须画', () => {
  assert.equal(framePaceDecision({ now: 999999, lastRenderAt: 0, fps: 30 }).render, true);
});

test('framePaceDecision: 交互加速期间不限帧', () => {
  const decision = framePaceDecision({ now: 1000.1, lastRenderAt: 1000, fps: 15, boosting: true });
  assert.equal(decision.render, true, '加速期间只过 0.1ms 也要画');
  assert.equal(decision.effectiveFps, 0, '0 表示放开限帧');
});

test('framePaceDecision: 失焦降到 8fps，且不会高于滑块值', () => {
  const stillEarly = framePaceDecision({
    now: 1000 + interval(30),
    lastRenderAt: 1000,
    fps: 30,
    blurred: true,
  });
  assert.equal(stillEarly.effectiveFps, 8);
  assert.equal(stillEarly.render, false, '33ms 对 8fps 的 125ms 预算来说还太早');

  const due = framePaceDecision({
    now: 1000 + interval(8) + 1,
    lastRenderAt: 1000,
    fps: 30,
    blurred: true,
  });
  assert.equal(due.render, true);

  // 滑块本来就低于 8fps 的假设不成立（下限 15），这里锁住「取两者较小」的语义
  const lowCap = framePaceDecision({ now: 1001, lastRenderAt: 1000, fps: 15, blurred: true });
  assert.equal(lowCap.effectiveFps, 8);
});

test('framePaceDecision: 非法 fps 不抛错且回落 30', () => {
  for (const bad of [undefined, null, NaN, Infinity, 'x', {}]) {
    const decision = framePaceDecision({ now: 1000 + interval(30), lastRenderAt: 1000, fps: bad });
    assert.equal(decision.effectiveFps, 30, `非法 fps=${String(bad)} 应回落 30`);
    assert.equal(decision.render, true);
  }
});

test('framePaceDecision: fps 越界被钳到 [15, 60]', () => {
  assert.equal(framePaceDecision({ now: 1, lastRenderAt: 0, fps: 0 }).effectiveFps, 15);
  assert.equal(framePaceDecision({ now: 1, lastRenderAt: 0, fps: 5 }).effectiveFps, 15);
  assert.equal(framePaceDecision({ now: 1, lastRenderAt: 0, fps: 240 }).effectiveFps, 60);
});

test('framePaceDecision: 非法输入整体不抛错', () => {
  for (const input of [undefined, null, 1, 'x', []]) {
    assert.doesNotThrow(() => framePaceDecision(input));
  }
});
