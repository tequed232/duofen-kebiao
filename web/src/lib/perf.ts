/**
 * 高刷新率 / 性能自适应。
 *
 * 144Hz 屏上底边栏的实时折射与水滴动画开销不小：这里持续测量帧间隔，
 * 连续掉帧就把 html[data-perf] 置为 'low'（CSS 据此关水滴、减弱折射），
 * 恢复流畅后再升回 'high'。避免"为了好看而卡顿"。
 */
const SAMPLE = 45; // 采样帧数
const LOW_FPS = 50; // 低于此值视为掉帧
const HIGH_FPS = 58; // 高于此值恢复高质量

export function startPerfWatch(): () => void {
  let frames = 0;
  let start = performance.now();
  let raf = 0;
  let stopped = false;
  let low = false;

  const root = document.documentElement;

  const loop = (now: number) => {
    if (stopped) return;
    frames += 1;
    if (frames >= SAMPLE) {
      const fps = (frames * 1000) / Math.max(1, now - start);
      if (!low && fps < LOW_FPS) {
        low = true;
        root.dataset.perf = 'low';
      } else if (low && fps > HIGH_FPS) {
        low = false;
        root.dataset.perf = 'high';
      }
      frames = 0;
      start = now;
    }
    raf = window.requestAnimationFrame(loop);
  };

  // 尊重系统的「减少动态效果」
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
    root.dataset.perf = 'low';
    return () => undefined;
  }

  raf = window.requestAnimationFrame(loop);
  return () => {
    stopped = true;
    window.cancelAnimationFrame(raf);
  };
}
