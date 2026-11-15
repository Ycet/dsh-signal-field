/**
 * HUD 面板区域的鲸鱼网格层（v0.5.3）实现契约
 *
 * 这个能力有两个最容易「改回去也不报错、但用户立刻能看出来」的约定：
 *
 *   1. 闸门必须跟随「鲸鱼」，**不能**跟着「背景」。两者的存在理由不同：
 *      补场是为了给面板玻璃一片可模糊的场，网格是鲸鱼那一层的观感延伸。
 *      一旦有人把它合并回 resolvePanelTargets，只开鲸鱼、关掉背景的组合就会变成
 *      「内容区有网格、HUD 区光秃秃」。
 *   2. 层序必须是「补场 → 网格 → 面板」。网格在补场之前会被整片盖住；
 *      在面板之后则会盖住面板。
 *
 * 图层依赖 Canvas2D / ResizeObserver / fixed 定位，node 里无法实例化，
 * 所以这里锁的是装配方式与 CSS，而不是像素。真实观感仍需人看屏幕验收。
 */

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { CSS } from '../src/styles.js';

const STAGE = await readFile(new URL('../src/stage.js', import.meta.url), 'utf8');
const ENGINE = await readFile(new URL('../src/whale-engine.js', import.meta.url), 'utf8');
const FIELD = await readFile(new URL('../src/whale-field.js', import.meta.url), 'utf8');

/** 取出一个具名函数的源码片段：从声明处切到 followedBy 标记。 */
function sliceFunction(source, declaration, followedBy) {
  const start = source.indexOf(declaration);
  assert.ok(start >= 0, `找不到 ${declaration}`);
  const end = source.indexOf(followedBy, start);
  assert.ok(end > start, `找不到 ${declaration} 的结束标记`);
  return source.slice(start, end);
}

/** 把样式文本拆成「选择器 / 声明块」序列（与 parity.test.mjs 同款扁平解析）。 */
function blocks(css) {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
  return [...clean.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) => ({
    selector: match[1].trim(),
    body: match[2],
  }));
}

test('HUD 网格: 闸门只看鲸鱼三道闸门，不读背景开关', () => {
  const body = sliceFunction(STAGE, 'function hudGridWanted', 'function syncHudWhale');
  assert.match(body, /resolvePanelGridTarget\(/, '必须走页面层的纯函数闸门');
  assert.match(body, /pageScopeOf\(state, page\)/, '页总开关取当前页');
  assert.match(body, /whaleScopeOf\(state, page\)/, '鲸鱼开关取当前页');
  assert.doesNotMatch(body, /backgroundScopeOf/, '不得读背景分组');
  assert.doesNotMatch(body, /\.background\b/, '不得引用背景开关');
});

test('HUD 网格: 面板存在时挂层，关闭鲸鱼/关面板时整层销毁', () => {
  const body = sliceFunction(STAGE, 'function syncHudWhale', '/** 面板会随窗口缩放');
  assert.match(body, /doc\.querySelector\("\.hud-panel"\)/, '必须靠 .hud-panel 判断面板是否存在');
  assert.match(body, /data-mui-whale-hud/, '图层必须带专属标记');
  assert.match(body, /createWhaleField\(hudWhaleEl, options\)/, '必须用鲸鱼适配器创建引擎');
  assert.match(body, /gridOnly:\s*true/, '必须走网格-only 模式');
  assert.match(body, /interact:\s*true/, '交互跟随鲸鱼开关（用户决策）');
  // 网格层没有实体：种群参数固定，避免调「鲸鱼数量 / 小鱼数量」时无谓重建画布。
  assert.match(body, /count:\s*1/, '鲸鱼数量应固定');
  assert.match(body, /fishCount:\s*0/, '小鱼数量应为 0');
  assert.match(body, /anchorHudWhale\(panel\)/, '必须锚定到面板之前');
  assert.match(body, /placeHudWhale\(panel\)/, '必须写入与补场一致的竖带几何');
  assert.match(body, /destroyHudWhale\(\)/, '闸门关闭时必须销毁整层');
});

test('HUD 网格: 与补场共用同一套竖带测量', () => {
  const body = sliceFunction(STAGE, 'function placeHudWhale', 'function syncHudBackdrop');
  assert.match(body, /measureHudStrip\(panel\)/, '必须复用公共测量');
  assert.match(body, /data-mui-hud-side/, '侧别要写进属性便于自检');
  assert.match(body, /data-off/, '带子无效时只隐藏，不销毁引擎');
  // 补场自己的测量路径也应改为公共函数，避免两份带子判定漂移。
  const backdrop = sliceFunction(STAGE, 'function placeHudBackdrop', 'function placeHudWhale');
  assert.match(backdrop, /measureHudStrip\(panel\)/, '补场也必须走公共测量');
  // 公共测量内部才是唯一调用 resolveHudStrip 的地方。
  const measure = sliceFunction(STAGE, 'function measureHudStrip', 'function placeHudBackdrop');
  assert.match(measure, /resolveHudStrip\(\{/, '竖带几何仍由纯函数计算');
});

test('HUD 网格: 层序固定为 补场 → 网格 → 面板', async () => {
  const backdrop = sliceFunction(STAGE, 'function anchorHudBackdrop', 'function anchorHudWhale');
  // 有网格层时以它为参照，否则以面板为参照。
  assert.match(
    backdrop,
    /const target = hudWhaleEl && hudWhaleEl\.parentElement === parent \? hudWhaleEl : panel/,
    '补场必须排在网格层之前',
  );
  assert.match(backdrop, /parent\.insertBefore\(hudBackdropEl, target\)/, '补场插入参照点');
  const grid = sliceFunction(STAGE, 'function anchorHudWhale', 'function measureHudStrip');
  assert.match(grid, /parent\.insertBefore\(hudWhaleEl, panel\)/, '网格层必须插在面板之前');
  // sync() 里必须先补场、后网格，首次创建才会按顺序落位。
  const backdropAt = STAGE.indexOf('syncHudBackdrop(state, dark);');
  const gridAt = STAGE.indexOf('syncHudWhale(state, dark);');
  assert.ok(backdropAt > 0 && gridAt > backdropAt, 'sync() 必须先补场后网格');
});

test('HUD 网格: 清理与观察器生命周期完整', () => {
  const clear = sliceFunction(STAGE, 'function clearStage', '// ---- 输入框下方信息行的高度');
  assert.match(clear, /destroyHudWhale\(\)/, '离开作用范围时必须拆掉网格层');
  const destroy = sliceFunction(STAGE, 'function destroyHudWhale', '// ---- 标题');
  assert.match(destroy, /hudWhaleField\.destroy\(\)/, '必须销毁引擎');
  assert.match(destroy, /hudWhaleEl\.remove\(\)/, '必须移除节点');
  assert.match(destroy, /releaseHudWatch\(\)/, '必须释放共用观察器');
  // 两个图层共用一个面板观察器：只有一个还在时不得断开。
  const release = sliceFunction(STAGE, 'function releaseHudWatch', 'function destroyHudBackdrop');
  assert.match(release, /if \(hudBackdropEl \|\| hudWhaleEl\) return;/, '任一图层还在时继续观察');
  const watch = sliceFunction(STAGE, 'function watchHudPanel', 'function releaseHudWatch');
  assert.match(watch, /placeHudBackdrop\(panel\)/, '面板尺寸变化时补场要重排');
  assert.match(watch, /placeHudWhale\(panel\)/, '面板尺寸变化时网格也要重排');
});

test('HUD 网格: 自检回读网格层', () => {
  assert.match(STAGE, /`hudWhale:/, 'diagnose 必须回读 hudWhale');
  assert.match(STAGE, /gridOnly=yes/, '自检要标明这是网格-only 模式');
});

test('HUD 网格: 面板玻璃仍只跟随「背景」，不因鲸鱼开启', () => {
  // 用户明确要求：只开鲸鱼、关掉背景时 HUD 不需要毛玻璃。
  // 因此 syncRoot 仍走 resolvePanelTargets，且不得引入网格专用的玻璃标记。
  const body = sliceFunction(STAGE, 'function syncRoot', '// ---- 自检');
  assert.match(body, /resolvePanelTargets\(\{/, '玻璃闸门必须仍是「页总开关 + 背景」');
  assert.doesNotMatch(body, /data-mui-hud-grid/, '不得为网格新增玻璃标记');
  assert.doesNotMatch(STAGE, /resolveHudGlassTarget/, '不得引入「背景或鲸鱼」的合并玻璃闸门');
});

test('whale-engine: gridOnly 通过空实体实现，不改编渲染主循环', () => {
  assert.match(ENGINE, /\[适配 6\]/, '适配点必须标注');
  assert.match(ENGINE, /const gridOnly = src\.gridOnly === true;/, '必须显式判定 true');
  assert.match(ENGINE, /const count = gridOnly \? 0 : whaleCount\(src\.count\);/, 'gridOnly 不生成鲸鱼');
  assert.match(ENGINE, /const fishCount = gridOnly \? 0 : src\.fishCount;/, 'gridOnly 不生成鱼群');
  // 指针交互仍需要：能量写入与点击热斑都走既有路径。
  assert.match(ENGINE, /depositWake\(world\)/, '指针能量路径必须保留');
  assert.match(ENGINE, /splash\(x, y\)/, '点击溅射路径必须保留');
  // 没有鲸鱼/鱼群的尾迹时，上游 0.08 的指针写入越不过 0.45 的绘制阈值（实测稳态 0.27），
  // 所以网格-only 必须放大指针能量，否则「交互效果」完全看不见。
  assert.match(ENGINE, /const pointerGain = gridOnly \? 4 : 1;/, 'gridOnly 必须放大指针增益');
  assert.match(ENGINE, /const pointerRadius = gridOnly \? 2 : 1;/, 'gridOnly 必须放大指针半径');
  assert.match(ENGINE, /0\.08 \* this\.pointerGain/, '指针写入必须使用增益');
  assert.match(ENGINE, /pointerGain = 1, pointerRadius = 1\)/, '完整海洋必须保持上游默认值');
});

test('whale-field: gridOnly 进入种群签名并透传给工厂', () => {
  assert.match(FIELD, /const gridOnly = src\.gridOnly === true;/, '适配器必须读取 gridOnly');
  assert.match(
    FIELD,
    /const nextPopulation = `\$\{gridOnly \? "grid" : "full"\}\|/,
    'gridOnly 必须进入种群签名（模式切换要重建引擎）',
  );
  assert.match(FIELD, /gridOnly,\n\s*\}\);/, 'gridOnly 必须透传给 WHALE_ENGINE.create');
});

test('styles: HUD 网格层是 fixed 悬浮层、不吃指针事件、不做毛玻璃', () => {
  const parsed = blocks(CSS);
  const hud = parsed.find((block) => /^\[data-mui-whale-hud\]$/.test(block.selector));
  assert.ok(hud, '缺少 HUD 网格层的基础规则');
  assert.match(hud.body, /position:\s*fixed/, '必须是 fixed 悬浮层');
  assert.match(hud.body, /inset:\s*auto/, '必须让掉 inset:0');
  assert.match(hud.body, /z-index:\s*0/, '必须与补场同层（面板之前）');
  assert.match(hud.body, /pointer-events:\s*none/, '不得吃掉面板/页面事件');
  assert.match(hud.body, /opacity:\s*var\(--mui-whale-opacity,\s*1\)/, '透明度沿用鲸鱼设置');
  assert.doesNotMatch(hud.body, /backdrop-filter/, '网格层不做毛玻璃');
  const off = parsed.find((block) => /^\[data-mui-whale-hud\]\[data-off\]$/.test(block.selector));
  assert.ok(off, '缺少 data-off 隐藏规则');
  assert.match(off.body, /visibility:\s*hidden/);
  const canvas = parsed.find((block) => /^\[data-mui-whale-hud\] > canvas$/.test(block.selector));
  assert.ok(canvas, '缺少画布铺满规则');
  assert.match(canvas.body, /width:\s*100%/);
});

test('third-party: 适配数量与源码标注一致（5 → 6）', async () => {
  const notices = await readFile(new URL('../THIRD_PARTY_NOTICES.md', import.meta.url), 'utf8');
  assert.match(ENGINE, /共 6 处/, '引擎头部的适配数量应更新');
  assert.match(notices, /共 6 处/, '第三方声明里的适配数量应同步');
  assert.match(notices, /gridOnly/, '第三方声明必须记录新增适配');
});
