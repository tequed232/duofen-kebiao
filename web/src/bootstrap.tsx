/** Mounts the React tree (kept separate so main.tsx can do theme setup first). */
import { StrictMode } from 'react';
import { markNativeShell } from './lib/native';
import { createRoot } from 'react-dom/client';
import App from './App';
import { AppStateProvider } from './state/AppState';
import { NavProvider } from './nav/navigation';

const container = document.getElementById('root');
if (!container) throw new Error('#root not found');

// 微信内置浏览器（X5 / WKWebView）对一些新 CSS 支持较弱，标记出来做降级适配
markNativeShell();

if (/MicroMessenger/i.test(navigator.userAgent)) {
  document.documentElement.classList.add('wechat');
}

createRoot(container).render(
  <StrictMode>
    <AppStateProvider>
      <NavProvider initial="schedule">
        <App />
      </NavProvider>
    </AppStateProvider>
  </StrictMode>,
);
