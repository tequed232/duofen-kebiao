/**
 * 单色等高线背景 —— 模仿《明日方舟：终末地》那套工业风等高线（作者要求）。
 *
 * 为什么自己写而不是引库：
 *   · 仓库规矩是"加依赖要同步许可台账"（`collect-licenses --check` + `docs/asset-permissions.md`），
 *     而这件事只需要**种子化噪声 + 行进方块**两段小算法，不值得为此背一个依赖；
 *   · 自己写的一层是**纯函数**：守卫 `scripts/check-contour.mjs` 能直接跑它，
 *     断言"同种子确定性 / 不同种子不雷同 / 坐标全在图内 / 密度随档位变化"。
 *     引库的话这些只能在浏览器里截图比，判定不住。
 *
 * 输出是一串 SVG path（`M x1 y1 L x2 y2`），调用方放进一个 `<path d={...}>` 即可；
 * 颜色由 `currentColor` 决定 → 天然单色、跟随主题（浅色/深色自动适配）。
 *
 * 算法：
 *   1. 种子化 PRNG（mulberry32）→ 值噪声（双线性 + smoothstep），叠 3 个八度；
 *   2. 在 resolution×resolution 的网格上做**行进方块**（marching squares），
 *      对每个等值面抽线段 —— 得到的就是等高线。
 */

export interface ContourOptions {
  /** viewBox 的逻辑宽高（不是像素；SVG 会拉伸铺满） */
  width: number;
  height: number;
  seed?: number;
  /** 采样网格边长：越大越细腻，线段也越多 */
  resolution?: number;
  /** 等值面条数（= 密度） */
  levels?: number;
}

export interface ContourResult {
  /** 一条 path 的 d：由若干 `M…L…` 子路径拼成 */
  d: string;
  /** 线段条数（守卫用它断言"密度确实变了"） */
  segments: number;
  levels: number;
}

/** 三档预设：`off` 不画；`subtle` 是默认观感；`bold` 给"想更明显"的人 */
export const CONTOUR_PRESETS = {
  subtle: { resolution: 44, levels: 6, opacity: 0.1 },
  bold: { resolution: 56, levels: 11, opacity: 0.18 },
} as const;

export type ContourIntensity = keyof typeof CONTOUR_PRESETS;

/** mulberry32：小、快、确定性的 32 位 PRNG */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const smooth = (t: number) => t * t * (3 - 2 * t);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * 值噪声：整数格点上放随机值，格子内做 smoothstep 双线性插值。
 * 返回 0..1 的采样函数（对 (x,y) 取模，避免边界外爆炸）。
 */
function valueNoise(seed: number, size: number): (x: number, y: number) => number {
  const random = mulberry32(seed);
  const grid = new Float64Array(size * size);
  for (let i = 0; i < grid.length; i += 1) grid[i] = random();
  const at = (ix: number, iy: number) => grid[(((iy % size) + size) % size) * size + (((ix % size) + size) % size)];
  return (x, y) => {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const tx = smooth(x - x0);
    const ty = smooth(y - y0);
    return lerp(lerp(at(x0, y0), at(x0 + 1, y0), tx), lerp(at(x0, y0 + 1), at(x0 + 1, y0 + 1), tx), ty);
  };
}

/** 叠 3 个八度的分形噪声（低八度给大起伏，高八度给细碎纹理） */
function fractalNoise(seed: number, size: number): (x: number, y: number) => number {
  const octaves = [
    { fn: valueNoise(seed, size), scale: 1, weight: 0.58 },
    { fn: valueNoise(seed + 977, size), scale: 2.1, weight: 0.28 },
    { fn: valueNoise(seed + 3121, size), scale: 4.3, weight: 0.14 },
  ];
  return (x, y) => octaves.reduce((sum, octave) => sum + octave.weight * octave.fn(x * octave.scale, y * octave.scale), 0);
}

/** 行进方块：单格里按 4 个角与等值面的关系插值出线段端点 */
function cellSegment(
  corners: [number, number, number, number],
  level: number,
  x: number,
  y: number,
): [number, number, number, number] | null {
  const index =
    (corners[0] > level ? 8 : 0) | (corners[1] > level ? 4 : 0) | (corners[2] > level ? 2 : 0) | (corners[3] > level ? 1 : 0);
  if (index === 0 || index === 15) return null;
  // 边上的插值点：0=上 1=右 2=下 3=左
  const edge = (a: number, b: number) => (level - a) / (b - a || 1e-9);
  const top: [number, number] = [x + edge(corners[0], corners[1]), y];
  const right: [number, number] = [x + 1, y + edge(corners[1], corners[2])];
  const bottom: [number, number] = [x + edge(corners[3], corners[2]), y + 1];
  const left: [number, number] = [x, y + edge(corners[0], corners[3])];
  const table: Record<number, [[number, number], [number, number]]> = {
    1: [left, bottom],
    2: [bottom, right],
    3: [left, right],
    4: [top, right],
    5: [top, left],
    6: [top, bottom],
    7: [top, left],
    8: [top, left],
    9: [top, bottom],
    10: [top, right],
    11: [top, right],
    12: [left, right],
    13: [bottom, right],
    14: [left, bottom],
  };
  const picked = table[index];
  if (!picked) return null;
  return [picked[0][0], picked[0][1], picked[1][0], picked[1][1]];
}

/** 生成等高线：返回一条 SVG path 的 d */
export function contourPaths(options: ContourOptions): ContourResult {
  const width = Math.max(2, Math.round(options.width));
  const height = Math.max(2, Math.round(options.height));
  const resolution = Math.max(8, Math.round(options.resolution ?? CONTOUR_PRESETS.subtle.resolution));
  const levels = Math.max(1, Math.round(options.levels ?? CONTOUR_PRESETS.subtle.levels));
  const seed = options.seed ?? 20260924;

  const noise = fractalNoise(seed, 16);
  // 采样：把 resolution×resolution 的网格映射到噪声坐标（0.9 个噪声周期，避免出现"接缝"）
  const step = Math.max(width, height) / resolution / 90;
  const sample = (ix: number, iy: number) => noise(ix * step, iy * step);

  const field: number[] = [];
  for (let iy = 0; iy <= resolution; iy += 1) {
    for (let ix = 0; ix <= resolution; ix += 1) field.push(sample(ix, iy));
  }
  const min = Math.min(...field);
  const max = Math.max(...field);
  const span = max - min || 1;

  const parts: string[] = [];
  let segments = 0;
  const toX = (ix: number) => (ix / resolution) * width;
  const toY = (iy: number) => (iy / resolution) * height;

  for (let level = 1; level <= levels; level += 1) {
    // 等值面取在 [min,max] 内均匀分布的位置（避免全落在同一片）
    const value = min + (span * level) / (levels + 1);
    for (let iy = 0; iy < resolution; iy += 1) {
      for (let ix = 0; ix < resolution; ix += 1) {
        const at = (x: number, y: number) => field[y * (resolution + 1) + x];
        const corners: [number, number, number, number] = [at(ix, iy), at(ix + 1, iy), at(ix + 1, iy + 1), at(ix, iy + 1)];
        const seg = cellSegment(corners, value, ix, iy);
        if (!seg) continue;
        const [x1, y1, x2, y2] = seg;
        parts.push(`M${toX(x1).toFixed(1)} ${toY(y1).toFixed(1)}L${toX(x2).toFixed(1)} ${toY(y2).toFixed(1)}`);
        segments += 1;
      }
    }
  }

  return { d: parts.join(''), segments, levels };
}
