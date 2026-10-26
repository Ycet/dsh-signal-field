/**
 * 同步合并窗口测试（v0.2.11）
 *
 * 流式输出时 `body` 的 childList 每帧都在变，而 `sync()` 里有 5~8 次布局读。
 * `resolveSyncCoalesce` 决定这次同步「现在跑」还是「再等一会」，是本轮顺滑优化的核心判定。
 * 它被抽成纯函数，就是为了能在没有 DOM 的环境里锁住两条通道的分界：
 * urgent（页面/主题/设置/resize）必须立刻同步，否则图层会晚一拍才出现。
 */

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { resolveSyncCoalesce } from '../src/stage.js';

test('resolveSyncCoalesce: urgent 永远立刻同步', () => {
  // 即使刚同步过 1ms，页面切换也必须马上生效
  const decision = resolveSyncCoalesce({ urgent: true, now: 1001, lastSyncAt: 1000 });
  assert.equal(decision.run, true);
  assert.equal(decision.waitMs, 0);
});

test('resolveSyncCoalesce: 首屏从未同步过时立刻同步', () => {
  assert.equal(resolveSyncCoalesce({ now: 500, lastSyncAt: 0 }).run, true);
});

test('resolveSyncCoalesce: relaxed 在窗口内延后，并给出剩余毫秒', () => {
  const decision = resolveSyncCoalesce({ now: 1030, lastSyncAt: 1000, window: 120 });
  assert.equal(decision.run, false);
  assert.equal(decision.waitMs, 90);
});

test('resolveSyncCoalesce: relaxed 到达窗口立刻同步', () => {
  const decision = resolveSyncCoalesce({ now: 1120, lastSyncAt: 1000, window: 120 });
  assert.equal(decision.run, true);
  assert.equal(decision.waitMs, 0);
});

test('resolveSyncCoalesce: 默认窗口 120ms，非法 window 回落默认', () => {
  assert.equal(resolveSyncCoalesce({ now: 1100, lastSyncAt: 1000 }).run, false, '100ms 未到 120ms');
  assert.equal(resolveSyncCoalesce({ now: 1120, lastSyncAt: 1000 }).run, true);
  for (const bad of [undefined, null, NaN, -5, 'x']) {
    assert.equal(
      resolveSyncCoalesce({ now: 1119, lastSyncAt: 1000, window: bad }).run,
      false,
      `非法 window=${String(bad)} 应回落 120ms`,
    );
  }
});

test('resolveSyncCoalesce: 非法输入不抛错', () => {
  for (const input of [undefined, null, 1, 'x', []]) {
    assert.doesNotThrow(() => resolveSyncCoalesce(input));
  }
});

/**
 * 通道分工的源码级守卫。
 *
 * 这一轮的顺滑优化全靠「哪条触发走 urgent、哪条走 relaxed」的正确分工，
 * 而分工写在 install() 的四个订阅点上，纯函数测试碰不到。
 * 一旦有人把某条改回无脑 schedule(false)，切页/主题/设置就会晚一拍生效，
 * 而功能测试全绿、肉眼才看得出——所以这里直接把分工钉住。
 */
test('接线: 关键触发必须走 urgent，流式 childList 必须先判页面再定通道', async () => {
  const source = await readFile(new URL('../src/stage.js', import.meta.url), 'utf8');

  // 设置变更、resize、可见性：必须立刻同步
  assert.match(source, /store\.subscribe\(\(\) => schedule\(true\)\)/, '设置变更应走 urgent');
  assert.match(source, /on\(window, "resize", \(\) => schedule\(true\)\)/, 'resize 应走 urgent');
  assert.match(
    source,
    /on\(document, "visibilitychange", \(\) => schedule\(true\)\)/,
    '可见性变化应走 urgent',
  );

  // 流式 childList：不能写成固定的 schedule(false)，必须先判页面是否真的变了
  assert.doesNotMatch(
    source,
    /subtree: true \}, \(\) => schedule\(false\)\)/,
    'childList 不得固定走 relaxed：页面切换也走这条通道',
  );
  assert.match(
    source,
    /schedule\(resolvePage\(\) !== page\)/,
    'childList 应先比对页面，变了就升为 urgent',
  );
});
