/**
 * OpenCV.js 懒加载器。
 *
 * 为什么懒加载：OpenCV 的 wasm 解包约 14 MB，而本仓库要求任何入库文件不得超过 2 MB
 * （scripts/check-repo-hygiene.mjs），APK 也只有 3.4 MB。所以它不进主包、不进仓库，
 * 只在「真的要识别封面」时按需从本地取一次，之后由浏览器缓存。
 *
 * 取源顺序（默认全本地）：
 *   1. /ocr/opencv/opencv.js  —— npm run setup:ocr 放好的本地副本（**唯一默认来源**）
 *   2. 公网 CDN               —— 仅当显式把 settings.localOcrCdn 打开时才回落
 *
 * 这里**故意不 import node_modules 里的包**：那样 Vite 会把它打成一个 15 MB 的 chunk，
 * 构建产物会从 2 MB 涨到 17 MB，每次发版都拖着它 —— 与「大件不入包」的初衷相反。
 * node_modules 里的那份只作为 setup:ocr 的复制来源。
 */
import type { OcrProgress } from './localOcrTypes';

const CDN_OPENCV = 'https://docs.opencv.org/4.10.0/opencv.js';

/**
 * 本地副本的地址。
 *
 * 必须走 `import.meta.env.BASE_URL`（本应用 base = './'）而不是写死 `./ocr/...`：
 * 相对路径是按**当前页面**解析的，页面越深（例如带路由的 /foo/bar）就会解析到
 * /foo/ocr/... 从而 404 —— 端到端验证时正是这里让本地识别整个不可用。
 * BASE_URL 在开发、Pages 子路径、以及 APK 的 assets/www/ 三种场景下都能解析对。
 */
export function localOcrUrl(rest: string): string {
  const base = import.meta.env.BASE_URL || './';
  return `${base}${rest}`.replace(/([^:]\/)\/+/g, '$1');
}

const localOpenCvUrl = () => localOcrUrl('ocr/opencv/opencv.js');

type CvModule = {
  Mat: new (...args: unknown[]) => CvMat;
  /** 用 ImageData 构造 Mat（签名稳定，优于各版本不一致的 imread） */
  matFromImageData: (imageData: ImageData) => CvMat;
  cvtColor: (src: CvMat, dst: CvMat, code: number) => void;
  GaussianBlur: (src: CvMat, dst: CvMat, size: unknown, sigma: number) => void;
  adaptiveThreshold: (
    src: CvMat,
    dst: CvMat,
    maxValue: number,
    adaptiveMethod: number,
    thresholdType: number,
    blockSize: number,
    c: number,
  ) => void;
  getStructuringElement: (shape: number, size: unknown) => CvMat;
  dilate: (src: CvMat, dst: CvMat, kernel: CvMat) => void;
  morphologyEx: (src: CvMat, dst: CvMat, op: number, kernel: CvMat) => void;
  findContours: (src: CvMat, contours: CvMatVector, hierarchy: CvMat, mode: number, method: number) => void;
  contourArea: (contour: CvMat) => number;
  boundingRect: (contour: CvMat) => { x: number; y: number; width: number; height: number };
  minAreaRect: (points: CvMat) => { center: { x: number; y: number }; size: { width: number; height: number }; angle: number };
  boxPoints: (rect: unknown, points: CvMat) => void;
  getRotationMatrix2D: (center: unknown, angle: number, scale: number) => CvMat;
  warpAffine: (src: CvMat, dst: CvMat, m: CvMat, size: unknown, flags: number, borderMode: number, borderValue: unknown) => void;
  mean: (src: CvMat) => { 0: number };
  threshold: (src: CvMat, dst: CvMat, thresh: number, maxValue: number, type: number) => void;
  resize: (src: CvMat, dst: CvMat, size: unknown, fx: number, fy: number, interpolation: number) => void;
  MatVector: new () => CvMatVector;
  Size: new (w: number, h: number) => unknown;
  Mat1?: unknown;
  matFromArray?: unknown;
  Scalar: new (...args: number[]) => unknown;
  COLOR_RGBA2GRAY: number;
  ADAPTIVE_THRESH_GAUSSIAN_C: number;
  THRESH_BINARY: number;
  THRESH_OTSU: number;
  MORPH_RECT: number;
  MORPH_CLOSE: number;
  RETR_EXTERNAL: number;
  CHAIN_APPROX_SIMPLE: number;
  INTER_CUBIC: number;
  INTER_AREA: number;
  BORDER_REPLICATE: number;
  BORDER_CONSTANT: number;
};

type CvMat = {
  rows: number;
  cols: number;
  data: Uint8Array;
  data32S: Int32Array;
  delete: () => void;
  roi: (rect: { x: number; y: number; width: number; height: number }) => CvMat;
  clone: () => CvMat;
};

type CvMatVector = {
  size: () => number;
  get: (index: number) => CvMat;
  delete: () => void;
};

let cached: Promise<CvModule> | null = null;

/** 把 opencv.js 注入到页面并等它在 window.cv 上就绪。 */
function injectScript(src: string): Promise<CvModule> {
  return new Promise((resolve, reject) => {
    const win = window as unknown as { cv?: CvModule | (() => Promise<CvModule>) };
    const previous = win.cv;
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onerror = () => {
      script.remove();
      win.cv = previous;
      reject(new Error(`加载 OpenCV 失败：${src}`));
    };
    script.onload = () => {
      const cv = win.cv;
      if (!cv) {
        reject(new Error('OpenCV 脚本已加载，但 window.cv 未出现'));
        return;
      }
      // OpenCV 4.x 的 ESM 版在 window.cv 上挂的是一个返回 Promise 的工厂
      if (typeof cv === 'function') {
        (cv as () => Promise<CvModule>)()
          .then((mod) => {
            win.cv = mod;
            resolve(mod);
          })
          .catch(reject);
        return;
      }
      // 经典版：等 runtime 初始化完成（calledRun / onRuntimeInitialized）
      const ready = cv as CvModule & { calledRun?: boolean; onRuntimeInitialized?: () => void };
      if (ready.calledRun) {
        resolve(ready);
        return;
      }
      const timer = window.setTimeout(() => resolve(ready), 15000);
      ready.onRuntimeInitialized = () => {
        window.clearTimeout(timer);
        resolve(ready);
      };
    };
    document.head.appendChild(script);
  });
}

/** 只用本地副本：准备好就注入并等就绪，没准备就抛错（由外层决定是否回落 CDN） */
async function loadFromLocal(): Promise<CvModule> {
  const url = localOpenCvUrl();
  const head = await fetch(url, { method: 'HEAD' });
  if (!head.ok) throw new Error(`本地副本不存在（HTTP ${head.status}）：${url}`);
  return injectScript(url);
}

/** 载入 OpenCV（只加载一次）。allowCdn=true 时才允许回落到公网。 */
export function loadOpenCv(allowCdn = false, onProgress?: (p: OcrProgress) => void): Promise<CvModule> {
  if (cached) return cached;
  cached = (async () => {
    onProgress?.({ phase: 'opencv', ratio: 0, text: '正在载入图像处理库（OpenCV）…' });
    try {
      const cv = await loadFromLocal();
      onProgress?.({ phase: 'opencv', ratio: 1, text: '图像处理库已就绪' });
      return cv;
    } catch (error) {
      if (!allowCdn) {
        cached = null;
        throw new Error(
          `本地没有 OpenCV：${
            error instanceof Error ? error.message : '未知错误'
          }。请运行 npm run setup:ocr 把它放到 web/public/ocr/，或在设置里允许本地识别回落到 CDN。`,
        );
      }
      onProgress?.({ phase: 'opencv', ratio: 0.5, text: '本地没有 OpenCV，改用 CDN…' });
      const cv = await injectScript(CDN_OPENCV);
      onProgress?.({ phase: 'opencv', ratio: 1, text: '图像处理库已就绪（CDN）' });
      return cv;
    }
  })();
  return cached;
}

/** 供「本地识别能力自检」用：不抛错，只报告能不能用。 */
export async function probeOpenCv(): Promise<boolean> {
  try {
    await loadOpenCv(false);
    return true;
  } catch {
    return false;
  }
}

export type { CvModule, CvMat };
