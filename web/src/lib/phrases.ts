/**
 * 预制语料（通知栏桌宠）的**配置 + 全部纯逻辑**。
 *
 * 需求来源：`docs/notification-phrases.md`（豆包写的任务书）+ 作者在群里补的两条：
 *   1. 语料展示结束后**必须还原**回进入语料前的「基础状态」——
 *      空闲时是「多分课表正在后台运行」，导航中是「导航到 XXX 地点」；
 *   2. 浏览 / 复制 / 翻页 / 收起**全部在通知栏里完成**，只有「管理」才跳进应用。
 *   3. 实时通知（上课提醒那条）上也要有一个「戳一下」按钮。
 *
 * 这一层不碰 DOM、不碰原生桥、不碰 KV —— 因此 `scripts/check-phrases.mjs`
 * 能用 esbuild 直接把它跑起来，把「状态机 + 轮播 + 边界钳制」这些**可判定**的部分钉死。
 * 通知本身长什么样只能真机看，那部分按任务书 §9 标 `未验证`。
 */

export interface PhraseConfig {
  /** 用户语料（含默认集） */
  phrases: string[];
  /** 自动轮播总开关（默认关：作者要求"显式开启"） */
  autoPlay: boolean;
  /** 随机 / 顺序 */
  mode: 'random' | 'sequential';
  /** 间隔（分钟） */
  intervalMin: number;
  /** 波动幅度 0..100（%）：实际间隔 = 间隔 ×(1 ± 波动) */
  fluctuationPct: number;
}

/** 通知栏平时显示的那个状态 —— 语料展示完要还原回来的就是它 */
export type PhraseBaseState = { kind: 'idle' } | { kind: 'navigating'; destination: string };

/** 通知此刻该显示什么 */
export interface PhraseState {
  base: PhraseBaseState;
  /** 非 null = 正在展示语料（瞬态）；展示结束/收起后回到 base */
  showing: string | null;
}

export type PhraseAction =
  | { type: 'base'; state: PhraseBaseState }
  | { type: 'show'; text: string }
  | { type: 'restore' };

/**
 * 内置默认语料：**自己写的课表 / 学习主题文案**。
 * ⚠ 不得照抄参考 App（小鲸鱼）的台词 —— 那是第三方内容，docs 里只登记了设计参考、
 * 没有拿到再分发授权；守卫会用一个小的禁用词表把这件事钉住。
 */
export const PHRASE_DEFAULTS: string[] = [
  '该上课啦～别忘了带课本',
  '今天也要好好听课呀',
  '课间记得喝口水',
  '下节课在哪间教室来着？',
  '笔记写了没？趁现在补两行',
  '晚自习前把作业过一遍吧',
  '早点睡，明早第一节可是八点半',
];

export const PHRASE_LIMITS = {
  intervalMin: [1, 120] as const,
  fluctuationPct: [0, 100] as const,
  /** 语料条数上限：通知栏翻页再多也没人翻 */
  maxPhrases: 60,
  /** 一条语料在通知上停留多久（秒），到点自动还原 base */
  displaySeconds: 8,
};

export const DEFAULT_PHRASE_CONFIG: PhraseConfig = {
  phrases: [...PHRASE_DEFAULTS],
  autoPlay: false,
  mode: 'random',
  intervalMin: 5,
  fluctuationPct: 0,
};

/** 语料配置存在独立的 KV 键里，**不动 AppSettings 的形状**（任务书 §4） */
export const PHRASE_KEY = 'phrases';

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

/** 清洗：去首尾空白、丢空串、按首次出现去重、截到上限 */
export function normalizePhrases(list: readonly string[]): string[] {
  const out: string[] = [];
  for (const raw of list) {
    const text = (raw ?? '').trim();
    if (!text || out.includes(text)) continue;
    out.push(text);
    if (out.length >= PHRASE_LIMITS.maxPhrases) break;
  }
  return out;
}

export function clampInterval(minutes: number): number {
  const value = Math.round(Number(minutes));
  if (!Number.isFinite(value)) return DEFAULT_PHRASE_CONFIG.intervalMin;
  return clamp(value, PHRASE_LIMITS.intervalMin[0], PHRASE_LIMITS.intervalMin[1]);
}

export function clampFluctuation(pct: number): number {
  const value = Math.round(Number(pct));
  if (!Number.isFinite(value)) return 0;
  return clamp(value, PHRASE_LIMITS.fluctuationPct[0], PHRASE_LIMITS.fluctuationPct[1]);
}

/** 反序列化：坏数据 / 旧数据一律回落到默认值，绝不抛出（通知栏不能因为配置坏了就消失） */
export function loadPhraseConfig(raw: unknown): PhraseConfig {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_PHRASE_CONFIG };
  const value = raw as Partial<PhraseConfig>;
  const phrases = Array.isArray(value.phrases) ? normalizePhrases(value.phrases as string[]) : [];
  return {
    // 空列表是合法状态（用户可能全删了），这时不塞回默认集，只在 UI 上给空态
    phrases,
    autoPlay: Boolean(value.autoPlay),
    mode: value.mode === 'sequential' ? 'sequential' : 'random',
    intervalMin: clampInterval(value.intervalMin ?? DEFAULT_PHRASE_CONFIG.intervalMin),
    fluctuationPct: clampFluctuation(value.fluctuationPct ?? 0),
  };
}

export function addPhrase(config: PhraseConfig, text: string): PhraseConfig {
  const next = normalizePhrases([...config.phrases, text]);
  return { ...config, phrases: next };
}

export function removePhrase(config: PhraseConfig, index: number): PhraseConfig {
  if (index < 0 || index >= config.phrases.length) return config;
  return { ...config, phrases: config.phrases.filter((_, i) => i !== index) };
}

export function restoreDefaultPhrases(config: PhraseConfig): PhraseConfig {
  return { ...config, phrases: [...PHRASE_DEFAULTS] };
}

/**
 * 下一条语料的下标。
 * 顺序 = 依次循环；随机 = 均匀抽取（**允许与上一条重复**时用全范围，否则在其余项里抽，
 * 免得连着两次同一句让人以为卡住了）。rng 可注入，守卫才能断言确定性行为。
 */
export function nextPhraseIndex(
  config: Pick<PhraseConfig, 'phrases' | 'mode'>,
  cursor: number,
  rng: () => number = Math.random,
): number {
  const total = config.phrases.length;
  if (total === 0) return -1;
  if (config.mode === 'sequential') return (cursor + 1) % total;
  if (total === 1) return 0;
  const raw = clamp(rng(), 0, 0.999999);
  let pick = Math.floor(raw * total);
  if (pick === cursor) pick = (pick + 1) % total;
  return pick;
}

/** 「戳一下」用的下标：在现有语料里随机抽一条（与播放模式无关，戳一下就是随机） */
export function pokeIndex(config: Pick<PhraseConfig, 'phrases'>, rng: () => number = Math.random): number {
  const total = config.phrases.length;
  if (total === 0) return -1;
  return clamp(Math.floor(clamp(rng(), 0, 0.999999) * total), 0, total - 1);
}

/** 实际间隔（毫秒）：间隔 ×(1 ± 波动)，0% 时是精确间隔 */
export function effectiveIntervalMs(config: Pick<PhraseConfig, 'intervalMin' | 'fluctuationPct'>, rng: () => number = Math.random): number {
  const base = clampInterval(config.intervalMin) * 60_000;
  const pct = clampFluctuation(config.fluctuationPct) / 100;
  if (pct <= 0) return base;
  const factor = 1 + (clamp(rng(), 0, 0.999999) * 2 - 1) * pct;
  return Math.round(base * factor);
}

/** 基础状态 → 通知正文。语料展示完还原回来的就是这一句。 */
export function baseStateText(state: PhraseBaseState, schoolName = ''): string {
  if (state.kind === 'navigating') {
    const destination = (state.destination ?? '').trim();
    const prefix = schoolName.trim();
    if (!destination) return '导航中';
    return `导航到${prefix ? `${prefix} ` : ''}${destination}`;
  }
  return '多分课表正在后台运行';
}

/** 此刻通知该显示的正文：有语料就显示语料，否则显示基础状态 */
export function notificationText(state: PhraseState, schoolName = ''): string {
  return state.showing ?? baseStateText(state.base, schoolName);
}

/**
 * 通知状态机（纯函数）。**核心不变式**：
 *   · `show` / `poke` / `restore` 都**不修改** `base`；
 *   · `restore` 之后 `showing` 必为 null ⇒ 通知正文必等于 `baseStateText(base)`。
 * 这两条就是作者强调的"展示语料后要还原回原有状态"。
 */
export function reducePhraseState(state: PhraseState, action: PhraseAction): PhraseState {
  switch (action.type) {
    case 'base':
      // 基础状态可以随时被更新（导航开始 / 结束），但正在展示的语料不因此被打断
      return { ...state, base: action.state };
    case 'show':
      return { ...state, showing: action.text };
    case 'restore':
      return { ...state, showing: null };
    default:
      return state;
  }
}

export const initialPhraseState = (): PhraseState => ({ base: { kind: 'idle' }, showing: null });
