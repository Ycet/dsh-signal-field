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

test('defaults: 10 个独立开关全开、总开关开、参数取参考值', () => {
  const state = defaults();
  assert.equal(state.enabled, true);
  assert.deepEqual(state.title, { idle: true, interact: true });
  assert.deepEqual(state.background, { idle: true, interact: true, intensity: 0.55 });
  assert.deepEqual(state.glass, { blur: 14 });
  const surfaceFlags = [
    state.surfaces.hero.title,
    state.surfaces.hero.background,
    state.surfaces.hero.glass,
    state.surfaces.chat.background,
    state.surfaces.chat.glass,
    state.surfaces.panels.hudGlass,
  ];
  assert.equal(surfaceFlags.every(Boolean), true);
  const detailFlags = [
    state.title.idle,
    state.title.interact,
    state.background.idle,
    state.background.interact,
  ];
  assert.equal(detailFlags.length + surfaceFlags.length, 10);
});

test('defaults: 页面两组 + 一个与页面无关的跨区域组', () => {
  const state = defaults();
  assert.deepEqual(Object.keys(state.surfaces).sort(), ['chat', 'hero', 'panels']);
  assert.deepEqual(Object.keys(state.surfaces.hero).sort(), ['background', 'glass', 'title']);
  assert.deepEqual(Object.keys(state.surfaces.chat).sort(), ['background', 'glass']);
  assert.deepEqual(Object.keys(state.surfaces.panels).sort(), ['hudGlass']);
});

test('normalize: 已移出作用范围的旧页面字段被静默丢弃', () => {
  const state = normalize({
    surfaces: {
      plugins: { background: false },
      schedules: { background: false },
      hero: { title: false },
    },
  });
  assert.deepEqual(Object.keys(state.surfaces).sort(), ['chat', 'hero', 'panels']);
  assert.equal(state.surfaces.hero.title, false);
  assert.equal('plugins' in state.surfaces, false);
  assert.equal('schedules' in state.surfaces, false);
});

test('normalize/patch: 跨区域开关可单独关闭，且右栏旧字段被丢弃', () => {
  const off = normalize({ surfaces: { panels: { hudGlass: false } } });
  assert.equal(off.surfaces.panels.hudGlass, false);

  // v0.2.4 移除了右侧边栏背景：旧存档里残留的 rightbarBackground 不应被恢复
  const legacy = normalize({ surfaces: { panels: { hudGlass: true, rightbarBackground: false } } });
  assert.equal('rightbarBackground' in legacy.surfaces.panels, false);

  const patched = patch(defaults(), { surfaces: { panels: { rightbarBackground: false } } });
  assert.equal('rightbarBackground' in patched.surfaces.panels, false);
  assert.equal(patched.surfaces.panels.hudGlass, true);
  assert.equal(patched.surfaces.chat.glass, true);
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
    surfaces: { hero: { title: false }, stranger: { background: false } },
  });
  assert.equal(state.enabled, true);
  assert.equal(state.title.idle, false);
  assert.equal(state.title.interact, true);
  assert.equal(state.surfaces.hero.title, false);
  assert.equal('unknown' in state, false);
  assert.equal('stranger' in state.surfaces, false);
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
  const next = patch(base, { surfaces: { hero: { glass: false } } });
  assert.equal(next.surfaces.hero.glass, false);
  assert.equal(next.surfaces.hero.title, true);
  assert.equal(next.surfaces.chat.glass, true);
  assert.equal(next.background.intensity, 0.55);
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
  first.update({ enabled: false, surfaces: { chat: { glass: false } } });
  const second = createStore(storage);
  assert.equal(second.getSnapshot().enabled, false);
  assert.equal(second.getSnapshot().surfaces.chat.glass, false);
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
