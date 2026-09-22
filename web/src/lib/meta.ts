/** 应用元信息：名称、版本、外部链接（改名时只需要改这里）。 */

// 名片墙头像：由 Vite 打包成带哈希的相对路径，网页版与 APK 内嵌资源都能解析。
// 来源与登记见 docs/asset-permissions.md（各平台公开头像）。
import avatarBinggan from '../assets/avatars/binggan-bskeke.jpg';
import avatarChunqiu from '../assets/avatars/chunqiu-fxxggllj.jpg';
import avatarHanbing from '../assets/avatars/hanbing-bili.webp';
import avatarLuo from '../assets/avatars/luo-tequed232.jpg';
import avatarMidada from '../assets/avatars/midada-bili.webp';
import avatarWeizhou from '../assets/avatars/weizhou-whitemoon319.jpg';

export const APP_NAME = '多分课表';
export const APP_SHORT_NAME = '多分';
export const APP_VERSION = 'v3.0.0';
export const GITHUB_URL = 'https://github.com/tequed232/duofen-kebiao';
export const COPYRIGHT = 'Tequed232 拥有本项目的最终解释权';

/**
 * 贡献者名册 —— 关于页「致谢 · 名片墙」逐张渲染。
 *
 * 排列固定为「作者本人 1×3（整行）+ 其余 2×3 或补位」；头像取自各人在 GitHub / B 站的公开头像
 * （已按仓库规则登记在 docs/asset-permissions.md），加载失败时自动退回姓名首字。
 * 改人名 / 加链接只改这里；README 与 CONTRIBUTORS.md 的名单要保持同一口径。
 */
export interface CreditLink {
  /** 平台，决定按钮上的剪影图标 */
  platform: 'github' | 'bilibili' | 'douyin' | 'x';
  label: string;
  url: string;
}

export interface CreditLicense {
  /** 许可标记文字，例如 'CC BY' / 'CC BY-NC' */
  label: string;
  /** 授权凭据（截图）地址；有值则标记可点，点开就是凭据原图 */
  evidence?: string;
  /** 补充说明（悬停提示），例如「禁止商用」 */
  note?: string;
}

export interface CreditPerson {
  /**
   * 显示名。字段故意不叫 name：scripts/subset-icons.mjs 会把源码（含注释）里
   * “键名 name / icon + 小写字符串值”的形状当成动态引用的图标名收进图标子集，
   * 于是 liuli1719 这类用户名会让 check-icons 直接报错、构建失败。
   */
  displayName: string;
  /** 副标题：角色或常用别名 */
  role: string;
  /** 姓名首字：头像加载失败时的兜底，也是无图环境的显示 */
  mark: string;
  /** 名字旁的小徽标（作者「项目作者」、顾问「该项目顾问」…），窄卡片上会自动换行到名字下方 */
  badge?: string;
  /** 各平台公开头像（已登记在 docs/asset-permissions.md） */
  avatar: string;
  /**
   * 跨列数（名片墙是 3 列网格）：作者 3 列（整行，高亮锚点卡）、画师 2 列，
   * 其余不写＝1 列。宽卡（≥2）把小组件放到头像右侧；排布要让每行刚好铺满。
   */
  span?: 2 | 3;
  /** 主要联系平台，决定首字底色；默认 primary-container，'tertiary' 给以 B 站为主的人 */
  tone?: 'tertiary';
  /** 作品授权标记（权利人自己给出的许可） */
  license?: CreditLicense;
  links: CreditLink[];
}

/** 寒冰的授权凭据截图（web/public/permissions/，相对文档路径：Pages 与 APK 内嵌资源都能解析） */
export const PERMISSION_HANBING_CC_BY = './permissions/hanbing-cc-by.jpg';

export const CREDITS: CreditPerson[] = [
  {
    displayName: '罗xx',
    role: '项目发起 · 界面动效 · 数据与部署',
    mark: '罗',
    avatar: avatarLuo,
    span: 3,
    badge: '项目作者',
    links: [
      { platform: 'github', label: 'GitHub', url: 'https://github.com/tequed232' },
      { platform: 'bilibili', label: 'Bilibili', url: 'https://space.bilibili.com/407275151' },
      {
        platform: 'douyin',
        label: '抖音',
        url: 'https://www.douyin.com/user/MS4wLjABAAAAj-LAgjc_F9yWFAa3YycsNF9f_E1M3JiLa5ilAzSTn9hJs_44MtP_mM_2DbyLH06F',
      },
    ],
  },
  {
    displayName: 'Hanbing',
    role: '主美画师 · 同学',
    mark: 'H',
    avatar: avatarHanbing,
    tone: 'tertiary',
    span: 2,
    license: {
      label: 'CC BY',
      evidence: PERMISSION_HANBING_CC_BY,
      note: '权利人授权：署名使用，不允许任何形式的 AI 修改（点开看授权原文）',
    },
    links: [
      { platform: 'bilibili', label: 'Bilibili', url: 'https://b23.tv/0rKu2FX' },
      {
        platform: 'douyin',
        label: '抖音',
        url: 'https://www.douyin.com/user/MS4wLjABAAAAGRTiaZQLJDMyV1w46jDo9tTOIwgsnoGNofUwMh6VS3Y_orxre8OQmuztrvZdlEu9',
      },
    ],
  },
  {
    displayName: '饼干',
    role: '翻译 · 同学',
    mark: '饼',
    avatar: avatarBinggan,
    links: [
      { platform: 'github', label: 'GitHub', url: 'https://github.com/BS-keke' },
      { platform: 'bilibili', label: 'Bilibili', url: 'https://space.bilibili.com/449528062' },
    ],
  },
  {
    displayName: '维舟',
    role: 'MAA-Meow',
    mark: '维',
    avatar: avatarWeizhou,
    badge: '该项目顾问',
    links: [{ platform: 'github', label: 'GitHub', url: 'https://github.com/WhiteMoon319' }],
  },
  {
    displayName: '米达达',
    role: '表情包引用',
    mark: '米',
    avatar: avatarMidada,
    tone: 'tertiary',
    license: {
      label: 'CC BY-NC',
      note: '权利人授权：署名 + 禁止商用',
    },
    links: [
      { platform: 'bilibili', label: 'Bilibili', url: 'https://space.bilibili.com/3546769371695776' },
      { platform: 'x', label: 'X', url: 'https://x.com/miratsu169' },
    ],
  },
  {
    displayName: '椿湫',
    role: '导师',
    mark: '椿',
    avatar: avatarChunqiu,
    links: [{ platform: 'github', label: 'GitHub', url: 'https://github.com/fxxggllj' }],
  },
];

/**
 * Liquid Glass 视觉实现所参考的开源库（GitHub）。
 * 项目按需自绘玻璃层，不直接嵌入这些库的代码或素材，但在「关于」与 README 中明确引用致谢。
 */
export const GLASS_LIBS: { name: string; url: string; stars: string; note: string }[] = [
  {
    name: 'rdev/liquid-glass-react',
    url: 'https://github.com/rdev/liquid-glass-react',
    stars: '6.2k',
    note: 'Apple 风格 Liquid Glass 的 React 实现：SVG 位移折射 + 鼠标跟随高光',
  },
  {
    name: 'AndrewPrifer/liquid-dom',
    url: 'https://github.com/AndrewPrifer/liquid-dom',
    stars: '2.5k',
    note: '面向 Web 的 Liquid Glass：对实时 DOM 做玻璃透镜折射，框架无关',
  },
  {
    name: 'shuding/liquid-glass',
    url: 'https://github.com/shuding/liquid-glass',
    stars: '1.2k',
    note: '可复制的 Liquid Glass 着色器（SVG + Canvas），底边栏玻璃层的思路来源',
  },
];

/** 引入的模块（依赖）——关于页逐条致谢 */
export const MODULES: { title: string; url: string; note: string }[] = [
  { title: 'material-web', url: 'https://github.com/material-components/material-web', note: 'Material 3 组件（按钮/输入/导航/对话框…）' },
  { title: 'material-color-utilities', url: 'https://github.com/material-foundation/material-color-utilities', note: '动态配色（SchemeExpressive）' },
  { title: 'material-symbols', url: 'https://github.com/marella/material-symbols', note: 'Material Symbols Rounded 图标字体（按需裁剪子集）' },
  { title: 'react', url: 'https://github.com/facebook/react', note: '界面框架（19）' },
  { title: 'vite', url: 'https://github.com/vitejs/vite', note: '构建与开发服务器' },
  { title: 'typescript', url: 'https://github.com/microsoft/TypeScript', note: '类型系统' },
  { title: 'playwright', url: 'https://github.com/microsoft/playwright', note: '自动化验收（91 步）与视觉校验' },
  { title: 'fontkit', url: 'https://github.com/foliojs/fontkit', note: '图标字体子集化' },
  { title: 'subset-font', url: 'https://github.com/papandreou/subset-font', note: '生成裁剪后的 woff2' },
  { title: 'liquid-glass-react', url: 'https://github.com/rdev/liquid-glass-react', note: '液态玻璃折射的参考实现（当前底边栏为等价自绘）' },
  { title: 'liquid-dom', url: 'https://github.com/AndrewPrifer/liquid-dom', note: 'Web 端玻璃透镜折射参考' },
  { title: 'shuding/liquid-glass', url: 'https://github.com/shuding/liquid-glass', note: 'SVG 着色器思路参考' },
  { title: 'anubis', url: 'https://github.com/TecharoHQ/anubis', note: '反爬防火墙（deploy/anubis 配置与监控）' },
  { title: 'androidx.webkit', url: 'https://github.com/androidx/androidx', note: 'WebViewAssetLoader（APK 以 https 源加载同一份 Web 构建）' },
  { title: 'Roboto', url: 'https://github.com/googlefonts/roboto', note: '界面字体' },
];
