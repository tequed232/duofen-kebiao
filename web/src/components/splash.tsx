/**
 * 启动界面 (splash)。
 *
 * 应用图标 + 名称 + M3 加载指示器；数据就绪后自动（或轻点）进入，
 * 退场时向上淡出，主页组件随后从下向上依次弹出（见 base.css 的 .phone.entering）。
 */
import { useEffect, useState } from 'react';
import { MdIcon } from './md';
import { APP_NAME, APP_SHORT_NAME } from '../lib/meta';

export function SplashScreen({ ready, onDone }: { ready: boolean; onDone: () => void }) {
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (!ready || leaving) return undefined;
    const timer = window.setTimeout(() => setLeaving(true), 900);
    return () => window.clearTimeout(timer);
  }, [ready, leaving]);

  useEffect(() => {
    if (!leaving) return undefined;
    const timer = window.setTimeout(onDone, 320);
    return () => window.clearTimeout(timer);
  }, [leaving, onDone]);

  return (
    <div
      className={['splash', leaving ? 'leaving' : ''].join(' ').trim()}
      onClick={() => setLeaving(true)}
      role="button"
      aria-label="轻点进入"
    >
      <img className="splash-art" src="./art/college-art.jpg" alt="广东财贸职业学院 官方教材呈现" />
      <div className="splash-mark" style={{ width: 56, height: 56, borderRadius: 18 }}>
        <MdIcon name="calendar_month" size={28} />
      </div>
      <div className="splash-title md-headline-medium-emphasized">{APP_NAME}</div>
      <div className="splash-sub md-body-medium">
        {APP_SHORT_NAME} · Material 3 Expressive 课表与记录
      </div>
      <div className="splash-loading">
        <md-circular-progress indeterminate />
      </div>
      <div className="splash-hint md-label-medium">{ready ? '轻点进入' : '正在载入本机数据…'}</div>
    </div>
  );
}
