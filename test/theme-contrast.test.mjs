/**
 * 主题前景色约束
 *
 * 目的：锁住 v0.4.1 修的回归——「设置 → UI 动画 → 鲸鱼种类」的分段控件在深色主题下
 * 选中项变成「白底白字」，文字完全不可见（对比度约 1.0:1）。
 *
 * 成因值得记下来：DSH 的 --dsw-alias-brand-primary 不是蓝色强调色，而是**主题内对比度
 * 最高的中性色**——浅色主题为 neutral-bluish-1000(#0f1115)，深色主题为
 * neutral-bluish-50(#f9fafb)。与之配对的前景令牌是 --dsw-alias-label-primary-foreground
 * （浅 #fff / 深 #0f1115，即恒为主题反色）。
 *
 * 原代码把前景写死成 #fff，于是只在浅色主题下「碰巧」正确。
 *
 * 因此这里固化两条不变量：
 *   1. 凡以 brand-primary 作背景的规则，其 color 若显式声明，必须是配对前景令牌；
 *   2. 全文的 color 声明不得出现写死的白色（#fff / #ffffff / white / rgba(255,255,255)）。
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { CSS } from '../src/styles.js';

/** 前景令牌：拿 brand-primary 当背景时必须用它。 */
const FOREGROUND_TOKEN = 'var(--dsw-alias-label-primary-foreground)';

/**
 * 把样式文本拆成「选择器 / 声明块」序列。
 * 与 glass-contain.test.mjs 保持同一套扁平拆分思路（不处理嵌套 @media 的层级语义）。
 */
function blocks(css) {
  // 去掉注释，避免注释里的花括号与示例代码干扰拆分
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
  return [...clean.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
    selector: m[1].trim(),
    body: m[2],
  }));
}

/**
 * 取一条声明值。
 * 用「属性名前必须是行首/分号/空白/花括号」来避开 background-color 被当成 color，
 * 也避开 @font-face 里 data URI 自带分号导致的天真切分。
 */
function decl(body, prop) {
  const re = new RegExp(`(?:^|[;{\\s])${prop}\\s*:\\s*([^;]+)`, 'i');
  const m = re.exec(body);
  return m ? m[1].trim() : null;
}

test('contrast: 以 brand-primary 作背景的规则若声明前景，必须用配对令牌', () => {
  const offenders = [];
  for (const block of blocks(CSS)) {
    const background = decl(block.body, 'background') ?? decl(block.body, 'background-color');
    if (!background || !/--dsw-alias-brand-primary/.test(background)) continue;

    // 不声明 color 是合法的：文字继承上层主文字色，两个主题下都可见。
    const color = decl(block.body, 'color');
    if (color === null) continue;

    const normalized = color.replace(/\s+/g, '');
    const allowed = [
      FOREGROUND_TOKEN.replace(/\s+/g, ''),
      'inherit',
      'currentColor',
    ];
    if (!allowed.includes(normalized)) {
      offenders.push(`${block.selector} → color:${color}`);
    }
  }

  assert.deepEqual(
    offenders,
    [],
    'brand-primary 是主题内对比度最高的中性色（浅近黑/深近白），前景必须用 ' +
      `${FOREGROUND_TOKEN}；写死颜色会在另一个主题下变成同色不可见`,
  );
});

test('contrast: color 声明不得写死白色', () => {
  const HARDCODED_WHITE = /^(#fff|#ffffff|white|rgba?\(\s*255\s*,\s*255\s*,\s*255\b)/i;
  const offenders = [];

  for (const block of blocks(CSS)) {
    // 只查 color 声明本身；border/box-shadow/gradient 里的 rgba(255,255,255,…)
    // 是玻璃拟态的高光，属于设计意图，不在本条约束范围内。
    const re = /(?:^|[;{\s])color\s*:\s*([^;]+)/gi;
    for (const m of block.body.matchAll(re)) {
      const value = m[1].trim();
      if (HARDCODED_WHITE.test(value)) {
        offenders.push(`${block.selector} → color:${value}`);
      }
    }
  }

  assert.deepEqual(
    offenders,
    [],
    '前景白请改用主题令牌（如 var(--dsw-alias-label-primary-foreground)）；' +
      '若确有必要写死，请在本测试里显式加白名单并写明理由',
  );
});

test('contrast: 分段控件选中态锁定为配对前景令牌', () => {
  const pressed = blocks(CSS).filter((block) =>
    /\.mui-seg-item\[aria-pressed="true"\]\s*$/.test(block.selector),
  );

  assert.equal(pressed.length, 1, '分段控件选中态应有且只有一条规则');

  const { body } = pressed[0];
  assert.match(
    decl(body, 'background') ?? '',
    /--dsw-alias-brand-primary/,
    '选中态背景仍应使用 brand-primary（v0.4.1 未改变设计意图）',
  );
  assert.equal(
    decl(body, 'color'),
    FOREGROUND_TOKEN,
    '选中态前景必须是配对令牌，否则深色主题会白底白字',
  );
});
