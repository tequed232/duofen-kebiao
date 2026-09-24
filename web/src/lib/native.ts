import type { PhraseBaseState, PhraseConfig } from './phrases';
/**
 * Android 原生桥（可选增强，不影响网页行为）。
 *
 * APK 是同一个 Web 构建跑在 WebView 里，原生侧通过 window.DuofenNative 暴露能力：
 *   - liveUpdate(title, text) / stopLiveUpdate()：Android 16 / ColorOS 流体云进度通知
 *   - requestPermissions()：一次性申请麦克风 / 通知
 * 在浏览器里这些函数不存在，调用会安全地退化为网页自身实现（Notification API）。
 */

interface DuofenNative {
  liveUpdate?: (title: string, text: string, progress: number) => void;
  stopLiveUpdate?: () => void;
  testLiveUpdate?: () => void;
  requestPermissions?: () => void;
  platform?: () => string;
}

function bridge(): DuofenNative | undefined {
  return (window as unknown as { DuofenNative?: DuofenNative }).DuofenNative;
}

/** 是否运行在 Android 宿主（APK）里 */
export function isNativeShell(): boolean {
  return typeof bridge()?.liveUpdate === 'function';
}

/** 标记运行在 APK 宿主里：CSS 据此跳过浏览器安全区，交给原生 insets 处理 */
export function markNativeShell(): void {
  if (isNativeShell()) document.documentElement.classList.add('native-shell');
}

/** 发布/更新流体云进度卡片；返回 true 表示已交给原生处理 */
export function nativeLiveUpdate(title: string, text: string, progress = -1): boolean {
  const api = bridge();
  if (typeof api?.liveUpdate !== 'function') return false;
  try {
    api.liveUpdate(title, text, progress);
    return true;
  } catch {
    return false;
  }
}

/** 结束流体云进度卡片；返回 true 表示已交给原生处理 */
export function nativeStopLiveUpdate(): boolean {
  const api = bridge();
  if (typeof api?.stopLiveUpdate !== 'function') return false;
  try {
    api.stopLiveUpdate();
    return true;
  } catch {
    return false;
  }
}

/** 设置页「发送实况测试」：走一遍流体云流程，确认设备是否显示实况通知 */
export function nativeTestLiveUpdate(): boolean {
  const api = bridge();
  if (typeof api?.testLiveUpdate !== 'function') return false;
  try {
    api.testLiveUpdate();
    return true;
  } catch {
    return false;
  }
}

/** 通知上「确认」按钮的回调注册（仅 APK） */
export function onNativeLiveConfirm(handler: () => void): void {
  (window as unknown as { __duofenLiveConfirm__?: () => void }).__duofenLiveConfirm__ = handler;
}

/** 请求麦克风 / 通知权限（仅 APK） */
export function nativeRequestPermissions(): boolean {
  const api = bridge();
  if (typeof api?.requestPermissions !== 'function') return false;
  try {
    api.requestPermissions();
    return true;
  } catch {
    return false;
  }
}

/* ---------------------------------------------------- 原生 Liquid Glass --- */
/* APK（Android 13+）里由原生层做真·背景折射；网页只负责开关与实时参数下发。 */

interface DuofenGlassBridge {
  glassMode?: (enabled: boolean) => void;
  glassPointer?: (x: number, y: number, pressed: boolean) => void;
  glassScroll?: (impulse: number) => void;
}

function glassBridge(): DuofenGlassBridge | undefined {
  return (window as unknown as { DuofenNative?: DuofenGlassBridge }).DuofenNative;
}

/** 开启/关闭原生玻璃条（关闭时网页玻璃栏自己画） */
export function nativeGlassMode(enabled: boolean): boolean {
  const api = glassBridge();
  if (typeof api?.glassMode !== 'function') return false;
  try {
    api.glassMode(enabled);
    return true;
  } catch {
    return false;
  }
}

/** 手指位置（0..1）与按下状态：原生层据此实时折射 */
export function nativeGlassPointer(x: number, y: number, pressed: boolean): void {
  const api = glassBridge();
  if (typeof api?.glassPointer !== 'function') return;
  try {
    api.glassPointer(x, y, pressed);
  } catch {
    /* 忽略 */
  }
}

/** 页面滚动冲量（0..1）：驱动折射强度与高光 */
export function nativeGlassScroll(impulse: number): void {
  const api = glassBridge();
  if (typeof api?.glassScroll !== 'function') return;
  try {
    api.glassScroll(impulse);
  } catch {
    /* 忽略 */
  }
}

export type HapticKind = 'wall' | 'select' | 'tick' | 'heavy';

/** 同一帧里最多响一次：拖动时 applyFrame 每帧都可能命中边界，不去重会连成一片嗡嗡声 */
let lastHapticAt = 0;
let lastHapticKind: HapticKind | null = null;

/**
 * 触感反馈：优先走原生桥（`View.performHapticFeedback` + 系统常量，
 * 自动遵守用户的触感开关，也不需要 VIBRATE 权限）；
 * 浏览器里退回 `navigator.vibrate`（桌面一般没有，静默失败）。
 */
export function haptic(kind: HapticKind): void {
  const now = performance.now();
  // 同一种触感 40ms 内不重复；不同触感至少隔 20ms
  const gap = kind === lastHapticKind ? 40 : 20;
  if (now - lastHapticAt < gap) return;
  lastHapticAt = now;
  lastHapticKind = kind;

  const api = (window as unknown as { DuofenNative?: { haptic?: (k: string) => void } }).DuofenNative;
  if (api?.haptic) {
    try {
      api.haptic(kind);
      return;
    } catch {
      /* 落到下面的浏览器兜底 */
    }
  }
  const pattern = kind === 'heavy' ? 32 : kind === 'select' ? 18 : kind === 'wall' ? 12 : 8;
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* 忽略 */
  }
}

/**
 * 上课提醒（实况通知 / 灵动岛）：course/room/timeText/textbooks + 剩余分钟数 + 开始时间戳 + 导航链接。
 * `coverDataUrl` 是教材封面的小图（data URL），原生侧拿它当通知大图标 —— 对应设计稿左侧那块方图。
 */
export interface ClassReminder {
  course: string;
  room: string;
  timeText: string;
  textbooks: string;
  minutesLeft: number;
  startAtMillis: number;
  navigateUri: string;
  /** 教材封面（缩小后的 data URL）；没有就传空串，原生侧退回课程名首字 */
  coverDataUrl?: string;
}

export function nativeClassReminder(payload: ClassReminder): boolean {
  const api = (window as unknown as { DuofenNative?: { classReminder?: (...args: unknown[]) => void } }).DuofenNative;
  if (typeof api?.classReminder !== 'function') return false;
  try {
    api.classReminder(
      payload.course,
      payload.room,
      payload.timeText,
      payload.textbooks,
      payload.minutesLeft,
      payload.startAtMillis,
      payload.navigateUri,
      payload.coverDataUrl ?? '',
    );
    return true;
  } catch {
    return false;
  }
}

export function nativeStopClassReminder(): void {
  const api = (window as unknown as { DuofenNative?: { stopClassReminder?: () => void } }).DuofenNative;
  try {
    api?.stopClassReminder?.();
  } catch {
    /* 忽略 */
  }
}

/* ---------------------------------------------------------------- 系统日历 -- */
/* 课表 → 系统日历（仅 APK）。原生侧写 CalendarContract，网页版走下载 .ics。
   原生方法的返回值都是 **JSON 字符串**：桥只能传基本类型，传对象会变成 "[object Object]"。 */

interface DuofenCalendarBridge {
  calendarStatus?: () => string;
  requestCalendarPermission?: () => void;
  calendarImport?: (eventsJson: string) => string;
  calendarRemoveAll?: () => string;
}

function calendarBridge(): DuofenCalendarBridge | undefined {
  return (window as unknown as { DuofenNative?: DuofenCalendarBridge }).DuofenNative;
}

/** 是否具备原生日历能力（网页版没有这套桥，按钮会退化成下载 .ics） */
export function hasNativeCalendar(): boolean {
  return typeof calendarBridge()?.calendarImport === 'function';
}

export interface NativeCalendarStatus {
  permission: 'granted' | 'denied' | 'missing' | 'unknown';
  /** 当前系统日历里由本 App 写入的日程条数 */
  count: number;
  /** 将要写入的日历名（用于「修改范围」提示框） */
  calendar: string;
}

export interface NativeCalendarResult {
  ok: boolean;
  /** 成功写入 / 删除的条数 */
  count: number;
  error?: string;
}

function parseJson<T>(raw: string | undefined, fallback: T): T {
  if (typeof raw !== 'string' || !raw) return fallback;
  try {
    return { ...fallback, ...(JSON.parse(raw) as object) } as T;
  } catch {
    return fallback;
  }
}

export function nativeCalendarStatus(): NativeCalendarStatus {
  const api = calendarBridge();
  if (typeof api?.calendarStatus !== 'function') return { permission: 'unknown', count: 0, calendar: '' };
  try {
    return parseJson<NativeCalendarStatus>(api.calendarStatus(), { permission: 'unknown', count: 0, calendar: '' });
  } catch {
    return { permission: 'unknown', count: 0, calendar: '' };
  }
}

/** 申请日历权限；结果由原生层回调到 window.__duofenCalendarPermission__ */
export function nativeRequestCalendarPermission(handler: (granted: boolean) => void): boolean {
  const api = calendarBridge();
  if (typeof api?.requestCalendarPermission !== 'function') return false;
  (window as unknown as { __duofenCalendarPermission__?: (result: string) => void }).__duofenCalendarPermission__ = (
    result: string,
  ) => handler(result === 'granted');
  try {
    api.requestCalendarPermission();
    return true;
  } catch {
    return false;
  }
}

export function nativeCalendarImport(eventsJson: string): NativeCalendarResult {
  const api = calendarBridge();
  if (typeof api?.calendarImport !== 'function') return { ok: false, count: 0, error: 'no-bridge' };
  try {
    return parseJson<NativeCalendarResult>(api.calendarImport(eventsJson), { ok: false, count: 0, error: 'empty' });
  } catch (error) {
    return { ok: false, count: 0, error: String(error) };
  }
}

export function nativeCalendarRemoveAll(): NativeCalendarResult {
  const api = calendarBridge();
  if (typeof api?.calendarRemoveAll !== 'function') return { ok: false, count: 0, error: 'no-bridge' };
  try {
    return parseJson<NativeCalendarResult>(api.calendarRemoveAll(), { ok: false, count: 0, error: 'empty' });
  } catch (error) {
    return { ok: false, count: 0, error: String(error) };
  }
}

/* ------------------------------------------------------ 预制语料常驻通知 -- */
/* 通知栏「桌宠」：前台服务 + 常驻通知（渠道 m3expressive_phrase / id 1002）。
   浏览、点选、翻页、收起全在通知栏完成；网页这边只管下发配置与基础状态。
   浏览器（无桥）一律安全返回 false / null，与上面几节风格一致。 */

interface DuofenPhraseBridge {
  startPhraseService?: () => void;
  stopPhraseService?: () => void;
  phrasesConfig?: (json: string) => void;
  phrasesStatus?: () => string;
  phrasePoke?: () => void;
  setPhraseBaseState?: (kind: string, destination: string) => void;
}

function phraseBridge(): DuofenPhraseBridge | undefined {
  return (window as unknown as { DuofenNative?: DuofenPhraseBridge }).DuofenNative;
}

/** 是否具备原生常驻通知能力（浏览器里没有，设置页据此显示"仅安卓版"） */
export function hasNativePhrases(): boolean {
  return typeof phraseBridge()?.phrasesConfig === 'function';
}

export function nativeStartPhraseService(): boolean {
  const api = phraseBridge();
  if (typeof api?.startPhraseService !== 'function') return false;
  try {
    api.startPhraseService();
    return true;
  } catch {
    return false;
  }
}

export function nativeStopPhraseService(): boolean {
  const api = phraseBridge();
  if (typeof api?.stopPhraseService !== 'function') return false;
  try {
    api.stopPhraseService();
    return true;
  } catch {
    return false;
  }
}

export function nativePhrasesConfig(config: PhraseConfig): boolean {
  const api = phraseBridge();
  if (typeof api?.phrasesConfig !== 'function') return false;
  try {
    api.phrasesConfig(JSON.stringify(config));
    return true;
  } catch {
    return false;
  }
}

export function nativePhrasesStatus(): Record<string, unknown> | null {
  const api = phraseBridge();
  if (typeof api?.phrasesStatus !== 'function') return null;
  try {
    return JSON.parse(api.phrasesStatus()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** 从网页触发一次「戳一下」（与通知栏那颗按钮同一条路径） */
export function nativePhrasePoke(): boolean {
  const api = phraseBridge();
  if (typeof api?.phrasePoke !== 'function') return false;
  try {
    api.phrasePoke();
    return true;
  } catch {
    return false;
  }
}

/** 告诉原生服务当前基础状态：空闲 / 导航中（语料展示完要还原回它） */
export function nativeSetPhraseBaseState(state: PhraseBaseState): boolean {
  const api = phraseBridge();
  if (typeof api?.setPhraseBaseState !== 'function') return false;
  try {
    api.setPhraseBaseState(state.kind, state.kind === 'navigating' ? state.destination : '');
    return true;
  } catch {
    return false;
  }
}