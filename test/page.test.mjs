import assert from 'node:assert/strict';
import test from 'node:test';

import { PAGE_CHAT, PAGE_HERO, PAGE_NONE, resolvePageKind, resolvePanelTargets } from '../src/page.js';

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
  const targets = resolvePanelTargets({ page: PAGE_NONE, hudGlass: true });
  assert.deepEqual(targets, { hud: false });
});

test('resolvePanelTargets: 两页各自跟随自己的开关', () => {
  assert.deepEqual(resolvePanelTargets({ page: PAGE_HERO, hudGlass: true }), { hud: true });
  assert.deepEqual(resolvePanelTargets({ page: PAGE_CHAT, hudGlass: true }), { hud: true });
  assert.deepEqual(resolvePanelTargets({ page: PAGE_HERO, hudGlass: false }), { hud: false });
  assert.deepEqual(resolvePanelTargets({ page: PAGE_CHAT, hudGlass: false }), { hud: false });
});

test('resolvePanelTargets: 右侧边栏背景已移除，不再返回 rightbar', () => {
  // v0.2.4：作用范围不再包含右侧边栏，任何输入都不应再产生右栏目标。
  const targets = resolvePanelTargets({
    page: PAGE_CHAT,
    rightbarOpen: true,
    hudGlass: true,
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
  // 开关按真值强制布尔（沿用原实现的 !! 语义）：假值关闭、真值开启
  for (const falsy of [undefined, null, false, 0, '']) {
    assert.deepEqual(resolvePanelTargets({ page: PAGE_CHAT, hudGlass: falsy }), { hud: false });
  }
  for (const truthy of [true, 1, 'yes']) {
    assert.deepEqual(resolvePanelTargets({ page: PAGE_CHAT, hudGlass: truthy }), { hud: true });
  }
  assert.deepEqual(resolvePanelTargets({ page: PAGE_CHAT, hudGlass: true }), { hud: true });
});
