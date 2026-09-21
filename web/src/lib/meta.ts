/** 应用元信息：名称、版本、外部链接（改名时只需要改这里）。 */

export const APP_NAME = '多分课表';
export const APP_SHORT_NAME = '多分';
export const APP_VERSION = 'enhance 1.5';
export const GITHUB_URL = 'https://github.com/tequed232/duofen-kebiao';
export const COPYRIGHT = 'Tequed232 拥有本项目的最终解释权';

/** 致谢（第三方美术素材已全部下架，只保留作者本人空间与特别感谢的人） */
export const ART_CREDITS: { label: string; url: string; note: string }[] = [
  {
    label: '作者 Bilibili 空间',
    url: 'https://space.bilibili.com/407275151',
    note: '项目作者的个人空间，欢迎来玩',
  },
  {
    label: '特别感谢 米达达',
    url: 'https://space.bilibili.com/3546769371695776',
    note: '感谢米达达对本项目的帮助与支持，点下面的按钮去 TA 的 B 站空间看看',
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
