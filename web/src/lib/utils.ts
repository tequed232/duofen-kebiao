/** Small helpers shared across screens. */

export function uid(prefix = 'id'): string {
  const random = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now().toString(36)}${random}`;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

const pad = (n: number) => n.toString().padStart(2, '0');

/** 2024/05/06 14:03 */
export function formatDateTime(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatDate(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}`;
}

export function formatClock(ts: number): string {
  const d = new Date(ts);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** "3 分钟前" style relative label used on history cards. */
export function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const minute = 60_000;
  if (diff < minute) return '刚刚';
  if (diff < 60 * minute) return `${Math.floor(diff / minute)} 分钟前`;
  if (diff < 24 * 60 * minute) return `${Math.floor(diff / (60 * minute))} 小时前`;
  if (diff < 7 * 24 * 60 * minute) return `${Math.floor(diff / (24 * 60 * minute))} 天前`;
  return formatDate(ts);
}

export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

export function debounce<F extends (...args: never[]) => void>(fn: F, wait: number): F {
  let timer: number | undefined;
  return ((...args: never[]) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => fn(...args), wait);
  }) as F;
}

export function isProbablyUrl(value: string): boolean {
  if (!value.trim()) return true; // empty means "not configured"
  try {
    const url = new URL(value.trim());
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Split free text into sentences for the local answer fallback. */
export function splitSentences(text: string): string[] {
  return text
    .split(/[\n。！？!?;；]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 1);
}

const STOP_WORDS = new Set([
  '的', '了', '是', '在', '我', '有', '和', '就', '不', '人', '都', '一', '上', '也', '很', '到', '说', '要', '去', '你',
  '会', '着', '没有', '看', '好', '自己', '这', '那', '什么', '怎么', '如何', '为什么', '哪', '哪些', '请', '吗', '呢',
  'the', 'is', 'a', 'an', 'of', 'to', 'and', 'in', 'on', 'for', 'why', 'how', 'what', 'does', 'do', 'it',
]);

/** Very small tokenizer that works for Chinese and latin text. */
export function keywords(text: string): string[] {
  const latin = text.toLowerCase().match(/[a-z0-9]{2,}/g) ?? [];
  const cjkChunks = text.match(/[\u4e00-\u9fa5]+/g) ?? [];
  const cjk: string[] = [];
  for (const chunk of cjkChunks) {
    // bigrams give usable "words" without a segmenter
    for (let i = 0; i < chunk.length - 1; i += 1) cjk.push(chunk.slice(i, i + 2));
    if (chunk.length === 1) cjk.push(chunk);
  }
  return [...latin, ...cjk].filter((w) => w.length > 1 && !STOP_WORDS.has(w));
}

/**
 * 实时判断用户是在「提问」还是在「输入」：
 * 问号结尾或含疑问词 → 提问（走问答，回答进思维导图分支）；
 * 其余按普通输入处理（追加到语音转文字内容）。
 */
export function detectIntent(text: string): 'ask' | 'write' {
  const trimmed = text.trim();
  if (!trimmed) return 'write';
  if (/[?？]$/.test(trimmed)) return 'ask';
  if (/(吗|呢|什么|怎么|怎样|如何|为什么|为啥|哪|哪些|几|多少|是否|是不是|能不能|可不可以|有没有|请问|求|帮我|介绍一下|查一下|总结一下)/.test(trimmed)) {
    return 'ask';
  }
  return 'write';
}
