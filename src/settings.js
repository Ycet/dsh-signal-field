/**
 * dsh-signal-field · 设置模型
 *
 * 这里只放纯函数：默认值、归一化、局部合并、存储读写。
 * 之所以把它们与 DOM/React 代码分开，是为了让 `node --test` 能直接导入本文件做单元测试
 * （构建脚本会把本文件原样拼进 client.js，因此不依赖任何浏览器 API）。
 *
 * v0.5.0 起设置结构升到 v3：**按页面组织**。
 *   enabled      —— 全局总开关（「设置 → UI 动画」第一张卡片）
 *   frame.fps    —— 全局面板帧率上限（v0.5.0 从 background.fps 提到顶层）
 *   glass.blur   —— 毛玻璃半径（固定 14px，不暴露给界面）
 *   pages.hero   —— 新建会话页：页总开关 + 背景（含参数）+ 标题 + 鲸鱼 + 毛玻璃
 *   pages.chat   —— 聊天会话页：页总开关 + 背景（含参数）+ 鲸鱼 + 毛玻璃
 *
 * v0.5.1 起鲸鱼两页都能用（此前只在新会话页）：`pages.chat.whale` 是新增的**同级分组**，
 * 参数与默认值和 `pages.hero.whale` 完全一致，但两页各存一份、互不影响。
 * 这是纯增量改动：结构版本仍是 v3，旧存档读出来只是多出这一组默认值（默认打开）。
 *
 * 为什么每个效果都带一个自己的 `enabled`：设置页按页分卡片后，
 * 「背景（开/关）」表示该页是否显示背景层（关闭即整层不创建），
 * 而「背景默认动效（自走/静止）」下沉到折叠区，两者是不同的概念。
 * 鲸鱼的 `enabled` 同理：它管「这一页要不要鲸鱼这一层」，参数在折叠区里单独调。
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

/** 当前设置结构版本。v3 = v0.5.0 起的「按页面组织」结构。 */
export const SCHEMA_VERSION = 3;

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

/** whale 分组里可由 patch() 合并的键。 */
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

/** background 分组里可由 patch() 合并的键。 */
const BACKGROUND_KEYS = Object.freeze(['enabled', 'idle', 'interact', 'intensity', 'speed']);

/** title 分组里可由 patch() 合并的键。 */
const TITLE_KEYS = Object.freeze(['enabled', 'idle', 'interact', 'speed']);

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

/** 一页背景的默认值（两页各自独立一份，避免共享引用）。 */
function backgroundDefaults() {
  return { enabled: true, idle: true, interact: true, intensity: 0.3, speed: 1 };
}

/** 新建会话页标题的默认值。 */
function titleDefaults() {
  return { enabled: true, idle: true, interact: true, speed: 1 };
}

/**
 * 鲸鱼默认值（v0.4.0 从 dsh-ascii-whales 迁移）：
 * 默认值 = 迁移当时用户的实际取值，不是上游出厂默认（差异见 README）。
 *
 * v0.5.1 起两页共用这一份默认值（产品决策：两页初始观感一致，之后各调各的）。
 */
function whaleDefaults() {
  return {
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
  };
}

/**
 * 默认设置（v0.5.0 / 结构 v3）。
 *
 * 逐版只往已有分组里**加键**：normalize() 对缺失键填默认值、对未知键直接丢弃，
 * 旧存档读出来就是新默认，旧版本读到新存档只是丢掉不认识的键，两个方向都不会坏。
 *
 * v0.5.0 的破例：结构从「全局效果」改成「按页效果」，旧存档里的效果参数**不再映射**，
 * 除总开关与帧率外一律回默认（产品决策，README 升级说明里明写）。
 */
export function defaults() {
  return {
    version: SCHEMA_VERSION,
    enabled: true,
    frame: { fps: 30 },
    // 毛玻璃半径固定 14px，只作为 CSS 变量的单一来源，不提供界面控件
    glass: { blur: 14 },
    pages: {
      hero: {
        enabled: true,
        background: backgroundDefaults(),
        title: titleDefaults(),
        whale: whaleDefaults(),
        glass: true,
      },
      chat: {
        enabled: true,
        background: backgroundDefaults(),
        whale: whaleDefaults(),
        glass: true,
      },
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

/** 归一化背景分组。 */
function normalizeBackground(value, base) {
  const src = group(value);
  return {
    enabled: bool(src.enabled, base.enabled),
    idle: bool(src.idle, base.idle),
    interact: bool(src.interact, base.interact),
    intensity: num(src.intensity, INTENSITY_RANGE, base.intensity),
    speed: num(src.speed, SPEED_RANGE, base.speed),
  };
}

/** 归一化标题分组。 */
function normalizeTitle(value, base) {
  const src = group(value);
  return {
    enabled: bool(src.enabled, base.enabled),
    idle: bool(src.idle, base.idle),
    interact: bool(src.interact, base.interact),
    speed: num(src.speed, SPEED_RANGE, base.speed),
  };
}

/** 归一化鲸鱼分组：species 走白名单，其余走 num() 的钳位 + 步长吸附。 */
function normalizeWhale(value, base) {
  const src = group(value);
  return {
    enabled: bool(src.enabled, base.enabled),
    species: WHALE_SPECIES.includes(src.species) ? src.species : base.species,
    count: num(src.count, WHALE_RANGES.count, base.count),
    speed: num(src.speed, WHALE_RANGES.speed, base.speed),
    bodySwing: num(src.bodySwing, WHALE_RANGES.bodySwing, base.bodySwing),
    turnAgility: num(src.turnAgility, WHALE_RANGES.turnAgility, base.turnAgility),
    tailFrequency: num(src.tailFrequency, WHALE_RANGES.tailFrequency, base.tailFrequency),
    size: num(src.size, WHALE_RANGES.size, base.size),
    opacity: num(src.opacity, WHALE_RANGES.opacity, base.opacity),
    gridScale: num(src.gridScale, WHALE_RANGES.gridScale, base.gridScale),
    gridOpacity: num(src.gridOpacity, WHALE_RANGES.gridOpacity, base.gridOpacity),
    fishCount: num(src.fishCount, WHALE_RANGES.fishCount, base.fishCount),
    wake: num(src.wake, WHALE_RANGES.wake, base.wake),
  };
}

/** 归一化新建会话页：页总开关 + 背景 + 标题 + 鲸鱼 + 毛玻璃。 */
function normalizeHero(value, base) {
  const src = group(value);
  return {
    enabled: bool(src.enabled, base.enabled),
    background: normalizeBackground(src.background, base.background),
    title: normalizeTitle(src.title, base.title),
    whale: normalizeWhale(src.whale, base.whale),
    glass: bool(src.glass, base.glass),
  };
}

/** 归一化聊天会话页：页总开关 + 背景 + 鲸鱼 + 毛玻璃（该页没有标题）。 */
function normalizeChat(value, base) {
  const src = group(value);
  return {
    enabled: bool(src.enabled, base.enabled),
    background: normalizeBackground(src.background, base.background),
    whale: normalizeWhale(src.whale, base.whale),
    glass: bool(src.glass, base.glass),
  };
}

/**
 * 把任意输入归一化为一份合法设置。
 * 未知键丢弃、类型错误回默认、数值钳位，损坏的 JSON 或旧结构都不会让 UI 崩掉。
 *
 * 兼容性说明（v0.5.0）：
 *   - 旧版 `pages.hero` 是布尔值 → group() 得空对象 → 该页总开关回默认 true（重置语义）；
 *   - 旧版全局 `background` / `title` / `whale` / `glass.enabled` 全部忽略（重置语义）；
 *   - 唯一保留的旧值是帧率：新路径 `frame.fps` 优先，缺失时回落到旧 `background.fps`；
 *   - 毛玻璃半径只在**当前结构版本**的存档里读取：旧结构没有这个可调项，
 *     按「升级即重置」的决策一律回默认 14px。
 *   - v0.5.1 的 `pages.chat.whale` 是 v3 结构内的**新增键**，因此不升版本号：
 *     旧的 v3 存档缺这一组时按默认值补（默认打开），符合「加键不破坏存档」的既有约定。
 *
 * @param {unknown} input 已解析的设置对象（可为 null/undefined/垃圾值）。
 * @returns {ReturnType<typeof defaults>} 全新对象，永不与输入共享引用。
 */
export function normalize(input) {
  const base = defaults();
  const src = group(input);
  const frame = group(src.frame);
  const legacyBackground = group(src.background);
  const pages = group(src.pages);
  const isCurrent = src.version === SCHEMA_VERSION;
  // 帧率是唯一跨版本保留的旧值：v0.2.11 起它一直在 background.fps。
  const fpsInput = frame.fps === undefined ? legacyBackground.fps : frame.fps;
  const blurInput = isCurrent ? group(src.glass).blur : undefined;

  return {
    version: SCHEMA_VERSION,
    enabled: bool(src.enabled, base.enabled),
    frame: { fps: num(fpsInput, FPS_RANGE, base.frame.fps) },
    glass: { blur: num(blurInput, BLUR_RANGE, base.glass.blur) },
    pages: {
      hero: normalizeHero(pages.hero, base.pages.hero),
      chat: normalizeChat(pages.chat, base.pages.chat),
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

/** 合并一个顶层布尔键（enabled / glass）：undefined 不覆盖。 */
function mergeFlag(base, src, key) {
  return Object.prototype.hasOwnProperty.call(src, key) && src[key] !== undefined
    ? src[key]
    : base;
}

/** 合并新建会话页（背景/标题/鲸鱼都是深一层分组）。 */
function mergeHero(base, partial) {
  const src = group(partial);
  return {
    enabled: mergeFlag(base.enabled, src, 'enabled'),
    background: mergeGroup(base.background, src.background, BACKGROUND_KEYS),
    title: mergeGroup(base.title, src.title, TITLE_KEYS),
    whale: mergeGroup(base.whale, src.whale, WHALE_KEYS),
    glass: mergeFlag(base.glass, src, 'glass'),
  };
}

/** 合并聊天会话页。 */
function mergeChat(base, partial) {
  const src = group(partial);
  return {
    enabled: mergeFlag(base.enabled, src, 'enabled'),
    background: mergeGroup(base.background, src.background, BACKGROUND_KEYS),
    whale: mergeGroup(base.whale, src.whale, WHALE_KEYS),
    glass: mergeFlag(base.glass, src, 'glass'),
  };
}

/**
 * 局部更新：只改动 partial 中显式出现的键，其余保持不变，结果仍经过归一化。
 *
 * 支持任意深度，例如：
 *   patch(state, { pages: { hero: { background: { intensity: 0.6 } } } })
 * 只会改新建会话页的背景强度，聊天会话页与标题、鲸鱼都不动。
 * 鲸鱼同理：两页各有一个 whale 分组，改 `pages.chat.whale` 不会牵动新建页那一份。
 *
 * @param {unknown} state 当前设置。
 * @param {unknown} partial 局部改动。
 */
export function patch(state, partial) {
  const base = normalize(state);
  const src = group(partial);
  const pages = group(src.pages);
  const next = {
    ...base,
    enabled: mergeFlag(base.enabled, src, 'enabled'),
    frame: mergeGroup(base.frame, src.frame, ['fps']),
    glass: mergeGroup(base.glass, src.glass, ['blur']),
    pages: {
      hero: mergeHero(base.pages.hero, pages.hero),
      chat: mergeChat(base.pages.chat, pages.chat),
    },
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
