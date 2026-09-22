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
import { MOTION } from '../theme/motion';
import { uid } from '../lib/utils';

export type TransitionKind = 'slide' | 'fade' | 'zoom';
export type RouteName =
  | 'home'
  | 'history'
  | 'settings'
  | 'record'
  | 'apiEdit'
  | 'blank'
  | 'schedule'
  | 'scheduleFilter'
  | 'about'
  | 'textbookList'
  | 'licenses';

export interface RouteEntry {
  key: string;
  route: RouteName;
  params: Record<string, string>;
  transition: TransitionKind;
  /** 纯平移方向：前进=新页从右进、旧页往左出；返回=反向 */
  direction: 'forward' | 'back';
}

const DURATION: Record<TransitionKind, number> = {
  slide: MOTION.spatial.default.duration * 1000,
  fade: MOTION.effects.default.duration * 1000,
  zoom: MOTION.zoom.duration * 1000,
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

export function NavProvider({ initial = 'home', children }: { initial?: RouteName; children: ReactNode }) {
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
      if (index >= 0) {
        window.history.go(index - (current.length - 1));
        return;
      }
      if (current[current.length - 1].route !== route) push(route, {}, 'fade');
    },
    [push],
  );

  /**
   * 标签切换（底边栏唯一入口）——**规范化重写**，解决"点设置乱跳转"。
   *
   * 规则：
   *  1. 标签栈只有一种规范形态：首页 = [课表]，搜索 = [课表, 筛选]，设置 = [课表, 设置]。
   *     无论当前在哪个屏幕（详情页、教材页、关于页…）点标签，都重置成规范形态，
   *     而不是把新页面压在当前详情页之上（那正是"乱跳转"的来源）。
   *  2. 幂等：已经在规范形态的目标标签上再点一次，什么都不做。
   *  3. 一律使用路由自己的原语（popTo / push），**不用 replaceState 手改历史** ——
   *     否则 popTo 依赖的 history.go() 会算错栈，出现"点首页白屏"。
   */
  const selectTab = useCallback(
    (tab: 'schedule' | 'search' | 'settings') => {
      const current = stackRef.current[stackRef.current.length - 1];
      const target = tab === 'schedule' ? null : tab === 'search' ? 'scheduleFilter' : 'settings';

      // 首页：回到栈底
      if (target === null) {
        if (stackRef.current.length === 1) return; // 幂等
        popTo('schedule');
        return;
      }

      // 已在规范形态 → 幂等返回
      if (current.route === target && stackRef.current.length === 2) return;

      // 先回到栈底，等 history.go 生效后再 push 目标页（延迟与路由自身的动画时长对齐）
      const order = ['schedule', 'scheduleFilter', 'settings'];
      const from = order.indexOf(stackRef.current[stackRef.current.length - 1]?.route ?? 'schedule');
      const to = order.indexOf(target);
      const forward = to >= from;
      popTo('schedule');
      schedule(() => {
        const top = stackRef.current[stackRef.current.length - 1];
        if (top?.route === target) return;
        push(target, {}, 'slide', forward ? 'forward' : 'back');
      }, 300);
    },
    [popTo, push, schedule],
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
      <NavRenderContext.Provider value={{ enteringKey, exiting }}>{children}</NavRenderContext.Provider>
    </NavContext.Provider>
  );
}

const NavRenderContext = createContext<{ enteringKey: string | null; exiting: RouteEntry | null }>({
  enteringKey: null,
  exiting: null,
});

/** Renders every screen of the stack as a layer inside the phone frame. */
export function NavHost({ screens }: { screens: Record<RouteName, ComponentType> }) {
  const { stack } = useNav();
  const { enteringKey, exiting } = useContext(NavRenderContext);
  // The exiting entry keeps its React key so the component instance (camera
  // stream, scroll position, ...) is preserved while it animates away.
  const layers = exiting ? [...stack, exiting] : stack;

  return (
    <>
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
