/**
 * 设置模型单测（v0.5.0 / 结构 v3）
 *
 * v0.5.0 把设置从「全局效果」改成「按页面组织」：新建会话页与聊天会话页各有一套
 * 开关与参数，帧率提到顶层。这里锁住四件事：
 *   1. 默认值结构（三处：全局、hero、chat）；
 *   2. 旧存档的升级语义——**只保留总开关与帧率**，其余一律回默认（产品决策）；
 *   3. patch() 的深合并只改显式出现的键，两页互不串味；
 *   4. 存储层（读写、损坏数据、写入异常、reset、重开读回）。
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BLUR_RANGE,
  FPS_RANGE,
  INTENSITY_RANGE,
  SPEED_RANGE,
  STORAGE_KEY,
  createStatus,
  createStore,
  defaults,
  memoryStorage,
  normalize,
  patch,
  sameState,
} from '../src/settings.js';

/** 一份合法的 v3 存档，用来验证「新结构按值读取」。 */
function v3Input() {
  return {
    version: 3,
    enabled: false,
    frame: { fps: 45 },
    glass: { blur: 20 },
    pages: {
      hero: {
        enabled: false,
        background: { enabled: false, idle: false, interact: false, intensity: 0.8, speed: 1.75 },
        title: { enabled: false, idle: false, interact: false, speed: 1.5 },
        whale: { enabled: false, species: 'orca', count: 7, speed: 2, size: 3, fishCount: 300 },
        glass: false,
      },
      chat: {
        enabled: false,
        background: { enabled: false, idle: false, interact: false, intensity: 0.65, speed: 0.5 },
        glass: false,
      },
    },
  };
}

test('defaults: v3 结构——全局帧率 + 两页各自的效果分组', () => {
  const state = defaults();
  assert.equal(state.version, 3);
  assert.equal(state.enabled, true);
  assert.deepEqual(state.frame, { fps: 30 });
  assert.deepEqual(state.glass, { blur: 14 });
  assert.deepEqual(Object.keys(state).sort(), ['enabled', 'frame', 'glass', 'pages', 'version']);

  assert.deepEqual(state.pages.hero, {
    enabled: true,
    background: { enabled: true, idle: true, interact: true, intensity: 0.3, speed: 1 },
    title: { enabled: true, idle: true, interact: true, speed: 1 },
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
    glass: true,
  });
  // 聊天会话页没有标题；v0.5.1 起也有鲸鱼（默认值与新建页一致）
  assert.deepEqual(state.pages.chat, {
    enabled: true,
    background: { enabled: true, idle: true, interact: true, intensity: 0.3, speed: 1 },
    whale: state.pages.hero.whale,
    glass: true,
  });
  assert.notEqual(state.pages.chat.whale, state.pages.hero.whale, '两页的鲸鱼分组不得共享引用');
});

test('defaults: 两页的背景对象互不共享引用', () => {
  const state = defaults();
  assert.notEqual(state.pages.hero.background, state.pages.chat.background);
  state.pages.hero.background.intensity = 0.9;
  assert.equal(state.pages.chat.background.intensity, 0.3);
});

test('normalize: 新结构按值读取', () => {
  const state = normalize(v3Input());
  assert.equal(state.version, 3);
  assert.equal(state.enabled, false);
  assert.equal(state.frame.fps, 45);
  assert.equal(state.glass.blur, 20);
  assert.equal(state.pages.hero.enabled, false);
  assert.equal(state.pages.hero.background.intensity, 0.8);
  assert.equal(state.pages.hero.background.speed, 1.75);
  assert.equal(state.pages.hero.title.speed, 1.5);
  assert.equal(state.pages.hero.whale.species, 'orca');
  assert.equal(state.pages.hero.whale.fishCount, 300);
  assert.equal(state.pages.chat.background.intensity, 0.65);
  assert.equal(state.pages.chat.glass, false);
});

test('升级: v0.4.x 的全局效果参数一律回默认，只保留总开关与帧率', () => {
  const legacy = {
    version: 2,
    enabled: false,
    pages: { hero: false, chat: false },
    title: { idle: false, interact: false, speed: 2 },
    background: { idle: false, interact: false, intensity: 0.55, fps: 45, speed: 1.5 },
    glass: { enabled: false, blur: 20 },
    whale: { enabled: false, species: 'orca', count: 7, fishCount: 300 },
  };
  const state = normalize(legacy);
  assert.equal(state.version, 3);
  // 唯一保留的两项
  assert.equal(state.enabled, false);
  assert.equal(state.frame.fps, 45);
  // 其余全部回默认（含页面开关、毛玻璃开关、模糊半径、标题/背景/鲸鱼参数）
  assert.deepEqual(state.pages, defaults().pages);
  assert.equal(state.glass.blur, 14);
});

test('升级: v0.2.8 及更早的 surfaces 结构不再迁移', () => {
  const state = normalize({
    version: 1,
    enabled: true,
    surfaces: {
      hero: { title: true, background: false, glass: false },
      chat: { background: false, glass: false },
      panels: { hudGlass: true },
    },
    background: { intensity: 0.55 },
    glass: { blur: 20 },
  });
  assert.equal('surfaces' in state, false);
  assert.deepEqual(state.pages, defaults().pages);
  assert.equal(state.glass.blur, 14);
});

test('升级: 没有 fps 的极老存档读出默认 30', () => {
  const state = normalize({ version: 1, enabled: true });
  assert.equal(state.frame.fps, 30);
});

test('升级: frame.fps 优先于旧 background.fps', () => {
  const state = normalize({ frame: { fps: 60 }, background: { fps: 15 } });
  assert.equal(state.frame.fps, 60);
});

test('normalize: 数值钳位与步长吸附', () => {
  const hero = normalize({
    pages: { hero: { background: { intensity: 7, speed: 9 }, title: { speed: 0.1 } } },
    frame: { fps: 999 },
  });
  assert.equal(hero.pages.hero.background.intensity, INTENSITY_RANGE.max);
  assert.equal(hero.pages.hero.background.speed, SPEED_RANGE.max);
  assert.equal(hero.pages.hero.title.speed, SPEED_RANGE.min);
  assert.equal(hero.frame.fps, FPS_RANGE.max);

  const chat = normalize({
    version: 3,
    pages: { chat: { background: { intensity: -3, speed: '1.5' } } },
    frame: { fps: 33 },
    glass: { blur: 13.6 },
  });
  assert.equal(chat.pages.chat.background.intensity, INTENSITY_RANGE.min);
  assert.equal(chat.pages.chat.background.speed, 1);
  assert.equal(chat.frame.fps, 35);
  assert.equal(chat.glass.blur, 14);
  assert.equal(normalize({ version: 3, glass: { blur: 999 } }).glass.blur, BLUR_RANGE.max);
});

test('normalize: 帧率非法值一律回落 30（不能变成 NaN 或 0）', () => {
  for (const bad of ['40', null, undefined, NaN, Infinity, {}, []]) {
    assert.equal(normalize({ frame: { fps: bad } }).frame.fps, 30, `非法值 ${String(bad)}`);
  }
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
    frame: { fps: 30, extra: 1 },
    pages: {
      hero: {
        enabled: 'no',
        stranger: true,
        background: { enabled: 'maybe', unknown: 1 },
        title: { idle: false },
        whale: { species: 'nope', ghost: 1 },
      },
      chat: { glass: 'yes' },
      panels: { hudGlass: true },
    },
    glass: { enabled: false },
  });
  assert.equal(state.enabled, true);
  assert.equal(state.pages.hero.enabled, true);
  assert.equal(state.pages.hero.background.enabled, true);
  assert.equal(state.pages.hero.title.idle, false);
  assert.equal(state.pages.hero.whale.species, 'humpback');
  assert.equal(state.pages.chat.glass, true);
  assert.equal('stranger' in state.pages.hero, false);
  assert.equal('panels' in state.pages, false);
  assert.equal('unknown' in state, false);
  assert.equal('extra' in state.frame, false);
  // 旧版的 glass.enabled 已不是合法键
  assert.deepEqual(Object.keys(state.glass), ['blur']);
});

test('patch: 深合并只改显式出现的键', () => {
  const base = defaults();
  const next = patch(base, { pages: { hero: { background: { intensity: 0.6 } } } });
  assert.equal(next.pages.hero.background.intensity, 0.6);
  // 同页其他参数、另一页、其它分组都不动
  assert.equal(next.pages.hero.background.speed, 1);
  assert.equal(next.pages.hero.background.idle, true);
  assert.equal(next.pages.chat.background.intensity, 0.3);
  assert.equal(next.pages.hero.title.idle, true);
});

test('patch: 两页的同名开关互不影响', () => {
  const base = defaults();
  const heroOff = patch(base, { pages: { hero: { background: { enabled: false } } } });
  assert.equal(heroOff.pages.hero.background.enabled, false);
  assert.equal(heroOff.pages.chat.background.enabled, true);

  const chatOff = patch(base, { pages: { chat: { background: { enabled: false } } } });
  assert.equal(chatOff.pages.chat.background.enabled, false);
  assert.equal(chatOff.pages.hero.background.enabled, true);
});

test('patch: 页面总开关与毛玻璃开关可单独改动', () => {
  const next = patch(defaults(), {
    pages: { hero: { enabled: false, glass: false }, chat: { enabled: false, glass: false } },
  });
  assert.equal(next.pages.hero.enabled, false);
  assert.equal(next.pages.hero.glass, false);
  assert.equal(next.pages.chat.enabled, false);
  assert.equal(next.pages.chat.glass, false);
  // 页面关掉不会连带改动效果开关本身
  assert.equal(next.pages.hero.background.enabled, true);
  assert.equal(next.pages.chat.background.enabled, true);
});

test('patch: 全局帧率与模糊可单独改动', () => {
  const next = patch(defaults(), { frame: { fps: 60 }, glass: { blur: 20 } });
  assert.equal(next.frame.fps, 60);
  assert.equal(next.glass.blur, 20);
  assert.equal(next.pages.hero.background.intensity, 0.3);
  // 不传时保持原值，不被默认值悄悄覆盖
  const after = patch(next, { pages: { hero: { background: { intensity: 0.8 } } } });
  assert.equal(after.frame.fps, 60);
  assert.equal(after.glass.blur, 20);
});

test('patch: partial 中的 undefined 不覆盖现有值', () => {
  const next = patch(defaults(), {
    pages: { hero: { title: { idle: undefined, interact: false } } },
  });
  assert.equal(next.pages.hero.title.idle, true);
  assert.equal(next.pages.hero.title.interact, false);
});

test('patch: 旧字段名不再生效', () => {
  const legacyShape = patch(defaults(), {
    title: { idle: false },
    background: { intensity: 0.9, fps: 60 },
    glass: { enabled: false },
    surfaces: { hero: { glass: false } },
  });
  assert.deepEqual(legacyShape, defaults());
});

test('patch: 非法 partial 不抛错', () => {
  for (const partial of [undefined, null, 1, 'x', []]) {
    assert.deepEqual(patch(defaults(), partial), defaults());
  }
});

test('normalize: 每次返回新对象，不复用默认值引用', () => {
  const a = defaults();
  const b = defaults();
  assert.notEqual(a, b);
  assert.notEqual(a.pages.hero, b.pages.hero);
  const normalized = normalize(undefined);
  a.pages.hero.background.intensity = 0.9;
  assert.equal(normalize(undefined).pages.hero.background.intensity, 0.3);
  assert.equal(normalized.pages.hero.background.intensity, 0.3);
});

test('sameState: 归一化后相同即视为无变化', () => {
  assert.equal(sameState(defaults(), normalize({ irrelevant: true })), true);
  assert.equal(sameState(defaults(), patch(defaults(), { enabled: false })), false);
  assert.equal(
    sameState(defaults(), patch(defaults(), { pages: { chat: { glass: false } } })),
    false,
  );
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

  store.update({ frame: { fps: 60 } });
  assert.equal(store.getSnapshot().frame.fps, 60);
  assert.equal(seen.length, 1);
  assert.equal(JSON.parse(storage.getItem(STORAGE_KEY)).frame.fps, 60);

  off();
  store.update({ frame: { fps: 45 } });
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
  store.update({ frame: { fps: 30 } });
  assert.equal(calls, 0);
  assert.equal(storage.getItem(STORAGE_KEY), before);
});

test('createStore: 重开（新实例）能读回上次设置', () => {
  const storage = memoryStorage();
  const first = createStore(storage);
  first.update({
    enabled: false,
    pages: { hero: { background: { enabled: false }, title: { speed: 1.5 } } },
  });
  const second = createStore(storage);
  const state = second.getSnapshot();
  assert.equal(state.enabled, false);
  assert.equal(state.pages.hero.background.enabled, false);
  assert.equal(state.pages.hero.title.speed, 1.5);
  assert.equal(state.pages.chat.background.enabled, true);
});

test('createStore: 读到旧 v2 存档时按升级语义重置', () => {
  const storage = memoryStorage({
    [STORAGE_KEY]: JSON.stringify({
      version: 2,
      enabled: false,
      pages: { hero: false, chat: true },
      background: { intensity: 0.7, fps: 60 },
    }),
  });
  const state = createStore(storage).getSnapshot();
  assert.equal(state.version, 3);
  assert.equal(state.enabled, false);
  assert.equal(state.frame.fps, 60);
  assert.equal(state.pages.hero.enabled, true, '旧页面开关不迁移');
  assert.equal(state.pages.hero.background.intensity, 0.3, '旧强度不迁移');
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
  store.update({
    enabled: false,
    pages: { hero: { title: { idle: false }, whale: { species: 'orca' } } },
  });
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
