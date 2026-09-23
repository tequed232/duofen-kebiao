/**
 * 教材封面识别用的视觉接口（图片 → 文字）。
 *
 * 接口地址与密钥由用户在「设置 → 教材识别接口」里填写并只存本机。
 * 这里不编造内容：没配置接口就抛出可读错误，交给界面提示用户。
 */
import type { AppSettings } from './types';
import { keywords, splitSentences } from './utils';

export interface TextSummary {
  summary: string;
  keyPoints: string[];
  tags: string[];
}

function authHeaders(key: string): Record<string, string> {
  if (!key.trim()) return {};
  return { Authorization: `Bearer ${key.trim()}`, 'x-api-key': key.trim() };
}

/**
 * 端点准入：明文 http 只放行本机 / 局域网（自建模型常见），其余必须 https。
 *
 * 为什么这是一道硬闸：请求体里带**用户自己的密钥**与整张图片，走 http 时同网段任何人都能看到。
 * 局域网 http 是合理用法（Ollama / LM Studio 这类本机服务），公网明文则一律拦下。
 */
function assertEndpointAllowed(url: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('接口地址不是合法 URL');
  }
  if (parsed.protocol === 'https:') return parsed;
  if (parsed.protocol !== 'http:') {
    throw new Error(`不支持的协议：${parsed.protocol.replace(':', '')}（只允许 https，或本机/局域网的 http）`);
  }
  const host = parsed.hostname;
  const isLocal =
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '::1' ||
    host.endsWith('.local') ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host);
  if (isLocal) return parsed;
  throw new Error('明文 http 只允许本机或局域网地址：公网接口请改用 https，否则接口密钥会以明文发出');
}

/** 报错信息里不允许出现密钥 —— 有些网关会把请求头回显进错误体 */
function redact(text: string, key: string): string {
  const secret = key.trim();
  return secret ? text.split(secret).join('***') : text;
}

/** Pull the first useful text out of an unknown JSON payload. */
function pickText(payload: unknown, depth = 0): string {
  if (payload == null || depth > 4) return '';
  if (typeof payload === 'string') return payload.trim();
  if (typeof payload === 'number') return String(payload);
  if (Array.isArray(payload)) {
    for (const item of payload) {
      const found = pickText(item, depth + 1);
      if (found) return found;
    }
    return '';
  }
  if (typeof payload === 'object') {
    const record = payload as Record<string, unknown>;
    const preferred = [
      'text',
      'summary',
      'description',
      'caption',
      'title',
      'result',
      'output',
      'content',
      'message',
      'data',
      'choices',
    ];
    for (const key of preferred) {
      if (key in record) {
        const found = pickText(record[key], depth + 1);
        if (found) return found;
      }
    }
    for (const value of Object.values(record)) {
      const found = pickText(value, depth + 1);
      if (found) return found;
    }
  }
  return '';
}

function parseJsonish(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

async function readResponse(response: Response): Promise<string> {
  const raw = await response.text();
  return pickText(parseJsonish(raw));
}

/** POST a JSON body and return extracted text; throws with a readable message. */
async function postJson(url: string, body: unknown, key: string): Promise<string> {
  assertEndpointAllowed(url);
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(key) },
    body: JSON.stringify(body),
  });
  const text = await readResponse(response);
  if (!response.ok) {
    throw new Error(`接口返回 ${response.status}${text ? `：${redact(text, key).slice(0, 120)}` : ''}`);
  }
  if (!text) throw new Error('接口没有返回可用的文本');
  return text;
}

/** Image-to-text: sends the picked image and returns summary + key points. */
export async function analyzeImage(dataUrl: string, settings: AppSettings): Promise<TextSummary> {
  const url = settings.visionApiUrl.trim();
  if (!url) throw new Error('未配置图片识别接口');
  const base64 = dataUrl.includes(',') ? dataUrl.slice(dataUrl.indexOf(',') + 1) : dataUrl;
  const text = await postJson(
    url,
    {
      image: base64,
      image_url: dataUrl,
      task: 'describe-and-summarize',
      prompt: '请描述这张图片，并给出要点列表（每行以 - 开头），最后一行以 # 开头给出最多三个标签。',
    },
    settings.visionApiKey,
  );
  return structureSummary(text);
}

/** Split a free-form model answer into summary / key points / tags. */
export function structureSummary(text: string): TextSummary {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const keyPoints: string[] = [];
  const tags: string[] = [];
  const prose: string[] = [];
  for (const line of lines) {
    if (/^[-*•]\s+/.test(line)) keyPoints.push(line.replace(/^[-*•]\s+/, ''));
    else if (/^#/.test(line)) tags.push(...line.replace(/^#+\s*/, '').split(/[,，、\s]+/).filter(Boolean));
    else if (/^(要点|key points?)[:：]/i.test(line)) keyPoints.push(line.split(/[:：]/).slice(1).join(':').trim());
    else prose.push(line);
  }
  const summary = prose.join('\n').trim();
  return {
    summary: summary || text.trim(),
    keyPoints: keyPoints.length ? keyPoints : deriveKeyPoints(summary || text),
    tags: tags.slice(0, 4),
  };
}

/** Deterministic key point extraction used when the vision API returns plain prose. */
export function deriveKeyPoints(text: string, limit = 5): string[] {
  const sentences = splitSentences(text);
  if (!sentences.length) return [];
  const frequency = new Map<string, number>();
  for (const sentence of sentences) {
    for (const word of new Set(keywords(sentence))) {
      frequency.set(word, (frequency.get(word) ?? 0) + 1);
    }
  }
  const scored = sentences.map((sentence, index) => {
    const words = new Set(keywords(sentence));
    let score = 0;
    words.forEach((word) => {
      score += frequency.get(word) ?? 0;
    });
    return { sentence, score: score / Math.max(1, words.size) + (index === 0 ? 0.8 : 0) };
  });
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((item) => (item.sentence.length > 60 ? `${item.sentence.slice(0, 59)}…` : item.sentence));
}
