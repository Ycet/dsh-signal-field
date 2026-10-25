import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BLUR_RANGE,
  INTENSITY_RANGE,
  STORAGE_KEY,
  createStatus,
  createStore,
  defaults,
  memoryStorage,
  normalize,
  patch,
  sameState,
} from '../src/settings.js';

test('defaults: 两个页面 + 六个效果项，强度默认 30%', () => {
  const state = defaults();
  assert.equal(state.version, 2);
  assert.equal(state.enabled, true);
  assert.deepEqual(state.pages, { hero: true, chat: true });
  assert.deepEqual(state.title, { idle: true, interact: true });
  assert.deepEqual(state.background, { idle: true, interact: true, intensity: 0.3 });
  assert.deepEqual(state.glass, { enabled: true, blur: 14 });
  // 设置页模块 1 两行 + 模块 2 五项开关（强度是滑块，不计数）
  const switches = [
    state.pages.hero,
    state.pages.chat,
    state.title.idle,
    state.title.interact,
    state.background.idle,
    state.background.interact,
    state.glass.enabled,
  ];
  assert.equal(switches.every(Boolean), true);
});

test('defaults: 不再有 surfaces 结构，模糊半径固定 14', () => {
  const state = defaults();
  assert.equal('surfaces' in state, false);
  assert.equal(state.glass.blur, 14);
  assert.deepEqual(Object.keys(state).sort(), [
    'background',
    'enabled',
    'glass',
    'pages',
    'title',
    'version',
  ]);
});

test('迁移: 旧「按页 × 按效果」结构映射为页面开关 + 全局效果', () => {
  const state = normalize({
    version: 1,
    enabled: true,
    title: { idle: false, interact: true },
    background: { idle: true, interact: false, intensity: 0.55 },
    surfaces: {
      hero: { title: true, background: false, glass: false },
      chat: { background: false, glass: false },
      panels: { hudGlass: true },
      plugins: { background: false },
    },
    glass: { blur: 20 },
  });
  // 新增会话页任一效果开着 → 页面开启；聊天页两项全关 → 页面关闭
  assert.deepEqual(state.pages, { hero: true, chat: false });
  // 两页玻璃都关 → 全局玻璃关闭
  assert.equal(state.glass.enabled, false);
  // 旧默认强度 0.55 迁移为新默认 0.30；模糊半径保留原值
  assert.equal(state.background.intensity, 0.3);
  assert.equal(state.glass.blur, 20);
  // 旧字段与未知页面组都不再出现在结果里
  assert.equal('surfaces' in state, false);
});

test('迁移: 手调过的强度不被改写，新结构也不再被迁移', () => {
  const tuned = normalize({
    version: 1,
    background: { intensity: 0.7 },
    surfaces: { hero: { glass: true } },
  });
  assert.equal(tuned.background.intensity, 0.7);

  // 已经是 v2 结构：0.55 是用户自己拖的值，必须原样保留
  const kept = normalize({ version: 2, background: { intensity: 0.55 } });
  assert.equal(kept.background.intensity, 0.55);
  const pages = normalize({ version: 2, pages: { hero: false, chat: true } });
  assert.deepEqual(pages.pages, { hero: false, chat: true });
});

test('patch: 页面开关与玻璃总开关可单独改动，其余保持', () => {
  const patched = patch(defaults(), { pages: { chat: false }, glass: { enabled: false } });
  assert.equal(patched.pages.chat, false);
  assert.equal(patched.pages.hero, true);
  assert.equal(patched.glass.enabled, false);
  assert.equal(patched.glass.blur, 14);
  // 旧字段名不再被接受
  const legacyPatch = patch(defaults(), { surfaces: { hero: { glass: false } } });
  assert.equal(legacyPatch.glass.enabled, true);
});

test('normalize: 非对象输入回默认值', () => {
  for (const input of [undefined, null, 42, 'x', [], true]) {
    assert.deepEqual(normalize(input), defaults());
  }
});

test('normalize: 丢弃未知键、类型错误回默认', () => {
  const state = normalize({
    enabled: 'yes',
    unknown: 1,
    title: { idle: false, interact: 'no', extra: true },
    pages: { hero: false, stranger: true },
    glass: { enabled: 'maybe' },
  });
  assert.equal(state.enabled, true);
  assert.equal(state.title.idle, false);
  assert.equal(state.title.interact, true);
  assert.equal(state.pages.hero, false);
  assert.equal(state.glass.enabled, true);
  assert.equal('unknown' in state, false);
  assert.equal('stranger' in state.pages, false);
  assert.equal('surfaces' in state, false);
});

test('normalize: 数值钳位与步长吸附', () => {
  assert.equal(normalize({ background: { intensity: 7 } }).background.intensity, INTENSITY_RANGE.max);
  assert.equal(normalize({ background: { intensity: -3 } }).background.intensity, INTENSITY_RANGE.min);
  assert.equal(normalize({ background: { intensity: 0.33 } }).background.intensity, 0.35);
  assert.equal(normalize({ glass: { blur: 999 } }).glass.blur, BLUR_RANGE.max);
  assert.equal(normalize({ glass: { blur: -1 } }).glass.blur, BLUR_RANGE.min);
  assert.equal(normalize({ glass: { blur: 13.6 } }).glass.blur, 14);
  assert.equal(normalize({ glass: { blur: 'wide' } }).glass.blur, 14);
});

test('normalize: 每次返回新对象，不复用默认值引用', () => {
  const a = defaults();
  const b = defaults();
  assert.notEqual(a, b);
  assert.notEqual(a.title, b.title);
  const normalized = normalize(undefined);
  a.title.idle = false;
  assert.equal(normalize(undefined).title.idle, true);
  assert.equal(normalized.title.idle, true);
});

test('patch: 只改显式出现的键，其余保持不变', () => {
  const base = defaults();
  const next = patch(base, { pages: { hero: false } });
  assert.equal(next.pages.hero, false);
  assert.equal(next.pages.chat, true);
  assert.equal(next.background.intensity, 0.3);
  // 旧字段名不再生效
  const legacy = patch(base, { surfaces: { hero: { glass: false } } });
  assert.equal(legacy.glass.enabled, true);
});

test('patch: partial 中的 undefined 不覆盖现有值', () => {
  const next = patch(defaults(), { title: { idle: undefined, interact: false } });
  assert.equal(next.title.idle, true);
  assert.equal(next.title.interact, false);
});

test('patch: 非法 partial 不抛错', () => {
  for (const partial of [undefined, null, 1, 'x', []]) {
    assert.deepEqual(patch(defaults(), partial), defaults());
  }
});

test('sameState: 归一化后相同即视为无变化', () => {
  assert.equal(sameState(defaults(), normalize({ irrelevant: true })), true);
  assert.equal(sameState(defaults(), patch(defaults(), { enabled: false })), false);
});

test('createStore: 无存储数据时返回默认值', () => {
  const store = createStore(memoryStorage());
  assert.deepEqual(store.getSnapshot(), defaults());
});

test('createStore: 损坏 JSON 回默认并清掉坏键', () => {
  const storage = memoryStorage({ [STORAGE_KEY]: '{not json' });
  const store = createStore(storage);
  assert.deepEqual(store.getSnapshot(), defaults());
  assert.equal(storage.getItem(STORAGE_KEY), null);
});

test('createStore: update 写盘并通知订阅者', () => {
  const storage = memoryStorage();
  const store = createStore(storage);
  const seen = [];
  const off = store.subscribe((state) => seen.push(state));

  store.update({ glass: { blur: 20 } });
  assert.equal(store.getSnapshot().glass.blur, 20);
  assert.equal(seen.length, 1);
  assert.equal(JSON.parse(storage.getItem(STORAGE_KEY)).glass.blur, 20);

  off();
  store.update({ glass: { blur: 22 } });
  assert.equal(seen.length, 1);
});

test('createStore: 无实质变化不写盘、不通知', () => {
  const storage = memoryStorage();
  const store = createStore(storage);
  let calls = 0;
  store.subscribe(() => {
    calls += 1;
  });
  const before = storage.getItem(STORAGE_KEY);
  store.update({ glass: { blur: 14 } });
  assert.equal(calls, 0);
  assert.equal(storage.getItem(STORAGE_KEY), before);
});

test('createStore: 重开（新实例）能读回上次设置', () => {
  const storage = memoryStorage();
  const first = createStore(storage);
  first.update({ enabled: false, pages: { chat: false }, glass: { enabled: false } });
  const second = createStore(storage);
  const state = second.getSnapshot();
  assert.equal(state.enabled, false);
  assert.equal(state.pages.chat, false);
  assert.equal(state.pages.hero, true);
  assert.equal(state.glass.enabled, false);
});

test('createStore: 写入异常不影响内存状态', () => {
  const failing = {
    getItem: () => null,
    setItem: () => {
      throw new Error('quota');
    },
    removeItem: () => {},
  };
  const store = createStore(failing);
  assert.doesNotThrow(() => store.update({ enabled: false }));
  assert.equal(store.getSnapshot().enabled, false);
});

test('createStore: reset 恢复默认值', () => {
  const store = createStore(memoryStorage());
  store.update({ enabled: false, title: { idle: false } });
  store.reset();
  assert.deepEqual(store.getSnapshot(), defaults());
});

test('createStore: 不传 storage 时退回内存实现', () => {
  const store = createStore(undefined);
  assert.doesNotThrow(() => store.update({ glass: { blur: 3 } }));
  assert.equal(store.getSnapshot().glass.blur, 3);
});

test('createStatus: set 只在变化时通知', () => {
  const status = createStatus();
  let calls = 0;
  const off = status.subscribe(() => {
    calls += 1;
  });
  status.set({ titleAvailable: true });
  status.set({ titleAvailable: true });
  assert.equal(calls, 1);
  assert.equal(status.getSnapshot().titleAvailable, true);
  off();
  status.set({ titleAvailable: false });
  assert.equal(calls, 1);
});
