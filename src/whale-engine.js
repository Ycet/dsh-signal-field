/**
 * dsh-signal-field · 鲸鱼动画引擎（v0.4.0，从 dsh-ascii-whales 迁移）
 *
 * 版权：本体动画改编自 stackedlol/ascii-sharks（MIT，Copyright (c) 2026 drewdi），
 * 固定上游快照 commit c521e24a787e6d4cc460d4cf2b9815f25e4fe453。
 * 许可全文、保留与适配清单见仓库根目录 THIRD_PARTY_NOTICES.md。
 * 本插件的 MIT 许可不重新许可上游源码，上游署名在此保留。
 *
 * 保留：固定步长引擎、鱼群集群/追逐、柔性脊柱、单元格栅格化、光照、字形浓淡与尾迹扩散。
 *
 * 与本插件不同的适配（共 5 处，均在下方用「[适配 N]」标出）：
 *   1. 整块包进 IIFE 并只导出 WHALE_ENGINE。
 *      原因不是洁癖：src/stage.js 已有顶层 `clamp`，与移植块的 `var clamp` 同处一个闭包会互相覆盖。
 *      IIFE 边界让上游代码可以逐字保留，也免疫将来的一切重名。
 *   2. 丢弃 Kanji 渲染器（Painter / GlyphAtlas / InkRamp / SKIN_POOL 等 582 行不进入产物）
 *      与汉字字库：本插件的字符风格固定 ASCII，不提供切换。
 *   3. 忽略 prefers-reduced-motion：删除 matchMedia 订阅、drawStill() 与全部 reducedMotion 判定。
 *      鲸鱼按配置帧率运行（这是明确的产品决策，不是遗漏）。
 *   4. 帧率上限：frame() 开头按 fpsCap 门控。
 *   5. 指针监听可拆装：interact=false 时不注册 window 级监听。
 *
 * 构建约定：本文件由 scripts/build.mjs 原样拼进 client.js，只允许一个具名导出。
 */

export const WHALE_ENGINE = (() => {
  // [适配 1] 上游整块放进这个 IIFE：src/stage.js 已有顶层 `clamp`，
  // 与移植块的 `var clamp` 同处一个闭包会互相覆盖，故用 IIFE 做边界隔离。
  // ========================================================================
  // 上游移植段开始（stackedlol/ascii-sharks，逐字保留，勿在此段内改动）
  // 对应 dsh-ascii-whales lib/client.js 第 69–1597 行
  //   vendor/ascii-sharks/cells.ts → math.ts → species.ts → world.ts
  //                                → whales.ts → renderer.ts
  // ========================================================================
// vendor/ascii-sharks/cells.ts
function cellSize(scale, square) {
  const cw = Math.max(1, Math.round(8 * scale));
  const ch = Math.round(cw * 1.45);
  const side = Math.max(4, Math.round(Math.sqrt(cw * ch)));
  return square ? [side, side] : [cw, ch];
}

// vendor/ascii-sharks/math.ts
var TAU = Math.PI * 2;
var clamp = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v;
var rand = (lo, hi) => lo + Math.random() * (hi - lo);
var randInt = (lo, hi) => Math.floor(rand(lo, hi + 1));
function smoothstep(e0, e1, x) {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}
function angleDiff(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}
function hash3(x, y, z) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 1442695041);
  h = Math.imul(h ^ h >>> 13, 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
var K1 = 1 / 260;
var K2 = 1 / 310;
var K3 = 1 / 190;
var CURRENT_SCALE = 3400;
function current(x, y, t, out) {
  const a = x * K1 + t * 0.07;
  const b = y * K2 - t * 0.05;
  const c = (x + y) * K3 + t * 0.11;
  out.x = (-K2 * Math.sin(a) * Math.sin(b) + 0.5 * K3 * Math.cos(c)) * CURRENT_SCALE;
  out.y = (-K1 * Math.cos(a) * Math.cos(b) - 0.5 * K3 * Math.cos(c)) * CURRENT_SCALE;
  return out;
}

// vendor/ascii-sharks/species.ts
var SPECIES = [
  {
    name: "sardine",
    cruise: 36,
    maxSpeed: 64,
    minSpeed: 18,
    weight: 3,
    schoolSize: [18, 28],
    spacing: [1.8, 1.1],
    align: 1.6,
    cohesion: 1.6,
    jitter: 40,
    mill: 70,
    verticalDrag: 0.5
  },
  {
    name: "anchovy",
    cruise: 46,
    maxSpeed: 78,
    minSpeed: 22,
    weight: 3,
    schoolSize: [20, 32],
    spacing: [1.5, 1],
    align: 3.2,
    cohesion: 0.45,
    jitter: 30,
    mill: 0,
    verticalDrag: 1.4
  },
  {
    name: "silverside",
    cruise: 40,
    maxSpeed: 70,
    minSpeed: 20,
    weight: 3,
    schoolSize: [12, 20],
    spacing: [2, 1.1],
    align: 2.4,
    cohesion: 1.1,
    jitter: 35,
    mill: 0,
    verticalDrag: 1.6
  },
  {
    name: "mackerel",
    cruise: 32,
    maxSpeed: 60,
    minSpeed: 16,
    weight: 2,
    schoolSize: [5, 9],
    spacing: [2.6, 1.3],
    align: 2,
    cohesion: 0.9,
    jitter: 25,
    mill: 0,
    verticalDrag: 2
  },
  {
    name: "goby",
    cruise: 26,
    maxSpeed: 56,
    minSpeed: 10,
    weight: 1,
    schoolSize: [8, 12],
    spacing: [1.4, 1.1],
    align: 0.35,
    cohesion: 1.4,
    jitter: 110,
    mill: 0,
    verticalDrag: 0.3
  }
];
var TOTAL_WEIGHT = SPECIES.reduce((sum, s) => sum + s.weight, 0);
function pickSpecies() {
  let r = Math.random() * TOTAL_WEIGHT;
  for (let i = 0; i < SPECIES.length; i++) {
    r -= SPECIES[i].weight;
    if (r <= 0) return i;
  }
  return 0;
}

// vendor/ascii-sharks/world.ts
var SHARK_NODES = 20;
var DEFAULT_SHARKS = [
  { kind: "classic", size: 1 },
  { kind: "classic", size: 0.7 },
  { kind: "classic", size: 0.84 },
  { kind: "classic", size: 0.77 }
];
var FISH_SEPARATION_K = 420;
var FISH_ALIGN_K = 1.4;
var FISH_COHESION_K = 1;
var FISH_FLEE_K = 1100;
var BLIND_COS = -0.6;
var World = class {
  /** fishCount overrides the area-based population (the sidebar wants a single small school). */
  constructor(sharkSpecs = DEFAULT_SHARKS, fishCount) {
    this.sharkSpecs = sharkSpecs;
    this.fishCount = fishCount;
  }
  turnAgility = 1;
  tailFrequency = 1;
  width = 0;
  height = 0;
  time = 0;
  fish = [];
  sharks = [];
  events = [];
  pointer = { x: 0, y: 0, active: false };
  /** Fish neighbourhood radius; the spatial hash bucket size matches it. */
  perception = 60;
  /** Per-species personal space in px (x, y). */
  sepX = [];
  sepY = [];
  foreignSep = 40;
  bucketCols = 0;
  bucketRows = 0;
  bucketHead = new Int32Array(0);
  bucketCount = new Uint16Array(0);
  bucketNext = new Int32Array(0);
  lastSpawn = 0;
  tmp = { x: 0, y: 0 };
  resize(width, height, cellW, cellH) {
    const first = this.width === 0;
    this.width = width;
    this.height = height;
    this.sepX = SPECIES.map((sp) => sp.spacing[0] * cellW);
    this.sepY = SPECIES.map((sp) => sp.spacing[1] * cellH);
    this.perception = Math.max(cellH * 3, cellW * 5.5);
    this.foreignSep = cellW * 3;
    if (first || this.fish.length === 0) {
      this.seed();
      return;
    }
    for (const f of this.fish) {
      f.x = clamp(f.x, 0, width);
      f.y = clamp(f.y, 0, height);
    }
  }
  seed() {
    const { width: W, height: H } = this;
    const minSide = Math.min(W, H);
    const baseLength = clamp(minSide * 0.44, 170, 430);
    const sharkCount = this.sharkSpecs.length;
    this.sharks = [];
    for (let i = 0; i < sharkCount; i++) {
      const { kind, size } = this.sharkSpecs[i];
      const length = baseLength * size;
      const orbitRadius = minSide * rand(0.28, 0.4);
      const a = i / sharkCount * TAU + rand(-0.4, 0.4);
      const orbitDir = i % 2 === 0 ? 1 : -1;
      const x = W / 2 + Math.cos(a) * orbitRadius * (W / minSide) * 0.9;
      const y = H / 2 + Math.sin(a) * orbitRadius;
      const heading = a + orbitDir * Math.PI / 2;
      const nodes = new Float32Array(SHARK_NODES * 2);
      const seg = length / (SHARK_NODES - 1);
      for (let n = 0; n < SHARK_NODES; n++) {
        nodes[n * 2] = x - Math.cos(heading) * seg * n;
        nodes[n * 2 + 1] = y - Math.sin(heading) * seg * n;
      }
      this.sharks.push({
        id: i + 1,
        kind,
        length,
        nodes,
        heading,
        speed: 30,
        phase: rand(0, TAU),
        turn: 0,
        hunger: rand(0.25, 0.75),
        wander: 0,
        orbitDir,
        orbitRadius,
        target: null,
        retargetAt: 0,
        depth: size
      });
    }
    this.sharks.sort((a, b) => a.length - b.length);
    const total = this.fishCount ?? clamp(Math.round(W * H / 4400), 85, 340);
    this.fish = [];
    while (this.fish.length < total) {
      const species = pickSpecies();
      const sp = SPECIES[species];
      const size = Math.min(randInt(sp.schoolSize[0], sp.schoolSize[1]), total - this.fish.length);
      const millDir = Math.random() < 0.5 ? 1 : -1;
      const cx = rand(W * 0.06, W * 0.94);
      const cy = rand(H * 0.08, H * 0.92);
      const dir = (Math.random() < 0.5 ? 0 : Math.PI) + rand(-0.5, 0.5);
      for (let k = 0; k < size; k++) {
        this.fish.push({
          x: cx + rand(-1, 1) * this.sepX[species] * Math.sqrt(size),
          y: cy + rand(-1, 1) * this.sepY[species] * Math.sqrt(size) * 0.6,
          vx: Math.cos(dir) * sp.cruise,
          vy: Math.sin(dir) * sp.cruise,
          species,
          alarm: 0,
          alive: true,
          respawnAt: 0,
          phase: rand(0, TAU),
          turn: 0,
          depth: rand(0.55, 1),
          millDir
        });
      }
    }
    this.bucketNext = new Int32Array(this.fish.length);
  }
  splash(x, y) {
    this.events.push({ kind: "splash", x, y });
    const r = 240;
    for (const f of this.fish) {
      if (!f.alive) continue;
      const dx = f.x - x;
      const dy = f.y - y;
      const d = Math.hypot(dx, dy);
      if (d > r || d < 1e-3) continue;
      const k = (1 - d / r) * 260;
      f.vx += dx / d * k;
      f.vy += dy / d * k;
      f.alarm = 1;
    }
  }
  step(dt, beatDt = dt) {
    this.time += dt;
    this.rebuildHash();
    this.stepFish(dt);
    this.stepSharks(dt, beatDt);
    this.respawn();
  }
  rebuildHash() {
    const size = this.perception;
    const pad = 2;
    this.bucketCols = Math.ceil(this.width / size) + pad * 2;
    this.bucketRows = Math.ceil(this.height / size) + pad * 2;
    const n = this.bucketCols * this.bucketRows;
    if (this.bucketHead.length !== n) {
      this.bucketHead = new Int32Array(n);
      this.bucketCount = new Uint16Array(n);
    }
    this.bucketHead.fill(-1);
    this.bucketCount.fill(0);
    if (this.bucketNext.length !== this.fish.length) {
      this.bucketNext = new Int32Array(this.fish.length);
    }
    for (let i = 0; i < this.fish.length; i++) {
      const f = this.fish[i];
      if (!f.alive) continue;
      const b = this.bucketOf(f.x, f.y);
      this.bucketNext[i] = this.bucketHead[b];
      this.bucketHead[b] = i;
      this.bucketCount[b]++;
    }
  }
  bucketOf(x, y) {
    const size = this.perception;
    const c = clamp(Math.floor(x / size) + 2, 0, this.bucketCols - 1);
    const r = clamp(Math.floor(y / size) + 2, 0, this.bucketRows - 1);
    return r * this.bucketCols + c;
  }
  stepFish(dt) {
    const { fish, sharks, pointer, width: W, height: H, time } = this;
    const R = this.perception;
    const R2 = R * R;
    const foreignSep = this.foreignSep;
    const size = this.perception;
    const cols = this.bucketCols;
    const rows = this.bucketRows;
    const head = this.bucketHead;
    const next = this.bucketNext;
    const cur = this.tmp;
    const calmDecay = Math.exp(-dt * 0.7);
    const contagion = Math.min(1, dt * 6);
    for (let i = 0; i < fish.length; i++) {
      const f = fish[i];
      if (!f.alive) continue;
      const sp = SPECIES[f.species];
      const spread = 1 + 1.8 * f.alarm;
      const sepX = this.sepX[f.species] * spread;
      const sepY = this.sepY[f.species] * spread;
      const speed = Math.hypot(f.vx, f.vy) || 1;
      const hx = f.vx / speed;
      const hy = f.vy / speed;
      let ax = 0;
      let ay = 0;
      let sx = 0;
      let sy = 0;
      let avx = 0;
      let avy = 0;
      let cx = 0;
      let cy = 0;
      let n = 0;
      let neighbourAlarm = 0;
      const bc = clamp(Math.floor(f.x / size) + 2, 0, cols - 1);
      const br = clamp(Math.floor(f.y / size) + 2, 0, rows - 1);
      for (let r = Math.max(0, br - 1); r <= Math.min(rows - 1, br + 1); r++) {
        for (let c = Math.max(0, bc - 1); c <= Math.min(cols - 1, bc + 1); c++) {
          let j = head[r * cols + c];
          while (j !== -1) {
            if (j !== i) {
              const o = fish[j];
              const dx = o.x - f.x;
              const dy = o.y - f.y;
              const d2 = dx * dx + dy * dy;
              if (d2 < R2 && d2 > 1e-6) {
                const d = Math.sqrt(d2);
                if ((dx * hx + dy * hy) / d > BLIND_COS) {
                  const qx = dx / sepX;
                  const qy = dy / sepY;
                  const q2 = qx * qx + qy * qy;
                  if (q2 < 1) {
                    const q = Math.sqrt(q2) || 1e-3;
                    const k = (1 - q) / q;
                    sx -= qx * k;
                    sy -= qy * k;
                  }
                  if (o.species === f.species) {
                    avx += o.vx;
                    avy += o.vy;
                    cx += dx;
                    cy += dy;
                    n++;
                  } else if (d < foreignSep) {
                    const k = (1 - d / foreignSep) / d * 0.6;
                    sx -= dx * k;
                    sy -= dy * k;
                  }
                  if (o.alarm > neighbourAlarm) neighbourAlarm = o.alarm;
                }
              }
            }
            j = next[j];
          }
        }
      }
      ax += sx * FISH_SEPARATION_K;
      ay += sy * FISH_SEPARATION_K;
      if (n > 0) {
        const alignK = FISH_ALIGN_K * sp.align;
        const cohesionK = FISH_COHESION_K * sp.cohesion * (1 - 0.8 * f.alarm);
        ax += (avx / n - f.vx) * alignK + cx / n * cohesionK;
        ay += (avy / n - f.vy) * alignK + cy / n * cohesionK;
        if (sp.mill > 0) {
          const cl = Math.hypot(cx, cy) || 1;
          ax += -cy / cl * f.millDir * sp.mill * (1 - f.alarm);
          ay += cx / cl * f.millDir * sp.mill * (1 - f.alarm);
        }
      }
      let fear = 0;
      for (const sh of sharks) {
        const fearR = sh.length * 0.6 + 60;
        let best = Infinity;
        let bx = 0;
        let by = 0;
        for (let k = 0; k <= 12; k += 3) {
          const nx = sh.nodes[k * 2];
          const ny = sh.nodes[k * 2 + 1];
          const d2 = (f.x - nx) ** 2 + (f.y - ny) ** 2;
          if (d2 < best) {
            best = d2;
            bx = nx;
            by = ny;
          }
        }
        const d = Math.sqrt(best);
        if (d >= fearR || d < 1e-3) continue;
        let w = 1 - d / fearR;
        w *= w;
        const awayX = (f.x - bx) / d;
        const awayY = (f.y - by) / d;
        const shx = Math.cos(sh.heading);
        const shy = Math.sin(sh.heading);
        const side = shx * (f.y - sh.nodes[1]) - shy * (f.x - sh.nodes[0]) >= 0 ? 1 : -1;
        ax += (awayX * 0.7 - shy * side * 0.9) * FISH_FLEE_K * w;
        ay += (awayY * 0.7 + shx * side * 0.9) * FISH_FLEE_K * w;
        fear = Math.max(fear, Math.sqrt(w));
      }
      if (pointer.active) {
        const pr = 130;
        const dx = f.x - pointer.x;
        const dy = f.y - pointer.y;
        const d = Math.hypot(dx, dy);
        if (d < pr && d > 1e-3) {
          const w = (1 - d / pr) ** 2;
          ax += dx / d * FISH_FLEE_K * w;
          ay += dy / d * FISH_FLEE_K * w;
          fear = Math.max(fear, Math.sqrt(w) * 0.8);
        }
      }
      let alarm = Math.max(f.alarm * calmDecay, fear);
      const relayed = neighbourAlarm * 0.86;
      if (relayed > alarm) alarm += (relayed - alarm) * contagion;
      f.alarm = alarm;
      const m = 36;
      if (f.x < m) ax += (m - f.x) * 7;
      else if (f.x > W - m) ax -= (f.x - (W - m)) * 7;
      if (f.y < m) ay += (m - f.y) * 7;
      else if (f.y > H - m) ay -= (f.y - (H - m)) * 7;
      current(f.x, f.y, time, cur);
      ax += cur.x * 0.5 + (Math.random() - 0.5) * sp.jitter;
      ay += cur.y * 0.5 + (Math.random() - 0.5) * sp.jitter;
      ay -= f.vy * sp.verticalDrag * (1 - 0.7 * f.alarm);
      const preferred = sp.cruise * (1 + 1.3 * f.alarm);
      ax += (preferred - speed) * hx * 1.6;
      ay += (preferred - speed) * hy * 1.6;
      const before = Math.atan2(f.vy, f.vx);
      f.vx += ax * dt;
      f.vy += ay * dt;
      const maxSpeed = sp.maxSpeed * (1 + 1.8 * f.alarm);
      const s = Math.hypot(f.vx, f.vy);
      if (s > maxSpeed) {
        f.vx *= maxSpeed / s;
        f.vy *= maxSpeed / s;
      } else if (s < sp.minSpeed && s > 1e-3) {
        f.vx *= sp.minSpeed / s;
        f.vy *= sp.minSpeed / s;
      }
      f.turn += (angleDiff(before, Math.atan2(f.vy, f.vx)) / dt - f.turn) * Math.min(1, dt * 8);
      f.phase += dt * (7 + Math.hypot(f.vx, f.vy) * 0.12);
      f.x = clamp(f.x + f.vx * dt, -60, W + 60);
      f.y = clamp(f.y + f.vy * dt, -60, H + 60);
    }
  }
  stepSharks(dt, beatDt) {
    const { sharks, width: W, height: H, time } = this;
    const minSide = Math.min(W, H);
    const cxW = W / 2;
    const cyW = H / 2;
    for (const sh of sharks) {
      const L = sh.length;
      const nodes = sh.nodes;
      const hx = nodes[0];
      const hy = nodes[1];
      sh.hunger = Math.min(1, sh.hunger + dt * 0.03);
      let dx = Math.cos(sh.heading);
      let dy = Math.sin(sh.heading);
      sh.wander = clamp(sh.wander + (Math.random() - 0.5) * dt * 3.2, -1.1, 1.1);
      dx += Math.cos(sh.heading + sh.wander) * 0.45;
      dy += Math.sin(sh.heading + sh.wander) * 0.45;
      if (time >= sh.retargetAt) {
        sh.target = this.findPrey(sh);
        sh.retargetAt = time + 0.45;
      }
      const t = sh.target;
      let hunting = false;
      let closing = 0;
      if (t && t.alive && sh.hunger > 0.3) {
        const tx = t.x + t.vx * 0.35 - hx;
        const ty = t.y + t.vy * 0.35 - hy;
        const d = Math.hypot(tx, ty) || 1;
        const w = 1.4 + 2.6 * sh.hunger;
        dx += tx / d * w;
        dy += ty / d * w;
        hunting = true;
        closing = clamp(1 - d / (L * 0.9), 0, 1);
      } else {
        const rx = (hx - cxW) / (W / minSide);
        const ry = hy - cyW;
        const r = Math.hypot(rx, ry) || 1;
        const radius = sh.orbitRadius * (1 + 0.15 * Math.sin(time * 0.05 + sh.id));
        const radial = clamp((radius - r) / radius, -1, 1);
        dx += (-ry / r * sh.orbitDir + rx / r * radial * 0.9) * 0.55;
        dy += (rx / r * sh.orbitDir + ry / r * radial * 0.9) * 0.55;
      }
      for (const other of sharks) {
        if (other === sh) continue;
        for (let k = 0; k < SHARK_NODES; k += 4) {
          const ox = hx - other.nodes[k * 2];
          const oy = hy - other.nodes[k * 2 + 1];
          const d = Math.hypot(ox, oy);
          const range = (L + other.length) * 0.45;
          if (d < range && d > 1e-3) {
            const w = (1 - d / range) * 3;
            dx += ox / d * w;
            dy += oy / d * w;
          }
        }
      }
      const ex = (hx - cxW) / (W * 0.3);
      const ey = (hy - cyW) / (H * 0.16);
      const e2 = ex * ex + ey * ey;
      if (e2 < 1) {
        const e = Math.sqrt(e2) || 1e-3;
        const w = (1 - e) * (hunting ? 1 : 2.5);
        dx += ex / e * w;
        dy += ey / e * w;
      }
      const over = Math.max(-hx, hx - W, -hy, hy - H);
      if (over > -L * 0.05) {
        const w = clamp((over + L * 0.05) / (L * 0.35), 0, 1) * 3.5;
        const toX = cxW - hx;
        const toY = cyW - hy;
        const d = Math.hypot(toX, toY) || 1;
        dx += toX / d * w;
        dy += toY / d * w;
      }
      const desired = Math.atan2(dy, dx);
      const agility = Math.min(hunting ? 1.7 + closing : 0.8, sh.speed / (L * 0.22));
      const maxTurn = agility * this.turnAgility * dt;
      const turned = clamp(angleDiff(sh.heading, desired), -maxTurn, maxTurn);
      sh.heading += turned;
      sh.turn += (turned / dt - sh.turn) * Math.min(1, dt * 3);
      const cruise = 30 + L * 0.04;
      const targetSpeed = hunting ? cruise * (1.45 + closing * 1.5) : cruise;
      sh.speed += (targetSpeed - sh.speed) * Math.min(1, dt * 1.1);
      sh.phase += beatDt * this.tailFrequency * (2 + (30 + L * 0.04) / 24);
      nodes[0] += Math.cos(sh.heading) * sh.speed * dt;
      nodes[1] += Math.sin(sh.heading) * sh.speed * dt;
      const seg = L / (SHARK_NODES - 1);
      const maxBend = 0.16 * this.turnAgility;
      let prevAngle = sh.heading + Math.PI;
      for (let k = 1; k < SHARK_NODES; k++) {
        const px = nodes[(k - 1) * 2];
        const py = nodes[(k - 1) * 2 + 1];
        let angle = Math.atan2(nodes[k * 2 + 1] - py, nodes[k * 2] - px);
        angle = prevAngle + clamp(angleDiff(prevAngle, angle), -maxBend, maxBend);
        nodes[k * 2] = px + Math.cos(angle) * seg;
        nodes[k * 2 + 1] = py + Math.sin(angle) * seg;
        prevAngle = angle;
      }
      if (sh.hunger > 0.15) {
        const mouthR = L * 0.05 + 8;
        const mx = nodes[0];
        const my = nodes[1];
        for (const f of this.fish) {
          if (!f.alive) continue;
          if ((f.x - mx) ** 2 + (f.y - my) ** 2 < mouthR * mouthR) {
            f.alive = false;
            f.respawnAt = time + rand(3, 8);
            sh.hunger = Math.max(0, sh.hunger - 0.16);
            this.events.push({ kind: "eat", x: f.x, y: f.y });
          }
        }
      }
    }
  }
  /**
   * Pick prey in the shark's forward cone, preferring close fish in sparse
   * buckets (stragglers) over fish buried in a dense school.
   */
  findPrey(sh) {
    const range = sh.length * 0.9 + 160;
    const hx = sh.nodes[0];
    const hy = sh.nodes[1];
    const fx = Math.cos(sh.heading);
    const fy = Math.sin(sh.heading);
    let best = null;
    let bestScore = Infinity;
    let currentScore = Infinity;
    for (const f of this.fish) {
      if (!f.alive) continue;
      const dx = f.x - hx;
      const dy = f.y - hy;
      const d = Math.hypot(dx, dy);
      if (d > range || d < 1e-3) continue;
      const cos = (dx * fx + dy * fy) / d;
      if (cos < 0.2) continue;
      const crowd = this.bucketCount[this.bucketOf(f.x, f.y)];
      const score = d * (1 + (1 - cos) * 0.8) * (1 + crowd * 0.07);
      if (score < bestScore) {
        bestScore = score;
        best = f;
      }
      if (f === sh.target) currentScore = score;
    }
    if (sh.target && currentScore < bestScore * 1.3) return sh.target;
    return best;
  }
  respawn() {
    const { time, width: W, height: H } = this;
    const due = [];
    for (const f of this.fish) if (!f.alive && f.respawnAt <= time) due.push(f);
    if (due.length === 0) return;
    if (due.length < 6 && time - this.lastSpawn < 9) return;
    this.lastSpawn = time;
    const side = randInt(0, 3);
    const along = rand(0.15, 0.85);
    const x = side === 0 ? -20 : side === 1 ? W + 20 : along * W;
    const y = side === 2 ? -20 : side === 3 ? H + 20 : along * H;
    const inward = Math.atan2(H / 2 - y, W / 2 - x) + rand(-0.5, 0.5);
    const species = pickSpecies();
    const sp = SPECIES[species];
    const millDir = Math.random() < 0.5 ? 1 : -1;
    for (const f of due.slice(0, sp.schoolSize[1])) {
      f.alive = true;
      f.species = species;
      f.alarm = 0;
      f.turn = 0;
      f.millDir = millDir;
      f.x = x + rand(-1, 1) * this.perception;
      f.y = y + rand(-1, 1) * this.perception;
      f.vx = Math.cos(inward) * sp.cruise * 1.4;
      f.vy = Math.sin(inward) * sp.cruise * 1.4;
    }
  }
};

// vendor/ascii-sharks/whales.ts
var humpback = {
  halfWidth: (s) => {
    if (s < 0.12) return 0.115 * Math.pow(Math.sin(s / 0.12 * Math.PI / 2), 0.45);
    if (s < 0.35) return 0.115 + 0.02 * Math.sin((s - 0.12) / 0.23 * Math.PI);
    if (s < 0.87) return 0.018 + 0.097 * Math.pow(1 - (s - 0.35) / 0.52, 1.1);
    return 0.018 * (1 - (s - 0.87) / 0.13);
  },
  pectoral: [0.25, 0.36, 0.41, 0.32],
  falcate: false,
  pelvic: [0, 0, 0, 0],
  caudal: 0.22,
  dorsal: [0.6, 0.65],
  secondDorsal: [0, 0],
  eye: [0.1, 0.13],
  gills: [0, 0],
  tint: [0.45, 0.65, 1.3]
};
var orca = {
  ...humpback,
  halfWidth: (s) => {
    if (s < 0.14) return 0.15 * Math.pow(Math.sin(s / 0.14 * Math.PI / 2), 0.35);
    if (s < 0.38) return 0.15 + 0.012 * Math.sin((s - 0.14) / 0.24 * Math.PI);
    if (s < 0.88) return 0.018 + 0.132 * Math.pow(1 - (s - 0.38) / 0.5, 1.3);
    return 0.018 * (1 - (s - 0.88) / 0.12);
  },
  pectoral: [0.25, 0.47, 0.43, 0.23],
  dorsal: [0.43, 0.55]
};
function orcaPatch(s, across) {
  return ((s - 0.205) / 0.067) ** 2 + ((across - 0.75) / 0.22) ** 2 < 1 || ((s - 0.68) / 0.12) ** 2 + ((across - 0.88) / 0.26) ** 2 < 1;
}
function orcaFlipper(s, distance, reach) {
  const t = distance / reach;
  return t >= 0 && t <= 1 && ((s - (0.31 + 0.1 * t)) / 0.085) ** 2 + ((t - 0.48) / 0.52) ** 2 <= 1;
}
function humpbackFlipper(s, distance, reach) {
  const t = distance / reach;
  if (t < 0 || t > 1) return false;
  const center = 0.29 + 0.12 * t - 0.04 * Math.sin(Math.PI * t);
  const root = 1 - 0.2 * Math.exp(-(((t - 0.43) / 0.14) ** 2));
  const width = 0.05 * (1 - 0.5 * t) * Math.sqrt(1 - t ** 6) * root;
  return Math.abs(s - center) <= width;
}
function whaleFlukes(s, across) {
  const t = across / 0.22;
  if (t < 0 || t > 1) return false;
  const front = 0.86 + 0.12 * t ** 1.7;
  const back = 0.945 + 0.035 * t + 0.028 * Math.sin(Math.PI * t);
  return s >= front && s <= back;
}

// vendor/ascii-sharks/renderer.ts
var ALPHA_LEVELS = 6;
var FISH_ALPHAS = [0.28, 0.42, 0.58, 0.74, 0.9];
var DOT_RGB = [
  [77, 107, 254],
  [65, 91, 218],
  [110, 148, 255],
  [160, 186, 255],
  [88, 141, 255]
];
var DOT_BASE_ALPHA = [1, 1, 1, 1, 1];
var WAKE = DOT_RGB.length - 1;
var COLORFUL_ACCENTS = ["#e0892c", "#e03a32", "#b44ae0", "#33c8cc", "#3cb54a", "#3150e8", "#d9c14a"];
var GLYPHS = {
  ascii: { skin: ":;t%SX8#@", fin: "%;tS:", ridge: "@8%", edgeHeavy: ":;", edgeLight: ".',`", mark: "#%@", eye: "o", fish: "-" },
  hanzi: { skin: "\u6C34\u5DDD\u6C50\u6C99\u6D6A\u6D77\u6F6E\u9CB8\u6DF1", fin: "\u9CCD", ridge: "\u9CCD", edgeHeavy: "\u4E3F\u4E28", edgeLight: "\u4E36\u4E00", mark: "\u9CB8\u6D77\u6F6E", eye: "\u76EE", fish: "\u9C7C\u9CA4\u9CAD\u9CB1" }
};
var FLAG_BODY = 1;
var FLAG_EDGE = 2;
var FLAG_FIN = 3;
var FLAG_RIDGE = 4;
var FLAG_EYE = 5;
var FLAG_MARK = 6;
var FLAG_WHITE = 7;
var SUBSAMPLES = [0.25, 0.3, 0.75, 0.3, 0.25, 0.72, 0.75, 0.72];
function classicHalfWidth(s) {
  if (s < 0.13) return 0.09 * Math.pow(Math.sin(s / 0.13 * Math.PI / 2), 0.95);
  if (s < 0.3) return 0.09 + 0.016 * smoothstep(0.13, 0.3, s);
  if (s < 0.84) return 0.019 + 0.087 * Math.pow(1 - (s - 0.3) / 0.54, 1.25);
  const k = (s - 0.84) / 0.16;
  return 0.019 * (1 - k) + 0.012 * Math.sin(k * Math.PI);
}
var SHAPES = {
  // DSH adaptation: rounded whale head, broad back, long flippers and paired tail flukes.
  whale: humpback,
  orca,
  classic: {
    halfWidth: classicHalfWidth,
    pectoral: [0.15, 0.43, 0.55, 0.26],
    falcate: true,
    pelvic: [0.57, 0.65, 0.69, 0.085],
    caudal: 0.085,
    dorsal: [0.33, 0.47],
    secondDorsal: [0.71, 0.76],
    eye: [0.1, 0.14],
    gills: [0.19, 0.29],
    tint: [0.92, 0.97, 1.05]
  },
  // Slim neck under a wide, swept-back cephalofoil (drawn in sampleShark),
  // tall first dorsal, long upper tail lobe. Bronze-olive grey.
  hammerhead: {
    halfWidth: (s) => {
      if (s < 0.06) return 0.045;
      if (s < 0.3) return 0.045 + 0.061 * smoothstep(0.06, 0.3, s);
      return classicHalfWidth(s) * 0.92;
    },
    head: { span: 0.17, sweep: 0.035, depth: 0.09, notch: 0 },
    pectoral: [0.17, 0.4, 0.5, 0.22],
    falcate: true,
    pelvic: [0.56, 0.63, 0.67, 0.075],
    caudal: 0.11,
    dorsal: [0.28, 0.44],
    secondDorsal: [0.7, 0.74],
    eye: null,
    gills: [0.16, 0.26],
    tint: [0.96, 0.98, 0.9]
  },
  // Blunt, square snout on a heavy body; barred back. Warm grey-brown.
  tiger: {
    halfWidth: (s) => {
      if (s < 0.13) return 0.1 * Math.pow(Math.sin(s / 0.13 * Math.PI / 2), 0.45);
      if (s < 0.3) return 0.1 + 0.014 * smoothstep(0.13, 0.3, s);
      if (s < 0.84) return 0.019 + 0.095 * Math.pow(1 - (s - 0.3) / 0.54, 1.2);
      const k = (s - 0.84) / 0.16;
      return 0.019 * (1 - k) + 0.012 * Math.sin(k * Math.PI);
    },
    pectoral: [0.15, 0.42, 0.53, 0.25],
    falcate: true,
    pelvic: [0.57, 0.65, 0.69, 0.085],
    caudal: 0.095,
    dorsal: [0.33, 0.46],
    secondDorsal: [0.71, 0.75],
    eye: [0.08, 0.12],
    gills: [0.19, 0.28],
    tint: [1.02, 0.95, 0.84]
  },
  // Short rounded head, body done by half-length, then a long ribbon of a
  // tail fin. Broad rounded pectorals, spotted sandy skin.
  zebra: {
    halfWidth: (s) => {
      if (s < 0.1) return 0.075 * Math.pow(Math.sin(s / 0.1 * Math.PI / 2), 0.7);
      if (s < 0.28) return 0.075 + 0.025 * smoothstep(0.1, 0.28, s);
      if (s < 0.55) return 0.022 + 0.078 * Math.pow(1 - (s - 0.28) / 0.27, 1.1);
      const k = (s - 0.55) / 0.45;
      return 0.022 * (1 - k * k) + 0.012 * Math.sin(k * Math.PI);
    },
    pectoral: [0.12, 0.3, 0.36, 0.19],
    falcate: false,
    pelvic: [0.42, 0.48, 0.51, 0.065],
    caudal: 0,
    dorsal: [0.36, 0.44],
    secondDorsal: [0.49, 0.53],
    eye: [0.06, 0.09],
    gills: [0.13, 0.2],
    tint: [1.08, 0.97, 0.74]
  },
  // Great hammerhead: a broader, nearly straight-edged cephalofoil with a notch at the centre,
  // a towering sickle first dorsal (drawn long and bright from above), and a cooler slate skin.
  greathammer: {
    halfWidth: (s) => {
      if (s < 0.05) return 0.04;
      if (s < 0.3) return 0.04 + 0.07 * smoothstep(0.05, 0.3, s);
      return classicHalfWidth(s) * 0.95;
    },
    head: { span: 0.21, sweep: 6e-3, depth: 0.085, notch: 0.014 },
    pectoral: [0.16, 0.38, 0.49, 0.24],
    falcate: true,
    pelvic: [0.55, 0.62, 0.67, 0.085],
    caudal: 0.13,
    dorsal: [0.24, 0.45],
    secondDorsal: [0.68, 0.74],
    eye: null,
    gills: [0.15, 0.25],
    tint: [0.86, 0.93, 1.02]
  },
  // Shortfin mako: a long conical snout, a torpedo body that narrows hard to the tail stalk,
  // and a tall crescent tail. Metallic indigo back.
  mako: {
    halfWidth: (s) => {
      if (s < 0.17) return 0.088 * Math.pow(Math.sin(s / 0.17 * Math.PI / 2), 1.5);
      if (s < 0.32) return 0.088 + 0.012 * smoothstep(0.17, 0.32, s);
      if (s < 0.86) return 0.014 + 0.086 * Math.pow(1 - (s - 0.32) / 0.54, 1.45);
      const k = (s - 0.86) / 0.14;
      return 0.014 * (1 - k) + 0.01 * Math.sin(k * Math.PI);
    },
    pectoral: [0.18, 0.4, 0.5, 0.21],
    falcate: true,
    pelvic: [0.58, 0.64, 0.68, 0.06],
    caudal: 0.13,
    dorsal: [0.34, 0.45],
    secondDorsal: [0.76, 0.79],
    eye: [0.11, 0.15],
    gills: [0.2, 0.3],
    tint: [0.78, 0.9, 1.2]
  },
  // Thresher: a compact body over the front half, then the upper tail lobe as a long whip
  // that's as long as the shark itself. Big eyes, long sickle pectorals, bronze-violet skin.
  thresher: {
    halfWidth: (s) => {
      if (s < 0.08) return 0.07 * Math.pow(Math.sin(s / 0.08 * Math.PI / 2), 0.75);
      if (s < 0.2) return 0.07 + 0.02 * smoothstep(0.08, 0.2, s);
      if (s < 0.48) return 0.012 + 0.078 * Math.pow(1 - (s - 0.2) / 0.28, 1.3);
      const k = (s - 0.48) / 0.52;
      return 0.012 * (1 - k) + 6e-3 * Math.sin(k * Math.PI * 0.9) + 2e-3;
    },
    pectoral: [0.12, 0.27, 0.36, 0.2],
    falcate: true,
    pelvic: [0.37, 0.41, 0.44, 0.045],
    caudal: 0,
    dorsal: [0.24, 0.32],
    secondDorsal: [0.45, 0.47],
    eye: [0.05, 0.1],
    gills: [0.11, 0.18],
    tint: [1, 0.9, 1.08]
  },
  // Nurse shark: a blunt, broad head, a heavy flattened body with both dorsals set far back,
  // rounded paddle pectorals, and a long low tail with no lower lobe. Tawny brown.
  nurse: {
    halfWidth: (s) => {
      if (s < 0.08) return 0.085 * Math.pow(Math.sin(s / 0.08 * Math.PI / 2), 0.4);
      if (s < 0.3) return 0.085 + 0.02 * smoothstep(0.08, 0.3, s);
      if (s < 0.72) return 0.022 + 0.083 * Math.pow(1 - (s - 0.3) / 0.42, 1.1);
      const k = (s - 0.72) / 0.28;
      return 0.022 * (1 - k * k) + 0.014 * Math.sin(k * Math.PI);
    },
    pectoral: [0.16, 0.34, 0.4, 0.17],
    falcate: false,
    pelvic: [0.45, 0.52, 0.55, 0.075],
    caudal: 0,
    dorsal: [0.5, 0.58],
    secondDorsal: [0.63, 0.69],
    eye: [0.05, 0.075],
    gills: [0.14, 0.22],
    tint: [1.1, 0.96, 0.76]
  }
};
var KINDS = Object.keys(SHAPES);
function inTriangle(px, py, ax, ay, bx, by, cx, cy) {
  const d1 = (px - bx) * (ay - by) - (ax - bx) * (py - by);
  const d2 = (px - cx) * (by - cy) - (bx - cx) * (py - cy);
  const d3 = (px - ax) * (cy - ay) - (cx - ax) * (py - ay);
  const neg = d1 < 0 || d2 < 0 || d3 < 0;
  const pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
}
function paintGrid(g, W, H, cw, ch, dpr, dark = true, opacity = 0.05) {
  if (opacity === 0) return;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.strokeStyle = dark ? `rgba(140,165,255,${opacity})` : `rgba(77,107,254,${opacity})`;
  g.lineWidth = 1;
  g.beginPath();
  for (let c = 0; c <= Math.ceil(W / cw); c++) {
    const x = Math.round(c * cw * dpr) + 0.5;
    g.moveTo(x, 0);
    g.lineTo(x, H * dpr);
  }
  for (let r = 0; r <= Math.ceil(H / ch); r++) {
    const y = Math.round(r * ch * dpr) + 0.5;
    g.moveTo(0, y);
    g.lineTo(W * dpr, y);
  }
  g.stroke();
}
var AsciiRenderer = class {
  constructor(canvas, dark = false, gridScale = 1, gridOpacity = 0.05, wake = 1, glyphMode = "ascii") {
    this.canvas = canvas;
    this.dark = dark;
    this.gridScale = gridScale;
    this.gridOpacity = gridOpacity;
    this.wake = wake;
    this.glyphMode = glyphMode;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) throw new Error("2D canvas unavailable");
    this.ctx = ctx;
    this.bg = document.createElement("canvas");
    this.setTheme(dark);
  }
  bodySwing = 1;
  ctx;
  bg;
  dpr = 1;
  width = 0;
  height = 0;
  cw = 12;
  ch = 18;
  cols = 0;
  rows = 0;
  fontFamily = "ui-monospace, Menlo, monospace";
  rgb = [77, 107, 254];
  eyeColor = "";
  accents = [];
  dotKind = new Uint8Array(0);
  // 0 none, 1 blue, 2 green, 3 red, 4 pale
  dotPhase = new Float32Array(0);
  dotFreq = new Float32Array(0);
  energy = new Float32Array(0);
  energyTmp = new Float32Array(0);
  heat = new Float32Array(0);
  bucketOf = new Uint8Array(0);
  bucketOrder = new Int32Array(0);
  bucketCounts = new Int32Array(DOT_RGB.length * ALPHA_LEVELS + 1);
  dotStyles = [];
  sharkFlag = new Uint8Array(0);
  sharkShade = new Float32Array(0);
  sharkKey = new Uint32Array(0);
  sharkDepth = new Float32Array(0);
  sharkKind = new Uint8Array(0);
  sharkGlyph = new Uint16Array(0);
  /** Cells darkened by a shark's shadow on the seabed. */
  sharkShadow = new Uint8Array(0);
  spine = new Float32Array(SHARK_NODES * 2);
  arc = new Float32Array(SHARK_NODES);
  arcTotal = 1;
  shape = SHAPES.classic;
  sharkId = 0;
  finTipLeft = 0;
  finTipRight = 0;
  // Scratch outputs of sampleShark(), to avoid allocating per sample.
  hitFlag = 0;
  hitShade = 0;
  hitS = 0;
  hitV = 0;
  hitDist = 0;
  /** Cells holding a fish this frame (frame stamp); dots skip them. */
  fishStamp = new Uint32Array(0);
  frameId = 0;
  /** Fish cells bucketed by brightness, so each bucket is one fillStyle. */
  fishBuckets = FISH_ALPHAS.map(() => []);
  fishStyles = FISH_ALPHAS.map((a) => `rgba(230,238,255,${a})`);
  get cellWidth() {
    return this.cw;
  }
  get cellHeight() {
    return this.ch;
  }
  setFontFamily(family) {
    if (family) this.fontFamily = family;
  }
  setTheme(dark, gridOpacity = this.gridOpacity, wake = this.wake, color, colorfulShimmer = false, eyeColor = "primary") {
    this.dark = dark;
    this.gridOpacity = gridOpacity;
    this.wake = wake;
    if (color) this.rgb = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16));
    this.eyeColor = eyeColor === "primary" ? "" : eyeColor === "black" ? "#000000" : "#ffffff";
    const fish = this.rgb.map((c) => Math.round(dark ? c * 0.6 + 102 : c * 0.7));
    this.fishStyles = FISH_ALPHAS.map((a) => `rgba(${fish.join(",")},${a})`);
    this.accents = colorfulShimmer ? COLORFUL_ACCENTS : [0, 0.2, 0.6, -0.1, 0.35, -0.2, 0.5].map((lift) => `rgb(${this.rgb.map((c) => Math.round(lift >= 0 ? c + (255 - c) * lift : c * (1 + lift))).join(",")})`);
    this.dotStyles = [];
    for (let c = 0; c < DOT_RGB.length; c++) for (let l = 0; l < ALPHA_LEVELS; l++) {
      const a = DOT_BASE_ALPHA[c] * (l + 1) / ALPHA_LEVELS;
      this.dotStyles.push(`rgba(${fish.join(",")},${a.toFixed(3)})`);
    }
    this.paintBackground();
  }
  bodyColor(level) {
    const light = clamp((level - 120) / (level < 120 ? 120 : 135), -1, 1);
    return `rgb(${this.rgb.map((c) => Math.round(light < 0 ? c * (1 + light) : c + (255 - c) * light)).join(",")})`;
  }
  resize(width, height, dpr) {
    this.width = width;
    this.height = height;
    this.dpr = dpr;
    [this.cw, this.ch] = cellSize(this.gridScale, this.glyphMode === "hanzi");
    this.cols = Math.ceil(width / this.cw);
    this.rows = Math.ceil(height / this.ch);
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    this.bg.width = this.canvas.width;
    this.bg.height = this.canvas.height;
    const n = this.cols * this.rows;
    this.dotKind = new Uint8Array(n);
    this.dotPhase = new Float32Array(n);
    this.dotFreq = new Float32Array(n);
    this.energy = new Float32Array(n);
    this.energyTmp = new Float32Array(n);
    this.heat = new Float32Array(n);
    this.bucketOf = new Uint8Array(n);
    this.bucketOrder = new Int32Array(n);
    this.sharkFlag = new Uint8Array(n);
    this.sharkShade = new Float32Array(n);
    this.sharkKey = new Uint32Array(n);
    this.sharkDepth = new Float32Array(n);
    this.sharkKind = new Uint8Array(n);
    this.sharkGlyph = new Uint16Array(n);
    this.sharkShadow = new Uint8Array(n);
    this.fishStamp = new Uint32Array(n);
    for (let i = 0; i < n; i++) {
      const col = i % this.cols;
      const row = i / this.cols | 0;
      this.dotKind[i] = 0;
      this.dotPhase[i] = hash3(col, row, 23) * Math.PI * 2;
      this.dotFreq[i] = 0.3 + hash3(col, row, 37) * 1.1;
    }
    this.paintBackground();
  }
  paintBackground() {
    const g = this.bg.getContext("2d");
    if (!g) return;
    const { width: W, height: H, dpr, cw, ch } = this;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    paintGrid(g, W, H, cw, ch, dpr, this.dark, this.gridOpacity);
  }
  render(world, dt) {
    const { ctx, dpr, cols, ch } = this;
    if (cols === 0) return;
    const t = world.time;
    this.consumeEvents(world);
    this.rasterizeSharks(world.sharks, t);
    this.depositWake(world);
    this.diffuse(dt);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.drawImage(this.bg, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.markFish(world);
    this.drawDots(t);
    ctx.font = `${this.glyphMode === "hanzi" ? 400 : 600} ${Math.round(ch * 0.74)}px ${this.fontFamily}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    this.drawHeat();
    this.drawFish();
    this.drawSharks(t);
  }
  // ── simulation → field ──────────────────────────────────────────────
  cellIndex(x, y) {
    const c = Math.floor(x / this.cw);
    const r = Math.floor(y / this.ch);
    if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) return -1;
    return r * this.cols + c;
  }
  stamp(field, x, y, radius, amount) {
    const c0 = Math.floor(x / this.cw);
    const r0 = Math.floor(y / this.ch);
    for (let r = r0 - radius; r <= r0 + radius; r++) {
      for (let c = c0 - radius; c <= c0 + radius; c++) {
        if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) continue;
        const d = Math.hypot(c - c0, (r - r0) * 1.4);
        if (d > radius + 0.5) continue;
        const i = r * this.cols + c;
        field[i] = Math.min(1.6, field[i] + amount * (1 - d / (radius + 1)));
      }
    }
  }
  consumeEvents(world) {
    for (const e of world.events) {
      if (e.kind === "eat") {
        this.stamp(this.heat, e.x, e.y, 2, 1);
        this.stamp(this.energy, e.x, e.y, 3, 0.9);
      } else {
        this.stamp(this.energy, e.x, e.y, 6, 1.4);
      }
    }
    world.events.length = 0;
  }
  depositWake(world) {
    const { energy } = this;
    for (const f of world.fish) {
      if (!f.alive) continue;
      const i = this.cellIndex(f.x, f.y);
      if (i >= 0) energy[i] = Math.min(1.6, energy[i] + 0.012 + f.alarm * 0.03);
    }
    for (const sh of world.sharks) {
      for (let k = SHARK_NODES - 6; k < SHARK_NODES; k++) {
        const i = this.cellIndex(sh.nodes[k * 2], sh.nodes[k * 2 + 1]);
        if (i >= 0) energy[i] = Math.min(1.6, energy[i] + 0.05 + sh.speed * 12e-4);
      }
    }
    if (world.pointer.active) {
      this.stamp(energy, world.pointer.x, world.pointer.y, 1, 0.08);
    }
  }
  /** Blur + decay so wakes spread out like ripples and fade. */
  diffuse(dt) {
    const { cols, rows, energy, energyTmp: tmp, heat } = this;
    const decay = Math.exp(-dt * 1.5);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        const l = c > 0 ? energy[i - 1] : energy[i];
        const rt = c < cols - 1 ? energy[i + 1] : energy[i];
        const u = r > 0 ? energy[i - cols] : energy[i];
        const d = r < rows - 1 ? energy[i + cols] : energy[i];
        tmp[i] = (energy[i] * 4 + l + rt + u + d) * 0.125 * decay;
      }
    }
    this.energy = tmp;
    this.energyTmp = energy;
    const heatDecay = Math.exp(-dt * 2.2);
    for (let i = 0; i < heat.length; i++) heat[i] *= heatDecay;
  }
  // ── sharks ──────────────────────────────────────────────────────────
  /**
   * Classify one point against the current shark (spine/arc already built).
   * Body coordinates: s along the spine (0 snout → 1 tail), v across it.
   * Writes hit* fields and returns whether the point is on the shark.
   */
  sampleShark(px, py, L) {
    const { spine, arc } = this;
    const N = SHARK_NODES;
    let best = Infinity;
    let bestS = 0;
    let bestSign = 1;
    let bestNx = 0;
    let bestNy = 0;
    for (let k = 0; k < N - 1; k++) {
      const ax = spine[k * 2];
      const ay = spine[k * 2 + 1];
      const sx = spine[(k + 1) * 2] - ax;
      const sy = spine[(k + 1) * 2 + 1] - ay;
      const len2 = sx * sx + sy * sy || 1;
      const u2 = clamp(((px - ax) * sx + (py - ay) * sy) / len2, 0, 1);
      const qx = ax + sx * u2;
      const qy = ay + sy * u2;
      const d2 = (px - qx) ** 2 + (py - qy) ** 2;
      if (d2 < best) {
        best = d2;
        const len = Math.sqrt(len2);
        bestS = (arc[k] + u2 * len) / this.arcTotal;
        bestSign = sx * (py - ay) - sy * (px - ax) >= 0 ? 1 : -1;
        bestNx = -sy / len * bestSign;
        bestNy = sx / len * bestSign;
      }
    }
    const a = Math.sqrt(best);
    const s = bestS;
    const u = s * L;
    const shape = this.shape;
    const w = shape.halfWidth(s) * L;
    this.hitDist = a;
    this.hitS = s;
    this.hitV = a * bestSign;
    const head = this.shape.head;
    if (head && u < L * (head.sweep + head.depth + head.notch)) {
      const span = L * head.span;
      const r = a / span;
      const front = L * head.sweep * r * r + L * head.notch * Math.max(0, 1 - r / 0.14);
      const depth = L * head.depth * (1 - 0.2 * r * r * r * r);
      if (r <= 1 && u >= front && u <= front + depth) {
        this.hitFlag = r > 0.84 ? FLAG_EYE : FLAG_BODY;
        this.hitShade = r > 0.84 ? 0 : 0.62 - 0.2 * r + (u < front + L * 0.012 ? 0.1 : 0);
        return true;
      }
    }
    if (a <= w && (shape !== humpback && shape !== orca || s <= 0.945)) {
      const across = a / (w || 1);
      const facing = (bestNx * -0.6 + bestNy * -0.8) * across;
      let shade = 0.58 - across * across * 0.42 + facing * 0.26;
      let flag = FLAG_BODY;
      if (s > shape.dorsal[0] && s < shape.dorsal[1] && across < 0.3) {
        flag = FLAG_RIDGE;
        shade = 1;
      } else if (s > shape.secondDorsal[0] && s < shape.secondDorsal[1] && across < 0.4) {
        shade = Math.max(shade, 0.82);
      } else if (shape.eye && s > shape.eye[0] && s < shape.eye[1] && across > 0.6) {
        flag = FLAG_EYE;
        shade = 0;
      } else if (shape === orca && orcaPatch(s, across)) {
        flag = FLAG_WHITE;
      } else if (s > shape.gills[0] && s < shape.gills[1] && across > 0.58) {
        if (Math.floor((s - shape.gills[0]) / (shape.gills[1] - shape.gills[0]) * 5) % 2 === 0) shade *= 0.45;
      } else if (s < 0.05) {
        shade = Math.max(shade, 0.7);
      } else if (shape === SHAPES.zebra && s > 0.08 && s < 0.55 && (across < 0.1 || Math.abs(across - 0.6) < 0.08)) {
        shade = Math.max(shade, 0.8);
      } else if (this.marked(s, a * bestSign, L, across)) {
        flag = FLAG_MARK;
      }
      this.hitFlag = flag;
      this.hitShade = shade;
      return true;
    }
    const tip = bestSign > 0 ? this.finTipRight : this.finTipLeft;
    const [p0, p1, p2] = shape.pectoral;
    if ((shape === humpback ? humpbackFlipper(s, a, tip) : shape === orca ? orcaFlipper(s, a, tip) : inTriangle(u, a, L * p0, 0, L * p1, 0, L * p2, tip)) && // Falcate (sickle) fins get a concave trailing edge.
    !(shape.falcate && inTriangle(u, a, L * p1, 0, L * (p1 + (p2 - p1) * 0.33), tip * 0.55, L * p2, tip))) {
      this.hitFlag = this.marked(s, a * bestSign, L, 0) ? FLAG_MARK : FLAG_FIN;
      this.hitShade = 0.38 + 0.22 * (1 - clamp(a / tip, 0, 1));
      return true;
    }
    const [v0, v1, v2, vr] = shape.pelvic;
    if (vr > 0 && inTriangle(u, a, L * v0, 0, L * v1, 0, L * v2, L * vr) || // Forked caudal fin.
    (shape === humpback || shape === orca ? whaleFlukes(s, a / L) : shape.caudal > 0 && inTriangle(u, a, L * 0.86, 0, L * 0.95, 0, L, L * shape.caudal))) {
      this.hitFlag = FLAG_FIN;
      this.hitShade = 0.36;
      return true;
    }
    return false;
  }
  /** Whether a body point (s along, v across) falls on a dark marking. */
  marked(s, v, L, across) {
    if (this.shape === SHAPES.tiger) {
      if (s < 0.2 || s > 0.9 || across > 0.85) return false;
      const wobble = 0.35 * Math.sin(v / L * 25 + s * 5);
      const bar = Math.sin(s * Math.PI * 2 * 9 + wobble);
      return bar > 0.65 - 0.5 * smoothstep(0.2, 0.42, s) + 0.4 * smoothstep(0.8, 0.9, s);
    }
    if (this.shape === SHAPES.zebra) {
      if (s < 0.07) return false;
      const gu = s * L / (L * 0.06);
      const gv = v / (L * 0.045);
      const cu = Math.floor(gu);
      const cv = Math.floor(gv);
      const jx = hash3(cu, cv, this.sharkId) * 0.5 + 0.25;
      const jy = hash3(cu, cv, this.sharkId + 11) * 0.5 + 0.25;
      return (gu - cu - jx) ** 2 + (gv - cv - jy) ** 2 < 0.08;
    }
    return false;
  }
  /**
   * Build a smooth, undulating render spine from the sim spine, then
   * supersample every cell in the shark's bounding box against the shape.
   * Fully covered cells become solid skin; partial cells become edge glyphs.
   */
  rasterizeSharks(sharks, t) {
    const { sharkFlag, sharkShade, sharkKey, sharkDepth, sharkKind, sharkShadow, spine, arc, cw, ch, cols, rows } = this;
    sharkFlag.fill(0);
    sharkShadow.fill(0);
    this.sharkGlyph.fill(0);
    for (const sh of sharks) {
      const L = sh.length;
      const N = SHARK_NODES;
      const n = sh.nodes;
      const swim = clamp(sh.speed / 60, 0.4, 1.4);
      this.shape = SHAPES[sh.kind];
      this.sharkId = sh.id;
      const kindIndex = KINDS.indexOf(sh.kind);
      const secretCells = this.glyphMode === "hanzi" && (sh.kind === "whale" || sh.kind === "orca") && sh.id === 1 ? [-1, -1, -1, -1] : null;
      const secretDistances = [Infinity, Infinity, Infinity, Infinity];
      for (let k = 0; k < N; k++) {
        const s = k / (N - 1);
        const a = Math.max(0, k - 1);
        const b = Math.min(N - 1, k + 1);
        let tx = n[a * 2] - n[b * 2];
        let ty = n[a * 2 + 1] - n[b * 2 + 1];
        const tl = Math.hypot(tx, ty) || 1;
        tx /= tl;
        ty /= tl;
        const amp = L * 0.05 * (0.1 + 0.9 * Math.pow(s, 1.8)) * swim * this.bodySwing;
        const off = amp * Math.sin(sh.phase - s * 5.2);
        spine[k * 2] = n[k * 2] - ty * off;
        spine[k * 2 + 1] = n[k * 2 + 1] + tx * off;
      }
      arc[0] = 0;
      for (let k = 1; k < N; k++) {
        arc[k] = arc[k - 1] + Math.hypot(spine[k * 2] - spine[(k - 1) * 2], spine[k * 2 + 1] - spine[(k - 1) * 2 + 1]);
      }
      this.arcTotal = arc[N - 1] || 1;
      const bank = clamp(sh.turn * 0.45, -0.35, 0.35);
      const flex = 1 + 0.06 * Math.sin(sh.phase * 0.5);
      const reachFin = this.shape.pectoral[3];
      this.finTipRight = L * reachFin * flex * (1 - bank);
      this.finTipLeft = L * reachFin * flex * (1 + bank);
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (let k = 0; k < N; k++) {
        minX = Math.min(minX, spine[k * 2]);
        maxX = Math.max(maxX, spine[k * 2]);
        minY = Math.min(minY, spine[k * 2 + 1]);
        maxY = Math.max(maxY, spine[k * 2 + 1]);
      }
      const reach = Math.max(L * 0.36, this.finTipLeft, this.finTipRight);
      const c0 = Math.max(0, Math.floor((minX - reach) / cw));
      const c1 = Math.min(cols - 1, Math.floor((maxX + reach) / cw));
      const r0 = Math.max(0, Math.floor((minY - reach) / ch));
      const r1 = Math.min(rows - 1, Math.floor((maxY + reach) / ch));
      if (c0 > c1 || r0 > r1) continue;
      const skipBeyond = reach + Math.hypot(cw, ch);
      const shadowDc = Math.round(L * 0.035 / cw) + 1;
      const shadowDr = Math.round(L * 0.02 / ch) + 1;
      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
          const x = c * cw;
          const y = r * ch;
          const centerHit = this.sampleShark(x + cw / 2, y + ch / 2, L);
          if (!centerHit && this.hitDist > skipBeyond) continue;
          const flag = this.hitFlag;
          const shade = this.hitShade;
          const s = this.hitS;
          const v = this.hitV;
          let hits = centerHit ? 1 : 0;
          for (let k = 0; k < SUBSAMPLES.length; k += 2) {
            if (this.sampleShark(x + SUBSAMPLES[k] * cw, y + SUBSAMPLES[k + 1] * ch, L)) hits++;
          }
          if (hits === 0) continue;
          const coverage = hits / 5;
          const i = r * cols + c;
          const key = hash3(Math.round(s * 52), Math.round(v / (cw * 0.9)), sh.id) * 4294967295 >>> 0;
          sharkKey[i] = key;
          sharkDepth[i] = sh.depth;
          sharkKind[i] = kindIndex;
          if (centerHit && coverage >= 0.6) {
            sharkFlag[i] = flag;
            if (this.glyphMode === "hanzi" && (sh.kind === "whale" || sh.kind === "orca")) {
              const glyph = flag === FLAG_EYE ? "\u76EE" : flag === FLAG_FIN ? s >= 0.84 ? "\u5C3E" : "\u9CCD" : flag === FLAG_RIDGE ? "\u9CCD" : s < 0.1 ? "\u543B" : s < 0.6 && Math.abs(v) < this.shape.halfWidth(s) * L * 0.32 ? "\u80CC" : "";
              this.sharkGlyph[i] = glyph ? glyph.charCodeAt(0) : 0;
              if (secretCells && !glyph && flag === FLAG_BODY && v > 0 && s >= 0.28 && s < 0.64) {
                const slot = Math.min(3, Math.floor((s - 0.28) / 0.09));
                const distance = ((s - (0.325 + slot * 0.09)) * L) ** 2 + (v - this.shape.halfWidth(s) * L * 0.6) ** 2;
                if (distance < secretDistances[slot]) {
                  secretDistances[slot] = distance;
                  secretCells[slot] = i;
                }
              }
            } else this.sharkGlyph[i] = 0;
            const flicker = (hash3(c, r, Math.floor(t * 6)) - 0.5) * 0.06;
            sharkShade[i] = clamp(shade + flicker, 0, 1);
            const sc = c + shadowDc;
            const sr = r + shadowDr;
            if (sc < cols && sr < rows) sharkShadow[sr * cols + sc] = 1;
          } else {
            sharkFlag[i] = FLAG_EDGE;
            this.sharkGlyph[i] = 0;
            sharkShade[i] = coverage;
          }
        }
      }
      if (secretCells?.every((i) => i >= 0)) {
        for (let k = 0; k < 4; k++) this.sharkGlyph[secretCells[k]] = "\u6DF1\u5EA6\u6C42\u7D22".charCodeAt(k);
      }
    }
  }
  drawSharks(t) {
    const { ctx, cols, rows, cw, ch, sharkFlag, sharkShade, sharkKey, sharkDepth, sharkKind } = this;
    const glyphs = GLYPHS[this.glyphMode];
    const n = cols * rows;
    for (let i = 0; i < n; i++) {
      const flag = sharkFlag[i];
      if (!flag) continue;
      const col = i % cols;
      const row = i / cols | 0;
      const x = col * cw;
      const y = row * ch;
      const key = sharkKey[i];
      const shade = sharkShade[i];
      const dim = 0.7 + 0.3 * sharkDepth[i];
      const [tr, tg, tb] = SHAPES[KINDS[sharkKind[i]]].tint;
      const tick = Math.floor(t * 2.4 + key % 997 / 97);
      const roll = hash3(key, tick, 7);
      if (flag === FLAG_EDGE) {
        const set = shade >= 0.5 ? glyphs.edgeHeavy : glyphs.edgeLight;
        const g = (70 + shade * 80) * dim;
        ctx.fillStyle = roll < 0.07 ? this.accents[key % this.accents.length] : this.bodyColor(g);
        ctx.fillText(set[(key >>> 8) % set.length], x + cw / 2, y + ch / 2 + 1, Math.max(1, cw - 1));
        continue;
      }
      let level;
      let glyph;
      if (flag === FLAG_RIDGE) {
        level = 226;
        glyph = glyphs.ridge[(key >>> 8) % glyphs.ridge.length];
      } else if (flag === FLAG_EYE) {
        level = 46 + shade * 160;
        glyph = glyphs.eye;
      } else if (flag === FLAG_MARK) {
        level = 24 + shade * 22;
        glyph = glyphs.mark[(key >>> 8) % glyphs.mark.length];
      } else if (flag === FLAG_FIN) {
        level = 40 + shade * 120;
        glyph = glyphs.fin[(key >>> 8) % glyphs.fin.length];
      } else {
        level = 46 + shade * 160;
        const jitter = (key >>> 4) % 3 - 1;
        glyph = glyphs.skin[clamp(Math.floor((1 - shade) * (glyphs.skin.length - 0.01)) + jitter, 0, glyphs.skin.length - 1)];
      }
      level *= dim;
      if (this.sharkGlyph[i]) glyph = String.fromCharCode(this.sharkGlyph[i]);
      ctx.fillStyle = flag === FLAG_WHITE ? "#f5f5f0" : flag === FLAG_EYE && this.eyeColor ? this.eyeColor : this.bodyColor(level);
      ctx.fillRect(x + 1, y + 1, cw - 1, ch - 1);
      let color;
      if (flag === FLAG_WHITE) color = "#181818";
      else if (flag === FLAG_EYE && this.eyeColor) color = this.eyeColor === "#000000" ? "#ffffff" : "#181818";
      else if (flag === FLAG_EYE) color = shade > 0.55 ? "#181818" : "#eeeeee";
      else if (flag === FLAG_MARK) color = `rgb(${Math.round(70 * tr)},${Math.round(70 * tg)},${Math.round(70 * tb)})`;
      else if (roll < 0.09) color = this.accents[key % this.accents.length];
      else if (roll < 0.13) color = "#ffffff";
      else color = shade > 0.55 ? "#181818" : "#eeeeee";
      ctx.fillStyle = color;
      ctx.fillText(glyph, x + cw / 2, y + ch / 2 + 1, Math.max(1, cw - 1));
    }
  }
  // ── fish, dots, heat ────────────────────────────────────────────────
  /**
   * Snap each fish to a cell and bucket it by brightness: far fish are dim,
   * near fish brighter, and turning or panicking fish glint. Nearer fish
   * claim a cell first when two land in the same one.
   */
  markFish(world) {
    const { fishStamp, fishBuckets, sharkFlag } = this;
    const frame = ++this.frameId;
    for (const bucket of fishBuckets) bucket.length = 0;
    for (let pass = 0; pass < 2; pass++) {
      for (const f of world.fish) {
        if (!f.alive || (f.depth > 0.78 ? 0 : 1) !== pass) continue;
        const i = this.cellIndex(f.x, f.y);
        if (i < 0 || fishStamp[i] === frame || sharkFlag[i]) continue;
        fishStamp[i] = frame;
        const glint = clamp(Math.abs(f.turn) / 3.5, 0, 1);
        const v = 0.3 + 0.4 * (f.depth - 0.55) / 0.45 + 0.3 * Math.max(glint, f.alarm);
        fishBuckets[clamp(Math.floor(v * FISH_ALPHAS.length), 0, FISH_ALPHAS.length - 1)].push(i);
      }
    }
  }
  drawFish() {
    const { ctx, cw, ch, cols, fishBuckets } = this;
    const glyphs = GLYPHS[this.glyphMode].fish;
    for (let b = 0; b < fishBuckets.length; b++) {
      const bucket = fishBuckets[b];
      if (!bucket.length) continue;
      ctx.fillStyle = this.fishStyles[b];
      for (const i of bucket) {
        ctx.fillText(glyphs[i % glyphs.length], i % cols * cw + cw / 2, (i / cols | 0) * ch + ch / 2 + 1, Math.max(1, cw - 1));
      }
    }
  }
  drawHeat() {
    const { ctx, heat, cols, cw, ch } = this;
    for (let i = 0; i < heat.length; i++) {
      const h = heat[i];
      if (h < 0.08) continue;
      const col = i % cols;
      const row = i / cols | 0;
      ctx.fillStyle = `rgba(${this.rgb.join(",")},${Math.min(1, h * 1.6).toFixed(2)})`;
      ctx.fillText(h > 0.6 ? "*" : "\xB7", col * cw + cw / 2, row * ch + ch / 2 + 1, Math.max(1, cw - 1));
    }
  }
  /**
   * Every cell's dot twinkles on its own clock, is modulated by slow
   * caustic light bands, and flares cyan where the wake field is strong.
   * Dots are bucketed by colour/alpha so each bucket is one fillStyle.
   */
  drawDots(t) {
    const { ctx, cols, rows, cw, ch, dotKind, dotPhase, dotFreq, energy, sharkFlag, sharkShadow, fishStamp, frameId } = this;
    const { bucketOf, bucketOrder, bucketCounts } = this;
    const n = cols * rows;
    const SKIP = bucketCounts.length - 1;
    bucketCounts.fill(0);
    for (let i = 0; i < n; i++) {
      const e = energy[i] * this.wake;
      const kind = dotKind[i];
      if (sharkFlag[i] || fishStamp[i] === frameId || kind === 0 && e < 0.45) {
        bucketOf[i] = SKIP;
        continue;
      }
      let bucket;
      if (e > 0.45) {
        const level = clamp(Math.floor((e - 0.45) * 5), 0, ALPHA_LEVELS - 1);
        bucket = WAKE * ALPHA_LEVELS + level;
      } else {
        const col = i % cols;
        const row = i / cols | 0;
        const twinkle = 0.5 + 0.5 * Math.sin(t * dotFreq[i] + dotPhase[i]);
        const caustic = 0.85 + 0.15 * Math.sin(col * 0.11 + t * 0.35) * Math.sin(row * 0.17 - t * 0.27);
        let v = clamp((0.55 + 0.45 * twinkle) * caustic + e * 2, 0, 1);
        if (sharkShadow[i]) v *= 0.2;
        bucket = (kind - 1) * ALPHA_LEVELS + clamp(Math.floor(v * ALPHA_LEVELS), 0, ALPHA_LEVELS - 1);
      }
      bucketOf[i] = bucket;
      bucketCounts[bucket]++;
    }
    const starts = new Int32Array(bucketCounts.length);
    for (let b = 1; b < bucketCounts.length; b++) starts[b] = starts[b - 1] + bucketCounts[b - 1];
    const cursor = starts.slice();
    for (let i = 0; i < n; i++) {
      const b = bucketOf[i];
      if (b !== SKIP) bucketOrder[cursor[b]++] = i;
    }
    const small = Math.max(2, Math.round(cw * 0.19));
    const large = small + 1;
    for (let b = 0; b < SKIP; b++) {
      const count = bucketCounts[b];
      if (!count) continue;
      ctx.fillStyle = this.dotStyles[b];
      const size = b >= WAKE * ALPHA_LEVELS ? large : small;
      const start = starts[b];
      for (let k = start; k < start + count; k++) {
        const i = bucketOrder[k];
        const col = i % cols;
        const row = i / cols | 0;
        ctx.fillRect(Math.round(col * cw + cw * 0.66 - size / 2), Math.round(row * ch + ch * 0.64 - size / 2), size, size);
      }
    }
  }
};
  // ========================================================================
  // 上游移植段结束
  // ========================================================================

  // ---- 引擎（改编自 vendor/ascii-sharks/engine.ts）----------------------

  var STEP = 1 / 60;
  var MAX_STEPS = 4;

  /** 鲸鱼图形的固定配色：沿用 dsh-ascii-whales 的出厂默认 DeepSeek 蓝。 */
  var WHALE_COLOR = "#4d6bfe";

  /** 多鲸时逐条缩小的比例表（与上游 background.mjs 一致）。 */
  var WHALE_SIZE_STEPS = [1, 0.7, 0.84, 0.77, 0.65, 0.9];

  /**
   * 帧率门控的容差（毫秒）。
   * 与 field.js 的 PACE_TOLERANCE_MS 同值同义：吸收 rAF 与显示器刷新之间那点抖动，
   * 避免「目标 30fps，实际间隔 33.1ms」被误判成还没到点。
   */
  var WHALE_PACE_TOLERANCE_MS = 1.5;

  /**
   * 纯函数：这一帧画不画。
   *
   * fps <= 0（或非有限值）表示不限帧；从没画过（lastDrawAt <= 0）一定画；
   * 否则要求「距上次绘制 >= 一帧间隔 - 容差」。
   * 抽成纯函数是为了能在 node 里直接断言，不必造一个 canvas。
   *
   * @param {{ now?: number, lastDrawAt?: number, fps?: number }} input
   * @returns {{ draw: boolean, interval: number }}
   */
  function paceDecision(input) {
    var src = input && typeof input === "object" ? input : {};
    var fps = typeof src.fps === "number" && Number.isFinite(src.fps) ? src.fps : 0;
    if (!(fps > 0)) return { draw: true, interval: 0 };
    var interval = 1000 / fps;
    var lastDrawAt =
      typeof src.lastDrawAt === "number" && Number.isFinite(src.lastDrawAt) ? src.lastDrawAt : 0;
    var now = typeof src.now === "number" && Number.isFinite(src.now) ? src.now : 0;
    if (lastDrawAt <= 0) return { draw: true, interval: interval };
    return { draw: now - lastDrawAt >= interval - WHALE_PACE_TOLERANCE_MS, interval: interval };
  }

  var OceanEngine = class {
    constructor(canvas, sharks, speed = 1, dark = false, gridScale = 1, gridOpacity = 0.05, fishCount, wake = 1, color = WHALE_COLOR, glyphMode = "ascii", colorfulShimmer = false, eyeColor = "primary", bodySwing = 1, turnAgility = 1, tailFrequency = 1, fpsCap = 30, interact = true) {
      this.canvas = canvas;
      this.speed = speed;
      // [适配 4] 帧率上限：0/负数表示不限帧。
      this.fpsCap = typeof fpsCap === "number" && Number.isFinite(fpsCap) && fpsCap > 0 ? fpsCap : 0;
      // [适配 5] 交互开关：false 时下面不注册 window 级指针监听。
      this.interact = !!interact;
      this.world = new World(sharks, fishCount);
      // [适配 2] 原为 `glyphMode === "kanji" ? new Painter(...) : new AsciiRenderer(...)`，
      // 并按实例类型分派 setTheme。Kanji 渲染器已整体移出，这里只剩 AsciiRenderer。
      this.renderer = new AsciiRenderer(canvas, dark, gridScale, gridOpacity, wake, glyphMode);
      this.renderer.setTheme(dark, gridOpacity, wake, color, colorfulShimmer, eyeColor);
      this.renderer.bodySwing = bodySwing;
      this.world.turnAgility = turnAgility;
      this.world.tailFrequency = tailFrequency;
      this.renderer.setFontFamily(getComputedStyle(canvas).fontFamily);
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(canvas);
      this.intersectionObserver = new IntersectionObserver(([entry]) => {
        this.visible = entry.isIntersecting;
        this.schedule();
      });
      this.intersectionObserver.observe(canvas);
      // [适配 3] 原为 reducedMotion 的 change 订阅；现在只剩可见性调度。
      document.addEventListener("visibilitychange", this.scheduleVisibility);
      if (this.interact) this.attachPointer();
      this.resize();
      document.fonts?.load(`${glyphMode !== "ascii" ? 400 : 600} 16px ${getComputedStyle(canvas).fontFamily}`, glyphMode !== "ascii" ? "鲸目鳍尾鲨鲸" : "S8@").then(() => {
        if (this.disposed) return;
        this.renderer.setFontFamily(getComputedStyle(canvas).fontFamily);
      }).catch(() => {
      });
      this.schedule();
    }

    world;

    renderer;

    raf = 0;

    /** 上一次真正绘制的时间（performance.now 时间轴），用于算 dt。 */
    last = 0;

    acc = 0;

    visible = true;

    /** [适配 4] 帧率上限（0 = 不限）。 */
    fpsCap = 30;

    /** [适配 4] 上一次通过门控的绘制时刻（performance.now 时间轴）。 */
    lastDrawAt = 0;

    /** [适配 5] 是否已安装指针监听。 */
    pointerAttached = false;

    /** [适配 5] 交互开关。 */
    interact = false;

    resizeObserver;

    intersectionObserver;

    disposed = false;

    destroy() {
      this.disposed = true;
      cancelAnimationFrame(this.raf);
      this.resizeObserver.disconnect();
      this.intersectionObserver.disconnect();
      // [适配 5] 指针监听可能根本没装过，detachPointer 自身幂等。
      this.detachPointer();
      document.removeEventListener("visibilitychange", this.scheduleVisibility);
    }

    /** [适配 5] 安装 window 级指针监听；幂等。 */
    attachPointer() {
      if (this.pointerAttached) return;
      this.pointerAttached = true;
      window.addEventListener("pointermove", this.onPointerMove, { passive: true });
      window.addEventListener("pointerdown", this.onPointerDown, { passive: true });
      document.documentElement.addEventListener("pointerleave", this.onPointerLeave);
      window.addEventListener("blur", this.onPointerLeave);
    }

    /** [适配 5] 拆除指针监听，并把指针状态归零（否则鱼群会一直朝最后一次位置聚）。 */
    detachPointer() {
      if (!this.pointerAttached) return;
      this.pointerAttached = false;
      window.removeEventListener("pointermove", this.onPointerMove);
      window.removeEventListener("pointerdown", this.onPointerDown);
      document.documentElement.removeEventListener("pointerleave", this.onPointerLeave);
      window.removeEventListener("blur", this.onPointerLeave);
      this.world.pointer.active = false;
    }

    /** [适配 5] 运行期切换交互：幂等，不重建引擎。 */
    setInteract(value) {
      const next = !!value;
      if (next === this.interact) return;
      this.interact = next;
      if (next) this.attachPointer();
      else this.detachPointer();
    }

    /** [适配 4] 运行期改帧率上限：只影响下一帧的门控判定，不重建引擎。 */
    setFpsCap(value) {
      const next = typeof value === "number" && Number.isFinite(value) ? value : 0;
      this.fpsCap = next > 0 ? next : 0;
    }

    setAppearance(speed, dark, gridOpacity = 0.05, wake = 1, color = WHALE_COLOR, colorfulShimmer = false, eyeColor = "primary", bodySwing = 1, turnAgility = 1, tailFrequency = 1) {
      this.speed = speed;
      this.renderer.bodySwing = bodySwing;
      this.world.turnAgility = turnAgility;
      this.world.tailFrequency = tailFrequency;
      this.renderer.setTheme(dark, gridOpacity, wake, color, colorfulShimmer, eyeColor);
    }

    scheduleVisibility = () => this.schedule();

    resize() {
      const rect = this.canvas.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.renderer.resize(rect.width, rect.height, dpr);
      this.world.resize(rect.width, rect.height, this.renderer.cellWidth, this.renderer.cellHeight);
    }

    schedule() {
      cancelAnimationFrame(this.raf);
      // [适配 3] 去掉了 reducedMotion 判定。
      if (this.disposed || !this.visible || document.hidden) return;
      this.last = performance.now();
      this.raf = requestAnimationFrame(this.frame);
    }

    frame = (now) => {
      // [适配 4] 帧率门控：不到点就只续 rAF，不绘制也不推进累加器。
      // 注意这里**不更新 this.last**，于是被跳过的时长会在下一次真正绘制时进入 dt，
      // 运动按真实时间推进 —— 降帧只会减少绘制次数，不会让鲸鱼游得更慢。
      if (!paceDecision({ now, lastDrawAt: this.lastDrawAt, fps: this.fpsCap }).draw) {
        this.raf = requestAnimationFrame(this.frame);
        return;
      }
      this.lastDrawAt = now;
      const dt = Math.min(0.1, (now - this.last) / 1e3);
      this.last = now;
      this.acc += dt * this.speed;
      let steps = 0;
      const maxSteps = Math.ceil(MAX_STEPS * Math.max(1, this.speed));
      while (this.acc >= STEP && steps < maxSteps) {
        this.world.step(STEP, STEP * 0.65 / this.speed);
        this.acc -= STEP;
        steps++;
      }
      if (steps === maxSteps) this.acc = 0;
      this.render(dt * this.speed);
      this.raf = requestAnimationFrame(this.frame);
    };

    render(dt) {
      this.renderer.render(this.world, dt);
    }

    toLocal(e) {
      const rect = this.canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const inside = x >= 0 && y >= 0 && x <= rect.width && y <= rect.height;
      return { x, y, inside };
    }

    onPointerMove = (e) => {
      // [适配 5] 双保险：监听只在 interact 时安装，这里再挡一次，避免拆卸瞬间的排队事件。
      if (!this.interact) return;
      const { x, y, inside } = this.toLocal(e);
      const p = this.world.pointer;
      p.x = x;
      p.y = y;
      p.active = inside && e.pointerType !== "touch";
    };

    onPointerDown = (e) => {
      if (!this.interact) return;
      const { x, y, inside } = this.toLocal(e);
      if (inside) this.world.splash(x, y);
    };

    onPointerLeave = () => {
      this.world.pointer.active = false;
    };
  };

  /** 把 1–20 收紧成整数（归一化层已经做过一次，这里是防御性兜底）。 */
  function whaleCount(value) {
    const raw = typeof value === "number" && Number.isFinite(value) ? value : 1;
    return Math.min(20, Math.max(1, Math.round(raw)));
  }

  /**
   * 建一个鲸鱼引擎。
   *
   * @param {HTMLCanvasElement} canvas 已插入 DOM、尺寸由 CSS 决定
   * @param {object} options
   * @param {string} [options.species] "humpback" | "orca"
   * @param {number} [options.count] 鲸鱼条数
   * @param {number} [options.size] 单条鲸鱼的基准大小
   * @param {number} [options.speed] 时钟倍率
   * @param {boolean} [options.dark] 深色主题
   * @param {number} [options.gridScale] 字符栅格倍率
   * @param {number} [options.gridOpacity] 底纹网格透明度
   * @param {number} [options.fishCount] 小鱼数量
   * @param {number} [options.wake] 尾迹强度
   * @param {number} [options.bodySwing] 身体摆动幅度
   * @param {number} [options.turnAgility] 转弯灵活度
   * @param {number} [options.tailFrequency] 摆尾频率
   * @param {number} [options.fps] 帧率上限（0 = 不限）
   * @param {boolean} [options.interact] 是否响应鼠标
   * @returns {InstanceType<typeof OceanEngine>}
   */
  function create(canvas, options) {
    const src = options && typeof options === "object" ? options : {};
    const kind = src.species === "orca" ? "orca" : "whale";
    const baseSize = typeof src.size === "number" && Number.isFinite(src.size) ? src.size : 1;
    const whales = [];
    const count = whaleCount(src.count);
    for (let index = 0; index < count; index += 1) {
      whales.push({ kind, size: baseSize * WHALE_SIZE_STEPS[index % WHALE_SIZE_STEPS.length] });
    }
    return new OceanEngine(
      canvas,
      whales,
      src.speed,
      !!src.dark,
      src.gridScale,
      src.gridOpacity,
      src.fishCount,
      src.wake,
      WHALE_COLOR,
      "ascii",
      false,
      "primary",
      src.bodySwing,
      src.turnAgility,
      src.tailFrequency,
      src.fps,
      src.interact,
    );
  }

  return { create, paceDecision, STEP, MAX_STEPS, WHALE_PACE_TOLERANCE_MS, OceanEngine };
})();
