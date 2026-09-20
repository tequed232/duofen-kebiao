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
  | 'camera'
  | 'history'
  | 'settings'
  | 'record'
  | 'apiEdit'
  | 'blank'
  | 'schedule'
  | 'scheduleFilter'
  | 'about';

export interface RouteEntry {
  key: string;
  route: RouteName;
  params: Record<string, string>;
  transition: TransitionKind;
}

const DURATION: Record<TransitionKind, number> = {
  slide: MOTION.spatial.default.duration * 1000,
  fade: MOTION.effects.default.duration * 1000,
  zoom: MOTION.zoom.duration * 1000,
};

interface NavValue {
  stack: RouteEntry[];
  current: RouteEntry;
  push: (route: RouteName, params?: Record<string, string>, transition?: TransitionKind) => void;
  pop: () => void;
  popTo: (route: RouteName) => void;
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
    () => ({ key: uid('scr'), route: initial, params: {}, transition: 'fade' }),
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
    (route, params = {}, transition = 'slide') => {
      const entry: RouteEntry = { key: uid('scr'), route, params, transition };
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

  const replace = useCallback<NavValue['replace']>((route, params = {}) => {
    const current = stackRef.current;
    const entry: RouteEntry = { key: uid('scr'), route, params, transition: 'fade' };
    const next = [...current.slice(0, -1), entry];
    window.history.replaceState({ m3Stack: next }, '');
    setStack(next);
  }, []);

  const value = useMemo<NavValue>(
    () => ({ stack, current: stack[stack.length - 1], push, pop, popTo, replace }),
    [stack, push, pop, popTo, replace],
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
        const classes = ['screen'];
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
