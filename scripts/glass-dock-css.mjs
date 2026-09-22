/**
 * 底栏「液态玻璃 + 折射」样式（作者要求全部整上）。
 * 说明：Chromium/WebView 会丢弃 backdrop-filter 里的 url(#svg)（实测），
 * 因此折射的做法是：backdrop-filter 做真实背景模糊与饱和提升；
 * 另用一层斜向光带经 SVG feTurbulence + feDisplacementMap 位移，做出"光被掰弯"的折射观感；
 * 再叠跟手高光、滚动冲量、按压形变。
 *
 * Usage: node scripts/glass-dock-css.mjs
 */
import { readFile, writeFile } from 'node:fs/promises';

const F = 'web/src/theme/schedule.css';
let css = await readFile(F, 'utf8');

if (!css.includes('折射玻璃')) {
  css += `

/* ==================== 底栏：液态玻璃 + 折射（作者要求全部整上） ====================
   1) 真实背景模糊与饱和提升（backdrop-filter）
   2) 半透明表面 + 细亮边 + 内外阴影，做出玻璃厚度
   3) SVG feTurbulence + feDisplacementMap 折射层：把玻璃里的光带"掰弯"
   4) 跟手高光（--dock-x/--dock-y）、滚动冲量（--dock-scroll）、按压形变（--dock-press） */
.m3e-dock {
  background: color-mix(in srgb, var(--md-sys-color-surface-container) 58%, transparent);
  backdrop-filter: blur(18px) saturate(1.6);
  -webkit-backdrop-filter: blur(18px) saturate(1.6);
  border: 1px solid color-mix(in srgb, #ffffff 20%, transparent);
  box-shadow:
    0 8px 24px color-mix(in srgb, #000 30%, transparent),
    inset 0 1px 0 color-mix(in srgb, #ffffff 38%, transparent),
    inset 0 -8px 16px color-mix(in srgb, var(--md-sys-color-primary) 6%, transparent);
  overflow: hidden;
  transform: scale(calc(1 - var(--dock-press, 0) * 0.02));
  transition: transform 160ms cubic-bezier(0.2, 0, 0, 1);
}

.m3e-dock-refraction {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  pointer-events: none;
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
  z-index: 0;
}

.m3e-dock-specular {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  pointer-events: none;
  background: radial-gradient(
    140px 80px at var(--dock-x, 50%) var(--dock-y, 50%),
    color-mix(in srgb, #ffffff 34%, transparent),
    transparent 70%
  );
  opacity: calc(0.5 + var(--dock-scroll, 0) * 0.4);
  z-index: 0;
}

.m3e-dock-slider,
.m3e-dock-tab {
  z-index: 1;
}

/* 关闭动效 / 低性能设备：不做模糊与折射，保证流畅 */
html[data-transition='none'] .m3e-dock {
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
  background: var(--md-sys-color-surface-container-high);
}

html[data-perf='low'] .m3e-dock {
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
  background: var(--md-sys-color-surface-container-high);
}

html[data-perf='low'] .m3e-dock-refraction,
html[data-perf='low'] .m3e-dock-specular {
  display: none;
}

/* 顶栏也做玻璃：内容从它下面滚过时有真实的模糊过渡 */
.app-bar {
  background: color-mix(in srgb, var(--md-sys-color-surface) 74%, transparent);
  backdrop-filter: blur(16px) saturate(1.4);
  -webkit-backdrop-filter: blur(16px) saturate(1.4);
}
`;
  await writeFile(F, css, 'utf8');
}

console.log({
  玻璃样式已写入: css.includes('折射玻璃'),
  折射层: css.includes('.m3e-dock-refraction'),
  高光层: css.includes('.m3e-dock-specular'),
  顶栏玻璃: /\.app-bar \{\n  background: color-mix/.test(css),
});
