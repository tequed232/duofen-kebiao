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
import { useNav, useRouteParams } from '../nav/navigation';
import { mapProviderById } from '../lib/schedule';
import { isNativeShell, haptic, nativeTestLiveUpdate, nativeStartPhraseService, nativeStopPhraseService, onNativeLiveConfirm } from '../lib/native';
import * as db from '../lib/db';

export default function SettingsScreen() {
  const nav = useNav();
  /**
   * Clash Verge 式结构：设置首页只放**分类入口**，点进去是独立屏。
   * 两类屏复用同一个组件，靠路由参数 `section` 区分 —— 好处是所有弹层状态、OCR 探测、
   * 写入逻辑都只有一份，不会出现"首页改了、子屏忘了改"的漂移。
   *   section === ''            → 入口列表（首页）
   *   section === 'appearance'  → 外观子屏（只显示外观那一段，其余用 display:none 收起）
   */
  const section = useRouteParams().section ?? '';
  /**
   * **选项屏**（Clash Verge 里"语言 / 主题"那种：点一个选项，进它自己的一屏）。
   * 与分类屏同一个路由名，靠 `option` 参数区分；`nav.push` 的去重已经改成"路由 + 参数"，
   * 所以 `settingsSection{section} → settingsSection{option}` 推得动。
   */
  const option = useRouteParams().option ?? '';
  const atHub = section === '' && option === '';
  const show = (id: string) => section === id;
  const atOption = (id: string) => option === id;
  const SECTION_TITLES: Record<string, string> = {
    appearance: '外观',
    notify: '实时通知',
    safearea: '屏幕安全区',
    nav: '导航与学校',
    ocr: '图像识别与资源',
    home: '主页',
    edit: '课表编辑',
    about: '关于',
  };
  /**
   * **选项屏**的清单：Clash Verge 里"语言 / 主题"那种 —— 点一个选项，进它自己一屏。
   * 六项共用一份表 + 一个渲染块，避免六段几乎一样的 JSX（改一处漏五处的老毛病）。
   */
  const OPTION_CHOICES: {
    id: string;
    title: string;
    note: string;
    field: 'dispersion' | 'dockScatter' | 'dockWarp' | 'uiScale' | 'perfMode' | 'contour';
    choices: [string, string][];
  }[] = [
    {
      id: 'dispersion',
      title: '底栏色散',
      note: '液态玻璃边缘的颜色分离（真玻璃把不同波长的光掰开的角度不一样）。只作用于底边栏这一处。',
      field: 'dispersion',
      choices: [
        ['off', '关：只留折射与高光'],
        ['concise', '简洁（默认）：边缘一丝冷暖彩边，克制'],
        ['ultimate', '极致：六段光谱（紫蓝青绿黄红），边缘虹带拉到最宽'],
      ],
    },
    {
      id: 'scatter',
      title: '底栏散射',
      note: '内容穿过底栏边界时被「散开」的程度。只作用于底边栏这一处。',
      field: 'dockScatter',
      choices: [
        ['concise', '轻（默认）：折射看得最清楚'],
        ['strong', '强：底色 30% 磨砂更实，色散仍然看得见'],
      ],
    },
    {
      id: 'warp',
      title: '底栏扭曲',
      note: '液态玻璃把背后的画面「掰弯」的幅度与范围。只作用于底边栏这一处。',
      field: 'dockWarp',
      choices: [
        ['thick', '厚透镜（默认）：能明显看到背景被掰弯、文字被横向拉开'],
        ['concise', '收窄：只留在边缘一线'],
        ['off', '关：不做折射位移，只留边缘高光'],
      ],
    },
    {
      id: 'scale',
      title: '界面缩放',
      note: '整页缩放，窄屏嫌挤就调小一档。状态栏与底栏留白会跟着一起缩。',
      field: 'uiScale',
      choices: [
        ['small', '小：整页 92%'],
        ['normal', '标准：100%（默认）'],
        ['large', '大：整页 108%'],
      ],
    },
    {
      id: 'perf',
      title: '性能模式',
      note: '决定挂不挂玻璃滤镜与流体动画。低性能档最省电，观感最素。',
      field: 'perfMode',
      choices: [
        ['high', '高性能：模糊 + 折射 + 散射 + 流体拉伸 + 弹性过渡（观感最佳）'],
        ['auto', '自动（默认）：出现掉帧时自动降级'],
        ['low', '低性能：无滤镜、无流体拉伸、瞬时切换（最省电、最稳）'],
      ],
    },
    {
      id: 'contour',
      title: '等高线背景',
      note: '整页单色底上叠一层地形等高线（工业风）。只画一条颜色（跟随主题），卡片与弹层仍是各自的不透明表面。',
      field: 'contour',
      choices: [
        ['off', '关：纯色底'],
        ['subtle', '细（默认）：线条克制，不抢内容'],
        ['bold', '密：线条更多、更明显'],
      ],
    },
  ];
  const activeOption = OPTION_CHOICES.find((entry) => entry.id === option);
  const OPTION_TITLES: Record<string, string> = Object.fromEntries(
    OPTION_CHOICES.map((entry) => [entry.id, entry.title]),
  );
  const { settings, updateSettings, seed, dynamicColor, schedule, showSnackbar, requestUiCommand } = useAppState();
  const [mapDialogOpen, setMapDialogOpen] = useState(false);
  const [schoolDialogOpen, setSchoolDialogOpen] = useState(false);
  /** 点数字直接输入精确值 */
  const [styleDialogOpen, setStyleDialogOpen] = useState(false);  const [transitionDialogOpen, setTransitionDialogOpen] = useState(false);
  const [leadDialogOpen, setLeadDialogOpen] = useState(false);
  const [schoolDraft, setSchoolDraft] = useState(settings.schoolName);
  const listRef = useRef<HTMLDivElement>(null);

  // keep the sliders in sync when settings are changed elsewhere (e.g. 撤销)

  /**
   * 滑块阻尼 + 卡扣：
   *  - 靠近 0/25/50/75/100 这五个卡扣时跟手变慢（阻尼 0.55），进入 ±3 直接吸附（卡扣）；
   *  - 松开时若在 ±6 内也对齐到卡扣。
   */
  const apiConfigured = Boolean(settings.visionApiUrl.trim());
  const mapProvider = mapProviderById(settings.mapProvider);

  /**
   * 通知栏桌宠（实时语料）的开关。值存在 KV 的 `phrasesEnabled` —— 与「台词管理」页共用同一个键，
   * 两边读写一致；打开即启动前台服务（通知栏出现那条不可滑动清除的常驻通知），关闭即停。
   */
  const [phraseEnabled, setPhraseEnabled] = useState(false);
  useEffect(() => {
    void db.readKv<boolean>('phrasesEnabled').then((value) => setPhraseEnabled(Boolean(value)));
  }, []);
  const togglePhrasePet = (on: boolean) => {
    setPhraseEnabled(on);
    void db.writeKv('phrasesEnabled', on);
    if (on) nativeStartPhraseService();
    else nativeStopPhraseService();
    showSnackbar({ message: on ? '通知栏桌宠：已开启' : '通知栏桌宠：已关闭' });
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
        <TopAppBar
          title={atHub ? '设置' : atOption('dispersion') ? OPTION_TITLES.dispersion : SECTION_TITLES[section] ?? '设置'}
          onBack={atHub ? undefined : () => nav.pop()}
        />

        <div className="screen-content">
          <div ref={listRef}>

            {/* ------------------------------ 设置首页：只有分类入口，点进去才是选项 ------ */}
            {atHub ? (
              <div className="list-group">
                {(
                  [
                    ['appearance', 'palette', '外观', `${settings.darkMode ? '深色' : '浅色'} · 缩放 ${settings.uiScale === 'small' ? '小' : settings.uiScale === 'large' ? '大' : '标准'} · 色散 ${settings.dispersion} · 扭曲 ${settings.dockWarp}`],
                    ['notify', 'notifications_active', '实时通知', settings.classReminder ? `上课提醒已开（提前 ${settings.classReminderLead} 分钟）· 台词管理` : '上课提醒已关 · 台词管理'],
                    ['safearea', 'aspect_ratio', '屏幕安全区', `上端 ${settings.insetTop < 0 ? '自动' : `${settings.insetTop}dp`} · 下端 ${settings.insetBottom < 0 ? '自动' : `${settings.insetBottom}dp`}`],
                    ['nav', 'map', '导航与学校', `${mapProvider ? mapProvider.label : '未设置地图'} · ${settings.schoolName || '未填学校名称'}`],
                    ['ocr', 'image_search', '图像识别与资源', apiConfigured ? '封面识别走多模态接口' : '未配置接口 · 封面识别不可用'],
                    ['home', 'home', '主页', settings.navCourse ? '显示「导航课程」按钮' : '已隐藏「导航课程」按钮'],
                    ['edit', 'edit_calendar', '课表编辑', '导入课表 · 查看教材 · 系统日程'],
                    ['about', 'info', '关于', '应用信息 · 开源相关 · 动态取色'],
                  ] as const
                ).map(([id, icon, title, summary], index, all) => (
                  <md-list-item
                    key={id}
                    type="button"
                    className={index === 0 ? 'rounded-outer-top' : index === all.length - 1 ? 'rounded-outer-bottom' : 'rounded-middle'}
                    onClick={() => {
                      haptic('tick');
                      nav.push('settingsSection', { section: id }, 'slide');
                    }}
                  >
                    <div slot="start" className="list-icon-badge">
                      <MdIcon name={icon} />
                    </div>
                    <div slot="headline">{title}</div>
                    <div className="md-body-small muted" slot="supporting-text">
                      {summary}
                    </div>
                    <MdIcon slot="end" name="chevron_right" />
                  </md-list-item>
                ))}
              </div>
            ) : null}

            {/* --------------- 选项屏：Clash Verge 里"语言/主题"那种，点一个选项进它自己一屏 ------ */}
            {activeOption ? (
              <div className="list-group">
                <div className="settings-note md-body-small muted">{activeOption.note}</div>
                {activeOption.choices.map(([value, label], index, all) => (
                  <md-list-item
                    key={value}
                    type="button"
                    className={index === 0 ? 'rounded-outer-top' : index === all.length - 1 ? 'rounded-outer-bottom' : 'rounded-middle'}
                    onClick={() =>
                      updateSettings(
                        { [activeOption.field]: value } as Partial<typeof settings>,
                        { message: `${activeOption.title}：${label.split('：')[0]}` },
                      )
                    }
                  >
                    <div slot="start" className="list-icon-badge">
                      <MdIcon name={settings[activeOption.field] === value ? 'radio_button_checked' : 'radio_button_unchecked'} />
                    </div>
                    <div slot="headline">{label}</div>
                  </md-list-item>
                ))}
              </div>
            ) : null}

            {show('appearance') ? <SectionHeader icon="palette" title="外观" /> : null}
            <div className="list-group" style={show('appearance') ? undefined : { display: 'none' }}>
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
              <md-list-item type="button" className="rounded-middle" onClick={() => nav.push('settingsSection', { option: 'scale' }, 'slide')}>
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
              <md-list-item
                type="button"
                className="rounded-middle"
                onClick={() => nav.push('settingsSection', { option: 'dispersion' }, 'slide')}
              >
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
              <md-list-item type="button" className="rounded-middle" onClick={() => nav.push('settingsSection', { option: 'scatter' }, 'slide')}>
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
              {/* ------------------------------- 底栏扭曲：厚透镜（默认）/ 收窄 / 关 */}
              <md-list-item type="button" className="rounded-middle" onClick={() => nav.push('settingsSection', { option: 'warp' }, 'slide')}>
                <div slot="start" className="list-icon-badge">
                  <MdIcon name="waves" />
                </div>
                <div slot="headline">底栏扭曲</div>
                <div className="md-body-small muted" slot="supporting-text">
                  {settings.dockWarp === 'thick'
                    ? '厚透镜（默认）：能明显看到背景被掰弯、文字被横向拉开'
                    : settings.dockWarp === 'off'
                      ? '关：不做折射位移，只留边缘高光'
                      : '收窄：只留在边缘一线（六项整改后那版，几乎看不出来）'}
                </div>
                <MdIcon slot="end" name="chevron_right" />
              </md-list-item>
              {/* ------------------------------- 性能模式：高性能 / 自动 / 低性能 */}
              <md-list-item type="button" className="rounded-middle" onClick={() => nav.push('settingsSection', { option: 'perf' }, 'slide')}>
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
              <md-list-item type="button" className="rounded-outer-bottom" onClick={() => nav.push('settingsSection', { option: 'contour' }, 'slide')}>
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

            {show('notify') ? <SectionHeader icon="notifications_active" title="实时通知" /> : null}
            <div className="list-group" style={show('notify') ? undefined : { display: 'none' }}>
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
              {/* ------------------------------- 通知栏桌宠开关（作者：通知栏显示的东西，设置里就该看得见） */}
            <md-list-item type="text" className="rounded-middle">
              <div slot="start" className="list-icon-badge">
                <MdIcon name={phraseEnabled ? 'notifications_active' : 'notifications_off'} />
              </div>
              <div slot="headline">通知栏桌宠</div>
              <div className="md-body-small muted" slot="supporting-text">
                {phraseEnabled
                  ? '已开启：通知栏常驻状态条，戳一下说一句；到点自动轮播'
                  : '已关闭：通知栏不显示常驻状态条（语料与间隔在下面的「台词管理」里调）'}
              </div>
              <div slot="end">
                <MdSwitch selected={phraseEnabled} onSelectedChange={togglePhrasePet} ariaLabel="通知栏桌宠开关" />
              </div>
            </md-list-item>
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

            {show('safearea') ? <SectionHeader icon="aspect_ratio" title="屏幕安全区" /> : null}
            <div
              className="list-group"
              style={show('safearea') ? undefined : { display: 'none' }}
            >
              {/* Clash Verge 式：这一屏就是「屏幕安全区」的**独立设置屏**，两个滑块都在这里。
                  注意不能做成"再点一层进上端/下端" —— `nav.push` 有同路由去重
                  （`top.route === route` 直接 return），`settingsSection → settingsSection` 推不动。 */}
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
              {/* 下端滑块与上端滑块同属这一屏 */}
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

            {show('nav') ? <SectionHeader icon="map" title="导航与学校" /> : null}
            <div className="list-group" style={show('nav') ? undefined : { display: 'none' }}>
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

            {show('ocr') ? <SectionHeader icon="image_search" title="图像识别与资源" /> : null}
            <div className="list-group" style={show('ocr') ? undefined : { display: 'none' }}>
              {/* 本地识别（OpenCV + Tesseract）已于 2026-09-27 下线：免费多模态模型读封面更准，
                  而本地那套要给每个包塞 40+ MB 的 wasm 与中文模型（APK 26 MB → 4 MB）。
                  这里如实说明「识别走接口」，不再有资源检查/联网开关。 */}
              <md-list-item type="text" className="rounded-outer-top">
                <div slot="start" className="list-icon-badge">
                  <MdIcon name={apiConfigured ? 'check_circle' : 'error'} />
                </div>
                <div slot="headline">封面识别方式</div>
                <div className="list-inline-texts" slot="supporting-text">
                  <span>{apiConfigured ? '走下面配好的多模态接口' : '还没配置接口：封面识别暂不可用'}</span>
                  <span>已不再内置本地识别：省掉 40+ MB 模型，识别效果反而更好</span>
                </div>
                <MdIcon slot="end" name="auto_awesome" />
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

            {show('home') ? <SectionHeader icon="home" title="主页" /> : null}
            <div className="list-group" style={show('home') ? undefined : { display: 'none' }}>
              {/* 作者 2026-09-29 要求：主页的「导航课程」要能开关，并且说明这一栏是干什么的 */}
              <md-list-item type="text" className="rounded-outer-top">
                <div slot="start" className="list-icon-badge">
                  <MdIcon name="navigation" />
                </div>
                <div slot="headline">显示「导航课程」</div>
                <div className="list-inline-texts" slot="supporting-text">
                  <span>
                    {settings.navCourse
                      ? '开启：主页右下角显示一颗「导航课程」，一键去时间上离现在最近的那节课'
                      : '关闭：主页不再显示这颗按钮，右下角只留「回到今天」'}
                  </span>
                  <span>这颗按钮与左边的「筛选课程」同属主页右下角的浮动按钮区</span>
                </div>
                <div slot="end">
                  {/* id 是给守卫用的稳定钩子：md-switch 上的 aria-label 会被渲染成 data-aria-label，
                      按 aria 属性选不稳（2026-09-29 实测）。 */}
                  <MdSwitch
                    id="home-nav-course-switch"
                    selected={settings.navCourse}
                    onSelectedChange={() =>
                      updateSettings(
                        { navCourse: !settings.navCourse },
                        { message: settings.navCourse ? '已隐藏「导航课程」' : '已显示「导航课程」' },
                      )
                    }
                    ariaLabel="显示导航课程开关"
                  />
                </div>
              </md-list-item>

              {/* 浮动按钮区简介：把「容器」讲清楚，避免用户以为是两套东西 */}
              <md-list-item type="text" className="rounded-outer-bottom">
                <div slot="start" className="list-icon-badge">
                  <MdIcon name="widgets" />
                </div>
                <div slot="headline">主页浮动按钮区</div>
                <div className="list-inline-texts" slot="supporting-text">
                  <span>左边：筛选课程（常驻）· 右边：导航课程 / 回到今天</span>
                  <span>按钮贴底栏上沿排布，自动避开安全区与底栏，不与底栏重叠</span>
                </div>
              </md-list-item>
            </div>

            {show('edit') ? <SectionHeader icon="edit_calendar" title="课表编辑" /> : null}
            <div className="list-group" style={show('edit') ? undefined : { display: 'none' }}>
              {/* 作者 2026-09-29：把主页上那几颗「编辑类」入口整体搬到这里 ——
                  主页只留看课表，编辑相关的集中一处。导入 / 日历是主页的局部弹层，
                  所以通过 AppState 的 uiCommand 请主页代劳，并顺手切回课表页。 */}
              <md-list-item
                type="button"
                className="rounded-outer-top"
                onClick={() => {
                  haptic('select');
                  selectTab('schedule');
                  requestUiCommand('openScheduleImport');
                }}
              >
                <div slot="start" className="list-icon-badge">
                  <MdIcon name="edit" />
                </div>
                <div slot="headline">课表数据与导入</div>
                <div className="list-inline-texts" slot="supporting-text">
                  <span>导入 HTML / JSON 课表文件、粘贴文本、本地缓存快照与恢复内置</span>
                  <span>原「主页右上角铅笔」入口，2026-09-29 起集中到本板块</span>
                </div>
                <MdIcon slot="end" name="chevron_right" />
              </md-list-item>

              <md-list-item
                type="button"
                className="rounded-middle"
                onClick={() => {
                  haptic('select');
                  nav.push('textbookList', {}, 'slide');
                }}
              >
                <div slot="start" className="list-icon-badge">
                  <MdIcon name="menu_book" />
                </div>
                <div slot="headline">查看教材</div>
                <div className="list-inline-texts" slot="supporting-text">
                  <span>按课程看「课堂要带的书」，可识别封面或手动填写</span>
                  <span>原「主页右上角书本」入口</span>
                </div>
                <MdIcon slot="end" name="chevron_right" />
              </md-list-item>

              <md-list-item
                type="button"
                className="rounded-middle"
                onClick={() => {
                  haptic('select');
                  selectTab('schedule');
                  requestUiCommand('calendarAdd');
                }}
              >
                <div slot="start" className="list-icon-badge">
                  <MdIcon name="event_available" />
                </div>
                <div slot="headline">添加到系统日程</div>
                <div className="list-inline-texts" slot="supporting-text">
                  <span>把整学期课表写进系统日历（每条带「来自多分课表」标记）</span>
                  <span>原「主页课表上方那颗绿色按钮」</span>
                </div>
                <MdIcon slot="end" name="chevron_right" />
              </md-list-item>

              <md-list-item
                type="button"
                className="rounded-outer-bottom"
                onClick={() => {
                  haptic('select');
                  selectTab('schedule');
                  requestUiCommand('calendarRemove');
                }}
              >
                <div slot="start" className="list-icon-badge">
                  <MdIcon name="event_busy" />
                </div>
                <div slot="headline">清除本 App 写入的日程</div>
                <div className="list-inline-texts" slot="supporting-text">
                  <span>只删带「来自多分课表」标记的日程，手动添加的不受影响</span>
                  <span>原「主页课表上方那颗小图标」</span>
                </div>
                <MdIcon slot="end" name="chevron_right" />
              </md-list-item>
            </div>

            {show('about') ? <SectionHeader icon="info" title="关于" /> : null}
            <div className="list-group" style={show('about') ? undefined : { display: 'none' }}>
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

          <div className="mt-16" style={show('about') ? undefined : { display: 'none' }}>
            {show('about') ? <SectionHeader icon="palette" title="动态取色" /> : null}
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

      

      

      {/* 底栏色散原来的弹层已删除：它现在是一屏（见上面的 atOption('dispersion')），
          留着就是一份"看起来还在用"的死代码。 */}






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
