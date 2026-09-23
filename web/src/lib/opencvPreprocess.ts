/**
 * 教材封面的 OpenCV 预处理。
 *
 * 目标：把手机随手拍的照片整理成 OCR 好读的样子，且**全部在浏览器里跑**。
 * 四步：
 *   1. 缩放与灰度化（长边压到 1600，兼顾识别率与耗时）
 *   2. 找封面主体并裁切（书本在照片里通常只占一部分，桌面背景会干扰 OCR）
 *   3. 自适应阈值 + 闭运算，聚出「文字块」，只把文字区送进 OCR
 *   4. 输出若干候选视图分别识别，谁分高用谁
 *
 * 每一步都可能失败（照片太糊、没有明显边界），失败时退化为「不处理」而不是报错 ——
 * 识别是尽力而为的功能，不能让预处理挡住主流程。所有 Mat 都在 finally 里释放。
 */
import { loadOpenCv } from './opencvLoader';
import type { CvMat, CvModule } from './opencvLoader';
import type { TextRegion } from './localOcrTypes';

interface Candidate {
  /** 给用户看的名字 */
  label: string;
  /** 交给 OCR 的 data URL */
  url: string;
}

export interface PreprocessOutcome {
  candidates: Candidate[];
  regions: TextRegion[];
  /** 处理过程中的说明（界面上可展示，也便于排错） */
  notes: string[];
}

const MAX_EDGE = 1000;

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('图片解码失败'));
    image.src = dataUrl;
  });
}

function toCanvas(image: HTMLImageElement, maxEdge = MAX_EDGE): HTMLCanvasElement {
  const longest = Math.max(image.naturalWidth, image.naturalHeight) || 1;
  const scale = Math.min(1, maxEdge / longest);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('画布不可用');
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas;
}

const canvasToDataUrl = (canvas: HTMLCanvasElement, quality = 0.92): string =>
  canvas.toDataURL('image/jpeg', quality);

/** 灰度 Mat → canvas */
function grayMatToCanvas(mat: CvMat): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = mat.cols;
  canvas.height = mat.rows;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('画布不可用');
  const rgba = context.createImageData(mat.cols, mat.rows);
  const src = mat.data;
  for (let i = 0; i < mat.cols * mat.rows; i += 1) {
    const value = src[i];
    rgba.data[i * 4] = value;
    rgba.data[i * 4 + 1] = value;
    rgba.data[i * 4 + 2] = value;
    rgba.data[i * 4 + 3] = 255;
  }
  context.putImageData(rgba, 0, 0);
  return canvas;
}

/**
 * 把 canvas 读成一个 RGBA Mat（调用方负责 delete）。
 *
 * 故意不用 `cv.imread`：各版本 opencv.js 对它的签名不一致（有的只接受
 * image element 或 canvas 的 id 字符串），传 canvas 会抛
 * 「Please input the valid canvas or img id」。`matFromImageData` 只吃
 * ImageData，签名稳定、行为确定，也不用猜。
 */
function canvasToMat(cv: CvModule, canvas: HTMLCanvasElement): CvMat {
  const context = canvas.getContext('2d');
  if (!context) throw new Error('画布不可用');
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  return cv.matFromImageData(imageData);
}

/** 把 canvas 读进一个新建的灰度 Mat（调用方负责 delete） */
function readGray(cv: CvModule, canvas: HTMLCanvasElement): CvMat {
  const source = canvasToMat(cv, canvas);
  const gray = new cv.Mat();
  try {
    cv.cvtColor(source, gray, cv.COLOR_RGBA2GRAY);
    return gray;
  } catch (error) {
    gray.delete();
    throw error;
  } finally {
    source.delete();
  }
}

/** 找封面主体（面积最大且够大的亮块）；找不到返回 null */
function findCoverRect(cv: CvModule, gray: CvMat): { x: number; y: number; width: number; height: number } | null {
  const blurred = new cv.Mat();
  const binary = new cv.Mat();
  const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(5, 5));
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();
  try {
    cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);
    // Otsu：自动分「亮（封面）/ 暗（桌面阴影）」
    cv.threshold(blurred, binary, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU);
    cv.morphologyEx(binary, binary, cv.MORPH_CLOSE, kernel);
    cv.findContours(binary, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    const total = gray.cols * gray.rows;
    let best: { area: number; rect: { x: number; y: number; width: number; height: number } } | null = null;
    for (let i = 0; i < contours.size(); i += 1) {
      const contour = contours.get(i);
      try {
        const area = cv.contourArea(contour);
        // 面积要 ≥ 图面 20% 才可能是封面本体，而不是桌面上的杂物
        if (area >= total * 0.2 && (!best || area > best.area)) {
          best = { area, rect: cv.boundingRect(contour) };
        }
      } finally {
        contour.delete();
      }
    }
    return best ? best.rect : null;
  } finally {
    blurred.delete();
    binary.delete();
    kernel.delete();
    contours.delete();
    hierarchy.delete();
  }
}

/** 聚出文字块的包围盒；找不到返回 null */
function findTextBlock(cv: CvModule, gray: CvMat): { x: number; y: number; width: number; height: number } | null {
  const binary = new cv.Mat();
  const merged = new cv.Mat();
  // 横向扁核：把同一行的字连成一条，同时避免上下行黏在一起
  const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(17, 5));
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();
  try {
    cv.adaptiveThreshold(gray, binary, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, 25, 12);
    // adaptiveThreshold 出来是「背景白、文字黑」，闭运算前先反色会让文字区更连续
    cv.threshold(binary, binary, 127, 255, cv.THRESH_BINARY_INV);
    cv.morphologyEx(binary, merged, cv.MORPH_CLOSE, kernel);
    cv.findContours(merged, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = 0;
    let maxY = 0;
    let kept = 0;
    const total = gray.cols * gray.rows;
    for (let i = 0; i < contours.size(); i += 1) {
      const contour = contours.get(i);
      try {
        const area = cv.contourArea(contour);
        // 太小的当噪点，太大的当整幅底色
        if (area > total * 0.0002 && area < total * 0.6) {
          const rect = cv.boundingRect(contour);
          minX = Math.min(minX, rect.x);
          minY = Math.min(minY, rect.y);
          maxX = Math.max(maxX, rect.x + rect.width);
          maxY = Math.max(maxY, rect.y + rect.height);
          kept += 1;
        }
      } finally {
        contour.delete();
      }
    }
    if (!kept || !Number.isFinite(minX)) return null;
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  } finally {
    binary.delete();
    merged.delete();
    kernel.delete();
    contours.delete();
    hierarchy.delete();
  }
}

/**
 * 裁一块并缩放到 OCR 友好尺寸。
 *
 * 尺寸上限是实测调出来的：最初写成「长边不足 1400 就放大到 1400」，结果裁切后的
 * 封面上屏到 ~2300px，Tesseract 对这么大的图要切出几百行文本，一张图就要几分钟 ——
 * 表现为识别「卡死」。现在：
 *   · 长边上限 1600（再大只是变慢，准确率提升有限）
 *   · 最多放大 2 倍（避免把小图硬撑成巨图）
 */
function cropAndScale(
  source: HTMLCanvasElement,
  box: { x: number; y: number; width: number; height: number },
): HTMLCanvasElement {
  const pad = 12;
  const x = Math.max(0, box.x - pad);
  const y = Math.max(0, box.y - pad);
  const width = Math.max(1, Math.min(source.width - x, box.width + pad * 2));
  const height = Math.max(1, Math.min(source.height - y, box.height + pad * 2));
  const longest = Math.max(width, height);
  const scale = Math.min(MAX_EDGE / longest, 2);
  const target = document.createElement('canvas');
  target.width = Math.max(1, Math.round(width * scale));
  target.height = Math.max(1, Math.round(height * scale));
  const context = target.getContext('2d');
  if (context) {
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(source, x, y, width, height, 0, 0, target.width, target.height);
  }
  return target;
}

/** 主入口：预处理一张封面图，产出多个候选视图。 */
export async function preprocessCover(dataUrl: string, allowCdn = false): Promise<PreprocessOutcome> {
  const notes: string[] = [];
  const regions: TextRegion[] = [];
  const candidates: Candidate[] = [];

  const image = await loadImage(dataUrl);
  const base = toCanvas(image);
  // 原图永远作为兜底候选：预处理万一帮倒忙，还能靠它
  candidates.push({ label: '原图（未处理）', url: canvasToDataUrl(base) });

  let cv: CvModule;
  try {
    cv = await loadOpenCv(allowCdn);
  } catch (error) {
    notes.push(`未启用 OpenCV 预处理：${error instanceof Error ? error.message : '未知错误'}。已退回原图识别。`);
    return { candidates, regions, notes };
  }

  let working = base;
  let baseGray: CvMat | null = null;
  try {
    baseGray = readGray(cv, base);
    const cover = findCoverRect(cv, baseGray);
    if (cover && cover.width > base.width * 0.25 && cover.height > base.height * 0.25) {
      working = cropAndScale(base, cover);
      const url = canvasToDataUrl(working);
      candidates.push({ label: '封面区域（已裁切）', url });
      regions.push({ box: cover, reason: '面积最大且大于图面 20% 的亮块，判定为封面本体', previewUrl: url });
      notes.push(`已按封面轮廓裁切：${cover.width}×${cover.height}`);
    } else {
      notes.push('没找到明显的封面轮廓，按整图处理');
    }
  } catch (error) {
    notes.push(`找封面轮廓失败，按整图处理：${error instanceof Error ? error.message : '未知错误'}`);
  } finally {
    baseGray?.delete();
  }

  // 文字块聚焦
  let workGray: CvMat | null = null;
  try {
    workGray = readGray(cv, working);
    const block = findTextBlock(cv, workGray);
    if (block) {
      const textOnly = cropAndScale(working, block);
      const url = canvasToDataUrl(textOnly);
      candidates.push({ label: '文字区域（已聚焦）', url });
      regions.push({ box: block, reason: '自适应阈值 + 横向闭运算聚合出的文字块包围盒', previewUrl: url });
      notes.push(`已聚焦文字区：${block.width}×${block.height}`);
    } else {
      notes.push('没聚合出文字块，跳过聚焦（多半是封面底色太花）');
    }
  } catch (error) {
    notes.push(`文字块聚焦失败，跳过：${error instanceof Error ? error.message : '未知错误'}`);
  } finally {
    workGray?.delete();
  }

  // 二值化：抗反光与阴影，对封面上的小字更稳
  let binGray: CvMat | null = null;
  const binary = new cv.Mat();
  try {
    binGray = readGray(cv, working);
    cv.adaptiveThreshold(binGray, binary, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, 31, 10);
    const canvas = grayMatToCanvas(binary);
    candidates.push({ label: '二值化（抗反光）', url: canvasToDataUrl(canvas, 0.95) });
  } catch (error) {
    notes.push(`二值化失败，跳过：${error instanceof Error ? error.message : '未知错误'}`);
  } finally {
    binGray?.delete();
    binary.delete();
  }

  return { candidates, regions, notes };
}
