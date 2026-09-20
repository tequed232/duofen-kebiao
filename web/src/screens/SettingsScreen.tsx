/**
 * 设置 (Settings)
 *
 * A 6 item list group (M3 Expressive connected list: 3dp gaps, 28dp outer corners,
 * 8dp inner corners) with the switch and the two Expressive sliders stacked on top
 * of the group as the spec requires, plus the default map chooser, a snackbar with
 * 撤销 and the shared nav bar.
 */
import { useEffect, useRef, useState } from 'react';
import { AppNavBar, SectionHeader, TopAppBar } from '../components/layout';
import { MdDialog, MdIcon, MdIconButton, MdSlider, MdSwitch, MdTextField } from '../components/md';
import { MapChooserDialog } from '../components/schedule';
import { useAppState } from '../state/AppState';
import { useNav } from '../nav/navigation';
import { mapProviderById } from '../lib/schedule';
import { isNativeShell, nativeTestLiveUpdate, onNativeLiveConfirm } from '../lib/native';

export default function SettingsScreen() {
  const nav = useNav();
  const { settings, updateSettings, records, seed, dynamicColor, schedule, showSnackbar, imageStats, pruneImages } = useAppState();

  const [speechValue, setSpeechValue] = useState(settings.speechIntensity);
  const [cameraValue, setCameraValue] = useState(settings.cameraSharpness);
  const [mapDialogOpen, setMapDialogOpen] = useState(false);
  const [schoolDialogOpen, setSchoolDialogOpen] = useState(false);
  /** 点数字直接输入精确值 */
  const [styleDialogOpen, setStyleDialogOpen] = useState(false);
  const [valueDialog, setValueDialog] = useState<'speech' | 'camera' | null>(null);
  const [valueDraft, setValueDraft] = useState('');
  const [schoolDraft, setSchoolDraft] = useState(settings.schoolName);
  /** 卡扣（每 5%）落位时给数值一个短促的反馈 */
  const [snapPulse, setSnapPulse] = useState({ speech: false, camera: false });
  const listRef = useRef<HTMLDivElement>(null);

  // keep the sliders in sync when settings are changed elsewhere (e.g. 撤销)
  useEffect(() => setSpeechValue(settings.speechIntensity), [settings.speechIntensity]);
  useEffect(() => setCameraValue(settings.cameraSharpness), [settings.cameraSharpness]);

  /**
   * 滑块阻尼 + 卡扣：
   *  - 靠近 0/25/50/75/100 这五个卡扣时跟手变慢（阻尼 0.55），进入 ±3 直接吸附（卡扣）；
   *  - 松开时若在 ±6 内也对齐到卡扣。
   */
  const ANCHORS = [0, 25, 50, 75, 100];
  const dampen = (raw: number) => {
    const anchor = ANCHORS.reduce((best, value) => (Math.abs(value - raw) < Math.abs(best - raw) ? value : best), 0);
    const distance = Math.abs(raw - anchor);
    if (distance <= 3) return anchor;
    if (distance <= 12) return Math.round(anchor + (raw - anchor) * 0.55);
    return Math.round(raw);
  };
  const settle = (raw: number) => {
    const anchor = ANCHORS.reduce((best, value) => (Math.abs(value - raw) < Math.abs(best - raw) ? value : best), 0);
    return Math.abs(raw - anchor) <= 6 ? anchor : Math.round(raw);
  };
  const apiConfigured = Boolean(settings.sttApiUrl.trim() || settings.visionApiUrl.trim());
  const mapProvider = mapProviderById(settings.mapProvider);

  const pulse = (which: 'speech' | 'camera') => {
    setSnapPulse((value) => ({ ...value, [which]: true }));
    window.setTimeout(() => setSnapPulse((value) => ({ ...value, [which]: false })), 220);
  };

  const toggleLiquidGlass = () => {
    updateSettings(
      { liquidGlass: !settings.liquidGlass },
      { message: settings.liquidGlass ? '已关闭液态玻璃底边栏' : '已开启液态玻璃底边栏' },
    );
  };

  const toggleDarkMode = () => {
    updateSettings(
      { darkMode: !settings.darkMode },
      { message: settings.darkMode ? '已切换为浅色模式' : '已切换为深色模式' },
    );
  };

  const selectTab = (tab: 'home' | 'history' | 'schedule' | 'settings') => {
    // 课表是主页：点它回到栈底的课表页；其余标签正常入栈
    if (tab === 'schedule') {
      nav.popTo('schedule');
      return;
    }
    if (tab === 'home') {
      nav.push('home', {}, 'slide');
      return;
    }
    nav.push(tab, {}, 'slide');
  };

  return (
    <>
      <div className="screen-inner">
        <TopAppBar title="设置" />

        <div className="screen-content">
          <div className="list-group" ref={listRef}>
            {/* ------------------------------------------------ 1 深色模式 */}
            <md-list-item type="text" className="rounded-outer-top">
              <div slot="start" className="list-icon-badge">
                <MdIcon name="dark_mode" />
              </div>
              <div slot="headline">深色模式</div>
              <div slot="supporting-text">
                {settings.darkMode ? '当前为深色模式' : '当前为浅色模式（默认设计目标）'}
              </div>
              <div slot="end">
                <MdSwitch
                  selected={settings.darkMode}
                  onSelectedChange={toggleDarkMode}
                  ariaLabel="深色模式开关"
                />
              </div>
            </md-list-item>

            {/* -------------------------------------- 2 默认跳转地图 */}
            <md-list-item type="button" className="rounded-middle" onClick={() => setMapDialogOpen(true)}>
              <div slot="start" className="list-icon-badge">
                <MdIcon name="map" />
              </div>
              <div slot="headline">默认跳转地图</div>
              <div slot="supporting-text">
                {mapProvider ? `${mapProvider.label} · 课表点击地址直接启动导航` : '未设置，课表点击地址时先询问'}
              </div>
              <MdIcon slot="end" name="chevron_right" />
            </md-list-item>

            {/* -------------------------------------- 3 学校名称（导航用） */}
            <md-list-item
              type="button"
              className="rounded-middle"
              onClick={() => {
                setSchoolDraft(settings.schoolName);
                setSchoolDialogOpen(true);
              }}
            >
              <div slot="start" className="list-icon-badge">
                <MdIcon name="school" />
              </div>
              <div slot="headline">学校名称</div>
              <div slot="supporting-text">导航时拼在教室前：{settings.schoolName}</div>
              <MdIcon slot="end" name="chevron_right" />
            </md-list-item>

            {/* -------------------------------------- 本地图片缓存上限 */}
            <md-list-item type="text" className="rounded-middle">
              <div slot="start" className="list-icon-badge">
                <MdIcon name="photo_library" />
              </div>
              <div slot="headline">本地图片缓存</div>
              <div slot="supporting-text">
                最多保留 {imageStats.limit} 张（当前 {imageStats.used} 张）：超出后自动从最旧的记录开始删图，文字内容不受影响
              </div>
            </md-list-item>
            <div className="list-control-row">
              <md-outlined-button className="btn-s" onClick={() => void pruneImages()}>
                <MdIcon slot="icon" name="cleaning_services" />
                立即清理到上限
              </md-outlined-button>
              <span className="md-body-small muted">{imageStats.used} / {imageStats.limit} 张</span>
            </div>

            {/* -------------------------------------- 实时通知（流体云） */}
            <md-list-item type="text" className="rounded-middle">
              <div slot="start" className="list-icon-badge">
                <MdIcon name="notifications_active" />
              </div>
              <div slot="headline">实时通知（流体云）</div>
              <div slot="supporting-text">
                {settings.liveNotify
                  ? isNativeShell()
                    ? '已开启：录音时在状态栏显示实时进度（Android 16 实况通知 / ColorOS 流体云）'
                    : '已开启：浏览器里用系统通知显示录音进度'
                  : '已关闭：录音时不发送任何实时通知'}
              </div>
              <div slot="end">
                <MdSwitch
                  selected={settings.liveNotify}
                  onSelectedChange={(value) =>
                    updateSettings(
                      { liveNotify: value },
                      { message: value ? '已开启实时通知' : '已关闭实时通知' },
                    )
                  }
                  ariaLabel="实时通知开关"
                />
              </div>
            </md-list-item>
            <div className="list-control-row">
              <md-filled-tonal-button
                className="btn-s"
                onClick={() => {
                  if (!isNativeShell()) {
                    showSnackbar({ message: '浏览器中通知由系统权限控制，请允许通知权限', duration: 4000 });
                    return;
                  }
                  const sent = nativeTestLiveUpdate();
                  showSnackbar({
                    message: sent ? '已发送实况测试，请查看状态栏 / 流体云' : '当前环境不支持实况通知',
                    duration: 4500,
                  });
                }}
              >
                <MdIcon slot="icon" name="send" />
                发送实况测试
              </md-filled-tonal-button>
            </div>

            {/* -------------------------------------- 4 液态玻璃底边栏 */}
            <md-list-item type="button" className="rounded-middle" onClick={() => setStyleDialogOpen(true)}>
              <div slot="start" className="list-icon-badge">
                <MdIcon name="blur_on" />
              </div>
              <div slot="headline">底边栏风格（互斥）</div>
              <div slot="supporting-text">
                {settings.liquidGlass
                  ? '当前：液态玻璃（模糊 + 折射，关闭 M3 容器底色）'
                  : '当前：Material 3 原生（surfaceContainer 容器色，无玻璃层）'}
              </div>
            </md-list-item>

            {/* ------------------------------------------------ 5 API编辑 */}
            <md-list-item
              type="button"
              className="rounded-middle"
              onClick={() => nav.push('apiEdit', {}, 'slide')}
            >
              <div slot="start" className="list-icon-badge">
                <MdIcon name="bolt" />
              </div>
              <div slot="headline">API编辑</div>
              <div slot="supporting-text">
                {apiConfigured ? '已配置接口，点击可修改' : '未配置，点击填写语音与图片接口'}
              </div>
              <MdIcon slot="end" name="chevron_right" />
            </md-list-item>

            {/* -------------------------------------- 6 语音输入强度调整 */}
            <md-list-item type="text" className="rounded-middle">
              <div slot="start" className="list-icon-badge">
                <MdIcon name="mic" />
              </div>
              <div slot="headline">语音输入强度调整</div>
              <div slot="supporting-text">识别置信度门限：{Math.round(speechValue)}%（0/25/50/75/100 卡扣，点数字可直接编辑）</div>
            </md-list-item>

            <div className="list-control-row">
              <MdSlider
                className="expressive-slider flex-1 detented"
                value={speechValue}
                min={0}
                max={100}
                step={1}
                ticks
                ariaLabel="语音输入强度"
                onInput={(value) => setSpeechValue(value)}
                onChange={(value) => {
                  const next = settle(value);
                  setSpeechValue(next);
                  pulse('speech');
                  updateSettings({ speechIntensity: next }, { message: '已保存语音输入强度 ' + next + '%' });
                }}
              />
              <button
                type="button"
                className={`overlay-value editable md-label-medium${snapPulse.speech ? ' detent' : ''}`}
                aria-label="编辑语音输入强度"
                onClick={() => {
                  setValueDraft(String(Math.round(speechValue)));
                  setValueDialog('speech');
                }}
              >
                {Math.round(speechValue)}%
              </button>
            </div>

            {/* -------------------------------------- 7 相机清晰度调整 */}
            <md-list-item type="text" className="rounded-middle">
              <div slot="start" className="list-icon-badge">
                <MdIcon name="camera_video" />
              </div>
              <div slot="headline">相机清晰度调整</div>
              <div slot="supporting-text">拍摄分辨率与画质：{Math.round(cameraValue)}%（0/25/50/75/100 卡扣，点数字可直接编辑）</div>
            </md-list-item>

            <div className="list-control-row">
              <MdSlider
                className="expressive-slider flex-1 detented"
                value={cameraValue}
                min={0}
                max={100}
                step={1}
                ticks
                ariaLabel="相机清晰度"
                onInput={(value) => setCameraValue(value)}
                onChange={(value) => {
                  const next = settle(value);
                  setCameraValue(next);
                  pulse('camera');
                  updateSettings({ cameraSharpness: next }, { message: '已保存相机清晰度 ' + next + '%' });
                }}
              />
              <button
                type="button"
                className={`overlay-value editable md-label-medium${snapPulse.camera ? ' detent' : ''}`}
                aria-label="编辑相机清晰度"
                onClick={() => {
                  setValueDraft(String(Math.round(cameraValue)));
                  setValueDialog('camera');
                }}
              >
                {Math.round(cameraValue)}%
              </button>
            </div>

            {/* ------------------------------------------------ 8 关于本软件 */}
            <md-list-item
              type="button"
              className="rounded-outer-bottom"
              onClick={() => nav.push('about', {}, 'slide')}
            >
              <div slot="start" className="list-icon-badge">
                <MdIcon name="info" />
              </div>
              <div slot="headline">关于本软件</div>
              <div slot="supporting-text">应用信息 · Material 3 设计说明 · 致谢与开源链接</div>
              <MdIcon slot="end" name="chevron_right" />
            </md-list-item>




          </div>

          <div className="mt-16">
            <SectionHeader icon="palette" title="外观与数据" />
            <div className="col gap-8">
              <div className="row gap-8">
                <MdIcon name="colorize" size={18} />
                <span className="md-body-medium flex-1">
                  {dynamicColor
                    ? `正在使用系统/浏览器提供的强调色生成 Material 3 配色（种子 ${seed.seed}，来源 ${seed.origin}）`
                    : `未获取到用户强调色，使用备用 Green 主题（种子 ${seed.seed}）`}
                </span>
              </div>
              <div className="row gap-8">
                <MdIcon name="calendar_month" size={18} />
                <span className="md-body-medium flex-1">
                  课表已内嵌（{schedule.term} · {schedule.owner || '未署名'}），可在课表页导入 DOC/HTML 或粘贴文本更新。
                </span>
              </div>
              <div className="row gap-8">
                <MdIcon name="storage" size={18} />
                <span className="md-body-medium flex-1">
                  全部数据保存在本机浏览器（IndexedDB），当前共有 {records.length} 条记录。
                </span>
              </div>
              <div className="row gap-8">
                <MdIcon name="motion_photos_on" size={18} />
                <span className="md-body-medium flex-1">
                  动效使用 MotionScheme.expressive() 弹簧曲线（spatial / effects 物理弹簧）。
                </span>
              </div>
            </div>
          </div>
        </div>

        <AppNavBar active="settings" onSelect={selectTab} />
      </div>

      <MapChooserDialog
        open={mapDialogOpen}
        address="默认地图设置"
        onCancel={() => setMapDialogOpen(false)}
        onConfirm={(providerId) => {
          setMapDialogOpen(false);
          updateSettings({ mapProvider: providerId }, { message: '已保存默认地图' });
        }}
      />

      <MdDialog
        open={valueDialog !== null}
        headline={valueDialog === 'camera' ? '相机清晰度' : '语音输入强度'}
        onClosed={() => setValueDialog(null)}
        actions={
          <>
            <md-text-button onClick={() => setValueDialog(null)}>取消</md-text-button>
            <md-text-button
              onClick={() => {
                const parsed = Number.parseInt(valueDraft, 10);
                const next = Number.isFinite(parsed) ? Math.min(100, Math.max(0, parsed)) : 0;
                if (valueDialog === 'camera') {
                  setCameraValue(next);
                  updateSettings({ cameraSharpness: next }, { message: '已保存相机清晰度 ' + next + '%' });
                } else {
                  setSpeechValue(next);
                  updateSettings({ speechIntensity: next }, { message: '已保存语音输入强度 ' + next + '%' });
                }
                setValueDialog(null);
              }}
            >
              保存
            </md-text-button>
          </>
        }
      >
        输入 0–100 的整数；0/25/50/75/100 是滑块上的卡扣位置。
        <div className="mt-12">
          <MdTextField label="数值（0–100）" value={valueDraft} onValueChange={setValueDraft} type="number" />
        </div>
      </MdDialog>

      <MdDialog
        open={schoolDialogOpen}
        headline="学校名称"
        onClosed={() => setSchoolDialogOpen(false)}
        actions={
          <>
            <md-text-button onClick={() => setSchoolDialogOpen(false)}>取消</md-text-button>
            <md-text-button
              onClick={() => {
                const name = schoolDraft.trim() || settings.schoolName;
                setSchoolDialogOpen(false);
                updateSettings({ schoolName: name }, { message: '已保存学校名称' });
              }}
            >
              保存
            </md-text-button>
          </>
        }
      >
        导航时会把学校名拼在教室前面，例如「{schoolDraft || settings.schoolName} 16栋203」。
        <div className="mt-12">
          <MdTextField label="学校名称" value={schoolDraft} onValueChange={setSchoolDraft} />
        </div>
      </MdDialog>
    </>
  );
}
