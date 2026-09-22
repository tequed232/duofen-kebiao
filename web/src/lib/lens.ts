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
}

export const LENS_PLAYER: LensParams = { bezel: 0.58, strength: 1.2, zoom: 0.02, edge: 0.2 };
export const LENS_PANEL: LensParams = { bezel: 0.9, strength: 2.5, zoom: 0.025, edge: 0.3 };
/** 底栏专用：比播放条那套更厚更狠 —— 底栏很扁（68 高），bezel 窄了根本看不出掰弯 */
export const LENS_DOCK: LensParams = { bezel: 0.85, strength: 1.6, zoom: 0.025, edge: 0.26 };

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
  const key = [width, height, Math.round(radius), params.bezel, params.strength, params.zoom].join(':');
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
      let m = smoothStep(-bezel, 0, d); // 0=深处 → 1=边缘
      m *= m; // 平滑衰减，中心几乎无形变
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
