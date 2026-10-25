/**
 * dsh-signal-field · TechText 蓝图标题引擎
 *
 * 移植自参考文档的 `createTechText()`：用 Canvas2D 把整行文字拆成字形贴图，指针靠近时
 * 把命中的字形从「实心填充」淡入成「虚线矢量轮廓」，并可拖动字块、显示选框与飞白微粒。
 *
 * 相对原实现的改动：
 *   1. 墨色/强调色由调用方传入（默认取 DSH 主题 token），不再读全局 CSS 变量；
 *   2. 字体族默认取宿主元素的 `font-family`，即 DSH 的主题字体；
 *   3. 用 `idle` / `interact` 两个开关分别控制「扫光默认动效」与「指针交互」；
 *   4. 容器尺寸为 0 时跳过绘制，避免隐藏页面上空转。
 */

const TECH_LABEL_FONT = "10px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
const TECH_FALLOFF_STEPS = 8;
const TECH_SPRING = 320;
const TECH_DAMPING = 22;

/** 指数趋近（与原实现同款，与帧率无关）。 */
function techApproach(current, target, dt, seconds) {
  return current + (target - current) * (1 - Math.exp(-dt / seconds));
}

/** 十六进制颜色 → [r, g, b]。 */
function techHexToRgb(hex) {
  let value = String(hex || "").replace("#", "");
  if (value.length === 3) value = value.replace(/./g, (char) => char + char);
  const int = Number.parseInt(value.slice(0, 6), 16);
  return Number.isNaN(int) ? [255, 255, 255] : [(int >> 16) & 255, (int >> 8) & 255, int & 255];
}

/** 十六进制颜色 + alpha → rgba() 字符串。 */
function techRgba(hex, alpha) {
  const [r, g, b] = techHexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** 定点整数噪声：同一组参数永远给同一个 0..1 值，用于飞白微粒的稳定分布。 */
function techNoise(...args) {
  let hash = 2166136261;
  for (const value of args) {
    hash = Math.imul(hash ^ (value | 0), 16777619);
    hash ^= hash >>> 13;
    hash = Math.imul(hash, 0x5bd1e995);
    hash ^= hash >>> 15;
  }
  return (hash >>> 0) / 4294967296;
}

/** 带符号整数文本（用真正的减号）。 */
function techSigned(value) {
  return value > 0 ? `+${value}` : value < 0 ? `−${-value}` : "0";
}

/** 舞台上限（CSS px）：拖动的字形可以超出设计盒，但不必无限大。 */
const TECH_STAGE_MAX_W = 2000;
const TECH_STAGE_MAX_H = 1500;
/** 找不到内容面时的兜底外扩量。 */
const TECH_STAGE_MARGIN = 400;

/** 引擎的 fit 系数：文字在盒子里的占比（与 ensureLayout 里的 0.92 / 0.72 保持一致）。 */
const TECH_FIT_WIDTH = 0.92;
const TECH_FIT_HEIGHT = 0.72;

/**
 * 按「目标字号」反推设计盒尺寸。
 *
 * 引擎会用 `min(1, width*0.92/墨宽, height*0.72/墨高)` 把文字缩放到盒子里，
 * 所以想让实际字形正好等于目标字号，盒子就必须是墨迹尺寸除以对应系数。
 *
 * 测量不可用（无 Canvas2D、或字体尚未就绪导致墨迹为 0）时按经验比例估算，
 * 保证调用方总能拿到一个可用尺寸，而不是抛错或得到 0。
 *
 * @param {string} text 标题文本。
 * @param {{ fontSize?: number, fontWeight?: number|string, letterSpacing?: number, fontFamily?: string }} opts
 * @returns {{ width: number, height: number }} 设计盒尺寸（整数 CSS px）。
 */
export function measureTitle(text, opts) {
  const source = opts || {};
  const size = Number(source.fontSize) > 0 ? Number(source.fontSize) : 42;
  const weight = source.fontWeight || 600;
  const spacing = "letterSpacing" in source ? source.letterSpacing : -0.005;
  const value = typeof text === "string" ? text : String(text || "");
  let inkWidth = 0;
  let inkHeight = 0;
  try {
    const probe = document.createElement("canvas").getContext("2d");
    if (probe) {
      probe.font = `${weight} ${size}px ${source.fontFamily || "sans-serif"}`;
      if ("letterSpacing" in probe) probe.letterSpacing = `${spacing * size}px`;
      const metrics = probe.measureText(value);
      inkWidth = metrics.actualBoundingBoxLeft + metrics.actualBoundingBoxRight;
      inkHeight = metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent;
    }
  } catch {
    inkWidth = 0;
    inkHeight = 0;
  }
  // 估算兜底：等宽近似 0.62em，墨高近似 0.72em。
  if (!(inkWidth > 0) || !Number.isFinite(inkWidth)) inkWidth = value.length * size * 0.62;
  if (!(inkHeight > 0) || !Number.isFinite(inkHeight)) inkHeight = size * 0.72;
  return {
    width: Math.max(24, Math.ceil(inkWidth / TECH_FIT_WIDTH)),
    height: Math.max(16, Math.ceil(inkHeight / TECH_FIT_HEIGHT)),
  };
}

/**
 * 在容器里创建一行「蓝图标题」。
 * @param {HTMLElement} container 插件自有的 `[data-mui-title]`。
 * @param {string} text 标题文本。
 * @param {object} opts 视觉与行为参数（见 createTechText 内的 settings 初值）。
 * @returns {{ refresh(opts?: object): void, destroy(): void, redraw(): void }}
 */
export function createTechText(container, text, opts) {
  const settings = {
    text,
    fontFamily: (opts && opts.fontFamily) || "",
    fontWeight: (opts && opts.fontWeight) || 600,
    fontSize: (opts && opts.fontSize) || 120,
    letterSpacing: opts && "letterSpacing" in opts ? opts.letterSpacing : -0.01,
    color: (opts && opts.color) || "#0b0f1a",
    accentColor: (opts && opts.accentColor) || "#2b3af0",
    reach: (opts && opts.reach) || 150,
    softness: opts && "softness" in opts ? opts.softness : 0.65,
    dashLength: (opts && opts.dashLength) || 3,
    dashGap: (opts && opts.dashGap) || 3,
    strokeWidth: (opts && opts.strokeWidth) || 1.2,
    lineStyle: (opts && opts.lineStyle) || "dashed",
    reveal: (opts && opts.reveal) || "letter",
    specks: opts && "specks" in opts ? opts.specks : 14,
    selection: !opts || opts.selection !== false,
    labels: !opts || opts.labels !== false,
    draggable: !opts || opts.draggable !== false,
    sweep: !opts || opts.sweep !== false,
    speed: (opts && opts.speed) || 0.9,
  };
  const reduceMotion = !!(opts && opts.reduceMotion);

  const canvas = document.createElement("canvas");
  container.append(canvas);
  const ctx = canvas.getContext("2d");
  const scratch = document.createElement("canvas");
  const scratchCtx = scratch.getContext("2d");
  if (!ctx || !scratchCtx) {
    return { refresh() {}, destroy() { canvas.remove(); }, redraw() {} };
  }

  let width = 1;
  let height = 1;
  let dpr = 1;
  /**
   * 舞台矩形（容器相对坐标，CSS px）与它的设备像素原点。
   *
   * 设计盒（width×height）负责布局与交互热区；舞台负责渲染，比设计盒大，
   * 这样字形被拖出设计盒后仍然画得出来、不会被 canvas 裁掉。
   */
  const stage = { ox: 0, oy: 0, w: 1, h: 1 };
  let stageOxDev = 0;
  let stageOyDev = 0;
  let frameHandle = 0;
  let last = performance.now();
  let visible = false;
  let alive = true;
  let layoutKey = "";
  let requestedFont = "";
  let word = null;
  let glyphs = [];
  let presence = 0;
  let clock = 0;
  let pulse = 0;
  let placed = false;
  let dragging = -1;
  const pointer = { x: 0, y: 0, inside: false };
  const grab = { x: 0, y: 0 };
  const lens = { x: 0, y: 0 };
  const frameBox = { x1: 0, y1: 0, x2: 0, y2: 0, alpha: 0, index: -1 };

  function refreshFonts() {
    layoutKey = "";
    wake();
  }

  function family(source) {
    return source.fontFamily || getComputedStyle(container).fontFamily || "sans-serif";
  }

  function fontFor(source, size) {
    return `${source.fontWeight} ${size}px ${family(source)}`;
  }

  function setFont(target, source, size) {
    target.font = fontFor(source, size);
    if ("letterSpacing" in target) target.letterSpacing = `${source.letterSpacing * size}px`;
    target.textAlign = "left";
    target.textBaseline = "alphabetic";
  }

  /** 把一个字形烘焙成两种贴图：实心填充与虚线轮廓。 */
  function sprite(source, view, glyph, stroke) {
    const pad = Math.ceil(source.strokeWidth * 2 + 4);
    const left = glyph.box.x1 - pad;
    const top = glyph.box.y1 - pad;
    const w = glyph.box.x2 - glyph.box.x1 + pad * 2;
    const h = glyph.box.y2 - glyph.box.y1 + pad * 2;
    const image = document.createElement("canvas");
    image.width = Math.max(1, Math.ceil(w * dpr));
    image.height = Math.max(1, Math.ceil(h * dpr));
    const artCtx = image.getContext("2d");
    if (!artCtx) return { image, left, top };
    artCtx.setTransform(dpr, 0, 0, dpr, -left * dpr, -top * dpr);
    setFont(artCtx, source, view.size);
    if (stroke) {
      artCtx.lineJoin = "round";
      artCtx.lineWidth = source.strokeWidth * 2;
      artCtx.lineCap = "butt";
      artCtx.strokeStyle = source.color;
      if (source.lineStyle !== "solid") {
        artCtx.setLineDash([Math.max(1, source.dashLength), Math.max(1, source.dashGap)]);
      }
      artCtx.strokeText(glyph.char, glyph.x, view.baseline);
      artCtx.setLineDash([]);
      artCtx.globalCompositeOperation = "destination-out";
      artCtx.fillStyle = "#000000";
      artCtx.fillText(glyph.char, glyph.x, view.baseline);
      artCtx.globalCompositeOperation = "source-over";
    } else {
      artCtx.fillStyle = source.color;
      artCtx.fillText(glyph.char, glyph.x, view.baseline);
    }
    return { image, left, top };
  }

  /** 重新测量文字并烘焙字形贴图；尺寸/字体/颜色变化时才真正重算。 */
  function ensureLayout(source) {
    const key = [
      source.text,
      family(source),
      source.fontWeight,
      source.fontSize,
      source.letterSpacing,
      source.color,
      source.dashLength,
      source.dashGap,
      source.strokeWidth,
      source.lineStyle,
      width,
      height,
      dpr,
    ].join("|");
    if (key === layoutKey && word) return word;
    layoutKey = key;

    const wanted = fontFor(source, 64);
    if (document.fonts && wanted !== requestedFont) {
      requestedFont = wanted;
      document.fonts.load(wanted, source.text).then(refreshFonts, refreshFonts);
    }

    const probe = scratchCtx;
    setFont(probe, source, source.fontSize);
    let metrics = probe.measureText(source.text);
    const fit = Math.min(
      1,
      (width * 0.92) / Math.max(metrics.actualBoundingBoxLeft + metrics.actualBoundingBoxRight, 1),
      (height * 0.72) / Math.max(metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent, 1),
    );
    const size = source.fontSize * fit;
    setFont(probe, source, size);
    metrics = probe.measureText(source.text);
    const inkWidth = metrics.actualBoundingBoxLeft + metrics.actualBoundingBoxRight;
    const inkHeight = metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent;
    const originX = (width - inkWidth) / 2 + metrics.actualBoundingBoxLeft;
    const baseline = (height - inkHeight) / 2 + metrics.actualBoundingBoxAscent;
    const next = {
      size,
      baseline,
      left: originX - metrics.actualBoundingBoxLeft,
      right: originX + metrics.actualBoundingBoxRight,
      top: baseline - metrics.actualBoundingBoxAscent,
      bottom: baseline + metrics.actualBoundingBoxDescent,
    };
    word = next;

    const chars = Array.from(source.text);
    const previous = glyphs;
    glyphs = [];
    let prefix = "";
    chars.forEach((char, index) => {
      prefix += char;
      const own = probe.measureText(char);
      const glyphX = originX + probe.measureText(prefix).width - own.width;
      if (!char.trim()) return;
      const base = {
        char,
        x: glyphX,
        box: {
          x1: glyphX - own.actualBoundingBoxLeft,
          y1: baseline - own.actualBoundingBoxAscent,
          x2: glyphX + own.actualBoundingBoxRight,
          y2: baseline + own.actualBoundingBoxDescent,
        },
      };
      const kept = previous[glyphs.length];
      glyphs.push({
        char,
        x: glyphX,
        box: base.box,
        offset: kept && kept.char === char ? kept.offset : { x: 0, y: 0 },
        velocity: { x: 0, y: 0 },
        outline: 0,
        index,
        fill: sprite(source, next, base, false),
        dashes: sprite(source, next, base, true),
      });
    });
    dragging = -1;
    frameBox.index = -1;
    return next;
  }

  /** 命中测试：返回离指针最近、且横向距离小于 28px 的字形下标。 */
  function glyphAt(x, y) {
    if (!word || y < word.top - 24 || y > word.bottom + 24) return -1;
    let best = -1;
    let bestDistance = Infinity;
    glyphs.forEach((glyph, index) => {
      const x1 = glyph.box.x1 + glyph.offset.x;
      const x2 = glyph.box.x2 + glyph.offset.x;
      const distance = x < x1 ? x1 - x : x > x2 ? x - x2 : 0;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = index;
      }
    });
    return bestDistance < 28 ? best : -1;
  }

  /** 径向衰减遮罩：中心强、边缘平滑到 0。 */
  function falloff(target, cx, cy, radius, strength, soft) {
    const inner = Math.min(1, Math.max(0, 1 - soft));
    const gradient = target.createRadialGradient(cx, cy, 0, cx, cy, radius);
    gradient.addColorStop(0, `rgba(0, 0, 0, ${strength})`);
    if (inner > 0.995) {
      gradient.addColorStop(0.995, `rgba(0, 0, 0, ${strength})`);
      gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
      return gradient;
    }
    for (let step = 0; step <= TECH_FALLOFF_STEPS; step += 1) {
      const t = step / TECH_FALLOFF_STEPS;
      const eased = t * t * (3 - 2 * t);
      gradient.addColorStop(inner + (1 - inner) * t, `rgba(0, 0, 0, ${strength * (1 - eased)})`);
    }
    return gradient;
  }

  function blit(target, art, dx, dy, originX, originY) {
    target.drawImage(
      art.image,
      Math.round((art.left + dx) * dpr - originX),
      Math.round((art.top + dy) * dpr - originY),
    );
  }

  /** 指针处的「取景区」：把实心字形擦掉、换成虚线轮廓。 */
  function drawReveal(source) {
    const radius = source.reach * dpr;
    // canvas 的原点在舞台左上角，而舞台原点在设计盒左上方（stageOxDev 为负），
    // 所以设计坐标要减去舞台原点才是画布内的设备像素位置。
    const cx = lens.x * dpr - stageOxDev;
    const cy = lens.y * dpr - stageOyDev;
    ctx.globalCompositeOperation = "destination-out";
    ctx.fillStyle = falloff(ctx, cx, cy, radius, presence, source.softness);
    ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
    ctx.globalCompositeOperation = "source-over";

    const x0 = Math.max(0, Math.floor(cx - radius));
    const y0 = Math.max(0, Math.floor(cy - radius));
    const x1 = Math.min(canvas.width, Math.ceil(cx + radius));
    const y1 = Math.min(canvas.height, Math.ceil(cy + radius));
    if (x1 <= x0 || y1 <= y0) return;
    const w = x1 - x0;
    const h = y1 - y0;
    if (scratch.width < w || scratch.height < h) {
      scratch.width = Math.max(scratch.width, w);
      scratch.height = Math.max(scratch.height, h);
    }
    scratchCtx.setTransform(1, 0, 0, 1, 0, 0);
    scratchCtx.globalCompositeOperation = "source-over";
    scratchCtx.clearRect(0, 0, w, h);
    glyphs.forEach((glyph) => {
      // scratch 局部坐标 = 画布设备坐标 − 取景区左上角，因此 origin 要再加回舞台原点。
      blit(scratchCtx, glyph.dashes, glyph.offset.x, glyph.offset.y, x0 + stageOxDev, y0 + stageOyDev);
    });
    scratchCtx.globalCompositeOperation = "destination-in";
    scratchCtx.fillStyle = falloff(scratchCtx, cx - x0, cy - y0, radius, 1, source.softness);
    scratchCtx.fillRect(0, 0, w, h);
    scratchCtx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = presence;
    ctx.drawImage(scratch, 0, 0, w, h, x0, y0, w, h);
    ctx.globalAlpha = 1;
  }

  function crisp(value) {
    return (Math.round(value * dpr) + 0.5) / dpr;
  }

  /** 选框周长上的一点，用于沿边框游走的微粒。 */
  function perimeterPoint(distance, w, h) {
    const perimeter = 2 * (w + h);
    let d = ((distance % perimeter) + perimeter) % perimeter;
    if (d < w) return [frameBox.x1 + d, frameBox.y1, 0, -1];
    d -= w;
    if (d < h) return [frameBox.x2, frameBox.y1 + d, 1, 0];
    d -= h;
    if (d < w) return [frameBox.x2 - d, frameBox.y2, 0, 1];
    d -= w;
    return [frameBox.x1, frameBox.y2 - d, -1, 0];
  }

  function drawSpecks(source, alpha) {
    const w = frameBox.x2 - frameBox.x1;
    const h = frameBox.y2 - frameBox.y1;
    if (w < 2 || h < 2) return;
    const perimeter = 2 * (w + h);
    const seed = frameBox.index + 1;
    const grid = 3;

    for (let index = 0; index < source.specks; index += 1) {
      const period = 0.5 + techNoise(seed, index, 11) * 1.2;
      const t = pulse / period + techNoise(seed, index, 17);
      const cycle = Math.floor(t);
      const life = t - cycle;
      if (life > 0.7) continue;
      const point = perimeterPoint(techNoise(seed, index, cycle) * perimeter, w, h);
      const pick = techNoise(seed, index, cycle, 2);
      const size = pick < 0.46 ? 2 : pick < 0.7 ? 3 : pick < 0.84 ? 5 : pick < 0.94 ? 8 : 11;
      const large = size >= 8;
      const out = (large ? 9 : 4) + Math.floor(techNoise(seed, index, cycle, 1) * 5) * grid;
      const x = frameBox.x1 + Math.round((point[0] + point[2] * out - frameBox.x1) / grid) * grid;
      const y = frameBox.y1 + Math.round((point[1] + point[3] * out - frameBox.y1) / grid) * grid;
      const tone = techNoise(seed, index, cycle, 3);
      const blink = life < 0.06 || (life > 0.32 && life < 0.36) ? 0.35 : 1;
      const ink = alpha * (large ? 0.3 + 0.4 * tone : 0.3 + 0.6 * tone) * blink;
      const left = Math.round(x - size / 2);
      const top = Math.round(y - size / 2);
      if (tone < 0.26 || (large && tone < 0.78)) {
        ctx.strokeStyle = techRgba(source.accentColor, ink);
        ctx.strokeRect(left + 0.5, top + 0.5, size, size);
        if (large && tone > 0.5) {
          ctx.fillStyle = techRgba(source.accentColor, ink);
          ctx.fillRect(Math.round(x) - 1, Math.round(y) - 1, 2, 2);
        }
      } else {
        ctx.fillStyle = techRgba(source.accentColor, ink);
        ctx.fillRect(left, top, size, size);
      }
    }

    for (let runner = 0; runner < 2; runner += 1) {
      const head = (pulse * 0.42 * source.speed + runner * 0.5) * perimeter;
      for (let index = 0; index < 4; index += 1) {
        const point = perimeterPoint(head - index * 6, w, h);
        const size = index === 0 ? 3 : 2;
        ctx.fillStyle = techRgba(source.accentColor, alpha * [0.95, 0.55, 0.32, 0.16][index]);
        ctx.fillRect(Math.round(point[0] - size / 2), Math.round(point[1] - size / 2), size, size);
      }
    }
  }

  /** 命中字形的选框：四角方块、位移引线、尺寸/位移标签。 */
  function drawFrame(source) {
    const glyph = glyphs[frameBox.index];
    if (!glyph || frameBox.alpha < 0.01) return;
    const alpha = frameBox.alpha;
    const x1 = crisp(frameBox.x1);
    const y1 = crisp(frameBox.y1);
    const x2 = crisp(frameBox.x2);
    const y2 = crisp(frameBox.y2);
    // 设计坐标 → 设备坐标：device = design * dpr − 舞台原点（stageOxDev 为负即整体右移）。
    ctx.setTransform(dpr, 0, 0, dpr, -stageOxDev, -stageOyDev);

    const moved = Math.hypot(glyph.offset.x, glyph.offset.y);
    if (moved > 1) {
      const hx = (glyph.box.x1 + glyph.box.x2) / 2;
      const hy = (glyph.box.y1 + glyph.box.y2) / 2;
      ctx.beginPath();
      ctx.moveTo(hx, hy);
      ctx.lineTo(hx + glyph.offset.x, hy + glyph.offset.y);
      ctx.setLineDash([3, 4]);
      ctx.lineWidth = 1;
      ctx.strokeStyle = techRgba(source.accentColor, 0.45 * alpha);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.rect(Math.round(hx) - 2, Math.round(hy) - 2, 4, 4);
      ctx.fillStyle = techRgba(source.accentColor, 0.7 * alpha);
      ctx.fill();
    }

    ctx.beginPath();
    ctx.rect(x1, y1, x2 - x1, y2 - y1);
    ctx.lineWidth = 1;
    ctx.strokeStyle = techRgba(source.accentColor, 0.5 * alpha);
    ctx.stroke();

    ctx.beginPath();
    [
      [x1, y1],
      [x2, y1],
      [x2, y2],
      [x1, y2],
    ].forEach((corner) => {
      ctx.rect(Math.round(corner[0]) - 2, Math.round(corner[1]) - 2, 5, 5);
    });
    ctx.fillStyle = techRgba(source.accentColor, 0.95 * alpha);
    ctx.fill();

    if (source.specks > 0) {
      ctx.lineWidth = 1;
      drawSpecks(source, alpha);
    }

    if (!source.labels) return;
    ctx.font = TECH_LABEL_FONT;
    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";
    ctx.fillStyle = techRgba(source.accentColor, 0.62 * alpha);
    const label =
      moved > 1
        ? `${techSigned(Math.round(glyph.offset.x))}, ${techSigned(Math.round(-glyph.offset.y))}`
        : `${glyph.char}  ${Math.round(glyph.box.x2 - glyph.box.x1)} × ${Math.round(glyph.box.y2 - glyph.box.y1)}`;
    ctx.fillText(label, Math.round(frameBox.x1), Math.round(frameBox.y1) - 7);
  }

  function tick(now) {
    frameHandle = 0;
    if (!alive) return;
    const source = settings;
    const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
    last = now;
    const view = ensureLayout(source);

    const sweeping = source.sweep && !reduceMotion && !pointer.inside && dragging < 0;
    if (sweeping) clock += dt * source.speed;
    pulse += dt;
    let targetX = pointer.x;
    let targetY = pointer.y;
    if (sweeping) {
      targetX = view.left + (view.right - view.left) * (0.5 - 0.5 * Math.cos(clock * 0.45));
      targetY = view.top + (view.bottom - view.top) * (0.45 + 0.1 * Math.sin(clock * 0.8));
    }
    const active = pointer.inside || sweeping || dragging >= 0;
    if (active && !placed) {
      lens.x = targetX;
      lens.y = targetY;
    }
    if (active) {
      const lag = pointer.inside ? 0.05 : 0.22;
      lens.x = techApproach(lens.x, targetX, dt, lag);
      lens.y = techApproach(lens.y, targetY, dt, lag);
    }
    placed = active;
    presence = techApproach(presence, source.reveal === "area" && active && dragging < 0 ? 1 : 0, dt, 0.16);

    let moving = false;
    glyphs.forEach((glyph, index) => {
      if (index === dragging) {
        glyph.offset.x = techApproach(glyph.offset.x, pointer.x - grab.x, dt, 0.03);
        glyph.offset.y = techApproach(glyph.offset.y, pointer.y - grab.y, dt, 0.03);
        glyph.velocity.x = 0;
        glyph.velocity.y = 0;
        moving = true;
        return;
      }
      const offset = glyph.offset;
      const velocity = glyph.velocity;
      if (Math.abs(offset.x) < 0.05 && Math.abs(offset.y) < 0.05 && Math.hypot(velocity.x, velocity.y) < 0.5) {
        offset.x = 0;
        offset.y = 0;
        velocity.x = 0;
        velocity.y = 0;
        return;
      }
      velocity.x += (-TECH_SPRING * offset.x - TECH_DAMPING * velocity.x) * dt;
      velocity.y += (-TECH_SPRING * offset.y - TECH_DAMPING * velocity.y) * dt;
      offset.x += velocity.x * dt;
      offset.y += velocity.y * dt;
      moving = true;
    });

    const focus = dragging >= 0 ? dragging : active ? glyphAt(lens.x, lens.y) : -1;
    if (focus >= 0 && source.selection) {
      const current = glyphs[focus];
      const bx1 = current.box.x1 + current.offset.x - 6;
      const by1 = current.box.y1 + current.offset.y - 6;
      const bx2 = current.box.x2 + current.offset.x + 6;
      const by2 = current.box.y2 + current.offset.y + 6;
      if (frameBox.index < 0 || frameBox.alpha < 0.02) {
        frameBox.x1 = bx1;
        frameBox.y1 = by1;
        frameBox.x2 = bx2;
        frameBox.y2 = by2;
      }
      const glide = focus === dragging ? 0.02 : 0.08;
      frameBox.x1 = techApproach(frameBox.x1, bx1, dt, glide);
      frameBox.y1 = techApproach(frameBox.y1, by1, dt, glide);
      frameBox.x2 = techApproach(frameBox.x2, bx2, dt, glide);
      frameBox.y2 = techApproach(frameBox.y2, by2, dt, glide);
      frameBox.index = focus;
    }
    frameBox.alpha = techApproach(frameBox.alpha, focus >= 0 && source.selection ? 1 : 0, dt, 0.1);

    glyphs.forEach((glyph, index) => {
      const target = source.reveal === "letter" && index === focus && index !== dragging ? 1 : 0;
      glyph.outline = techApproach(glyph.outline, target, dt, 0.09);
      if (Math.abs(glyph.outline - target) > 0.002) moving = true;
      else glyph.outline = target;
    });

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    glyphs.forEach((glyph) => {
      const offsetDist = Math.hypot(glyph.offset.x, glyph.offset.y);
      if (offsetDist > 1) {
        ctx.globalAlpha = Math.min(1, offsetDist / 24) * 0.55;
        blit(ctx, glyph.dashes, 0, 0, stageOxDev, stageOyDev);
        ctx.globalAlpha = 1;
      }
    });
    glyphs.forEach((glyph) => {
      if (glyph.outline < 0.999) {
        ctx.globalAlpha = 1 - glyph.outline;
        blit(ctx, glyph.fill, glyph.offset.x, glyph.offset.y, stageOxDev, stageOyDev);
      }
      if (glyph.outline > 0.001) {
        ctx.globalAlpha = glyph.outline;
        blit(ctx, glyph.dashes, glyph.offset.x, glyph.offset.y, stageOxDev, stageOyDev);
      }
      ctx.globalAlpha = 1;
    });
    if (presence > 0.001) drawReveal(source);
    drawFrame(source);

    const settling =
      moving ||
      Math.abs(presence - (source.reveal === "area" && active && dragging < 0 ? 1 : 0)) > 0.002 ||
      (frameBox.alpha > 0.01 && frameBox.alpha < 0.99);
    if ((active || settling) && visible && alive) frameHandle = requestAnimationFrame(tick);
  }

  function wake() {
    if (frameHandle || !visible || !alive || document.hidden) return;
    last = performance.now();
    frameHandle = requestAnimationFrame(tick);
  }

  /**
   * 计算舞台矩形：设计盒与最近的内容面取并集，再钳到上限。
   * 拿不到内容面时按设计盒四周外扩兜底。
   */
  function measureStage() {
    let left = 0;
    let top = 0;
    let right = width;
    let bottom = height;
    let host = null;
    try {
      host = container.closest ? container.closest("[data-mui-surface]") : null;
    } catch {
      host = null;
    }
    const own = container.getBoundingClientRect();
    if (host && own.width > 0) {
      const box = host.getBoundingClientRect();
      if (box.width > 0 && box.height > 0) {
        left = Math.min(left, box.left - own.left);
        top = Math.min(top, box.top - own.top);
        right = Math.max(right, box.left - own.left + box.width);
        bottom = Math.max(bottom, box.top - own.top + box.height);
      }
    }
    if (right - left < width + 2) {
      left = -TECH_STAGE_MARGIN;
      right = width + TECH_STAGE_MARGIN;
      top = -TECH_STAGE_MARGIN;
      bottom = height + TECH_STAGE_MARGIN;
    }
    const unionW = Math.ceil(right - left);
    const unionH = Math.ceil(bottom - top);
    stage.w = Math.max(width, Math.min(unionW, TECH_STAGE_MAX_W));
    stage.h = Math.max(height, Math.min(unionH, TECH_STAGE_MAX_H));
    // 超上限时以并集中心裁剪，并保证设计盒始终落在舞台内。
    stage.ox = Math.min(0, Math.round(left + (unionW - stage.w) / 2));
    stage.oy = Math.min(0, Math.round(top + (unionH - stage.h) / 2));
    stageOxDev = Math.round(stage.ox * dpr);
    stageOyDev = Math.round(stage.oy * dpr);
  }

  function resize() {
    width = Math.max(1, container.clientWidth);
    height = Math.max(1, container.clientHeight);
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    measureStage();
    // canvas 绝对定位、尺寸由舞台决定；它只负责画，事件仍由容器接收。
    canvas.style.position = "absolute";
    canvas.style.left = `${stage.ox}px`;
    canvas.style.top = `${stage.oy}px`;
    canvas.style.width = `${stage.w}px`;
    canvas.style.height = `${stage.h}px`;
    canvas.width = Math.max(1, Math.round(stage.w * dpr));
    canvas.height = Math.max(1, Math.round(stage.h * dpr));
    layoutKey = "";
    if (width < 2 || height < 2) return;
    wake();
    drawStatic();
  }

  /** 只画一帧实心字形（无动画、无交互时的静态呈现）。 */
  function drawStatic() {
    if (!alive || width < 2 || height < 2) return;
    const source = settings;
    ensureLayout(source);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    glyphs.forEach((glyph) => {
      blit(ctx, glyph.fill, glyph.offset.x, glyph.offset.y, stageOxDev, stageOyDev);
    });
  }

  function locate(event) {
    const rect = container.getBoundingClientRect();
    pointer.x = event.clientX - rect.left;
    pointer.y = event.clientY - rect.top;
  }
  function onMove(event) {
    locate(event);
    pointer.inside = true;
    wake();
  }
  function onLeave() {
    if (dragging >= 0) return;
    pointer.inside = false;
    wake();
  }
  function onDown(event) {
    locate(event);
    pointer.inside = true;
    if (settings.draggable && (event.pointerType !== "mouse" || event.button === 0)) {
      const index = glyphAt(pointer.x, pointer.y);
      if (index >= 0) {
        dragging = index;
        grab.x = pointer.x - glyphs[index].offset.x;
        grab.y = pointer.y - glyphs[index].offset.y;
        if (container.setPointerCapture) container.setPointerCapture(event.pointerId);
      }
    }
    wake();
  }
  function onUp(event) {
    if (dragging >= 0) {
      dragging = -1;
      if (container.releasePointerCapture) {
        try {
          container.releasePointerCapture(event.pointerId);
        } catch {
          /* 指针已被系统释放 */
        }
      }
      const rect = container.getBoundingClientRect();
      pointer.inside =
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom;
    }
    wake();
  }

  let interactionsAttached = false;
  function attachInteractions() {
    if (interactionsAttached) return;
    interactionsAttached = true;
    container.addEventListener("pointermove", onMove, { passive: true });
    container.addEventListener("pointerenter", onMove, { passive: true });
    container.addEventListener("pointerdown", onDown, { passive: true });
    container.addEventListener("pointerup", onUp, { passive: true });
    container.addEventListener("pointercancel", onUp, { passive: true });
    container.addEventListener("pointerleave", onLeave, { passive: true });
  }
  function detachInteractions() {
    if (!interactionsAttached) return;
    interactionsAttached = false;
    container.removeEventListener("pointermove", onMove);
    container.removeEventListener("pointerenter", onMove);
    container.removeEventListener("pointerdown", onDown);
    container.removeEventListener("pointerup", onUp);
    container.removeEventListener("pointercancel", onUp);
    container.removeEventListener("pointerleave", onLeave);
    pointer.inside = false;
    dragging = -1;
  }

  if (settings.draggable || settings.selection) attachInteractions();

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);
  // 内容面尺寸变化（窗口缩放、侧栏开合）时舞台要跟着重算。
  try {
    const host = container.closest ? container.closest("[data-mui-surface]") : null;
    if (host) resizeObserver.observe(host);
  } catch {
    /* 没有内容面时只观察容器 */
  }
  const intersectionObserver = new IntersectionObserver((entries) => {
    const entry = entries[entries.length - 1];
    visible = !!(entry && entry.isIntersecting);
    if (visible) {
      resize();
      wake();
    }
  });
  intersectionObserver.observe(container);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(refreshFonts, refreshFonts);

  resize();

  return {
    /** 主题/字体/开关变化后调用：重算布局并按新的开关重绘。 */
    refresh(next) {
      if (next && typeof next === "object") {
        if (typeof next.color === "string") settings.color = next.color;
        if (typeof next.accentColor === "string") settings.accentColor = next.accentColor;
        if (typeof next.sweep === "boolean") settings.sweep = next.sweep;
        if (typeof next.interact === "boolean") {
          settings.selection = next.interact;
          settings.draggable = next.interact;
          settings.labels = next.interact;
          if (next.interact) attachInteractions();
          else detachInteractions();
        }
      }
      layoutKey = "";
      resize();
      drawStatic();
    },
    /** 静态重绘（无障碍/隐藏状态下用）。 */
    redraw: drawStatic,
    destroy() {
      alive = false;
      cancelAnimationFrame(frameHandle);
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      detachInteractions();
      canvas.remove();
    },
  };
}
