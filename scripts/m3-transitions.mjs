/**
 * 按 Material 3 官方规范重做过渡动画，并让底边栏选中指示器"滑"过去。
 *
 * 依据（docs/v2-refactor.md 第〇章的标准表）：
 *   - 切换互不相关的目的地（标签页）→ **Fade through**：出场 90ms 淡出 + 缩小到 92%，
 *     入场 210ms 淡入 + 从 92% 放大；无位移。
 *   - 前进/返回 → **Shared axis X**：出场向左 30dp 淡出，入场从右 30dp 淡入（返回时反向）。
 *   - 缓动：M3 emphasized（入场 decelerate / 出场 accelerate），不是弹跳。
 *
 * Usage: node scripts/m3-transitions.mjs
 */
import { readFile, writeFile } from 'node:fs/promises';

/* ---------------------------------------------------------------- 1) 过渡 */
const BASE = 'web/src/theme/base.css';
let css = await readFile(BASE, 'utf8');

const NEW_TRANSITIONS = `
/* ==================================================== 页面过渡（M3 规范） ==
   替换此前"浮动弹入"的做法：按 M3 的 Fade through 与 Shared axis X 实现，
   位移更小、无弹跳，视觉上是平滑转换而不是跳入。 */

/* 标签切换：Fade through（无位移） */
@keyframes m3-fade-through-in {
  from {
    opacity: 0;
    transform: scale(0.92);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

@keyframes m3-fade-through-out {
  from {
    opacity: 1;
    transform: scale(1);
  }
  to {
    opacity: 0;
    transform: scale(0.92);
  }
}

/* 前进 / 返回：Shared axis X（30dp 横向滑移 + 淡入淡出） */
@keyframes m3-shared-axis-in {
  from {
    opacity: 0;
    transform: translate3d(30px, 0, 0);
  }
  to {
    opacity: 1;
    transform: translate3d(0, 0, 0);
  }
}

@keyframes m3-shared-axis-out {
  from {
    opacity: 1;
    transform: translate3d(0, 0, 0);
  }
  to {
    opacity: 0;
    transform: translate3d(-30px, 0, 0);
  }
}

@keyframes m3-shared-axis-back-in {
  from {
    opacity: 0;
    transform: translate3d(-30px, 0, 0);
  }
  to {
    opacity: 1;
    transform: translate3d(0, 0, 0);
  }
}

@keyframes m3-shared-axis-back-out {
  from {
    opacity: 1;
    transform: translate3d(0, 0, 0);
  }
  to {
    opacity: 0;
    transform: translate3d(30px, 0, 0);
  }
}

/* M3 标准时长：入场 210ms（emphasized decelerate），出场 90ms（emphasized accelerate） */
.screen.enter-fade,
.screen.enter-zoom {
  animation: m3-fade-through-in 210ms cubic-bezier(0.05, 0.7, 0.1, 1) both;
}

.screen.exit-fade,
.screen.exit-zoom {
  animation: m3-fade-through-out 90ms cubic-bezier(0.3, 0, 0.8, 0.15) both;
  pointer-events: none;
}

.screen.enter-slide {
  animation: m3-shared-axis-in 300ms cubic-bezier(0.05, 0.7, 0.1, 1) both;
}

.screen.exit-slide {
  animation: m3-shared-axis-out 300ms cubic-bezier(0.3, 0, 0.8, 0.15) both;
  pointer-events: none;
}

/* 返回（pop）时反向：页面从左侧滑回、当前页向右退出 */
.screen.enter-slide.back {
  animation-name: m3-shared-axis-back-in;
}

.screen.exit-slide.back {
  animation-name: m3-shared-axis-back-out;
}
`;

// 删掉旧的 float 过渡块，换成 M3 版本
css = css.replace(/\/\* -+ screen transitions[\s\S]*?\.screen\.exit-zoom \{[\s\S]*?\n\}/, NEW_TRANSITIONS.trim());
if (!css.includes('m3-fade-through-in')) css += NEW_TRANSITIONS;

await writeFile(BASE, css, 'utf8');

/* ------------------------------------------------- 2) 指示器改为滑动 */
const NAV = 'web/src/components/glassnav.tsx';
let nav = await readFile(NAV, 'utf8');

// 单个滑动指示器（而不是每个标签一个圆圈）
if (!nav.includes('glass-nav-slider')) {
  nav = nav.replace(
    '        <span className="glass-nav-specular" aria-hidden="true" />',
    `        <span className="glass-nav-specular" aria-hidden="true" />
        {/* 选中指示器：一个会"滑"过去的圆，而不是在新标签上凭空出现 */}
        <span
          className="glass-nav-slider"
          aria-hidden="true"
          style={{
            width: \`calc((100% - 8px) / \${tabs.length})\`,
            transform: \`translateX(calc(\${Math.max(0, tabs.findIndex((tab) => tab.id === active))} * 100%))\`,
          }}
        />`,
  );
  // 各标签自己的圆圈不再需要
  nav = nav.replace('              <span className="glass-tab-indicator" aria-hidden="true" />\n', '');
}
await writeFile(NAV, nav, 'utf8');

const CSS2 = 'web/src/theme/components.css';
let c2 = await readFile(CSS2, 'utf8');
if (!c2.includes('.glass-nav-slider')) {
  c2 += `

/* 滑动式选中指示器（M3 一阶弹簧，平滑过渡而非跳变） */
.glass-nav-slider {
  position: absolute;
  left: 4px;
  top: 4px;
  bottom: 4px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--md-sys-color-secondary-container) 94%, transparent);
  border: 1px solid color-mix(in srgb, #ffffff 20%, transparent);
  box-shadow: inset 0 1px 0 color-mix(in srgb, #ffffff 22%, transparent);
  transition: transform 320ms cubic-bezier(0.05, 0.7, 0.1, 1);
  pointer-events: none;
  z-index: 0;
}

.glass-tab-indicator {
  display: none;
}
`;
}
await writeFile(CSS2, c2, 'utf8');

console.log('过渡：', css.includes('m3-fade-through-in') ? 'M3 fade-through + shared-axis 已写入' : '未写入');
console.log('指示器：', nav.includes('glass-nav-slider') ? '滑动指示器已写入' : '未写入');
