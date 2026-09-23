/**
 * 本地 OCR（Tesseract.js）。
 *
 * 语言数据 chi_sim 约 21 MB、引擎 wasm 约 29 MB —— 都远超本仓库「入库文件不超过 2 MB」
 * 的红线，所以**不入库**：首次识别时从本地取一次，之后由浏览器缓存。
 * 取源顺序：
 *   1. /ocr/tesseract/…     —— npm run setup:ocr 放好的本地副本
 *   2. node_modules 里的官方包（默认会去公网 CDN 取语言包）
 * 默认「全部挂载在 localhost 运行」：只有本地副本齐全时才走第一条；
 * 需要联网时由 settings.localOcrCdn 显式开启。
 */
import type { OcrProgress } from './localOcrTypes';

const LOCAL_CORE_PATH = './ocr/tesseract/';
const LOCAL_LANG_PATH = './ocr/tesseract/lang/';

type RecognizeOutput = {
  text: string;
  /** Tesseract 的置信度 0..100 */
  confidence: number;
};

interface WorkerLike {
  recognize: (image: string) => Promise<{ data: { text: string; confidence: number } }>;
  terminate: () => Promise<unknown>;
}

type CreateWorkerFn = (
  langs: string,
  oem: number,
  options: Record<string, unknown>,
) => Promise<WorkerLike>;

let workerPromise: Promise<WorkerLike> | null = null;

/** 本地是否已经放好模型（HEAD 探测，不下载内容） */
export async function probeLocalModel(): Promise<{ engine: boolean; lang: boolean }> {
  const check = async (url: string) => {
    try {
      const head = await fetch(url, { method: 'HEAD' });
      return head.ok;
    } catch {
      return false;
    }
  };
  const [engine, lang] = await Promise.all([
    check(`${LOCAL_CORE_PATH}tesseract-core-simd.wasm`),
    check(`${LOCAL_LANG_PATH}chi_sim.traineddata.gz`),
  ]);
  return { engine, lang };
}

async function createWorker(allowCdn: boolean, onProgress?: (p: OcrProgress) => void): Promise<WorkerLike> {
  const { createWorker } = (await import('tesseract.js')) as unknown as { createWorker: CreateWorkerFn };
  const local = await probeLocalModel();
  const useLocal = local.engine && local.lang;
  if (!useLocal && !allowCdn) {
    throw new Error(
      '本地还没有中文识别模型（约 21 MB）。请运行 npm run setup:ocr 把它放到 web/public/ocr/，' +
        '或在设置里允许本地识别回落到 CDN。',
    );
  }

  onProgress?.({
    phase: 'recognize',
    ratio: 0.05,
    text: useLocal ? '正在启动本地识别引擎…' : '本地缺模型，正在从 CDN 取识别模型…',
  });

  const options: Record<string, unknown> = {
    logger: (message: { status?: string; progress?: number }) => {
      if (!message || typeof message.progress !== 'number') return;
      const ratio = Math.min(1, Math.max(0, message.progress));
      const label =
        message.status === 'loading language traineddata'
          ? '正在载入中文模型（仅首次）…'
          : message.status === 'initializing api'
            ? '正在初始化识别引擎…'
            : message.status === 'recognizing text'
              ? '正在识别封面文字…'
              : `识别中（${message.status ?? '准备'}）…`;
      onProgress?.({ phase: 'recognize', ratio, text: label });
    },
  };
  if (useLocal) {
    options.workerPath = `${LOCAL_CORE_PATH}worker.min.js`;
    options.corePath = LOCAL_CORE_PATH;
    options.langPath = LOCAL_LANG_PATH;
  }

  const worker = await createWorker('chi_sim', 1, options);
  return worker;
}

/** 取（或复用）识别 worker。多次识别只付一次模型加载成本。 */
function getWorker(allowCdn: boolean, onProgress?: (p: OcrProgress) => void): Promise<WorkerLike> {
  if (!workerPromise) {
    workerPromise = createWorker(allowCdn, onProgress).catch((error) => {
      // 失败不要把坏 promise 留在缓存里，下次还能重试
      workerPromise = null;
      throw error;
    });
  }
  return workerPromise;
}

/** 识别单张图，返回文字与置信度。 */
export async function recognizeImage(
  dataUrl: string,
  allowCdn = false,
  onProgress?: (p: OcrProgress) => void,
): Promise<RecognizeOutput> {
  const worker = await getWorker(allowCdn, onProgress);
  const result = await worker.recognize(dataUrl);
  return {
    text: (result.data.text ?? '').replace(/\r/g, '').trim(),
    confidence: result.data.confidence ?? 0,
  };
}

/** 关掉 worker（换语言/释放内存时用）。 */
export async function disposeOcr(): Promise<void> {
  const current = workerPromise;
  workerPromise = null;
  if (!current) return;
  try {
    const worker = await current;
    await worker.terminate();
  } catch {
    /* 已经挂了就忽略 */
  }
}

/**
 * 文本可信度打分：OCR 出来的封面文字里，
 * 中文/字母数字的占比越高、行越像书名，越可信。
 */
export function scoreText(text: string, confidence: number): number {
  const compact = text.replace(/\s+/g, '');
  if (!compact) return 0;
  const meaningful = (compact.match(/[\u4e00-\u9fa5A-Za-z0-9]/g) ?? []).length;
  const ratio = meaningful / compact.length;
  // 出版社/教材常见的「社、版、教育、大学」等字出现会加分
  const hints = (compact.match(/出版社|教育|大学|高职|教材|规划|版/g) ?? []).length;
  return ratio * 60 + Math.min(hints, 4) * 8 + Math.min(confidence, 100) * 0.2;
}
