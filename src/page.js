/**
 * dsh-signal-field · 页面分类（纯函数）
 *
 * 本插件只作用于「新增会话页」与「聊天会话页」。判定唯一依据是 DSH 发布的会话内容面
 * `[data-conversation-content]` 是否存在，以及它上面的 `data-content-phase`：
 *
 *   无会话内容面                 → none（插件管理页、自动化任务页、其它面板页）
 *   phase === "hero"             → hero（新增会话页）
 *   其余（active / 缺失 / 未知）  → chat（聊天会话页）
 *
 * 为什么从「ctx.layout.panelInfo.activePanelId + 会话面」的双来源收敛到单一 DOM 来源：
 *   1. 实测 `[data-conversation-content]` 只在会话页存在，天然把两个面板页排除在外；
 *   2. 不再需要「不是 plugins 就当 schedules」这类按拼写猜测的逻辑；
 *   3. 不再硬依赖 layout 服务，插件加载条件更宽（少一个可能改名的服务）。
 * 代价是 `[data-conversation-content]` 成为单点契约，故自检文本会打印它的解析结果。
 *
 * 本文件不含任何 DOM API，便于 `node --test` 直接导入断言。
 */

/** 当前页不在作用范围。 */
export const PAGE_NONE = "none";

/** 新增会话页（会话空态）。 */
export const PAGE_HERO = "hero";

/** 聊天会话页。 */
export const PAGE_CHAT = "chat";

/**
 * 把「会话面是否存在 + 内容阶段」映射为页面分类。
 * @param {{ hasConversation?: unknown, phase?: unknown }} input
 * @returns {"none" | "hero" | "chat"}
 */
export function resolvePageKind(input) {
  const src = input && typeof input === "object" ? input : {};
  if (!src.hasConversation) return PAGE_NONE;
  if (src.phase === PAGE_HERO) return PAGE_HERO;
  return PAGE_CHAT;
}

/**
 * 决定「HUD 面板补场与毛玻璃」这个跨区域能力是否生效。
 *
 * 规则（v0.5.0）：HUD 面板没有独立开关，它跟随**当前所在页**的两道开关——
 *   1. 当前页的「UI动效总开关」（pageEnabled）；
 *   2. 当前页的「背景」开关（backgroundEnabled）。
 * 也就是说：在新建会话页看的是新建页的那两个开关，在聊天会话页看的是聊天页的那两个开关。
 * 第二道是刻意的：面板玻璃的意义是「模糊它背后那片信号场」，该页背景关掉后
 * 没有可模糊的内容，补场与面板玻璃就应该一起回到原生外观。
 * 它**不**受当前页「输入框毛玻璃效果」开关控制（那个开关只管输入框卡片）。
 *
 * @param {{ page?: string, pageEnabled?: unknown, backgroundEnabled?: unknown }} input
 * @returns {{ hud: boolean }}
 */
export function resolvePanelTargets(input) {
  const src = input && typeof input === "object" ? input : {};
  const inScope = src.page === PAGE_HERO || src.page === PAGE_CHAT;
  if (!inScope) return { hud: false };
  return { hud: !!src.pageEnabled && !!src.backgroundEnabled };
}

/**
 * 决定「鲸鱼动画」这一图层是否应该存在（v0.4.0，v0.5.0 改为按页模型，v0.5.1 两页都可开）。
 *
 * 三道闸门都要开，缺一不可：
 *   1. 总开关（启用全部动效）；
 *   2. **当前所在页**的「UI动效总开关」——它代表「这一页要不要动效」，鲸鱼只是其中一层；
 *   3. **当前所在页**的鲸鱼开关。
 * 最后才是页面判定：只有 hero 与 chat 两个会话页有鲸鱼，其它面板页一律没有。
 *
 * 为什么闸门看「当前页」而不是固定某一页：v0.5.1 起两页各有一份鲸鱼分组
 * （`pages.hero.whale` / `pages.chat.whale`），参数与开关都由各自页面卡片的开关控制。
 * 调用方（stage.js）负责把该页的分组传进来，本函数只做「这一页要不要画」的真值判定，
 * 因此仍是纯函数、可被 `node --test` 直接导入断言。
 *
 * @param {{ page?: string, pageEnabled?: unknown, master?: unknown, whaleEnabled?: unknown }} input
 * @returns {boolean}
 */
export function resolveWhaleTarget(input) {
  const src = input && typeof input === "object" ? input : {};
  if (!src.master) return false;
  if (!src.pageEnabled) return false;
  if (!src.whaleEnabled) return false;
  return src.page === PAGE_HERO || src.page === PAGE_CHAT;
}

/** 聊天会话页里的「对话」子视图（消息流）。 */
export const VIEW_THREAD = "thread";

/** 聊天会话页里的「轨迹」子视图。 */
export const VIEW_TRAJECTORY = "trajectory";

/** 聊天会话页里的「统计」子视图。 */
export const VIEW_STATS = "stats";

/**
 * 判定聊天会话页内部当前是哪个子视图（v0.5.1，只用于自检与排查）。
 *
 * 为什么要区分：聊天页顶部的「对话 / 轨迹 / 统计」不是三个页面，而是同一个
 * `[data-conversation-content]` 里切换的三个视图，所以**页面分类与图层挂载点完全相同**
 * （插件不需要、也不应该为此重建图层）。真正需要区分的原因是排查：
 * 轨迹/统计视图根自带不透明底色，一旦哪天宿主改结构把底色盖回来，
 * 现象就是「对话页有鲸鱼、轨迹页没有」，而设置页开关看起来全都是开的。
 * 把子视图打进自检信息，就能一眼分辨是「开关没开」还是「被底色盖住」。
 *
 * 判定依据都是宿主发布的稳定标记：
 *   - 轨迹：视图内部有 `[data-trajectory-scroll]`（轨迹表格唯一的滚动容器）；
 *   - 统计：视图根带 `data-conversation-composer-overlay` 且内部没有轨迹滚动容器，
 *     并且存在统计表格的表头（`th`）——统计视图的结构标记最少，用「没有轨迹容器」反证。
 *
 * @param {{ hasTrajectory?: unknown, hasStatsTable?: unknown }} input
 * @returns {"thread" | "trajectory" | "stats"}
 */
export function resolveViewKind(input) {
  const src = input && typeof input === "object" ? input : {};
  if (src.hasTrajectory) return VIEW_TRAJECTORY;
  if (src.hasStatsTable) return VIEW_STATS;
  return VIEW_THREAD;
}
