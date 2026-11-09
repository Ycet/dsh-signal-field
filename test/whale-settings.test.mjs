/**
 * 鲸鱼设置模型测试（v0.4.0）
 *
 * 锁住三件本轮最容易出错的事：
 *   1. 默认值必须逐项等于迁移当时用户在 dsh-ascii-whales 里的实际取值；
 *   2. 归一化（钳位 + 按步长吸附）**不得**把任何默认值挪位——
 *      上游就踩过这个坑（0.75 被 0.1 的步长吸成 0.8、188 被 10 的步长吸成 190）；
 *   3. 设置页里写死的 min/max/step 必须与 WHALE_RANGES 完全一致
 *      （设置页不能 import，只能复制常量，所以这里强制两边对齐）。
 */

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { defaults, normalize, patch, sameState, WHALE_RANGES } from '../src/settings.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** 迁移当时用户在 dsh-ascii-whales 里的实际取值（截图逐项抄录）。 */
const EXPECTED_DEFAULTS = Object.freeze({
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
});

test('whale: 默认值逐项等于迁移当时的实际取值', () => {
  // v0.5.0：鲸鱼属于新建会话页，默认值挂在 pages.hero.whale
  assert.deepEqual(defaults().pages.hero.whale, EXPECTED_DEFAULTS);
});

test('whale: 归一化不会把默认值吸附挪位', () => {
  const raw = { version: 3, pages: { hero: { whale: EXPECTED_DEFAULTS } } };
  assert.deepEqual(
    normalize(raw).pages.hero.whale,
    EXPECTED_DEFAULTS,
    '默认值必须原样通过 num() 的吸附',
  );
});

test('whale: 缺分组时回落默认（旧存档升级路径）', () => {
  const legacy = { version: 2, enabled: true, pages: { hero: true, chat: true } };
  assert.deepEqual(normalize(legacy).pages.hero.whale, EXPECTED_DEFAULTS);
});

test('whale: 越界值被钳到区间端点', () => {
  const whaleOf = (whale) => normalize({ version: 3, pages: { hero: { whale } } }).pages.hero.whale;
  const low = whaleOf({ count: -5, speed: 0, size: 0, fishCount: -1, wake: -3 });
  assert.equal(low.count, WHALE_RANGES.count.min);
  assert.equal(low.speed, WHALE_RANGES.speed.min);
  assert.equal(low.size, WHALE_RANGES.size.min);
  assert.equal(low.fishCount, WHALE_RANGES.fishCount.min);
  assert.equal(low.wake, WHALE_RANGES.wake.min);

  const high = whaleOf({ count: 999, speed: 99, size: 99, fishCount: 99999, wake: 99 });
  assert.equal(high.count, WHALE_RANGES.count.max);
  assert.equal(high.speed, WHALE_RANGES.speed.max);
  assert.equal(high.size, WHALE_RANGES.size.max);
  assert.equal(high.fishCount, WHALE_RANGES.fishCount.max);
  assert.equal(high.wake, WHALE_RANGES.wake.max);
});

test('whale: 种类走白名单，非法值回落座头鲸', () => {
  const speciesOf = (species) =>
    normalize({ version: 3, pages: { hero: { whale: { species } } } }).pages.hero.whale.species;
  assert.equal(speciesOf('orca'), 'orca');
  assert.equal(speciesOf('humpback'), 'humpback');
  for (const bad of ['shark', '', null, 42, {}]) {
    assert.equal(speciesOf(bad), 'humpback', `非法种类：${String(bad)}`);
  }
});

test('whale: 开关只认布尔，其它一律回落默认', () => {
  const enabledOf = (enabled) =>
    normalize({ version: 3, pages: { hero: { whale: { enabled } } } }).pages.hero.whale.enabled;
  assert.equal(enabledOf(false), false);
  assert.equal(enabledOf('no'), true);
  assert.equal(enabledOf(0), true);
});

test('whale: 垃圾数值回落默认，不写 NaN', () => {
  const result = normalize({
    version: 3,
    pages: { hero: { whale: { count: Number.NaN, speed: Number.POSITIVE_INFINITY, size: null, wake: 'abc' } } },
  }).pages.hero.whale;
  assert.equal(result.count, EXPECTED_DEFAULTS.count);
  assert.equal(result.speed, EXPECTED_DEFAULTS.speed);
  assert.equal(result.size, EXPECTED_DEFAULTS.size);
  assert.equal(result.wake, EXPECTED_DEFAULTS.wake);
  for (const value of Object.values(result)) {
    if (typeof value === 'number') assert.ok(Number.isFinite(value), '归一化结果不得出现非有限数');
  }
});

test('whale: patch 只改显式出现的键，其余原样保留', () => {
  const base = normalize({
    version: 3,
    pages: { hero: { whale: { speed: 0.75, fishCount: 300 } } },
  });
  const next = patch(base, { pages: { hero: { whale: { count: 4 } } } });
  assert.equal(next.pages.hero.whale.count, 4);
  assert.equal(next.pages.hero.whale.speed, 0.75, '未提及的键不能被重置');
  assert.equal(next.pages.hero.whale.fishCount, 300, '未提及的键不能被重置');
  assert.equal(next.pages.hero.whale.species, base.pages.hero.whale.species);
  // 其它分组也不能被顺手改掉
  assert.equal(next.frame.fps, base.frame.fps);
  assert.equal(next.pages.hero.title.speed, base.pages.hero.title.speed);
  assert.equal(next.pages.hero.background.intensity, base.pages.hero.background.intensity);
  assert.equal(next.pages.chat.background.intensity, base.pages.chat.background.intensity);
});

test('whale: patch 传入的非法值会被归一化收拾', () => {
  const next = patch(normalize({}), {
    pages: { hero: { whale: { count: 999, species: 'nope' } } },
  });
  assert.equal(next.pages.hero.whale.count, WHALE_RANGES.count.max);
  assert.equal(next.pages.hero.whale.species, 'humpback');
});

test('whale: 未知键被丢弃，不进入状态', () => {
  const next = normalize({
    version: 3,
    pages: { hero: { whale: { color: '#ff0000', glyphMode: 'kanji', ghost: 1 } } },
  }).pages.hero.whale;
  assert.equal('color' in next, false);
  assert.equal('glyphMode' in next, false, '字符风格不迁移，状态里不该出现该键');
  assert.equal('ghost' in next, false);
});

test('whale: 只改鲸鱼不影响 sameState 之外的等价判断', () => {
  const build = (count) =>
    normalize({ version: 3, pages: { hero: { whale: { count } } } });
  assert.equal(sameState(build(2), build(2)), true);
  assert.equal(sameState(build(2), build(3)), false);
});

test('whale: 设置页写死的 min/max/step 与 WHALE_RANGES 完全一致', async () => {
  const source = await readFile(join(ROOT, 'src', 'settings-page.js'), 'utf8');
  // 只解析 WHALE_NUMBERS 那张表：{ key: "x", row: "y", min: a, max: b, step: c }
  const entries = [...source.matchAll(
    /\{\s*key:\s*"([A-Za-z]+)",\s*row:\s*"([A-Za-z]+)",\s*min:\s*(-?[\d.]+),\s*max:\s*(-?[\d.]+),\s*step:\s*(-?[\d.]+)\s*\}/g,
  )].map((m) => ({ key: m[1], row: m[2], min: Number(m[3]), max: Number(m[4]), step: Number(m[5]) }));

  assert.equal(entries.length, 11, '设置页应有 11 个鲸鱼数值项');
  assert.equal(entries.length, Object.keys(WHALE_RANGES).length, '两边的键数必须相同');
  for (const entry of entries) {
    const range = WHALE_RANGES[entry.key];
    assert.ok(range, `WHALE_RANGES 缺少键：${entry.key}`);
    assert.equal(entry.min, range.min, `${entry.key} 的 min 与 WHALE_RANGES 不一致`);
    assert.equal(entry.max, range.max, `${entry.key} 的 max 与 WHALE_RANGES 不一致`);
    assert.equal(entry.step, range.step, `${entry.key} 的 step 与 WHALE_RANGES 不一致`);
    assert.equal(entry.row, `rowWhale${entry.key[0].toUpperCase()}${entry.key.slice(1)}`);
  }
});
