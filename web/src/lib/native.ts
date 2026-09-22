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


/** 同步原生 Dock 的选中项（0=首页 1=搜索 2=设置） */
export function nativeDockActive(index: number): void {
  const api = (window as unknown as { DuofenNative?: { dockActive?: (i: number) => void } }).DuofenNative;
  try {
    api?.dockActive?.(index);
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

/** 上课提醒（实况通知 / 灵动岛）：course/room/timeText/textbooks + 剩余分钟数 + 开始时间戳 + 导航链接 */
export interface ClassReminder {
  course: string;
  room: string;
  timeText: string;
  textbooks: string;
  minutesLeft: number;
  startAtMillis: number;
  navigateUri: string;
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
