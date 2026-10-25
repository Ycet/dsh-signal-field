import React from "react";

/**
 * dsh-signal-field · Client 入口
 *
 * 装配顺序：语言资源 → 样式 → 舞台（信号场 / 标题 / 毛玻璃的作用域属性）→ 设置页。
 * 所有资源都注册在 ctx.effect 里，插件卸载或被禁用时自动回收。
 */

/**
 * 依赖的 Client 服务。
 * 页面判定只看 `[data-conversation-content]` 这一 DOM 契约，因此不再需要 `layout`
 * 服务（v0.1.1 起移除）：少一个可能改名的硬依赖，插件加载条件更宽。
 */
export const inject = ["slots", "locale"];

/** 是否开启了系统的「减少动效」。 */
function prefersReducedMotion() {
  try {
    return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  } catch {
    return false;
  }
}

/** 首次运行且系统要求减少动效时，用「静止」初值落盘一次；用户随后可手动打开。 */
function seedReducedMotion(storage, store) {
  let stored = null;
  try {
    stored = storage.getItem(STORAGE_KEY);
  } catch {
    stored = null;
  }
  if (stored !== null && stored !== "") return;
  if (!prefersReducedMotion()) return;
  store.update({
    title: { idle: false, interact: false },
    background: { idle: false, interact: false },
  });
}

export function apply(ctx) {
  const storage = browserStorage(typeof window === "undefined" ? {} : window);
  const store = createStore(storage);
  const status = createStatus({ reducedMotion: prefersReducedMotion() });
  seedReducedMotion(storage, store);

  // 语言资源必须先注册，再 bind 出翻译函数。
  ctx.effect(
    () => ctx.locale.register(NS, { zh: SIGNAL_FIELD_DICTS.zh, en: SIGNAL_FIELD_DICTS.en }),
    "dsh-signal-field: locale",
  );
  const t = ctx.locale.bind(NS);

  ctx.effect(() => installStyles(document), "dsh-signal-field: styles");

  const stage = createStage({
    store,
    status,
    documentRef: document,
  });
  ctx.effect(() => stage.install(), "dsh-signal-field: stage");

  ctx.slots.inject("settings.section", () =>
    ctx.slots.register(
      {
        name: "settings.section",
        id: "signal-field",
        order: 58,
        locale: NS,
        label: () => t("title"),
        inject: () => ({ store, status, t, diagnose: () => stage.diagnose() }),
      },
      SettingsPage,
    ),
  );
}
