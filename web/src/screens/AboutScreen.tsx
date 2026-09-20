/**
 * 关于 (About) - 多分课表
 *
 * 应用信息、Material 3 Expressive 设计说明、数据存储说明、美术资源致谢与
 * GitHub 链接都集中在这里（设置页只留一个入口）。
 */
import { useState } from 'react';
import { SectionHeader, TopAppBar } from '../components/layout';
import { MdIcon } from '../components/md';
import { MeowArt } from '../components/meow';
import { useAppState } from '../state/AppState';
import { useNav } from '../nav/navigation';
import { ART_CREDITS, GITHUB_URL, APP_NAME, APP_VERSION } from '../lib/meta';

const DESIGN_NOTES: { icon: string; title: string; body: string }[] = [
  {
    icon: 'palette',
    title: '动态配色（Material 3）',
    body: '能拿到系统/浏览器强调色时，用 material-color-utilities 的 SchemeExpressive 生成高对比度配色；否则使用 Green 备用方案。界面只引用 primary / surfaceContainer 等颜色角色，没有写死颜色值。',
  },
  {
    icon: 'animation',
    title: 'MotionScheme.expressive() 动效',
    body: '解析求解 M3 Expressive 的物理弹簧（spatial 0.9 / effects 1.0 阻尼比，stiffness 1400·700·300 与 3800·1600·800），生成 CSS linear() 缓动与时长；页面切换统一为「浮动」过渡，返回时反向播放。',
  },
  {
    icon: 'widgets',
    title: '组件与形状',
    body: '按钮、输入框、开关、滑块、导航栏、卡片、对话框、菜单、列表项、FAB 等一律使用 Material Web 标准组件；圆角沿用 M3 Expressive 默认值（按钮胶囊、卡片 20dp、对话框 28dp）。',
  },
  {
    icon: 'font_download',
    title: '字体与图标',
    body: 'Roboto 自托管；Material Symbols Rounded 由 5.2MB 变量字体按用到的图标裁剪成约 94KB 子集（保留 FILL/GRAD/opsz/wght 轴）。',
  },
  {
    icon: 'storage',
    title: '数据与隐私',
    body: '记录、设置、课表与教材都存在本机浏览器（IndexedDB），不上传服务器；课表由脚本从教务系统导出的 .doc/.rtf 解析后内嵌，署名统一为「广东财贸信创3班版权所有」。',
  },
];

export default function AboutScreen() {
  const nav = useNav();
  const { records, schedule, seed, dynamicColor, textbooks } = useAppState();
  const textbookCount = Object.values(textbooks).filter((book) => book.title).length;
  /** 设计说明默认折叠：微信里也能一屏看完，想看再点开 */
  const [openNote, setOpenNote] = useState<string | null>(null);

  return (
    <div className="screen-inner">
      <TopAppBar title="关于" onBack={() => nav.pop()} backLabel="返回设置" />

      <div className="screen-content">
        <div className="about-hero">
          <div className="about-mark">
            <MdIcon name="calendar_month" size={34} />
          </div>
          <div className="col" style={{ gap: 2 }}>
            <span className="md-headline-small-emphasized">{APP_NAME}</span>
            <span className="md-body-small muted">
              {APP_VERSION} · Material 3 Expressive Web 应用
            </span>
          </div>
        </div>

        <div className="col gap-8 mt-16">
          <div className="row gap-8">
            <MdIcon name="calendar_month" size={18} />
            <span className="md-body-medium flex-1">
              课表：{schedule.term} · {schedule.periods.length} 节次 ·{' '}
              {schedule.periods.reduce((total, period) => total + period.days.reduce((sum, day) => sum + day.length, 0), 0)} 门课
              · 已识别教材 {textbookCount} 本
            </span>
          </div>
          <div className="row gap-8">
            <MdIcon name="photo_library" size={18} />
            <span className="md-body-medium flex-1">本机记录：{records.length} 条</span>
          </div>
          <div className="row gap-8">
            <MdIcon name="colorize" size={18} />
            <span className="md-body-medium flex-1">
              {dynamicColor
                ? `动态配色：使用系统强调色（种子 ${seed.seed}，来源 ${seed.origin}）`
                : `动态配色：未获取到强调色，使用备用 Green 主题（种子 ${seed.seed}）`}
            </span>
          </div>
        </div>

        <div className="mt-16">
          <SectionHeader icon="design_services" title="Material 3 设计说明" />
          <div className="col gap-12">
            {DESIGN_NOTES.map((note) => (
              <div className="about-note" key={note.title}>
                <div className="row gap-8">
                  <MdIcon name={note.icon} size={18} />
                  <span className="md-title-small-emphasized">{note.title}</span>
                </div>
                <div className="md-body-small muted mt-4">{note.body}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-16">
          <SectionHeader icon="volunteer_activism" title="致谢" />
          {ART_CREDITS.map((credit) => (
            <div className="about-note" key={credit.url}>
              <div className="row gap-8">
                <MdIcon name="palette" size={18} />
                <span className="md-title-small-emphasized flex-1">{credit.label}</span>
              </div>
              <div className="md-body-small muted mt-4">{credit.note}</div>
              {credit.url.includes('18112887') ? (
                <MeowArt className="about-art" alt="广东财贸职业学院 官方教材呈现（美术资源）" />
              ) : null}
              <div className="row gap-8 mt-8" style={{ flexWrap: 'wrap' }}>
                <md-filled-tonal-button
                  className="btn-s"
                  onClick={() => window.open(credit.url, '_blank', 'noopener,noreferrer')}
                >
                  <MdIcon slot="icon" name="open_in_new" />
                  打开空间
                </md-filled-tonal-button>
                <span className="md-body-small muted">{credit.url}</span>
              </div>
            </div>
          ))}

          <div className="about-note mt-12">
            <div className="row gap-8">
              <MdIcon name="code" size={18} />
              <span className="md-title-small-emphasized flex-1">开源项目</span>
            </div>
            <div className="md-body-small muted mt-4">
              源码、构建产物与更新记录都在 GitHub 上；Web 版由 GitHub Pages 托管。
              底边栏的液态玻璃效果参考并引入了 
              <a className="md-link" href="https://github.com/rdev/liquid-glass-react" target="_blank" rel="noopener noreferrer">
                rdev/liquid-glass-react
              </a>
              （当前底边栏使用等价的自绘实现，见仓库说明）。
            </div>
            <div className="row gap-8 mt-8" style={{ flexWrap: 'wrap' }}>
              <md-filled-button
                className="btn-s"
                onClick={() => window.open(GITHUB_URL, '_blank', 'noopener,noreferrer')}
              >
                <MdIcon slot="icon" name="open_in_new" />
                打开 GitHub
              </md-filled-button>
              <span className="md-body-small muted">{GITHUB_URL}</span>
            </div>
          </div>
        </div>

        <div className="md-body-small muted mt-16 mb-16">
          课表数据来源：教务系统导出的「学生课表.doc」，由 scripts/import-schedule.mjs 解析后内嵌；
          教材信息由 12 张教材封面照片整理，可在课程详情里拍照识别或手动修改。
        </div>
      </div>
    </div>
  );
}
