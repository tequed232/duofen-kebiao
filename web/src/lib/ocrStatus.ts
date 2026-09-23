/**
 * 本地识别（OpenCV + Tesseract）资源状态探测。
 *
 * 为什么需要：识别要能跑，必须本机放着 opencv.js 与中文模型（npm run setup:ocr 生成，
 * 约 58 MB，不入库；APK 里由 syncOcrAssets 打进 assets/www/ocr/）。
 * 这些文件缺了时识别只会「失败」，用户看不出原因 —— 所以在设置页把它探出来：
 * 逐项报告「图像处理库 / 识别引擎 / 中文模型」是否就绪，缺哪个直接说。
 *
 * 用 HEAD 请求探测，不下载内容；每项都带硬超时（大文件上的 HEAD 可能长时间不返回，
 * 之前就让识别流程挂住过）。
 */
import { localOcrUrl } from './opencvLoader';

export interface OcrAssetStatus {
  /** 图像处理库（OpenCV，封面裁切 / 聚焦 / 二值化） */
  opencv: boolean;
  /** OCR 引擎核心（Tesseract wasm） */
  engine: boolean;
  /** 中文识别模型（chi_sim） */
  lang: boolean;
  /** 三项齐全才代表本地识别可用 */
  ready: boolean;
}

async function exists(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(6000) });
    return response.ok;
  } catch {
    return false;
  }
}

export async function probeOcrAssets(): Promise<OcrAssetStatus> {
  const [opencv, engine, lang] = await Promise.all([
    exists(localOcrUrl('ocr/opencv/opencv.js')),
    exists(localOcrUrl('ocr/tesseract/worker.min.js')),
    exists(localOcrUrl('ocr/tesseract/lang/chi_sim.traineddata')),
  ]);
  return { opencv, engine, lang, ready: opencv && engine && lang };
}
