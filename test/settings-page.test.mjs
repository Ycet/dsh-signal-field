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
  // v0.4.0：鲸鱼分组。真实运行时由 settings.js 的 normalize() 保证一定存在。
  whale: {
    enabled: true,
    species: 'humpback',
    count: 1,
    speed: 0.5,
    bodySwing: 0.75,
    turnAgility: 0.8,
    tailFrequency: 0.85,
    size: 1.5,
    opacity: 0.5,
    gridScale: 0.5,
    gridOpacity: 0.1,
    fishCount: 188,
    wake: 1,
  },
});

/**
 * 深度遍历：收集卡片标题、分组小标题、行标签，保持出现顺序。
 *
 * v0.4.0：设置页从「两个模块」改成「三张卡片 + 动效卡内五组」，
 * 于是原来的 titles（mui-section-title）拆成两级：
 *   cards  —— 卡片标题（总开关 / 页面 / 动效）
 *   groups —— 卡内分组小标题（背景 / 标题 / 鲸鱼 / 输入框 / 帧率）
 */
function collect(tree) {
  const cards = [];
  const groups = [];
  const rows = [];
  const numbers = [];
  const dividers = [];
  const walk = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) return node.forEach(walk);
    const cls = node.props && node.props.className;
    // createElement 的子节点是数组，文本标签取第一个即可
    const text = Array.isArray(node.children) ? node.children[0] : node.children;
    if (cls === 'mui-card-title') cards.push(text);
    if (cls === 'mui-group-title') groups.push(text);
    if (cls === 'mui-row-label') rows.push(text);
    // v0.4.0：两列数字网格里的标签是单独一类，不能混进 rows（否则行序断言失去意义）
    if (cls === 'mui-num-label') numbers.push(text);
    if (cls === 'mui-divider') dividers.push(node.props);
    if (typeof node.type === 'function') walk(node.type(node.props));
    if (Array.isArray(node.children)) node.children.forEach(walk);
  };
  walk(tree);
  return { cards, groups, rows, numbers, dividers };
}

test('设置页: 三张卡片——总开关 / 页面 / 动效', async () => {
  const { cards } = collect(await renderPage(newState()));
  // 总开关单独一张卡，其余两张按「页面 → 动效」排列
  assert.deepEqual(cards, ['groupMaster', 'groupPages', 'groupEffects']);
});

test('设置页: 动效卡片内五个分组，顺序为背景→标题→鲸鱼→输入框→帧率', async () => {
  const { groups } = collect(await renderPage(newState()));
  assert.deepEqual(groups, [
    'groupBackground',
    'groupHeadline',
    'groupWhale',
    'groupInput',
    'groupFps',
  ]);
});

test('设置页: 卡片之间没有分割线，动效卡内恰好 4 条（5 组之间的 4 个间隙）', async () => {
  const { dividers } = collect(await renderPage(newState()));
  assert.equal(dividers.length, 4, '只允许动效卡内的 4 条分组分割线');
  for (const props of dividers) assert.equal(props.role, 'separator');
});

test('设置页: 行顺序符合卡片分组（总开关 1 + 页面 2 + 动效 12）', async () => {
  const { rows } = collect(await renderPage(newState()));
  assert.deepEqual(rows, [
    // 卡片 1：总开关
    'master',
    // 卡片 2：页面
    'rowHeroPage',
    'rowChatPage',
    // 卡片 3：动效 —— 分组 1「背景」
    'rowBackgroundIdle',
    'rowBackgroundInteract',
    'rowIntensity',
    'rowBackgroundSpeed',
    // 分组 2「标题」
    'rowTitleIdle',
    'rowTitleInteract',
    'rowTitleSpeed',
    // 分组 3「鲸鱼」（11 个数字项在网格里，由下面的 numbers 断言负责）
    'rowWhaleEnabled',
    'rowWhaleSpecies',
    // 分组 4「输入框」
    'rowGlass',
    // 分组 5「帧率」
    'rowFps',
  ]);
});

test('设置页: 鲸鱼数字网格的标签顺序（两列，逐行铺开）', async () => {
  const { numbers } = collect(await renderPage(newState()));
  assert.deepEqual(numbers, [
    'rowWhaleCount',
    'rowWhaleSpeed',
    'rowWhaleBodySwing',
    'rowWhaleTurnAgility',
    'rowWhaleTailFrequency',
    'rowWhaleSize',
    'rowWhaleOpacity',
    'rowWhaleGridScale',
    'rowWhaleGridOpacity',
    'rowWhaleFishCount',
    'rowWhaleWake',
  ]);
});

test('设置页: 鲸鱼不提供字符风格与字体切换（固定 ASCII）', async () => {
  const source = await readFile(join(ROOT, 'src', 'settings-page.js'), 'utf8');
  // 字符风格固定 ASCII：既不该有字形分段，也不该有字体名输入或字体来源选择
  for (const gone of ['rowWhaleGlyph', 'glyphMode', 'rowWhaleFont', 'fontSource', 'asciiFont', 'hanziFont']) {
    assert.equal(source.includes(gone), false, `设置页不应再出现：${gone}`);
  }
});

test('设置页: 鲸鱼数字项都是 number 输入且带 min/max/step', async () => {
  const tree = await renderPage(newState());
  const inputs = [];
  const walk = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) return node.forEach(walk);
    const props = node.props || {};
    if (props.className === 'mui-num-input') inputs.push(props);
    if (typeof node.type === 'function') walk(node.type(props));
    if (Array.isArray(node.children)) node.children.forEach(walk);
  };
  walk(tree);
  assert.equal(inputs.length, 11, '鲸鱼应有 11 个数字输入框');
  for (const props of inputs) {
    assert.equal(props.type, 'number');
    assert.equal(typeof props.min, 'number', `${props['aria-label']} 缺少 min`);
    assert.equal(typeof props.max, 'number', `${props['aria-label']} 缺少 max`);
    assert.equal(typeof props.step, 'number', `${props['aria-label']} 缺少 step`);
    assert.equal(typeof props.onChange, 'function');
  }
});

test('设置页: 小鱼数量 / 底纹网格透明度 不带「鲸鱼」前缀，其余 9 项保留', async () => {
  const zh = JSON.parse(await readFile(join(ROOT, 'locale', 'zh.json'), 'utf8')).runtime;
  const en = JSON.parse(await readFile(join(ROOT, 'locale', 'en.json'), 'utf8')).runtime;
  // v0.4.0：这两项按需求去掉了前缀
  assert.equal(zh.rowWhaleFishCount, '小鱼数量');
  assert.equal(zh.rowWhaleGridOpacity, '底纹网格透明度');
  assert.equal(en.rowWhaleFishCount, 'Fish count');
  assert.equal(en.rowWhaleGridOpacity, 'Grid opacity');
  // 其余 9 项仍保留「鲸鱼」前缀（本轮只改点名的那两项）
  for (const key of [
    'rowWhaleEnabled',
    'rowWhaleSpecies',
    'rowWhaleCount',
    'rowWhaleSpeed',
    'rowWhaleBodySwing',
    'rowWhaleTurnAgility',
    'rowWhaleTailFrequency',
    'rowWhaleSize',
    'rowWhaleOpacity',
    'rowWhaleGridScale',
    'rowWhaleWake',
  ]) {
    assert.ok(zh[key].startsWith('鲸鱼'), `${key} 应保留「鲸鱼」前缀，实际：${zh[key]}`);
  }
});

test('设置页: 已下线的行不会复活', async () => {
  const { rows } = collect(await renderPage(newState()));
  for (const gone of ['rowHudGlass', 'rowBlur', 'rowHeroTitle', 'rowHeroGlass', 'rowChatGlass']) {
    assert.equal(rows.includes(gone), false, `不应再出现：${gone}`);
  }
});

test('设置页: 渲染结果不再包含作用范围说明、共存说明与自检入口', async () => {
  const { rows } = collect(await renderPage(newState()));
  assert.ok(rows.includes('rowIntensity'));
  const source = await readFile(join(ROOT, 'src', 'settings-page.js'), 'utf8');
  // v0.2.10：作用范围说明、共存说明与自检信息块都已从界面移除
  for (const gone of ['t("scopeNote")', 't("coexist")', 't("diag")', 'mui-diag']) {
    assert.equal(source.includes(gone), false, `界面不应再包含：${gone}`);
  }
});
