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
 * 信号场重绘帧率上限的取值范围（fps）。
 *
 * 波形本身很慢（waveSpeed 0.065），30fps 与 60fps 肉眼差别很小，
 * 所以默认取 30：60Hz 屏直接省一半重绘，120Hz 屏省到 1/4。
 * 下限 15 是「仍能看出是流动的」的下界，再低就会像卡帧而不是省电。
 */
export const FPS_RANGE = Object.freeze({ min: 15, max: 60, step: 5 });

/**
 * 动画速度倍率的取值范围（v0.3.0）。
 *
 * 标题速度与背景速度共用同一区间：1× 恰好等于「不做任何缩放」时的观感，
 * 所以默认 1 是零回归的中点。下限 0.25× 仍能看出在动（不会像冻屏），
 * 上限 2× 已经明显偏快，再高会让抖动颗粒与涟漪看起来发飘。
 */
export const SPEED_RANGE = Object.freeze({ min: 0.25, max: 2, step: 0.25 });

/**
 * 鲸鱼动画的取值范围（v0.4.0，从 dsh-ascii-whales 迁移后重新标定）。
 *
 * 与上游的区别只在步长：上游对 <1 的小数用 0.05、其余用区间步长，
 * 于是 bodySwing 的区间步长 0.1 会把 0.75 吸成 0.8、fishCount 的 10 会把 188 吸成 190。
 * 这里统一取「能精确命中全部默认值的最小步长」，所以 0.75 / 0.85 / 188 都原样保留。
 * 逐项默认值与含义见 README 的鲸鱼章节。
 */
export const WHALE_RANGES = Object.freeze({
  count: Object.freeze({ min: 1, max: 20, step: 1 }),
  speed: Object.freeze({ min: 0.1, max: 10, step: 0.05 }),
  bodySwing: Object.freeze({ min: 0, max: 3, step: 0.05 }),
  turnAgility: Object.freeze({ min: 0.1, max: 3, step: 0.05 }),
  tailFrequency: Object.freeze({ min: 0.1, max: 5, step: 0.05 }),
  size: Object.freeze({ min: 0.1, max: 10, step: 0.1 }),
  opacity: Object.freeze({ min: 0, max: 1, step: 0.05 }),
  gridScale: Object.freeze({ min: 0.1, max: 10, step: 0.05 }),
  gridOpacity: Object.freeze({ min: 0, max: 1, step: 0.01 }),
  fishCount: Object.freeze({ min: 0, max: 1000, step: 1 }),
  wake: Object.freeze({ min: 0, max: 10, step: 0.1 }),
});

/** 鲸鱼种类的合法取值：座头鲸 / 虎鲸。 */
export const WHALE_SPECIES = Object.freeze(['humpback', 'orca']);

/** whale 分组里可由 patch() 合并的键（顺序与设置页行序不同，这里只是键表）。 */
const WHALE_KEYS = Object.freeze([
  'enabled',
  'species',
  'count',
  'speed',
  'bodySwing',
  'turnAgility',
  'tailFrequency',
  'size',
  'opacity',
  'gridScale',
  'gridOpacity',
  'fishCount',
  'wake',
]);

/**
 * 归一化一个速度倍率：非有限值一律回落 1×，其余钳到 SPEED_RANGE。
 *
 * 与 num() 的区别：这里**不做步长吸附**，因为运行时也要用它把外部传进来的
 * 任意数字收紧成安全值（applyOptions / setSpeed 都依赖它），吸附交给设置层做。
 */
export function speedValue(input) {
  const raw = typeof input === 'number' && Number.isFinite(input) ? input : 1;
  return Math.min(SPEED_RANGE.max, Math.max(SPEED_RANGE.min, raw));
}

/**
 * 按倍率缩放一个**时间常数**（秒）。
 *
 * 注意方向：engine 里的 `techApproach(cur, target, dt, tau)` 中 tau 越小逼近越快，
 * 所以「速度倍率变大」必须让 tau **变小**，即 base / 倍率。
 * 这里写反是本轮最可能的 bug，speed.test.mjs 用单调性断言把它钉住。
 */
export function scaleTau(base, speed) {
  const value = typeof base === 'number' && Number.isFinite(base) ? base : 0;
  return value / speedValue(speed);
}

/**
 * 按倍率缩放一次**相位/年龄推进量**（dt 之类）。
 * 与 scaleTau 相反，这里是正比：倍率变大，同样时间内推进得更多。
 */
export function scaleStep(amount, speed) {
  const value = typeof amount === 'number' && Number.isFinite(amount) ? amount : 0;
  return value * speedValue(speed);
}

/**
 * 默认设置（v0.2.9 结构 + v0.2.11 的 background.fps + v0.3.0 的两个 speed
 * + v0.4.0 的 whale 分组）：
 *   pages      —— 哪些页面展示动效（设置页模块「页面」）
 *   title      —— 标题默认动效 / 鼠标交互 / 动画速度（默认 1×）
 *   background —— 背景默认动效 / 鼠标交互 / 强度（默认 30%）/ 帧率上限（默认 30fps）/ 速度（默认 1×）
 *   glass      —— 输入框毛玻璃总开关；blur 固定 14px，已不再提供滑块
 *   whale      —— 鲸鱼动画（v0.4.0 从 dsh-ascii-whales 迁移）：开关 + 种类 + 11 个数值项。
 *                 默认值 = 迁移当时用户的实际取值，不是上游出厂默认（差异见 README）。
 * HUD 面板毛玻璃没有独立开关：它跟随「聊天会话页面」开关（详见 README 设置页章节）。
 *
 * 逐版只往已有分组里**加键**，因此一直**不升 SCHEMA_VERSION**：
 * normalize() 对缺失键填默认值、对未知键直接丢弃，
 * 旧存档读出来就是新默认，旧版本读到新存档只是丢掉不认识的键，两个方向都不会坏。
 * v0.4.0 同样是加分组：旧存档没有 whale 键，读出来就是上表默认。
 */
export function defaults() {
  return {
    version: SCHEMA_VERSION,
    enabled: true,
    pages: { hero: true, chat: true },
    title: { idle: true, interact: true, speed: 1 },
    background: { idle: true, interact: true, intensity: 0.3, fps: 30, speed: 1 },
    glass: { enabled: true, blur: 14 },
    whale: {
      enabled: true,
      species: 'humpback',
      count: 1,
      speed: 0.5,
      bodySwing: 0.75,
      turnAgility: 0.8,
      tailFrequency: 0.85,
      size: 1.5,
      opacity: 0.5,
      gridScale: 0.5,
      gridOpacity: 0.1,
      fishCount: 188,
      wake: 1,
    },
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
  const whale = group(src.whale);

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
      speed: num(title.speed, SPEED_RANGE, base.title.speed),
    },
    background: {
      idle: bool(background.idle, base.background.idle),
      interact: bool(background.interact, base.background.interact),
      intensity: num(migratedIntensity, INTENSITY_RANGE, base.background.intensity),
      fps: num(background.fps, FPS_RANGE, base.background.fps),
      speed: num(background.speed, SPEED_RANGE, base.background.speed),
    },
    glass: {
      enabled: legacy ? legacy.glass : bool(glass.enabled, base.glass.enabled),
      blur: num(glass.blur, BLUR_RANGE, base.glass.blur),
    },
    // v0.4.0：鲸鱼动画。species 走白名单，其余走 num() 的钳位 + 步长吸附。
    whale: {
      enabled: bool(whale.enabled, base.whale.enabled),
      species: WHALE_SPECIES.includes(whale.species) ? whale.species : base.whale.species,
      count: num(whale.count, WHALE_RANGES.count, base.whale.count),
      speed: num(whale.speed, WHALE_RANGES.speed, base.whale.speed),
      bodySwing: num(whale.bodySwing, WHALE_RANGES.bodySwing, base.whale.bodySwing),
      turnAgility: num(whale.turnAgility, WHALE_RANGES.turnAgility, base.whale.turnAgility),
      tailFrequency: num(whale.tailFrequency, WHALE_RANGES.tailFrequency, base.whale.tailFrequency),
      size: num(whale.size, WHALE_RANGES.size, base.whale.size),
      opacity: num(whale.opacity, WHALE_RANGES.opacity, base.whale.opacity),
      gridScale: num(whale.gridScale, WHALE_RANGES.gridScale, base.whale.gridScale),
      gridOpacity: num(whale.gridOpacity, WHALE_RANGES.gridOpacity, base.whale.gridOpacity),
      fishCount: num(whale.fishCount, WHALE_RANGES.fishCount, base.whale.fishCount),
      wake: num(whale.wake, WHALE_RANGES.wake, base.whale.wake),
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
    title: mergeGroup(base.title, src.title, ['idle', 'interact', 'speed']),
    background: mergeGroup(base.background, src.background, [
      'idle',
      'interact',
      'intensity',
      'fps',
      'speed',
    ]),
    glass: mergeGroup(base.glass, src.glass, ['enabled', 'blur']),
    whale: mergeGroup(base.whale, src.whale, WHALE_KEYS),
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
