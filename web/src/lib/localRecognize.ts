/**
 * 教材封面本地识别主流程。
 *
 * 管线：OpenCV 预处理（裁切 / 聚焦 / 二值化）→ 本地 OCR（Tesseract 中文）
 *      → 文本打分 → 与内置教材库匹配 → 给出课程 / 书名 / 出版社。
 *
 * **全部在浏览器里跑，不上传任何图片**。外部多模态 API 仍然保留为可选增强：
 * 本地能认出来就用本地结果，认不出来时界面会提示可以改用 API。
 */
import { preprocessCover } from './opencvPreprocess';
import { recognizeImage, scoreText } from './localOcr';
import { extractIsbns } from './isbn';
import { guessPublisher, libraryTextbook, matchCourseByText } from './textbooks';
import type { LocalRecognizeResult, OcrProgress } from './localOcrTypes';

/**
 * 取封面文字里最像「书名」的一行。
 *
 * 不能简单取最长行：封面上还有「ISBN 978-7-04-039663-8」「定价 49.80 元」这类
 * 比书名更长的条目 —— 早期版本就是这么把书名取成 ISBN 的（端到端验证抓到的）。
 * 所以先按「像不像书名」打分：含中文加分，含数字 / ISBN / 定价 / 元 等扣分，
 * 同分再比长度。
 */
export function longestLine(text: string): string {
  const candidates = text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line.length >= 2);
  if (!candidates.length) return '';

  const score = (line: string): number => {
    const compact = line.replace(/\s/g, '');
    if (!compact) return -100;
    let value = 0;
    // 中文正文最可能是书名
    const cjk = (compact.match(/[\u4e00-\u9fa5]/g) ?? []).length;
    value += cjk * 2;
    // ISBN / 定价 / 出版社 等明显不是书名
    if (/isbn/i.test(compact)) value -= 40;
    if (/(出版社|出版|书局|杂志社|编辑部)/.test(compact)) value -= 25;
    if (/(定价|价格|元|￥|¥|电话|网址|http)/i.test(compact)) value -= 15;
    // 纯数字（含连字符）几乎不可能是书名
    if (/^[\d\s\-—–]+$/.test(compact)) value -= 30;
    // 数字占比过高也扣分
    const digits = (compact.match(/\d/g) ?? []).length;
    if (digits / compact.length > 0.4) value -= 20;
    // 长度给它一点优势，但远小于「像不像书名」的权重
    value += Math.min(compact.length, 20) * 0.5;
    return value;
  };

  return candidates.reduce((best, line) => (score(line) > score(best) ? line : best), candidates[0]);
}

export interface RecognizeCoverOptions {
  /** 允许回落到公网 CDN（默认 false：全部走 localhost） */
  allowCdn?: boolean;
  /** 课表里的课程名，用于匹配 */
  courseNames: string[];
  onProgress?: (progress: OcrProgress) => void;
}

/**
 * 识别一张教材封面。
 * 会依次识别各个预处理视图，按「文本可信度 + 与课程/内置库的匹配度」选最优。
 */
export async function recognizeCover(
  dataUrl: string,
  options: RecognizeCoverOptions,
): Promise<LocalRecognizeResult> {
  const { allowCdn = false, courseNames, onProgress } = options;

  onProgress?.({ phase: 'opencv', ratio: 0, text: '正在预处理封面（OpenCV）…' });
  const pre = await preprocessCover(dataUrl, allowCdn);

  const candidates: LocalRecognizeResult['candidates'] = [];
  let bestText = '';
  let bestScore = -1;
  /** 最后一次失败原因：全部视图都失败时给用户看 */
  let lastError = '';

  for (let index = 0; index < pre.candidates.length; index += 1) {
    const candidate = pre.candidates[index];
    onProgress?.({
      phase: 'recognize',
      ratio: index / pre.candidates.length,
      text: `正在识别：${candidate.label}（${index + 1}/${pre.candidates.length}）`,
    });
    try {
      const { text, confidence } = await recognizeImage(candidate.url, allowCdn);
      const score = scoreText(text, confidence);
      candidates.push({ source: candidate.label, text, score });
      if (score > bestScore && text.length >= 2) {
        bestScore = score;
        bestText = text;
      }
    } catch (error) {
      // 单个视图失败不影响其它视图；都没成功时由上层把原因告诉用户
      const message = error instanceof Error ? error.message : '未知错误';
      candidates.push({
        source: candidate.label,
        text: '',
        score: 0,
      });
      pre.notes.push(`${candidate.label} 识别失败：${message}`);
      // 记住最后一次的失败原因：全部视图都失败时，它是给用户看的唯一线索
      lastError = message;
    }
  }

  onProgress?.({ phase: 'match', ratio: 0.9, text: '正在匹配课程与出版社…' });

  const lines = bestText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const matched = bestText ? matchCourseByText(bestText, courseNames) : null;
  const library = matched ? libraryTextbook(matched.course) : undefined;

  // ISBN：在**所有候选视图**的文字里找，不只最优那份 —— 校验位正确即为强信号
  const isbnHits = extractIsbns([bestText, ...candidates.map((c) => c.text)].join('\n'));
  const isbn = isbnHits[0]?.isbn;

  /**
   * 书名优先级：**内置库 > 封面文字**。
   * 内置库那份是人工整理过的（与 12 张封面照片一一对应），比现场 OCR 可靠；
   * 课程匹配上却不给库里的书名，用户就得自己改，那是白识别。
   */
  const coverTitle = longestLine(bestText);
  const publisher = guessPublisher(bestText) || library?.publisher || '';

  onProgress?.({ phase: 'done', ratio: 1, text: '识别完成' });

  return {
    lines,
    candidates,
    best: bestText,
    regions: pre.regions,
    course: matched?.course,
    title: library?.title || coverTitle || undefined,
    publisher: publisher || undefined,
    isbn,
    matchedBy: library ? 'library' : bestText ? 'cover' : 'none',
    /** 一个字都没读出来时，把原因带出去（界面据此提示而不是静默失败） */
    error: !bestText && lastError ? lastError : undefined,
  };
}
