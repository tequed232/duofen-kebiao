/**
 * 关于 (About) - 多分课表
 *
 * 应用信息、Material 3 Expressive 设计说明、数据存储说明、美术资源致谢与
 * GitHub 链接都集中在这里（设置页只留一个入口）。
 */
import { useState } from 'react';
import { SectionHeader, TopAppBar } from '../components/layout';
import { MdIcon } from '../components/md';
import { GlassMark } from '../components/glass';
import { useAppState } from '../state/AppState';
import { useNav } from '../nav/navigation';
import { ART_CREDITS, GLASS_LIBS, GITHUB_URL, APP_NAME, APP_VERSION } from '../lib/meta';

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
          <SectionHeader icon="blur_on" title="视觉与图标" />
          <div className="about-note">
            <div className="row gap-8">
              <MdIcon name="shapes" size={18} />
              <span className="md-body-small muted flex-1">
                界面里的装饰元素全部来自 Material 3 Expressive 自带的形状语汇（cookie / clover / burst /
                sunny / pill），颜色一律取 --md-sys-color-* 角色；图标为 Material Symbols Rounded 子集，
                字体为 Roboto。项目不包含任何第三方插画、照片或字体素材。
              </span>
            </div>
            <div className="row gap-12 mt-12" style={{ alignItems: 'center', justifyContent: 'center' }}>
              <GlassMark size={96} />
            </div>
            <div className="md-body-small muted mt-8">
              应用标识与底边栏采用 Liquid Glass 质感（半透明玻璃药丸 + 冰彩渐变），由项目自行以矢量方式绘制，
              不包含任何外部图片素材；配色仍取自 M3 颜色角色。
            </div>
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
        </div>

        <div className="mt-16">
          <SectionHeader icon="gavel" title="关于此前使用他人美术素材的致歉" />
          <div className="about-note">
            <div className="md-body-small muted">
              本项目的早期版本曾在界面、开屏页与安装图标中使用了来自 Bilibili 创作者（空间 18112887）的插画，
              以及一张学校教材宣传图，事前未取得作者授权，也未标明出处，对此我们深表歉意。
              这些素材已于 <strong>v1.0.9</strong> 全部移除：Web 端不再引用任何图片文件，
              Android 图标改用 Material Symbols 与 Material 3 Expressive 形状重新绘制。
              若权利人认为仍有需要处理的内容，请通过仓库 Issue 联系我们，我们会第一时间删除或补办授权。
            </div>
          </div>
        </div>

        <div className="mt-16">
          <SectionHeader icon="deployed_code" title="引入的模块（致谢）" />
          <div className="about-note">
            <div className="md-body-small muted">
              本项目站在这些开源项目之上，特此致谢（均为公开发布的库，未修改其源码）：
            </div>
            <div className="col gap-4 mt-8">
              {MODULES.map((item) => (
                <div className="row gap-8" key={item.title}>
                  <MdIcon name="extension" size={16} />
                  <a className="md-link md-body-small" href={item.url} target="_blank" rel="noopener noreferrer">
                    {item.title}
                  </a>
                  <span className="md-body-small muted flex-1">{item.note}</span>
                </div>
              ))}
            </div>
          </div>

          <SectionHeader icon="code" title="开源项目" />
          <div className="about-note">
            <div className="row gap-8">
              <MdIcon name="code" size={18} />
              <span className="md-title-small-emphasized flex-1">源码与构建产物</span>
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
          课表数据来自教务系统导出的课表文件，由导入功能解析后保存在本机；教材信息可在课程详情里拍照识别或手动修改。
          本应用不含任何第三方图片素材：视觉元素来自 Material 3 Expressive 形状、Material Symbols Rounded 图标与 Roboto 字体。
        </div>
      </div>
    </div>
  );
}
