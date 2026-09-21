/**
 * 最终修正底边栏样式（对齐酷安 16.6.2 实拍）。
 * 直接改写原规则并追加末尾覆盖块，避免"追加被旧规则压住"或 shell 中断导致空写。
 *
 * Usage: node scripts/finalize-glass-bar.mjs
 */
import { readFile, writeFile } from 'node:fs/promises';

const FILE = 'web/src/theme/components.css';
let css = await readFile(FILE, 'utf8');

// 1) 干掉冰彩染色与折射/高光层（那块"橙色胶囊"就是 ::after 染色层）
css = css.replace(
  /\.glass-nav-inner::after \{[\s\S]*?\n\}/,
  `.glass-nav-inner::after {\n  display: none; /* 酷安是安静的玻璃：不要色斑 */\n}`,
);

// 2) 追加最高优先级的最终覆盖（放文件末尾，确保胜过所有旧规则）
const FINAL = `

/* ==================== 底边栏最终版（对齐酷安 16.6.2 实拍） ==================== */
.glass-nav-inner {
  height: 62px !important;
  padding: 4px !important;
  border-radius: 999px !important;
  background: color-mix(in srgb, var(--md-sys-color-surface-container) 68%, transparent) !important;
  backdrop-filter: blur(20px) saturate(1.3) !important;
  -webkit-backdrop-filter: blur(20px) saturate(1.3) !important;
  border: 1px solid color-mix(in srgb, #ffffff 16%, transparent) !important;
  box-shadow: 0 6px 18px color-mix(in srgb, #000 32%, transparent) !important;
}

.glass-nav-inner::after,
.glass-nav-refraction,
.glass-nav-specular {
  display: none !important;
}

.glass-tab-indicator {
  inset: auto !important;
  left: 50% !important;
  top: 50% !important;
  width: 54px !important;
  height: 54px !important;
  transform: translate(-50%, -50%) !important;
  border-radius: 999px !important;
  background: color-mix(in srgb, var(--md-sys-color-secondary-container) 94%, transparent) !important;
  border: 1px solid color-mix(in srgb, #ffffff 20%, transparent) !important;
  box-shadow: inset 0 1px 0 color-mix(in srgb, #ffffff 22%, transparent) !important;
}

.glass-tab.active .glass-tab-indicator {
  transform: translate(-50%, -50%) scale(1) !important;
}

.glass-tab {
  height: 54px !important;
  font-size: 11px !important;
  line-height: 13px !important;
  gap: 1px !important;
}

.glass-tab.active {
  color: var(--md-sys-color-on-secondary-container) !important;
}
`;

if (!css.includes('底边栏最终版')) css += FINAL;
await writeFile(FILE, css, 'utf8');

console.log('已写入：', {
  染色层已关闭: css.includes('酷安是安静的玻璃'),
  最终覆盖块: css.includes('底边栏最终版'),
  文件长度: css.length,
});
