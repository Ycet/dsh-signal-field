/**
 * 更名迁移单测（dsh-motion-ui → dsh-signal-field）
 *
 * 只测存储层：旧键在新键为空时被搬过去并删掉；新键已有值时不覆盖、只清残留；
 * 旧键是坏数据时也不抛错（回默认值即可）。这些行为决定用户升级后开关会不会丢。
 *
 * v0.5.0 补充：设置结构升到 v3 后，旧内容不再逐项映射（除总开关与帧率外回默认），
 * 所以这里既断言「搬运动作照旧」，也断言「旧内容读出来是 v3 默认值」。
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  LEGACY_STORAGE_KEY,
  STORAGE_KEY,
  createStore,
  defaults,
} from '../src/settings.js';

/** 最小 storage 替身：记录键值，便于断言迁移后的残留。 */
function storage(initial) {
  const map = new Map(Object.entries(initial || {}));
  return {
    map,
    getItem(key) {
      return map.has(key) ? map.get(key) : null;
    },
    setItem(key, value) {
      map.set(key, String(value));
    },
    removeItem(key) {
      map.delete(key);
    },
  };
}

test('迁移: 旧键会被搬到新键，并删除旧键', () => {
  const migratedValue = JSON.stringify({
    enabled: false,
    background: { intensity: 0.25, fps: 45 },
  });
  const sink = storage({ [LEGACY_STORAGE_KEY]: migratedValue });

  const store = createStore(sink);
  const snapshot = store.getSnapshot();

  assert.equal(snapshot.enabled, false, '总开关应保留旧配置的值');
  assert.equal(snapshot.frame.fps, 45, '帧率是唯一保留的旧参数');
  // v0.5.0：旧结构的效果参数不再映射，强度回默认 30%
  assert.equal(snapshot.pages.hero.background.intensity, 0.3, '旧强度不迁移');
  assert.equal(sink.getItem(STORAGE_KEY), migratedValue, '新键应写入旧内容（原样搬运）');
  assert.equal(sink.getItem(LEGACY_STORAGE_KEY), null, '旧键应被删除');
});

test('迁移: 新键已有值时不覆盖，只清理残留旧键', () => {
  const next = JSON.stringify({
    version: 3,
    enabled: false,
    pages: { chat: { background: { intensity: 0.9 } } },
  });
  const sink = storage({
    [STORAGE_KEY]: next,
    [LEGACY_STORAGE_KEY]: JSON.stringify({ enabled: true }),
  });

  const store = createStore(sink);

  assert.equal(store.getSnapshot().pages.chat.background.intensity, 0.9, '应使用新键里的值');
  assert.equal(store.getSnapshot().enabled, false, '旧键的总开关不得覆盖新键');
  assert.equal(sink.getItem(STORAGE_KEY), next, '新键内容不得被旧值覆盖');
  assert.equal(sink.getItem(LEGACY_STORAGE_KEY), null, '残留旧键应被清掉');
});

test('迁移: 旧键是坏数据时不抛错，回默认值且不污染新键', () => {
  const sink = storage({ [LEGACY_STORAGE_KEY]: '{ not json' });

  assert.doesNotThrow(() => {
    const store = createStore(sink);
    assert.deepEqual(store.getSnapshot(), defaults());
  });

  assert.equal(sink.getItem(LEGACY_STORAGE_KEY), null, '坏数据的旧键也应被清掉');
  assert.equal(sink.getItem(STORAGE_KEY), null, '坏数据不应被写进新键');
});

test('迁移: 没有旧键时行为与之前一致（只读新键）', () => {
  const sink = storage({});
  const store = createStore(sink);
  assert.deepEqual(store.getSnapshot(), defaults());
  store.update({ enabled: false });
  assert.equal(JSON.parse(sink.getItem(STORAGE_KEY)).enabled, false);
});
