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
   * 底栏（Dock）——按作者提供的参考实现改写交互模型：
   *
   *  1. **拖动期间只移动色块**（连续跟手）+ 按"离最近标签中心的距离"**动态拉伸宽度**（54→74px，流体感），
   *     期间**不切换页面** —— 因此不会抽搐，也不会"跳回主页"。
   *  2. **松手磁吸**到最近的标签并切换（cubic-bezier(0.2,0.9,0.3,1.2) 带轻微回弹）。
   *  3. 点按等价于"按下即松手" → 落在哪一格就是哪一格（点到什么就是什么）。
   *  4. 材质不变：液态玻璃 + 折射 + 散射 + 反射（跟手高光）。
   */
  const navSelectTab = useNav().selectTab;
  const activeIndex = Math.max(0, TABS.findIndex((tab) => tab.id === active));
  const dockRef = useRef<HTMLElement>(null);
  const draggingRef = useRef(false);
  const [dragging, setDragging] = useState(false);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

  /** 标签中心（相对底栏左边缘） */
  const tabCenter = (index: number) => {
    const element = dockRef.current;
    const button = element?.querySelectorAll<HTMLElement>('.m3e-dock-tab')[index];
    if (!element || !button) return 0;
    const dockRect = element.getBoundingClientRect();
    const rect = button.getBoundingClientRect();
    return rect.left - dockRect.left + rect.width / 2;
  };

  /** 指针位置 → 「色块位置 + 动态宽度」并写入 CSS 变量（不切页） */
  const followPointer = (clientX: number) => {
    const element = dockRef.current;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    if (!rect.width) return;
    const x = clamp(clientX - rect.left, 20, rect.width - 20);
    const tabWidth = rect.width / TABS.length;
    const nearest = clamp(Math.floor(x / tabWidth), 0, TABS.length - 1);
    const offsetToCenter = Math.abs(x - tabCenter(nearest));
    // 参考实现：宽度 54 → 上限 74，随离中心距离线性增长
    const width = Math.min(74, 54 + offsetToCenter * 0.25);
    element.style.setProperty('--pill-width', `${width.toFixed(1)}px`);
    element.style.setProperty('--pill-x', `${(x - width / 2).toFixed(1)}px`);
    element.style.setProperty('--dock-x', `${((x / rect.width) * 100).toFixed(1)}%`);
    setHoverIndex(nearest);
  };

  /** 磁吸切换（只在松手时调用） */
  const snapTo = (clientX: number) => {
    const element = dockRef.current;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    const tabWidth = rect.width / TABS.length;
    const index = clamp(Math.floor((clientX - rect.left) / tabWidth), 0, TABS.length - 1);
    element.style.removeProperty('--pill-width');
    element.style.removeProperty('--pill-x');
    setHoverIndex(null);
    const tab = TABS[index];
    if (tab && index !== activeIndex) {
      if (typeof navSelectTab === 'function') navSelectTab(tab.id);
      else onSelect(tab.id);
    }
  };

  const onDown = (event: React.PointerEvent<HTMLElement>) => {
    if (!dockRef.current) return;
    draggingRef.current = true;
    setDragging(true);
    followPointer(event.clientX);

    const onWindowMove = (moveEvent: PointerEvent) => {
      if (!draggingRef.current) return;
      followPointer(moveEvent.clientX);
    };
    const onWindowUp = (upEvent: PointerEvent) => {
      if (draggingRef.current) {
        draggingRef.current = false;
        setDragging(false);
        snapTo(upEvent.clientX); // 松手才切换，且磁吸到最近标签
      }
      window.removeEventListener('pointermove', onWindowMove);
      window.removeEventListener('pointerup', onWindowUp);
      window.removeEventListener('pointercancel', onWindowUp);
    };
    window.addEventListener('pointermove', onWindowMove);
    window.addEventListener('pointerup', onWindowUp);
    window.addEventListener('pointercancel', onWindowUp);
  };

  return (
    <nav
      className={`m3e-dock${dragging ? ' dragging' : ''}`}
      aria-label="主导航"
      ref={dockRef}
      style={{ '--m3e-active': String(activeIndex) } as React.CSSProperties}
      onPointerDown={onDown}
      onPointerMove={(event) => {
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
