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
   * 底栏（Dock）：位置即结果 + 拖拽跟手 + Liquid Glass。
   *
   * 切换的唯一事实来源是**指针位置**：不再给按钮绑 onClick（那是"跳两次/跳回主页"的来源）。
   * 指针落在第 i 格 → 切到第 i 个标签；拖动经过第 i 格 → 实时切到第 i 个标签；
   * 松手停在第 i 格 → 停在第 i 个标签。全程幂等，重复落在同一格不会重复触发。
   */
  // 直接拿路由的 selectTab：不依赖各屏传下来的 onSelect，消除"传错/传漏"的可能
  const navSelectTab = useNav().selectTab;
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
    // 优先走路由的规范实现；父组件传入的 onSelect 作为兜底
    if (typeof navSelectTab === 'function') navSelectTab(tab.id);
    else onSelect(tab.id);
  };

  const onDown = (event: React.PointerEvent<HTMLElement>) => {
    if (!dockRef.current) return;
    draggingRef.current = true;
    setDragging(true);
    commit(indexAt(event.clientX));

    // 用 window 级监听跟随拖动：**不用 setPointerCapture** ——
    // 底栏会随页面切换被卸载，捕获一旦残留，后续点击就会被送给已卸载的节点，
    // 表现为"有时点不动、有时跳两次、有时跳回主页"。
    const onWindowMove = (moveEvent: PointerEvent) => {
      if (!draggingRef.current) return;
      commit(indexAt(moveEvent.clientX));
    };
    const onWindowUp = (upEvent: PointerEvent) => {
      if (draggingRef.current) {
        draggingRef.current = false;
        setDragging(false);
        commit(indexAt(upEvent.clientX));
        dockRef.current?.style.removeProperty('--dock-drag');
      }
      window.removeEventListener('pointermove', onWindowMove);
      window.removeEventListener('pointerup', onWindowUp);
      window.removeEventListener('pointercancel', onWindowUp);
    };
    window.addEventListener('pointermove', onWindowMove);
    window.addEventListener('pointerup', onWindowUp);
    window.addEventListener('pointercancel', onWindowUp);
  };

  const onMove = () => {
    /* 拖动跟随改由 window 级监听处理 */
  };

  const onUp = () => {
    /* 结束拖动改由 window 级监听处理 */
  };

  /** 键盘无障碍：方向键 / Enter 仍可切换（不走指针路径） */
  const onKeyDown = (event: React.KeyboardEvent<HTMLElement>, index: number) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (typeof navSelectTab === 'function') navSelectTab(TABS[index].id);
      else onSelect(TABS[index].id);
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
      element.style.setProperty('--dock-x', `${((event.clientX - rect.left) / rect.width) * 100}%`);
      element.style.setProperty('--dock-y', `${((event.clientY - rect.top) / rect.height) * 100}%`);
    };
    const onScroll = () => {
      decay = 1;
      if (raf === undefined) {
        const tick = () => {
          decay *= 0.86;
          element.style.setProperty('--dock-scroll', decay.toFixed(3));
          // 滚动时高光随之偏移，玻璃看起来"在动"
          element.style.setProperty('--dock-x', `${50 + decay * 28}%`);
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
      className={`m3e-dock${dragging ? ' dragging' : ''}`}
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
