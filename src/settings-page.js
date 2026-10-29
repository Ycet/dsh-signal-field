import React from "react";

/**
 * dsh-signal-field · 「设置 → UI 动画」页
 *
 * v0.2.9 起页面分成两个模块（中间一条分割线）：
 *   1. 「页面」——哪些页面展示动效（新建会话页面 / 聊天会话页面）
 *   2. 「动效」——动效本身（标题、标题动画速度、背景、背景强度、背景动画速度、毛玻璃、重绘帧率上限）
 * 总开关单独一行放在两个模块之前。
 *
 * v0.4.0：鲸鱼动画的 13 项设置**并入「动效」模块末尾**（不新增模块、不新增分割线）。
 * 行标题统一加「鲸鱼」前缀，否则「透明度」「游动速度」会和上面的「背景强度」「背景动画速度」混淆。
 *
 * 只做三件事：把设置渲染成开关/滑块/分段/数字框、把改动写回 store、在必要时说明降级状态。
 * 不依赖 DSH 的 Client 组件包（按插件实践要求自绘控件，只用主题 token 取色）。
 */

/**
 * 鲸鱼的 11 个数值项（v0.4.0）。
 *
 * 顺序 = 设置页显示顺序（两列网格逐行铺开，所以前两项在第一行）。
 * 范围与步长镜像 settings.js 的 WHALE_RANGES；这里写常量而不是 import，
 * 是因为设置页测试会剥掉 import 行后再渲染组件（同 rowFps / rowTitleSpeed 的既有做法）。
 */
const WHALE_NUMBERS = [
  { key: "count", row: "rowWhaleCount", min: 1, max: 20, step: 1 },
  { key: "speed", row: "rowWhaleSpeed", min: 0.1, max: 10, step: 0.05 },
  { key: "bodySwing", row: "rowWhaleBodySwing", min: 0, max: 3, step: 0.05 },
  { key: "turnAgility", row: "rowWhaleTurnAgility", min: 0.1, max: 3, step: 0.05 },
  { key: "tailFrequency", row: "rowWhaleTailFrequency", min: 0.1, max: 5, step: 0.05 },
  { key: "size", row: "rowWhaleSize", min: 0.1, max: 10, step: 0.1 },
  { key: "opacity", row: "rowWhaleOpacity", min: 0, max: 1, step: 0.05 },
  { key: "gridScale", row: "rowWhaleGridScale", min: 0.1, max: 10, step: 0.05 },
  { key: "gridOpacity", row: "rowWhaleGridOpacity", min: 0, max: 1, step: 0.01 },
  { key: "fishCount", row: "rowWhaleFishCount", min: 0, max: 1000, step: 1 },
  { key: "wake", row: "rowWhaleWake", min: 0, max: 10, step: 0.1 },
];

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

/**
 * 分段选择（v0.4.0，用于「鲸鱼种类」）。
 *
 * 为什么是按钮组而不是原生 radio：选项只有 2 个且都是中文名，
 * aria-pressed 的读屏语义与视觉都与插件其它控件一致，不需要额外画 radio 的圆点。
 */
function Segmented(props) {
  return h(
    "div",
    { className: "mui-seg", role: "group", "aria-label": props.label },
    props.options.map((option) =>
      h(
        "button",
        {
          key: option.value,
          type: "button",
          className: "mui-seg-item",
          "aria-pressed": props.value === option.value ? "true" : "false",
          disabled: props.disabled ? true : undefined,
          onClick: () => {
            if (props.disabled) return;
            props.onChange(option.value);
          },
        },
        option.label,
      ),
    ),
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
  // v0.4.0：鲸鱼分组可能缺席（测试直接塞了裸状态、或存档还没写过 whale 键）。
  // 这里只保证读属性不炸，真正的默认值由 settings.js 的 normalize() 兜。
  const whale = state.whale && typeof state.whale === "object" ? state.whale : {};

  const set = (partial) => store.update(partial);

  /** 模块「页面」里的行：控制该页是否展示动效。 */
  const pageSwitch = (key) => ({
    checked: state.pages[key],
    disabled: off,
    onChange: (value) => set({ pages: { [key]: value } }),
  });

  /**
   * 一张卡片（v0.4.0）。三个模块各一张，卡片之间不再放分割线——卡片边框本身就是分隔。
   * 卡片标题比卡内分组小标题高一级：13px 半粗主色 vs 12px 次色。
   */
  const card = (title, children) =>
    h(
      "section",
      { className: "mui-card" },
      h("h3", { className: "mui-card-title" }, title),
      children,
    );

  /**
   * 动效卡片里的一个分组（v0.4.0）。
   *
   * first 为真时**不**画分割线：卡片标题已经把这组与上面隔开，
   * 再加一条线会变成「卡片标题 + 线 + 小标题」的三层堆叠。
   *
   * rows 用可变参数而不是数组，是为了让 React 看到多个 children 而不是数组，
   * 免掉「数组元素缺 key」的警告。
   */
  const group = (title, first, ...rows) =>
    h(
      React.Fragment,
      null,
      first ? null : h("div", { className: "mui-divider", role: "separator" }),
      h("h4", { className: "mui-group-title" }, title),
      ...rows,
    );

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
    card(
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
    card(
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

    // 模块 2：动效 → 动效卡片（v0.4.0）：卡内再分五组，组间用分割线 + 小标题
    card(
      t("groupEffects"),
      h(
        React.Fragment,
        null,
        group(
          t("groupBackground"),
          true,
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
        ),
        group(
          t("groupHeadline"),
          false,
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
        ),
        group(
          t("groupWhale"),
          false,
          // ===== v0.4.0：鲸鱼动画（从 dsh-ascii-whales 迁移）=====
          // 独立成一个分组而不是并进背景组：两者是互不相干的渲染管线，
          // 而且这组有 13 行，混进背景组会把上面 4 行彻底淹没。
          h(
            Row,
            { label: t("rowWhaleEnabled"), hint: t("rowWhaleEnabledHint") },
            h(Switch, {
              label: t("rowWhaleEnabled"),
              checked: whale.enabled,
              disabled: off,
              onChange: (value) => set({ whale: { enabled: value } }),
            }),
          ),
          // 字符风格固定 ASCII，故这里只有「种类」一个分段选择，没有字形切换。
          h(
            Row,
            { label: t("rowWhaleSpecies"), hint: t("rowWhaleSpeciesHint") },
            h(Segmented, {
              label: t("rowWhaleSpecies"),
              value: whale.species,
              disabled: off,
              options: [
                { value: "humpback", label: t("whaleHumpback") },
                { value: "orca", label: t("whaleOrca") },
              ],
              onChange: (value) => set({ whale: { species: value } }),
            }),
          ),
          h("p", { className: "mui-row-hint" }, t("whaleNumbersHint")),
          h(
            "div",
            { className: "mui-numgrid" },
            WHALE_NUMBERS.map((field) =>
              h(
                "label",
                { key: field.key, className: "mui-num" },
                h("span", { className: "mui-num-label" }, t(field.row)),
                h("input", {
                  type: "number",
                  className: "mui-num-input",
                  "aria-label": t(field.row),
                  min: field.min,
                  max: field.max,
                  step: field.step,
                  value: whale[field.key] === undefined ? "" : whale[field.key],
                  disabled: off ? true : undefined,
                  onChange: (event) => {
                    // 清空输入框时不要写回：valueAsNumber 会变成 NaN，
                    // 而归一化会把非法值换回默认，等于「一删就跳回默认」，手感很糟。
                    const next = event.target.valueAsNumber;
                    if (event.target.value !== "" && Number.isFinite(next)) {
                      set({ whale: { [field.key]: next } });
                    }
                  },
                }),
              ),
            ),
          ),
        ),
        group(
          t("groupInput"),
          false,
          h(
            Row,
            { label: t("rowGlass"), hint: t("rowGlassHint") },
            h(Switch, { label: t("rowGlass"), ...glassEnabled }),
          ),
        ),
        group(
          t("groupFps"),
          false,
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
