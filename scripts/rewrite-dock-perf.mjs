/**
 * 底栏（Dock）性能重写：消除真机抽搐。
 *
 * 【抽搐的三处元凶】
 *   1. pointermove 里每帧调用 getBoundingClientRect() → 强制同步重排（forced reflow）
 *   2. 用 width 做"流体拉伸" → 每帧触发 layout
 *   3. 移动/变形的元素上挂着 SVG 滤镜（feGaussianBlur、feDisplacementMap）
 *      → WebView 每帧重算滤镜链，真机上直接掉帧
 *
 * 【重写做法】只走合成器（compositor）路径：
 *   · pointerdown 时**一次性缓存**底栏矩形与三个标签的中心（之后不再读取布局）
 *   · pointermove 用 requestAnimationFrame **合帧**，一帧只写一次 CSS 变量
 *   · 拉伸改用 transform: scaleX()（不再改 width）→ 只有 transform 变化，无 layout
 *   · 滑块上不再挂 SVG 滤镜；柔光改用廉价的渐变 + box-shadow
 *   · 只在拖动时临时降级最重的玻璃层（拖动一结束立刻恢复）
 *
 * Usage: node scripts/rewrite-dock-perf.mjs
 */
import { readFile, writeFile } from 'node:fs/promises';

/* ------------------------------------------------------------ 组件：缓存几何 + 合帧 */
const F = 'web/src/components/layout.tsx';
let layout = await readFile(F, 'utf8');
const start = layout.indexOf('export function AppNavBar(');
let end = layout.indexOf('\nexport ', start + 10);
if (end < 0) end = layout.length;

layout = layout.slice(0, start) + `export function AppNavBar({ active, onSelect }: { active: NavTabId; onSelect: (tab: NavTabId) => void }) {
  /**
   * 底栏（Dock）—— 位置即结果 + 流体跟手 + 液态玻璃。
   *
   * **性能约束（真机抽搐的修法）**：拖动过程中
   *   · 不读取任何布局（几何在 pointerdown 时缓存一次）
   *   · 不用 rAF 之外的方式写样式（一帧最多写一次 CSS 变量）
   *   · 只写 transform + width 两个变量（保持参考实现的 width 拉伸观感），
     但**不在移动回调里读取布局** —— 强制同步重排才是真机掉帧的主因
   *   · 滑块上不挂 SVG 滤镜（每帧重算滤镜链是另一个主因）；拖动时临时降级折射层，松手立刻恢复
   */
  const navSelectTab = useNav().selectTab;
  const activeIndex = Math.max(0, TABS.findIndex((tab) => tab.id === active));
  const dockRef = useRef<HTMLElement>(null);
  const draggingRef = useRef(false);
  const [dragging, setDragging] = useState(false);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  /** 拖动期间缓存的几何（避免每帧重排） */
  const geoRef = useRef<{ left: number; width: number; centers: number[]; cell: number } | null>(null);
  const frameRef = useRef<number | undefined>(undefined);
  const pendingXRef = useRef(0);

  const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

  /** 一次性测量：底栏左边缘、宽度、每格宽度、三个标签中心 */
  const measure = () => {
    const element = dockRef.current;
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    const buttons = Array.from(element.querySelectorAll<HTMLElement>('.m3e-dock-tab'));
    const centers = buttons.map((button) => {
      const r = button.getBoundingClientRect();
      return r.left - rect.left + r.width / 2;
    });
    return { left: rect.left, width: rect.width, cell: rect.width / TABS.length, centers };
  };

  /** 把指针位置换算成「色块中心 x」与「拉伸比例」，一帧只写一次 */
  const applyFrame = () => {
    frameRef.current = undefined;
    const element = dockRef.current;
    const geo = geoRef.current;
    if (!element || !geo) return;
    const x = clamp(pendingXRef.current - geo.left, 18, geo.width - 18);
    const nearest = clamp(Math.floor(x / geo.cell), 0, TABS.length - 1);
    const offset = Math.abs(x - geo.centers[nearest]);
    // 参考实现：54 → 上限 74（约 1.37 倍），用 scaleX 实现（不触发 layout）
    const stretch = Math.min(1.37, 1 + (offset * 0.25) / 54);
    const halfCell = geo.cell / 2;
    element.style.setProperty('--pill-x', \`\${(x - halfCell).toFixed(1)}px\`);
    element.style.setProperty('--pill-width', stretch.toFixed(3));
    element.style.setProperty('--dock-x', \`\${((x / geo.width) * 100).toFixed(1)}%\`);
    setHoverIndex(nearest);
  };

  const scheduleFrame = () => {
    if (frameRef.current === undefined) frameRef.current = window.requestAnimationFrame(applyFrame);
  };

  const onDown = (event: React.PointerEvent<HTMLElement>) => {
    if (!dockRef.current) return;
    geoRef.current = measure(); // 只在这里读布局
    pendingXRef.current = event.clientX;
    draggingRef.current = true;
    setDragging(true);
    applyFrame();

    const onWindowMove = (moveEvent: PointerEvent) => {
      if (!draggingRef.current) return;
      pendingXRef.current = moveEvent.clientX;
      scheduleFrame(); // 合帧：一帧最多写一次
    };
    const onWindowUp = (upEvent: PointerEvent) => {
      if (draggingRef.current) {
        draggingRef.current = false;
        setDragging(false);
        if (frameRef.current !== undefined) {
          window.cancelAnimationFrame(frameRef.current);
          frameRef.current = undefined;
        }
        const geo = geoRef.current;
        const element = dockRef.current;
        if (geo && element) {
          const x = clamp(upEvent.clientX - geo.left, 0, geo.width - 1);
          const index = clamp(Math.floor(x / geo.cell), 0, TABS.length - 1);
          element.style.removeProperty('--pill-x');
          element.style.removeProperty('--pill-width');
          setHoverIndex(null);
          const tab = TABS[index];
          if (tab && index !== activeIndex) {
            if (typeof navSelectTab === 'function') navSelectTab(tab.id);
            else onSelect(tab.id);
          }
        }
        geoRef.current = null;
      }
      window.removeEventListener('pointermove', onWindowMove);
      window.removeEventListener('pointerup', onWindowUp);
      window.removeEventListener('pointercancel', onWindowUp);
    };
    window.addEventListener('pointermove', onWindowMove, { passive: true });
    window.addEventListener('pointerup', onWindowUp, { passive: true });
    window.addEventListener('pointercancel', onWindowUp, { passive: true });
  };

  useEffect(() => () => {
    if (frameRef.current !== undefined) window.cancelAnimationFrame(frameRef.current);
  }, []);

  return (
    <nav
      className={\`m3e-dock\${dragging ? ' dragging' : ''}\`}
      aria-label="主导航"
      ref={dockRef}
      style={{ '--m3e-active': String(activeIndex) } as React.CSSProperties}
      onPointerDown={onDown}
    >
      <svg className="m3e-dock-svg" aria-hidden="true" width="0" height="0">
        <filter id="m3e-dock-refraction" x="-20%" y="-20%" width="140%" height="140%">
          <feTurbulence type="fractalNoise" baseFrequency="0.008 0.02" numOctaves="2" seed="7" result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="14" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </svg>
      <span className="m3e-dock-refraction" aria-hidden="true" />
      <span className="m3e-dock-specular" aria-hidden="true" />
      <span className="m3e-dock-slider" aria-hidden="true">
        <span className="m3e-dock-slider-reflection" aria-hidden="true" />
      </span>
      {TABS.map((tab, index) => (
        <button
          key={tab.id}
          type="button"
          className={[
            'm3e-dock-tab',
            tab.id === active ? 'active' : '',
            hoverIndex === index ? 'hovered' : '',
          ].join(' ').trim()}
          aria-label={tab.label}
          aria-current={tab.id === active ? 'page' : undefined}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              if (typeof navSelectTab === 'function') navSelectTab(tab.id);
              else onSelect(tab.id);
            }
          }}
        >
          <MdIcon name={tab.id === active ? (tab.activeIcon ?? tab.icon) : tab.icon} size={24} />
          <span className="m3e-dock-label">{tab.label}</span>
        </button>
      ))}
    </nav>
  );
}
` + layout.slice(end);
await writeFile(F, layout, 'utf8');

/* ---------------------------------------------------------------- CSS：只动 transform */
const C = 'web/src/theme/schedule.css';
let css = await readFile(C, 'utf8');
if (!css.includes('--pill-width')) {
  css += `

/* ==================== 底栏性能版（保留参考实现的 width 拉伸观感）====================
   · 移动与拉伸仍是 translate3d + width（与参考实现一致）
   · 但**不在指针回调里读布局**（几何在按下时缓存一次）→ 消除强制重排
   · 滑块上不挂 SVG 滤镜 → 消除每帧滤镜重算
   · 拖动时临时降级折射层，松手立刻恢复 */
.m3e-dock {
  contain: layout paint style;
}

.m3e-dock-slider {
  left: 6px;
  width: calc((100% - 12px - 8px) / 3);
  transform: translate3d(calc(var(--m3e-active, 0) * (100% + 4px)), 0, 0);
  transition: transform 350ms cubic-bezier(0.2, 0.9, 0.3, 1.2);
  will-change: transform;
  /* 柔光：两层廉价阴影近似原来的散射，不再使用 feGaussianBlur */
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, #ffffff 42%, transparent),
    0 2px 10px color-mix(in srgb, var(--md-sys-color-secondary) 26%, transparent),
    0 6px 22px color-mix(in srgb, var(--md-sys-color-secondary) 18%, transparent);
  filter: none;
}

.m3e-dock.dragging .m3e-dock-slider {
  width: calc((100% - 12px - 8px) / 3);
  transform: translate3d(var(--pill-x, 0px), 0, 0) scaleX(var(--pill-width, 1));
  transform-origin: 50% 50%;
  transition: none; /* 跟手：不加过渡，避免回弹抖动 */
}

/* 拖动时降级最重的玻璃层，松手立即恢复（减少 WebView 每帧合成压力） */
.m3e-dock.dragging .m3e-dock-refraction {
  display: none;
}

.m3e-dock.dragging .m3e-dock-specular {
  opacity: calc(0.5 + var(--dock-scroll, 0) * 0.4);
}

html[data-perf='low'] .m3e-dock-slider {
  box-shadow: inset 0 1px 0 color-mix(in srgb, #ffffff 42%, transparent);
}
`;
  await writeFile(C, css, 'utf8');
}

console.log({
  缓存几何: layout.includes('geoRef'),
  合帧: layout.includes('scheduleFrame'),
  只改transform: layout.includes('--pill-width'),
  拖动不读布局: !/onWindowMove[\s\S]{0,200}getBoundingClientRect/.test(layout),
  样式已加: css.includes('--pill-width'),
});
