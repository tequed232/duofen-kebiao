/**
 * 关于 (About) - 多分课表
 *
 * 应用信息、Material 3 Expressive 设计说明、数据存储说明、致谢 · 名片墙与
 * GitHub 链接都集中在这里（设置页只留一个入口）。
 */
import { useState } from 'react';
import { SectionHeader, TopAppBar } from '../components/layout';
import { MdIcon } from '../components/md';
import { GlassMark } from '../components/glass';
import { useAppState } from '../state/AppState';
import { useNav } from '../nav/navigation';
import { CREDITS, GLASS_LIBS, GITHUB_URL, APP_NAME, APP_VERSION, type CreditLicense, type CreditPerson } from '../lib/meta';
import { PlatformMark } from '../components/brands';

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
    body: '记录、设置、课表与教材都存在本机浏览器（IndexedDB），不上传服务器；内置课表已清空（原数据含教师姓名、教室与班级人数等个人信息），课表由你自行导入或手动填写。Tequed232 拥有本项目的最终解释权。',
  },
];

/** 名片头像：加载失败（断网 / 头像被删 / 改名）就退回姓名首字，不留白块。 */
function CreditAvatar({ person }: { person: CreditPerson }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className={person.tone === 'tertiary' ? 'credit-mark tertiary' : 'credit-mark'}>
      {person.mark}
      {failed ? null : (
        <img
          className="credit-avatar"
          src={person.avatar}
          alt=""
          loading="lazy"
          onError={() => setFailed(true)}
        />
      )}
    </span>
  );
}

/**
 * 名片墙是 3 列：最后一行不满时，让最后一张跨列补满。
 * 例：其余 5 人 → 3 + 2，第 5 张跨 2 列；4 人 → 第 4 张跨 3 列；整除则不跨。
 */
function creditSpan(person: CreditPerson, people: CreditPerson[]): number {
  const others = people.filter((entry) => !entry.lead);
  const remainder = others.length % 3;
  if (remainder === 0 || others[others.length - 1] !== person) return 1;
  return 4 - remainder;
}

/** 作品授权标记（权利人给的许可）：有凭据截图的就能点开原图，没有的只显示标记。 */
function CreditLicenseMark({ license }: { license: CreditLicense }) {
  const { evidence, label, note } = license;
  const body = (
    <>
      <PlatformMark brand="cc" />
      {label}
    </>
  );
  if (!evidence) {
    return (
      <span className="credit-license" title={note}>
        {body}
      </span>
    );
  }
  return (
    <button
      type="button"
      className="credit-license"
      title={note}
      onClick={() => window.open(evidence, '_blank', 'noopener,noreferrer')}
    >
      {body}
    </button>
  );
}

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
                名片墙上的平台剪影（GitHub / Bilibili / 抖音 / X / CC）来自 Remix Icon（Apache-2.0），
                字体为 Roboto。除此之外只有「致谢 · 名片墙」上各人的公开头像，项目不包含任何第三方插画或字体素材。
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
          <SectionHeader icon="volunteer_activism" title="致谢 · 名片墙" />
          <div className="md-body-small muted">
            感谢每一位让「{APP_NAME}」变得更好的人。点名片下方的按钮直达对方主页。
          </div>
          <div className="credits-wall mt-12">
            {CREDITS.map((person) => (
              <div
                className={person.lead ? 'credit-card lead' : 'credit-card'}
                key={person.displayName}
                style={person.lead ? undefined : { gridColumn: `span ${creditSpan(person, CREDITS)}` }}
              >
                <div className="credit-head">
                  <CreditAvatar person={person} />
                  <span className="credit-who">
                    <span className="row gap-8 credit-name-row">
                      <span className={person.lead ? 'md-title-medium-emphasized' : 'md-title-small-emphasized'}>
                        {person.displayName}
                      </span>
                      {person.badge ? (
                        <span className={person.lead ? 'credit-badge' : 'credit-badge soft'}>{person.badge}</span>
                      ) : null}
                    </span>
                    <span className="md-body-small muted">{person.role}</span>
                  </span>
                </div>
                {person.license ? <CreditLicenseMark license={person.license} /> : null}
                <div className="credit-links">
                  {person.links.map((link) => {
                    /* 其余名片 ≥2 个平台就只留剪影（一行放得下）；单平台的、以及够宽的作者卡保留文字按钮 */
                    const compact = !person.lead && person.links.length > 1;
                    return (
                      <button
                        key={link.url}
                        type="button"
                        className={compact ? 'credit-link icon-only' : 'credit-link'}
                        title={`${link.label} · ${link.url}`}
                        aria-label={link.label}
                        onClick={() => window.open(link.url, '_blank', 'noopener,noreferrer')}
                      >
                        <PlatformMark brand={link.platform} size={compact ? 14 : 12} />
                        {compact ? null : link.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          <div className="md-body-small muted mt-8">
            名片按「作者 + 特别感谢的朋友们」排列；头像取自各人在 GitHub / B 站等平台的公开头像（已登记授权台账），
            加载失败时自动退回姓名首字。带 <b>CC</b> 标记的是权利人给出的作品许可，点开可看授权原文。
          </div>
        </div>

        <div className="mt-16">
          <SectionHeader icon="inventory_2" title="开源相关" />
          <div className="about-note">
            <div className="md-body-small muted">
              本项目引入的全部开源依赖（名称 / 版本 / 许可 / 版权·开发者）已按用途分类，
              见 设置 → 开源相关；README 中也有同样的清单。感谢每一位作者与维护者。
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
          课表数据来自教务系统导出的课表文件，由导入功能解析后保存在本机；教材信息可在课程详情里选图识别或手动修改。
          本应用不含第三方插画素材：视觉元素来自 Material 3 Expressive 形状、Material Symbols Rounded 图标与 Roboto 字体，
          图片只有致谢名片墙上各人自己的公开头像。
        </div>
      </div>
    </div>
  );
}
