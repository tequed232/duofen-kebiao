/**
 * 收集本项目的开源依赖（名称 / 版本 / 许可证 / 版权与开发者），按用途分门别类，
 * 生成：
 *   1. web/src/data/licenses.ts  —— 设置里「开源相关」页面的数据
 *   2. README.md 的 <!-- LICENSES:BEGIN --> … <!-- LICENSES:END --> 区块
 *
 * 样式对齐酷安《开源相关》：每条显示 名称+版本、许可、版权/开发者。
 *
 * Usage:
 *   node scripts/collect-licenses.mjs            # 生成并写回两个文件
 *   node scripts/collect-licenses.mjs --check    # 只校验：署名清单与依赖不一致就非零退出（CI 用）
 *
 * 为什么要 --check：本地封面识别引入 `@techstark/opencv-js` 与 `tesseract.js`（都是 Apache-2.0）时，
 * 功能上了但**署名清单没同步** —— README 与设置页「开源相关」都缺这两条署名，
 * 而没有任何东西会因此报错。有了 --check，这类「加了依赖忘署名」会在 PR 的守卫表里直接变红。
 *
 * 注意：README 的 BEGIN/END 之间是**整块重写**的，任何手工内容都会被下次生成覆盖 ——
 * 别往标记里写东西（「声明」原先在里面，就被吃掉过）。
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

/** --check：只比对不写盘，用于 CI */
const CHECK = process.argv.includes('--check');
/** 收集到的「已过期」目标，最后统一报出来 */
const stale = [];

/** 分类规则：命中即归入该类（顺序即优先级） */
const CATEGORIES = [
  {
    id: 'ui',
    title: '界面与组件',
    note: '界面框架与 Material 3 组件',
    match: [/^react$/, /^react-dom$/, /^@material\/web$/, /^@material\/web-/, /^liquid-glass-react$/],
  },
  {
    id: 'design',
    title: '设计系统 · 图标 · 字体',
    note: '配色算法、图标字体与字体裁剪',
    match: [/material-color-utilities/, /^material-symbols$/, /^@fontsource\//, /^fontkit$/, /^subset-font$/],
  },
  {
    id: 'build',
    title: '构建与开发工具',
    note: '打包、类型与样式处理',
    match: [/^vite$/, /^@vitejs\//, /^typescript$/, /^esbuild$/, /^postcss$/, /^autoprefixer$/, /^tailwindcss$/, /^rollup$/, /^terser$/],
  },
  {
    id: 'test',
    title: '测试与验证',
    note: '自动化验收与逐屏视觉校验',
    match: [/^playwright$/, /^@playwright\//, /^pixelmatch$/],
  },
  {
    id: 'android',
    title: 'Android 运行时',
    note: 'APK（WebView 宿主）用到的库',
    match: [/^androidx/],
  },
  {
    id: 'infra',
    title: '部署与安全',
    note: '反爬、CDN 与持续监控',
    match: [/anubis/, /cloudflare/, /wrangler/],
  },
];

/** 非 npm 来源（Android / 自带字体 / 外部参考实现），手工登记 */
const EXTRA = [
  {
    category: 'android',
    title: 'androidx.core:core-ktx',
    version: '1.15.0',
    license: 'Apache License 2.0',
    holder: 'The Android Open Source Project',
    url: 'https://developer.android.com/jetpack/androidx',
  },
  {
    category: 'android',
    title: 'androidx.activity:activity-ktx',
    version: '1.10.0',
    license: 'Apache License 2.0',
    holder: 'The Android Open Source Project',
    url: 'https://developer.android.com/jetpack/androidx/releases/activity',
  },
  {
    category: 'android',
    title: 'androidx.webkit:webkit',
    version: '1.12.1',
    license: 'Apache License 2.0',
    holder: 'The Android Open Source Project',
    url: 'https://developer.android.com/jetpack/androidx/releases/webkit',
  },
  {
    category: 'android',
    title: 'Kotlin Standard Library',
    version: '2.0.x',
    license: 'Apache License 2.0',
    holder: 'JetBrains',
    url: 'https://kotlinlang.org',
  },
  {
    category: 'design',
    title: 'Roboto',
    version: 'variable',
    license: 'Apache License 2.0',
    holder: 'Google Fonts',
    url: 'https://fonts.google.com/specimen/Roboto',
  },
  {
    category: 'infra',
    title: 'Anubis',
    version: 'v1.27.0（deploy/anubis 锁定）',
    license: 'MIT License',
    holder: 'TecharoHQ',
    url: 'https://github.com/TecharoHQ/anubis',
    note: '反爬防火墙：配置文件与监控工作流在 deploy/anubis/',
  },
  {
    category: 'infra',
    title: 'Cloudflare CDN / Pages',
    version: '—',
    license: '商业服务（配置见 deploy/cloudflare）',
    holder: 'Cloudflare, Inc.',
    url: 'https://www.cloudflare.com',
    note: '可选的边缘缓存与 Pages 托管说明',
  },
];

/** 参考实现（学习对象，未引入代码） */
const REFERENCES = [
  {
    title: 'AndroidLiquidGlass',
    version: '—',
    license: 'Apache License 2.0',
    holder: 'Kyant0',
    url: 'https://github.com/Kyant0/AndroidLiquidGlass',
    note: '酷安底边栏液体玻璃的实现（本项目仅参考其思路：背景采样 + 色调 + 边缘渐隐 + 触摸光斑）',
  },
  {
    title: 'Shapes',
    version: '—',
    license: 'Apache License 2.0',
    holder: 'Kyant',
    url: 'https://github.com/Kyant0/AndroidLiquidGlass',
    note: '酷安使用的形状库（胶囊/圆角）',
  },
  {
    title: 'free_reflection',
    version: '2.0.0',
    license: '未提供许可信息',
    holder: 'weishu',
    url: 'https://github.com/tiann/FreeReflection',
    note: '酷安用于反射调用隐藏 API',
  },
  {
    title: 'liquid-glass-react',
    version: '1.1.1',
    license: 'MIT License',
    holder: 'rdev',
    url: 'https://github.com/rdev/liquid-glass-react',
    note: 'Apple 风格 Liquid Glass 的 React 实现（已装依赖，当前底边栏为自绘）',
  },
  {
    title: 'liquid-dom',
    version: '—',
    license: 'MIT License',
    holder: 'Andrew Prifer',
    url: 'https://github.com/AndrewPrifer/liquid-dom',
    note: 'Web 端玻璃透镜折射参考',
  },
  {
    title: 'shuding/liquid-glass',
    version: '—',
    license: 'MIT License',
    holder: 'Shu Ding',
    url: 'https://github.com/shuding/liquid-glass',
    note: 'SVG + Canvas 玻璃着色器参考',
  },
];

/** 去掉邮箱与主页链接，只保留人名（隐私要求） */
function sanitizeHolder(value) {
  return String(value ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, ' ')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const pkg = JSON.parse(await readFile('package.json', 'utf8'));
const names = Object.keys({ ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) }).sort();

const entries = [];
for (const name of names) {
  let meta = {};
  try {
    meta = JSON.parse(await readFile(path.join('node_modules', name, 'package.json'), 'utf8'));
  } catch {
    /* 未安装则跳过 */
  }
  const license =
    typeof meta.license === 'string'
      ? meta.license
      : meta.license?.type ?? (Array.isArray(meta.licenses) ? meta.licenses.map((item) => item.type).join(' / ') : '未提供许可信息');
  const holder =
    sanitizeHolder(
      (typeof meta.author === 'string' ? meta.author : meta.author?.name) ??
        (Array.isArray(meta.contributors) ? meta.contributors[0]?.name : undefined),
    ) || '未提供版权方信息';
  const category = CATEGORIES.find((item) => item.match.some((re) => re.test(name)))?.id ?? 'other';
  entries.push({
    category,
    title: name,
    version: meta.version ?? '—',
    license,
    holder,
    url: (meta.homepage ?? '').replace(/#.*$/, '') || `https://www.npmjs.com/package/${name}`,
  });
}

const all = [...entries, ...EXTRA];
const groups = CATEGORIES.map((category) => ({
  id: category.id,
  title: category.title,
  note: category.note,
  items: all.filter((item) => item.category === category.id).sort((a, b) => a.title.localeCompare(b.title)),
})).filter((group) => group.items.length);

const other = all.filter((item) => item.category === 'other');
if (other.length) {
  groups.push({ id: 'other', title: '其他', note: '未归类的依赖', items: other.sort((a, b) => a.title.localeCompare(b.title)) });
}

/* 1) 生成数据模块 */
const ts = `/* AUTO-GENERATED by scripts/collect-licenses.mjs - 请勿手改
   本项目的开源依赖清单（按用途分类，样式对齐酷安《开源相关》）。 */

export interface LicenseEntry {
  title: string;
  version: string;
  license: string;
  holder: string;
  url: string;
  note?: string;
  category?: string;
}

export interface LicenseGroup {
  id: string;
  title: string;
  note: string;
  items: LicenseEntry[];
}

export const LICENSE_GROUPS: LicenseGroup[] = ${JSON.stringify(groups, null, 2)};

/** 仅作参考、未引入代码的第三方实现 */
export const REFERENCE_LIBS: LicenseEntry[] = ${JSON.stringify(REFERENCES, null, 2)};
`;
if (CHECK) {
  const current = await readFile('web/src/data/licenses.ts', 'utf8').catch(() => '');
  if (current !== ts) stale.push('web/src/data/licenses.ts');
} else {
  await writeFile('web/src/data/licenses.ts', ts, 'utf8');
}

/* 2) 生成 README 区块 */
const lines = [];
lines.push('## 开源相关（Open source）');
lines.push('');
lines.push(`本项目共引入 **${all.length}** 个开源依赖，按用途分门别类列出（与设置里「关于 → 开源相关」一致）。`);
lines.push('感谢每一位作者与维护者。');
lines.push('');
lines.push('> 自动生成：修改依赖后运行 `node scripts/collect-licenses.mjs` 重新整理。');
lines.push('');
for (const group of groups) {
  lines.push(`### ${group.title}`);
  lines.push('');
  lines.push(`_${group.note}_`);
  lines.push('');
  lines.push('| 名称 | 版本 | 许可 | 版权 / 开发者 |');
  lines.push('| --- | --- | --- | --- |');
  for (const item of group.items) {
    lines.push(`| [${item.title}](${item.url}) | ${item.version} | ${item.license} | ${item.holder} |`);
  }
  lines.push('');
}
lines.push('### 参考实现（未引入代码）');
lines.push('');
lines.push('| 名称 | 版本 | 许可 | 版权 / 开发者 | 说明 |');
lines.push('| --- | --- | --- | --- | --- |');
for (const item of REFERENCES) {
  lines.push(`| [${item.title}](${item.url}) | ${item.version} | ${item.license} | ${item.holder} | ${item.note ?? ''} |`);
}
lines.push('');

const BEGIN = '<!-- LICENSES:BEGIN -->';
const END = '<!-- LICENSES:END -->';
const block = `${BEGIN}\n${lines.join('\n')}\n${END}`;
/* 留下改动前的内容：README 的过期判定必须拿**盘上的原文**比，
   不能拿下面已经被替换过的 `readme` —— 那样 `includes(block)` 恒为真、检查形同虚设
   （第一版就是这么写的，差点又交出一条永远绿的守卫）。 */
const readmeBefore = await readFile('README.md', 'utf8');
let readme = readmeBefore;
if (readme.includes(BEGIN)) {
  readme = readme.replace(new RegExp(`${BEGIN}[\\s\\S]*?${END}`), block);
} else {
  readme = `${readme.trimEnd()}\n\n---\n\n${block}\n`;
}
if (CHECK) {
  if (!readmeBefore.includes(block)) stale.push('README.md 的开源区块');
} else {
  await writeFile('README.md', readme, 'utf8');
}

if (CHECK) {
  if (stale.length) {
    console.error(`\n❌ 开源署名清单已过期：${stale.join('、')}`);
    console.error('   依赖变过但没重新生成署名。跑 `node scripts/collect-licenses.mjs` 更新后再提交。');
    process.exit(1);
  }
  console.log(`\n✅ 开源署名清单与依赖一致（依赖 ${all.length} 个，分 ${groups.length} 类）`);
  process.exit(0);
}

console.log(`依赖 ${all.length} 个，分为 ${groups.length} 类：`);
groups.forEach((group) => console.log(`  - ${group.title}（${group.items.length}）`));
console.log('已写入 web/src/data/licenses.ts 与 README 区块');
