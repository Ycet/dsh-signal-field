import React from "react";

/**
 * dsh-signal-field · 「设置 → UI 动画」页
 *
 * v0.5.0 起页面**按页面组织**，不再是「页面开关 + 全局效果参数」两个维度：
 *
 *   1.「总开关」——全局启用 + 动画重绘帧率上限（帧率 v0.5.0 从「动效」卡片移到这里）
 *   2.「新建会话页」——页总开关 → 背景 → 标题文字 → 鲸鱼 → 输入框毛玻璃（块间分割线）
 *   3.「聊天会话页」——页总开关 → 背景 → 输入框毛玻璃（该页没有标题与鲸鱼）
 *
 * 每个效果行下面跟一个默认折叠的「…动效设置」：展开后才是细节参数。
 * 折叠状态只存在组件里，不写存储（需求：每次进入都折叠）。
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

/**
 * 折叠开关行（v0.5.0）。
 *
 * 为什么用自绘 button 而不是原生 `<details>/<summary>`：这一行与它上面的效果行是分开的，
 * 而效果行右侧还有开关；若把开关塞进 `<summary>`，点开关会连带开合详情。
 * 自绘 button + aria-expanded/aria-controls 的语义与键盘行为由浏览器保证，
 * 视觉又能和 .mui-row 的左右两栏节奏对齐。
 */
function Disclosure(props) {
  return h(
    "button",
    {
      type: "button",
      className: "mui-disclosure",
      "aria-expanded": props.open ? "true" : "false",
      "aria-controls": props.controls,
      onClick: props.onToggle,
    },
    h("span", { className: "mui-disclosure-label" }, props.label),
    h(
      "svg",
      {
        className: "mui-disclosure-icon",
        viewBox: "0 0 16 16",
        width: 14,
        height: 14,
        "aria-hidden": "true",
        focusable: "false",
      },
      h("path", {
        d: "M6 3.5L10.5 8 6 12.5",
        fill: "none",
        stroke: "currentColor",
        strokeWidth: 1.6,
        strokeLinecap: "round",
        strokeLinejoin: "round",
      }),
    ),
  );
}

/**
 * 折叠区容器（v0.5.0）。
 *
 * 始终渲染、收起时加 `hidden`：这样结构测试可以在不模拟 React 状态的前提下
 * 断言行序与控件契约，也不需要为「展开后的内容」额外维护一份影子树。
 * CSS 必须补 `.mui-detail[hidden]{display:none}`（作者样式会覆盖 UA 的 [hidden]）。
 */
function Detail(props) {
  return h(
    "div",
    {
      className: "mui-detail",
      id: props.id,
      role: "group",
      "aria-label": props.label,
      hidden: props.open ? undefined : true,
    },
    props.locked ? h("p", { className: "mui-detail-note" }, props.lockedNote) : null,
    props.children,
  );
}

/** 设置页主体。props: { store, status?, t } */
export function SettingsPage(props) {
  const store = props.store;
  const status = props.status || NO_STATUS;
  const t = props.t;
  const state = useStore(store);
  const runtime = useStore(status);
  const [toast, setToast] = React.useState("");
  // v0.5.0：折叠区的展开状态只在本组件内，不写存储（需求：每次进入都折叠）。
  const [openKeys, setOpenKeys] = React.useState({});

  const set = (partial) => store.update(partial);
  const toggle = (key) =>
    setOpenKeys((previous) => ({ ...previous, [key]: !previous[key] }));

  // 防御性读取：真实运行时 store 的快照一定经过 normalize()；
  // 这里兜底只为「测试直接塞裸状态」时不炸，不承担补默认值的职责。
  const pages = state.pages && typeof state.pages === "object" ? state.pages : {};
  const hero = pages.hero && typeof pages.hero === "object" ? pages.hero : {};
  const chat = pages.chat && typeof pages.chat === "object" ? pages.chat : {};
  const heroBg = hero.background && typeof hero.background === "object" ? hero.background : {};
  const heroTitle = hero.title && typeof hero.title === "object" ? hero.title : {};
  const heroWhale = hero.whale && typeof hero.whale === "object" ? hero.whale : {};
  const chatBg = chat.background && typeof chat.background === "object" ? chat.background : {};
  const fps = state.frame && Number.isFinite(state.frame.fps) ? state.frame.fps : 30;

  const enabled = !!state.enabled;
  // 两道锁：全局总开关关 → 全部禁用；某页总开关关 → 该页的效果行与折叠区禁用。
  const heroLocked = !enabled || !hero.enabled;
  const chatLocked = !enabled || !chat.enabled;
  const heroBgLocked = heroLocked || !heroBg.enabled;
  const heroTitleLocked = heroLocked || !heroTitle.enabled;
  const heroWhaleLocked = heroLocked || !heroWhale.enabled;

  /** 一张卡片。卡片边框本身就是分隔，卡片之间不再放分割线。 */
  const card = (title, children) =>
    h(
      "section",
      { className: "mui-card" },
      h("h3", { className: "mui-card-title" }, title),
      children,
    );

  const divider = () => h("div", { className: "mui-divider", role: "separator" });

  /** 一行开关。 */
  const switchRow = (key, label, hint, checked, disabled, onChange) =>
    h(
      Row,
      { key, label, hint },
      h(Switch, { label, checked: !!checked, disabled, onChange }),
    );

  /** 一行滑块。 */
  const rangeRow = (key, label, hint, value, min, max, step, display, disabled, onChange) =>
    h(
      Row,
      { key, label, hint },
      h(Range, { label, value, min, max, step, display, disabled, onChange }),
    );

  /** 折叠区：标题行 + 详情容器（详情始终渲染，收起时 hidden）。 */
  const disclosure = (key, label, controlsId, locked, rows) => [
    h(
      Disclosure,
      {
        key: `${key}-toggle`,
        label,
        controls: controlsId,
        open: !!openKeys[key],
        onToggle: () => toggle(key),
      },
    ),
    h(
      Detail,
      {
        key: `${key}-detail`,
        id: controlsId,
        label,
        open: !!openKeys[key],
        locked,
        lockedNote: t("detailLocked"),
      },
      ...rows,
    ),
  ];

  /** 背景折叠区里的四行（两页共用同一套行与文案，只是写回不同的页面分组）。 */
  const backgroundRows = (pageKey, background, locked) => [
    switchRow(
      `${pageKey}-bg-idle`,
      t("rowBackgroundIdle"),
      t("rowBackgroundIdleHint"),
      background.idle,
      locked,
      (value) => set({ pages: { [pageKey]: { background: { idle: value } } } }),
    ),
    switchRow(
      `${pageKey}-bg-interact`,
      t("rowBackgroundInteract"),
      t("rowBackgroundInteractHint"),
      background.interact,
      locked,
      (value) => set({ pages: { [pageKey]: { background: { interact: value } } } }),
    ),
    rangeRow(
      `${pageKey}-bg-intensity`,
      t("rowIntensity"),
      t("rowIntensityHint"),
      Number.isFinite(background.intensity) ? background.intensity : 0.3,
      0,
      1,
      0.05,
      `${Math.round((Number.isFinite(background.intensity) ? background.intensity : 0.3) * 100)}%`,
      locked,
      (value) => set({ pages: { [pageKey]: { background: { intensity: value } } } }),
    ),
    rangeRow(
      `${pageKey}-bg-speed`,
      t("rowBackgroundSpeed"),
      t("rowBackgroundSpeedHint"),
      Number.isFinite(background.speed) ? background.speed : 1,
      0.25,
      2,
      0.25,
      `${Number.isFinite(background.speed) ? background.speed : 1}×`,
      locked,
      (value) => set({ pages: { [pageKey]: { background: { speed: value } } } }),
    ),
  ];

  return h(
    "div",
    { className: "mui-page" },
    h("p", { className: "mui-lead" }, t("lead")),

    // ===== 卡片 1：总开关（v0.5.0：帧率也归到这里）=====
    card(
      t("groupMaster"),
      h(
        React.Fragment,
        null,
        switchRow(t("master"), t("master"), t("masterHint"), enabled, false, (value) =>
          set({ enabled: value }),
        ),
        divider(),
        rangeRow(
          t("rowFps"),
          t("rowFps"),
          t("rowFpsHint"),
          fps,
          15,
          60,
          5,
          `${fps} fps`,
          !enabled,
          (value) => set({ frame: { fps: value } }),
        ),
      ),
    ),

    runtime.titleAvailable === false
      ? h("p", { className: "mui-note", "data-tone": "warn" }, t("titleUnavailable"))
      : null,
    runtime.reducedMotion
      ? h("p", { className: "mui-note", "data-tone": "warn" }, t("reducedMotion"))
      : null,

    // ===== 卡片 2：新建会话页 =====
    card(
      t("groupHeroPage"),
      h(
        React.Fragment,
        null,
        switchRow(
          "hero-master",
          t("pageMaster"),
          t("pageHeroHint"),
          hero.enabled,
          !enabled,
          (value) => set({ pages: { hero: { enabled: value } } }),
        ),
        divider(),
        switchRow(
          "hero-background",
          t("rowBackground"),
          t("rowBackgroundHint"),
          heroBg.enabled,
          heroLocked,
          (value) => set({ pages: { hero: { background: { enabled: value } } } }),
        ),
        ...disclosure(
          "hero-background",
          t("detailBackground"),
          "sf-hero-background-detail",
          heroBgLocked,
          backgroundRows("hero", heroBg, heroBgLocked),
        ),
        divider(),
        switchRow(
          "hero-title",
          t("rowTitle"),
          t("rowTitleHint"),
          heroTitle.enabled,
          heroLocked,
          (value) => set({ pages: { hero: { title: { enabled: value } } } }),
        ),
        ...disclosure(
          "hero-title",
          t("detailTitle"),
          "sf-hero-title-detail",
          heroTitleLocked,
          [
            switchRow(
              "hero-title-idle",
              t("rowTitleIdle"),
              t("rowTitleIdleHint"),
              heroTitle.idle,
              heroTitleLocked,
              (value) => set({ pages: { hero: { title: { idle: value } } } }),
            ),
            switchRow(
              "hero-title-interact",
              t("rowTitleInteract"),
              t("rowTitleInteractHint"),
              heroTitle.interact,
              heroTitleLocked,
              (value) => set({ pages: { hero: { title: { interact: value } } } }),
            ),
            // v0.3.0：标题动画速度。范围与步长镜像 settings.js 的 SPEED_RANGE。
            rangeRow(
              "hero-title-speed",
              t("rowTitleSpeed"),
              t("rowTitleSpeedHint"),
              Number.isFinite(heroTitle.speed) ? heroTitle.speed : 1,
              0.25,
              2,
              0.25,
              `${Number.isFinite(heroTitle.speed) ? heroTitle.speed : 1}×`,
              heroTitleLocked,
              (value) => set({ pages: { hero: { title: { speed: value } } } }),
            ),
          ],
        ),
        divider(),
        switchRow(
          "hero-whale",
          t("rowWhale"),
          t("rowWhaleHint"),
          heroWhale.enabled,
          heroLocked,
          (value) => set({ pages: { hero: { whale: { enabled: value } } } }),
        ),
        ...disclosure(
          "hero-whale",
          t("detailWhale"),
          "sf-hero-whale-detail",
          heroWhaleLocked,
          [
            // 字符风格固定 ASCII，故这里只有「种类」一个分段选择，没有字形切换。
            h(
              Row,
              { key: "hero-whale-species", label: t("rowWhaleSpecies"), hint: t("rowWhaleSpeciesHint") },
              h(Segmented, {
                label: t("rowWhaleSpecies"),
                value: heroWhale.species,
                disabled: heroWhaleLocked,
                options: [
                  { value: "humpback", label: t("whaleHumpback") },
                  { value: "orca", label: t("whaleOrca") },
                ],
                onChange: (value) => set({ pages: { hero: { whale: { species: value } } } }),
              }),
            ),
            h("p", { key: "hero-whale-numbers-hint", className: "mui-row-hint" }, t("whaleNumbersHint")),
            h(
              "div",
              { key: "hero-whale-numbers", className: "mui-numgrid" },
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
                    value: heroWhale[field.key] === undefined ? "" : heroWhale[field.key],
                    disabled: heroWhaleLocked ? true : undefined,
                    onChange: (event) => {
                      // 清空输入框时不要写回：valueAsNumber 会变成 NaN，
                      // 而归一化会把非法值换回默认，等于「一删就跳回默认」，手感很糟。
                      const next = event.target.valueAsNumber;
                      if (event.target.value !== "" && Number.isFinite(next)) {
                        set({ pages: { hero: { whale: { [field.key]: next } } } });
                      }
                    },
                  }),
                ),
              ),
            ),
          ],
        ),
        divider(),
        switchRow(
          "hero-glass",
          t("rowGlass"),
          t("rowGlassHint"),
          hero.glass,
          heroLocked,
          (value) => set({ pages: { hero: { glass: value } } }),
        ),
      ),
    ),

    // ===== 卡片 3：聊天会话页（没有标题与鲸鱼）=====
    card(
      t("groupChatPage"),
      h(
        React.Fragment,
        null,
        switchRow(
          "chat-master",
          t("pageMaster"),
          t("pageChatHint"),
          chat.enabled,
          !enabled,
          (value) => set({ pages: { chat: { enabled: value } } }),
        ),
        divider(),
        switchRow(
          "chat-background",
          t("rowBackground"),
          t("rowBackgroundHint"),
          chatBg.enabled,
          chatLocked,
          (value) => set({ pages: { chat: { background: { enabled: value } } } }),
        ),
        ...disclosure(
          "chat-background",
          t("detailBackground"),
          "sf-chat-background-detail",
          chatLocked || !chatBg.enabled,
          backgroundRows("chat", chatBg, chatLocked || !chatBg.enabled),
        ),
        divider(),
        switchRow(
          "chat-glass",
          t("rowGlass"),
          t("rowGlassHint"),
          chat.glass,
          chatLocked,
          (value) => set({ pages: { chat: { glass: value } } }),
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
