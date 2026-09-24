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
}

export const LENS_PLAYER: LensParams = { bezel: 0.58, strength: 1.2, zoom: 0.02, edge: 0.2 };
export const LENS_PANEL: LensParams = { bezel: 0.72, strength: 2.0, zoom: 0.02, edge: 0.24 };
/**
 * 底栏专用 —— **极致液态玻璃版**。
 *
 * 调参依据（作者对真机观感的反馈）：
 *   「边缘扭曲区域太大，显得夸张；苹果的扭曲是收窄 + 聚焦在选中胶囊周围的一小块，
 *     衰减很快，不是整个 dock 都在扭」
 *
 * 所以不再靠"把强度调小"来收敛（那样只是变淡，分布还是铺满整块），而是改**衰减形状**：
 *   · falloff **3**（三次方，原来是平方）：位移集中到边缘一条窄带，往中心掉得更快
 *   · bezel 0.85 → **0.30**：透镜带厚度只剩原来的三分之一强
 *   · strength **0.9**：幅度收一档，避免「果冻糊掉」
 *   · zoom **0.004**（原 0.012）：背景放大感再减，也让色散不至于顺着整面铺开
 *   · backdropMax 10 → **7px**、backdropFactor 0.22 → **0.16**：真实背景只被掰弯一点点
 *
 * 色散（后来又加回来一次，见 docs/liquidglass-ultimate.md）：当初为了消掉
 * 「上下色散太多太突兀」把三通道位移整条删了，结果作者反过来问「色散怎么没了」。
 * 删错的不是色散本身，是**它的分布**：原实现是给整个贴图配三个固定的位移量，
 * 于是整块玻璃都在分离色彩。现在改成 fringe（位移量之差，px）——
 * 色差与位移成正比，中间自动为零，只在边缘那条被掰弯的窄带上出现。
 */
export const LENS_DOCK: LensParams = {
  bezel: 0.3,
  strength: 0.9,
  /* zoom 从 0.012 降到 0.004：这一项是**整块线性放大**，它带来的位移在左右两端最大，
     于是色散会顺着整个面铺开 —— 正好是作者最初嫌的那种「色散太多」的分布。
     折射的「掰弯」观感来自 bezel 那一项（边缘法线方向），zoom 只是附带的放大感，
     1.2% → 0.4% 肉眼几乎无差别，但中间那片的彩边掉了三倍。 */
  zoom: 0.004,
  edge: 0.2,
  falloff: 3,
  backdropMax: 7,
  backdropFactor: 0.16,
  /* 边缘处 R/B 通道的位移量与 G 相差 3.2px（换算成实际的横向彩色分离约 1.6px）。
     调参台 build/tune-dock-dispersion.cjs 扫过 0/2.4/3.2：
     上边缘带的 |R−B| 依次 0.98 → 4.07 → 5.37（无色的噪声底 0.98），
     下边缘带 1.00 → 5.04 → 6.85，而中间带在三个取值下都停在 0.42（= 噪声底）——
     也就是说彩边只出现在边缘那圈弧面上，玻璃中间是干净的。
     想更明显就调大，想彻底关掉写 0。 */
  fringe: 3.2,
};

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
