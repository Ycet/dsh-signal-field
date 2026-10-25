/**
 * 毛玻璃层的包含块约束
 *
 * 目的：锁住 v0.2.1 修的回归——backdrop-filter / filter 会为元素建立 fixed 后代的包含块。
 * 本插件要加毛玻璃的三处宿主里，有两处（DSH 输入框卡片、dsh-awesome-hud 的 .hud-panel）
 * 子树内都存在 position:fixed 的弹层；一旦把模糊写在宿主元素本身，弹层就会以宿主为视口，
 * 再被宿主自己的 overflow:hidden 裁掉（HUD 的 git graph 弹窗就是这么被关进 300px 面板的）。
 *
 * 因此这里固化两条不变量：
 *   1. 全文件所有 backdrop-filter 只能出现在伪元素（::before / ::after）上；
 *   2. 宿主元素自身的规则块里不允许出现 backdrop-filter，模糊必须由 ::before 承担。
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { CSS } from '../src/styles.js';

/**
 * 把样式文本拆成「选择器 / 声明块」序列。
 * 只处理本插件用到的扁平结构（@supports 外层块会自然失配，其内部的真实规则仍会被匹配到）。
 */
function blocks(css) {
  // 去掉注释，避免注释里的花括号干扰拆分
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
  return [...clean.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
    selector: m[1].trim(),
    body: m[2],
  }));
}

const HOSTS = [
  { name: '输入框卡片', pattern: /\[data-composer-card\]\s*$/ },
  { name: 'HUD 面板', pattern: /\.hud-panel\s*$/ },
];

test('glass: 所有 backdrop-filter 只挂在伪元素或插件自有叶子图层上', () => {
  // v0.2.4 起不再有任何例外：底部渐隐改用 mask（不产生新层），
  // 因此模糊只可能出现在两处宿主伪元素上。
  const offenders = blocks(CSS)
    .filter((block) => /(^|[^-])backdrop-filter\s*:/.test(block.body))
    .filter((block) => !/::(before|after)/.test(block.selector))
    ;

  assert.deepEqual(
    offenders.map((block) => block.selector),
    [],
    '模糊会建立 fixed 后代的包含块，只能写在 ::before / ::after 上',
  );
});

test('glass: 宿主元素自身不承担 backdrop-filter', () => {
  const all = blocks(CSS);
  for (const host of HOSTS) {
    const own = all.filter((block) => host.pattern.test(block.selector));
    assert.ok(own.length > 0, `${host.name} 应至少有一条自己的规则`);
    for (const block of own) {
      assert.equal(
        /backdrop-filter/.test(block.body),
        false,
        `${host.name} 的规则块不得自带 backdrop-filter：${block.selector}`,
      );
    }
  }
});

test('glass: 宿主以伪元素承载玻璃层', () => {
  const all = blocks(CSS);
  for (const host of HOSTS) {
    const pattern = new RegExp(host.pattern.source.replace(/\s*\$$/, '::before\\s*$'));
    const layer = all.find((block) => pattern.test(block.selector));
    assert.ok(layer, `${host.name} 缺少 ::before 玻璃层`);
    assert.match(layer.selector, /\[data-mui-scope\]|\[data-mui\]/, `${host.name} 玻璃层应受属性开关控制`);
    // 玻璃层必须铺满宿主并压到内容之下
    assert.match(layer.body, /content:\s*""/, `${host.name} 玻璃层缺少 content`);
    assert.match(layer.body, /position:\s*absolute/, `${host.name} 玻璃层应为 absolute`);
    assert.match(layer.body, /inset:\s*0/, `${host.name} 玻璃层应铺满宿主`);
    assert.match(layer.body, /z-index:\s*-1/, `${host.name} 玻璃层应位于内容之下`);
    assert.match(layer.body, /border-radius:\s*inherit/, `${host.name} 玻璃层应继承圆角`);
    assert.match(layer.body, /backdrop-filter/, `${host.name} 玻璃层必须自带模糊`);
    assert.match(layer.body, /pointer-events:\s*none/, `${host.name} 玻璃层不应吃点击`);
  }
});

test('glass: HUD 面板底色与层叠上下文由宿主承担', () => {
  const own = blocks(CSS).find(
    (block) => /\[data-mui-hud-glass\]\s*\.hud-panel\s*$/.test(block.selector),
  );
  assert.ok(own, '缺少 HUD 面板毛玻璃的宿主规则');
  assert.match(own.body, /isolation:\s*isolate/, '宿主需建立层叠上下文，让 z-index:-1 的玻璃层留在面板内');
  assert.match(own.body, /background:\s*transparent/, '宿主底色需交给玻璃层，否则看不到透出的背景');
});
