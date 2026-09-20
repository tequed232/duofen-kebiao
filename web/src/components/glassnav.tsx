/**
 * Liquid Glass 底边栏。
 *
 * 替代 Material Web 的 md-navigation-bar：一个悬浮的玻璃药丸容器（模糊 + 冰彩高光 +
 * 顶部反光条），内部四个标签用图标 + 文字，选中项有玻璃胶囊指示器。
 * 关闭「液态玻璃」时仍可回退到 Material 3 原生导航栏（设置里互斥切换）。
 */
import { useRef } from 'react';
import { MdIcon } from './md';
import type { NavTabId } from './layout';

export interface GlassTab {
  id: NavTabId;
  label: string;
  icon: string;
}

export function GlassNavBar({
  tabs,
  active,
  onSelect,
}: {
  tabs: GlassTab[];
  active: NavTabId;
  onSelect: (tab: NavTabId) => void;
}) {
  const ref = useRef<HTMLElement>(null);

  return (
    <nav className="glass-nav" ref={ref} aria-label="主导航">
      <div className="glass-nav-inner">
        {/* 折射层：SVG 位移滤镜，做出玻璃的光影折射（无可用的滤镜时自动退化为高光） */}
        <span className="glass-nav-refraction" aria-hidden="true" />
        {tabs.map((tab) => {
          const selected = tab.id === active;
          return (
            <button
              key={tab.id}
              type="button"
              className={['glass-tab', selected ? 'active' : ''].join(' ').trim()}
              data-tab={tab.id}
              aria-current={selected ? 'page' : undefined}
              onClick={() => onSelect(tab.id)}
            >
              <span className="glass-tab-indicator" aria-hidden="true" />
              <MdIcon name={tab.icon} size={22} filled={selected} />
              <span className="glass-tab-label">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
