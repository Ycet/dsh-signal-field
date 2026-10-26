import React from "react";

/**
 * dsh-signal-field · 「设置 → UI 动画」页
 *
 * v0.2.9 起页面分成两个模块（中间一条分割线）：
 *   1. 「页面」——哪些页面展示动效（新建会话页面 / 聊天会话页面）
 *   2. 「动效」——动效本身（标题、标题动画速度、背景、背景强度、背景动画速度、毛玻璃、重绘帧率上限）
 * 总开关单独一行放在两个模块之前。
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
  const off = !state.enabled;

  const set = (partial) => store.update(partial);

  /** 模块「页面」里的行：控制该页是否展示动效。 */
  const pageSwitch = (key) => ({
    checked: state.pages[key],
    disabled: off,
    onChange: (value) => set({ pages: { [key]: value } }),
  });

  const section = (title, children) =>
    h(
      "section",
      { className: "mui-section" },
      h("h3", { className: "mui-section-title" }, title),
      children,
    );

  /** 两个模块之间的分割线（纯样式，不参与交互）。 */
  const divider = () => h("div", { className: "mui-divider", role: "separator" });

  const heroPage = pageSwitch("hero");
  const chatPage = pageSwitch("chat");
  const glassEnabled = {
    checked: state.glass.enabled,
    disabled: off,
    onChange: (value) => set({ glass: { enabled: value } }),
  };

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

    // 模块 1：页面
    section(
      t("groupPages"),
      h(
        React.Fragment,
        null,
        h(
          Row,
          { key: "page-hero", label: t("rowHeroPage"), hint: t("rowHeroPageHint") },
          h(Switch, { label: t("rowHeroPage"), ...heroPage }),
        ),
        h(
          Row,
          { key: "page-chat", label: t("rowChatPage"), hint: t("rowChatPageHint") },
          h(Switch, { label: t("rowChatPage"), ...chatPage }),
        ),
      ),
    ),

    divider(),

    // 模块 2：动效本身
    section(
      t("groupEffects"),
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
        // v0.3.0：标题动画速度。范围与步长镜像 settings.js 的 SPEED_RANGE；
        // 这里写常量而不是 import，是因为设置页测试会剥掉 import 行后再渲染组件。
        h(
          Row,
          { label: t("rowTitleSpeed"), hint: t("rowTitleSpeedHint") },
          h(Range, {
            label: t("rowTitleSpeed"),
            value: state.title.speed,
            min: 0.25,
            max: 2,
            step: 0.25,
            display: `${state.title.speed}×`,
            disabled: off,
            onChange: (value) => set({ title: { speed: value } }),
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
        h(
          Row,
          { label: t("rowGlass"), hint: t("rowGlassHint") },
          h(Switch, { label: t("rowGlass"), ...glassEnabled }),
        ),
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
        // v0.3.0：背景动画速度（整片背景的时钟倍率，含涟漪）。与帧率上限完全独立。
        h(
          Row,
          { label: t("rowBackgroundSpeed"), hint: t("rowBackgroundSpeedHint") },
          h(Range, {
            label: t("rowBackgroundSpeed"),
            value: state.background.speed,
            min: 0.25,
            max: 2,
            step: 0.25,
            display: `${state.background.speed}×`,
            disabled: off,
            onChange: (value) => set({ background: { speed: value } }),
          }),
        ),
        // v0.2.11：重绘帧率上限。范围与步长镜像 settings.js 的 FPS_RANGE，
        // 这里写常量而不是 import，是因为设置页测试会剥掉 import 行后再渲染组件。
        h(
          Row,
          { label: t("rowFps"), hint: t("rowFpsHint") },
          h(Range, {
            label: t("rowFps"),
            value: state.background.fps,
            min: 15,
            max: 60,
            step: 5,
            display: `${state.background.fps} fps`,
            disabled: off,
            onChange: (value) => set({ background: { fps: value } }),
          }),
        ),
      ),
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
