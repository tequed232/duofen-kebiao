/** Layout primitives: app bar, navigation bar, section header, empty state, chips, images. */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { MdIcon, MdIconButton } from './md';
import { useNav } from '../nav/navigation';
import { useAppState } from '../state/AppState';
import { isNativeShell } from '../lib/native';

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
   * 底栏（Dock）：位置即结果 + 流体跟手 + 液态玻璃。
   *
   * 三条原则（按作者要求）：
   *  1. **点到什么就是什么**：指针落在哪一格就切到哪一格，不会"跳回主页"（切换只由位置决定）。
   *  2. **不抽搐**：拖动时色块**连续跟手**（无过渡），但**页面切换带阻尼**（在新格里稳定 90ms 才切），
   *     因此手指在格子边界来回抖动时不会疯狂切页。
   *  3. **流体 + 散射 + 反射**：色块跟手移动时按速度横向拉伸（流体感），
   *     并叠加模糊边缘（散射）与顶部高光/内侧反光（反射）。
   */
  const navSelectTab = useNav().selectTab;
  const activeIndex = Math.max(0, TABS.findIndex((tab) => tab.id === active));
  const dockRef = useRef<HTMLElement>(null);
  const draggingRef = useRef(false);
  const committedRef = useRef(activeIndex);
  const pendingRef = useRef<number | null>(null);
  const dwellTimer = useRef<number | undefined>(undefined);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    committedRef.current = activeIndex;
  }, [activeIndex]);

  useEffect(() => () => window.clearTimeout(dwellTimer.current), []);

  /** 指针 x → 标签序号，并把色块位置与速度写到 CSS 变量（色块由 CSS 连续跟手） */
  const indexAt = (clientX: number, clientY?: number) => {
    const element = dockRef.current;
    if (!element) return activeIndex;
    const rect = element.getBoundingClientRect();
    if (!rect.width) return activeIndex;
    const ratio = Math.min(0.9999, Math.max(0, (clientX - rect.left) / rect.width));
    element.style.setProperty('--dock-drag', String(ratio));
    if (clientY !== undefined) {
      const localY = Math.min(1, Math.max(0, (clientY - rect.top) / rect.height));
      element.style.setProperty('--dock-y', `${localY * 100}%`);
    }
    return Math.min(TABS.length - 1, Math.floor(ratio * TABS.length));
  };

  /** 立即切换（命中新格子时调用，带回调） */
  const commitNow = (index: number) => {
    if (index === committedRef.current) return;
    const tab = TABS[index];
    if (!tab) return;
    committedRef.current = index;
    if (typeof navSelectTab === 'function') navSelectTab(tab.id);
    else onSelect(tab.id);
  };

  /** 拖动中的切换：带 90ms 稳定判定，避免边界抖动导致连续切页（抽搐） */
  const commitWithDwell = (index: number) => {
    if (index === committedRef.current) return;
    if (pendingRef.current === index) return;
    pendingRef.current = index;
    window.clearTimeout(dwellTimer.current);
    dwellTimer.current = window.setTimeout(() => {
      if (pendingRef.current !== null) commitNow(pendingRef.current);
      pendingRef.current = null;
    }, 130);
  };

  /** 速度驱动的流体形变：位移越快，色块横向拉伸越明显 */
  const trackVelocity = (clientX: number) => {
    const element = dockRef.current;
    if (!element) return;
    const now = performance.now();
    const last = (element as HTMLElement & { __lastX?: number; __lastT?: number });
    const dx = last.__lastX === undefined ? 0 : clientX - last.__lastX;
    const dt = last.__lastT === undefined ? 16 : Math.max(1, now - last.__lastT);
    last.__lastX = clientX;
    last.__lastT = now;
    const speed = Math.min(1, Math.abs(dx / dt) * 1.6);
    element.style.setProperty('--dock-velocity', speed.toFixed(3));
  };

  const onDown = (event: React.PointerEvent<HTMLElement>) => {
    if (!dockRef.current) return;
    draggingRef.current = true;
    setDragging(true);
    pendingRef.current = null;
    const index = indexAt(event.clientX, event.clientY);
    commitNow(index); // 点按：立刻就是它

    const onWindowMove = (moveEvent: PointerEvent) => {
      if (!draggingRef.current) return;
      trackVelocity(moveEvent.clientX);
      commitWithDwell(indexAt(moveEvent.clientX, moveEvent.clientY));
    };
    const onWindowUp = (upEvent: PointerEvent) => {
      if (draggingRef.current) {
        draggingRef.current = false;
        setDragging(false);
        window.clearTimeout(dwellTimer.current);
        pendingRef.current = null;
        commitNow(indexAt(upEvent.clientX, upEvent.clientY)); // 松手：停在哪就是哪
        const element = dockRef.current;
        if (element) {
          element.style.removeProperty('--dock-drag');
          element.style.setProperty('--dock-velocity', '0');
        }
      }
      window.removeEventListener('pointermove', onWindowMove);
      window.removeEventListener('pointerup', onWindowUp);
      window.removeEventListener('pointercancel', onWindowUp);
    };
    window.addEventListener('pointermove', onWindowMove);
    window.addEventListener('pointerup', onWindowUp);
    window.addEventListener('pointercancel', onWindowUp);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLElement>, index: number) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      commitNow(index);
    }
  };

  return (
    <nav
      className={`m3e-dock${dragging ? ' dragging' : ''}`}
      aria-label="主导航"
      ref={dockRef}
      style={{ '--m3e-active': String(activeIndex), '--dock-velocity': '0' } as React.CSSProperties}
      onPointerDown={onDown}
      onPointerMove={(event) => {
        // 悬停高光：不按住也跟手
        const element = dockRef.current;
        if (!element) return;
        const rect = element.getBoundingClientRect();
        element.style.setProperty('--dock-x', `${((event.clientX - rect.left) / rect.width) * 100}%`);
        element.style.setProperty('--dock-y', `${((event.clientY - rect.top) / rect.height) * 100}%`);
      }}
    >
      <svg className="m3e-dock-svg" aria-hidden="true" width="0" height="0">
        <filter id="m3e-dock-refraction" x="-20%" y="-20%" width="140%" height="140%">
          <feTurbulence type="fractalNoise" baseFrequency="0.008 0.02" numOctaves="2" seed="7" result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="14" xChannelSelector="R" yChannelSelector="G" />
        </filter>
        <filter id="m3e-dock-scatter" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="2.2" result="soft" />
          <feComposite in="SourceGraphic" in2="soft" operator="over" />
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
          className={`m3e-dock-tab${tab.id === active ? ' active' : ''}`}
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
