/** Layout primitives: app bar, navigation bar, section header, empty state, chips, images. */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { MdIcon, MdIconButton } from './md';
import { useNav } from '../nav/navigation';
import { useAppState } from '../state/AppState';
import { isNativeShell, haptic } from '../lib/native';
import { dockLensParams, effectiveDispersion, effectiveWarp } from '../lib/lens';
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
  const { settings } = useAppState();
  const activeIndex = Math.max(0, TABS.findIndex((tab) => tab.id === active));
  const dockRef = useRef<HTMLElement>(null);
  /* 液态玻璃透镜：按 dock 实际尺寸生成位移贴图（BEZEL / STRENGTH / ZOOM 见 lens.ts）。
     两条正交的设置轴：
       · 扭曲档（dockWarp：厚透镜 / 收窄 / 关）决定**几何** —— 掰弯多少、铺多宽；
       · 色散档（dispersion：关 / 简洁 / 极致）决定**颜色分离**在哪一档。
     厚透镜就是 `6aeae6d` 那版口径（bezel 0.85 / strength 1.6 / backdrop 封顶 26px），
     真机上能明显看到被掰弯；收窄是 `7973ced` 六项整改后的口径（只留在边缘一线）。
     真机核对手续：先关掉开发者选项里的「指针位置」「显示布局边界」再截图，
     否则那些调试叠层会被误认成应用的渲染问题。 */
  const dockParams = useMemo(
    () => dockLensParams(effectiveDispersion(settings.dispersion), effectiveWarp(settings.dockWarp)),
    [settings.dispersion, settings.dockWarp],
  );
  useLens(dockRef, dockParams);

  /**
   * 「不许和底栏重叠」的**算法**：底栏把自己占的那条带子发布成 `--dock-band`，
   * 之后任何浮层（抽屉 / 悬浮按钮 / 提示条）只要写 `bottom: var(--dock-band)` 就天然避开它。
   *
   * 为什么由底栏**自己测**而不是写常量：底栏高度受「屏幕安全区」设置、字体缩放、设备手势条影响，
   * 写死的数字总会在某台机器上错位 —— 错位的表现就是真机事故那种「抽屉压住底栏按钮，点不到」。
   * 基准取手机框（.phone）：底栏顶边到框底的距离。
   */
  useEffect(() => {
    const element = dockRef.current;
    if (!element) return undefined;
    const frame = element.closest('.phone') ?? element.parentElement;
    let last = '';
    const publish = () => {
      const frameRect = frame?.getBoundingClientRect();
      const dockRect = element.getBoundingClientRect();
      if (!frameRect || dockRect.height === 0) return;
      const value = `${Math.max(0, Math.round(frameRect.bottom - dockRect.top))}px`;
      /* **值没变就不写**：切屏/动画期间 RO 会反复触发，每次都 setProperty 会让整棵树重算样式 ——
         表现就是"切屏抽搐闪烁"（作者 2026-09-25 反馈）。 */
      if (value === last) return;
      last = value;
      document.documentElement.style.setProperty('--dock-band', value);
    };
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(element);
    if (frame) observer.observe(frame);
    window.addEventListener('resize', publish);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', publish);
      document.documentElement.style.removeProperty('--dock-band');
    };
  }, []);
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
  /**
   * 跟手弹簧的当前值（dock 内坐标，px）。
   *
   * 拖动时色块**不直接钉在手指上**：目标位置是手指，实际位置用阻尼弹簧去追，
   * 于是有一点点滞后与回弹 —— 作者要的「液态跟手感」主要来自这一下
   * （原来只有松手时的那点 Q 弹，拖动过程是硬的）。
   * 半隐式欧拉积分：v += (k*(target-x) - c*v) * dt；k/c 按 60fps 调。
   */
  const springXRef = useRef(0);
  const springVelRef = useRef(0);
  const springRafRef = useRef<number | undefined>(undefined);
  const SPRING_K = 0.34;
  const SPRING_C = 0.72;
  /** 按下时的指针 x，用来判断这次手势是「轻点」还是「拖动」 */
  const downXRef = useRef(0);
  /**
   * 拖动阈值（px）。超过它才算拖动。
   *
   * 为什么必须有这个阈值：原来 `pointerdown` 就直接进拖动态，而拖动态的 CSS 是
   * `transition: none; transform: translate3d(var(--pill-x))` —— 于是**轻点**也会
   * 让色块瞬移到指尖，苹果那种「从旧位置移过去」的过渡被整个跳过，看起来就是"闪现"。
   * 有了阈值，轻点根本不进拖动态，色块继续走 `.m3e-dock-slider` 上那条带 overshoot
   * 的弹簧过渡 —— 这才是 duang 的来源；真拖动才切到手写弹簧逐帧跟手。
   */
  const DRAG_SLOP = 6;

  const stopSpring = () => {
    if (springRafRef.current !== undefined) {
      window.cancelAnimationFrame(springRafRef.current);
      springRafRef.current = undefined;
    }
  };

  /**
   * 让跟手弹簧逐帧逼近 pendingX，直到足够接近（或不再拖动）就收工。
   *
   * **坐标系必须是「页面坐标」**（和 `pendingXRef`、`applyFrame(jx)` 一致）。
   * 这里踩过一次：弹簧算的是**底栏内坐标**（`pendingXRef - geo.left`），
   * 而 `applyFrame(jx)` 内部又减了一次 `geo.left` —— 于是拖动时色块被整体左移了一个
   * 左边距的量（实测 460px 视口下 `geo.left=36`：手指在 dock 内 180px 处，`--pill-x`
   * 应是 115 却只有 79，差值正好 36）。真机左边距约 12dp（≈42 设备像素），
   * 表现就是"拖动时色块一直吊在手指左边、松手才弹回正确位置"。
   */
  const runSpring = () => {
    if (springRafRef.current !== undefined) return;
    const step = () => {
      const geo = geoRef.current;
      if (!geo) {
        springRafRef.current = undefined;
        return;
      }
      const target = clamp(pendingXRef.current, geo.left + 18, geo.left + geo.width - 18);
      const dtClamp = 1;
      const dx = target - springXRef.current;
      springVelRef.current += (SPRING_K * dx - SPRING_C * springVelRef.current) * dtClamp;
      springXRef.current += springVelRef.current * dtClamp;
      applyFrame(springXRef.current);
      const settled = !draggingRef.current && Math.abs(dx) < 0.4 && Math.abs(springVelRef.current) < 0.4;
      if (settled) {
        springXRef.current = target;
        springVelRef.current = 0;
        springRafRef.current = undefined;
        return;
      }
      springRafRef.current = window.requestAnimationFrame(step);
    };
    springRafRef.current = window.requestAnimationFrame(step);
  };

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

  /** 把指针位置换算成「色块中心 x」与「拉伸比例」，一帧只写一次。
   *  @param jx 可选的「跟手位置」：拖动时由弹簧给，未传则用指针原始位置 */
  const applyFrame = (jx?: number) => {
    frameRef.current = undefined;
    const element = dockRef.current;
    const geo = geoRef.current;
    if (!element || !geo) return;
    const x = clamp((jx ?? pendingXRef.current) - geo.left, 18, geo.width - 18);
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
    /* 位移**取整到整像素**：小数位置会让背景采样落在半像素上，逐帧抖动就是"滑动时闪烁"
       的来源之一。整像素对肉眼无损（1px 的步进在 60fps 下看不出来），却能消掉重采样抖动。 */
    element.style.setProperty('--pill-x', `${Math.round(left)}px`);
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
    // 拖动期间交给跟手弹簧逐帧推进（它内部会调 applyFrame），避免两条动画路径互相打架
    if (draggingRef.current) {
      runSpring();
      return;
    }
    if (frameRef.current === undefined) frameRef.current = window.requestAnimationFrame(() => applyFrame());
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

    pendingXRef.current = event.clientX;
    downXRef.current = event.clientX;
    /* 弹簧种子取**色块当前所在格的中心**，不是手指位置。
       取手指位置的话，按下那一帧色块就被拽到指尖了（瞬移）；从原处起跑去追手指，
       才有一点点滞后与回弹 —— 作者要的「液态跟手」正是这一段。 */
    {
      const geo0 = geoRef.current;
      /* 种子 = 色块**当前所在格的中心**（页面坐标，与 pendingXRef / applyFrame 同一套），
         不是手指位置：取手指位置的话，按下那一帧色块就被拽到指尖了（瞬移）。 */
      springXRef.current = geo0
        ? (geo0.centers[activeIndex] ?? geo0.width / 2) + geo0.left
        : 0;
      springVelRef.current = 0;
    }
    /* 先不进拖动态：位移超过 DRAG_SLOP 才进。轻点若在这里就进，色块会因
       `.dragging` 的 `transition: none` 瞬移到指尖 —— 那就是"闪现"的来源。 */
    draggingRef.current = false;
    velRef.current = 0;
    accelRef.current = 0;
    accelHoldRef.current = 0;
    inWallRef.current = false;
    movedRef.current = false;
    lastMoveRef.current = { x: event.clientX, t: performance.now() };

    const onWindowMove = (moveEvent: PointerEvent) => {
      if (!draggingRef.current) {
        /* 还没进拖动态：位移超过阈值才算拖动，没超过就什么都不做 ——
           轻点会走 onWindowUp 里「直接切标签」那条分支，色块继续用 CSS 弹簧过渡移过去。 */
        if (Math.abs(moveEvent.clientX - downXRef.current) < DRAG_SLOP) return;
        draggingRef.current = true;
        setDragging(true);
        /* 从**按下那一刻**重新起算速度：否则第一帧会把「按下到跨过阈值」这段位移
           当成一次极快的甩动，形变直接吃满，看着像抽了一下。 */
        lastMoveRef.current = { x: downXRef.current, t: performance.now() };
        velRef.current = 0;
        accelRef.current = 0;
        accelHoldRef.current = 0;
        startShapeLoop();
        runSpring();
      }
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
      /* 轻点（位移从未超过 DRAG_SLOP）：全程没进拖动态，色块也没被 --pill-x 接管，
         所以这里**只需切标签** —— activeIndex 一变，`.m3e-dock-slider` 上那条
         cubic-bezier(0.34, 1.56, 0.64, 1) 弹簧过渡就会把色块从旧位置弹到新位置，
         过冲量随跨距等比放大，这就是「移过去 duang」那一下。 */
      if (!draggingRef.current) {
        const geo = geoRef.current;
        if (geo) {
          const x = clamp(upEvent.clientX - geo.left, 0, geo.width - 1);
          const index = clamp(Math.floor(x / geo.cell), 0, TABS.length - 1);
          const tab = TABS[index];
          if (tab && index !== activeIndex) {
            haptic('select');
            if (typeof navSelectTab === 'function') navSelectTab(tab.id);
            else onSelect(tab.id);
          } else if (tab) {
            haptic('tick'); // 点当前标签：给一次轻刻度，避免"点了没反应"
          }
        }
        setHoverIndex(null);
        geoRef.current = null;
        window.removeEventListener('pointermove', onWindowMove);
        window.removeEventListener('pointerup', onWindowUp);
        window.removeEventListener('pointercancel', onWindowUp);
        return;
      }
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
          /* 松手：**先让弹簧跑到选中格的落点**（tag 成 settle 阶段，形变同时衰减），
             跑到位后再切回「按序号定位」。这样拖动结束不是硬切，而是弹一下再归位。 */
          const snapCenter = geo.centers[index] ?? x;
          pendingXRef.current = snapCenter + geo.left;
          springVelRef.current = (springVelRef.current || 0) * 0.5;
          const finishSettle = () => {
            element.style.removeProperty('--pill-x');
            element.style.removeProperty('--pill-stretch');
            element.style.removeProperty('--pill-squash');
            element.style.removeProperty('--pill-bulge');
            element.style.removeProperty('--pill-deform-x');
            element.style.removeProperty('--pill-deform-y');
            element.style.removeProperty('--pill-skew');
            stopSpring();
            if (shapeFrameRef.current !== undefined) {
              window.cancelAnimationFrame(shapeFrameRef.current);
              shapeFrameRef.current = undefined;
            }
          };
          // 给 settle 限个时长上限（弹簧参数正常时 300ms 内就到），避免极端情况一直跑
          const settleGuard = window.setTimeout(finishSettle, 420);
          const waitSettle = () => {
            if (springRafRef.current === undefined) {
              window.clearTimeout(settleGuard);
              finishSettle();
              return;
            }
            window.requestAnimationFrame(waitSettle);
          };
          waitSettle();
          velRef.current = 0;
          accelRef.current = 0;
          accelHoldRef.current = 0;
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
