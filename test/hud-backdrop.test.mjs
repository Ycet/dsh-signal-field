/**
 * HUD 补场的实现契约（v0.3.1）
 *
 * 本轮修两件事，都属于「改回去不会报错、但用户立刻能看出来」的类型，所以用源码级断言钉住：
 *
 *   1. 补场必须 `intro: false`。它每次进聊天页都会被重建，一旦恢复入场揭示，
 *      就会每次重播 1.8s 的展开动画 —— 这正是「面板背后那块背景要过几秒才出来」的原因。
 *   2. 补场的 `interact` 必须来自设置。写死 `false` 时功能照样能跑，只是面板背后的
 *      背景完全没有鼠标交互，编译器与既有测试都发现不了。
 *
 * 补场依赖 WebGL 与固定定位，node 里无法实例化，所以这里锁的是实现方式而不是像素。
 * 「是否真的立即出现 / 拖尾是否自然」仍需人看屏幕验收。
 */

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { CSS } from '../src/styles.js';

const STAGE = await readFile(new URL('../src/stage.js', import.meta.url), 'utf8');
const FIELD = await readFile(new URL('../src/field.js', import.meta.url), 'utf8');

/** 取出一个具名函数的源码片段：从声明处切到 followedBy 标记。 */
function sliceFunction(source, declaration, followedBy) {
  const start = source.indexOf(declaration);
  assert.ok(start >= 0, `找不到 ${declaration}`);
  const end = source.indexOf(followedBy, start);
  assert.ok(end > start, `找不到 ${declaration} 的结束标记`);
  return source.slice(start, end);
}

/** 把样式文本拆成「选择器 / 声明块」序列（与 parity.test.mjs 同款扁平解析）。 */
function blocks(css) {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
  return [...clean.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) => ({
    selector: match[1].trim(),
    body: match[2],
  }));
}

test('补场: createField 必须传 intro:false（不得重播入场揭示）', () => {
  const body = sliceFunction(STAGE, 'function syncHudBackdrop', '/** 面板会随窗口缩放');
  assert.match(body, /createField\(hudBackdropEl, \{/, '补场仍需用专用宿主创建引擎');
  assert.match(body, /intro: false/, '补场必须关闭入场揭示');
});

test('补场: interact 必须来自设置，不得写死 false', () => {
  const body = sliceFunction(STAGE, 'function syncHudBackdrop', '/** 面板会随窗口缩放');
  assert.match(
    body,
    /interact: state\.background\.interact/,
    '补场交互应跟随「背景鼠标交互」开关',
  );
  assert.doesNotMatch(
    body,
    /interact: false/,
    '补场主路径不得再把 interact 写死为 false（暂停路径在 placeHudBackdrop 里，属于另一处）',
  );
});

test('补场: 面板未就位时的暂停路径仍然保留（interact:false 只应出现在那里）', () => {
  const body = sliceFunction(STAGE, 'function placeHudBackdrop', 'function syncHudBackdrop');
  assert.match(body, /interact: false/, '面板没有几何时仍需暂停补场动画');
});

test('内容区: 不得把 intro:false 传染给内容区的场（观感零回归）', () => {
  const body = sliceFunction(STAGE, 'field = createField(layerEl, {', 'engineState = field.fallback');
  assert.doesNotMatch(body, /intro/, '内容区必须保留下 1.8s 入场揭示');
  assert.match(body, /interact: state\.background\.interact/, '内容区交互本就跟随设置');
});

test('引擎: applyOptions 必须支持 intro 并在关闭时补满 reveal', () => {
  assert.match(FIELD, /typeof src\.intro === "boolean"/, '引擎需接受 intro 选项');
  assert.match(FIELD, /if \(!settings\.intro\) state\.reveal = 1;/, '关闭揭示时必须同步补满进度');
});

test('样式: 补场去掉淡入，内容区仍保留 0.5s 过渡', () => {
  const parsed = blocks(CSS);
  const hud = parsed.find((block) => /\[data-mui-field\]\[data-mui-field-hud\]$/.test(block.selector));
  assert.ok(hud, '缺少补场规则');
  assert.match(hud.body, /transition:\s*none/, '补场必须立即显示，不能再淡入');
  // 补场原有的定位与不透明底色不能因为这次改动丢失
  assert.match(hud.body, /position:\s*fixed/);
  assert.match(hud.body, /background:\s*var\(--mui-surface-base\)/);

  const base = parsed.find((block) => /^\[data-mui-field\]$/.test(block.selector));
  assert.ok(base, '缺少信号场图层基础规则');
  assert.match(base.body, /transition:\s*opacity \.5s/, '内容区的 0.5s 淡入必须保留');
});

test('设置: 本轮不新增设置项，语言包仍为 33 个 runtime 键且中英同序', async () => {
  const zh = JSON.parse(await readFile(new URL('../locale/zh.json', import.meta.url), 'utf8')).runtime;
  const en = JSON.parse(await readFile(new URL('../locale/en.json', import.meta.url), 'utf8')).runtime;
  assert.equal(Object.keys(zh).length, 33);
  assert.deepEqual(Object.keys(zh), Object.keys(en));
});
