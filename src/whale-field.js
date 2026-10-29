/**
 * dsh-signal-field · 鲸鱼图层适配器（v0.4.0）
 *
 * 职责边界：只做「DOM 图层 + 引擎生命周期 + 设置差异比对」，
 * 不碰页面判定（在 page.js）、不碰动画算法（在 whale-engine.js）。
 *
 * 为什么需要这一层而不是直接在 stage.js 里 new 引擎：
 *   1. 引擎的构造参数有 17 个，签名比对必须集中在一处，散在 stage 里极易漏项；
 *   2. 引擎构造可能失败（Canvas2D 不可用、ResizeObserver 缺失），
 *      失败的兜底与「不影响信号场/标题」的承诺必须在一个 try/catch 里兑现。
 *
 * 重建策略沿用 dsh-ascii-whales：改变「种群参数」才重建引擎
 * （鱼群与鲸鱼的实例、尺寸、栅格都绑在构造期），
 * 其余「观感参数」走 setAppearance 热更新，避免拖滑块时整片海洋重播。
 */

// 构建时本行被剥离；产物里 WHALE_ENGINE 由前面的 src/whale-engine.js 提供。
import { WHALE_ENGINE } from "./whale-engine.js";

/** 内嵌字体族名，必须与 styles.js 的 @font-face 一致。 */
const WHALE_FONT_FAMILY = '"Whales Mono", ui-monospace, Menlo, monospace';

/** 鲸鱼等宽字体的字重（Geist Mono 600 子集）。 */
const WHALE_FONT_WEIGHT = "600";

/**
 * 创建一个鲸鱼图层控制器。
 *
 * @param {HTMLElement} layer 已插入内容面的 `<div data-mui-whale>`
 * @param {object} options 见 update()
 * @returns {{ update(options: object): void, destroy(): void }}
 */
export function createWhaleField(layer, options) {
  const host = layer && typeof layer === "object" ? layer : null;
  // 拿不到宿主就返回空实现：调用方（stage.js）不必到处判空。
  if (!host) return { update() {}, destroy() {} };

  const doc = host.ownerDocument || (typeof document === "undefined" ? null : document);
  let canvas = null;
  let engine = null;
  let disposed = false;
  /** 构造失败过就不再重试：反复抛错只会每帧刷一次控制台。 */
  let failed = false;
  /** 种群签名：变了要重建引擎。 */
  let population = "";
  /** 观感签名：变了走 setAppearance。 */
  let appearance = "";
  /** 上一次推送的帧率上限；-1 表示尚未推送。 */
  let lastFps = -1;
  /** 上一次推送的交互开关；null 表示尚未推送。 */
  let lastInteract = null;
  /** 上一次写入的透明度；-1 表示尚未写入。 */
  let lastOpacity = -1;

  /** 取一个安全对象，用于读取可能缺失的选项。 */
  function read(input) {
    return input && typeof input === "object" ? input : {};
  }

  /** 把任意值收紧成有限数，取不到就用 fallback。 */
  function finite(value, fallback) {
    return typeof value === "number" && Number.isFinite(value) ? value : fallback;
  }

  function createCanvas() {
    if (canvas) return canvas;
    canvas = doc.createElement("canvas");
    canvas.setAttribute("aria-hidden", "true");
    // 字体写在内联样式上而不是只靠 CSS：引擎要读 getComputedStyle(canvas).fontFamily
    // 去等字体就绪并烘焙字形，内联值不依赖样式表是否已经生效。
    canvas.style.fontFamily = WHALE_FONT_FAMILY;
    canvas.style.fontWeight = WHALE_FONT_WEIGHT;
    host.append(canvas);
    return canvas;
  }

  /**
   * 局部更新。可重复调用，内部做签名比对。
   *
   * @param {object} input
   * @param {boolean} [input.dark]
   * @param {string} [input.species] "humpback" | "orca"
   * @param {number} [input.count]
   * @param {number} [input.size]
   * @param {number} [input.speed]
   * @param {number} [input.bodySwing]
   * @param {number} [input.turnAgility]
   * @param {number} [input.tailFrequency]
   * @param {number} [input.gridScale]
   * @param {number} [input.gridOpacity]
   * @param {number} [input.fishCount]
   * @param {number} [input.wake]
   * @param {number} [input.opacity]
   * @param {number} [input.fps]
   * @param {boolean} [input.interact]
   */
  function update(input) {
    if (disposed || failed) return;
    const src = read(input);
    const dark = !!src.dark;
    const species = src.species === "orca" ? "orca" : "humpback";
    const count = finite(src.count, 1);
    const size = finite(src.size, 1);
    const speed = finite(src.speed, 1);
    const bodySwing = finite(src.bodySwing, 1);
    const turnAgility = finite(src.turnAgility, 1);
    const tailFrequency = finite(src.tailFrequency, 1);
    const gridScale = finite(src.gridScale, 1);
    const gridOpacity = finite(src.gridOpacity, 0.05);
    const fishCount = finite(src.fishCount, 170);
    const wake = finite(src.wake, 1);
    const opacity = finite(src.opacity, 1);
    const fps = finite(src.fps, 0);
    const interact = src.interact !== false;

    // 透明度只是图层的一件事，写在变量上；判重避免每帧重写 style。
    if (opacity !== lastOpacity) {
      lastOpacity = opacity;
      host.style.setProperty("--mui-whale-opacity", String(opacity));
    }

    // 种群签名：只有这些决定「有几个实体、多大、格子多细」，改动必须重建引擎。
    const nextPopulation = `${species}|${count}|${size}|${gridScale}|${fishCount}`;
    // 观感签名：其余能热更新的参数，外加主题。
    const nextAppearance = `${speed}|${bodySwing}|${turnAgility}|${tailFrequency}|${dark}|${gridOpacity}|${wake}`;

    if (engine && nextPopulation !== population) {
      engine.destroy();
      engine = null;
    }

    if (!engine) {
      try {
        const element = createCanvas();
        engine = WHALE_ENGINE.create(element, {
          dark,
          species,
          count,
          size,
          speed,
          bodySwing,
          turnAgility,
          tailFrequency,
          gridScale,
          gridOpacity,
          fishCount,
          wake,
          fps,
          interact,
        });
      } catch (error) {
        // 兜底：鲸鱼画不出来不该拖垮信号场、标题、毛玻璃。
        // 属性写在图层上，样式层据此可选地降级（当前只是留痕，便于排查）。
        failed = true;
        engine = null;
        host.setAttribute("data-whale-fallback", "");
        return;
      }
      population = nextPopulation;
      appearance = nextAppearance;
      lastFps = fps;
      lastInteract = interact;
      return;
    }

    if (appearance !== nextAppearance) {
      appearance = nextAppearance;
      engine.setAppearance(
        speed,
        dark,
        gridOpacity,
        wake,
        "#4d6bfe",
        false,
        "primary",
        bodySwing,
        turnAgility,
        tailFrequency,
      );
    }
    if (fps !== lastFps) {
      lastFps = fps;
      engine.setFpsCap(fps);
    }
    if (interact !== lastInteract) {
      lastInteract = interact;
      engine.setInteract(interact);
    }
  }

  /** 销毁引擎与画布，把签名重置成初始值（下次 update 会重新建）。 */
  function destroy() {
    if (disposed) return;
    disposed = true;
    if (engine) {
      engine.destroy();
      engine = null;
    }
    if (canvas) {
      canvas.remove();
      canvas = null;
    }
    population = "";
    appearance = "";
    lastFps = -1;
    lastInteract = null;
    lastOpacity = -1;
  }

  // 首次调用即建引擎；失败会被 update 内部的 try/catch 兜住。
  update(options);

  return { update, destroy };
}
