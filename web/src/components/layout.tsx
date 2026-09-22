/** Layout primitives: app bar, navigation bar, section header, empty state, chips, images. */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { MdIcon, MdIconButton } from './md';
import { useNav } from '../nav/navigation';
import { useAppState } from '../state/AppState';
import { isNativeShell, haptic } from '../lib/native';
import { LENS_DOCK } from '../lib/lens';
import { useLens } from '../lib/useLens';

/* ------------------------------------------------------------- app bar --- */

export function TopAppBar({
  title,
  onBack,
  backLabel = '返回',
  actions,
  leading,
  scrolled = false,
  titleId,
}: {
  title: ReactNode;
  onBack?: () => void;
  backLabel?: string;
  actions?: ReactNode;
  leading?: ReactNode;
  scrolled?: boolean;
  titleId?: string;
}) {
  return (
    <header className={['app-bar', scrolled ? 'scrolled' : ''].join(' ').trim()}>
      {onBack ? <MdIconButton icon="arrow_back" label={backLabel} onClick={onBack} /> : null}
      {leading}
      <h1 id={titleId} className="app-bar-title md-title-large-emphasized">
        {title}
      </h1>
      {actions ? <div className="app-bar-actions">{actions}</div> : null}
    </header>
  );
}

/** Track whether a scrollable element has been scrolled (app bar elevation change). */
export function useScrolled<T extends HTMLElement>(threshold = 4) {
  const ref = useRef<T>(null);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const onScroll = () => setScrolled(element.scrollTop > threshold);
    element.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => element.removeEventListener('scroll', onScroll);
  }, [threshold]);
  return { ref, scrolled };
}

/* -------------------------------------------------------- navigation bar --- */

export type NavTabId = 'schedule' | 'search' | 'settings';

/** 课表是主页（第一个标签、默认选中），记录 / 历史 / 设置排在其后 */
/** v2 框架（m3e-canvas）：底边栏三项 —— 首页（课表）/ 搜索 / 设置 */
const TABS: { id: NavTabId; label: string; icon: string }[] = [
  { id: 'schedule', label: '首页', icon: 'home' },
  { id: 'search', label: '搜索', icon: 'search' },
  { id: 'settings', label: '设置', icon: 'settings' },
];

export function AppNavBar({ active, onSelect }: { active: NavTabId; onSelect: (tab: NavTabId) => void }) {
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
  /* 液态玻璃透镜：按 dock 实际尺寸生成位移贴图（BEZEL / STRENGTH / ZOOM 见 lens.ts）。
     真机核对手续：先关掉开发者选项里的「指针位置」「显示布局边界」再截图，
     否则那些调试叠层会被误认成应用的渲染问题。 */
  useLens(dockRef, LENS_DOCK);
  const draggingRef = useRef(false);
  const [dragging, setDragging] = useState(false);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  /** 拖动期间缓存的几何（避免每帧重排） */
  const geoRef = useRef<{ left: number; width: number; height: number; centers: number[]; cell: number } | null>(null);
  const frameRef = useRef<number | undefined>(undefined);
  const pendingXRef = useRef(0);
  /** 手指运动学：速度 v（px/ms）与加速度 a（px/ms²）—— 形变量直接绑在 a 上 */
  const velRef = useRef(0);
  const accelRef = useRef(0);
  /** 加速度的平滑峰值：手指急停后按帧衰减，形变才不会"啪"一下消失 */
  const accelHoldRef = useRef(0);
  const shapeFrameRef = useRef<number | undefined>(undefined);
  const lastMoveRef = useRef({ x: 0, t: 0 });
  /** 是否已经拖动过（轻点不算拖动：碰撞触感与形变都只该在拖动时出现） */
  const movedRef = useRef(false);
  /** 是否已经贴住边界（用于"刚撞上"的那一次触感） */
  const inWallRef = useRef(false);

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
    return { left: rect.left, width: rect.width, height: rect.height, cell: rect.width / TABS.length, centers };
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
    const pad = 6;
    const cellWidth = geo.cell - 4; // 滑块宽度（含 4px 间隙）
    const rawLeft = x - halfCell;
    const limit = Math.max(pad, geo.width - pad - cellWidth);
    const left = Math.min(Math.max(rawLeft, pad), limit);
    /* 撞墙的判定：色块已经被夹住（走不动了）**并且**手指偏离色块中心超过半格 ——
       也就是"还在往里推"。只看色块被夹住是不行的：点最右边的标签时色块本来就会停在行程终点，
       那会误报成撞墙（真机上就是这么误报的）。 */
    const clamped = Math.abs(rawLeft - left) > 0.5;
    const push = Math.max(0, Math.abs(x - (left + halfCell)) - halfCell);
    const squash = Math.min(0.32, push / 60);
    const inWall = movedRef.current && clamped && push > 1;
    element.style.setProperty('--pill-x', `${left.toFixed(1)}px`);
    /* 碰壁触感：只在"刚撞上"的那一帧响一次（inWallRef 记录状态），
       不然每帧都命中边界会连成一片嗡嗡声。 */
    if (inWall && !inWallRef.current) haptic('wall');
    inWallRef.current = inWall;
    // 变量协议：--pill-x 是位移（px），--pill-stretch 是流体拉伸比例（1→1.37，scaleX 用）。
    // 以前这里写的是一份「比例」但 CSS 当长度用（width: var(--pill-width)），导致拉伸失效。
    element.style.setProperty('--pill-stretch', stretch.toFixed(3));
    // 撞边：横向压窄（0.6 系数压得住流体拉伸）、纵向鼓起（体积感）
    element.style.setProperty('--pill-squash', (1 - squash * 0.62).toFixed(3));
    element.style.setProperty('--pill-bulge', (1 + squash * 0.3).toFixed(3));
    /* 加速度 → 形变量：
       |a| 越大，形变越狠 —— 沿运动方向拉长、垂直方向压扁（保持体积感），
       并按 a 的符号做一点切变，看上去像"被手指拽着走"。
       用「平滑峰值」而不是瞬时值：匀速拖动时瞬时 a≈0（物理上对的，但看不见效果），
       取峰值 + 逐帧衰减，才读得出「甩出去」和「急停」两个瞬间。
       增益 2.6：指尖常见的 0.1~0.15 px/ms² 就够吃到上限 34%。 */
    const deform = Math.min(0.34, accelHoldRef.current * 2.6);
    element.style.setProperty('--pill-deform-x', (1 + deform).toFixed(3));
    element.style.setProperty('--pill-deform-y', (1 - deform * 0.55).toFixed(3));
    element.style.setProperty('--pill-skew', `${(Math.max(-1, Math.min(1, accelRef.current * 2.2)) * 4).toFixed(2)}deg`);
    element.style.setProperty('--dock-x', `${((x / geo.width) * 100).toFixed(1)}%`);
    setHoverIndex(nearest);
  };

  /** 拖动开始时先按下的位置摆好色块（React 渲染晚于 applyFrame 一帧） */
  useEffect(() => {
    if (!dragging) return;
    const geo = geoRef.current;
    if (!geo) return;
    applyFrame();
  }, [dragging]);

  const scheduleFrame = () => {
    if (frameRef.current === undefined) frameRef.current = window.requestAnimationFrame(applyFrame);
  };

  /** 形变衰减循环：只在按住期间跑 —— 每帧把加速度峰值打折，再重算一次形变量。
      注意**不能**用「速度为 0 就退出」做终止条件：按下第一帧 velRef 还是 0，
      循环会在还没开始跟手时就自杀（这个 bug 让形变恒为 1.000），只在松手时取消。 */
  const startShapeLoop = () => {
    if (shapeFrameRef.current !== undefined) return;
    const step = () => {
      if (!draggingRef.current) {
        shapeFrameRef.current = undefined;
        return;
      }
      // 手指停下后没有新的 pointermove，accelRef 会一直保留最后一次采样值，
      // 于是 max() 永远压不下去 —— 超过 40ms 没事件就当作"已停止"，形变才会回弹。
      const idle = performance.now() - lastMoveRef.current.t;
      if (idle > 40) accelRef.current = 0;
      accelHoldRef.current = Math.max(Math.abs(accelRef.current), accelHoldRef.current * 0.84);
      /* 兜底：万一 pointerup 在系统层面丢了（来电、切后台、弹层抢焦点），
         这个循环会一直跑下去烧 CPU。空闲超过 800ms 或页面不可见就自己收摊。 */
      if (idle > 800 || document.hidden) {
        draggingRef.current = false;
        shapeFrameRef.current = undefined;
        return;
      }
      applyFrame();
      shapeFrameRef.current = window.requestAnimationFrame(step);
    };
    shapeFrameRef.current = window.requestAnimationFrame(step);
  };

  const onDown = (event: React.PointerEvent<HTMLElement>) => {
    if (!dockRef.current) return;
    geoRef.current = measure(); // 只在这里读布局

    // 按住：常驻色块直接跟手（不再弹触摸小球，避免同时出现两个圆）
    pendingXRef.current = event.clientX;
    draggingRef.current = true;
    setDragging(true);
    velRef.current = 0;
    accelRef.current = 0;
    accelHoldRef.current = 0;
    inWallRef.current = false;
    movedRef.current = false;
    lastMoveRef.current = { x: event.clientX, t: performance.now() };
    applyFrame();
    startShapeLoop();

    const onWindowMove = (moveEvent: PointerEvent) => {
      if (!draggingRef.current) return;
      movedRef.current = true; // 真的拖起来了（撞墙触感与形变都以此为前提）
      // 速度 → 加速度：都用「本次位移 / 间隔」估算，不读布局
      const now = performance.now();
      const dt = Math.max(8, now - lastMoveRef.current.t);
      const vel = (moveEvent.clientX - lastMoveRef.current.x) / dt;
      accelRef.current = (vel - velRef.current) / dt; // px/ms²
      velRef.current = vel;
      lastMoveRef.current = { x: moveEvent.clientX, t: now };
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
          // 松手：清掉拖动变量 → 色块沿 CSS 的回弹曲线磁吸到选中格（挤压也在这一步弹回）
          element.style.removeProperty('--pill-x');
          element.style.removeProperty('--pill-stretch');
          element.style.removeProperty('--pill-squash');
          element.style.removeProperty('--pill-bulge');
          element.style.removeProperty('--pill-deform-x');
          element.style.removeProperty('--pill-deform-y');
          element.style.removeProperty('--pill-skew');
          velRef.current = 0;
          accelRef.current = 0;
          accelHoldRef.current = 0;
          if (shapeFrameRef.current !== undefined) {
            window.cancelAnimationFrame(shapeFrameRef.current);
            shapeFrameRef.current = undefined;
          }
          setHoverIndex(null);
          const tab = TABS[index];
          if (tab && index !== activeIndex) {
            // 控件生效：切换标签的确认触感
            haptic('select');
            if (typeof navSelectTab === 'function') navSelectTab(tab.id);
            else onSelect(tab.id);
          } else if (tab) {
            // 点了当前标签：给一次轻刻度，避免"点了没反应"的手感
            haptic('tick');
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
      className={`m3e-dock${dragging ? ' dragging' : ''}`}
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
      {/* 内容穿过底栏边界时的散射反馈（上缘最强、往里渐隐，中间保持清晰） */}
      <span className="m3e-dock-scatter" aria-hidden="true" />
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
              haptic('select');
              if (typeof navSelectTab === 'function') navSelectTab(tab.id);
              else onSelect(tab.id);
            }
          }}
        >
          <MdIcon name={tab.icon} size={24} />
          <span className="m3e-dock-label">{tab.label}</span>
        </button>
      ))}
    </nav>
  );
}

export function SectionHeader({
  icon,
  title,
  trailing,
}: {
  icon?: string;
  title: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <div className="section-header">
      {icon ? <MdIcon name={icon} size={20} /> : null}
      <span className="section-title md-title-small-emphasized flex-1">{title}</span>
      {trailing}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon">
        <MdIcon name={icon} size={36} />
      </div>
      <div className="md-title-medium emphasized" style={{ color: 'var(--md-sys-color-on-surface)' }}>
        {title}
      </div>
      <div className="md-body-medium" style={{ maxWidth: 280 }}>
        {description}
      </div>
      {action}
    </div>
  );
}

export function Chip({
  children,
  icon,
  onRemove,
  solid = false,
  onClick,
}: {
  children: ReactNode;
  icon?: string;
  onRemove?: () => void;
  solid?: boolean;
  onClick?: () => void;
}) {
  return (
    <span className={['chip', solid ? 'solid' : '', onClick ? 'tap' : ''].join(' ').trim()} onClick={onClick}>
      {icon ? <MdIcon name={icon} size={16} /> : null}
      <span className="md-label-large">{children}</span>
      {onRemove ? (
        <MdIcon
          name="close"
          size={16}
          className="chip-close"
          style={{}}
        />
      ) : null}
    </span>
  );
}

export function ImageTile({
  src,
  alt,
  height,
  radius,
  onClick,
  className,
  placeholderIcon = 'image',
  children,
  style,
}: {
  src?: string;
  alt: string;
  height?: number | string;
  radius?: number;
  onClick?: () => void;
  className?: string;
  placeholderIcon?: string;
  children?: ReactNode;
  style?: React.CSSProperties;
}) {
  const commonStyle: React.CSSProperties = {
    height: typeof height === 'number' ? `${height}px` : height,
    borderRadius: radius !== undefined ? `${radius}px` : undefined,
    ...style,
  };
  if (src) {
    return (
      <div
        className={['media-thumb', onClick ? 'tap' : '', className ?? ''].join(' ').trim()}
        style={commonStyle}
        onClick={onClick}
        role={onClick ? 'button' : undefined}
        tabIndex={onClick ? 0 : undefined}
      >
        <img src={src} alt={alt} />
        {children}
      </div>
    );
  }
  return (
    <div
      className={['image-placeholder', onClick ? 'tap' : '', className ?? ''].join(' ').trim()}
      style={commonStyle}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-label={`${alt}（暂无图片）`}
    >
      <MdIcon name={placeholderIcon} size={48} />
      {children}
    </div>
  );
}

export function LoadingRow({ label }: { label: string }) {
  return (
    <div className="loading-inline md-body-medium">
      <md-circular-progress indeterminate />
      <span>{label}</span>
    </div>
  );
}

/** localStorage-backed long-press helper for the Home input field. */
export function useLongPress(onLongPress: () => void, onShortPress?: () => void, duration = 550) {
  const timer = useRef<number | undefined>(undefined);
  const longFired = useRef(false);

  const start = useCallback(() => {
    longFired.current = false;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      longFired.current = true;
      onLongPress();
    }, duration);
  }, [duration, onLongPress]);

  const end = useCallback(() => {
    window.clearTimeout(timer.current);
    if (!longFired.current) onShortPress?.();
  }, [onShortPress]);

  const cancel = useCallback(() => window.clearTimeout(timer.current), []);

  return {
    onPointerDown: start,
    onPointerUp: end,
    onPointerLeave: cancel,
    onPointerCancel: cancel,
  };
}
