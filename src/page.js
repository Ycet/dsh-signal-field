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
 * 决定「HUD 面板毛玻璃」这个跨区域能力是否生效。
 *
 * 规则：
 *   1. 只有新增会话页与聊天会话页在作用范围内，面板页一律不介入；
 *   2. 受自己的开关控制。
 *
 * 右侧边栏背景已于 v0.2.4 按用户要求移除（作用范围不再包含右栏），
 * 因此这里不再返回 rightbar，也不再需要右栏展开状态。
 *
 * @param {{ page?: string, hudGlass?: unknown }} input
 * @returns {{ hud: boolean }}
 */
export function resolvePanelTargets(input) {
  const src = input && typeof input === "object" ? input : {};
  const inScope = src.page === PAGE_HERO || src.page === PAGE_CHAT;
  if (!inScope) return { hud: false };
  return { hud: !!src.hudGlass };
}
