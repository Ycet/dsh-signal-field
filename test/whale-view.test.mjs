/**
 * 鲸鱼图层可见性测试（v0.4.0，v0.5.1 起两页都可开）
 *
 * resolveWhaleTarget() 是「总开关 × 当前页总开关 × 当前页鲸鱼开关 × 当前页面」的唯一判定点。
 * 之所以把它单独抽成纯函数，就是为了能在没有 DOM 的情况下把真值表钉死：
 * 任何一处闸门写错，表现都是「明明开着却看不到鲸鱼」或「关掉了还在跑」，
 * 这两种都只能在浏览器里靠肉眼发现，代价太高。
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { PAGE_CHAT, PAGE_HERO, PAGE_NONE, resolveWhaleTarget } from '../src/page.js';

/** 四道闸门全开的最小输入（v0.5.0：页面闸门改名为 pageEnabled）。 */
const ALL_ON = Object.freeze({ page: PAGE_HERO, pageEnabled: true, master: true, whaleEnabled: true });

test('whale-view: 四道闸门全开才显示', () => {
  assert.equal(resolveWhaleTarget(ALL_ON), true);
});

test('whale-view: 任一上级闸门关闭都不显示', () => {
  assert.equal(resolveWhaleTarget({ ...ALL_ON, master: false }), false, '总开关关闭');
  assert.equal(resolveWhaleTarget({ ...ALL_ON, pageEnabled: false }), false, '「新建会话页」总开关关闭');
  assert.equal(resolveWhaleTarget({ ...ALL_ON, whaleEnabled: false }), false, '鲸鱼开关关闭');
});

test('whale-view: 两个会话页都显示，面板页不显示', () => {
  assert.equal(resolveWhaleTarget({ ...ALL_ON, page: PAGE_HERO }), true);
  // v0.5.1：聊天会话页也能开鲸鱼（含「轨迹」「统计」子视图，它们与「对话」共用同一内容面）
  assert.equal(resolveWhaleTarget({ ...ALL_ON, page: PAGE_CHAT }), true, '聊天会话页也应铺鲸鱼');
  assert.equal(resolveWhaleTarget({ ...ALL_ON, page: PAGE_NONE }), false, '非会话页面不铺鲸鱼');
  assert.equal(resolveWhaleTarget({ ...ALL_ON, page: undefined }), false);
  assert.equal(resolveWhaleTarget({ ...ALL_ON, page: 'unknown' }), false);
});

test('whale-view: 真值类输入按布尔语义处理，字符串零不算关', () => {
  // 归一化层保证这些键一定是布尔，这里只验证函数本身不做隐式比较
  assert.equal(resolveWhaleTarget({ ...ALL_ON, whaleEnabled: 'yes' }), true);
  assert.equal(resolveWhaleTarget({ ...ALL_ON, whaleEnabled: 0 }), false);
  assert.equal(resolveWhaleTarget({ ...ALL_ON, master: null }), false);
});

test('whale-view: 垃圾输入不抛错，一律视为不显示', () => {
  for (const input of [undefined, null, 0, '', 'hero', [], {}]) {
    assert.equal(resolveWhaleTarget(input), false, `输入 ${JSON.stringify(input)} 应返回 false`);
  }
});
