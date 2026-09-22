/** Application shell: the 412x892 phone stage, the screen stack, splash and snackbar. */
import { useEffect, useState } from 'react';
import { NavHost, useNav, type RouteName } from './nav/navigation';
import { SnackbarLayer } from './components/overlays';
import { AppNavBar } from './components/layout';
import { SplashScreen } from './components/splash';
import { useAppState } from './state/AppState';
import { nativeDockActive } from './lib/native';
import { startClassReminderLoop } from './lib/classReminder';
import HomeScreen from './screens/HomeScreen';
import HistoryScreen from './screens/HistoryScreen';
import SettingsScreen from './screens/SettingsScreen';
import RecordDetailScreen from './screens/RecordDetailScreen';
import ApiEditScreen from './screens/ApiEditScreen';
import BlankScreen from './screens/BlankScreen';
import ScheduleScreen from './screens/ScheduleScreen';
import ScheduleFilterScreen from './screens/ScheduleFilterScreen';
import AboutScreen from './screens/AboutScreen';
import TextbooksScreen from './screens/TextbooksScreen';
import LicensesScreen from './screens/LicensesScreen';

const SCREENS = {
  home: HomeScreen,
  history: HistoryScreen,
  settings: SettingsScreen,
  record: RecordDetailScreen,
  apiEdit: ApiEditScreen,
  blank: BlankScreen,
  schedule: ScheduleScreen,
  scheduleFilter: ScheduleFilterScreen,
  about: AboutScreen,
  textbookList: TextbooksScreen,
  licenses: LicensesScreen,
};

/** Screens that own a bottom navigation bar keep the snackbar 16dp above it. */
const WITH_NAV_BAR: RouteName[] = ['home', 'camera', 'history', 'settings', 'schedule'];

/** 路由 → 标签：底栏的选中项由当前路由推导（唯一事实来源） */
function tabForRoute(route: RouteName): 'schedule' | 'search' | 'settings' {
  if (route === 'settings' || route === 'about' || route === 'apiEdit' || route === 'licenses') return 'settings';
  if (route === 'scheduleFilter') return 'search';
  return 'schedule';
}

/** 常驻底栏（只挂一次） */
function PersistentDock() {
  const { current, selectTab } = useNav();
  return <AppNavBar active={tabForRoute(current.route)} onSelect={selectTab} />;
}

export default function App() {
  const { current, selectTab, push } = useNav();
  const { ready, settings, schedule, textbooks } = useAppState();
  const bottom = WITH_NAV_BAR.includes(current.route) ? 96 : 16;

  // 开屏：数据就绪后自动进入；进入时主页组件从下向上依次弹出
  const [splash, setSplash] = useState(true);
  const [entering, setEntering] = useState(false);

  // 性能模式：high 全特效 / low 关特效 / auto 交给自动检测（perf.ts 按掉帧情况降级）
  useEffect(() => {
    const root = document.documentElement;
    if (settings.perfMode === 'high') root.dataset.perf = 'high';
    else if (settings.perfMode === 'low') root.dataset.perf = 'low';
    else root.dataset.perf = root.dataset.perfAuto ?? 'high';
  }, [settings.perfMode]);

  // 安全区覆盖：-1 表示自动（跟随系统 env() / APK 注入的原生 inset）。
  // Web 与 APK 共用这两个变量，因此两端留白逻辑完全一致。
  useEffect(() => {
    const root = document.documentElement;
    const apply = (name: string, value: number | undefined) => {
      if (typeof value === 'number' && value >= 0) root.style.setProperty(name, `${value}px`);
      else root.style.removeProperty(name);
    };
    apply('--inset-top', settings.insetTop);
    apply('--inset-bottom', settings.insetBottom);
  }, [settings.insetTop, settings.insetBottom]);

  // 界面缩放：写到 <html data-ui-scale>，由 CSS 的 zoom 统一缩放整页
  //（窄屏设备如 308dp 宽可调成「小」，避免元素拥挤；安全区留白也随之等比缩放）
  useEffect(() => {
    document.documentElement.dataset.uiScale = settings.uiScale ?? 'normal';
  }, [settings.uiScale]);

  // 上课提醒：每 30 秒检查一次，临近上课时发实况通知（灵动岛 / 流体云）
  useEffect(() => {
    if (!ready) return undefined;
    return startClassReminderLoop(() => ({ schedule, textbooks, settings }));
  }, [ready, schedule, textbooks, settings]);

  // 通知里的「课本」动作：宿主打开应用后调用它跳到教材窗口
  useEffect(() => {
    (window as unknown as { DuofenOpen?: unknown }).DuofenOpen = {
      textbooks: () => {
        selectTab('schedule');
        push('textbookList', {}, 'slide');
      },
    };
  }, [selectTab, push]);

  // 原生 Dock（APK）：把标签切换能力暴露给宿主，并同步选中项
  useEffect(() => {
    (window as unknown as { DuofenDock?: unknown }).DuofenDock = {
      select: (id: string) => selectTab(id as 'schedule' | 'search' | 'settings'),
    };
  }, [selectTab]);

  useEffect(() => {
    const index = current.route === 'settings' ? 2 : current.route === 'scheduleFilter' ? 1 : 0;
    nativeDockActive(index);
  }, [current.route]);

  // 底边栏材质：写到 <html data-glass-material>，由 CSS 决定用玻璃 / 实心 / 半透明
  useEffect(() => {
    document.documentElement.dataset.glassMaterial = settings.barMaterial ?? 'solid';
  }, [settings.barMaterial]);

  // 过渡模式：写到 <html data-transition> 上，由 CSS 决定动画（none = 瞬时切换）
  useEffect(() => {
    document.documentElement.dataset.transition = settings.transition;
  }, [settings.transition]);

  useEffect(() => {
    if (splash) return undefined;
    setEntering(true);
    const timer = window.setTimeout(() => setEntering(false), 900);
    return () => window.clearTimeout(timer);
  }, [splash]);

  return (
    <div className="stage">
      <div className={['phone', entering ? 'entering' : ''].join(' ').trim()}>
        <NavHost screens={SCREENS} />
      {/* 常驻底栏：整个应用只渲染一份，位于屏幕栈之外 ——
          从根本上避免"切页导致底栏卸载/捕获残留/动画位移"造成的点击失效与重复跳转 */}
      <PersistentDock />
        <SnackbarLayer bottom={bottom} />
        {splash ? <SplashScreen ready={ready} onDone={() => setSplash(false)} /> : null}

        {/* 液态玻璃底边栏的折射滤镜（无外部依赖） */}
        <svg width="0" height="0" aria-hidden="true" style={{ position: 'absolute' }}>
          <filter id="liquid-glass-refraction" x="-25%" y="-25%" width="150%" height="150%">
            <feTurbulence type="fractalNoise" baseFrequency="0.01 0.024" numOctaves="2" seed="7" result="noise" />
            <feGaussianBlur in="noise" stdDeviation="2.4" result="soft" />
            {/* 这个 feDisplacementMap 的 scale 由底边栏在指针滑动时实时改写（液体折射） */}
            <feDisplacementMap
              id="liquid-glass-displacement"
              in="SourceGraphic"
              in2="soft"
              scale="16"
              xChannelSelector="R"
              yChannelSelector="G"
            />
          </filter>
          {/* 水滴融合（goo）：模糊后提高 alpha 对比，让相邻水滴连成一体 */}
          <filter id="liquid-goo" x="-30%" y="-40%" width="160%" height="180%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="7" result="blur" />
            <feColorMatrix
              in="blur"
              mode="matrix"
              values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 24 -10"
              result="goo"
            />
            <feBlend in="SourceGraphic" in2="goo" />
          </filter>
        </svg>
      </div>
    </div>
  );
}
