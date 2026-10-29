/**
 * dsh-signal-field · 舞台装配
 *
 * 负责把「信号场 / 标题 / 毛玻璃」三件事接到 DSH 的真实 DOM 上，并在设置变化、页面切换、
 * 主题切换、窗口尺寸变化时做增量更新。设计取舍：
 *
 *   - 作用范围只有两类页面：新增会话页与聊天会话页。判定唯一依据是 DSH 发布的
 *     `[data-conversation-content]`（及其 `data-content-phase`），不依赖 ctx.layout。
 *     其它页面（插件管理页、自动化任务页、未来新增的面板页）一律不介入；
 *     从会话页离开时还会清除全部痕迹（图层节点、画布、根属性与 CSS 变量）。
 *   - 背景必须落在内容之下，而官方 Slot 都是内容之上的座位，所以把图层插进会话内容面内部：
 *     父级 isolation + 图层 z-index:-1，正好压在内容面自身底色之上、正文之下。
 *   - 标题挂载点没有官方 Slot（`conversation.hero.brand.mark` 是正方形品牌标，不是横幅标题），
 *     所以按「hero 区域内字号最大的文本块」定位并插到它的前一个兄弟位置，找不到就降级。
 *   - 所有锚点缺失时只丢视觉效果：不抛错、不改 DSH 状态，并通过 status 告诉设置页。
 */

import { createField } from "./field.js";
import { PAGE_CHAT, PAGE_HERO, PAGE_NONE, resolvePageKind, resolvePanelTargets, resolveWhaleTarget } from "./page.js";
import { createTechText, measureTitle } from "./techtext.js";
import { createWhaleField } from "./whale-field.js";

/** 标题文案（需求固定）。 */
export const TITLE_TEXT = "DEEPSEEK HARNESS";

/** 标题目标字号（CSS px）：比 hero 行的 26px 文案大一档，与鲸鱼图标/徽标同处一行。 */
const TITLE_TARGET_SIZE = 42;

/** 读取宿主主题 token（由 DSH 的 ThemePresenter 写在 body 的行内样式上）。 */
function readToken(doc, name, fallback) {
  try {
    const value = getComputedStyle(doc.body).getPropertyValue(name).trim();
    return value || fallback;
  } catch {
    return fallback;
  }
}

/** 数值夹取：几何计算里到处要防 NaN 与越界。 */
function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

/**
 * 流式输出期间的同步合并窗口（ms）。
 *
 * 会话在流式输出时 `body` 的 childList 每帧都在变，而 sync() 里有 5~8 次布局读
 * （会话面/座位/卡片/面板的 getBoundingClientRect）。这些几何在流式期间几乎不会变，
 * 所以把这条通道合并到 ~8 次/秒，布局读开销降一个数量级。
 */
const SYNC_RELAXED_MS = 120;

/**
 * 判断这次同步该不该现在就跑（纯函数，供 node --test 直接验证）。
 *
 * 两条通道：
 *   - urgent：页面切换 / 主题 / 设置变更 / resize / 可见性。这些必须立刻同步，
 *     否则图层会「晚一拍才出现」，用户能看出来。
 *   - relaxed：只服务流式输出的高频 childList 噪声，一个窗口内跑一次就够。
 *
 * @param {{ urgent?: boolean, now?: number, lastSyncAt?: number, window?: number }} input
 * @returns {{ run: boolean, waitMs: number }} waitMs > 0 表示还需等待多少毫秒。
 */
export function resolveSyncCoalesce(input) {
  const src = input || {};
  if (src.urgent) return { run: true, waitMs: 0 };
  const now = Number.isFinite(src.now) ? src.now : 0;
  const lastSyncAt = Number.isFinite(src.lastSyncAt) ? src.lastSyncAt : 0;
  const window = Number.isFinite(src.window) && src.window >= 0 ? src.window : SYNC_RELAXED_MS;
  // 从未同步过（首屏）：立刻跑，否则首屏图层要空等一个窗口才出现。
  if (!lastSyncAt) return { run: true, waitMs: 0 };
  const elapsed = now - lastSyncAt;
  if (elapsed >= window) return { run: true, waitMs: 0 };
  return { run: false, waitMs: window - elapsed };
}

/**
 * @param {{ store: object, status: object, documentRef: Document }} options
 */
export function createStage(options) {
  const store = options.store;
  const status = options.status;
  const doc = options.documentRef;

  let layerEl = null;
  let field = null;
  /** 鲸鱼图层（v0.4.0）：与信号场同宿主的第二个图层，插在信号场之后 → 压在它之上。 */
  let whaleEl = null;
  let whaleField = null;
  let titleEl = null;
  let title = null;
  let titleParent = null;
  let titleHost = null;
  let titleSignature = "";
  /** 上一次推给标题引擎的速度倍率（v0.3.0）：用 0 作为「尚未推送」的哨兵值。 */
  let titleSpeed = 0;
  let engineState = "none";
  let surfaceEl = null;
  /** HUD 面板背后的补场：面板浮在内容区右侧，那里没有信号场，玻璃只能模糊到一片白。 */
  let hudBackdropEl = null;
  let hudField = null;
  let hudPanelWatched = null;
  let hudObserver = null;
  let hudNote = "-";
  /** 输入框下方信息行那一条的高度（px），写成 --mui-seat-band-h。 */
  let seatBandH = -1;
  let seatBandWatched = null;
  let seatBandObserver = null;
  let lastMarker = "";
  let lastSurfaceNote = "";
  /** 页面/挂载状态的历史（设置面板会隐藏内容区，只有历史能反映刚才那一页的真实判定）。 */
  const history = [];
  const captures = [];
  let captureKey = "";
  function record(entry) {
    history.push(`${String(Date.now() % 100000).padStart(5, "0")} ${entry}`);
    if (history.length > 40) history.shift();
  }
  let page = PAGE_NONE;
  let disposed = false;
  let scheduled = false;
  let storeOff = null;
  /** 这次排队是否含 urgent 触发（页面/主题/设置/resize/可见性）。 */
  let pendingUrgent = false;
  /** 上一次真正执行 sync() 的时间戳（performance.now 时间轴），供合并窗口判定。 */
  let lastSyncAt = 0;
  const observers = [];
  const listeners = [];

  /**
   * 请求一次同步。urgent=true 走「下一帧立刻同步」，否则走 ~120ms 合并窗口。
   *
   * v0.2.11：不再无条件每帧同步。流式输出时 childList 每帧都在变，
   * 而几何几乎不变，之前的做法等于每帧白做一轮布局读 + 一轮 CSS 变量写入。
   * 这里仍然**不引定时器**：窗口没到时继续排下一帧 rAF 再判，
   * 卸载时只要看 disposed 就能停，destroy() 的清理语义与旧版完全一致。
   */
  function schedule(urgent) {
    if (disposed) return;
    if (urgent) pendingUrgent = true;
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(tick);
  }

  function tick() {
    if (disposed) {
      scheduled = false;
      pendingUrgent = false;
      return;
    }
    const decision = resolveSyncCoalesce({
      urgent: pendingUrgent,
      now: performance.now(),
      lastSyncAt,
      window: SYNC_RELAXED_MS,
    });
    if (!decision.run) {
      requestAnimationFrame(tick);
      return;
    }
    scheduled = false;
    pendingUrgent = false;
    lastSyncAt = performance.now();
    sync();
  }

  function on(target, type, handler, config) {
    target.addEventListener(type, handler, config);
    listeners.push(() => target.removeEventListener(type, handler, config));
  }

  function observe(target, config, handler) {
    const observer = new MutationObserver(handler);
    observer.observe(target, config);
    observers.push(observer);
    return observer;
  }

  // ---- 写前判重（v0.2.11）------------------------------------------------
  //
  // 之前每次 sync() 都会无条件重写根 CSS 变量与 data-mui* 属性。
  // 值没变时这些写入仍会让浏览器做一次样式失效/属性变更记录，
  // 在流式输出那种「每秒几十次 sync」的场景里是纯浪费。

  /** 根 CSS 变量的上次写入值。 */
  const lastVar = new Map();

  /** 只在值真的变了才写 CSS 变量。 */
  function setVar(root, name, value) {
    if (lastVar.get(name) === value) return;
    lastVar.set(name, value);
    root.style.setProperty(name, value);
  }

  /** 只在布尔状态真的变了才写属性。 */
  function setFlag(node, name, on) {
    const next = !!on;
    if (node.hasAttribute(name) === next) return;
    node.toggleAttribute(name, next);
  }

  /** HUD 补场盒子的上次位置签名：几何没变就不重写 4 个 style。 */
  let hudBoxSignature = "";

  // ---- 锚点解析 ---------------------------------------------------------

  /** 会话内容区根节点（DSH 在它上面发布内容阶段），也是本插件唯一的页面判定依据。 */
  function conversationRoot() {
    return doc.querySelector("[data-conversation-content]");
  }

  /** 当前会话是否停在「新增会话」空态。 */
  function conversationPhase() {
    const root = conversationRoot();
    if (!root) return null;
    return root.getAttribute("data-content-phase");
  }

  /** 页面分类：只看会话内容面是否存在及其内容阶段。 */
  function resolvePage() {
    const root = conversationRoot();
    return resolvePageKind({
      hasConversation: !!root,
      phase: root ? root.getAttribute("data-content-phase") : null,
    });
  }

  /** hero 里字号最大的叶子文本块就是主标题。 */
  function findHeadline(root) {
    const nodes = root.querySelectorAll("h1, h2, h3, h4, p, div, span");
    let best = null;
    let bestSize = 0;
    for (const node of nodes) {
      if (node.closest("[data-mui-title]")) continue;
      if (node.children.length > 0) continue;
      const text = (node.textContent || "").trim();
      if (!text || text.length > 60) continue;
      const rect = node.getBoundingClientRect();
      if (rect.width < 40 || rect.height < 10) continue;
      const size = Number.parseFloat(getComputedStyle(node).fontSize) || 0;
      if (size > bestSize) {
        bestSize = size;
        best = node;
      }
    }
    return bestSize >= 15 ? best : null;
  }

  // ---- 背景图层 ---------------------------------------------------------

  /**
   * 背景要挂进「内容面」内部而不是框层之下：
   * 内容面自己可能画了不透明底色，只有把图层做成内容面的子节点（z-index:-1 +
   * 父级 isolation），才能既压在它自己的底色之上、又落在正文之下。
   * 这也是 `dsh-ascii-whales` 在生产环境里生效的结构。
   *
   * 宿主就是会话内容面本身；拿不到它说明当前页不在作用范围，此时不建图层。
   */
  function resolveSurface() {
    return conversationRoot();
  }

  function fieldWanted(state) {
    // v0.2.9：背景是否铺由「页面」开关决定；background.idle 只决定是否持续动画。
    if (!state.enabled) return false;
    if (page === PAGE_HERO) return state.pages.hero;
    if (page === PAGE_CHAT) return state.pages.chat;
    return false;
  }

  function syncField(state, dark) {
    const wanted = fieldWanted(state);
    const surface = resolveSurface();
    if (!surface) {
      // 理论上 page 不是 none 时必有会话面；真出现空档就按「离开作用范围」处理，避免引擎空转。
      clearStage();
      return;
    }
    if (surfaceEl && surfaceEl !== surface) surfaceEl.removeAttribute("data-mui-surface");
    surfaceEl = surface;
    surface.setAttribute("data-mui-surface", "");
    // 只量一次：之前为了拼一行日志调了两次 getBoundingClientRect()，等于多一次布局读。
    const surfaceBox = surface.getBoundingClientRect();
    const surfaceNote = `${surface.tagName.toLowerCase()}.${String(surface.className || "").split(/\s+/)[0]} ${Math.round(surfaceBox.width)}x${Math.round(surfaceBox.height)}`;
    if (surfaceNote !== lastSurfaceNote) {
      lastSurfaceNote = surfaceNote;
      record(`surface=${surfaceNote}`);
    }

    if (!layerEl) {
      layerEl = doc.createElement("div");
      layerEl.setAttribute("data-mui-field", "");
      layerEl.setAttribute("aria-hidden", "true");
      surface.insertBefore(layerEl, surface.firstChild);
    } else if (layerEl.parentElement !== surface) {
      surface.insertBefore(layerEl, surface.firstChild);
    }

    if (!wanted) {
      layerEl.removeAttribute("data-on");
      if (field) field.update({ idle: false, interact: false });
      doc.documentElement.removeAttribute("data-mui-active");
      return;
    }
    doc.documentElement.setAttribute("data-mui-active", "");

    if (!field) {
      field = createField(layerEl, {
        dark,
        intensity: state.background.intensity,
        idle: state.background.idle,
        interact: state.background.interact,
        fps: state.background.fps,
        speed: state.background.speed,
        reduceMotion: status.getSnapshot().reducedMotion,
        onFallback: (reason) => {
          engineState = `fallback:${reason}`;
          if (layerEl) layerEl.setAttribute("data-fallback", "");
          status.set({ fieldFallback: true, fieldFallbackReason: reason });
        },
      });
      engineState = field.fallback ? "fallback:no-context" : "webgl2";
      if (field.fallback) layerEl.setAttribute("data-fallback", "");
    } else {
      field.update({
        dark,
        intensity: state.background.intensity,
        idle: state.background.idle,
        interact: state.background.interact,
        fps: state.background.fps,
        speed: state.background.speed,
      });
    }
    layerEl.setAttribute("data-on", "");
  }

  // ---- 鲸鱼图层（v0.4.0）-------------------------------------------------

  /**
   * 把设置摊平成鲸鱼适配器要的形状。
   *
   * fps 与 interact 刻意取 background 那两项：这是本轮的产品决策——
   * 帧率上限与鼠标交互都复用既有的全局开关，不新增第二套概念。
   */
  function whaleOptions(state, dark) {
    const whale = state.whale && typeof state.whale === "object" ? state.whale : {};
    return {
      dark: !!dark,
      species: whale.species,
      count: whale.count,
      size: whale.size,
      speed: whale.speed,
      bodySwing: whale.bodySwing,
      turnAgility: whale.turnAgility,
      tailFrequency: whale.tailFrequency,
      gridScale: whale.gridScale,
      gridOpacity: whale.gridOpacity,
      fishCount: whale.fishCount,
      wake: whale.wake,
      opacity: whale.opacity,
      fps: state.background ? state.background.fps : 0,
      interact: state.background ? state.background.interact : false,
    };
  }

  /** 拆掉鲸鱼图层：引擎、画布、图层节点、指针监听一起没。 */
  function destroyWhale() {
    if (whaleField) {
      whaleField.destroy();
      whaleField = null;
    }
    if (whaleEl) {
      whaleEl.remove();
      whaleEl = null;
    }
  }

  /**
   * 同步鲸鱼图层。
   *
   * 判定收敛在 resolveWhaleTarget()（纯函数、可单测）；这里只做三件事：
   * 该有时把图层挂进内容面、该没时整层销毁、其余情况把设置推给适配器做增量更新。
   *
   * 为什么整层销毁而不是像信号场那样「留着但不画」：
   * 鲸鱼只在新增会话页出现，离开这一页就没有再复用的机会；
   * 而且它的引擎持有 ResizeObserver / IntersectionObserver / window 指针监听，
   * 留着不画比拆掉更费，也更容易在切页后留下幽灵监听。
   */
  function syncWhale(state, dark) {
    const wanted = resolveWhaleTarget({
      page,
      heroPage: state.pages ? state.pages.hero : false,
      master: state.enabled,
      whaleEnabled: state.whale ? state.whale.enabled : false,
    });
    const surface = wanted ? resolveSurface() : null;
    if (!wanted || !surface) {
      destroyWhale();
      return;
    }

    // 内容面被重建过（切页、重挂）时旧图层已脱离文档，必须整层重建：
    // 引擎绑的是旧 canvas 的尺寸观察器，搬过去也不会重新量。
    if (whaleEl && whaleEl.parentElement !== surface) {
      destroyWhale();
    }

    if (!whaleEl) {
      whaleEl = doc.createElement("div");
      whaleEl.setAttribute("data-mui-whale", "");
      whaleEl.setAttribute("aria-hidden", "true");
      // 追加到末尾：与信号场同为 z-index:-1，DOM 顺序决定谁在上，后插入者在上。
      surface.append(whaleEl);
    }

    const options = whaleOptions(state, dark);
    if (!whaleField) whaleField = createWhaleField(whaleEl, options);
    else whaleField.update(options);
  }

  // ---- 清理（离开作用范围 / 关闭总开关）----------------------------------

  /** 撤掉全部作用域标记与 CSS 变量，让 `<html>` 回到 DSH 原生外观。 */
  function clearRoot() {
    const root = doc.documentElement;
    for (const attr of [
      "data-mui",
      "data-mui-scope",
      "data-mui-active",
      "data-mui-dark",
      "data-mui-glass-hero",
      "data-mui-glass-chat",
      "data-mui-title-static",
      "data-mui-hud-glass",
    ]) {
      root.removeAttribute(attr);
    }
    root.style.removeProperty("--mui-blur");
    root.style.removeProperty("--mui-field-bg");
    root.style.removeProperty("--mui-field-wave");
    root.style.removeProperty("--mui-seat-band-h");
    // 清空写前判重缓存：下次进入作用范围时必须重新写一遍，不能被缓存挡住。
    lastVar.clear();
  }

  /** 拆掉信号场现场：销毁引擎、移除图层节点、清掉宿主标记与根属性。 */
  function clearStage() {
    if (field) {
      field.destroy();
      field = null;
    }
    // v0.4.0：鲸鱼图层与信号场同宿主，离开作用范围时一起拆。
    destroyWhale();
    destroyHudBackdrop();
    if (layerEl) {
      layerEl.remove();
      layerEl = null;
    }
    if (surfaceEl) {
      surfaceEl.removeAttribute("data-mui-surface");
      surfaceEl = null;
    }
    if (seatBandObserver) {
      seatBandObserver.disconnect();
      seatBandObserver = null;
    }
    seatBandWatched = null;
    seatBandH = -1;
    engineState = "none";
    lastSurfaceNote = "";
    clearRoot();
  }

  // ---- 输入框下方信息行的高度 --------------------------------------------

  /**
   * 实测「输入框卡片底边 → 座位底边」这一段，写进 --mui-seat-band-h。
   *
   * 这一段就是聊天页输入框下方那行小字（「19 轮 864 步 · 162 tok/s …」）所在的条带，
   * 也是唯一需要被座位背衬盖住的地方：消息滚上来要挡住、小字要看得清。
   * 座位其余部分保持透明，动效背景才能一直透到输入框区域。
   *
   * 为什么实测而不是写死：卡片高度随附件、多行输入、展开的提问卡片变化，
   * 写死的像素要么盖不住小字、要么把卡片下沿也糊掉。
   */
  function measureSeatBand() {
    const seat = doc.querySelector("[data-composer-seat]");
    const card = doc.querySelector("[data-composer-card]");
    let height = 0;
    try {
      if (seat && card) {
        height = seat.getBoundingClientRect().bottom - card.getBoundingClientRect().bottom;
      } else if (seat) {
        height = seat.getBoundingClientRect().height;
      }
    } catch {
      height = 0;
    }
    // 兜底：量不到（没有卡片、布局未就绪）时给一个保守值，宁可靠下沿也别糊到卡片。
    if (!(height > 0)) height = 34;
    const value = Math.round(Math.max(12, Math.min(120, height)));
    if (value !== seatBandH) {
      seatBandH = value;
      doc.documentElement.style.setProperty("--mui-seat-band-h", `${value}px`);
      record(`seat-band=${value}px`);
    }
  }

  /** 座位与卡片都会被 React 重建，每次同步都对一次观察目标（幂等）。 */
  function watchSeatBand() {
    const seat = doc.querySelector("[data-composer-seat]");
    if (seat && seat !== seatBandWatched) {
      if (seatBandObserver) seatBandObserver.disconnect();
      seatBandWatched = seat;
      seatBandObserver = new ResizeObserver(() => {
        measureSeatBand();
        // 座位高度变化会改变内容区可用高度，顺带对齐一次场
        if (field) field.update({});
      });
      seatBandObserver.observe(seat);
    }
    measureSeatBand();
  }

  // ---- HUD 面板背后的补场 ------------------------------------------------

  /**
   * HUD 面板是 `position:fixed; right:8px` 的悬浮层，浮在内容区右侧。
   * 内容区的信号场只铺到 `[data-conversation-content]` 的盒子里，面板那一带往往没有场，
   * 于是它的毛玻璃只能模糊到一片白，看起来就是「没有半透明」。
   *
   * 做法：把面板所在的那条竖直区域也用同一套场铺上，玻璃的 backdrop 于是有真实噪声可模糊。
   * 面板关掉（`.hud-panel` 不在 DOM 里）时图层自动清掉，不影响任何其它页面。
   */
  function panelRectOf(panel) {
    try {
      const rect = panel.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) return null;
      return rect;
    } catch {
      return null;
    }
  }

  /**
   * 把补场插进面板所在的同一层、紧挨着排在面板之前。
   *
   * v0.2.4 把它挂在 `body` 上、`z-index:-1`，结果被外壳自己的不透明底色整个盖住：
   * 补场根本没显示，面板玻璃模糊到的是一片白，面板下方露出的也是外壳白底。
   * 面板挂在 DSH 的 `shell.overlay`（本身是 z-index:20 的层叠上下文）里，
   * 插进这一层并排在面板之前，就能压在页面内容之上、面板之下，不需要任何负 z-index。
   * 面板被 React 重建时父层可能变化，所以每次同步都对齐一次（幂等）。
   */
  function anchorHudBackdrop(panel) {
    if (!hudBackdropEl || !panel) return;
    const parent = panel.parentElement;
    if (!parent || parent === doc.body || parent === doc.documentElement) {
      // 兜底：面板直接挂在 body 上时只能回到最底层（外加以 -1 压到外壳底色之下）。
      if (hudBackdropEl.parentElement !== doc.body) doc.body.append(hudBackdropEl);
      hudBackdropEl.style.zIndex = "-1";
      return;
    }
    hudBackdropEl.style.zIndex = "0";
    if (hudBackdropEl.parentElement !== parent || hudBackdropEl.nextElementSibling !== panel) {
      parent.insertBefore(hudBackdropEl, panel);
    }
  }

  /**
   * 把补场图层的盒子对齐到「右侧那条带子」而不是面板本身。
   *
   * v0.2.5 按「面板矩形外扩 24px」铺，实机上露出两个问题：
   *   1. 顶边成了一条直线——补场比会话内容区高出十几像素，右栏就浮出一块带硬边的「补丁」；
   *   2. 面板左侧那圈外扩区落在内容区之上，两层场叠在一起，亮格 233 → 243、暗格 233 → 218，
   *      肉眼就是一条发脏的竖带。
   * 所以：左缘不得进入内容区（内容区自己那层场已经在那儿），上缘对齐内容区上沿，
   * 右缘/下缘一直铺到视口边——这样它和内容区的场并成同一条带子，只是相位不同。
   */
  function placeHudBackdrop(panel) {
    if (!hudBackdropEl) return;
    const rect = panelRectOf(panel);
    if (!rect) {
      setFlag(hudBackdropEl, "data-on", false);
      hudBoxSignature = "";
      if (hudField) hudField.update({ idle: false, interact: false });
      return;
    }
    const viewportWidth = doc.documentElement.clientWidth;
    const viewportHeight = doc.documentElement.clientHeight;
    const pad = 24;

    // 会话内容区：场的宿主，同时给出补场要贴合的那条带子的上下边界。
    let box = null;
    try {
      const content = conversationRoot();
      if (content) box = content.getBoundingClientRect();
    } catch {
      box = null;
    }

    // 左缘：直接贴住内容区右缘——内容区右侧若还有空缝就补上，内容区若已伸到面板下面
    // 就停在它边上，绝不压进内容区（压进去会盖住滚动条，还会把两层场叠成脏带）。
    const padLeft = rect.left - pad;
    const left = clamp(box ? box.right : padLeft, 0, viewportWidth - 2);

    // 上缘：与内容区上沿对齐，避免在顶栏那片白里浮出一块矩形；内容区缺失时退回面板外扩。
    // 内容区上沿比面板顶还低时（少见）就停在面板顶上，至少不会露出面板上方的白缝。
    const top = clamp(box ? Math.min(box.top, rect.top) : rect.top - pad, 0, viewportHeight - 2);

    const width = Math.max(0, viewportWidth - left);
    const height = Math.max(0, viewportHeight - top);

    // 面板完全落在内容区里（这一竖条已被内容区自己的场盖住）：不需要补场。
    if (width < 2 || height < 2) {
      setFlag(hudBackdropEl, "data-on", false);
      hudBoxSignature = "";
      if (hudField) hudField.update({ idle: false, interact: false });
      return;
    }

    // 几何没变就不重写这 4 个 style：ResizeObserver 与同步都会频繁调到这里，
    // 而面板尺寸在绝大多数同步里是同一个值。
    const boxSignature = `${Math.round(left)}|${Math.round(top)}|${Math.round(width)}|${Math.round(height)}`;
    if (boxSignature !== hudBoxSignature) {
      hudBoxSignature = boxSignature;
      hudBackdropEl.style.left = `${Math.round(left)}px`;
      hudBackdropEl.style.top = `${Math.round(top)}px`;
      hudBackdropEl.style.width = `${Math.round(width)}px`;
      hudBackdropEl.style.height = `${Math.round(height)}px`;
    }
    setFlag(hudBackdropEl, "data-on", true);
  }

  /** HUD 面板补场：面板在、且开着 HUD 玻璃时才有意义。 */
  function syncHudBackdrop(state, dark) {
    const panel = doc.querySelector(".hud-panel");
    const wanted =
      state.enabled &&
      page !== PAGE_NONE &&
      state.pages.chat &&
      !!panel;
    if (!wanted) {
      destroyHudBackdrop();
      return;
    }
    if (!hudBackdropEl) {
      hudBackdropEl = doc.createElement("div");
      hudBackdropEl.setAttribute("data-mui-field", "");
      hudBackdropEl.setAttribute("data-mui-field-hud", "");
      hudBackdropEl.setAttribute("aria-hidden", "true");
      hudBackdropEl.style.position = "fixed";
      hudBackdropEl.style.pointerEvents = "none";
      hudBackdropEl.style.overflow = "hidden";
    }
    // 先就位再建引擎：引擎按容器尺寸初始化，插进面板同层后才量得到正确的视口尺寸。
    anchorHudBackdrop(panel);
    if (!hudField) {
      hudField = createField(hudBackdropEl, {
        dark,
        intensity: state.background.intensity,
        idle: state.background.idle,
        // v0.3.1：与内容区共用「背景鼠标交互」开关。原来这里写死 false，
        // 导致面板背后那块背景完全没有鼠标交互动效。
        interact: state.background.interact,
        fps: state.background.fps,
        // HUD 补场与内容区共用同一个背景速度：两者是同一片背景的两段，不同速会在接缝处露馅。
        speed: state.background.speed,
        // v0.3.1：补场不播入场揭示。它是内容区那片背景的延续段，而且每次进聊天页都会被重建，
        // 保留揭示就等于每次进页都重播 1.8s 的展开动画——也就是「过几秒才出现」的直接原因。
        intro: false,
        reduceMotion: status.getSnapshot().reducedMotion,
        onFallback: (reason) => {
          hudNote = `fallback:${reason}`;
          if (hudBackdropEl) hudBackdropEl.setAttribute("data-fallback", "");
        },
      });
      hudNote = hudField.fallback ? "fallback:no-context" : "webgl2";
    } else {
      hudField.update({
        dark,
        intensity: state.background.intensity,
        idle: state.background.idle,
        interact: state.background.interact,
        fps: state.background.fps,
        speed: state.background.speed,
      });
    }
    placeHudBackdrop(panel);
    watchHudPanel(panel);
  }

  /** 面板会随窗口缩放/内容变化改高度，观察它自己的尺寸。 */
  function watchHudPanel(panel) {
    if (!panel || panel === hudPanelWatched) return;
    if (hudObserver) hudObserver.disconnect();
    hudPanelWatched = panel;
    hudObserver = new ResizeObserver(() => placeHudBackdrop(panel));
    hudObserver.observe(panel);
  }

  function destroyHudBackdrop() {
    if (hudField) {
      hudField.destroy();
      hudField = null;
    }
    if (hudBackdropEl) {
      hudBackdropEl.remove();
      hudBackdropEl = null;
    }
    if (hudObserver) {
      hudObserver.disconnect();
      hudObserver = null;
    }
    hudPanelWatched = null;
    hudNote = "-";
    hudBoxSignature = "";
  }

  // ---- 标题 -------------------------------------------------------------

  function titleWanted(state) {
    // 标题只存在于新增会话页，因此它跟随「新建会话页面」开关。
    return state.enabled && page === PAGE_HERO && state.pages.hero;
  }

  function removeTitle() {
    if (title) {
      title.destroy();
      title = null;
    }
    if (titleEl) {
      titleEl.remove();
      titleEl = null;
    }
    titleParent = null;
    titleHost = null;
    titleSignature = "";
    // 归零哨兵：重新挂载后必须再推一次速度，否则会沿用上一轮的旧倍率。
    titleSpeed = 0;
  }

  /**
   * 定位 hero 的「标题行」与「文案组」。
   *
   * 实测结构（`@deepseek-ai/dsh-client-ui-conversation` 的 HeroShell）：
   *   root > stack（纵向 flex）> headline（横向 flex，justify-content:center）
   *        > [鲸鱼 span, titleGroup（文案 + 预览版徽标）]
   *
   * 所以：从字号最大的叶子文本上溯，**父级为纵向 flex 容器**的那一层就是 headline 行；
   * 该行里包含这个叶子的直接子元素就是文案组。把标题插到行内、文案组之前，
   * 居中就由 DSH 自己的 justify-content 保证，不必我们干预。
   * @returns {{ row: HTMLElement, group: HTMLElement } | null}
   */
  function locateHeadlineSlot(hero) {
    const leaf = findHeadline(hero);
    if (!leaf) return null;
    let row = leaf;
    let found = false;
    for (let guard = 0; guard < 10; guard += 1) {
      const parent = row.parentElement;
      if (!parent || parent === hero) break;
      let direction = "";
      try {
        direction = String(getComputedStyle(parent).flexDirection || "");
      } catch {
        direction = "";
      }
      if (direction === "column" || direction === "column-reverse") {
        found = true;
        break;
      }
      row = parent;
    }
    if (!found) return null;
    let group = leaf;
    for (let depth = 0; depth < 10 && group && group.parentElement !== row; depth += 1) {
      group = group.parentElement;
    }
    if (!group || group.parentElement !== row) return null;
    return { row, group };
  }

  /** 按目标字号反推内联盒子尺寸（字形 42px 是固定的，盒子随字体度量变化）。 */
  function applyTitleBox() {
    if (!titleEl) return null;
    let family = "";
    try {
      family = titleHost ? getComputedStyle(titleHost).fontFamily : "";
    } catch {
      family = "";
    }
    const box = measureTitle(TITLE_TEXT, {
      fontSize: TITLE_TARGET_SIZE,
      fontWeight: 600,
      letterSpacing: -0.005,
      fontFamily: family,
    });
    titleEl.style.width = `${box.width}px`;
    titleEl.style.height = `${box.height}px`;
    return box;
  }

  function mountTitle(state) {
    const hero = doc.querySelector('[data-content-phase="hero"]');
    if (!hero) {
      removeTitle();
      status.set({ titleAvailable: false });
      return;
    }
    if (titleEl && titleEl.isConnected && titleParent && titleParent.isConnected) {
      // 已挂好：只同步开关与配色。
      syncTitle(state);
      return;
    }
    const slot = locateHeadlineSlot(hero);
    if (!slot) {
      removeTitle();
      status.set({ titleAvailable: false });
      return;
    }

    removeTitle();
    titleEl = doc.createElement("div");
    titleEl.setAttribute("data-mui-title", "");
    titleEl.setAttribute("role", "img");
    titleEl.setAttribute("aria-label", TITLE_TEXT);
    // 插在「文案组」之前 → 顺序变成 图标 / 标题 / 文案 / 徽标，整行由 DSH 居中。
    slot.row.insertBefore(titleEl, slot.group);
    titleParent = slot.row;
    titleHost = slot.row;
    applyTitleBox();

    const dark = doc.body.hasAttribute("data-ds-dark-theme");
    title = createTechText(titleEl, TITLE_TEXT, {
      fontWeight: 600,
      fontSize: TITLE_TARGET_SIZE,
      letterSpacing: -0.005,
      color: readToken(doc, "--dsw-alias-label-primary", dark ? "#f2f4fa" : "#0b0f1a"),
      accentColor: readToken(doc, "--dsw-alias-brand-primary", "#2b3af0"),
      reach: 150,
      softness: 0.65,
      dashLength: 3,
      dashGap: 3,
      strokeWidth: 1.2,
      lineStyle: "dashed",
      reveal: "letter",
      specks: 14,
      // speed 是引擎内在基准（0.9），speedFactor 才是用户可调的倍率（v0.3.0）。
      speed: 0.9,
      speedFactor: state.title.speed,
      selection: state.title.interact,
      labels: state.title.interact,
      draggable: state.title.interact,
      sweep: state.title.idle,
      reduceMotion: status.getSnapshot().reducedMotion,
    });
    status.set({ titleAvailable: true });
    syncTitle(state);

    // 字体就绪后重新量一次盒子：首帧常用回退字体，量出来的宽度会偏。
    if (doc.fonts && doc.fonts.ready) {
      doc.fonts.ready.then(
        () => {
          if (disposed || !titleEl || !title) return;
          applyTitleBox();
          title.refresh({});
        },
        () => {},
      );
    }
  }

  function syncTitle(state) {
    // 页面上任何 DOM 变化都会触发 sync()，而标题引擎的 refresh 需要重新烘焙字形贴图，
    // 所以这里用签名短路：只有开关或主题真的变了才重建。
    const dark = doc.body.hasAttribute("data-ds-dark-theme");
    doc.documentElement.toggleAttribute("data-mui-title-static", !state.title.interact);
    if (!title) return;
    // v0.3.0：速度走独立的轻量入口，**不进签名**。
    // 一旦进签名，拖滑块每一格都会触发 refresh → 重烘字形贴图 → 标题闪烁。
    if (state.title.speed !== titleSpeed) {
      titleSpeed = state.title.speed;
      title.setSpeed(state.title.speed);
    }
    const signature = `${state.title.idle}|${state.title.interact}|${dark}`;
    if (signature === titleSignature) return;
    titleSignature = signature;
    title.refresh({
      color: readToken(doc, "--dsw-alias-label-primary", dark ? "#f2f4fa" : "#0b0f1a"),
      accentColor: readToken(doc, "--dsw-alias-brand-primary", "#2b3af0"),
      sweep: state.title.idle,
      interact: state.title.interact,
    });
  }

  // ---- 毛玻璃与根属性 ---------------------------------------------------

  function syncRoot(state, dark) {
    // 总开关关闭：不保留任何作用域标记，CSS 全部不匹配即等于原生外观。
    if (!state.enabled) {
      clearRoot();
      return;
    }
    const root = doc.documentElement;
    setFlag(root, "data-mui", true);
    // 作用范围标记：只要当前页在范围内就存在，与「信号场是否开启」解耦，
    // 这样 HUD 玻璃、右栏背景这类跨区域能力在背景关掉时仍然可单独生效。
    setFlag(root, "data-mui-scope", page !== PAGE_NONE);
    setFlag(root, "data-mui-dark", dark);
    // 输入框毛玻璃：v0.2.9 起是一个全局开关，再由当前页面开关决定是否生效。
    const glassOn = state.glass.enabled;
    setFlag(root, "data-mui-glass-hero", glassOn && page === PAGE_HERO && state.pages.hero);
    setFlag(root, "data-mui-glass-chat", glassOn && page === PAGE_CHAT && state.pages.chat);
    // HUD 面板没有独立开关：跟随「聊天会话页面」（见 resolvePanelTargets 注释）。
    const targets = resolvePanelTargets({ page, chatPage: state.pages.chat });
    setFlag(root, "data-mui-hud-glass", targets.hud);
    // 模糊半径已固定 14px（v0.2.9 移除滑块），这里仍写变量以保持 CSS 单一来源。
    setVar(root, "--mui-blur", `${state.glass.blur}px`);
    // 降级底色也放在根上：WebGL2 不可用时 CSS 径向渐变要用到这两个变量。
    setVar(root, "--mui-field-bg", dark ? "#070a12" : "#e7e9f0");
    setVar(root, "--mui-field-wave", dark ? "#3a4a7a" : "#b6bfd8");
  }

  // ---- 自检 -------------------------------------------------------------

  /**
   * 拼一段纯文本自检信息给设置页。
   * 这个环境拿不到 devtools，所以把定位问题需要的锚点、尺寸、计算样式一次性列出来。
   */
  function diagnose() {
    const root = doc.documentElement;
    const layer = layerEl && layerEl.isConnected ? layerEl : null;
    const canvas = layer ? layer.querySelector("canvas") : null;
    const conversation = doc.querySelector("[data-conversation-content]");
    const card = doc.querySelector("[data-composer-card]");
    const composerBar = doc.querySelector('[data-slot="conversation.composer.bar"]');

    const size = (node) => {
      if (!node) return "-";
      const rect = node.getBoundingClientRect();
      return `${Math.round(rect.width)}x${Math.round(rect.height)}`;
    };
    const short = (node) => {
      if (!node) return "null";
      const cls = String(node.className || "")
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .join(".");
      return `<${node.tagName.toLowerCase()}${cls ? "." + cls : ""}>`;
    };
    const css = (node, property) => {
      if (!node) return "-";
      try {
        return String(getComputedStyle(node)[property]);
      } catch {
        return "err";
      }
    };
    const before = (node, property) => {
      if (!node) return "-";
      try {
        return String(getComputedStyle(node, "::before")[property]);
      } catch {
        return "err";
      }
    };

    let webgl2 = "no";
    try {
      const probe = doc.createElement("canvas");
      webgl2 = probe.getContext("webgl2") ? "yes" : "no";
    } catch {
      webgl2 = "throw";
    }

    const lines = [
      `page=${page}  phase=${String(conversationPhase())}  dark=${doc.body.hasAttribute("data-ds-dark-theme") ? "yes" : "no"}`,
      `scope: ${page === PAGE_NONE ? "none（当前页不在作用范围）" : page}`,
      `root: data-mui=${root.hasAttribute("data-mui")} active=${root.hasAttribute("data-mui-active")} glassHero=${root.hasAttribute("data-mui-glass-hero")} glassChat=${root.hasAttribute("data-mui-glass-chat")}`,
      `surface: ${short(surfaceEl)} ${size(surfaceEl)} bg=${css(surfaceEl, "backgroundColor")} pos=${css(surfaceEl, "position")} iso=${css(surfaceEl, "isolation")}`,
      `layer: ${short(layer)} ${size(layer)} on=${layer ? layer.hasAttribute("data-on") : "-"} opacity=${css(layer, "opacity")} z=${css(layer, "zIndex")} pos=${css(layer, "position")}`,
      `canvas: ${canvas ? canvas.width + "x" + canvas.height : "-"} cssOpacity=${css(canvas, "opacity")}`,
      `engine: ${engineState}  webgl2=${webgl2}`,
      `conversationContent: ${short(conversation)} ${size(conversation)} bg=${css(conversation, "backgroundColor")}`,
      `composerCard: count=${doc.querySelectorAll("[data-composer-card]").length} ${short(card)} ${size(card)} bg=${css(card, "backgroundColor")} iso=${css(card, "isolation")} beforeBackdrop=${before(card, "backdropFilter")} beforeBg=${before(card, "backgroundColor")}`,
      `composerBarSlot: ${short(composerBar)} ${size(composerBar)} children=${composerBar ? composerBar.children.length : "-"}`,
      `mainSlot: ${short(doc.querySelector('[data-slot="main"]'))}  settingsHeader: ${doc.querySelector('[data-slot="settings.header"]') ? "open" : "closed"}`,
      `settingsHeaderText: ${String((doc.querySelector('[data-slot="settings.header"]') || {}).textContent || "-").trim().slice(0, 40)}  docTitle: ${String(doc.title || "-").slice(0, 40)}`,
      `settingsContent: ${short((doc.querySelector('[data-slot="settings.header"]') || {}).parentElement)} ${size((doc.querySelector('[data-slot="settings.header"]') || {}).parentElement)}`,
      `body: bg=${css(doc.body, "backgroundColor")}`,
    ];
    const header = doc.querySelector('[data-slot="settings.header"]');
    if (header) {
      const chain = [];
      let node = header;
      for (let depth = 0; depth < 5 && node; depth += 1) {
        const rect = node.getBoundingClientRect();
        chain.push(
          `${depth}:${short(node)} ${Math.round(rect.width)}x${Math.round(rect.height)} kids=${node.children.length} txt=${String(node.textContent || "").trim().slice(0, 18)}`,
        );
        node = node.parentElement;
      }
      lines.push("--- settings ancestors ---");
      for (const entry of chain) lines.push(entry);
    }
    const activeNav =
      doc.querySelector('[aria-current="page"]') ||
      doc.querySelector('[aria-selected="true"]') ||
      doc.querySelector('[data-slot="sidebar"] [data-selected="true"]');
    lines.push(
      `activeNav: ${short(activeNav)} txt=${String((activeNav || {}).textContent || "-").trim().slice(0, 24)}`,
    );

    // --- 跨区域能力（HUD 面板 / 右侧边栏）现状 ---
    const hudPanel = doc.querySelector(".hud-panel");
    lines.push("--- panels ---");
    lines.push(
      `hudPanel: count=${doc.querySelectorAll(".hud-panel").length} ${short(hudPanel)} ${size(hudPanel)} bg=${css(hudPanel, "backgroundColor")} backdrop=${css(hudPanel, "backdropFilter")}`,
    );
    // 玻璃层挂在 ::before 上，只看宿主元素的 backdrop 是查不出来的，这里把伪元素一并回读：
    // content 为空说明规则没命中（多半是 data-mui-hud-glass 缺失），有 content 但面板仍不透明，
    // 那就是别的元素在面板内部又铺了一层不透明底。
    lines.push(
      `hudPanelBefore: content=${before(hudPanel, "content")} backdrop=${before(hudPanel, "backdropFilter")} bgImage=${String(before(hudPanel, "backgroundImage")).slice(0, 28)}`,
    );
    lines.push(
      `panelFlags: hudGlass=${root.hasAttribute("data-mui-hud-glass")} scope=${root.hasAttribute("data-mui-scope")}`,
    );
    // HUD 补场：面板背后没有场时玻璃只能模糊到白，所以这里直接回读补场图层是否就位。
    // parent 也要回读：它必须和面板同层（面板之前），挂在 body 上用负 z-index 会被外壳底色盖掉。
    lines.push(
      `hudBackdrop: ${short(hudBackdropEl)} ${size(hudBackdropEl)} on=${hudBackdropEl && hudBackdropEl.hasAttribute("data-on") ? "yes" : "no"} z=${hudBackdropEl ? css(hudBackdropEl, "zIndex") : "-"} parent=${short(hudBackdropEl && hudBackdropEl.parentElement)} sameAsPanel=${hudBackdropEl && hudPanel && hudBackdropEl.parentElement === hudPanel.parentElement ? "yes" : "no"} engine=${hudNote}`,
    );
    // 座位背衬：只该盖住「输入框下方信息行」那一条，回读实测高度与伪元素是否命中。
    const seatEl = doc.querySelector("[data-composer-seat]");
    const cardEl = doc.querySelector("[data-composer-card]");
    lines.push(
      `seatVeil: band=${seatBandH}px seat=${size(seatEl)} card=${size(cardEl)} iso=${css(seatEl, "isolation")} phase=${conversation ? String(conversation.getAttribute("data-content-phase") || "-") : "-"} beforeContent=${before(seatEl, "content")} beforeH=${before(seatEl, "height")} beforeBackdrop=${String(before(seatEl, "backdropFilter")).slice(0, 22)}`,
    );

    if (captures.length > 0) {
      lines.push("--- page captures ---");
      for (const block of captures) lines.push(block);
    }

    // --- v0.2.11 运行统计（本插件目前唯一的量化验收回路）---
    // 没有浏览器控制能力时，只能靠这段数字判断限帧与失焦降频是否真的生效。
    lines.push("--- performance ---");
    const statLine = (label, stats) => {
      if (!stats) return `${label}: -`;
      const effective = stats.effectiveFps === 0 ? "uncapped(boost)" : `${stats.effectiveFps}fps`;
      return `${label}: fps=${stats.fps} avgRenderMs=${stats.avgRenderMs} renders=${stats.renders} skips=${stats.skips} effective=${effective} cap=${stats.cap} blurred=${stats.blurred ? "yes" : "no"}`;
    };
    lines.push(statLine("field", field ? field.stats : null));
    lines.push(statLine("hudField", hudField ? hudField.stats : null));
    // v0.3.0：把两个实际生效的速度倍率也打出来，便于确认滑块值真的到达了引擎
    // （设置层与引擎层之间有任何一处漏传，这里会立刻暴露成 1×）。
    const speeds = store.getSnapshot();
    lines.push(
      `speeds: title=${speeds.title.speed}x background=${speeds.background.speed}x hud=follow`,
    );

    if (history.length > 0) {
      lines.push("--- history (newest last) ---");
      for (const entry of history.slice(-14)) lines.push(entry);
    }
    return lines.join("\n");
  }

  // ---- 主同步 -----------------------------------------------------------

  function sync() {
    if (disposed) return;
    const state = store.getSnapshot();
    const dark = doc.body.hasAttribute("data-ds-dark-theme");
    page = resolvePage();

    // 不在作用范围：不留任何痕迹，也不建图层、不写根属性。
    if (page === PAGE_NONE) {
      removeTitle();
      clearStage();
      status.set({ titleAvailable: null });
      // 清掉抓取键，便于再次进入会话页时重新记录一份结构快照。
      captureKey = "";
      if (lastMarker !== PAGE_NONE) {
        lastMarker = PAGE_NONE;
        record(`page=${PAGE_NONE} 已清理（当前页不在作用范围）`);
      }
      return;
    }

    const settingsOpen = !!doc.querySelector('[data-slot="settings.header"]');
    const conv = conversationRoot();
    const convSize = conv
      ? `${Math.round(conv.getBoundingClientRect().width)}x${Math.round(conv.getBoundingClientRect().height)}`
      : "none";
    if (page !== captureKey) {
      captureKey = page;
      captures.push(`[${page}] conv=${conv ? "yes" : "no"} settings=${settingsOpen ? "open" : "closed"}`);
      if (captures.length > 3) captures.shift();
    }

    const marker = `${page}|${fieldWanted(state) ? 1 : 0}|${settingsOpen}|${convSize}`;
    if (marker !== lastMarker) {
      lastMarker = marker;
      record(
        `page=${page} wanted=${fieldWanted(state) ? 1 : 0} settings=${settingsOpen ? "open" : "closed"} conv=${convSize}`,
      );
    }

    // 座位信息行的高度决定背衬条带，必须在场对齐之前量好（主题/布局都可能改变它）。
    watchSeatBand();

    syncRoot(state, dark);
    syncField(state, dark);
    // 必须排在 syncField 之后：鲸鱼图层靠「后插入」取得高于信号场的层叠位置。
    syncWhale(state, dark);
    syncHudBackdrop(state, dark);

    if (titleWanted(state)) mountTitle(state);
    else {
      removeTitle();
      if (page !== PAGE_HERO) status.set({ titleAvailable: null });
    }
  }

  // ---- 安装与卸载 -------------------------------------------------------

  function install() {
    if (disposed) return () => {};

    const reduced = (() => {
      try {
        return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
      } catch {
        return false;
      }
    })();
    status.set({ reducedMotion: reduced });

    // 设置变化
    storeOff = store.subscribe(() => schedule(true));

    // 主题切换（body 上的 attrs）：主题一变毛玻璃与配色就要跟着变，走立刻同步。
    observe(doc.body, { attributes: true, attributeFilter: ["data-ds-dark-theme", "style", "class"] }, () =>
      schedule(true),
    );

    // 根节点：数据阶段属性 / 会话区增删（页面切换的唯一信号）。
    //
    // 这一条不能无脑走 relaxed：页面切换本身也是通过 childList 表现出来的
    // （会话内容面被增删、hero/chat 阶段变化）。若按 120ms 合并，切页时图层会晚一拍才出现，
    // 肉眼是能看出来的。所以先做一次极便宜的判定（单个 querySelector，
    // 远小于 sync() 里 5~8 次布局读）：页面真的变了走 urgent，只是流式输出在加节点就走 relaxed。
    observe(doc.body, { childList: true, subtree: true }, () => {
      schedule(resolvePage() !== page);
    });

    on(window, "resize", () => schedule(true));
    on(document, "visibilitychange", () => schedule(true));

    sync();
    // 首屏 React 可能还没挂完：多补几帧，直到会话内容面出现（出现即说明进入了作用范围）。
    let attempts = 0;
    const warm = () => {
      if (disposed) return;
      attempts += 1;
      sync();
      if (page === PAGE_NONE && attempts < 30) requestAnimationFrame(warm);
    };
    requestAnimationFrame(warm);

    return () => {
      disposed = true;
      if (storeOff) storeOff();
      for (const observer of observers) observer.disconnect();
      for (const off of listeners) off();
      observers.length = 0;
      listeners.length = 0;
      removeTitle();
      clearStage();
    };
  }

  return { install, diagnose };
}
