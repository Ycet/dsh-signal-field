import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PAGE_CHAT,
  PAGE_HERO,
  PAGE_NONE,
  VIEW_STATS,
  VIEW_THREAD,
  VIEW_TRAJECTORY,
  resolvePageKind,
  resolvePanelTargets,
  resolveViewKind,
} from '../src/page.js';

/**
 * 页面分类是本插件唯一的作用范围开关：
 * 判定错一次，效果就会跑到插件管理页/自动化任务页上去（本次改动要消除的正是这个行为）。
 */

test('resolvePageKind: 无会话内容面即不在作用范围', () => {
  // 插件管理页、自动化任务页的实测特征就是「没有 [data-conversation-content]」。
  assert.equal(resolvePageKind({ hasConversation: false, phase: null }), PAGE_NONE);
  assert.equal(resolvePageKind({ hasConversation: false, phase: 'hero' }), PAGE_NONE);
  assert.equal(resolvePageKind({ hasConversation: 0, phase: 'active' }), PAGE_NONE);
  assert.equal(resolvePageKind({}), PAGE_NONE);
});

test('resolvePageKind: hero 阶段归为新增会话页', () => {
  assert.equal(resolvePageKind({ hasConversation: true, phase: 'hero' }), PAGE_HERO);
});

test('resolvePageKind: 其余阶段一律归为聊天会话页', () => {
  assert.equal(resolvePageKind({ hasConversation: true, phase: 'active' }), PAGE_CHAT);
  assert.equal(resolvePageKind({ hasConversation: true, phase: 'unknown' }), PAGE_CHAT);
  assert.equal(resolvePageKind({ hasConversation: true }), PAGE_CHAT);
  assert.equal(resolvePageKind({ hasConversation: true, phase: null }), PAGE_CHAT);
});

test('resolvePageKind: 垃圾输入不会抛错且回落到 none', () => {
  for (const input of [undefined, null, 0, '', 'hero', [], true, () => {}]) {
    assert.equal(resolvePageKind(input), PAGE_NONE);
  }
});

test('resolvePageKind: 三个分类常量互不相同', () => {
  const kinds = new Set([PAGE_NONE, PAGE_HERO, PAGE_CHAT]);
  assert.equal(kinds.size, 3);
  assert.equal(PAGE_NONE, 'none');
  assert.equal(PAGE_HERO, 'hero');
  assert.equal(PAGE_CHAT, 'chat');
});

test('resolvePanelTargets: 不在作用范围时 HUD 不生效', () => {
  const targets = resolvePanelTargets({ page: PAGE_NONE, pageEnabled: true, backgroundEnabled: true });
  assert.deepEqual(targets, { hud: false });
});

test('resolvePanelTargets: HUD 面板跟随「当前所在页」的总开关 + 背景开关', () => {
  // v0.5.0：面板要模糊的是它所在那一页的背景，所以两道开关都要开（新建页用新建页的，聊天页用聊天页的）。
  const on = { pageEnabled: true, backgroundEnabled: true };
  assert.deepEqual(resolvePanelTargets({ page: PAGE_HERO, ...on }), { hud: true });
  assert.deepEqual(resolvePanelTargets({ page: PAGE_CHAT, ...on }), { hud: true });
  // 任一开关关闭都不生效
  assert.deepEqual(resolvePanelTargets({ page: PAGE_HERO, pageEnabled: false, backgroundEnabled: true }), {
    hud: false,
  });
  assert.deepEqual(resolvePanelTargets({ page: PAGE_CHAT, pageEnabled: true, backgroundEnabled: false }), {
    hud: false,
  });
  assert.deepEqual(resolvePanelTargets({ page: PAGE_CHAT }), { hud: false }, '缺少背景开关时关闭');
});

test('resolvePanelTargets: 右侧边栏背景已移除，不再返回 rightbar', () => {
  // v0.2.4：作用范围不再包含右侧边栏，任何输入都不应再产生右栏目标。
  const targets = resolvePanelTargets({
    page: PAGE_CHAT,
    rightbarOpen: true,
    pageEnabled: true,
    backgroundEnabled: true,
    rightbarBackground: true,
  });
  assert.equal('rightbar' in targets, false);
});

test('resolvePanelTargets: 垃圾输入不会抛错', () => {
  // 非对象入参按空对象处理：没有 page 字段即不在作用范围
  for (const input of [undefined, null, 0, '', [], true, () => {}]) {
    assert.equal(typeof resolvePanelTargets(input).hud, 'boolean');
  }
  assert.deepEqual(resolvePanelTargets({ page: PAGE_CHAT }), { hud: false });
  // 两个开关都按真值强制布尔（沿用原实现的 !! 语义）：任一假值即关闭，两者都真才开启
  for (const falsy of [undefined, null, false, 0, '']) {
    assert.deepEqual(
      resolvePanelTargets({ page: PAGE_CHAT, pageEnabled: falsy, backgroundEnabled: true }),
      { hud: false },
      `pageEnabled=${String(falsy)}`,
    );
    assert.deepEqual(
      resolvePanelTargets({ page: PAGE_CHAT, pageEnabled: true, backgroundEnabled: falsy }),
      { hud: false },
      `backgroundEnabled=${String(falsy)}`,
    );
  }
  for (const truthy of [true, 1, 'yes']) {
    assert.deepEqual(
      resolvePanelTargets({ page: PAGE_CHAT, pageEnabled: truthy, backgroundEnabled: truthy }),
      { hud: true },
    );
  }
});

/**
 * 子视图判定（v0.5.1）。
 *
 * 「对话 / 轨迹 / 统计」共用同一个 `[data-conversation-content]`，所以页面分类与图层挂载点不变；
 * 这个函数只服务自检与排查——把子视图打进 diagnose，才能区分
 * 「开关没开」与「被视图底色盖住」这两种截然不同的原因。
 */
test('resolveViewKind: 三个子视图共用同一内容面，按宿主标记分类', () => {
  assert.equal(resolveViewKind({ hasTrajectory: true }), VIEW_TRAJECTORY);
  assert.equal(resolveViewKind({ hasStatsTable: true }), VIEW_STATS);
  assert.equal(resolveViewKind({}), VIEW_THREAD);
  // 轨迹优先：轨迹表格里也有 th，不能因为「有表头」就误判成统计
  assert.equal(resolveViewKind({ hasTrajectory: true, hasStatsTable: true }), VIEW_TRAJECTORY);
});

test('resolveViewKind: 垃圾输入不抛错且回落到 thread', () => {
  for (const input of [undefined, null, 0, '', [], true]) {
    assert.equal(resolveViewKind(input), VIEW_THREAD, `输入 ${JSON.stringify(input)} 应回落到 thread`);
  }
});

test('resolveViewKind: 三个常量互不相同且取值稳定', () => {
  assert.equal(new Set([VIEW_THREAD, VIEW_TRAJECTORY, VIEW_STATS]).size, 3);
  assert.equal(VIEW_THREAD, 'thread');
  assert.equal(VIEW_TRAJECTORY, 'trajectory');
  assert.equal(VIEW_STATS, 'stats');
});
