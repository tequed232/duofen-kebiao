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

  useEffect(() => {
    const phone = () => document.querySelector('.phone') as HTMLElement | null;
    const clear = () => {
      const el = phone();
      el?.classList.remove('predictive', 'predictive-cancel');
      el?.style.setProperty('--predictive', '0');
      setPeeking(null);
    };
    const api = {
      start: () => {
        const current = stackRef.current;
        if (current.length < 2) return;
        phone()?.classList.add('predictive');
        phone()?.style.setProperty('--predictive', '0');
        setPeeking(current[current.length - 2]);
      },
      progress: (value: number) => {
        const clamped = Math.min(1, Math.max(0, Number(value) || 0));
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
        setEnteringKey(null);
        setExiting(removed);
        setStack(next);
        // 预测式返回的预览到此结束：清掉手势态，交给正常弹出动画收尾
        const phone = document.querySelector('.phone') as HTMLElement | null;
        phone?.classList.remove('predictive', 'predictive-cancel');
        phone?.style.setProperty('--predictive', '0');
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
      // 同路由去重：重复点击底边栏标签不再重复入栈（此前"点两下跳到不知道哪里"）
      const top = stackRef.current[stackRef.current.length - 1];
      if (top && top.route === route) return;
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
      <NavRenderContext.Provider value={{ enteringKey, exiting, peeking }}>{children}</NavRenderContext.Provider>
    </NavContext.Provider>
  );
}

const NavRenderContext = createContext<{
  enteringKey: string | null;
  exiting: RouteEntry | null;
  peeking: RouteEntry | null;
}>({
  enteringKey: null,
  exiting: null,
  peeking: null,
});

/** Renders every screen of the stack as a layer inside the phone frame. */
export function NavHost({ screens }: { screens: Record<RouteName, ComponentType> }) {
  const { stack } = useNav();
  const { enteringKey, exiting, peeking } = useContext(NavRenderContext);
  // The exiting entry keeps its React key so the component instance (scroll
  // position, ...) is preserved while it animates away.
  const layers = exiting ? [...stack, exiting] : stack;

  return (
    <>
      {/* 可预测式返回的预览层：上一屏垫在当前屏下面，按手势进度从中间放大 */}
      {peeking ? (
        <div key={`peek-${peeking.key}`} className="screen peek" aria-hidden="true" style={{ pointerEvents: 'none' }}>
          {(() => {
            const Peek = screens[peeking.route];
            return <Peek />;
          })()}
        </div>
      ) : null}
      {layers.map((entry) => {
        const Screen = screens[entry.route];
        const isTop = entry.key === stack[stack.length - 1].key;
        const isExiting = exiting?.key === entry.key;
        const classes = ['screen', `dir-${entry.direction ?? 'forward'}`];
        if (isExiting) classes.push(`exit-${entry.transition}`);
        else if (entry.key === enteringKey) classes.push(`enter-${entry.transition}`);
        return (
          <div
            key={entry.key}
            className={classes.join(' ')}
            aria-hidden={!isTop}
            style={{ pointerEvents: isTop && !isExiting ? 'auto' : 'none' }}
          >
            <Screen />
          </div>
        );
      })}
    </>
  );
}
