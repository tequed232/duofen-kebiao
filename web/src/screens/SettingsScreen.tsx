/**
 * 设置 (Settings)
 *
 * A 6 item list group (M3 Expressive connected list: 3dp gaps, 28dp outer corners,
 * 8dp inner corners) with the switch and the two Expressive sliders stacked on top
 * of the group as the spec requires, plus the default map chooser, a snackbar with
 * 撤销 and the shared nav bar.
 */
import { useEffect, useRef, useState } from 'react';
import { SectionHeader, TopAppBar } from '../components/layout';
import { MdDialog, MdIcon, MdIconButton, MdSlider, MdSwitch, MdTextField } from '../components/md';
import { MapChooserDialog } from '../components/schedule';
import { useAppState } from '../state/AppState';
import { useNav } from '../nav/navigation';
import { mapProviderById } from '../lib/schedule';
import { isNativeShell, haptic, nativeTestLiveUpdate, onNativeLiveConfirm } from '../lib/native';
import { probeOcrAssets, type OcrAssetStatus } from '../lib/ocrStatus';

export default function SettingsScreen() {
  const nav = useNav();
  const { settings, updateSettings, seed, dynamicColor, schedule, showSnackbar } = useAppState();
  const [mapDialogOpen, setMapDialogOpen] = useState(false);
  const [schoolDialogOpen, setSchoolDialogOpen] = useState(false);
  /** 点数字直接输入精确值 */
  const [styleDialogOpen, setStyleDialogOpen] = useState(false);
  const [transitionDialogOpen, setTransitionDialogOpen] = useState(false);
  const [leadDialogOpen, setLeadDialogOpen] = useState(false);
  const [scaleDialogOpen, setScaleDialogOpen] = useState(false);
  const [perfDialogOpen, setPerfDialogOpen] = useState(false);
  const [dispersionDialogOpen, setDispersionDialogOpen] = useState(false);
  const [scatterDialogOpen, setScatterDialogOpen] = useState(false);
  const [contourDialogOpen, setContourDialogOpen] = useState(false);
  const [schoolDraft, setSchoolDraft] = useState(settings.schoolName);
  /** 本地识别资源状态：null = 正在探测 */
  const [ocrStatus, setOcrStatus] = useState<OcrAssetStatus | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // 进设置页就探一次识别资源（HEAD 请求，不下载内容）
  useEffect(() => {
    let cancelled = false;
    void probeOcrAssets().then((status) => {
      if (!cancelled) setOcrStatus(status);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // keep the sliders in sync when settings are changed elsewhere (e.g. 撤销)

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
  const apiConfigured = Boolean(settings.visionApiUrl.trim());
  const mapProvider = mapProviderById(settings.mapProvider);

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

  // 统一走导航模块的规范化实现（标签栈只有一种形态，避免详情页叠加导致的乱跳转）
  const selectTab = (tab: 'schedule' | 'search' | 'settings') => nav.selectTab(tab);

  return (
    <>
      <div className="screen-inner">
        <TopAppBar title="设置" />

        <div className="screen-content">
          <div ref={listRef}>

            <SectionHeader icon="palette" title="外观" />
            <div className="list-group">
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
              {/* -------------------------------------- 界面缩放（窄屏适配） */}
              <md-list-item type="button" className="rounded-middle" onClick={() => setScaleDialogOpen(true)}>
                <div slot="start" className="list-icon-badge">
                  <MdIcon name="aspect_ratio" />
                </div>
                <div slot="headline">界面缩放</div>
                <div className="md-body-small muted" slot="supporting-text">
                  {settings.uiScale === 'small'
                    ? '小：整页 92%（窄屏推荐，状态栏与 Dock 留白同步缩小）'
                    : settings.uiScale === 'large'
                      ? '大：整页 108%'
                      : '标准：100%（当前）'}
                </div>
                <MdIcon slot="end" name="chevron_right" />
              </md-list-item>
              {/* --------------------------- 底栏色散：关 / 简洁 / 极致（作者要求单开一项） */}
              <md-list-item type="button" className="rounded-middle" onClick={() => setDispersionDialogOpen(true)}>
                <div slot="start" className="list-icon-badge">
                  <MdIcon name="blur_on" />
                </div>
                <div slot="headline">底栏色散</div>
                <div className="md-body-small muted" slot="supporting-text">
                  {settings.dispersion === 'ultimate'
                    ? '极致：六段光谱（紫蓝青绿黄红），边缘能数出七色'
                    : settings.dispersion === 'off'
                      ? '关：只留折射与高光，不做颜色分离'
                      : '简洁（默认）：边缘一丝冷暖彩边'}
                </div>
                <MdIcon slot="end" name="chevron_right" />
              </md-list-item>
              {/* ------------- 底栏散射：轻磨砂（现在）/ 重磨砂（v3.0.1 那版投射） ------------- */}
              <md-list-item type="button" className="rounded-middle" onClick={() => setScatterDialogOpen(true)}>
                <div slot="start" className="list-icon-badge">
                  <MdIcon name="blur_circular" />
                </div>
                <div slot="headline">底栏散射</div>
                <div className="md-body-small muted" slot="supporting-text">
                  {settings.dockScatter === 'strong'
                    ? '强：投射 v3.0.1 那版口径（本体 18px 重磨砂 + 底色 58%）'
                    : '轻（默认）：图内约 2.4px 磨砂，折射看得最清楚'}
                </div>
                <MdIcon slot="end" name="chevron_right" />
              </md-list-item>
              {/* ------------------------------- 性能模式：高性能 / 自动 / 低性能 */}
              <md-list-item type="button" className="rounded-middle" onClick={() => setPerfDialogOpen(true)}>
                <div slot="start" className="list-icon-badge">
                  <MdIcon name="speed" />
                </div>
                <div slot="headline">性能模式</div>
                <div slot="supporting-text">
                  {settings.perfMode === 'high'
                    ? '高性能：液态玻璃模糊/折射/散射 + 流体拉伸 + 弹性过渡（观感最佳）'
                    : settings.perfMode === 'low'
                      ? '低性能：无滤镜、无流体拉伸、瞬时切换（最省电、最稳）'
                      : '自动：出现掉帧时自动降级（默认）'}
                </div>
                <MdIcon slot="end" name="chevron_right" />
              </md-list-item>
              {/* ----------------------------------------- 等高线背景（单色 · 终末地风） */}
              <md-list-item type="button" className="rounded-outer-bottom" onClick={() => setContourDialogOpen(true)}>
                <div slot="start" className="list-icon-badge">
                  <MdIcon name="graphic_eq" />
                </div>
                <div slot="headline">等高线背景</div>
                <div className="md-body-small muted" slot="supporting-text">
                  {settings.contour === 'off' ? '关：纯色底' : settings.contour === 'bold' ? '密：线条更多更明显' : '细（默认）：单色地形线条'}
                </div>
                <MdIcon slot="end" name="chevron_right" />
              </md-list-item>
            </div>

            <SectionHeader icon="notifications_active" title="实时通知" />
            <div className="list-group">
              {/* -------------------------------------- 上课提醒（灵动岛 / 流体云） */}
              <md-list-item type="text" className="rounded-outer-top">
                <div slot="start" className="list-icon-badge">
                  <MdIcon name="notifications_active" />
                </div>
                <div slot="headline">上课提醒（灵动岛）</div>
                <div className="list-inline-texts" slot="supporting-text">
                  <span>{settings.classReminder ? '已开启' : '已关闭'}</span>
                  <span>{settings.classReminder ? `提前 ${settings.classReminderLead} 分钟` : '上课前不提醒'}</span>
                  <span>通知可「导航去 / 我到了」</span>
                </div>
                <div slot="end">
                  <MdSwitch
                    selected={settings.classReminder}
                    onSelectedChange={(value) =>
                      updateSettings({ classReminder: value }, { message: value ? '已开启上课提醒' : '已关闭上课提醒' })
                    }
                    ariaLabel="上课提醒开关"
                  />
                </div>
              </md-list-item>
              {/* --------------------------- 提前量按钮：属于上面这条上课提醒，不许漂到别的组 */}
              <div className="list-control-row">
                <md-outlined-button className="btn-s" onClick={() => setLeadDialogOpen(true)}>
                  <MdIcon slot="icon" name="schedule" />
                  提前 {settings.classReminderLead} 分钟
                </md-outlined-button>
                <span className="md-body-small muted">提前量可调：5 / 10 / 15 / 20 / 30 分钟</span>
              </div>
              {/* -------------------------------- 台词管理（通知栏桌宠的语料与播放设置） */}
              <md-list-item type="button" className="rounded-middle" onClick={() => nav.push('phraseManager', {}, 'slide')}>
                <div slot="start" className="list-icon-badge">
                  <MdIcon name="forum" />
                </div>
                <div slot="headline">台词管理</div>
                <div className="md-body-small muted" slot="supporting-text">
                  通知栏桌宠：常驻状态条，戳一下说一句；到点自动轮播
                </div>
                <MdIcon slot="end" name="chevron_right" />
              </md-list-item>
              {/* -------------------------------------- 实时通知（流体云 / 实况）自检 */}
              <md-list-item type="text" className="rounded-outer-bottom">
                <div slot="start" className="list-icon-badge">
                  <MdIcon name="notifications_active" />
                </div>
                <div slot="headline">实时通知（流体云）自检</div>
                <div slot="supporting-text">
                  上课提醒会在状态栏显示实况进度；点下面的按钮立刻发一条，确认流体云是否出现
                </div>
              </md-list-item>
              {/* --------------------------- 自检按钮：始终跟随本组最后一项，不跨组漂移 */}
              <div className="list-control-row">
                <md-filled-tonal-button className="btn-s" onClick={() => nativeTestLiveUpdate()}>
                  <MdIcon slot="icon" name="play_arrow" />
                  发送实况测试
                </md-filled-tonal-button>
                <span className="md-body-small muted">仅 Android 16 / ColorOS 生效</span>
              </div>
            </div>

            <SectionHeader icon="aspect_ratio" title="屏幕安全区" />
            <div className="list-group">
              {/* ------------------------- 安全区：上下端各一个滑块，自由调节 */}
              <md-list-item type="text" className="rounded-outer-top">
                <div slot="start" className="list-icon-badge">
                  <MdIcon name="vertical_align_top" />
                </div>
                <div slot="headline">上端安全区</div>
                <div slot="supporting-text">
                  {settings.insetTop < 0
                    ? '自动：跟随系统状态栏/刘海（本机实测约 40dp）'
                    : `手动：${settings.insetTop}dp（推荐 40dp，0 = 沉浸全屏）`}
                </div>
              </md-list-item>
              <div className="list-control-row">
                <MdSlider
                  className="expressive-slider flex-1"
                  value={settings.insetTop < 0 ? 40 : settings.insetTop}
                  min={0}
                  max={64}
                  step={1}
                  ariaLabel="上端安全区"
                  onInput={(value) => document.documentElement.style.setProperty('--inset-top', `${Math.round(value)}px`)}
                  onChange={(value) => {
                    const next = Math.round(value);
                    document.documentElement.style.setProperty('--inset-top', `${next}px`);
                    updateSettings({ insetTop: next }, { message: `上端安全区：${next}dp` });
                  }}
                />
                <button
                  type="button"
                  className="overlay-value editable md-label-medium"
                  aria-label="上端安全区复位为自动"
                  onClick={() => {
                    document.documentElement.style.removeProperty('--inset-top');
                    updateSettings({ insetTop: -1 }, { message: '上端安全区：自动' });
                  }}
                >
                  {settings.insetTop < 0 ? '自动' : `${settings.insetTop}dp`}
                </button>
              </div>
              <md-list-item type="text" className="rounded-outer-bottom">
                <div slot="start" className="list-icon-badge">
                  <MdIcon name="vertical_align_bottom" />
                </div>
                <div slot="headline">下端安全区</div>
                <div slot="supporting-text">
                  {settings.insetBottom < 0
                    ? '自动：跟随系统手势条（本机实测约 16dp）'
                    : `手动：${settings.insetBottom}dp（推荐 16dp，0 = 贴底）`}
                </div>
              </md-list-item>
              {/* --------------------------- 下端安全区滑块：紧跟上端滑块，同属本组 */}
              <div className="list-control-row">
                <MdSlider
                  className="expressive-slider flex-1"
                  value={settings.insetBottom < 0 ? 16 : settings.insetBottom}
                  min={0}
                  max={64}
                  step={1}
                  ariaLabel="下端安全区"
                  onInput={(value) => document.documentElement.style.setProperty('--inset-bottom', `${Math.round(value)}px`)}
                  onChange={(value) => {
                    const next = Math.round(value);
                    document.documentElement.style.setProperty('--inset-bottom', `${next}px`);
                    updateSettings({ insetBottom: next }, { message: `下端安全区：${next}dp` });
                  }}
                />
                <button
                  type="button"
                  className="overlay-value editable md-label-medium"
                  aria-label="下端安全区复位为自动"
                  onClick={() => {
                    document.documentElement.style.removeProperty('--inset-bottom');
                    updateSettings({ insetBottom: -1 }, { message: '下端安全区：自动' });
                  }}
                >
                  {settings.insetBottom < 0 ? '自动' : `${settings.insetBottom}dp`}
                </button>
              </div>
            </div>

            <SectionHeader icon="map" title="导航与学校" />
            <div className="list-group">
              {/* -------------------------------------- 2 默认跳转地图 */}
              <md-list-item type="button" className="rounded-outer-top" onClick={() => setMapDialogOpen(true)}>
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
                className="rounded-outer-bottom"
                onClick={() => {
                  setSchoolDraft(settings.schoolName);
                  setSchoolDialogOpen(true);
                }}
              >
                <div slot="start" className="list-icon-badge">
                  <MdIcon name="school" />
                </div>
                <div slot="headline">学校名称</div>
                <div slot="supporting-text">
                  导航时拼在教室前：{settings.schoolName || '未设置（点这里填写，例如「某某学院」）'}
                </div>
                <MdIcon slot="end" name="chevron_right" />
              </md-list-item>
            </div>

            <SectionHeader icon="image_search" title="图像识别与资源" />
            <div className="list-group">
              {/* -------------------------------------- 本地识别资源状态 + CDN 开关 */}
              <md-list-item type="text" className="rounded-outer-top">
                <div slot="start" className="list-icon-badge">
                  <MdIcon name={ocrStatus === null ? 'speed' : ocrStatus.ready ? 'check_circle' : 'error'} />
                </div>
                <div slot="headline">本地识别</div>
                <div className="list-inline-texts" slot="supporting-text">
                  {ocrStatus === null ? (
                    <span>正在检查识别资源…</span>
                  ) : ocrStatus.ready ? (
                    <>
                      <span>资源就绪：图像处理库 / 识别引擎 / 中文模型</span>
                      <span>封面识别全程在本机，图片不出设备</span>
                    </>
                  ) : (
                    <>
                      <span>
                        缺少{!ocrStatus.opencv ? ' 图像处理库' : ''}
                        {!ocrStatus.engine ? ' 识别引擎' : ''}
                        {!ocrStatus.lang ? ' 中文模型' : ''}
                      </span>
                      <span>开发者执行 npm run setup:ocr 补齐</span>
                    </>
                  )}
                </div>
                <div slot="end">
                  <MdIconButton
                    icon="refresh"
                    label="重新检查识别资源"
                    onClick={() => {
                      haptic('select');
                      setOcrStatus(null);
                      void probeOcrAssets().then(setOcrStatus);
                    }}
                  />
                </div>
              </md-list-item>
              <md-list-item type="text" className="rounded-middle">
                <div slot="start" className="list-icon-badge">
                  <MdIcon name={settings.localOcrCdn ? 'download' : 'storage'} />
                </div>
                <div slot="headline">允许联网取识别资源</div>
                <div className="list-inline-texts" slot="supporting-text">
                  <span>{settings.localOcrCdn ? '允许：缺资源时从 CDN 取引擎' : '禁止：只用本机资源'}</span>
                  <span>中文模型与图片始终在本机，不上传</span>
                </div>
                <div slot="end">
                  <MdSwitch
                    selected={settings.localOcrCdn}
                    onSelectedChange={(value) =>
                      updateSettings(
                        { localOcrCdn: value },
                        {
                          message: value
                            ? '已允许联网取识别资源（图片仍不出设备）'
                            : '已禁止联网：识别只使用本机资源',
                        },
                      )
                    }
                  />
                </div>
              </md-list-item>
              {/* ------------------------------------------------ 5 API编辑 */}
              <md-list-item
                type="button"
                className="rounded-outer-bottom"
                onClick={() => nav.push('apiEdit', {}, 'slide')}
              >
                <div slot="start" className="list-icon-badge">
                  <MdIcon name="menu_book" />
                </div>
                <div slot="headline">接口配置</div>
                <div slot="supporting-text">
                  {apiConfigured ? '已配置，点击可修改' : '唯一的通用接口配置：图片识别（教材封面用）'}
                </div>
                <MdIcon slot="end" name="chevron_right" />
              </md-list-item>
            </div>

            <SectionHeader icon="info" title="关于" />
            <div className="list-group">
              {/* ------------------------------------------------ 8 关于本软件 */}
              <md-list-item
                type="button"
                className="rounded-outer-top"
                onClick={() => nav.push('about', {}, 'slide')}
              >
                <div slot="start" className="list-icon-badge">
                  <MdIcon name="info" />
                </div>
                <div slot="headline">关于本软件</div>
                <div slot="supporting-text">应用信息 · Material 3 设计说明 · 致谢与开源链接</div>
                <MdIcon slot="end" name="chevron_right" />
              </md-list-item>
              {/* -------------------------------------- 开源相关（分类清单） */}
              <md-list-item type="button" className="rounded-outer-bottom" onClick={() => nav.push('licenses', {}, 'slide')}>
                <div slot="start" className="list-icon-badge">
                  <MdIcon name="inventory_2" />
                </div>
                <div slot="headline">开源相关</div>
                <div slot="supporting-text">本项目引入的全部开源依赖（按用途分类）与参考实现</div>
                <MdIcon slot="end" name="chevron_right" />
              </md-list-item>
            </div>
          </div>

          <div className="mt-16">
            <SectionHeader icon="palette" title="动态取色" />
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
                  课表、教材与设置都保存在本机浏览器（IndexedDB），不上传服务器。
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
        open={dispersionDialogOpen}
        headline="底栏色散"
        onClosed={() => setDispersionDialogOpen(false)}
        actions={<md-text-button onClick={() => setDispersionDialogOpen(false)}>取消</md-text-button>}
      >
        液态玻璃边缘的**颜色分离**（真玻璃把不同波长的光掰开的角度不一样）。
        只作用于底边栏这一处，页面其它部分不受影响：
        <div className="col gap-8 mt-12">
          {([
            ['off', '关：只留折射与高光'],
            ['concise', '简洁（默认）：边缘一丝冷暖彩边，克制'],
            ['ultimate', '极致：六段光谱（紫蓝青绿黄红）+ 当年那套更大落差，能数出七色'],
          ] as const).map(([value, label]) => (
            <md-outlined-button
              key={value}
              onClick={() => {
                setDispersionDialogOpen(false);
                updateSettings(
                  { dispersion: value },
                  { message: `底栏色散：${value === 'off' ? '关' : value === 'ultimate' ? '极致' : '简洁'}` },
                );
              }}
            >
              {settings.dispersion === value ? '✓ ' : ''}
              {label}
            </md-outlined-button>
          ))}
        </div>
      </MdDialog>

      <MdDialog
        open={contourDialogOpen}
        headline="等高线背景"
        onClosed={() => setContourDialogOpen(false)}
        actions={<md-text-button onClick={() => setContourDialogOpen(false)}>取消</md-text-button>}
      >
        整页单色底上叠一层地形等高线（工业风那套）。只画一条颜色（跟随主题的 on-surface），
        卡片与对话框仍是各自的不透明表面：
        <div className="col gap-8 mt-12">
          {([
            ['off', '关：纯色底'],
            ['subtle', '细（默认）：线条克制，不抢内容'],
            ['bold', '密：线条更多、更明显'],
          ] as const).map(([value, label]) => (
            <md-outlined-button
              key={value}
              onClick={() => {
                setContourDialogOpen(false);
                updateSettings(
                  { contour: value },
                  { message: value === 'off' ? '等高线背景：关' : value === 'bold' ? '等高线背景：密' : '等高线背景：细' },
                );
              }}
            >
              {settings.contour === value ? '✓ ' : ''}
              {label}
            </md-outlined-button>
          ))}
        </div>
      </MdDialog>

      <MdDialog
        open={scatterDialogOpen}
        headline="底栏散射"
        onClosed={() => setScatterDialogOpen(false)}
        actions={<md-text-button onClick={() => setScatterDialogOpen(false)}>取消</md-text-button>}
      >
        内容穿过底栏边界时被「散开」的程度。只作用于底边栏这一处：
        <div className="col gap-8 mt-12">
          {([
            ['concise', '轻（默认）：图内约 2.4px 磨砂 + 底色全透明，折射看得最清楚'],
            ['strong', '强：投射 v3.0.1（09-23 04:11）那版 —— 本体 18px 磨砂 + 底色 58%，更毛更实'],
          ] as const).map(([value, label]) => (
            <md-outlined-button
              key={value}
              onClick={() => {
                setScatterDialogOpen(false);
                updateSettings(
                  { dockScatter: value },
                  { message: value === 'strong' ? '底栏散射：强（v3.0.1 口径）' : '底栏散射：轻' },
                );
              }}
            >
              {settings.dockScatter === value ? '✓ ' : ''}
              {label}
            </md-outlined-button>
          ))}
        </div>
      </MdDialog>

      <MdDialog
        open={perfDialogOpen}
        headline="性能模式"
        onClosed={() => setPerfDialogOpen(false)}
        actions={<md-text-button onClick={() => setPerfDialogOpen(false)}>取消</md-text-button>}
      >
        同一个安装包内置两档，随时可切（Web 与安卓共用同一份构建，两端一致）：
        <div className="col gap-8 mt-12">
          {([
            ['high', '高性能：玻璃模糊 + 折射 + 散射 + 流体拉伸 + 弹性过渡'],
            ['auto', '自动（推荐）：掉帧时自动降级'],
            ['low', '低性能：无滤镜、无流体拉伸、瞬时切换'],
          ] as const).map(([value, label]) => (
            <md-outlined-button
              key={value}
              onClick={() => {
                setPerfDialogOpen(false);
                updateSettings({ perfMode: value }, { message: `性能模式：${label.split('：')[0]}` });
              }}
            >
              {settings.perfMode === value ? '✓ ' : ''}
              {label}
            </md-outlined-button>
          ))}
        </div>
      </MdDialog>

      <MdDialog
        open={scaleDialogOpen}
        headline="界面缩放"
        onClosed={() => setScaleDialogOpen(false)}
        actions={<md-text-button onClick={() => setScaleDialogOpen(false)}>取消</md-text-button>}
      >
        窄屏设备（例如 1080×2362 @3.5x ≈ 309×675dp）建议选「小」，元素不会挤在一起：
        <div className="col gap-8 mt-12">
          {([
            ['small', '小：92%'],
            ['normal', '标准：100%'],
            ['large', '大：108%'],
          ] as const).map(([value, label]) => (
            <md-outlined-button
              key={value}
              onClick={() => {
                setScaleDialogOpen(false);
                updateSettings({ uiScale: value }, { message: `界面缩放：${label}` });
              }}
            >
              {settings.uiScale === value ? '✓ ' : ''}
              {label}
            </md-outlined-button>
          ))}
        </div>
      </MdDialog>

      <MdDialog
        open={leadDialogOpen}
        headline="上课提醒提前量"
        onClosed={() => setLeadDialogOpen(false)}
        actions={<md-text-button onClick={() => setLeadDialogOpen(false)}>取消</md-text-button>}
      >
        选一个提前量（到点会用实况通知提醒，通知里带「导航」与「课本」两个动作）：
        <div className="col gap-8 mt-12">
          {[5, 10, 15, 20, 30].map((value) => (
            <md-outlined-button
              key={value}
              onClick={() => {
                setLeadDialogOpen(false);
                updateSettings({ classReminderLead: value }, { message: `已设为提前 ${value} 分钟提醒` });
              }}
            >
              {settings.classReminderLead === value ? '✓ ' : ''}提前 {value} 分钟
            </md-outlined-button>
          ))}
        </div>
      </MdDialog>

      <MdDialog
        open={transitionDialogOpen}
        headline="过渡效果"
        onClosed={() => setTransitionDialogOpen(false)}
        actions={<md-text-button onClick={() => setTransitionDialogOpen(false)}>取消</md-text-button>}
      >
        屏幕切换统一为「中间弹出」（从画面正中放大弹出）。只有在设备吃力或你想关掉动效时才选「无动画」：
        <div className="col gap-8 mt-12">
          {([
            ['m3', '中间弹出（推荐）：新页从正中放大弹出，旧页放大淡出'],
            ['none', '无动画：瞬时切换（设备吃力时最稳）'],
          ] as const).map(([value, label]) => (
            <md-outlined-button
              key={value}
              onClick={() => {
                setTransitionDialogOpen(false);
                updateSettings(
                  { transition: value },
                  { message: `已切换过渡效果：${label.split('：')[0]}` },
                );
              }}
            >
              {settings.transition === value ? '✓ ' : ''}
              {label}
            </md-outlined-button>
          ))}
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
