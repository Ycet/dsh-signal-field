/**
 * 设置页结构测试（v0.5.0：按页面组织 + 折叠区）
 *
 * 用极简 React 替身把组件真的渲染一遍，锁住这几件事：
 *   1. 三张卡片（总开关 / 新建会话页 / 聊天会话页）的顺序与卡片内块顺序；
 *   2. 「…动效设置」默认收起、可独立展开、可多开，且收起时详情仍在 DOM 里（hidden）；
 *   3. 上级开关关闭时控件置灰、折叠区内给出提示；两张页面卡片的同名开关互不影响；
 *   4. 已下线的旧结构与旧行不得复活。
 *
 * 只断言结构与契约，不测像素观感（观感仍需人工验收）。
 */

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { defaults } from '../src/settings.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** 设置页源码：测试里剥掉 import / export 之后直接 new Function 执行。 */
const PAGE_SOURCE = await readFile(join(ROOT, 'src', 'settings-page.js'), 'utf8');

/**
 * 极简 React 替身 v2。
 *
 * 与 v0.4.x 的区别：useState 会保存状态并在 setter 被调用后重渲染。
 * 折叠区是交互态，只用初值渲染的话测不出「点一下能开」。
 * 只有 SettingsPage 用 hook，子组件（Row / Switch / …）都是纯渲染，所以单个游标够用。
 */
function createPage(initialState, statusSnapshot) {
  const states = [];
  let cursor = 0;
  let component = null;
  let tree = null;
  const updates = [];

  function render() {
    cursor = 0;
    tree = component();
    return tree;
  }

  const ReactStub = {
    Fragment: Symbol('Fragment'),
    // 与真实 React 一致：children 同时出现在 props.children 里（组件里会直接用它）。
    createElement: (type, props, ...children) => ({
      type,
      props: {
        ...(props || {}),
        children: children.length === 0 ? undefined : children.length === 1 ? children[0] : children,
      },
      children,
    }),
    useState(init) {
      const index = cursor++;
      if (!(index in states)) states[index] = init;
      const set = (value) => {
        states[index] = typeof value === 'function' ? value(states[index]) : value;
        render();
      };
      return [states[index], set];
    },
    useEffect: () => {},
    useMemo: (fn) => fn(),
    useCallback: (fn) => fn,
    useRef: (value) => ({ current: value }),
    useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot(),
  };

  const source = PAGE_SOURCE.replace(/^import[^;]+;$/gm, '').replace(/export /g, '');
  const factory = new Function('React', 'h', `${source}; return SettingsPage;`);
  const SettingsPage = factory(ReactStub, ReactStub.createElement);

  component = () =>
    SettingsPage({
      store: {
        getSnapshot: () => initialState,
        subscribe: () => () => {},
        update: (partial) => updates.push(partial),
        reset: () => updates.push('reset'),
      },
      status: {
        getSnapshot: () => statusSnapshot || { reducedMotion: false, titleAvailable: null },
        subscribe: () => () => {},
      },
      t: (key) => key,
    });

  render();

  return {
    get tree() {
      return tree;
    },
    updates,
    /** 在树里找到第一个满足条件的元素并点它（元素来自当前树）。 */
    click(predicate) {
      const hit = elementsOf(tree, predicate)[0];
      assert.ok(hit, '找不到要点击的元素');
      assert.equal(typeof hit.props.onClick, 'function', '元素没有 onClick');
      hit.props.onClick();
      return tree;
    },
  };
}

/**
 * 深度遍历（会展开函数组件）。
 *
 * 注意：函数组件的子节点由它自己渲染，所以展开后**不能再走一遍元素上的 children**，
 * 否则每个子元素都会被数两次（props.children 与 children 是同一份）。
 */
function walk(tree, visit) {
  const step = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      node.forEach(step);
      return;
    }
    visit(node);
    if (typeof node.type === 'function') {
      step(node.type(node.props));
      return;
    }
    if (Array.isArray(node.children)) node.children.forEach(step);
  };
  step(tree);
}

/** 收集满足条件的元素（保持出现顺序）。 */
function elementsOf(tree, predicate) {
  const hits = [];
  walk(tree, (node) => {
    if (predicate(node)) hits.push(node);
  });
  return hits;
}

/** 按 className 收集结构信息（卡片标题 / 行标签 / 数字项 / 分割线 / 折叠件）。 */
function collect(tree) {
  const cards = [];
  const rows = [];
  const numbers = [];
  const dividers = [];
  const disclosures = [];
  const details = [];
  const notes = [];
  walk(tree, (node) => {
    const cls = node.props && node.props.className;
    const text = Array.isArray(node.children) ? node.children[0] : node.children;
    if (cls === 'mui-card-title') cards.push(text);
    if (cls === 'mui-row-label') rows.push(text);
    if (cls === 'mui-num-label') numbers.push(text);
    if (cls === 'mui-divider') dividers.push(node.props);
    if (cls === 'mui-disclosure') disclosures.push(node);
    if (cls === 'mui-detail') details.push(node);
    if (cls === 'mui-detail-note') notes.push(text);
  });
  return { cards, rows, numbers, dividers, disclosures, details, notes };
}

/** 取某个折叠区容器（按 aria-controls / id 关联，只认真正渲染出来的 div）。 */
function detailById(tree, id) {
  return elementsOf(
    tree,
    (node) => node.props && node.props.className === 'mui-detail' && node.props.id === id,
  )[0];
}

/** 取某张卡片（按卡片标题文本定位它所在的 section）。 */
function cardOf(tree, title) {
  const cards = elementsOf(tree, (node) => node.props && node.props.className === 'mui-card');
  return cards.find(
    (card) =>
      elementsOf(
        card,
        (node) =>
          node.props &&
          node.props.className === 'mui-card-title' &&
          (Array.isArray(node.children) ? node.children[0] : node.children) === title,
      ).length > 0,
  );
}

/** 展开/收起状态读法：aria-expanded 与 [hidden] 必须成对。 */
function disclosureState(tree, controls) {
  const toggle = elementsOf(
    tree,
    (node) =>
      node.props && node.props.className === 'mui-disclosure' && node.props['aria-controls'] === controls,
  )[0];
  const detail = detailById(tree, controls);
  assert.ok(toggle, `缺少折叠按钮 ${controls}`);
  assert.ok(detail, `缺少折叠容器 ${controls}`);
  return {
    expanded: toggle.props['aria-expanded'] === 'true',
    hidden: detail.props.hidden === true,
  };
}

const cardTitles = (tree) => collect(tree).cards;

test('设置页: 三张卡片——总开关 / 新建会话页 / 聊天会话页', () => {
  const page = createPage(defaults());
  assert.deepEqual(cardTitles(page.tree), ['groupMaster', 'groupHeroPage', 'groupChatPage']);
});

test('设置页: 卡片内共 8 条分割线（总开关 1 + 新建页 4 + 聊天页 3）', () => {
  const { dividers } = collect(createPage(defaults()).tree);
  // v0.5.1：聊天页多了「鲸鱼」块，于是比 v0.5.0 多一条分割线。
  assert.equal(dividers.length, 8, '分割线数量与需求给的结构一一对应');
  for (const props of dividers) assert.equal(props.role, 'separator');
});

test('设置页: 行顺序符合按页结构（含折叠区里的行）', () => {
  const { rows } = collect(createPage(defaults()).tree);
  assert.deepEqual(rows, [
    // 卡片 1：总开关（v0.5.0 帧率移到这里）
    'master',
    'rowFps',
    // 卡片 2：新建会话页
    'pageMaster',
    'rowBackground',
    'rowBackgroundIdle',
    'rowBackgroundInteract',
    'rowIntensity',
    'rowBackgroundSpeed',
    'rowTitle',
    'rowTitleIdle',
    'rowTitleInteract',
    'rowTitleSpeed',
    'rowWhale',
    'rowWhaleSpecies',
    'rowGlass',
    // 卡片 3：聊天会话页（v0.5.1 起有鲸鱼，仍然没有标题）
    'pageMaster',
    'rowBackground',
    'rowBackgroundIdle',
    'rowBackgroundInteract',
    'rowIntensity',
    'rowBackgroundSpeed',
    'rowWhale',
    'rowWhaleSpecies',
    'rowGlass',
  ]);
});

test('设置页: 五个折叠区默认收起，详情仍渲染（hidden）', () => {
  const { disclosures, details } = collect(createPage(defaults()).tree);
  assert.equal(disclosures.length, 5, '新建页 3 个 + 聊天页 2 个');
  assert.equal(details.length, 5);
  assert.deepEqual(
    disclosures.map((node) => node.props['aria-controls']),
    [
      'sf-hero-background-detail',
      'sf-hero-title-detail',
      'sf-hero-whale-detail',
      'sf-chat-background-detail',
      'sf-chat-whale-detail',
    ],
  );
  for (const node of disclosures) assert.equal(node.props['aria-expanded'], 'false', '默认必须收起');
  for (const node of details) assert.equal(node.props.hidden, true, '收起时详情必须 hidden');
});

test('设置页: 点折叠标题可展开、再点收起，且互不影响', () => {
  const page = createPage(defaults());
  assert.deepEqual(disclosureState(page.tree, 'sf-hero-title-detail'), { expanded: false, hidden: true });

  page.click((node) => node.props && node.props.className === 'mui-disclosure' && node.props['aria-controls'] === 'sf-hero-title-detail');
  assert.deepEqual(disclosureState(page.tree, 'sf-hero-title-detail'), { expanded: true, hidden: false });
  // 其它折叠区不受影响（需求：各自独立、可多开）
  assert.deepEqual(disclosureState(page.tree, 'sf-hero-background-detail'), { expanded: false, hidden: true });

  page.click((node) => node.props && node.props.className === 'mui-disclosure' && node.props['aria-controls'] === 'sf-hero-whale-detail');
  assert.deepEqual(disclosureState(page.tree, 'sf-hero-title-detail'), { expanded: true, hidden: false });
  assert.deepEqual(disclosureState(page.tree, 'sf-hero-whale-detail'), { expanded: true, hidden: false });

  page.click((node) => node.props && node.props.className === 'mui-disclosure' && node.props['aria-controls'] === 'sf-hero-title-detail');
  assert.deepEqual(disclosureState(page.tree, 'sf-hero-title-detail'), { expanded: false, hidden: true });
});

test('设置页: 效果开关关闭时折叠区可展开、控件置灰并给出提示', () => {
  const state = defaults();
  state.pages.hero.background.enabled = false;
  const page = createPage(state);

  // 「背景」关着 → 详情顶部有提示
  const detail = detailById(page.tree, 'sf-hero-background-detail');
  const notes = elementsOf(detail, (node) => node.props && node.props.className === 'mui-detail-note');
  assert.equal(notes.length, 1);
  assert.equal(notes[0].children[0], 'detailLocked');

  // 里面所有可交互控件都禁用
  const controls = elementsOf(
    detail,
    (node) =>
      node.props &&
      (node.props.className === 'mui-switch' || node.props.className === 'mui-range'),
  );
  assert.equal(controls.length, 4, '背景折叠区应有 2 个开关 + 2 个滑块');
  for (const node of controls) assert.equal(node.props.disabled, true);

  // 折叠按钮本身不禁用（仍可展开查看）
  const toggle = elementsOf(
    page.tree,
    (node) => node.props && node.props.className === 'mui-disclosure' && node.props['aria-controls'] === 'sf-hero-background-detail',
  )[0];
  assert.equal(toggle.props['aria-expanded'], 'false');
});

test('设置页: 页面总开关关闭时该页所有控件禁用，另一页不受影响', () => {
  const state = defaults();
  state.pages.hero.enabled = false;
  const page = createPage(state);
  const controlsOf = (title) =>
    elementsOf(
      cardOf(page.tree, title),
      (node) =>
        node.props && (node.props.className === 'mui-switch' || node.props.className === 'mui-range'),
    );

  const heroControls = controlsOf('groupHeroPage');
  assert.ok(heroControls.length >= 5);
  // 页面总开关本身必须保持可点（否则关掉就再也打不开）
  const pageMaster = heroControls.find((node) => node.props['aria-label'] === 'pageMaster');
  assert.equal(pageMaster.props.disabled, undefined, '页面总开关自身不能被禁用');
  for (const node of heroControls) {
    if (node === pageMaster) continue;
    assert.equal(node.props.disabled, true, `${node.props['aria-label']} 应被禁用`);
  }

  const chatControls = controlsOf('groupChatPage');
  assert.ok(chatControls.length >= 2);
  for (const node of chatControls) assert.equal(node.props.disabled, undefined, '另一页不应被牵连');
});

test('设置页: 全局总开关关闭时所有控件禁用（含帧率），总开关自身仍可点', () => {
  const state = defaults();
  state.enabled = false;
  const page = createPage(state);
  const controls = elementsOf(
    page.tree,
    (node) => node.props && ['mui-switch', 'mui-range'].includes(node.props.className),
  );
  assert.ok(controls.length > 0);
  const master = controls.find((node) => node.props['aria-label'] === 'master');
  assert.equal(master.props.disabled, undefined, '总开关自身不能被禁用');
  for (const node of controls) {
    if (node === master) continue;
    assert.equal(node.props.disabled, true, `${node.props['aria-label']} 应被禁用`);
  }
});

test('设置页: 两页同名开关互不影响，各自写回自己的页面分组', () => {
  const page = createPage(defaults());
  const backgroundSwitches = elementsOf(
    page.tree,
    (node) => node.props && node.props.className === 'mui-switch' && node.props['aria-label'] === 'rowBackground',
  );
  assert.equal(backgroundSwitches.length, 2, '新建页与聊天页各一个「背景」开关');

  backgroundSwitches[0].props.onClick();
  assert.deepEqual(page.updates[0], { pages: { hero: { background: { enabled: false } } } });

  backgroundSwitches[1].props.onClick();
  assert.deepEqual(page.updates[1], { pages: { chat: { background: { enabled: false } } } });
});

test('设置页: 鲸鱼数字网格的标签顺序（两列，逐行铺开）', () => {
  const { numbers } = collect(createPage(defaults()).tree);
  const pageNumbers = [
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
  ];
  // v0.5.1：新建页与聊天页各有一份 11 项，顺序完全一致。
  assert.deepEqual(numbers, [...pageNumbers, ...pageNumbers]);
});

test('设置页: 鲸鱼不提供字符风格与字体切换（固定 ASCII）', async () => {
  // 字符风格固定 ASCII：既不该有字形分段，也不该有字体名输入或字体来源选择
  for (const gone of ['rowWhaleGlyph', 'glyphMode', 'rowWhaleFont', 'fontSource', 'asciiFont', 'hanziFont']) {
    assert.equal(PAGE_SOURCE.includes(gone), false, `设置页不应再出现：${gone}`);
  }
});

test('设置页: 鲸鱼数字项都是 number 输入且带 min/max/step', () => {
  const inputs = elementsOf(
    createPage(defaults()).tree,
    (node) => node.props && node.props.className === 'mui-num-input',
  );
  // v0.5.1：两页各 11 个。
  assert.equal(inputs.length, 22, '两页各有 11 个鲸鱼数字输入框');
  for (const node of inputs) {
    assert.equal(node.props.type, 'number');
    assert.equal(typeof node.props.min, 'number', `${node.props['aria-label']} 缺少 min`);
    assert.equal(typeof node.props.max, 'number', `${node.props['aria-label']} 缺少 max`);
    assert.equal(typeof node.props.step, 'number', `${node.props['aria-label']} 缺少 step`);
    assert.equal(typeof node.props.onChange, 'function');
  }
});

test('设置页: 鲸鱼数字输入写回新建会话页的鲸鱼分组', () => {
  const page = createPage(defaults());
  const heroCard = cardOf(page.tree, 'groupHeroPage');
  const countInput = elementsOf(
    heroCard,
    (node) => node.props && node.props.className === 'mui-num-input' && node.props['aria-label'] === 'rowWhaleCount',
  )[0];
  countInput.props.onChange({ target: { value: '4', valueAsNumber: 4 } });
  assert.deepEqual(page.updates[0], { pages: { hero: { whale: { count: 4 } } } });
  // 清空输入框不写回（否则会立刻跳回默认值）
  countInput.props.onChange({ target: { value: '', valueAsNumber: Number.NaN } });
  assert.equal(page.updates.length, 1);
});

test('设置页: 聊天页鲸鱼数字输入写回聊天页的鲸鱼分组（不与新建页串味）', () => {
  const page = createPage(defaults());
  const chatCard = cardOf(page.tree, 'groupChatPage');
  const inputs = elementsOf(
    chatCard,
    (node) => node.props && node.props.className === 'mui-num-input',
  );
  assert.equal(inputs.length, 11, '聊天页也应有 11 个鲸鱼数字输入框');
  // 第 1 项是「鲸鱼数量」，第 6 项是「鲸鱼大小」
  inputs[0].props.onChange({ target: { value: '4', valueAsNumber: 4 } });
  assert.deepEqual(page.updates[0], { pages: { chat: { whale: { count: 4 } } } });
  inputs[5].props.onChange({ target: { value: '0.8', valueAsNumber: 0.8 } });
  assert.deepEqual(page.updates[1], { pages: { chat: { whale: { size: 0.8 } } } });
  // 清空输入框仍不写回
  inputs[0].props.onChange({ target: { value: '', valueAsNumber: Number.NaN } });
  assert.equal(page.updates.length, 2);
});

test('设置页: 聊天页鲸鱼种类切换写回该页分组', () => {
  const page = createPage(defaults());
  const chatCard = cardOf(page.tree, 'groupChatPage');
  const segmented = elementsOf(
    chatCard,
    (node) => node.props && node.props.className === 'mui-seg',
  )[0];
  assert.ok(segmented, '聊天页缺少「鲸鱼种类」分段控件');
  const orca = elementsOf(segmented, (node) => node.props && node.props.className === 'mui-seg-item').find(
    (node) => node.children[0] === 'whaleOrca',
  );
  assert.ok(orca, '缺少虎鲸选项');
  orca.props.onClick();
  assert.deepEqual(page.updates[0], { pages: { chat: { whale: { species: 'orca' } } } });
});

test('设置页: 聊天页鲸鱼开关关闭后该页鲸鱼折叠区控件置灰，新建页不受影响', () => {
  const state = defaults();
  state.pages.chat.whale.enabled = false;
  const page = createPage(state);

  const detail = detailById(page.tree, 'sf-chat-whale-detail');
  const controls = elementsOf(
    detail,
    (node) =>
      node.props &&
      (node.props.className === 'mui-num-input' ||
        node.props.className === 'mui-seg-item' ||
        node.props.className === 'mui-switch'),
  );
  assert.ok(controls.length > 0, '聊天页鲸鱼折叠区应有控件');
  for (const node of controls) assert.equal(node.props.disabled, true);

  // 新建页那份鲸鱼开关与数字框仍是可用的
  const heroDetail = detailById(page.tree, 'sf-hero-whale-detail');
  const heroInputs = elementsOf(
    heroDetail,
    (node) => node.props && node.props.className === 'mui-num-input',
  );
  assert.equal(heroInputs.length, 11);
  for (const node of heroInputs) assert.equal(node.props.disabled, undefined);
});

test('设置页: 帧率滑块移到总开关卡片，并写回顶层 frame', () => {
  const page = createPage(defaults());
  const masterCard = cardOf(page.tree, 'groupMaster');
  const range = elementsOf(masterCard, (node) => node.props && node.props.className === 'mui-range')[0];
  assert.equal(range.props['aria-label'], 'rowFps');
  assert.equal(range.props.min, 15);
  assert.equal(range.props.max, 60);
  assert.equal(range.props.step, 5);
  range.props.onChange({ target: { value: '45' } });
  assert.deepEqual(page.updates[0], { frame: { fps: 45 } });
});

test('设置页: 已下线的行与旧分组标题不会复活', async () => {
  const { rows } = collect(createPage(defaults()).tree);
  for (const gone of ['rowHudGlass', 'rowBlur', 'rowHeroPage', 'rowChatPage', 'rowHeroTitle', 'rowGlassChat']) {
    assert.equal(rows.includes(gone), false, `不应再出现：${gone}`);
  }
  for (const gone of ['groupPages', 'groupEffects', 'groupBackground', 'groupHeadline', 'groupWhale', 'groupInput', 'groupFps']) {
    assert.equal(PAGE_SOURCE.includes(`t("${gone}")`), false, `源码不应再引用旧分组：${gone}`);
  }
  // v0.5.0 的新分组与折叠件必须真的被用上
  for (const key of ['groupHeroPage', 'groupChatPage', 'pageMaster', 'detailBackground', 'detailTitle', 'detailWhale']) {
    assert.equal(PAGE_SOURCE.includes(`t("${key}")`), true, `源码缺少：${key}`);
  }
  assert.equal(PAGE_SOURCE.includes('"mui-disclosure"'), true, '缺少折叠按钮的样式类');
  assert.equal(PAGE_SOURCE.includes('"mui-detail"'), true, '缺少折叠区容器的样式类');
});

test('设置页: 渲染结果不再包含作用范围说明与自检入口', async () => {
  const { rows } = collect(createPage(defaults()).tree);
  assert.ok(rows.includes('rowIntensity'));
  // v0.2.10：作用范围说明、共存说明与自检信息块都已从界面移除
  for (const gone of ['t("scopeNote")', 't("coexist")', 't("diag")', 'mui-diag']) {
    assert.equal(PAGE_SOURCE.includes(gone), false, `界面不应再包含：${gone}`);
  }
});
