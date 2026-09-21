/** Application shell: the 412x892 phone stage, the screen stack, splash and snackbar. */
import { useEffect, useState } from 'react';
import { NavHost, useNav, type RouteName } from './nav/navigation';
import { SnackbarLayer } from './components/overlays';
import { SplashScreen } from './components/splash';
import { useAppState } from './state/AppState';
import HomeScreen from './screens/HomeScreen';
import CameraScreen from './screens/CameraScreen';
import HistoryScreen from './screens/HistoryScreen';
import SettingsScreen from './screens/SettingsScreen';
import RecordDetailScreen from './screens/RecordDetailScreen';
import ApiEditScreen from './screens/ApiEditScreen';
import BlankScreen from './screens/BlankScreen';
import ScheduleScreen from './screens/ScheduleScreen';
import ScheduleFilterScreen from './screens/ScheduleFilterScreen';
import AboutScreen from './screens/AboutScreen';
import TextbooksScreen from './screens/TextbooksScreen';

const SCREENS = {
  home: HomeScreen,
  camera: CameraScreen,
  history: HistoryScreen,
  settings: SettingsScreen,
  record: RecordDetailScreen,
  apiEdit: ApiEditScreen,
  blank: BlankScreen,
  schedule: ScheduleScreen,
  scheduleFilter: ScheduleFilterScreen,
  about: AboutScreen,
  textbookList: TextbooksScreen,
};

/** Screens that own a bottom navigation bar keep the snackbar 16dp above it. */
const WITH_NAV_BAR: RouteName[] = ['home', 'camera', 'history', 'settings', 'schedule'];

export default function App() {
  const { current } = useNav();
  const { ready } = useAppState();
  const bottom = WITH_NAV_BAR.includes(current.route) ? 96 : 16;

  // 开屏：数据就绪后自动进入；进入时主页组件从下向上依次弹出
  const [splash, setSplash] = useState(true);
  const [entering, setEntering] = useState(false);

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
