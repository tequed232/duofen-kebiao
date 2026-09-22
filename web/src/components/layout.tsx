/** Layout primitives: app bar, navigation bar, section header, empty state, chips, images. */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { MdIcon, MdIconButton } from './md';
import { useNav } from '../nav/navigation';
import { useAppState } from '../state/AppState';
import { isNativeShell } from '../lib/native';
import { LENS_PLAYER } from '../lib/lens';
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
  /* 液态玻璃透镜：按 dock 实际尺寸生成位移贴图（BEZEL / STRENGTH / ZOOM 见 lens.ts） */
  useLens(dockRef, LENS_PLAYER);
  const draggingRef = useRef(false);
  const [dragging, setDragging] = useState(false);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  /** 点击时弹出的小圆球（点哪里弹哪里，随后自动吸附进色块） */
  const [balls, setBalls] = useState<{ id: number; x: number; y: number; toX: number }[]>([]);
  const ballIdRef = useRef(0);

  /** 拖动期间缓存的几何（避免每帧重排） */
  const geoRef = useRef<{ left: number; width: number; height: number; centers: number[]; cell: number } | null>(null);
  const frameRef = useRef<number | undefined>(undefined);
  const pendingXRef = useRef(0);
  /** 拖动中跟手的小球：位置每帧写一次 CSS 变量，不触发 React 渲染 */
  const dragBallRef = useRef<HTMLSpanElement>(null);

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
    element.style.setProperty('--pill-x', `${(x - halfCell).toFixed(1)}px`);
    element.style.setProperty('--pill-width', stretch.toFixed(3));
    element.style.setProperty('--dock-x', `${((x / geo.width) * 100).toFixed(1)}%`);
    // 跟手的小球：同样一帧只写一个变量
    dragBallRef.current?.style.setProperty('--ball-x', `${x.toFixed(1)}px`);
    setHoverIndex(nearest);
  };

  /** 小球首次出现时先摆到手指位置（React 渲染晚于 applyFrame 一帧） */
  useEffect(() => {
    if (!dragging) return;
    const geo = geoRef.current;
    const element = dragBallRef.current;
    if (!geo || !element) return;
    const x = clamp(pendingXRef.current - geo.left, 18, geo.width - 18);
    element.style.setProperty('--ball-x', `${x.toFixed(1)}px`);
  }, [dragging]);

  const scheduleFrame = () => {
    if (frameRef.current === undefined) frameRef.current = window.requestAnimationFrame(applyFrame);
  };

  const onDown = (event: React.PointerEvent<HTMLElement>) => {
    if (!dockRef.current) return;
    geoRef.current = measure(); // 只在这里读布局

    // 按住即出现跟手小球（拖动时一直跟着手指），松手那一刻再吸附进选中色块
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
          // 松手：把跟手的小球换成「吸附」那一颗 —— 从当前位置飞进选中色块后消失
          const id = (ballIdRef.current += 1);
          const fromX = clamp(x, 18, geo.width - 18);
          setBalls((prev) => [...prev, { id, x: fromX, y: geo.height / 2, toX: geo.centers[index] }]);
          window.setTimeout(() => setBalls((prev) => prev.filter((ball) => ball.id !== id)), 480);
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
      <span className="m3e-dock-specular" aria-hidden="true" />
      {/* 按住 / 拖动时跟手的小球（位置由 --ball-x 每帧写入） */}
      {dragging ? <span className="m3e-dock-ball dragging" ref={dragBallRef} aria-hidden="true" /> : null}
      {balls.map((ball) => (
        <span
          key={ball.id}
          className="m3e-dock-ball"
          aria-hidden="true"
          style={{
            left: `${ball.x}px`,
            top: `${ball.y}px`,
            ['--ball-to' as string]: `${(ball.toX - ball.x).toFixed(1)}px`,
          }}
        />
      ))}
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
