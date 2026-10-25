/**
 * 设置页结构测试（v0.2.9）
 *
 * 用极简 React 替身把组件真的渲染一遍，锁住两件事：
 *   1. 两个模块（「页面」/「动效」）+ 一条分割线的顺序不能乱；
 *   2. 行的数量与顺序就是需求里列的那几项——HUD 独立开关、模糊半径滑块、按页效果行都不得复活。
 *
 * 只断言结构，不测像素观感（观感仍需人工验收）。
 */

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** 极简 React 替身：够把函数组件展开成普通对象树即可。 */
const ReactStub = {
  Fragment: Symbol('Fragment'),
  createElement: (type, props, ...children) => ({ type, props: props || {}, children }),
  useState: (init) => [typeof init === 'function' ? init() : init, () => {}],
  useEffect: () => {},
  useMemo: (fn) => fn(),
  useCallback: (fn) => fn,
  useRef: (value) => ({ current: value }),
  useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot(),
};

/** 载入源码并渲染一次，返回组件树。 */
async function renderPage(state) {
  const source = (await readFile(join(ROOT, 'src', 'settings-page.js'), 'utf8'))
    .replace(/^import[^;]+;$/gm, '')
    .replace(/export /g, '');
  const factory = new Function('React', 'h', `${source}; return SettingsPage;`);
  const SettingsPage = factory(ReactStub, ReactStub.createElement);
  const store = {
    getSnapshot: () => state,
    subscribe: () => () => {},
    update: () => {},
    reset: () => {},
  };
  const status = {
    getSnapshot: () => ({ reducedMotion: false, titleAvailable: null }),
    subscribe: () => () => {},
  };
  return SettingsPage({ store, status, t: (key) => key, diagnose: () => 'diag' });
}

const newState = () => ({
  version: 2,
  enabled: true,
  pages: { hero: true, chat: true },
  title: { idle: true, interact: true },
  background: { idle: true, interact: true, intensity: 0.3 },
  glass: { enabled: true, blur: 14 },
});

/** 深度遍历：收集模块标题与行标签，保持出现顺序。 */
function collect(tree) {
  const titles = [];
  const rows = [];
  const dividers = [];
  const walk = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) return node.forEach(walk);
    const cls = node.props && node.props.className;
    // createElement 的子节点是数组，文本标签取第一个即可
    const text = Array.isArray(node.children) ? node.children[0] : node.children;
    if (cls === 'mui-section-title') titles.push(text);
    if (cls === 'mui-row-label') rows.push(text);
    if (cls === 'mui-divider') dividers.push(node.props);
    if (typeof node.type === 'function') walk(node.type(node.props));
    if (Array.isArray(node.children)) node.children.forEach(walk);
  };
  walk(tree);
  return { titles, rows, dividers };
}

test('设置页: 总开关之后是「页面」与「动效」两个模块', async () => {
  const { titles } = collect(await renderPage(newState()));
  assert.deepEqual(titles, ['groupMaster', 'groupPages', 'groupEffects']);
});

test('设置页: 两个模块之间恰好一条分割线', async () => {
  const { dividers } = collect(await renderPage(newState()));
  assert.equal(dividers.length, 1, '只允许一条分割线');
  assert.equal(dividers[0].role, 'separator');
});

test('设置页: 行顺序符合需求（页面两行 + 动效六项）', async () => {
  const { rows } = collect(await renderPage(newState()));
  assert.deepEqual(rows, [
    'master',
    'rowHeroPage',
    'rowChatPage',
    'rowTitleIdle',
    'rowTitleInteract',
    'rowBackgroundIdle',
    'rowBackgroundInteract',
    'rowGlass',
    'rowIntensity',
  ]);
});

test('设置页: 已下线的行不会复活', async () => {
  const { rows } = collect(await renderPage(newState()));
  for (const gone of ['rowHudGlass', 'rowBlur', 'rowHeroTitle', 'rowHeroGlass', 'rowChatGlass']) {
    assert.equal(rows.includes(gone), false, `不应再出现：${gone}`);
  }
});

test('设置页: 渲染结果里包含作用范围说明与自检入口', async () => {
  const { rows } = collect(await renderPage(newState()));
  assert.ok(rows.includes('rowIntensity'));
  const source = await readFile(join(ROOT, 'src', 'settings-page.js'), 'utf8');
  assert.equal(source.includes('t("scopeNote")'), true, '缺少作用范围说明');
  assert.equal(source.includes('t("diag")'), true, '缺少自检入口');
});
