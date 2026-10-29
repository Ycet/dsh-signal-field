/**
 * 鲸鱼移植块的源码级契约测试（v0.4.0）
 *
 * 为什么用「读源码 + 断言」而不是跑一遍：移植块依赖 Canvas2D / ResizeObserver /
 * IntersectionObserver / WebGL 之外的浏览器环境，node 里无法实例化。
 * 但这些约定一旦被将来的人改回去，观感或合规就会悄悄坏掉，所以钉在源码文本上：
 *
 *   - 移植段必须留在 IIFE 里（否则 src/stage.js 的顶层 `clamp` 会被它覆盖）；
 *   - 上游署名与 MIT 指引必须在文件头（合规）；
 *   - 不得把 prefers-reduced-motion 判定加回来（产品决策：鲸鱼按配置帧率跑）；
 *   - 不得把 Kanji 渲染器带回来（字符风格固定 ASCII，那 582 行已整段移除）；
 *   - 帧率门控与交互拆装这两个适配点必须存在。
 *
 * 另外两条是行为断言（paceDecision 是纯函数，可以直接跑）。
 */

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { WHALE_ENGINE } from '../src/whale-engine.js';
import { WHALE_MONO_URI } from '../src/whale-fonts.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const read = (relative) => readFile(join(ROOT, relative), 'utf8');

/**
 * 去掉注释，只留可执行代码。
 *
 * 三处「已移除」的断言必须看代码而不是原文——文件头与适配注释里**本来就应该**
 * 提到 Painter、drawStill、prefers-reduced-motion 这些名字（说明改了什么），
 * 直接 grep 原文会把这些说明文字误判成残留。
 * whale-engine.js 里没有 base64、没有 URL，所以这个朴素剥离是安全的。
 */
function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\/\/[^\n]*$/gm, '');
}

test('whale-engine: 移植段被 IIFE 包裹，且只导出 WHALE_ENGINE', async () => {
  const source = await read('src/whale-engine.js');
  assert.match(source, /export const WHALE_ENGINE = \(\(\) => \{/, '必须用 IIFE 包裹');
  assert.match(source, /\}\)\(\);\s*$/, '文件必须以 IIFE 调用收尾');
  // 顶层只允许一个具名导出：多一个就意味着有标识符泄漏到了共享闭包
  const exports = [...source.matchAll(/^export /gm)];
  assert.equal(exports.length, 1, `只允许一个 export，实际 ${exports.length} 个`);
});

test('whale-engine: 上游署名与许可指引在文件头', async () => {
  const source = await read('src/whale-engine.js');
  const head = source.slice(0, 2400);
  assert.match(head, /stackedlol\/ascii-sharks/);
  assert.match(head, /Copyright \(c\) 2026 drewdi/);
  assert.match(head, /MIT/);
  assert.match(head, /THIRD_PARTY_NOTICES\.md/);
  assert.match(head, /c521e24a787e6d4cc460d4cf2b9815f25e4fe453/);
});

test('whale-engine: 不再理会 prefers-reduced-motion', async () => {
  const code = stripComments(await read('src/whale-engine.js'));
  assert.equal(code.includes('prefers-reduced-motion'), false, '不得重新引入减少动效判定');
  assert.equal(code.includes('drawStill'), false, 'drawStill 应随 reducedMotion 一起移除');
  assert.equal(code.includes('reducedMotion'), false);
});

test('whale-engine: Kanji 渲染器整段移除', async () => {
  const code = stripComments(await read('src/whale-engine.js'));
  for (const gone of [
    'Painter',
    'GlyphAtlas',
    'InkRamp',
    'measureInk',
    'SKIN_POOL',
    'fontCss',
    'SFX',
    'ascii-kanji-sharks',
  ]) {
    assert.equal(code.includes(gone), false, `移植块仍残留 Kanji 相关标识：${gone}`);
  }
  // 但仍然保留 ASCII 渲染器
  assert.equal(code.includes('AsciiRenderer'), true);
});

test('whale-engine: 五处适配点都在', async () => {
  const source = await read('src/whale-engine.js');
  for (const marker of ['[适配 1]', '[适配 2]', '[适配 3]', '[适配 4]', '[适配 5]']) {
    assert.equal(source.includes(marker), true, `缺少适配点标注：${marker}`);
  }
  // 帧率与交互的运行期入口
  for (const api of ['setFpsCap(', 'setInteract(', 'attachPointer(', 'detachPointer(']) {
    assert.equal(source.includes(api), true, `引擎缺少运行期接口：${api}`);
  }
});

test('whale-engine: 工厂暴露 create / paceDecision', () => {
  assert.equal(typeof WHALE_ENGINE.create, 'function');
  assert.equal(typeof WHALE_ENGINE.paceDecision, 'function');
  assert.equal(WHALE_ENGINE.STEP, 1 / 60);
  assert.equal(WHALE_ENGINE.MAX_STEPS, 4);
});

test('whale-engine: 限帧判定符合预期（纯函数）', () => {
  const decide = WHALE_ENGINE.paceDecision;
  const interval = 1000 / 30;

  assert.equal(decide({ now: 1000, lastDrawAt: 0, fps: 30 }).draw, true, '首次必须画');
  assert.equal(decide({ now: 1000, lastDrawAt: 990, fps: 30 }).draw, false, '间隔不足一帧不画');
  assert.equal(decide({ now: 1000, lastDrawAt: 1000 - interval, fps: 30 }).draw, true, '刚好一帧要画');
  assert.equal(
    decide({ now: 1000, lastDrawAt: 1000 - interval + 1 }).draw,
    true,
    '容差之内的抖动不能被判成掉帧',
  );
  assert.equal(decide({ now: 1000, lastDrawAt: 990, fps: 0 }).draw, true, 'fps<=0 表示不限帧');
  assert.equal(decide({ now: 1000, lastDrawAt: 990, fps: -5 }).draw, true, '负数同样按不限帧处理');
  assert.equal(decide({}).draw, true, '垃圾输入不抛错，按不限帧处理');
});

test('whale-engine: 帧率越低，允许绘制的最小间隔越大', () => {
  const decide = WHALE_ENGINE.paceDecision;
  const lastDrawAt = 1000;
  // 距上次 100ms：30fps 该画了（区间 33ms），15fps 也该画（66ms），120fps 更该画
  assert.equal(decide({ now: 1100, lastDrawAt, fps: 30 }).draw, true);
  // 距上次 20ms：60fps（16.7ms）该画，30fps（33ms）不该画
  assert.equal(decide({ now: 1020, lastDrawAt, fps: 60 }).draw, true);
  assert.equal(decide({ now: 1020, lastDrawAt, fps: 30 }).draw, false);
  // 间隔随 fps 单调递减
  const a = decide({ now: 0, lastDrawAt: 1, fps: 15 }).interval;
  const b = decide({ now: 0, lastDrawAt: 1, fps: 30 }).interval;
  const c = decide({ now: 0, lastDrawAt: 1, fps: 60 }).interval;
  assert.ok(a > b && b > c, 'fps 越高间隔应越小');
});

test('whale-fonts: 只有一个 woff data URI', async () => {
  const source = await read('src/whale-fonts.js');
  const uris = [...source.matchAll(/data:font\/woff;base64,[A-Za-z0-9+/=]+/g)];
  assert.equal(uris.length, 1, '只应内嵌一个字体（仅 ASCII 用等宽子集）');
  assert.equal(source.includes('data:font/woff2'), false);
  assert.equal(WHALE_MONO_URI.startsWith('data:font/woff;base64,'), true);
  assert.ok(WHALE_MONO_URI.length > 1024, '字体 URI 太短，可能抽错了');
});

test('whale-field: 适配器只有热更新与整层重建两条路径', async () => {
  const source = await read('src/whale-field.js');
  assert.match(source, /export function createWhaleField/);
  assert.equal(source.includes('setAppearance'), true, '观感参数应走热更新');
  assert.equal(source.includes('setFpsCap'), true, '帧率上限应走热更新');
  assert.equal(source.includes('setInteract'), true, '交互开关应走热更新');
  // 失败兜底：鲸鱼坏了不能拖垮信号场
  assert.match(source, /catch \(error\)/);
  assert.match(source, /data-whale-fallback/);
});

test('styles: 鲸鱼图层与字体声明就位，且没有新增 backdrop-filter', async () => {
  const { CSS } = await import('../src/styles.js');
  assert.match(CSS, /@font-face\{[\s\S]*?font-family:"Whales Mono"/);
  assert.match(CSS, /\[data-mui-whale\]\{[\s\S]*?z-index:-1/);
  assert.match(CSS, /\[data-mui-whale\] > canvas\{/);
  // 本轮不允许碰毛玻璃：总条数必须仍是 v0.3.1 的 14 条
  assert.equal((CSS.match(/backdrop-filter/g) || []).length, 14, 'backdrop-filter 数量不该变化');
  // 鲸鱼段落里不得出现 backdrop-filter
  const whaleBlock = CSS.slice(CSS.indexOf('[data-mui-whale]'));
  assert.equal(whaleBlock.slice(0, 400).includes('backdrop-filter'), false, '鲸鱼图层不做毛玻璃');
});

test('build: ORDER 里新增文件排在被依赖者之前', async () => {
  const source = await read('scripts/build.mjs');
  const order = [...source.matchAll(/'(src\/[a-z-]+\.js)'/g)].map((m) => m[1]);
  const at = (name) => order.indexOf(name);
  assert.ok(at('src/whale-fonts.js') >= 0, 'ORDER 缺少 whale-fonts.js');
  assert.ok(at('src/whale-engine.js') >= 0, 'ORDER 缺少 whale-engine.js');
  assert.ok(at('src/whale-field.js') >= 0, 'ORDER 缺少 whale-field.js');
  assert.ok(at('src/whale-fonts.js') < at('src/styles.js'), '字体必须先于样式（样式里插值它）');
  assert.ok(at('src/whale-engine.js') < at('src/whale-field.js'), '引擎必须先于适配器');
  assert.ok(at('src/whale-field.js') < at('src/stage.js'), '适配器必须先于 stage');
  assert.ok(at('src/settings-page.js') < at('src/client.js'), '设置页必须先于入口');
});
