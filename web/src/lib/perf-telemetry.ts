/**
 * 真机可观测：把「主线程被顶住」的事件报到 console，
 * 再由 APK 宿主的 onConsoleMessage 转发进 logcat（`adb logcat -s DuofenWeb`）。
 *
 * 为什么需要它：卡死类问题在桌面浏览器几乎复现不出来（桌面解码/绘制快得多），
 * 只有在真机上把长任务打印出来，才能定位到具体是哪个动作顶住了主线程。
 */
const SLOW_TASK_MS = 120;
const SLOW_ACTION_MS = 200;

export function installPerfTelemetry(): void {
  try {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.duration < SLOW_TASK_MS) continue;
        // TaskAttributionTiming 只在 longtask 条目上出现，TS 的 PerformanceEntry 没声明
        const attributionList =
          (entry as PerformanceEntry & { attribution?: Array<{ name: string; containerType: string; containerName?: string }> })
            .attribution ?? [];
        const attribution = attributionList
          .map((item) => `${item.name}/${item.containerType}${item.containerName ? `(${item.containerName})` : ''}`)
          .join(' ');
        console.warn(`[longtask] ${Math.round(entry.duration)}ms ${attribution}`);
      }
    });
    observer.observe({ entryTypes: ['longtask'] });
  } catch {
    /* 老 WebView 不支持 longtask 就跳过 */
  }
}

/** 包一段可能顶住主线程的同步代码，超过阈值就报到 console */
export function timeSync<T>(label: string, run: () => T): T {
  const started = performance.now();
  const result = run();
  const cost = performance.now() - started;
  if (cost >= SLOW_ACTION_MS) console.warn(`[slow] ${label} ${Math.round(cost)}ms`);
  return result;
}
