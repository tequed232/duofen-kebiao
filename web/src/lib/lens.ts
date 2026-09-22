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

/** 生成位移图与边缘图（尺寸或参数变化时才重建） */
export function buildLensMap(
  width: number,
  height: number,
  radius: number,
  params: LensParams,
): LensMap {
  const key = [width, height, Math.round(radius), params.bezel, params.strength, params.zoom].join(':');
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return { mapUrl: '', edgeUrl: '', scale: 1, key };

  const img = ctx.createImageData(width, height);
  const edge = ctx.createImageData(width, height);
  const raw = new Float32Array(width * height * 2);
  const hw = width / 2;
  const hh = height / 2;
  // 弧面厚度跟随圆角半径：宽扁的胶囊不会被拉伸到中心
  const bezel = Math.min(hw, hh, radius || Math.min(width, height) / 2) * params.bezel;
  const k = params.strength;
  let maxD = 0.0001;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const cx = x + 0.5 - hw;
      const cy = y + 0.5 - hh;
      const d = roundedRectSDF(cx, cy, hw, hh, radius);
      let m = smoothStep(-bezel, 0, d); // 0=深处 → 1=边缘
      m *= m; // 平滑衰减，中心几乎无形变
      const nx = roundedRectSDF(cx + 0.5, cy, hw, hh, radius) - roundedRectSDF(cx - 0.5, cy, hw, hh, radius);
      const ny = roundedRectSDF(cx, cy + 0.5, hw, hh, radius) - roundedRectSDF(cx, cy - 0.5, hw, hh, radius);
      const len = Math.hypot(nx, ny) || 1;
      const dx = -(nx / len) * m * k * bezel - cx * params.zoom;
      const dy = -(ny / len) * m * k * bezel - cy * params.zoom;
      const i = (y * width + x) * 2;
      raw[i] = dx;
      raw[i + 1] = dy;
      maxD = Math.max(maxD, Math.abs(dx), Math.abs(dy));

      const p = (y * width + x) * 4;
      edge.data[p] = 255;
      edge.data[p + 1] = 255;
      edge.data[p + 2] = 255;
      // 只在弧面内侧留一圈 rim
      const rim = smoothStep(-2.2, -1.1, d) * (1 - smoothStep(-0.3, 0.5, d));
      edge.data[p + 3] = d <= 0 ? Math.round(rim * 255) : 0;
    }
  }

  const scale = maxD * 2;
  const data = img.data;
  for (let i = 0, p = 0; i < raw.length; i += 2, p += 4) {
    data[p] = clamp(raw[i] / scale + 0.5, 0, 1) * 255;
    data[p + 1] = clamp(raw[i + 1] / scale + 0.5, 0, 1) * 255;
    data[p + 2] = 128;
    data[p + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const mapUrl = canvas.toDataURL();
  ctx.putImageData(edge, 0, 0);
  const edgeUrl = canvas.toDataURL();

  return { mapUrl, edgeUrl, scale, key };
}
