/**
 * 标题动画速度的实现约束（v0.3.0）
 *
 * 标题引擎依赖 Canvas2D，在 node 里无法真正实例化（`document` 不存在），
 * 所以这里用**源码契约断言**兜住两条最容易被改坏、且改坏后很难靠肉眼发现的约束：
 *
 *   1. 扫光位置必须来自 `runnerPhase` 累加器，而不是 `pulse × 倍率`。
 *      后者在拖动滑块的瞬间会让扫光点整体瞬移（相位被重新乘了一遍）。
 *   2. `setSpeed` 里不得出现 `drawStatic` / `resize`。
 *      refresh() 会重烘字形贴图，若速度改走那条路径，拖滑块时标题会闪、甚至看起来像重新挂载。
 *
 * 这些是「实现方式」的护栏，不是观感验收——快慢是否合意仍需要人看屏幕。
 */

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const SOURCE = await readFile(new URL('../src/techtext.js', import.meta.url), 'utf8');

test('标题: 扫光位置来自 runnerPhase 累加器（改倍率不跳位）', () => {
  assert.match(SOURCE, /let runnerPhase = 0;/, '缺少 runnerPhase 累加器');
  assert.match(
    SOURCE,
    /const head = \(runnerPhase \* 0\.42 \+ runner \* 0\.5\) \* perimeter;/,
    '扫光头部必须由 runnerPhase 推出',
  );
  // 旧写法：把倍率直接乘进 pulse，改倍率时会跳位
  assert.doesNotMatch(
    SOURCE,
    /const head = \(pulse \* 0\.42 \* source\.speed/,
    '不得回退到 pulse × speed 的写法',
  );
});

test('标题: 累加器按「内在基准 speed × 用户倍率」推进', () => {
  assert.match(SOURCE, /runnerPhase \+= dt \* source\.speed \* source\.speedFactor;/);
});

test('标题: 1× 时累加器与旧的 pulse×speed 完全等价（零观感回归）', () => {
  // 这条不测生产代码，而是把「等价」这个验收前提算一遍并留档：
  // 旧式 = pulse × speed；新式 = Σ(dt × speed × factor)，factor = 1 时两者必须相等。
  const dt = 1 / 60;
  const speed = 0.9;
  let pulse = 0;
  let runnerPhase = 0;
  for (let index = 0; index < 600; index += 1) {
    pulse += dt;
    runnerPhase += dt * speed * 1;
  }
  assert.ok(Math.abs(runnerPhase - pulse * speed) < 1e-9, '1× 时必须与旧观感一致');
});

test('标题: setSpeed 存在，且不触发重烘焙', () => {
  assert.match(SOURCE, /setSpeed\(value\) \{/, '引擎需提供 setSpeed 轻量入口');

  const start = SOURCE.indexOf('setSpeed(value) {');
  assert.ok(start > 0, '找不到 setSpeed 实现');
  // 只取到方法体结尾（下一个成员之前的 `},`），否则会把相邻的 redraw: drawStatic 也吞进来。
  const end = SOURCE.indexOf('\n    },', start);
  assert.ok(end > start, '无法界定 setSpeed 方法体');
  const body = SOURCE.slice(start, end);
  assert.doesNotMatch(body, /drawStatic/, 'setSpeed 不得重烘焙字形贴图');
  assert.doesNotMatch(body, /resize\(\)/, 'setSpeed 不得重算布局');
  assert.match(body, /speedValue\(value\)/, 'setSpeed 必须走统一的倍率钳位');
});

test('标题: 降级桩也暴露 setSpeed，保证接口一致', () => {
  // Canvas2D 不可用时返回的桩对象若缺 setSpeed，stage 的 syncTitle 会直接抛错。
  assert.match(
    SOURCE,
    /return \{ refresh\(\) \{\}, setSpeed\(\) \{\}, destroy\(\)/,
    '降级返回的桩对象必须与正常返回的接口一致',
  );
});

test('标题: 三个速度相关时间常数走 scaleTau，不再是写死的字面量', () => {
  assert.match(SOURCE, /scaleTau\(TAU_PRESENCE, source\.speedFactor\)/, '揭示镜头需按倍率缩放');
  assert.match(SOURCE, /scaleTau\(TAU_OUTLINE, source\.speedFactor\)/, '悬停转虚线需按倍率缩放');
  assert.match(SOURCE, /scaleTau\(TAU_FRAME, source\.speedFactor\)/, '选框淡入需按倍率缩放');
  // 刻意不缩放的两组：指针跟随与拖拽，必须仍是字面量（防止有人顺手全改）
  assert.match(SOURCE, /const lag = pointer\.inside \? 0\.05 : 0\.22;/, '指针跟随不应随速度变化');
  assert.match(SOURCE, /glyph\.offset\.x, pointer\.x - grab\.x, dt, 0\.03\)/, '拖拽不应随速度变化');
});

test('标题: 默认倍率为 1（未传参时不缩放）', () => {
  assert.match(SOURCE, /speedFactor: 1,/);
});
