/** 应用元信息：名称、版本、外部链接（改名时只需要改这里）。 */

export const APP_NAME = '多分课表';
export const APP_SHORT_NAME = '多分';
export const APP_VERSION = 'v1.0.13';
export const GITHUB_URL = 'https://github.com/tequed232/duofen-kebiao';
export const COPYRIGHT = '广东财贸信创3班版权所有';

/** 致谢（第三方美术素材已全部下架，只保留作者本人空间） */
export const ART_CREDITS: { label: string; url: string; note: string }[] = [
  {
    label: '作者 Bilibili 空间',
    url: 'https://space.bilibili.com/407275151',
    note: '项目作者的个人空间，欢迎来玩',
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
