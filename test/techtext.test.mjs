import assert from 'node:assert/strict';
import test from 'node:test';

import { measureTitle } from '../src/techtext.js';

/**
 * 标题盒子反推的单元测试。
 *
 * 引擎的 fit 是 `min(1, width*0.92/墨宽, height*0.72/墨高)`，所以想让实际字形等于目标字号，
 * 盒子必须是「墨迹尺寸 ÷ 对应系数」。这两条断言直接锁住这个反推关系。
 */

/** 造一个能返回指定墨迹尺寸的 Canvas2D 替身。 */
function withCanvasStub(metrics, run) {
  const previous = globalThis.document;
  globalThis.document = {
    createElement() {
      return {
        getContext() {
          return {
            font: '',
            letterSpacing: '',
            measureText() {
              return {
                actualBoundingBoxLeft: 0,
                actualBoundingBoxRight: metrics.width,
                actualBoundingBoxAscent: metrics.ascent,
                actualBoundingBoxDescent: metrics.descent,
              };
            },
          };
        },
      };
    },
  };
  try {
    return run();
  } finally {
    if (previous === undefined) delete globalThis.document;
    else globalThis.document = previous;
  }
}

test('measureTitle: 按 0.92 / 0.72 反推盒子，使实际字形等于目标字号', () => {
  const box = withCanvasStub({ width: 300, ascent: 20, descent: 10 }, () =>
    measureTitle('DEEPSEEK HARNESS', { fontSize: 42, fontWeight: 600, letterSpacing: -0.005 }),
  );
  assert.equal(box.width, Math.ceil(300 / 0.92));
  assert.equal(box.height, Math.ceil(30 / 0.72));
});

test('measureTitle: 没有 Canvas2D 时按经验比例估算，不抛错且尺寸为正', () => {
  const previous = globalThis.document;
  delete globalThis.document;
  try {
    const box = measureTitle('DEEPSEEK HARNESS', { fontSize: 42 });
    assert.ok(box.width > 0);
    assert.ok(box.height > 0);
    // 估算兜底：墨高 ≈ 0.72em → 盒子高度 ≈ 字号
    assert.equal(box.height, Math.ceil((42 * 0.72) / 0.72));
  } finally {
    globalThis.document = previous;
  }
});

test('measureTitle: 字号越大盒子越大，且对垃圾输入不抛错', () => {
  const previous = globalThis.document;
  globalThis.document = {
    createElement() {
      return {
        getContext() {
          return {
            font: '',
            letterSpacing: '',
            measureText() {
              const match = String(this.font || '').match(/(\d+(?:\.\d+)?)px/);
              const size = match ? Number(match[1]) : 16;
              return {
                actualBoundingBoxLeft: 0,
                actualBoundingBoxRight: size * 7,
                actualBoundingBoxAscent: size * 0.72,
                actualBoundingBoxDescent: 0,
              };
            },
          };
        },
      };
    },
  };
  try {
    const small = measureTitle('ABC', { fontSize: 24 });
    const large = measureTitle('ABC', { fontSize: 48 });
    assert.ok(large.height > small.height, '字号翻倍时盒子高度应随之变大');
    assert.ok(large.width > small.width, '字号翻倍时盒子宽度应随之变大');
    assert.doesNotThrow(() => measureTitle(undefined, undefined));
    assert.ok(measureTitle(undefined, undefined).width > 0);
  } finally {
    if (previous === undefined) delete globalThis.document;
    else globalThis.document = previous;
  }
});
