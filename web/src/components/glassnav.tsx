/**
 * Liquid Glass 底边栏（实时折射 + 水滴融合）
 *
 * 与 rdev/liquid-glass-react、shuding/liquid-glass 同源的 Web 实现思路：
 *   1. 玻璃层 = backdrop-filter 模糊 + SVG 位移滤镜（feTurbulence → feDisplacementMap），
 *      让背景真正被折射，而不是单纯模糊；
 *   2. 指针 / 手指滑过时用 requestAnimationFrame 实时改写 feDisplacementMap 的 scale
 *      与高光位置（--glass-x / --glass-y）→ 滑动时折射与反射跟着动，并带阻尼跟随；
 *   3. 点按标签生成水滴，经 feGaussianBlur + feColorMatrix 的 goo 滤镜先融合成一体，
 *      再按弹性曲线散开 → 水滴融合与散开；
 *   4. 能力检测：不支持 backdrop-filter / 内存或核心过少 → 建议回退 Material 3 原生导航栏
 *      （二者互斥，设置里也可手动切换）。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { MdIcon } from './md';
import type { NavTabId } from './layout';

export interface GlassTab {
  id: NavTabId;
  label: string;
  icon: string;
}

/** 当前设备能否承载实时玻璃效果 */
export function glassCapability(): { ok: boolean; reason: string } {
  if (typeof CSS === 'undefined' || typeof CSS.supports !== 'function') {
    return { ok: false, reason: '浏览器未提供 CSS.supports' };
  }
  const hasBackdrop =
    CSS.supports('backdrop-filter', 'blur(8px)') || CSS.supports('-webkit-backdrop-filter', 'blur(8px)');
  if (!hasBackdrop) return { ok: false, reason: '不支持 backdrop-filter' };

  const nav = navigator as Navigator & { deviceMemory?: number; hardwareConcurrency?: number };
  if (typeof nav.deviceMemory === 'number' && nav.deviceMemory > 0 && nav.deviceMemory < 2) {
    return { ok: false, reason: `内存偏低（deviceMemory=${nav.deviceMemory}GB）` };
  }
  if (typeof nav.hardwareConcurrency === 'number' && nav.hardwareConcurrency > 0 && nav.hardwareConcurrency <= 2) {
    return { ok: false, reason: `CPU 核心偏少（${nav.hardwareConcurrency} 核）` };
  }
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
    return { ok: false, reason: '系统开启了「减少动态效果」' };
  }
  return { ok: true, reason: '设备支持实时折射' };
}

interface Drop {
  id: number;
  x: number;
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
  const innerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | undefined>(undefined);
  const targetRef = useRef({ scale: 16, x: 0.5, y: 0.5 });
  const [drops, setDrops] = useState<Drop[]>([]);
  const dropId = useRef(0);

  /** 平滑地把目标值写进 SVG 滤镜参数与 CSS 变量（阻尼跟随，避免抖动） */
  const tick = useCallback(() => {
    const element = innerRef.current;
    const target = targetRef.current;
    const displacement = document.getElementById('liquid-glass-displacement');
    let settled = true;

    if (element) {
      element.style.setProperty('--glass-x', `${(target.x * 100).toFixed(1)}%`);
      element.style.setProperty('--glass-y', `${(target.y * 100).toFixed(1)}%`);
    }
    if (displacement) {
      const current = Number(displacement.getAttribute('scale') ?? '16');
      const next = current + (target.scale - current) * 0.2;
      displacement.setAttribute('scale', next.toFixed(2));
      settled = Math.abs(next - target.scale) < 0.08;
    }

    rafRef.current = settled ? undefined : window.requestAnimationFrame(tick);
  }, []);

  const schedule = useCallback(() => {
    if (rafRef.current === undefined) rafRef.current = window.requestAnimationFrame(tick);
  }, [tick]);

  /** 指针/手指滑过玻璃：折射强度与高光位置实时变化（滑动时最明显） */
  const trackPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    const element = innerRef.current;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    const y = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
    targetRef.current = {
      x,
      y,
      // 越靠边缘折射越强，模拟玻璃边缘对背景的压缩
      scale: 10 + Math.abs(x - 0.5) * 46 + Math.abs(y - 0.5) * 24,
    };
    schedule();
  };

  const resetPointer = () => {
    targetRef.current = { scale: 16, x: 0.5, y: 0.5 };
    schedule();
  };

  useEffect(
    () => () => {
      if (rafRef.current !== undefined) window.cancelAnimationFrame(rafRef.current);
    },
    [],
  );

  /** 按下：生成水滴（先融合再散开），并让折射短暂增强 */
  const spawnDrops = (tab: GlassTab, event: React.PointerEvent<HTMLButtonElement>) => {
    const element = innerRef.current;
    if (element) {
      const rect = element.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width) * 100;
      const created: Drop[] = Array.from({ length: 5 }, (_, index) => ({
        id: (dropId.current += 1) * 10 + index,
        x,
      }));
      setDrops((value) => [...value, ...created]);
      window.setTimeout(() => {
        const ids = new Set(created.map((drop) => drop.id));
        setDrops((value) => value.filter((drop) => !ids.has(drop.id)));
      }, 640);
      targetRef.current = { x: x / 100, y: 0.5, scale: 30 };
      schedule();
    }
    void tab;
  };

  return (
    <nav className="glass-nav" aria-label="主导航">
      <div
        className="glass-nav-inner"
        ref={innerRef}
        onPointerMove={trackPointer}
        onPointerDown={trackPointer}
        onPointerLeave={resetPointer}
      >
        {/* 实时折射层：backdrop 经 SVG 位移滤镜 → 真实折射背景 */}
        <span className="glass-nav-refraction" aria-hidden="true" />
        {/* 镜面反射：高光位置跟随指针 */}
        <span className="glass-nav-specular" aria-hidden="true" />
        {/* 水滴融合层：goo 滤镜把多颗水滴连成一体后散开 */}
        <span className="glass-drop-layer" aria-hidden="true">
          {drops.map((drop, index) => (
            <span
              key={drop.id}
              className="glass-drop"
              style={{ left: `${drop.x}%`, animationDelay: `${index * 28}ms` }}
            />
          ))}
        </span>

        {tabs.map((tab) => {
          const selected = tab.id === active;
          return (
            <button
              key={tab.id}
              type="button"
              className={['glass-tab', selected ? 'active' : ''].join(' ').trim()}
              data-tab={tab.id}
              aria-current={selected ? 'page' : undefined}
              onPointerDown={(event) => spawnDrops(tab, event)}
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
