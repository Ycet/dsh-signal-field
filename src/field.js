/**
 * dsh-signal-field · Dither 信号场引擎
 *
 * 移植自参考文档的 `createField()`：WebGL2 两趟 pass + 指针轨迹 + 点击涟漪。
 * 相对原实现的改动只有四处：
 *   1. 配色由调用方按 DSH 亮/暗主题传入（不再读 CSS 变量）；
 *   2. 颜色字符串用十六进制解析，省掉原实现的 1×1 canvas 试探；
 *   3. 尺寸为 0（页面隐藏 / 尚未布局）时跳过绘制，避免 WebGL 报错；
 *   4. 上下文丢失时降级为静态底并回报，而不是继续空转 rAF。
 */

import { DITHER_FRAGMENT, INTRO_SECONDS, MAX_RIPPLES, MAX_TRAIL, RIPPLE_SECONDS, VERTEX, WAVE_FRAGMENT } from "./glsl.js";
import { FPS_RANGE, scaleStep, speedValue } from "./settings.js";

const MAX_PALETTE = 8;
const DITHER_MODES = { bayer: 0, bayer4: 1, bayer2: 2, halftone: 3, lines: 4, crosshatch: 5, noise: 6, none: 7 };
const DITHER_EFFECTS = { erase: 0, reveal: 1, ripple: 2 };

const fieldClamp = (value, min, max) => Math.min(max, Math.max(min, value));

/** 失焦时的重绘上限（fps）：保持「仍能看到缓慢流动」，而不是冻成一张静图。 */
const BLUR_FPS_CAP = 8;

/** 指针交互结束后继续满帧的时长（ms）：划线与涟漪期间手感优先。 */
const BOOST_WINDOW_MS = 1200;

/**
 * 帧预算的宽容量（ms）。
 *
 * rAF 的时间戳会抖（33.3ms 的预算有时 32.9ms 就到），
 * 不留余量的话稳定落在边界上会每隔一帧掉一次，实际帧率腰斩。
 */
const PACE_TOLERANCE_MS = 1.5;

/**
 * 判定「这一帧要不要真正绘制」（纯函数，便于 node --test 直接验证）。
 *
 * 只决定绘制与否，不负责推进物理：跳掉的帧不能推进时间基准，
 * 否则动画速度会跟着限帧一起变，看起来像是变慢了而不是变省电了。
 *
 * @param {{ now?: number, lastRenderAt?: number, fps?: number, blurred?: boolean, boosting?: boolean }} input
 * @returns {{ render: boolean, effectiveFps: number }} effectiveFps 为 0 表示不限帧。
 */
export function framePaceDecision(input) {
  const src = input || {};
  const now = Number.isFinite(src.now) ? src.now : 0;
  const lastRenderAt = Number.isFinite(src.lastRenderAt) ? src.lastRenderAt : 0;
  const rawFps = Number.isFinite(src.fps) ? src.fps : 30;
  const cap = fieldClamp(rawFps, FPS_RANGE.min, FPS_RANGE.max);

  // 交互期间放开限帧：轨迹要跟手，而这段时间本来就只有一两秒。
  if (src.boosting) return { render: true, effectiveFps: 0 };

  const effectiveFps = src.blurred ? Math.min(BLUR_FPS_CAP, cap) : cap;
  // 没有绘制基准（首帧、刚从停止/暂停恢复）时必须先画一帧，否则首屏会空等一个预算周期。
  if (!lastRenderAt) return { render: true, effectiveFps };

  const budget = 1000 / effectiveFps;
  return { render: now - lastRenderAt >= budget - PACE_TOLERANCE_MS, effectiveFps };
}

/** sRGB 十六进制 → 线性 RGB（着色器里按线性空间混色）。 */
function hexToLinearRgb(hex) {
  let text = String(hex || "").replace("#", "").trim();
  if (text.length === 3) text = text.replace(/./g, (char) => char + char);
  const int = Number.parseInt(text.slice(0, 6), 16);
  const parts = Number.isNaN(int) ? [0, 0, 0] : [(int >> 16) & 255, (int >> 8) & 255, int & 255];
  return parts.map((channel) => {
    const s = channel / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
}

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader;
  gl.deleteShader(shader);
  return null;
}

function link(gl, fragmentSource) {
  const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX);
  const fragment = compile(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();
  if (!vertex || !fragment || !program) {
    if (vertex) gl.deleteShader(vertex);
    if (fragment) gl.deleteShader(fragment);
    if (program) gl.deleteProgram(program);
    return null;
  }
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.bindAttribLocation(program, 0, "aPosition");
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program);
    return null;
  }
  const uniforms = {};
  const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
  for (let index = 0; index < count; index += 1) {
    const info = gl.getActiveUniform(program, index);
    if (info) uniforms[info.name.replace("[0]", "")] = gl.getUniformLocation(program, info.name);
  }
  return { program, uniforms };
}

/** 亮/暗两套配色与动态参数（取自参考文档的 `fieldProps()`）。 */
function themeProps(dark) {
  return dark
    ? {
        backgroundColor: "#070a12",
        waveColor: "#3a4a7a",
        mouseEffect: "reveal",
        contrast: 1,
        brightness: -0.01,
        opacityBase: 0.82,
      }
    : {
        backgroundColor: "#e7e9f0",
        waveColor: "#b6bfd8",
        mouseEffect: "erase",
        contrast: 0.86,
        brightness: 0.05,
        opacityBase: 0.55,
      };
}

/**
 * 在容器里建一块信号场画布。
 * @param {HTMLElement} container 宿主元素（插件自有的 `[data-mui-field]`）。
 * @param {{ dark?: boolean, intensity?: number, idle?: boolean, interact?: boolean, reduceMotion?: boolean, onFallback?: (reason: string) => void }} options
 * @returns {{ update(options: object): void, destroy(): void, readonly fallback: boolean, readonly canvas: HTMLCanvasElement | null }}
 */
export function createField(container, options) {
  const initial = options || {};
  const reduceMotion = !!initial.reduceMotion;
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  container.append(canvas);

  const noop = {
    update() {},
    destroy() {
      canvas.remove();
    },
    fallback: true,
    canvas: null,
  };

  let gl = null;
  try {
    gl = canvas.getContext("webgl2", {
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      depth: false,
      stencil: false,
    });
  } catch {
    gl = null;
  }
  if (!gl) {
    if (typeof initial.onFallback === "function") initial.onFallback("no-webgl2");
    return noop;
  }

  const waveProgram = link(gl, WAVE_FRAGMENT);
  const ditherProgram = link(gl, DITHER_FRAGMENT);
  if (!waveProgram || !ditherProgram) {
    if (typeof initial.onFallback === "function") initial.onFallback("no-program");
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    canvas.remove();
    return noop;
  }

  const buffer = gl.createBuffer();
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  const fieldTexture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, fieldTexture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const framebuffer = gl.createFramebuffer();

  const settings = {
    waveSpeed: 0.065,
    waveFrequency: 2.6,
    waveAmplitude: 0.32,
    scale: 1.9,
    colorNum: 4,
    pixelSize: 3,
    trail: 0.55,
    clickRipple: true,
    intro: true,
    enableMouseInteraction: true,
    disableAnimation: false,
    mode: DITHER_MODES.bayer,
    effect: DITHER_EFFECTS.erase,
    mouseRadius: 0.34,
    mouseStrength: 0.9,
    waveColor: "#b6bfd8",
    backgroundColor: "#e7e9f0",
    opacityBase: 0.55,
    intensity: 0.55,
    contrast: 0.86,
    brightness: 0.05,
    dpr: 1,
    fps: 30,
    // v0.3.0：整片背景的时钟倍率（1 = 不缩放）。
    speed: 1,
  };

  const view = { width: 1, height: 1, ratio: 1, cell: 1, cellCss: 1, cols: 1, rows: 1 };
  const pointer = { x: 0, y: 0, inside: false, set: false };
  let trailPoints = [];
  let ripples = [];
  const trailData = new Float32Array(MAX_TRAIL * 3);
  const rippleData = new Float32Array(MAX_RIPPLES * 4);
  const paletteData = new Float32Array(MAX_PALETTE * 3);
  const state = { time: 0, hx: 0, hy: 0, presence: 0, reveal: settings.intro && !reduceMotion ? 0 : 1 };
  let frameHandle = 0;
  let last = 0;
  let visible = true;
  let ready = false;
  let alive = true;
  let lost = false;

  // ---- v0.2.11：帧预算 / 失焦 / 交互加速 / 运行统计 ----------------------
  /** 上一次**真正绘制**的时间戳。跳帧不更新它，否则预算判定会自激。 */
  let lastRenderAt = 0;
  /** 指针交互期间的满帧窗口截止时间（performance.now 时间轴）。 */
  let boostUntil = 0;
  /** 窗口失焦：降到 BLUR_FPS_CAP，回焦立刻回满。 */
  let blurred = false;
  /** 运行统计：只存在内存里，经 diagnose() 读出去，不落盘、不上送。 */
  const stat = {
    windowStart: 0,
    windowRenders: 0,
    windowRenderMs: 0,
    fps: 0,
    avgRenderMs: 0,
    renders: 0,
    skips: 0,
    frames: 0,
    effectiveFps: 0,
  };

  /**
   * 每秒滚动一次统计窗口：给出「最近一秒的实际绘制帧率」与平均单帧渲染耗时。
   * 跳帧也计入调用（只统计渲染侧的帧率，这样限帧效果直接可见）。
   */
  function rollStatWindow(now) {
    if (!stat.windowStart) {
      stat.windowStart = now;
      return;
    }
    const elapsed = now - stat.windowStart;
    if (elapsed < 1000) return;
    stat.fps = Math.round((stat.windowRenders * 1000) / elapsed);
    stat.avgRenderMs = stat.windowRenders > 0 ? stat.windowRenderMs / stat.windowRenders : 0;
    stat.windowStart = now;
    stat.windowRenders = 0;
    stat.windowRenderMs = 0;
  }

  function applyOptions(next) {
    const src = next || {};
    if (typeof src.intensity === "number") {
      settings.intensity = fieldClamp(src.intensity, 0, 1);
      canvas.style.opacity = String(
        Math.min(1, settings.opacityBase * (settings.intensity / 0.55)),
      );
    }
    if (typeof src.idle === "boolean") settings.disableAnimation = !src.idle;
    if (typeof src.interact === "boolean") settings.enableMouseInteraction = src.interact;
    if (typeof src.dark === "boolean") {
      const props = themeProps(src.dark);
      settings.backgroundColor = props.backgroundColor;
      settings.waveColor = props.waveColor;
      settings.opacityBase = props.opacityBase;
      settings.contrast = props.contrast;
      settings.brightness = props.brightness;
      settings.effect = DITHER_EFFECTS[props.mouseEffect];
      container.style.setProperty("--mui-field-bg", props.backgroundColor);
      container.style.setProperty("--mui-field-wave", props.waveColor);
      canvas.style.opacity = String(
        Math.min(1, settings.opacityBase * (settings.intensity / 0.55)),
      );
    }
    if (typeof src.dpr === "number") settings.dpr = Math.min(2, Math.max(1, src.dpr));
    // v0.2.11：重绘帧率上限。非法值保持现值，避免设置层出问题时把画面锁死。
    if (typeof src.fps === "number" && Number.isFinite(src.fps)) {
      settings.fps = fieldClamp(Math.round(src.fps), FPS_RANGE.min, FPS_RANGE.max);
    }
    // v0.3.0：背景动画速度倍率。非法值保持现值，避免把画面锁死或锁成一帧静止。
    if (typeof src.speed === "number" && Number.isFinite(src.speed)) {
      settings.speed = speedValue(src.speed);
    }
  }

  applyOptions({ ...initial, dpr: (window.devicePixelRatio || 1) });

  function allocate() {
    view.cell = Math.max(1, Math.round(settings.pixelSize * view.ratio));
    view.cellCss = view.cell / view.ratio;
    view.cols = Math.max(1, Math.ceil(canvas.width / view.cell));
    view.rows = Math.max(1, Math.ceil(canvas.height / view.cell));
    gl.bindTexture(gl.TEXTURE_2D, fieldTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, view.cols, view.rows, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, fieldTexture, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  function toUv(x, y) {
    const aspect = view.width / view.height;
    return [(x / view.width - 0.5) * aspect, -(y / view.height - 0.5)];
  }

  function render() {
    if (!ready || lost || !alive) return;
    const expected = Math.max(1, Math.round(settings.pixelSize * view.ratio));
    if (expected !== view.cell) allocate();

    let trailCount = 0;
    for (let index = 0; index < trailPoints.length && trailCount < MAX_TRAIL; index += 1) {
      const point = trailPoints[index];
      if (point.weight <= 0.01) continue;
      trailData[trailCount * 3] = point.x;
      trailData[trailCount * 3 + 1] = point.y;
      trailData[trailCount * 3 + 2] = point.weight;
      trailCount += 1;
    }
    let rippleCount = 0;
    for (let index = ripples.length - 1; index >= 0 && rippleCount < MAX_RIPPLES; index -= 1) {
      rippleData[rippleCount * 4] = ripples[index].x;
      rippleData[rippleCount * 4 + 1] = ripples[index].y;
      rippleData[rippleCount * 4 + 2] = ripples[index].age;
      rippleData[rippleCount * 4 + 3] = 1;
      rippleCount += 1;
    }

    const eased = settings.intro && !reduceMotion ? state.reveal * state.reveal * (3 - 2 * state.reveal) : 1;

    gl.bindVertexArray(vao);
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.viewport(0, 0, view.cols, view.rows);
    gl.useProgram(waveProgram.program);
    const w = waveProgram.uniforms;
    gl.uniform2f(w.uResolution, canvas.width / view.ratio, canvas.height / view.ratio);
    gl.uniform1f(w.uCell, view.cellCss);
    gl.uniform1f(w.uTime, state.time);
    gl.uniform1f(w.uWaveSpeed, settings.waveSpeed);
    gl.uniform1f(w.uWaveFrequency, settings.waveFrequency);
    gl.uniform1f(w.uWaveAmplitude, settings.waveAmplitude);
    gl.uniform1f(w.uScale, settings.scale);
    gl.uniform1f(w.uContrast, settings.contrast);
    gl.uniform1f(w.uBrightness, settings.brightness);
    gl.uniform1i(w.uEffect, settings.effect);
    gl.uniform1f(w.uRadius, settings.mouseRadius);
    gl.uniform1f(w.uStrength, settings.mouseStrength);
    gl.uniform3fv(w.uTrail, trailData);
    gl.uniform1i(w.uTrailCount, trailCount);
    gl.uniform4fv(w.uRipples, rippleData);
    gl.uniform1i(w.uRippleCount, rippleCount);
    gl.uniform1f(w.uIntro, eased);
    gl.uniform1f(w.uReach, 0.5 * Math.hypot(view.width / view.height, 1) + 0.45);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.useProgram(ditherProgram.program);
    const d = ditherProgram.uniforms;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, fieldTexture);
    gl.uniform1i(d.uField, 0);
    gl.uniform2i(d.uFieldSize, view.cols, view.rows);
    gl.uniform1f(d.uCellDevice, view.cell);
    gl.uniform1i(d.uMode, settings.mode);
    gl.uniform1f(d.uColorNum, settings.colorNum);
    gl.uniform3fv(d.uWave, hexToLinearRgb(settings.waveColor));
    gl.uniform3fv(d.uBackground, hexToLinearRgb(settings.backgroundColor));
    gl.uniform1f(d.uTransparent, 0);
    gl.uniform3fv(d.uPalette, paletteData);
    gl.uniform1i(d.uPaletteCount, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function frame(now) {
    frameHandle = 0;
    if (!alive || lost) return;
    if (!visible || document.hidden) return;

    // 系统「减少动效」：每次唤醒只画一帧静态底，不续帧、也不套帧预算（保持 v0.2.10 行为）。
    if (reduceMotion) {
      last = 0;
      lastRenderAt = 0;
      render();
      return;
    }

    // 先判定这条 rAF 链还该不该活着。顺序很关键：**先排下一帧，再决定跳不跳**。
    // 反过来写的话，被预算跳掉的那一帧会把链路断掉，画面就永久停在它上面了。
    const busy =
      !settings.disableAnimation ||
      state.reveal < 1 ||
      ripples.length > 0 ||
      state.presence > 0.002 ||
      trailPoints.some((point) => point.weight > 0.01);
    if (!busy) {
      last = 0;
      lastRenderAt = 0;
      return;
    }
    frameHandle = requestAnimationFrame(frame);

    // 帧预算：到期才真正绘制，被跳过的帧只花一次 rAF 回调（无绘制、无布局）。
    const pace = framePaceDecision({
      now,
      lastRenderAt,
      fps: settings.fps,
      blurred,
      boosting: boostUntil > now,
    });
    stat.effectiveFps = pace.effectiveFps;
    stat.frames += 1;
    if (!pace.render) {
      // 跳过绘制时不推进物理、不更新 last：动画速度才不会跟着限帧一起变快或变慢。
      stat.skips += 1;
      rollStatWindow(now);
      return;
    }

    const dt = last ? fieldClamp((now - last) / 1000, 0.0005, 0.05) : 1 / 60;
    last = now;
    lastRenderAt = now;
    // v0.3.0：整体时钟走速。波形（uTime × uWaveSpeed）与着色器里涟漪摆动的
    // `uTime * 7.0` 都由 state.time 驱动，所以乘在这里等于让整片背景一起变快/变慢。
    // 拖尾衰减、指针跟随、入场揭示刻意仍用原始 dt，不受速度影响。
    if (!settings.disableAnimation) state.time += scaleStep(dt, settings.speed);

    const engaged = settings.enableMouseInteraction && pointer.inside;
    state.presence += ((engaged ? 1 : 0) - state.presence) * (1 - Math.exp(-dt / (engaged ? 0.12 : 0.35)));
    if (pointer.set && settings.enableMouseInteraction) {
      const uv = toUv(pointer.x, pointer.y);
      const follow = 1 - Math.exp(-dt / 0.06);
      const moved = Math.hypot(uv[0] - state.hx, uv[1] - state.hy);
      state.hx += (uv[0] - state.hx) * follow;
      state.hy += (uv[1] - state.hy) * follow;
      const decay = Math.exp(-dt / (0.08 + settings.trail * 0.7));
      trailPoints.forEach((point) => {
        point.weight *= decay;
      });
      const head = trailPoints[0];
      if (!head || Math.hypot(head.x - state.hx, head.y - state.hy) > 0.012 || moved > 0.012) {
        trailPoints.unshift({ x: state.hx, y: state.hy, weight: state.presence });
      } else {
        head.x = state.hx;
        head.y = state.hy;
        head.weight = state.presence;
      }
      if (settings.trail <= 0.001) trailPoints.length = Math.min(trailPoints.length, 1);
      while (
        trailPoints.length > MAX_TRAIL ||
        (trailPoints.length > 1 && trailPoints[trailPoints.length - 1].weight < 0.01)
      ) {
        trailPoints.pop();
      }
    }

    for (let index = ripples.length - 1; index >= 0; index -= 1) {
      // 涟漪年龄同样按倍率推进：扩散变快、存续也同比缩短（1.6s ÷ 倍率）。
      // 这是「整片背景统一倍率」的必然结果，属于预期行为（见 README）。
      ripples[index].age += scaleStep(dt, settings.speed);
      if (ripples[index].age >= RIPPLE_SECONDS) ripples.splice(index, 1);
    }

    if (!settings.intro) state.reveal = 1;
    else if (state.reveal < 1) state.reveal = Math.min(1, state.reveal + dt / INTRO_SECONDS);

    const startedAt = performance.now();
    render();
    // 统计量只在内存里累加，经 stats 读给 diagnose()，不落盘、不上送。
    stat.windowRenderMs += performance.now() - startedAt;
    stat.windowRenders += 1;
    stat.renders += 1;
    rollStatWindow(now);
  }

  function wake() {
    if (!frameHandle && visible && !document.hidden && alive && !lost) {
      frameHandle = requestAnimationFrame(frame);
    }
  }

  function resize() {
    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);
    if (width < 2 || height < 2) {
      ready = false;
      return;
    }
    const ratio = Math.min(settings.dpr || window.devicePixelRatio || 1, 2);
    view.width = width;
    view.height = height;
    canvas.width = Math.max(1, Math.round(width * ratio));
    canvas.height = Math.max(1, Math.round(height * ratio));
    view.ratio = canvas.width / width;
    ready = true;
    allocate();
    render();
    wake();
  }

  function locate(event) {
    const rect = container.getBoundingClientRect();
    pointer.x = event.clientX - rect.left;
    pointer.y = event.clientY - rect.top;
    pointer.inside =
      pointer.x >= 0 && pointer.y >= 0 && pointer.x <= rect.width && pointer.y <= rect.height;
    if (pointer.inside && !pointer.set) {
      const uv = toUv(pointer.x, pointer.y);
      state.hx = uv[0];
      state.hy = uv[1];
      pointer.set = true;
    }
  }

  function onPointerMove(event) {
    if (!settings.enableMouseInteraction) return;
    locate(event);
    // 交互期间临时放开限帧：轨迹要跟手，这段窗口结束会自动滑回滑块值。
    boostUntil = performance.now() + BOOST_WINDOW_MS;
    wake();
  }
  function onPointerDown(event) {
    if (!settings.enableMouseInteraction) return;
    locate(event);
    boostUntil = performance.now() + BOOST_WINDOW_MS;
    if (!pointer.inside || !settings.clickRipple || reduceMotion) return;
    const uv = toUv(pointer.x, pointer.y);
    ripples.push({ x: uv[0], y: uv[1], age: 0 });
    if (ripples.length > MAX_RIPPLES) ripples.shift();
    wake();
  }
  function onPointerUp(event) {
    if (event.pointerType !== "mouse") pointer.inside = false;
  }
  function onPointerLeave() {
    pointer.inside = false;
  }
  function onVisibility() {
    last = 0;
    wake();
  }
  /**
   * 窗口失焦（切到别的 app）时把重绘降到 BLUR_FPS_CAP。
   *
   * 这里选择「降频」而不是「暂停」：分屏一边干活一边看着 DSH 时，
   * 背景仍然在缓慢流动，不会突然变成一张死图；而真正不看的时候省掉的正是绝大部分帧。
   */
  function onWindowBlur() {
    blurred = true;
  }
  /** 回焦立刻回满：清掉时间基准，避免拿失焦期间累积的大 dt 猛跳一下。 */
  function onWindowFocus() {
    blurred = false;
    last = 0;
    lastRenderAt = 0;
    wake();
  }
  function onContextLost(event) {
    event.preventDefault();
    lost = true;
    cancelAnimationFrame(frameHandle);
    frameHandle = 0;
    container.setAttribute("data-fallback", "");
    if (typeof initial.onFallback === "function") initial.onFallback("context-lost");
  }

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);
  const intersection = new IntersectionObserver((entries) => {
    visible = entries.some((entry) => entry.isIntersecting);
    if (visible) {
      last = 0;
      wake();
    }
  });
  intersection.observe(container);
  window.addEventListener("pointermove", onPointerMove, { passive: true });
  window.addEventListener("pointerdown", onPointerDown, { passive: true });
  window.addEventListener("pointerup", onPointerUp, { passive: true });
  window.addEventListener("pointercancel", onPointerUp, { passive: true });
  document.documentElement.addEventListener("pointerleave", onPointerLeave);
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("blur", onWindowBlur);
  window.addEventListener("focus", onWindowFocus);
  canvas.addEventListener("webglcontextlost", onContextLost);
  resize();

  return {
    update(next) {
      applyOptions(next);
      if (!ready) resize();
      else {
        const expected = Math.max(1, Math.round(settings.pixelSize * view.ratio));
        if (expected !== view.cell) allocate();
        if (!frameHandle) render();
        wake();
      }
    },
    destroy() {
      alive = false;
      cancelAnimationFrame(frameHandle);
      resizeObserver.disconnect();
      intersection.disconnect();
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      document.documentElement.removeEventListener("pointerleave", onPointerLeave);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onWindowBlur);
      window.removeEventListener("focus", onWindowFocus);
      canvas.removeEventListener("webglcontextlost", onContextLost);
      trailPoints = [];
      ripples = [];
      gl.deleteProgram(waveProgram.program);
      gl.deleteProgram(ditherProgram.program);
      gl.deleteBuffer(buffer);
      gl.deleteVertexArray(vao);
      gl.deleteTexture(fieldTexture);
      gl.deleteFramebuffer(framebuffer);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
      canvas.remove();
    },
    get fallback() {
      return lost;
    },
    get canvas() {
      return canvas;
    },
    /**
     * 运行统计：只在内存里，供 diagnose() 读出去做验收，界面上不展示、也不上送。
     * 停止绘制时 fps 报 0 而不是残留的旧数字——此时根本没有在画，报旧值会误导排查。
     */
    get stats() {
      return {
        fps: frameHandle ? stat.fps : 0,
        avgRenderMs: Math.round(stat.avgRenderMs * 100) / 100,
        renders: stat.renders,
        skips: stat.skips,
        effectiveFps: stat.effectiveFps,
        cap: settings.fps,
        blurred,
      };
    },
  };
}
