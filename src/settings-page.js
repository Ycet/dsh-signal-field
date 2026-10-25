import React from "react";

/**
 * dsh-signal-field · 「设置 → UI 动画」页
 *
 * 只做三件事：把设置渲染成开关/滑块、把改动写回 store、在必要时说明降级状态。
 * 不依赖 DSH 的 Client 组件包（按插件实践要求自绘控件，只用主题 token 取色）。
 */

/** 未提供状态源时的空实现，保证 hook 调用顺序稳定。 */
const NO_STATUS = {
  getSnapshot() {
    return { titleAvailable: null };
  },
  subscribe() {
    return () => {};
  },
};

/** 订阅 store 的标准用法（React 18 的 useSyncExternalStore）。 */
function useStore(store) {
  return React.useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}

/** 单行设置项：左侧标题与说明，右侧控件。 */
function Row(props) {
  return h(
    "div",
    { className: "mui-row" },
    h(
      "div",
      { className: "mui-row-text" },
      h("span", { className: "mui-row-label" }, props.label),
      props.hint ? h("span", { className: "mui-row-hint" }, props.hint) : null,
    ),
    h("div", { className: "mui-row-control" }, props.children),
  );
}

/** 自绘开关：与原生的行为契约一致（role=switch + aria-checked）。 */
function Switch(props) {
  return h("button", {
    type: "button",
    role: "switch",
    className: "mui-switch",
    "aria-checked": props.checked ? "true" : "false",
    "aria-label": props.label,
    disabled: props.disabled ? true : undefined,
    onClick: () => {
      if (props.disabled) return;
      props.onChange(!props.checked);
    },
  });
}

/** 参数滑块：原生 range，读屏与键盘行为由浏览器提供。 */
function Range(props) {
  return h(
    React.Fragment,
    null,
    h("input", {
      type: "range",
      className: "mui-range",
      min: props.min,
      max: props.max,
      step: props.step,
      value: props.value,
      "aria-label": props.label,
      disabled: props.disabled ? true : undefined,
      onChange: (event) => props.onChange(Number(event.target.value)),
    }),
    h("span", { className: "mui-range-value" }, props.display),
  );
}

/** 设置页主体。props: { store, status?, t, close? } */
export function SettingsPage(props) {
  const store = props.store;
  const status = props.status || NO_STATUS;
  const t = props.t;
  const state = useStore(store);
  const runtime = useStore(status);
  const [toast, setToast] = React.useState("");
  const [diag, setDiag] = React.useState(null);
  const off = !state.enabled;

  const set = (partial) => store.update(partial);

  /** 跑一次自检并把文本结果放进页面。 */
  const runDiagnose = () => {
    try {
      setDiag(props.diagnose ? String(props.diagnose()) : "no-diagnose");
    } catch (error) {
      setDiag(`error: ${(error && error.message) || error}`);
    }
  };
  // 设置页一打开就把自检信息填好：这个环境没有 devtools，不让用户再点一次按钮。
  React.useEffect(() => {
    runDiagnose();
  }, []);

  const surface = (page, key) => ({
    checked: state.surfaces[page][key],
    disabled: off,
    onChange: (value) => set({ surfaces: { [page]: { [key]: value } } }),
  });

  const section = (title, children) =>
    h(
      "section",
      { className: "mui-section" },
      h("h3", { className: "mui-section-title" }, title),
      children,
    );

  const pageGroup = (title, rows) =>
    h(
      "div",
      { className: "mui-page-group" },
      h("h4", { className: "mui-page-title" }, title),
      rows,
    );

  const heroTitle = surface("hero", "title");
  const heroBackground = surface("hero", "background");
  const heroGlass = surface("hero", "glass");
  const chatBackground = surface("chat", "background");
  const chatGlass = surface("chat", "glass");
  const panelsHud = surface("panels", "hudGlass");

  return h(
    "div",
    { className: "mui-page" },
    h("p", { className: "mui-lead" }, t("lead")),

    // 总开关
    section(
      t("groupMaster"),
      h(
        Row,
        { label: t("master"), hint: t("masterHint") },
        h(Switch, {
          label: t("master"),
          checked: state.enabled,
          onChange: (value) => set({ enabled: value }),
        }),
      ),
    ),

    runtime.titleAvailable === false
      ? h("p", { className: "mui-note", "data-tone": "warn" }, t("titleUnavailable"))
      : null,
    runtime.reducedMotion
      ? h("p", { className: "mui-note", "data-tone": "warn" }, t("reducedMotion"))
      : null,

    // 页面维度
    section(
      t("groupSurfaces"),
      h(
        React.Fragment,
        null,
        // 作用范围说明：这是一行不可交互的静态提示，不是开关。
        h("p", { className: "mui-note" }, t("scopeNote")),
        pageGroup(t("pageHero"), [
          h(
            Row,
            { key: "hero-title", label: t("rowHeroTitle") },
            h(Switch, { label: t("rowHeroTitle"), ...heroTitle }),
          ),
          h(
            Row,
            { key: "hero-bg", label: t("rowHeroBackground") },
            h(Switch, { label: t("rowHeroBackground"), ...heroBackground }),
          ),
          h(
            Row,
            { key: "hero-glass", label: t("rowHeroGlass") },
            h(Switch, { label: t("rowHeroGlass"), ...heroGlass }),
          ),
        ]),
        pageGroup(t("pageChat"), [
          h(
            Row,
            { key: "chat-bg", label: t("rowChatBackground") },
            h(Switch, { label: t("rowChatBackground"), ...chatBackground }),
          ),
          h(
            Row,
            { key: "chat-glass", label: t("rowChatGlass") },
            h(Switch, { label: t("rowChatGlass"), ...chatGlass }),
          ),
        ]),
      ),
    ),

    // 其它区域：与页面无关的跨区域能力
    section(
      t("groupPanels"),
      h(
        React.Fragment,
        null,
        h(
          Row,
          { key: "panels-hud", label: t("rowHudGlass"), hint: t("rowHudGlassHint") },
          h(Switch, { label: t("rowHudGlass"), ...panelsHud }),
        ),
      ),
    ),

    // 动效细节
    section(
      t("groupDetail"),
      h(
        React.Fragment,
        null,
        h(
          Row,
          { label: t("rowTitleIdle"), hint: t("rowTitleIdleHint") },
          h(Switch, {
            label: t("rowTitleIdle"),
            checked: state.title.idle,
            disabled: off,
            onChange: (value) => set({ title: { idle: value } }),
          }),
        ),
        h(
          Row,
          { label: t("rowTitleInteract"), hint: t("rowTitleInteractHint") },
          h(Switch, {
            label: t("rowTitleInteract"),
            checked: state.title.interact,
            disabled: off,
            onChange: (value) => set({ title: { interact: value } }),
          }),
        ),
        h(
          Row,
          { label: t("rowBackgroundIdle"), hint: t("rowBackgroundIdleHint") },
          h(Switch, {
            label: t("rowBackgroundIdle"),
            checked: state.background.idle,
            disabled: off,
            onChange: (value) => set({ background: { idle: value } }),
          }),
        ),
        h(
          Row,
          { label: t("rowBackgroundInteract"), hint: t("rowBackgroundInteractHint") },
          h(Switch, {
            label: t("rowBackgroundInteract"),
            checked: state.background.interact,
            disabled: off,
            onChange: (value) => set({ background: { interact: value } }),
          }),
        ),
      ),
    ),

    // 参数
    section(
      t("groupParams"),
      h(
        React.Fragment,
        null,
        h(
          Row,
          { label: t("rowIntensity"), hint: t("rowIntensityHint") },
          h(Range, {
            label: t("rowIntensity"),
            value: state.background.intensity,
            min: 0,
            max: 1,
            step: 0.05,
            display: `${Math.round(state.background.intensity * 100)}%`,
            disabled: off,
            onChange: (value) => set({ background: { intensity: value } }),
          }),
        ),
        h(
          Row,
          { label: t("rowBlur"), hint: t("rowBlurHint") },
          h(Range, {
            label: t("rowBlur"),
            value: state.glass.blur,
            min: 0,
            max: 32,
            step: 1,
            display: `${state.glass.blur}px`,
            disabled: off,
            onChange: (value) => set({ glass: { blur: value } }),
          }),
        ),
      ),
    ),

    h("p", { className: "mui-note" }, t("coexist")),

    // 自检：只在点开时执行，便于没有 devtools 的环境定位锚点问题
    h(
      "details",
      { className: "mui-diag", open: true },
      h("summary", { className: "mui-diag-summary" }, t("diag")),
      h("p", { className: "mui-row-hint" }, t("diagHint")),
      h(
        "div",
        { className: "mui-footer" },
        h(
          "button",
          { type: "button", className: "mui-button", onClick: runDiagnose },
          t("diagRefresh"),
        ),
      ),
      diag ? h("pre", { className: "mui-diag-body" }, diag) : null,
    ),

    h(
      "div",
      { className: "mui-footer" },
      h(
        "button",
        {
          type: "button",
          className: "mui-button",
          onClick: () => {
            store.reset();
            setToast(t("resetDone"));
          },
        },
        t("reset"),
      ),
      toast ? h("span", { className: "mui-toast", role: "status" }, toast) : null,
    ),
  );
}
