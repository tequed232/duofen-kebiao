/**
 * 液态玻璃的「透镜」位移贴图 —— 移植自参考实现
 * （andynubia12-byte/Apple-Music-Web-Liquid-Glass 的 buildDisplacementMap）。
 *
 * 思路：把圆角矩形的**有符号距离场**（SDF）当作玻璃厚度场 ——
 *   · 越靠近边缘，位移越大（BEZEL 决定透镜带的厚度，跟着圆角半径走）
 *   · 位移方向取边界法线：长边垂直于边缘折射，圆角沿弧面折射
 *   · ZOOM 让采样坐标向中心收缩，视觉上背景被放大 1/(1-zoom) 倍
 * 生成两张图：
 *   · 位移图（R=X 位移、G=Y 位移、B=128 中灰）→ feDisplacementMap 的 in2
 *   · 边缘图（弧面内侧的一圈 rim）→ 用来做边缘高光/彩边的遮罩
 *
 * 与参考实现一致的地方：SDF、平滑衰减、法线、bezel 随半径、zoom 收缩；
 * 差异：这里只做「折射层」需要的 模糊 → 位移 两段（参考实现还额外做了
 * 可读性映射与彩边合成，那两步依赖真实背景采样，浏览器的 backdrop-filter 拿不到）。
 */
export interface LensParams {
  /** 透镜带厚度（相对圆角半径的比例） */
  bezel: number;
  /** 折射强度 */
  strength: number;
  /** 采样向中心收缩的比例（背景放大） */
  zoom: number;
  /** 边缘带强度（写入 --lg-edge-url 的遮罩，由 CSS 决定怎么用） */
  edge: number;
  /**
   * 位移随距离的衰减指数，默认 2（原来的平方衰减）。
   * 值越大，位移越集中在边缘一条窄带上、往中心掉得越快 ——
   * 苹果的「玻璃翘边」就是这种分布：只在边缘一线，不是整块都在扭。
   */
  falloff?: number;
  /** backdrop 那份位移的封顶（px）。默认 10；底栏要更收，避免整块背景被掰弯 */
  backdropMax?: number;
  /** backdrop 位移相对贴图 scale 的系数。默认 0.22；底栏更小 */
  backdropFactor?: number;
  /**
   * **色散（chromatic dispersion）**：R / B 两个通道的位移量与 G 相差多少 px
   * （量在位移最大的边缘处，即 R 比 G 多走 fringe/2、B 比 G 少走 fringe/2）。
   *
   * 为什么用「位移量之差」而不是固定偏移：色差与位移成正比，位移为 0 的中心区
   * 自动没有色差 —— 于是色散**天然只出现在被掰弯的那圈边缘带**上，
   * 而不是整块玻璃糊一层彩边。这正是真玻璃（以及苹果那套）的样子，
   * 也是作者最早那条反馈「上下色散太多太突兀」的根治办法。
   *
   * 省略 / 0 = 不做色散。
   */
  fringe?: number;
  /**
   * 色散拆成几段光谱。默认 **3**（R / G / B 各留一个通道，精确无损）——
   * 那是「简洁」档：肉眼是"一侧偏冷、一侧偏暖"的两三条边。
   *
   * 设成 **6** 就是「极致」档：把画面拆成六段色向量（紫/蓝/青/绿/黄/红）分别位移再叠回，
   * 六段之和 = 白（颜色空间里的分区单位），所以位移为 0 的地方叠回来 ≈ 原画面、不整体偏色。
   * 这才是肉眼能数出「红橙黄绿青蓝紫」的量级 —— 三通道最多只给互补的两三条边。
   */
  bands?: number;
}

export const LENS_PLAYER: LensParams = { bezel: 0.58, strength: 1.2, zoom: 0.02, edge: 0.2 };
export const LENS_PANEL: LensParams = { bezel: 0.72, strength: 2.0, zoom: 0.02, edge: 0.24 };
/**
 * 底栏参数不再写成两个"整包常量"，而是拆成**两条正交的轴**（见下方的
 * `DOCK_WARP_CONCISE` / `DOCK_WARP_THICK` 与 `dockLensParams`）：
 *
 *   · **扭曲档**（几何）—— 掰弯多少、分布多宽。历史沿革就在这一轴上：
 *     `6aeae6d` 厚透镜（bezel 0.85 / strength 1.6 / backdrop 封顶 26px，真机看得见）
 *     → `507e204` 减配（0.46 / 1.0 / 10px）→ `7973ced` 六项整改（0.30 / 0.9 / 7px，看不见了）
 *     → 现在「厚透镜 / 收窄 / 关」三档由作者自己选。
 *   · **色散档**（颜色）—— 只在边缘带分离多少色（fringe），以及拆 3 段还是 6 段光谱。
 *
 * 之所以拆开：当初"色散没了"那次判断失手，根因就是把**几何**和**颜色**揉在同一个常量里 ——
 * 为了压掉色散把位移也删了。拆开之后再也不会互相误伤。
 */

/** 底栏色散档位（设置项） */
export type DockDispersion = 'off' | 'concise' | 'ultimate';

/** 底栏扭曲档位（设置项）—— 管几何，与色散档正交 */
export type DockWarp = 'off' | 'concise' | 'thick';

/**
 * 扭曲几何之一：**收窄**（`7973ced` 六项整改后的口径）。
 *
 * 出处是 stray 洋葱 那条 issue 的第 3 条「边缘扭曲区域太大，显得夸张」——
 * 当时的改法不是调小强度（那样只是变淡、分布照样铺满整块），而是改**衰减形状**：
 * falloff 提到 3、bezel 砍到 0.30、backdrop 封顶压到 7px，扭曲只留在边缘一线。
 */
export const DOCK_WARP_CONCISE = {
  bezel: 0.3,
  strength: 0.9,
  zoom: 0.004,
  edge: 0.2,
  falloff: 3,
  backdropMax: 7,
  backdropFactor: 0.16,
} as const;

/**
 * 扭曲几何之二：**厚透镜**（commit `6aeae6d`「底栏换厚透镜 + 治撞墙误报」那版口径）。
 *
 * 为什么这版值得单开一档：底栏很扁（68 高），按播放条那套参数（bezel 0.58）根本看不出掰弯，
 * 那一版把 bezel 拉到 **0.85**、strength **1.6**、backdrop 位移封顶 **26px**，
 * 作者当时的验收是"能明显看到文字被横向拉开 + 蓝橙色边，关掉 --lg-backdrop 的对照图几乎无变化"。
 * 后来 `507e204`（按反馈减配）与 `7973ced`（六项整改）把它一路收窄到 0.30，
 * 于是"扭曲"这件事在真机上就看不见了 —— 这一档就是把它原样找回来。
 *
 * 唯一与当年不同的一处：`falloff` 仍取 **3**（当年是默认的平方）。
 * 因为"分布别铺满整块"这条反馈是对的，与"幅度要看得出来"并不冲突：
 * 厚透镜 + 三次方衰减 = 幅度够大、但只集中在边缘那条窄带上。
 */
export const DOCK_WARP_THICK = {
  bezel: 0.85,
  strength: 1.6,
  zoom: 0.025,
  edge: 0.26,
  falloff: 3,
  backdropMax: 26,
  backdropFactor: 0.4,
} as const;

/**
 * 生效的色散档位：设置项 + 允许用 `?dispersion=` **覆盖一次**（取值是白名单里的字面量，
 * 所以不构成注入面：`?dispersion=xxx` 只会落回设置值）。
 *
 * 为什么要有这个覆盖：量测脚本 `build/check-dock-dispersion.cjs` 要把两档各量一遍，
 * 但它点不了设置页的弹层；真机核对时同理（想临时看看极致档什么效果）。
 */
export function effectiveDispersion(setting: DockDispersion | undefined): DockDispersion {
  if (typeof window !== 'undefined') {
    const override = new URLSearchParams(window.location.search).get('dispersion');
    if (override === 'off' || override === 'concise' || override === 'ultimate') return override;
  }
  return setting ?? 'concise';
}

/** 生效的扭曲档位：设置项 + `?warp=` 覆盖一次（同上，给量测脚本与真机核对用） */
export function effectiveWarp(setting: DockWarp | undefined): DockWarp {
  if (typeof window !== 'undefined') {
    const override = new URLSearchParams(window.location.search).get('warp');
    if (override === 'off' || override === 'concise' || override === 'thick') return override;
  }
  return setting ?? 'thick';
}

/**
 * 档位 → 透镜参数。几何来自**扭曲档**，颜色分离来自**色散档**，两者互不干扰。
 *
 * 默认「厚透镜 + 简洁色散」：这就是作者要的"有扭曲效果"那一版，
 * 而色散仍停在收窄口径（彩边只在边缘那圈弧面上，不是整块泛色）。
 */
export function dockLensParams(mode: DockDispersion = 'concise', warp: DockWarp = 'thick'): LensParams {
  const geometry = warp === 'thick' ? DOCK_WARP_THICK : DOCK_WARP_CONCISE;
  const color: Pick<LensParams, 'fringe' | 'bands'> =
    /* 「极致」档的分离量：作者 2026-09-25 的要求是「要极限就要用最极限的」——
       从 6px 提到 **20px**（简洁档 3.2px 的 6.25 倍）。滤镜链节点数一个没变
       （仍是 6 位移 + 6 矩阵 + 5 叠加），只是每段的位移量拉大，虹带明显更宽更艳。
       实测（灰阶棋盘，底栏上边缘带 |R−B|，中间带 = 噪声底）：
         fringe 6  → 轻档 23.06 / 强档 13.47
         fringe 20 → 轻档 **65.57** / 强档 **37.64**（中间带 3.42 / 2.92，仍是 19× / 13× 的落差） */
    mode === 'ultimate' ? { fringe: 20, bands: 6 } : mode === 'off' ? { fringe: 0 } : { fringe: 3.2 };
  if (warp === 'off') {
    /* 「关」= 不做折射位移：强度与 zoom 归零，只留 edge rim（CSS 拿它画高光）。
       注意色散仍然需要位移才有意义 —— 位移为 0 时色差自动为 0，所以这里直接把 fringe 也归零。 */
    return { ...DOCK_WARP_CONCISE, ...color, strength: 0, zoom: 0, backdropFactor: 0, fringe: 0, bands: 3 };
  }
  return { ...geometry, ...color };
}

export interface LensMap {
  mapUrl: string;
  edgeUrl: string;
  scale: number;
  key: string;
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const smoothStep = (a: number, b: number, t: number) => {
  const x = clamp((t - a) / (b - a), 0, 1);
  return x * x * (3 - 2 * x);
};

/** 圆角矩形有符号距离场：内部为负，边界为 0 */
function roundedRectSDF(x: number, y: number, hw: number, hh: number, r: number): number {
  const qx = Math.abs(x) - hw + r;
  const qy = Math.abs(y) - hh + r;
  return Math.min(Math.max(qx, qy), 0) + Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - r;
}

/** 生成位移图与边缘图（尺寸或参数变化时才重建）
 *
 *  **半分辨率**：位移贴图是很软的折射场，按 0.5 倍像素生成、由 SVG 拉伸回元素尺寸，
 *  肉眼无差别，但像素数少 4 倍 —— 手机上这一步的主线程开销（逐像素循环 + 两次 base64 编码，
 *  实测能到 300~400ms 长任务）直接降到四分之一。feImage 已设 preserveAspectRatio="none"，
 *  贴图会被拉到元素尺寸；feDisplacementMap 的 scale 用的是元素像素单位，与贴图分辨率无关。
 */
const MAP_SCALE = 0.5;

export function buildLensMap(
  width: number,
  height: number,
  radius: number,
  params: LensParams,
): LensMap {
  const falloff = params.falloff ?? 2;
  const key = [width, height, Math.round(radius), params.bezel, params.strength, params.zoom, falloff].join(':');
  const mapWidth = Math.max(8, Math.round(width * MAP_SCALE));
  const mapHeight = Math.max(8, Math.round(height * MAP_SCALE));
  const canvas = document.createElement('canvas');
  canvas.width = mapWidth;
  canvas.height = mapHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return { mapUrl: '', edgeUrl: '', scale: 1, key };

  const img = ctx.createImageData(mapWidth, mapHeight);
  const edge = ctx.createImageData(mapWidth, mapHeight);
  const raw = new Float32Array(mapWidth * mapHeight * 2);
  const hw = mapWidth / 2;
  const hh = mapHeight / 2;
  const scaledRadius = radius * MAP_SCALE;
  // 弧面厚度跟随圆角半径：宽扁的胶囊不会被拉伸到中心
  const bezel = Math.min(hw, hh, scaledRadius || Math.min(mapWidth, mapHeight) / 2) * params.bezel;
  const k = params.strength;
  let maxD = 0.0001;

  for (let y = 0; y < mapHeight; y += 1) {
    for (let x = 0; x < mapWidth; x += 1) {
      const cx = x + 0.5 - hw;
      const cy = y + 0.5 - hh;
      const d = roundedRectSDF(cx, cy, hw, hh, scaledRadius);
      // 0=深处 → 1=边缘；falloff 越大掉得越快，位移越集中在边缘窄带上
      const m = Math.pow(smoothStep(-bezel, 0, d), falloff);
      const nx = roundedRectSDF(cx + 0.5, cy, hw, hh, scaledRadius) - roundedRectSDF(cx - 0.5, cy, hw, hh, scaledRadius);
      const ny = roundedRectSDF(cx, cy + 0.5, hw, hh, scaledRadius) - roundedRectSDF(cx, cy - 0.5, hw, hh, scaledRadius);
      const len = Math.hypot(nx, ny) || 1;
      const dx = -(nx / len) * m * k * bezel - cx * params.zoom;
      const dy = -(ny / len) * m * k * bezel - cy * params.zoom;
      const i = (y * mapWidth + x) * 2;
      raw[i] = dx;
      raw[i + 1] = dy;
      maxD = Math.max(maxD, Math.abs(dx), Math.abs(dy));

      const p = (y * mapWidth + x) * 4;
      edge.data[p] = 255;
      edge.data[p + 1] = 255;
      edge.data[p + 2] = 255;
      // 只在弧面内侧留一圈窄 rim（散射带的宽度就由它决定；太平会让模糊铺满整块）
      const rim = smoothStep(-1.6, -0.7, d) * (1 - smoothStep(-0.25, 0.35, d));
      edge.data[p + 3] = d <= 0 ? Math.round(rim * 255) : 0;
    }
  }

  // 位移量按元素像素换算（贴图是半分辨率，位移场要按 1/MAP_SCALE 放大回来）
  const scale = (maxD * 2) / MAP_SCALE;
  const data = img.data;
  for (let i = 0, p = 0; i < raw.length; i += 2, p += 4) {
    data[p] = clamp(raw[i] / (maxD * 2) + 0.5, 0, 1) * 255;
    data[p + 1] = clamp(raw[i + 1] / (maxD * 2) + 0.5, 0, 1) * 255;
    data[p + 2] = 128;
    data[p + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const mapUrl = canvas.toDataURL();
  ctx.putImageData(edge, 0, 0);
  const edgeUrl = canvas.toDataURL();

  return { mapUrl, edgeUrl, scale, key };
}
