/**
 * 守卫：应用里出现的「那幅画」必须**只有一份来源**，而且必须是作者那张 DLSS 超分原图。
 *
 * 为什么需要它：这幅画在四个地方露脸 —— 启动页大图、主页左上角头像、关于页 hero、关于页「视觉与图标」。
 * 三件事都真实翻过车：
 *   ① 关于页当初用的是 192×192 的**图标**（`web/src/assets/app-icon-192.png`），放大到 96px
 *      在 3x 屏上就是插值出来的糊边 —— 换原图是为了不再糊；
 *   ② 2026-09-25 换插画时，四个引用点写成了 `/illustration.jpg` 这种**绝对路径**：网页版
 *      一切正常，APK 里却是 404（页面从 `/assets/www/` 提供），桌面上看到的就是一圈空圆。
 *      meta.ts 里 APP_ICON 的注释早就记过同一个坑，于是又踩了一次；
 *   ③ 谁再顺手另存一份 jpg，就会出现「网页上是新画、桌面上是旧画」。
 * 这三件事**都不会被编译器发现**，只能靠这条守卫。
 *
 * 判五层：
 *   ① 单一来源：`web/src/assets/illustration.jpg` 必须与 `docs/icon-source.jpg` **逐字节相同**，
 *      且 `web/public/illustration.jpg` 不许再存在（多一份就多一个 404 的引子）；
 *   ② 分辨率：原图长边 ≥ 1800（DLSS 超分版的口径；换回 1280 那种非超分版就红）；
 *   ③ 出口唯一：meta.ts 导入它并导出 `APP_ART`，全 web/src 里没有第二处图片导入；
 *   ④ 引用点：splash / ScheduleScreen / AboutScreen 都引用 `APP_ART`，
 *      且**任何源码里都不许出现 `/illustration.jpg` 这类绝对路径**（APK 里必 404）；
 *   ⑤ 不变形：`.splash-mark` `.appbar-avatar img` `.about-mark` `.about-mark-lg`
 *      的 width 与 height 必须相等（方形原图等比），且 object-fit 为 cover（不是 fill/stretch）。
 *
 * 用法：node scripts/check-artwork-source.mjs
 */
import { readFile, readdir, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const SOURCE = 'docs/icon-source.jpg';
const ART = 'web/src/assets/illustration.jpg';
/**
 * 曾经的错误写法：绝对路径在 APK 里 404（网页版看不出来）。
 * 只看**根绝对路径**：`../assets/illustration.jpg` 这种打包器导入是合法的（前面是 assets 的 s），
 * 只有前一个字符不是路径字符的 `/illustration.jpg` 才算「从站点根开始」。
 */
const FORBIDDEN_ABS = /(?<![.\w/])\/illustration\.jpg/;

/** 去掉注释再扫：注释里为了说明这个坑本来就会提到 `/illustration.jpg`。 */
const stripComments = (t) =>
  t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

/** 四个引用点：文件 → 至少引用几次 `APP_ART` 与说明。 */
const PLACEMENTS = [
  ['web/src/components/splash.tsx', 1, '启动页大图'],
  ['web/src/screens/ScheduleScreen.tsx', 1, '主页左上角头像'],
  ['web/src/screens/AboutScreen.tsx', 2, '关于页 hero + 「视觉与图标」'],
];

/** 参与运行时渲染的 web 源码（不含生成物）。 */
const SRC_ROOTS = await (async () => {
  const out = [];
  const walk = async (dir) => {
    for (const e of await readdir(dir, { withFileTypes: true })) {
      const p = `${dir}/${e.name}`;
      if (e.isDirectory()) await walk(p);
      else if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
    }
  };
  await walk('web/src');
  return out;
})();

let fail = 0;
const ok = (m) => console.log(`  ✅ ${m}`);
const bad = (m) => {
  fail += 1;
  console.error(`  ❌ ${m}`);
};

/** 极简 JPEG 尺寸解析：只认 SOF0~SOF15 段。 */
const jpegSize = (buf) => {
  if (buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) {
      i += 1;
      continue;
    }
    const marker = buf[i + 1];
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    const len = buf.readUInt16BE(i + 2);
    const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
    i += 2 + len;
  }
  return null;
};

/** 取 CSS 里某个选择器的声明体（本项目的规则都是一层花括号，不做嵌套解析）。 */
const ruleBody = (css, selector) => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = new RegExp(`(?:^|\\n)[^\\n{}]*${escaped}\\s*\\{`).exec(css);
  if (!m) return null;
  const start = css.indexOf('{', m.index);
  const end = css.indexOf('}', start);
  return css.slice(start + 1, end);
};

console.log('🖼  画作来源守卫');

// ① 单一来源
const [srcBuf, artBuf] = await Promise.all([readFile(SOURCE), readFile(ART)]);
const sha = (b) => createHash('sha256').update(b).digest('hex');
if (sha(srcBuf) === sha(artBuf)) ok(`${ART} 与 ${SOURCE} 逐字节相同（${artBuf.length} 字节）`);
else bad(`${ART} 与 ${SOURCE} 不是同一份（${artBuf.length} vs ${srcBuf.length} 字节）—— 应用里会出现两种画`);
try {
  await stat('web/public/illustration.jpg');
  bad('web/public/illustration.jpg 还在：多一份根目录副本，等于给"绝对路径 404"留了引子');
} catch {
  ok('web/public/ 下没有第二份插画');
}

// ② 分辨率必须还是超分那版
const size = jpegSize(srcBuf);
if (!size) bad(`${SOURCE} 不是可解析的 JPEG`);
else if (Math.max(size.width, size.height) >= 1800) ok(`原图 ${size.width}×${size.height}（超分口径 ≥1800）`);
else bad(`原图只有 ${size.width}×${size.height}，不是 DLSS 超分版（≥1800）—— 换图后忘了跑 npm run icons:app？`);

// ③ 出口唯一
const meta = await readFile('web/src/lib/meta.ts', 'utf8');
if (/from '\.\.\/assets\/illustration\.jpg'/.test(meta) && /export const APP_ART = /.test(meta)) {
  ok('meta.ts 导入 ../assets/illustration.jpg 并导出 APP_ART');
} else {
  bad('meta.ts 里没有「导入插画 + 导出 APP_ART」这一对（画面得走打包器导入，不能写绝对路径）');
}

// ④ 引用点 + 禁绝对路径
for (const [file, need, label] of PLACEMENTS) {
  let text;
  try {
    text = await readFile(file, 'utf8');
  } catch {
    bad(`${file} 读不到（${label}）`);
    continue;
  }
  const hits = (text.match(/src=\{APP_ART\}/g) ?? []).length;
  if (hits >= need) ok(`${label}：${file} 用 APP_ART ×${hits}`);
  else bad(`${label}：${file} 只用 APP_ART ${hits} 次（应 ≥${need}）`);
}

const offenders = [];
for (const file of SRC_ROOTS) {
  const text = stripComments(await readFile(file, 'utf8'));
  const isMeta = file.endsWith('lib/meta.ts');
  if (FORBIDDEN_ABS.test(text)) offenders.push(`${file} → 根绝对路径 /illustration.jpg`);
  if (!isMeta && /\bAPP_ICON\b/.test(text)) offenders.push(`${file} → APP_ICON`);
}
if (offenders.length === 0) {
  ok('没有绝对路径引用、也没有第二处 APP_ICON（画面不再用 192 图标冒充原图）');
} else {
  bad(`这些地方还在用旧写法：${offenders.join('、')}`);
}

// ⑤ 不变形
const themeDir = 'web/src/theme';
const css = (
  await Promise.all(
    (await readdir(themeDir))
      .filter((f) => f.endsWith('.css'))
      .map((f) => readFile(`${themeDir}/${f}`, 'utf8')),
  )
).join('\n');
for (const sel of ['.splash-mark', '.appbar-avatar img', '.about-mark', '.about-mark-lg']) {
  const body = ruleBody(css, sel);
  if (!body) {
    bad(`${sel} 的样式没了`);
    continue;
  }
  const w = /(?:^|[\s;])width:\s*([^;]+)/.exec(body);
  const h = /(?:^|[\s;])height:\s*([^;]+)/.exec(body);
  const fit = /object-fit:\s*([a-z-]+)/.exec(body);
  const square = (w && h && w[1].trim() === h[1].trim()) || /aspect-ratio:\s*1\s*\/\s*1/.test(body);
  if (!square) bad(`${sel} 的宽高不等（${w?.[1]?.trim() ?? '?'}×${h?.[1]?.trim() ?? '?'}），方形原图会被拉变形`);
  else if (!fit) bad(`${sel} 没写 object-fit`);
  else if (fit[1] !== 'cover') bad(`${sel} 的 object-fit: ${fit[1]}（应为 cover）`);
  else ok(`${sel} ${w[1].trim()}×${h[1].trim()}、object-fit: cover`);
}

if (fail) {
  console.error(`\n❌ 画作来源守卫失败 ${fail} 项：这幅画只能有一个来源（${SOURCE} → ${ART} → APP_ART）`);
  process.exit(1);
}
console.log('\n✅ 画作来源守卫通过：一处来源、一张超分原图、四个位置、都不变形、都不走绝对路径');
