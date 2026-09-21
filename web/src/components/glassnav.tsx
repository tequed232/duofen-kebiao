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
import { isNativeShell, nativeGlassMode, nativeGlassPointer, nativeGlassScroll } from '../lib/native';
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
  const targetRef = useRef({ scale: 16, x: 0.5, y: 0.5, stretch: 1, lift: 0, scroll: 0 });
  const dragStart = useRef<number | null>(null);
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
      // 实时操控相关：拉伸量 + 竖向位移 + 滚动冲量
      element.style.setProperty('--glass-stretch', target.stretch.toFixed(3));
      element.style.setProperty('--glass-lift', `${target.lift.toFixed(2)}px`);
      element.style.setProperty('--glass-scroll', target.scroll.toFixed(3));
    }
    if (displacement) {
      const current = Number(displacement.getAttribute('scale') ?? '16');
      const next = current + (target.scale - current) * 0.2;
      displacement.setAttribute('scale', next.toFixed(2));
      settled = Math.abs(next - target.scale) < 0.08;
    }

    rafRef.current = settled ? undefined : window.requestAnimationFrame(tick);
  }, []);

  // APK：交给原生层做真·背景折射（网页玻璃层转透明，避免双层）
  useEffect(() => {
    if (!isNativeShell()) return;
    // 原生层仍在打磨（取景内容与混色还需调整）：暂用网页玻璃，保证观感
    // 下一轮修好后再打开 nativeGlassMode(true)。
    innerRef.current?.classList.remove('native-glass');
    void nativeGlassMode;
    return () => nativeGlassMode(false);
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
    // 按下的瞬间：整条玻璃被"压"出弹性形变（横向拉伸 + 轻微下沉），
    // 手指移动时形变随距离增长，松手后由 tick() 的阻尼回到 1
    const pressed = event.buttons > 0 || event.pointerType === 'touch';
    const dragX = dragStart.current === null ? 0 : Math.abs(event.clientX - dragStart.current);
    const stretch = pressed ? Math.min(1.08, 1 + dragX / 900) : 1;
    const lift = pressed ? -1.5 : 0;
    if (isNativeShell()) nativeGlassPointer(x, y, pressed);
    targetRef.current = {
      x,
      y,
      stretch,
      lift,
      scroll: targetRef.current.scroll,
      // 越靠边缘折射越强，模拟玻璃边缘对背景的压缩
      scale: 10 + Math.abs(x - 0.5) * 46 + Math.abs(y - 0.5) * 24,
    };
    schedule();
  };

  const resetPointer = () => {
    dragStart.current = null;
    targetRef.current = { ...targetRef.current, scale: 16, x: 0.5, y: 0.5, stretch: 1, lift: 0 };
    schedule();
  };


  /** 页面滚动 → 玻璃的折射强度与高光位置随之变化（实时操控感的关键） */
  useEffect(() => {
    let last = 0;
    let decay = 0;
    const onScroll = () => {
      const now = performance.now();
      const velocity = Math.min(1, Math.abs(window.scrollY - last) / 120);
      last = window.scrollY;
      decay = Math.max(decay, velocity);
      nativeGlassScroll(decay);
      targetRef.current = {
        ...targetRef.current,
        scroll: decay,
        scale: 12 + decay * 40,
        y: 0.5 + Math.min(0.35, (window.scrollY % 200) / 400),
      };
      schedule();
    };
    const idle = window.setInterval(() => {
      if (decay > 0.01) {
        decay *= 0.72;
        targetRef.current = { ...targetRef.current, scroll: decay, scale: 12 + decay * 40 };
        schedule();
      }
    }, 60);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.clearInterval(idle);
    };
  }, [schedule]);
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
      targetRef.current = { ...targetRef.current, x: x / 100, y: 0.5, scale: 30, stretch: 1.06, lift: -1.5 };
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
        onPointerDown={(event) => {
        dragStart.current = event.clientX;
        trackPointer(event);
      }}
        onPointerLeave={resetPointer}
      >
        {/* 实时折射层：backdrop 经 SVG 位移滤镜 → 真实折射背景 */}
        <span className="glass-nav-refraction" aria-hidden="true" />
        {/* 镜面反射：高光位置跟随指针 */}
        <span className="glass-nav-specular" aria-hidden="true" />
        {/* 选中指示器：一个会"滑"过去的圆，而不是在新标签上凭空出现 */}
        <span
          className="glass-nav-slider"
          aria-hidden="true"
          style={{
            width: `calc((100% - 8px) / ${tabs.length})`,
            transform: `translateX(calc(${Math.max(0, tabs.findIndex((tab) => tab.id === active))} * 100%))`,
          }}
        />
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
              <MdIcon name={tab.icon} size={22} filled={selected} />
              <span className="glass-tab-label">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
