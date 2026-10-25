/**
 * dsh-signal-field · 设置模型
 *
 * 这里只放纯函数：默认值、归一化、局部合并、存储读写。
 * 之所以把它们与 DOM/React 代码分开，是为了让 `node --test` 能直接导入本文件做单元测试
 * （构建脚本会把本文件原样拼进 client.js，因此不依赖任何浏览器 API）。
 */

/** 语言资源命名空间。 */
export const NS = 'signal-field';

/** localStorage 的键名；后缀 = 结构版本，便于将来迁移。 */
export const STORAGE_KEY = 'dsh-signal-field:v1';

/**
 * 更名前的旧键（插件曾用名 `dsh-motion-ui`，见 README「从 dsh-motion-ui 升级」）。
 * 只在迁移时读一次：搬到新键后立刻删掉，磁盘上不再留旧名。
 */
export const LEGACY_STORAGE_KEY = 'dsh-motion-ui:v1';

/** 当前设置结构版本。v2 = v0.2.9 起的「页面开关 × 全局效果」结构。 */
export const SCHEMA_VERSION = 2;

/** 背景强度的取值范围（滑块的钳位与步长）。 */
export const INTENSITY_RANGE = Object.freeze({ min: 0, max: 1, step: 0.05 });

/** 毛玻璃模糊半径的取值范围（px）。 */
export const BLUR_RANGE = Object.freeze({ min: 0, max: 32, step: 1 });

/**
 * 默认设置（v0.2.9 结构）：
 *   pages      —— 哪些页面展示动效（设置页模块「页面」）
 *   title      —— 标题默认动效 / 鼠标交互（模块「动效」）
 *   background —— 背景默认动效 / 鼠标交互 / 强度（强度默认 30%）
 *   glass      —— 输入框毛玻璃总开关；blur 固定 14px，已不再提供滑块
 * HUD 面板毛玻璃没有独立开关：它跟随「聊天会话页面」开关（详见 README 设置页章节）。
 */
export function defaults() {
  return {
    version: SCHEMA_VERSION,
    enabled: true,
    pages: { hero: true, chat: true },
    title: { idle: true, interact: true },
    background: { idle: true, interact: true, intensity: 0.3 },
    glass: { enabled: true, blur: 14 },
  };
}

/** 布尔值兜底：非布尔一律回落到 fallback。 */
function bool(value, fallback) {
  return typeof value === 'boolean' ? value : fallback;
}

/** 数值兜底：非有限数回落到 fallback，其余先钳位再按步长吸附。 */
function num(value, range, fallback) {
  const raw = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  const clamped = Math.min(range.max, Math.max(range.min, raw));
  const snapped = Math.round((clamped - range.min) / range.step) * range.step + range.min;
  // 步长 0.05 会产生二进制浮点噪声，统一保留两位小数。
  return Math.round(snapped * 100) / 100;
}

/** 取一个安全对象，用于读取可选的嵌套输入。 */
function group(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

/**
 * 识别 v0.2.8 及更早的「按页 × 按效果」结构，并映射成新的「页面开关 × 全局效果」。
 * 只认 `surfaces`：新结构（version 2 / 有 pages）一律返回 null，保证迁移只发生一次。
 * @param {object} src 已确认是对象的输入
 * @returns {null | { hero: boolean, chat: boolean, glass: boolean }}
 */
function migrateSurfaces(src) {
  if (src.version === SCHEMA_VERSION) return null;
  const surfaces = src.surfaces;
  if (!surfaces || typeof surfaces !== 'object' || Array.isArray(surfaces)) return null;
  const hero = group(surfaces.hero);
  const chat = group(surfaces.chat);
  // 旧结构里每页每项都是独立开关：任一效果开着就认为该页仍在展示动效。
  const heroOn =
    bool(hero.title, true) || bool(hero.background, true) || bool(hero.glass, true);
  const chatOn = bool(chat.background, true) || bool(chat.glass, true);
  // 旧结构有「两页各自的毛玻璃」：任一页开着就视为全局玻璃开启。
  const glassOn = bool(hero.glass, true) || bool(chat.glass, true);
  return { hero: heroOn, chat: chatOn, glass: glassOn };
}

/** v0.2.8 及更早的强度默认值；迁移时把「恰好是旧默认」的值换成新默认 30%。 */
const LEGACY_DEFAULT_INTENSITY = 0.55;

/**
 * 把任意输入归一化为一份合法设置。
 * 未知键丢弃、类型错误回默认、数值钳位，损坏的 JSON 或旧结构都不会让 UI 崩掉。
 * @param {unknown} input 已解析的设置对象（可为 null/undefined/垃圾值）。
 * @returns {ReturnType<typeof defaults>} 全新对象，永不与输入共享引用。
 */
export function normalize(input) {
  const base = defaults();
  const src = group(input);
  const legacy = migrateSurfaces(src);
  const pages = group(src.pages);
  const title = group(src.title);
  const background = group(src.background);
  const glass = group(src.glass);

  // 旧结构恰用旧默认强度时，跟着新默认一起变淡；手调过的值原样保留。
  const rawIntensity = background.intensity;
  const migratedIntensity =
    legacy && rawIntensity === LEGACY_DEFAULT_INTENSITY ? base.background.intensity : rawIntensity;

  return {
    version: SCHEMA_VERSION,
    enabled: bool(src.enabled, base.enabled),
    pages: {
      hero: legacy ? legacy.hero : bool(pages.hero, base.pages.hero),
      chat: legacy ? legacy.chat : bool(pages.chat, base.pages.chat),
    },
    title: {
      idle: bool(title.idle, base.title.idle),
      interact: bool(title.interact, base.title.interact),
    },
    background: {
      idle: bool(background.idle, base.background.idle),
      interact: bool(background.interact, base.background.interact),
      intensity: num(migratedIntensity, INTENSITY_RANGE, base.background.intensity),
    },
    glass: {
      enabled: legacy ? legacy.glass : bool(glass.enabled, base.glass.enabled),
      blur: num(glass.blur, BLUR_RANGE, base.glass.blur),
    },
  };
}

/** 合并一组已知键：只接受对象里实际出现的键，避免把 undefined 覆盖进去。 */
function mergeGroup(base, partial, keys) {
  const src = group(partial);
  const next = { ...base };
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(src, key) && src[key] !== undefined) next[key] = src[key];
  }
  return next;
}

/**
 * 局部更新：只改动 partial 中显式出现的键，其余保持不变，结果仍经过归一化。
 * @param {unknown} state 当前设置。
 * @param {unknown} partial 局部改动。
 */
export function patch(state, partial) {
  const base = normalize(state);
  const src = group(partial);
  const next = {
    ...base,
    enabled: Object.prototype.hasOwnProperty.call(src, 'enabled') ? src.enabled : base.enabled,
    pages: mergeGroup(base.pages, src.pages, ['hero', 'chat']),
    title: mergeGroup(base.title, src.title, ['idle', 'interact']),
    background: mergeGroup(base.background, src.background, ['idle', 'interact', 'intensity']),
    glass: mergeGroup(base.glass, src.glass, ['enabled', 'blur']),
  };
  return normalize(next);
}

/** 判断两份设置是否等价（用于跳过无意义的重建与写入）。 */
export function sameState(a, b) {
  return JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));
}

/** 内存存储：测试与 localStorage 不可用时的兜底实现。 */
export function memoryStorage(initial) {
  const map = new Map();
  if (initial && typeof initial === 'object') {
    for (const [key, value] of Object.entries(initial)) map.set(key, String(value));
  }
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => void map.set(key, String(value)),
    removeItem: (key) => void map.delete(key),
  };
}

/**
 * 浏览器 localStorage 的保守包装：隐私模式或配额异常时静默退回内存实现，
 * 让「设置不能持久化」降级为「本次会话内有效」，而不是抛错打断插件加载。
 */
export function browserStorage(scope) {
  try {
    const storage = scope.localStorage;
    const probe = '__dsh_motion_ui_probe__';
    storage.setItem(probe, '1');
    storage.removeItem(probe);
    return storage;
  } catch {
    return memoryStorage();
  }
}

/**
 * 建立一个只读的运行时状态 store，用于把「标题挂载是否成功」「系统是否开启减少动效」
 * 这类非配置信息推给设置页展示。
 * @param {object} initial 初始状态。
 */
export function createStatus(initial) {
  let state = { titleAvailable: null, reducedMotion: false, fieldFallback: false, ...initial };
  const listeners = new Set();
  return {
    getSnapshot() {
      return state;
    },
    subscribe(listener) {
      if (typeof listener !== 'function') return () => {};
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    set(partial) {
      if (!partial || typeof partial !== 'object') return state;
      const next = { ...state, ...partial };
      if (JSON.stringify(next) === JSON.stringify(state)) return state;
      state = next;
      for (const listener of Array.from(listeners)) listener(state);
      return state;
    },
  };
}

/**
 * 建立设置 store：getSnapshot / subscribe / update / reset。
 * 读失败（损坏 JSON、跨版本结构）时回默认值并清掉坏键，写失败不影响内存态。
 * @param {{ getItem(key: string): string | null, setItem(key: string, value: string): void, removeItem(key: string): void }} storage
 */
export function createStore(storage) {
  const sink = storage && typeof storage.getItem === 'function' ? storage : memoryStorage();
  const listeners = new Set();
  let state = load(sink);

  /** 把旧键（更名前的 dsh-motion-ui:v1）搬进新键，幂等；任何异常都不影响启动。 */
  function migrateLegacyKey(target) {
    let legacy = null;
    try {
      legacy = target.getItem(LEGACY_STORAGE_KEY);
    } catch {
      return;
    }
    if (typeof legacy !== 'string' || legacy === '') return;
    let current = null;
    try {
      current = target.getItem(STORAGE_KEY);
    } catch {
      return;
    }
    // 新键为空才搬运；新键已有值说明迁移早已完成，只做残留清理。
    if (typeof current !== 'string' || current === '') {
      try {
        target.setItem(STORAGE_KEY, legacy);
      } catch {
        return; // 写不进去就保留旧键，下次启动再试
      }
    }
    try {
      target.removeItem(LEGACY_STORAGE_KEY);
    } catch {
      /* 清理失败无所谓：下次启动会因为新键已有值而再清一次 */
    }
  }

  function load(target) {
    migrateLegacyKey(target);
    let raw = null;
    try {
      raw = target.getItem(STORAGE_KEY);
    } catch {
      return defaults();
    }
    if (typeof raw !== 'string' || raw === '') return defaults();
    try {
      return normalize(JSON.parse(raw));
    } catch {
      try {
        target.removeItem(STORAGE_KEY);
      } catch {
        /* 忽略清理失败：本地状态已经回默认值 */
      }
      return defaults();
    }
  }

  function save(next) {
    try {
      sink.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* 写入失败只影响持久化，不影响本次会话 */
    }
  }

  function emit() {
    for (const listener of Array.from(listeners)) listener(state);
  }

  return {
    /** 当前设置的只读快照（每次变更换新引用，配合 useSyncExternalStore）。 */
    getSnapshot() {
      return state;
    },
    /** 订阅变更，返回退订函数。 */
    subscribe(listener) {
      if (typeof listener !== 'function') return () => {};
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    /** 局部更新；无实质变化时不写存储、不通知。 */
    update(partial) {
      const next = patch(state, partial);
      if (sameState(next, state)) return state;
      state = next;
      save(state);
      emit();
      return state;
    },
    /** 恢复默认设置。 */
    reset() {
      return this.update(defaults());
    },
  };
}
