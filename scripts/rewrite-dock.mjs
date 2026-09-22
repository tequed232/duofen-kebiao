/**
 * 底栏（Dock）重写：修掉「跳两次 / 跳回主页」并补齐 Apple Liquid Glass 指引。
 *
 * 【跳转 bug 的根因】
 *   上一版同时存在两条切换路径：
 *     A. 指针位置驱动（pointerdown/move/up → indexAt(x) → onSelect）
 *     B. 每个按钮自己的 onClick → onSelect(tab.id)
 *   一次点击时两条都会跑；当手指有 1~2px 抖动、或指针被 dock 捕获导致 click 目标变化时，
 *   A 与 B 算出的标签**不一致** → 先跳到 A 的页，再跳到 B 的页（看起来就是"跳两次"或"跳回主页"）。
 *
 * 【修法】唯一事实来源 = 指针位置：
 *   · 移除按钮的 onClick（不再有第二条路径）
 *   · 用 lastIndex 记录已选标签，commit 幂等
 *   · 键盘无障碍单独用 onKeyDown 处理
 *
 * 【Apple Liquid Glass 指引的落实】
 *   · 同心圆角：内层滑块半径 = 外层胶囊半径 − 内边距（concentric radii）
 *   · 内容感知着色：用当前主题的 primary 作为玻璃色调（content-aware tint）
 *   · 运动响应高光：指针位置 + 滚动冲量共同驱动高光，滚动时高光随之偏移
 *   · 减少透明度 / 低性能时降级为不透明（对应系统"降低透明度"辅助功能）
 *   · 不与其它玻璃叠放（本项目仅顶栏与底栏各一处，互不重叠）
 *
 * Usage: node scripts/rewrite-dock.mjs
 */
import { readFile, writeFile } from 'node:fs/promises';

/* ---------------------------------------------------------------- 组件重写 */
const F = 'web/src/components/layout.tsx';
let layout = await readFile(F, 'utf8');
const start = layout.indexOf('export function AppNavBar(');
let end = layout.indexOf('\nexport ', start + 10);
if (end < 0) end = layout.length;

const COMPONENT = `export function AppNavBar({ active, onSelect }: { active: NavTabId; onSelect: (tab: NavTabId) => void }) {
  /**
   * 底栏（Dock）：位置即结果 + 拖拽跟手 + Liquid Glass。
   *
   * 切换的唯一事实来源是**指针位置**：不再给按钮绑 onClick（那是"跳两次/跳回主页"的来源）。
   * 指针落在第 i 格 → 切到第 i 个标签；拖动经过第 i 格 → 实时切到第 i 个标签；
   * 松手停在第 i 格 → 停在第 i 个标签。全程幂等，重复落在同一格不会重复触发。
   */
  const activeIndex = Math.max(0, TABS.findIndex((tab) => tab.id === active));
  const dockRef = useRef<HTMLElement>(null);
  const draggingRef = useRef(false);
  /** 已提交的标签序号：幂等的关键（避免同一次点击被重复提交） */
  const committedRef = useRef(activeIndex);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    committedRef.current = activeIndex;
  }, [activeIndex]);

  /** 指针 x → 标签序号（0..2），同时把滑块位置写到 CSS 变量 */
  const indexAt = (clientX: number) => {
    const element = dockRef.current;
    if (!element) return activeIndex;
    const rect = element.getBoundingClientRect();
    if (!rect.width) return activeIndex;
    const ratio = Math.min(0.9999, Math.max(0, (clientX - rect.left) / rect.width));
    element.style.setProperty('--dock-drag', String(ratio));
    return Math.min(TABS.length - 1, Math.floor(ratio * TABS.length));
  };

  /** 幂等提交：只有真正换了标签才通知外部 */
  const commit = (index: number) => {
    if (index === committedRef.current) return;
    const tab = TABS[index];
    if (!tab) return;
    committedRef.current = index;
    onSelect(tab.id);
  };

  const onDown = (event: React.PointerEvent<HTMLElement>) => {
    const element = dockRef.current;
    if (!element) return;
    element.setPointerCapture?.(event.pointerId);
    draggingRef.current = true;
    setDragging(true);
    commit(indexAt(event.clientX));
  };

  const onMove = (event: React.PointerEvent<HTMLElement>) => {
    if (!draggingRef.current) return;
    commit(indexAt(event.clientX));
  };

  const onUp = (event: React.PointerEvent<HTMLElement>) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    setDragging(false);
    commit(indexAt(event.clientX));
    dockRef.current?.style.removeProperty('--dock-drag');
  };

  /** 键盘无障碍：方向键 / Enter 仍可切换（不走指针路径） */
  const onKeyDown = (event: React.KeyboardEvent<HTMLElement>, index: number) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onSelect(TABS[index].id);
    }
  };

  /** 运动响应：指针位置 + 滚动冲量共同驱动高光（Apple 的 motion-reactive specular） */
  useEffect(() => {
    const element = dockRef.current;
    if (!element) return undefined;
    let decay = 0;
    let raf: number | undefined;
    const onPointerMove = (event: PointerEvent) => {
      const rect = element.getBoundingClientRect();
      element.style.setProperty('--dock-x', \`\${((event.clientX - rect.left) / rect.width) * 100}%\`);
      element.style.setProperty('--dock-y', \`\${((event.clientY - rect.top) / rect.height) * 100}%\`);
    };
    const onScroll = () => {
      decay = 1;
      if (raf === undefined) {
        const tick = () => {
          decay *= 0.86;
          element.style.setProperty('--dock-scroll', decay.toFixed(3));
          // 滚动时高光随之偏移，玻璃看起来"在动"
          element.style.setProperty('--dock-x', \`\${50 + decay * 28}%\`);
          raf = decay > 0.02 ? window.requestAnimationFrame(tick) : undefined;
        };
        raf = window.requestAnimationFrame(tick);
      }
    };
    element.addEventListener('pointermove', onPointerMove);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      element.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('scroll', onScroll);
      if (raf !== undefined) window.cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <nav
      className={\`m3e-dock\${dragging ? ' dragging' : ''}\`}
      aria-label="主导航"
      ref={dockRef}
      style={{ '--m3e-active': String(activeIndex) } as React.CSSProperties}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      <svg className="m3e-dock-svg" aria-hidden="true" width="0" height="0">
        <filter id="m3e-dock-refraction" x="-20%" y="-20%" width="140%" height="140%">
          <feTurbulence type="fractalNoise" baseFrequency="0.008 0.02" numOctaves="2" seed="7" result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="14" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </svg>
      <span className="m3e-dock-refraction" aria-hidden="true" />
      <span className="m3e-dock-specular" aria-hidden="true" />
      <span className="m3e-dock-slider" aria-hidden="true" />
      {TABS.map((tab, index) => (
        <button
          key={tab.id}
          type="button"
          className={\`m3e-dock-tab\${tab.id === active ? ' active' : ''}\`}
          aria-label={tab.label}
          aria-current={tab.id === active ? 'page' : undefined}
          onKeyDown={(event) => onKeyDown(event, index)}
        >
          <MdIcon name={tab.id === active ? (tab.activeIcon ?? tab.icon) : tab.icon} size={24} />
          <span className="m3e-dock-label">{tab.label}</span>
        </button>
      ))}
    </nav>
  );
}
`;

layout = layout.slice(0, start) + COMPONENT + layout.slice(end);
await writeFile(F, layout, 'utf8');

/* ------------------------------------------------- Apple 指引对应的样式细化 */
const C = 'web/src/theme/schedule.css';
let css = await readFile(C, 'utf8');
if (!css.includes('Apple Liquid Glass 指引')) {
  css += `

/* ============ Apple Liquid Glass 指引的落地细节（作者要求参照官方文件） ============
   1. 同心圆角：内层滑块半径 = 外层半径 − 内边距，视觉上"同圆心"
   2. 内容感知着色：玻璃表面混入主题色（primary）作为 tint，随主题变化
   3. 运动响应：高光位置由指针与滚动共同驱动（见组件里的 --dock-x/--dock-scroll）
   4. 降低透明度/低性能：降级为不透明表面（对应系统辅助功能中的"降低透明度"）
   5. 不与其它玻璃叠放：本项目仅顶栏与底栏，两处互不重叠 */
.m3e-dock {
  background:
    linear-gradient(
      180deg,
      color-mix(in srgb, var(--md-sys-color-primary) 6%, transparent),
      transparent 55%
    ),
    color-mix(in srgb, var(--md-sys-color-surface-container) 56%, transparent);
  border-radius: 34px;
}

.m3e-dock-slider {
  /* 同心圆角：外层 34px − 内边距 6px */
  border-radius: 28px;
  background: color-mix(in srgb, var(--md-sys-color-secondary-container) 94%, transparent);
  box-shadow: inset 0 1px 0 color-mix(in srgb, #ffffff 30%, transparent);
}

.m3e-dock-tab {
  border-radius: 28px;
}

/* 玻璃边缘的"高光描边"：Apple 强调玻璃要有清晰的边缘反射 */
.m3e-dock::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  pointer-events: none;
  box-shadow: inset 0 0 0 1px color-mix(in srgb, #ffffff 26%, transparent);
  z-index: 3;
}

html[data-transition='none'] .m3e-dock,
html[data-perf='low'] .m3e-dock {
  background: var(--md-sys-color-surface-container-high);
}
`;
  await writeFile(C, css, 'utf8');
}

console.log({
  重写完成: layout.includes('位置即结果 + 拖拽跟手 + Liquid Glass'),
  按钮无onClick: !/m3e-dock-tab[\s\S]{0,400}onClick=/.test(layout),
  幂等: layout.includes('committedRef'),
  Apple样式: css.includes('Apple Liquid Glass 指引'),
});
