import assert from 'node:assert/strict';
import test from 'node:test';

/**
 * hero 行装配测试（真实 DOM 的替身，不是视觉验证）
 *
 * 目的：锁住 v0.2.0 修的两件事里最容易回归的一件——标题必须插到 headline 行内、
 * 「文案组」之前，并且是内联尺寸（width/height 由 JS 按目标字号写入）。
 * 依据的真实结构（来自 dsh-client-ui-conversation 的 HeroShell）：
 *
 *   root > stack(column) > headline(row) > [鲸鱼 span, titleGroup > (文案 span, 徽标 span)]
 */

const SCOPE_SELECTOR_ATTRS = ['data-conversation-content', 'data-content-phase'];

/** 极小 DOM 替身：只实现 createStage 在这条路径上用到的接口。 */
function node(tag, options) {
  const opts = options || {};
  const attrs = new Map();
  const el = {
    tagName: String(tag).toUpperCase(),
    children: [],
    parentElement: null,
    textContent: opts.text || '',
    className: opts.className || '',
    isConnected: true,
    clientWidth: opts.clientWidth === undefined ? 460 : opts.clientWidth,
    clientHeight: opts.clientHeight === undefined ? 42 : opts.clientHeight,
    firstChild: null,
    style: {
      setProperty() {},
      removeProperty() {},
      getPropertyValue() {
        return '';
      },
    },
    computed: {
      flexDirection: opts.flexDirection || 'row',
      fontSize: opts.fontSize || '16px',
      fontFamily: 'Inter, sans-serif',
    },
    rect: {
      left: opts.left || 0,
      top: opts.top || 0,
      width: opts.width === undefined ? 460 : opts.width,
      height: opts.height === undefined ? 42 : opts.height,
    },
    setAttribute(name, value) {
      attrs.set(String(name), value === undefined ? '' : String(value));
    },
    getAttribute(name) {
      const key = String(name);
      return attrs.has(key) ? attrs.get(key) : null;
    },
    removeAttribute(name) {
      attrs.delete(String(name));
    },
    toggleAttribute(name, force) {
      const key = String(name);
      if (force) attrs.set(key, '');
      else attrs.delete(key);
      return attrs.has(key);
    },
    hasAttribute(name) {
      return attrs.has(String(name));
    },
    append(child) {
      this.insertBefore(child, null);
    },
    insertBefore(child, reference) {
      child.parentElement = el;
      const index = reference ? el.children.indexOf(reference) : -1;
      if (index >= 0) el.children.splice(index, 0, child);
      else el.children.push(child);
      el.firstChild = el.children[0] || null;
      return child;
    },
    remove() {
      const parent = el.parentElement;
      if (!parent) return;
      const index = parent.children.indexOf(el);
      if (index >= 0) parent.children.splice(index, 1);
      parent.firstChild = parent.children[0] || null;
      el.parentElement = null;
    },
    addEventListener() {},
    removeEventListener() {},
    getBoundingClientRect() {
      const r = el.rect;
      return { left: r.left, top: r.top, width: r.width, height: r.height, right: r.left + r.width, bottom: r.top + r.height };
    },
    getContext() {
      return null;
    },
    getRootNode() {
      let cursor = el;
      while (cursor.parentElement) cursor = cursor.parentElement;
      return cursor;
    },
    querySelectorAll(selector) {
      return descendants(el).filter((candidate) => matches(candidate, selector));
    },
    querySelector(selector) {
      return descendants(el).find((candidate) => matches(candidate, selector)) || null;
    },
    closest(selector) {
      let cursor = el;
      while (cursor) {
        if (matches(cursor, selector)) return cursor;
        cursor = cursor.parentElement;
      }
      return null;
    },
  };
  return el;
}

function descendants(root) {
  const out = [];
  const walk = (current) => {
    for (const child of current.children) {
      out.push(child);
      walk(child);
    }
  };
  walk(root);
  return out;
}

/** 只支持这一组测试用到的选择器：tag 列表、[attr]、[attr="v"]、.cls 的组合。 */
function matches(el, selector) {
  const parts = String(selector).split(',').map((part) => part.trim()).filter(Boolean);
  return parts.some((part) => matchOne(el, part));
}

function matchOne(el, selector) {
  let rest = selector;
  let tagFilter = null;
  const tagMatch = rest.match(/^([a-z0-9]+)/i);
  if (tagMatch) {
    tagFilter = tagMatch[1].toUpperCase();
    rest = rest.slice(tagMatch[1].length);
  }
  if (tagFilter && el.tagName !== tagFilter) return false;
  const pattern = /\[([a-z-]+)(?:="([^"]*)")?\]|\.([a-zA-Z0-9_-]+)/g;
  let consumed = 0;
  let found;
  while ((found = pattern.exec(rest))) {
    consumed += found[0].length;
    if (found[3]) {
      if (!String(el.className).split(/\s+/).includes(found[3])) return false;
      continue;
    }
    if (!el.hasAttribute(found[1])) return false;
    if (found[2] !== undefined && el.getAttribute(found[1]) !== found[2]) return false;
  }
  return consumed === rest.length;
}

/** 搭一个 hero 页：stack(column) > headline(row) > [鱼标, titleGroup > (文案, 徽标)]。 */
function buildHeroDocument() {
  const doc = node('#document');
  doc.head = node('head');
  doc.body = node('body');
  doc.documentElement = node('html');
  doc.createElement = (tag) => node(tag);
  doc.createElementNS = (_ns, tag) => node(tag);
  doc.fonts = { ready: Promise.resolve() };
  doc.hidden = false;
  doc.title = 'test';

  const surface = node('div', { left: 0, top: 0, width: 1190, height: 823 });
  surface.setAttribute('data-conversation-content', '');
  surface.setAttribute('data-content-phase', 'hero');
  surface.append(node('div')); // 占位：让 surface 不是叶子

  const stack = node('div', { flexDirection: 'column', width: 900, height: 400, left: 145, top: 200 });
  const headline = node('div', { flexDirection: 'row', width: 700, height: 40, left: 245, top: 300 });
  const fish = node('span', { width: 34, height: 34, left: 245, top: 303 });
  const group = node('span', { flexDirection: 'row', width: 400, height: 40, left: 300, top: 300 });
  const label = node('span', { text: '探索未至之境', fontSize: '26px', width: 220, height: 32, left: 300, top: 304 });
  const badge = node('span', { text: '预览版', fontSize: '12px', width: 60, height: 20, left: 528, top: 300 });

  group.append(label);
  group.append(badge);
  headline.append(fish);
  headline.append(group);
  stack.append(headline);
  surface.append(stack);
  doc.body.append(surface);

  doc.querySelector = (selector) => {
    const parts = String(selector).split(',').map((part) => part.trim()).filter(Boolean);
    for (const part of parts) {
      const hit = descendants(doc.body).find((candidate) => matchOne(candidate, part));
      if (hit) return hit;
    }
    return null;
  };
  doc.querySelectorAll = (selector) => descendants(doc.body).filter((candidate) => matches(candidate, selector));
  doc.addEventListener = () => {};
  doc.removeEventListener = () => {};

  return { doc, surface, stack, headline, group, label, badge };
}

/** 装上最小全局环境后导入 stage 模块。 */
async function loadStage() {
  const { doc, headline, group } = buildHeroDocument();
  globalThis.window = {
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    addEventListener() {},
    removeEventListener() {},
    devicePixelRatio: 1,
  };
  globalThis.document = doc;
  globalThis.getComputedStyle = (el) => (el && el.computed) || { flexDirection: 'row', fontSize: '16px', fontFamily: 'sans-serif' };
  globalThis.MutationObserver = class {
    observe() {}
    disconnect() {}
  };
  globalThis.requestAnimationFrame = () => 1;
  globalThis.cancelAnimationFrame = () => {};
  const module = await import('../src/stage.js');
  return { module, doc, headline, group };
}

function makeStore(state) {
  const listeners = new Set();
  let current = state;
  return {
    getSnapshot: () => current,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    update(next) {
      current = { ...current, ...next };
      for (const listener of listeners) listener(current);
    },
  };
}

function baseState() {
  return {
    enabled: true,
    title: { idle: true, interact: true },
    background: { idle: true, interact: true, intensity: 0.55 },
    surfaces: {
      hero: { title: true, background: true, glass: true },
      chat: { background: true, glass: true },
      panels: { hudGlass: true },
    },
    glass: { blur: 14 },
  };
}

test('hero: 标题插在 headline 行内、文案组之前', async () => {
  const { module, doc, headline, group } = await loadStage();
  const store = makeStore(baseState());
  const status = {
    snapshot: { reducedMotion: false, titleAvailable: null },
    getSnapshot() {
      return status.snapshot;
    },
    set(patch) {
      status.snapshot = { ...status.snapshot, ...patch };
    },
  };
  const stage = module.createStage({ store, status, documentRef: doc });
  const dispose = stage.install();

  try {
    const title = headline.children.find((child) => child.hasAttribute('data-mui-title'));
    assert.ok(title, 'hero 页应在 headline 行内插入标题');
    assert.equal(title.parentElement, headline, '标题的父级必须是 headline 行');
    assert.equal(headline.children.indexOf(title) + 1, headline.children.indexOf(group), '标题必须紧挨在文案组之前');
    assert.equal(headline.children[0].tagName, 'SPAN', '鲸鱼图标仍在行首');
    assert.ok(Number.parseFloat(title.style.width) > 0, '标题宽度应写成内联样式');
    assert.ok(Number.parseFloat(title.style.height) > 0, '标题高度应写成内联样式');
  } finally {
    dispose();
  }
  assert.equal(headline.children.some((child) => child.hasAttribute('data-mui-title')), false, '卸载后应移除标题');
});

test('hero: 标题关闭时不插入节点', async () => {
  const { module, doc, headline } = await loadStage();
  const state = baseState();
  state.surfaces.hero.title = false;
  const store = makeStore(state);
  const status = {
    snapshot: { reducedMotion: false, titleAvailable: null },
    getSnapshot() {
      return status.snapshot;
    },
    set(patch) {
      status.snapshot = { ...status.snapshot, ...patch };
    },
  };
  const stage = module.createStage({ store, status, documentRef: doc });
  const dispose = stage.install();
  try {
    assert.equal(headline.children.some((child) => child.hasAttribute('data-mui-title')), false);
  } finally {
    dispose();
  }
});
