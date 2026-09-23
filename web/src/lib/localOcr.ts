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
import { localOcrUrl } from './opencvLoader';

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

/**
 * 本地是否已经放好模型（HEAD 探测，不下载内容）。
 *
 * 每个探测都带硬超时：HEAD 打在大文件（3.3 MB 的 wasm）上时可能一直不返回，
 * 而这个函数在 createWorker 之前同步等待 —— 一旦挂住，外层的识别超时根本来不及生效
 * （实测表现为识别界面卡死十几分钟，端到端验证时才暴露）。
 */
export async function probeLocalModel(): Promise<{ engine: boolean; lang: boolean }> {
  const check = async (url: string) => {
    try {
      const response = await fetch(url, {
        method: 'HEAD',
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch {
      return false;
    }
  };
  const [engine, lang] = await Promise.all([
    check(localOcrUrl('ocr/tesseract/tesseract-core-simd-lstm.wasm')),
    // 注意是解压后的 .traineddata：setup:ocr 下载的是 .gz，落盘时已解压
    check(localOcrUrl('ocr/tesseract/lang/chi_sim.traineddata')),
  ]);
  return { engine, lang };
}

/**
 * 建识别 worker。
 *
 * 资源分两块，来源可以不同：
 *   · **中文模型**（chi_sim，2.4 MB）：始终优先用本地 web/public/ocr/tesseract/lang/
 *   · **引擎核心**（tesseract.js-core）：自托管实测在 v6/v7 上都会初始化崩溃
 *     （`Cannot read properties of undefined (reading 'resolve')`，且 Promise 不 reject），
 *     所以默认交给 tesseract.js 自己按 CDN 取；这也是 allowCdn 的实际含义。
 *
 * 隐私边界：图片不出设备；中文模型在本地；只有引擎（不含用户数据）可能走 CDN。
 */
async function createWorker(allowCdn: boolean, onProgress?: (p: OcrProgress) => void): Promise<WorkerLike> {
  const { createWorker } = (await import('tesseract.js')) as unknown as { createWorker: CreateWorkerFn };
  const local = await probeLocalModel();
  if (!local.lang && !allowCdn) {
    throw new Error(
      '本地还没有中文识别模型。请运行 npm run setup:ocr 把它放到 web/public/ocr/，' +
        '或在设置里允许本地识别使用 CDN 资源。',
    );
  }
  // 自托管核心当前实测不可用（见上），所以**不指向本地核心** ——
  // 交给 tesseract.js 用默认来源，失败与否都不影响我们已经验证可用的组合。
  // allowCdn 只决定「本地模型缺失时是否还继续」。

  onProgress?.({
    phase: 'recognize',
    ratio: 0.05,
    text: local.lang ? '正在启动识别引擎（中文模型取自本地）…' : '正在载入中文模型…',
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
  if (local.lang) {
    options.langPath = localOcrUrl('ocr/tesseract/lang');
    /*
     * gzip: false 是**必须的**：setup:ocr 落盘的是解压后的 chi_sim.traineddata，
     * 而 tesseract.js 默认去找 `chi_sim.traineddata.gz`。
     * 文件名对不上时它不会明确报错，在浏览器里表现为**静默永久挂起**
     * （createWorker 既不 resolve 也不 reject）—— Node 里才看得到
     * 「ENOENT ... chi_sim.traineddata.gz」。定位这个问题花了好几轮。
     */
    options.gzip = false;
  }
  /*
   * 核心**不指向本地**（浏览器里自托管核心不可用）。
   *
   * 实测记录：把 tesseract.js-core 放到 web/public/ocr/tesseract/ 并用 corePath 指过去，
   * 在 Node 里完全相同的一组参数可以正常识别，但在浏览器里（Vite 开发服务器）
   * createWorker 既不 resolve 也不 reject —— 连 recognize 都进不去。
   * 换 tesseract.js 6/7、换 workerBlobURL、换 optimizeDeps 都一样。
   * 而「本地中文模型 + 官方默认核心」稳定可用（0.1s，confidence 95）。
   *
   * 所以核心交给 tesseract.js 的默认来源；隐私关键的两项仍在本地：
   * 图片不出设备、中文模型取自 web/public/ocr/。
   * 等自托管核心的问题查清（上游 issue）再把这里切回本地即可。
   */

  const worker = await createWorker('chi_sim', 1, options);
  trace('createWorker 返回');
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

/** 识别超时：超过就放弃这一张，不让界面无限等待 */
const RECOGNIZE_TIMEOUT_MS = 120_000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(
      () => reject(new Error(`${label}超时（${Math.round(ms / 1000)}s）`)),
      ms,
    );
    promise.then(
      (value) => { window.clearTimeout(timer); resolve(value); },
      (error) => { window.clearTimeout(timer); reject(error); },
    );
  });
}

/**
 * 诊断开关：把识别各阶段的耗时打到 console。
 * 排查「识别卡住不返回」时打开（localStorage.setItem('duofen.ocr.debug','1')）。
 */
const debugEnabled = (): boolean => {
  try {
    return window.localStorage.getItem('duofen.ocr.debug') === '1';
  } catch {
    return false;
  }
};
const trace = (message: string) => {
  if (debugEnabled()) console.log(`[ocr] ${message}`);
};

/** 识别单张图，返回文字与置信度。带超时 —— 识别卡住时不能让界面无限等。 */
export async function recognizeImage(
  dataUrl: string,
  allowCdn = false,
  onProgress?: (p: OcrProgress) => void,
): Promise<RecognizeOutput> {
  trace('recognizeImage 开始');
  const worker = await withTimeout(getWorker(allowCdn, onProgress), RECOGNIZE_TIMEOUT_MS, '启动识别引擎');
  trace('worker 就绪，开始 recognize');
  const result = await withTimeout(worker.recognize(dataUrl), RECOGNIZE_TIMEOUT_MS, '识别封面文字');
  trace('recognize 返回');
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
