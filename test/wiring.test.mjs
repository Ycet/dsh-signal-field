import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

/**
 * 装配冒烟测试（不是视觉验证）
 *
 * 目的只有一个：在没有浏览器的情况下确认 bundle 的模块接线没有写错
 * （未定义标识符、导出名不匹配、apply 里同步抛错），避免把「一加载就崩」的
 * Client 模块交给运行中的页面。它不渲染任何 React 组件、不检查任何外观，
 * 因此不能替代人工视觉验收。
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** 最小元素替身：只要够 apply() 同步路径跑通即可。 */
/**
 * 最小元素替身：够 apply() 同步路径跑通，并且**记录属性**——
 * 作用范围的核心证据就是「哪些页面被写上了 data-mui* 属性」。
 */
function element(tag) {
  const attrs = new Map();
  const node = {
    tagName: String(tag).toUpperCase(),
    style: { setProperty() {}, removeProperty() {} },
    dataset: {},
    children: [],
    firstChild: null,
    className: '',
    attrs,
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
      if (force === undefined) {
        if (attrs.has(key)) attrs.delete(key);
        else attrs.set(key, '');
      } else if (force) attrs.set(key, '');
      else attrs.delete(key);
      return attrs.has(key);
    },
    hasAttribute(name) {
      return attrs.has(String(name));
    },
    append(child) {
      node.children.push(child);
      if (!node.firstChild) node.firstChild = child;
    },
    insertBefore(child) {
      node.children.unshift(child);
      node.firstChild = child;
      return child;
    },
    remove() {},
    addEventListener() {},
    removeEventListener() {},
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
    closest() {
      return null;
    },
    getBoundingClientRect() {
      return { left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0 };
    },
    getContext() {
      return null;
    },
    clientWidth: 0,
    clientHeight: 0,
    isConnected: true,
  };
  return node;
}

/**
 * @param {{ conversationPhase?: string }} [options]
 *   传入 conversationPhase 时，模拟「停在某个会话页」——`[data-conversation-content]` 可被查到。
 *   不传则模拟面板页（插件管理页/自动化任务页），即本插件不该介入的页面。
 */
function documentStub(options) {
  const doc = element('#document');
  doc.head = element('head');
  doc.body = element('body');
  doc.documentElement = element('html');
  doc.createElement = (tag) => element(tag);
  doc.createElementNS = (_ns, tag) => element(tag);
  doc.fonts = { ready: Promise.resolve(), load: () => Promise.resolve() };
  doc.hidden = false;

  const phase = options && options.conversationPhase;
  const conversation = phase ? element('div') : null;
  if (conversation) conversation.setAttribute('data-content-phase', phase);
  doc.conversation = conversation;
  doc.querySelector = (selector) => {
    if (!conversation) return null;
    const sel = String(selector);
    if (sel === '[data-conversation-content]') return conversation;
    if (sel === '[data-content-phase="hero"]') {
      return conversation.getAttribute('data-content-phase') === 'hero' ? conversation : null;
    }
    return null;
  };
  return doc;
}

function reactStub() {
  return {
    createElement: (type, props, ...children) => ({ type, props, children }),
    Fragment: Symbol('Fragment'),
    useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
    useEffect: () => {},
    useMemo: (factory) => factory(),
    useCallback: (fn) => fn,
    useRef: (value) => ({ current: value }),
    useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot(),
  };
}

/** 载入 bundle，返回模块导出与替身 DOM（便于断言作用域属性）。 */
async function loadModule(options) {
  const source = await readFile(join(ROOT, 'client.js'), 'utf8');
  let captured = null;
  const windowStub = {
    __ModuleLoader__: {
      load(spec) {
        captured = spec;
      },
    },
    addEventListener() {},
    removeEventListener() {},
    devicePixelRatio: 1,
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    requestAnimationFrame: () => 1,
    cancelAnimationFrame: () => {},
    localStorage: {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    },
    getComputedStyle: () => ({ getPropertyValue: () => '', fontSize: '16px' }),
  };
  const doc = documentStub(options);
  const noopObserver = class {
    observe() {}
    disconnect() {}
    unobserve() {}
  };
  const run = new Function(
    'window',
    'document',
    'getComputedStyle',
    'requestAnimationFrame',
    'cancelAnimationFrame',
    'MutationObserver',
    'ResizeObserver',
    'IntersectionObserver',
    'performance',
    'localStorage',
    source,
  );
  run(
    windowStub,
    doc,
    windowStub.getComputedStyle,
    windowStub.requestAnimationFrame,
    windowStub.cancelAnimationFrame,
    noopObserver,
    noopObserver,
    noopObserver,
    { now: () => 0 },
    windowStub.localStorage,
  );
  assert.ok(captured, 'bundle 必须调用 window.__ModuleLoader__.load');
  const mod = captured.factory((id) => {
    if (id === 'react') return reactStub();
    throw new Error(`包装器不该 require 除 react 之外的包：${id}`);
  });
  return { captured, mod, doc };
}

test('wiring: bundle 通过 ModuleLoader 注册，id 与包名一致', async () => {
  const manifest = JSON.parse(await readFile(join(ROOT, 'package.json'), 'utf8'));
  const { captured } = await loadModule();
  assert.equal(captured.id, manifest.name);
  assert.equal(typeof captured.factory, 'function');
});

test('wiring: 模块导出 apply / inject，inject 声明 slots / locale', async () => {
  const { mod } = await loadModule();
  assert.equal(typeof mod.apply, 'function');
  // v0.1.1 起页面判定只看 [data-conversation-content]，不再需要 layout 服务。
  assert.deepEqual(mod.inject, ['slots', 'locale']);
});

test('wiring: apply(ctx) 在空壳环境下同步跑通并完成注册', async () => {
  const { mod, doc } = await loadModule();
  const effects = [];
  const registrations = [];
  const injections = [];
  const ctx = {
    effect(factory) {
      const dispose = factory();
      effects.push(dispose);
      return () => {};
    },
    locale: {
      register() {
        return () => {};
      },
      bind() {
        return (key) => key;
      },
    },
    slots: {
      inject(key, callback) {
        injections.push(key);
        callback();
      },
      register(options, component) {
        registrations.push({ options, component });
        return () => {};
      },
    },
    get() {
      return null;
    },
  };

  await assert.doesNotReject(async () => mod.apply(ctx));

  assert.deepEqual(injections, ['settings.section']);
  const section = registrations.find((item) => item.options.id === 'signal-field');
  assert.ok(section, '必须注册 id=signal-field 的设置页');
  assert.equal(section.options.name, 'settings.section');
  assert.equal(section.options.order, 58);
  assert.equal(section.options.locale, 'signal-field');
  assert.equal(typeof section.component, 'function');
  // 前六个 effect：locale / styles / stage（以及后续可能的扩展），至少要有可调用的清理函数
  assert.ok(effects.length >= 3);
  for (const dispose of effects) {
    assert.equal(typeof dispose === 'function' || dispose === undefined, true);
  }
  // 没有会话内容面 = 不在作用范围：不得在任何地方留下作用域标记。
  const root = doc.documentElement;
  for (const attr of [
    'data-mui',
    'data-mui-active',
    'data-mui-dark',
    'data-mui-glass-hero',
    'data-mui-glass-chat',
  ]) {
    assert.equal(root.hasAttribute(attr), false, `面板页不应写入 ${attr}`);
  }
});

test('wiring: 停在会话页（hero）时进入挂载路径且不抛错', async () => {
  const { mod, doc } = await loadModule({ conversationPhase: 'hero' });
  const ctx = {
    effect(factory) {
      const dispose = factory();
      return () => {
        if (typeof dispose === 'function') dispose();
      };
    },
    locale: { register: () => () => {}, bind: () => (key) => key },
    slots: {
      inject(_key, callback) {
        callback();
      },
      register() {
        return () => {};
      },
    },
  };

  // 无 WebGL2 / 无 Canvas2D 的替身环境下引擎会降级，但装配本身不允许抛错。
  assert.doesNotThrow(() => mod.apply(ctx));

  const root = doc.documentElement;
  assert.equal(root.hasAttribute('data-mui'), true, '会话页应写入作用域根属性');
  assert.equal(root.hasAttribute('data-mui-glass-hero'), true, 'hero 页应开启 hero 毛玻璃作用域');
  assert.equal(root.hasAttribute('data-mui-glass-chat'), false, 'hero 页不应开启聊天页毛玻璃作用域');
  assert.equal(root.hasAttribute('data-mui-hud-glass'), true, 'HUD 面板毛玻璃默认开启');
  assert.equal(root.hasAttribute('data-mui-rightbar-bg'), false, 'v0.2.4 起不再写右栏属性（能力已移除）');
  assert.equal(doc.conversation.hasAttribute('data-mui-surface'), true, '会话内容面应被标记为图层宿主');
  assert.ok(doc.conversation.children.length >= 1, '应在会话内容面内插入背景图层');
});

test('wiring: 停在聊天会话页（active）时只开聊天页作用域', async () => {
  const { mod, doc } = await loadModule({ conversationPhase: 'active' });
  const ctx = {
    effect(factory) {
      const dispose = factory();
      return () => {
        if (typeof dispose === 'function') dispose();
      };
    },
    locale: { register: () => () => {}, bind: () => (key) => key },
    slots: {
      inject(_key, callback) {
        callback();
      },
      register() {
        return () => {};
      },
    },
  };

  assert.doesNotThrow(() => mod.apply(ctx));

  const root = doc.documentElement;
  assert.equal(root.hasAttribute('data-mui'), true);
  assert.equal(root.hasAttribute('data-mui-glass-chat'), true, '聊天页应开启聊天页毛玻璃作用域');
  assert.equal(root.hasAttribute('data-mui-glass-hero'), false, '聊天页不应开启 hero 毛玻璃作用域');
});

test('wiring: 面板页上残留的作用域属性会被清理干净', async () => {
  // 模拟「刚从会话页切到插件管理页」：此时 <html> 上还挂着上一页的标记。
  const { mod, doc } = await loadModule();
  const root = doc.documentElement;
  const scopeAttrs = [
    'data-mui',
    'data-mui-active',
    'data-mui-dark',
    'data-mui-glass-hero',
    'data-mui-glass-chat',
    'data-mui-title-static',
  ];
  for (const attr of scopeAttrs) root.setAttribute(attr, '');
  assert.equal(scopeAttrs.every((attr) => root.hasAttribute(attr)), true);

  const ctx = {
    effect(factory) {
      const dispose = factory();
      return () => {
        if (typeof dispose === 'function') dispose();
      };
    },
    locale: { register: () => () => {}, bind: () => (key) => key },
    slots: {
      inject(_key, callback) {
        callback();
      },
      register() {
        return () => {};
      },
    },
  };

  assert.doesNotThrow(() => mod.apply(ctx));

  for (const attr of scopeAttrs) {
    assert.equal(root.hasAttribute(attr), false, `面板页不应残留 ${attr}`);
  }
});

test('wiring: 设置页 inject 暴露 store / status / t 三个面', async () => {
  const { mod } = await loadModule();
  let options = null;
  const ctx = {
    effect(factory) {
      factory();
      return () => {};
    },
    locale: { register: () => () => {}, bind: () => (key) => key },
    slots: {
      inject(_key, callback) {
        callback();
      },
      register(config) {
        options = config;
        return () => {};
      },
    },
    get: () => null,
  };
  mod.apply(ctx);
  assert.ok(options && typeof options.inject === 'function');
  const injected = options.inject();
  assert.equal(typeof injected.store.getSnapshot, 'function');
  assert.equal(typeof injected.store.update, 'function');
  assert.equal(typeof injected.status.getSnapshot, 'function');
  assert.equal(typeof injected.t, 'function');
  assert.equal(injected.t('title'), 'title');
});

test('wiring: 自检文本可生成（覆盖座位背衬与 HUD 补场两段）', async () => {
  // diagnose() 只读 DOM，不写任何状态；它挂在设置页 inject 上，是实机排障的唯一入口，
  // 因此在没有浏览器的环境里至少确认它跑得通、且不会漏掉 v0.2.5 新加的两段回读。
  const { mod } = await loadModule({ conversationPhase: 'active' });
  let options = null;
  const ctx = {
    effect(factory) {
      factory();
      return () => {};
    },
    locale: { register: () => () => {}, bind: () => (key) => key },
    slots: {
      inject(_key, callback) {
        callback();
      },
      register(config) {
        options = config;
        return () => {};
      },
    },
    get: () => null,
  };
  mod.apply(ctx);
  const injected = options.inject();
  assert.equal(typeof injected.diagnose, 'function');
  const text = injected.diagnose();
  assert.equal(typeof text, 'string');
  assert.match(text, /seatVeil:/, '自检应回读座位背衬');
  assert.match(text, /hudBackdrop:/, '自检应回读 HUD 补场');
  assert.match(text, /sameAsPanel=/, '自检应回读补场与面板是否同层');
});
