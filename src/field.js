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

const MAX_PALETTE = 8;
const DITHER_MODES = { bayer: 0, bayer4: 1, bayer2: 2, halftone: 3, lines: 4, crosshatch: 5, noise: 6, none: 7 };
const DITHER_EFFECTS = { erase: 0, reveal: 1, ripple: 2 };

const fieldClamp = (value, min, max) => Math.min(max, Math.max(min, value));

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
    const dt = last ? fieldClamp((now - last) / 1000, 0.0005, 0.05) : 1 / 60;
    last = now;
    if (!settings.disableAnimation && !reduceMotion) state.time += dt;

    const engaged = settings.enableMouseInteraction && pointer.inside && !reduceMotion;
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
      ripples[index].age += dt;
      if (ripples[index].age >= RIPPLE_SECONDS) ripples.splice(index, 1);
    }

    if (!settings.intro || reduceMotion) state.reveal = 1;
    else if (state.reveal < 1) state.reveal = Math.min(1, state.reveal + dt / INTRO_SECONDS);

    render();
    const busy =
      !settings.disableAnimation ||
      state.reveal < 1 ||
      ripples.length > 0 ||
      state.presence > 0.002 ||
      trailPoints.some((point) => point.weight > 0.01);
    if (busy && !reduceMotion) frameHandle = requestAnimationFrame(frame);
    else last = 0;
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
    wake();
  }
  function onPointerDown(event) {
    if (!settings.enableMouseInteraction) return;
    locate(event);
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
  };
}
