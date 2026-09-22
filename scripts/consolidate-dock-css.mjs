/**
 * 底栏样式归一：样式经过多轮追加，出现了重复/冲突的 .m3e-dock* 规则
 * （表现为三个标签折成两行、滑块尺寸异常）。
 * 这里把所有 .m3e-dock 相关规则整体移除，再追加**唯一一份**权威定义。
 *
 * Usage: node scripts/consolidate-dock-css.mjs
 */
import { readFile, writeFile } from 'node:fs/promises';

const F = 'web/src/theme/schedule.css';
let css = await readFile(F, 'utf8');

/** 删除所有以 .m3e-dock 开头的规则块（含注释占位） */
css = css.replace(/\/\*[^*]*底栏[^*]*\*\/\s*/g, '');
css = css.replace(/(^|\n)\.m3e-dock[^{]*\{[^}]*\}\n?/g, '\n');
css = css.replace(/(^|\n)html\[[^\]]+\]\s+\.m3e-dock[^{]*\{[^}]*\}\n?/g, '\n');
css = css.replace(/(^|\n)html\[[^\]]+\]\s+\.m3e-dock-refraction[^{]*\{[^}]*\}\n?/g, '\n');
css = css.replace(/(^|\n)html\[[^\]]+\]\s+\.m3e-dock-specular[^{]*\{[^}]*\}\n?/g, '\n');

const CANONICAL = `

/* ============================================================================
 * 底栏（M3E + 液态玻璃折射）—— 唯一权威定义
 *   布局：3 等分网格，一个绝对定位滑块随选中项左右平移
 *   玻璃：backdrop-filter 真实模糊 + 饱和度；SVG 位移折射层；跟手高光；按压形变
 *   交互：位置即结果（指针落在哪一格就切哪一格），拖动跟手
 * ========================================================================== */
.m3e-dock {
  position: relative;
  z-index: 40;
  flex: 0 0 auto;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  align-items: stretch;
  gap: 4px;
  height: 68px;
  margin: 6px 12px calc(10px + max(env(safe-area-inset-bottom, 0px), var(--native-inset-bottom, 0px)));
  padding: 6px;
  border-radius: 999px;
  overflow: hidden;
  background: color-mix(in srgb, var(--md-sys-color-surface-container) 58%, transparent);
  backdrop-filter: blur(18px) saturate(1.6);
  -webkit-backdrop-filter: blur(18px) saturate(1.6);
  border: 1px solid color-mix(in srgb, #ffffff 20%, transparent);
  box-shadow:
    0 8px 24px color-mix(in srgb, #000 30%, transparent),
    inset 0 1px 0 color-mix(in srgb, #ffffff 38%, transparent);
  transform: scale(calc(1 - var(--dock-press, 0) * 0.02));
  transition: transform 160ms cubic-bezier(0.2, 0, 0, 1);
  touch-action: none; /* 允许在底栏上自由拖动（作者要求：随意滑动） */
}

/* 折射层：斜向光带经 SVG 位移滤镜掰弯 */
.m3e-dock-refraction {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  pointer-events: none;
  z-index: 0;
  opacity: calc(0.35 + var(--dock-scroll, 0) * 0.35);
  filter: url(#m3e-dock-refraction);
  background: linear-gradient(
    115deg,
    transparent 12%,
    color-mix(in srgb, #ffffff 26%, transparent) 38%,
    transparent 52%,
    color-mix(in srgb, #ffffff 14%, transparent) 72%,
    transparent 88%
  );
}

/* 跟手高光 */
.m3e-dock-specular {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  pointer-events: none;
  z-index: 0;
  opacity: calc(0.5 + var(--dock-scroll, 0) * 0.4);
  background: radial-gradient(
    140px 80px at var(--dock-x, 50%) var(--dock-y, 50%),
    color-mix(in srgb, #ffffff 34%, transparent),
    transparent 70%
  );
}

/* 选中滑块：一格的宽度，按选中序号平移；拖动时跟手且无过渡 */
.m3e-dock-slider {
  position: absolute;
  top: 6px;
  bottom: 6px;
  left: 6px;
  width: calc((100% - 12px - 8px) / 3);
  border-radius: 999px;
  background: var(--md-sys-color-secondary-container);
  z-index: 1;
  pointer-events: none;
  transform: translate3d(calc(var(--m3e-active, 0) * (100% + 4px)), 0, 0);
  transition: transform 320ms cubic-bezier(0.2, 0, 0, 1);
}

.m3e-dock.dragging .m3e-dock-slider {
  transition: none;
  left: calc(6px + var(--dock-drag, 0) * (100% - 12px - (100% - 12px - 8px) / 3));
  transform: none;
}

/* 三个标签：图标在上、文字在下 */
.m3e-dock-tab {
  position: relative;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--md-sys-color-on-surface-variant);
  font: inherit;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: color 160ms linear;
}

.m3e-dock-tab.active {
  color: var(--md-sys-color-on-secondary-container);
}

.m3e-dock-label {
  font-size: 11px;
  line-height: 13px;
}

/* 关闭动效 / 低性能设备：不做模糊与折射 */
html[data-transition='none'] .m3e-dock,
html[data-perf='low'] .m3e-dock {
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
  background: var(--md-sys-color-surface-container-high);
}

html[data-perf='low'] .m3e-dock-refraction,
html[data-perf='low'] .m3e-dock-specular {
  display: none;
}

html[data-transition='none'] .m3e-dock-slider,
html[data-perf='low'] .m3e-dock-slider {
  transition: none;
}
`;

await writeFile(F, css.trimEnd() + CANONICAL, 'utf8');
const count = (css.match(/\.m3e-dock \|\.m3e-dock\{|\.m3e-dock \{/g) ?? []).length;
console.log({ 清理后残留旧规则: count, 已写入权威定义: true });
