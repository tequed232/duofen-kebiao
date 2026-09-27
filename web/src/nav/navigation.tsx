/**
 * Screen stack navigation with Material 3 Expressive transitions.
 *
 * The stack is mirrored into `history.state` so the browser back gesture / back
 * button pops the same way the in-app back buttons do (reverse animation), and
 * forward navigation restores the same entries.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from 'react';
import { uid } from '../lib/utils';

export type TransitionKind = 'slide' | 'fade' | 'zoom';
export type RouteName =
  | 'schedule'
  | 'scheduleFilter'
  | 'settings'
  | 'settingsSection'
  | 'about'
  | 'apiEdit'
  | 'textbookList'
  | 'licenses'
  | 'phraseManager'
  | 'blank';

export interface RouteEntry {
  key: string;
  route: RouteName;
  params: Record<string, string>;
  transition: TransitionKind;
  /** 纯平移方向：前进=新页从右进、旧页往左出；返回=反向 */
  direction: 'forward' | 'back';
}

/** 屏幕切换统一为「中间弹出」（base.css 的 m3-pop-in / m3-pop-out），清理定时器用同一时长 */
const POP_DURATION = 320;

const DURATION: Record<TransitionKind, number> = {
  slide: POP_DURATION,
  fade: POP_DURATION,
  zoom: POP_DURATION,
};

interface NavValue {
  stack: RouteEntry[];
  current: RouteEntry;
  push: (route: RouteName, params?: Record<string, string>, transition?: TransitionKind, direction?: 'forward' | 'back') => void;
  pop: () => void;
  popTo: (route: RouteName) => void;
  /** 标签切换的唯一实现（底边栏用）：规范化重置栈，幂等，不堆历史 */
  selectTab: (tab: 'schedule' | 'search' | 'settings') => void;
  replace: (route: RouteName, params?: Record<string, string>) => void;
}

const NavContext = createContext<NavValue | null>(null);

export function useNav(): NavValue {
  const value = useContext(NavContext);
  if (!value) throw new Error('useNav must be used inside <NavProvider>');
  return value;
}

/** Params of the screen currently on top. */
export function useRouteParams(): Record<string, string> {
  return useNav().current.params;
}

export function NavProvider({ initial = 'schedule', children }: { initial?: RouteName; children: ReactNode }) {
  const initialEntry = useMemo<RouteEntry>(
    () => ({ key: uid('scr'), route: initial, params: {}, transition: 'fade', direction: 'forward' }),
    [initial],
  );
  const [stack, setStack] = useState<RouteEntry[]>([initialEntry]);
  const [enteringKey, setEnteringKey] = useState<string | null>(null);
  const [exiting, setExiting] = useState<RouteEntry | null>(null);
  /** 可预测式返回提交后、正在"下沉退场"的那一屏（不跑标准弹出动画，见 popstate 里的分支） */
  const [commitOut, setCommitOut] = useState<RouteEntry | null>(null);
  const stackRef = useRef(stack);
  stackRef.current = stack;
  const timers = useRef<number[]>([]);

  const schedule = useCallback((fn: () => void, ms: number) => {
    const timer = window.setTimeout(fn, ms);
    timers.current.push(timer);
  }, []);

  useEffect(() => () => timers.current.forEach((timer) => window.clearTimeout(timer)), []);

  /**
   * 可预测式返回（Android 14+ / 手势返回）：
   * 原生把 开始 / 进度 / 取消 三相转成 JS 调用，网页据此把**上一屏**按手势进度
   * 从画面中间放大弹出（与统一转场同一套缩放），松手前的预览完全跟手；
   * 手势取消退回原状，真正触发时交给 `history.back()` → popstate 走正常弹出。
   * 浏览器里这套 API 不存在，整段逻辑不参与。
   */
  const [peeking, setPeeking] = useState<RouteEntry | null>(null);
  /** 手势是否正处于预测式返回预览中（start 置 true；提交 / 取消后置 false） */
  const predictiveRef = useRef(false);

  useEffect(() => {
    const phone = () => document.querySelector('.phone') as HTMLElement | null;
    const clear = () => {
      const el = phone();
      el?.classList.remove('predictive', 'predictive-commit', 'predictive-cancel');
      el?.style.setProperty('--predictive', '0');
      predictiveRef.current = false;
      setPeeking(null);
    };
    const api = {
      start: () => {
        const current = stackRef.current;
        if (current.length < 2) return;
        predictiveRef.current = true;
        phone()?.classList.add('predictive');
        phone()?.style.setProperty('--predictive', '0');
        setPeeking(current[current.length - 2]);
      },
      progress: (value: number) => {
        const clamped = Math.min(1, Math.max(0, Number(value) || 0));
        /**
         * ⚠️ 必须**同步**写，不能 rAF 合并。
         * 试过 rAF 合并（"每帧最多写一次"）：系统做返回手势时，被拖动的那一帧里
         * WebView 的 rAF 会被节流/暂停，`--predictive` 于是写不进去 —— 实测表现就是
         * 「跟手预览没了 / 卡住不动」。而当初卡顿的元凶并不是这次赋值（0.03ms/次），
         * 是它引发的模糊/折射重采样 —— 那部分已经在 CSS 里于手势期间关掉了。
         */
        phone()?.style.setProperty('--predictive', clamped.toFixed(3));
      },
      cancel: () => {
        const el = phone();
        el?.classList.add('predictive-cancel');
        el?.style.setProperty('--predictive', '0');
        window.setTimeout(clear, 200);
      },
      commit: () => {
        /* 真正的前进由原生调用 webView.goBack() → popstate 完成，这里只留预览 */
      },
    };
    (window as unknown as { DuofenBack?: unknown }).DuofenBack = api;
    return () => {
      delete (window as unknown as { DuofenBack?: unknown }).DuofenBack;
      clear();
    };
  }, []);

  useEffect(() => {
    // 自己管理滚动位置：返回时不要浏览器强行恢复，避免动画中跳位（可预测式返回更顺滑）
    if ('scrollRestoration' in window.history) window.history.scrollRestoration = 'manual';
    // The current entry always describes *this* session's stack: after a reload the
    // state left behind by the previous document must not be trusted, otherwise
    // popTo()/back would restore a stale stack.
    window.history.replaceState({ m3Stack: [initialEntry] }, '');
  }, [initialEntry]);

  useEffect(() => {
    const onPopState = (event: PopStateEvent) => {
      const next = ((event.state as { m3Stack?: RouteEntry[] } | null)?.m3Stack ?? [initialEntry]).slice();
      const previous = stackRef.current;
      if (!next.length) return;

      if (next.length < previous.length) {
        const removed = previous[previous.length - 1];
        const phone = document.querySelector('.phone') as HTMLElement | null;
        /**
         * 可预测式返回**提交**（作者 2026-09-29 对照 Telegram 定的口径）：
         * 手势期间「正在被退出的那一屏」跟着手指缩下去，底下那一屏原地露出来；
         * 松手让那张卡**继续缩着沉走**（`.predictive-out`，320ms）再落定 —— 有一种
         * "层叠退场"的观感，而不是硬切；同时**不叠**标准弹出动画（叠了就是"弹两次 + 冲击"）。
         * 这里只用**一个实例**（不复制第二份渲染），所以不会有文字重影。
         */
        if (predictiveRef.current && phone?.classList.contains('predictive')) {
          predictiveRef.current = false;
          setEnteringKey(null);
          setCommitOut(removed); // 继续沉走退场（类名 predictive-out，不是 exit-*）
          setStack(next); // 预览层里那一屏成为新的一屏
          setPeeking(null);
          phone.classList.remove('predictive', 'predictive-cancel');
          phone.style.setProperty('--predictive', '0');
          // 延时要 ≥ .predictive-out 的过渡时长（320/260ms），否则动画会被中途卸载
          schedule(() => setCommitOut(null), 380);
          return;
        }
        setEnteringKey(null);
        setExiting(removed);
        setStack(next);
        // 预测式返回的预览到此结束：清掉手势态，交给正常弹出动画收尾
        phone?.classList.remove('predictive', 'predictive-cancel');
        phone?.style.setProperty('--predictive', '0');
        predictiveRef.current = false;
        setPeeking(null);
        schedule(() => setExiting(null), DURATION[removed.transition] + 100);
        return;
      }

      const added = next[next.length - 1];
      setExiting(null);
      setEnteringKey(added.key);
      setStack(next);
      schedule(() => setEnteringKey(null), DURATION[added.transition] + 100);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [initialEntry, schedule]);

  const push = useCallback<NavValue['push']>(
    (route, params = {}, transition = 'slide', direction: 'forward' | 'back' = 'forward') => {
      /* 同路由去重：重复点底边栏标签不再重复入栈。
         **但参数不同的同名路由要放行** —— 设置页的「分类屏 → 选项屏」都叫
         `settingsSection`，只比 route 的话第二层永远推不动（实测：点「上端安全区」没反应）。 */
      const top = stackRef.current[stackRef.current.length - 1];
      if (top && top.route === route && JSON.stringify(top.params ?? {}) === JSON.stringify(params ?? {})) return;
      const entry: RouteEntry = { key: uid('scr'), route, params, transition, direction };
      const next = [...stackRef.current, entry];
      window.history.pushState({ m3Stack: next }, '');
      setExiting(null);
      setEnteringKey(entry.key);
      setStack(next);
      schedule(() => setEnteringKey(null), DURATION[transition] + 100);
    },
    [schedule],
  );

  const pop = useCallback(() => {
    if (stackRef.current.length > 1) window.history.back();
  }, []);

  /**
   * 回到栈里已有的某个屏幕 —— **内存截断 + replaceState**，不再用 history.go(delta)。
   *
   * 为什么不用 history.go()：标签切换改用 replaceState 重写栈快照后，历史条目数与
   * 栈深度不再一一对应，按栈算出来的 delta 会算错（实测：点首页会直接退出应用）。
   * 渲染的唯一事实来源是内存里的 stack，所以直接截断它；历史条目留给浏览器返回键当足迹。
   */
  const popTo = useCallback<NavValue['popTo']>(
    (route) => {
      const current = stackRef.current;
      let index = -1;
      for (let i = current.length - 2; i >= 0; i -= 1) {
        if (current[i].route === route) {
          index = i;
          break;
        }
      }
      if (index < 0) {
        if (current[current.length - 1].route !== route) push(route, {}, 'fade');
        return;
      }
      const removed = current[current.length - 1];
      const next = current.slice(0, index + 1);
      window.history.replaceState({ m3Stack: next }, '');
      setEnteringKey(null);
      setExiting(removed);
      setStack(next);
      schedule(() => setExiting(null), DURATION[removed.transition] + 100);
    },
    [push, schedule],
  );

  /**
   * 标签切换（底边栏唯一入口）——**一步到位**，不再先回首页再进目标页。
   *
   * 规则：
   *  1. 标签栈只有一种规范形态：首页 = [课表]，搜索 = [课表, 筛选]，设置 = [课表, 设置]。
   *     无论当前在哪个屏幕（详情页、教材页、关于页…）点标签，都重写成规范形态。
   *  2. 幂等：已经在规范形态的目标标签上再点一次，什么都不做。
   *  3. **不许分两步**：旧实现先 `popTo('schedule')`、再延迟 300ms `push(目标)`，
   *     从二级页切标签会先闪回首页（用户反馈的「底栏总是回弹到主页」），
   *     而且快速连点会把栈撑成三层。
   *     现在直接切到目标的规范栈，并 `pushState` 留一条足迹 —— 返回键仍然能回到上一个标签，
   *     但界面**不会**经过首页。
   *  4. 渲染的唯一事实来源是内存里的 stack；历史条目只是给返回键用的足迹。
   */
  const selectTab = useCallback(
    (tab: 'schedule' | 'search' | 'settings') => {
      const current = stackRef.current;
      const target = tab === 'schedule' ? null : tab === 'search' ? 'scheduleFilter' : 'settings';
      const routes = current.map((entry) => entry.route);
      const canonicalRoutes = target === null ? ['schedule'] : ['schedule', target];

      // 幂等：已经是规范形态就什么都不做
      if (routes.length === canonicalRoutes.length && routes.every((route, index) => route === canonicalRoutes[index])) {
        return;
      }

      const order = ['schedule', 'scheduleFilter', 'settings'];
      const from = order.indexOf(routes[routes.length - 1] ?? 'schedule');
      const to = order.indexOf(target ?? 'schedule');
      const direction: 'forward' | 'back' = to >= from ? 'forward' : 'back';
      const base = current[0];
      const next: RouteEntry[] =
        target === null
          ? [base]
          : [base, { key: uid('scr'), route: target, params: {}, transition: 'slide', direction }];

      // 多出来的屏幕（详情页 / 教材页…）按过渡动画退场
      const removed = current.length > next.length ? current[current.length - 1] : null;
      window.history.pushState({ m3Stack: next }, '');
      setEnteringKey(next[next.length - 1].key);
      setExiting(removed);
      setStack(next);
      schedule(() => {
        setEnteringKey(null);
        setExiting(null);
      }, DURATION[next[next.length - 1].transition] + 100);
    },
    [schedule],
  );



  const replace = useCallback<NavValue['replace']>((route, params = {}) => {
    const current = stackRef.current;
    const entry: RouteEntry = { key: uid('scr'), route, params, transition: 'fade', direction: 'forward' };
    const next = [...current.slice(0, -1), entry];
    window.history.replaceState({ m3Stack: next }, '');
    setStack(next);
  }, []);

  const value = useMemo<NavValue>(
    () => ({ stack, current: stack[stack.length - 1], push, pop, popTo, replace, selectTab }),
    [stack, push, pop, popTo, replace, selectTab],
  );

  return (
    <NavContext.Provider value={value}>
      <NavRenderContext.Provider value={{ enteringKey, exiting, peeking, commitOut }}>{children}</NavRenderContext.Provider>
    </NavContext.Provider>
  );
}

const NavRenderContext = createContext<{
  enteringKey: string | null;
  exiting: RouteEntry | null;
  peeking: RouteEntry | null;
  commitOut: RouteEntry | null;
}>({
  enteringKey: null,
  exiting: null,
  peeking: null,
  commitOut: null,
});

/**
 * Renders every screen of the stack as a layer inside the phone frame.
 *
 * `background` 是可选的**每屏底纹**（等高线那类装饰）：作为每一屏的第一个孩子渲染，
 * 于是它在本屏自己的底色之上、内容之下。
 * 为什么不放在 `.phone` 里当全局层：那样必须把 `.screen` 的底色设成透明，
 * 而导航栈会把上一屏**留在 DOM 里**（保状态），透明之后上一屏的内容就透出来了 ——
 * 实测「从主页切到搜索/设置会残留主页内容」就是这个原因。
 */
export function NavHost({
  screens,
  background,
}: {
  screens: Record<RouteName, ComponentType>;
  background?: ReactNode;
}) {
  const { stack } = useNav();
  const { enteringKey, exiting, peeking, commitOut } = useContext(NavRenderContext);
  // The exiting entry keeps its React key so the component instance (scroll
  // position, ...) is preserved while it animates away.
  const layers = commitOut ? [...stack, commitOut] : exiting ? [...stack, exiting] : stack;

  return (
    <>
      {/*
        可预测式返回的预览：**不渲染副本**。
        之前额外渲染一份「上一屏」，提交那一帧真身与副本会同时在场 —— 实测就是作者看到的
        "退出时新界面的残影"。现在改成：把栈里那一层（真正的上一屏）标成 `peek` 露出来，
        同时把手势期间**其余层全部隐藏**（见 base.css 的 .phone.predictive 规则），
        既保证露出来的就是上一屏，也没有任何重影。
      */}
      {layers.map((entry) => {
        const Screen = screens[entry.route];
        const isTop = entry.key === stack[stack.length - 1].key;
        const isExiting = exiting?.key === entry.key;
        const isPredictiveOut = commitOut?.key === entry.key;
        const isPeek = peeking?.key === entry.key;
        const classes = ['screen', `dir-${entry.direction ?? 'forward'}`];
        if (isExiting) classes.push(`exit-${entry.transition}`);
        else if (isPredictiveOut) classes.push('predictive-out');
        else if (entry.key === enteringKey) classes.push(`enter-${entry.transition}`);
        if (isPeek) classes.push('peek');
        if (peeking && isTop) classes.push('predictive-top');
        return (
          <div
            key={entry.key}
            className={classes.join(' ')}
            aria-hidden={!isTop}
            style={{ pointerEvents: isTop && !isExiting ? 'auto' : 'none' }}
          >
            {background}
            <Screen />
          </div>
        );
      })}
    </>
  );
}
