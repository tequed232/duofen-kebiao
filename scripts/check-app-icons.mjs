/**
 * 守卫：应用图标必须**仍然是 `docs/icon-source.jpg` 按既定口径生成出来的那一套**。
 *
 * 为什么需要它：图标是"一次性生成、之后没人再看"的那种资产。作者换一版原图（比如这次
 * 超分到 2048）之后，只要有一条漏跑（例如只更了网页 favicon、忘了 mipmap-xxxhdpi），
 * 就会长期出现「桌面上的图标还是旧的那张」——而且**没有任何东西会红**。
 * 这条守卫把「生成出来的」与「仓库里躺着的」逐像素对上。
 *
 * 判定分三层：
 *   ① 尺寸与几何：前景必须是整幅缩到 2/3、居中、四周透明；方形/圆形必须满幅不透明，圆形四角为底色；
 *   ② 内容：每张图标与「用 docs/icon-source.jpg 现算一遍」的结果逐像素比对（容差 6/255，
 *      只吸收不同 Chromium 版本的采样差异，吸收不了"换了张图"）；
 *   ③ 一致性：同样尺寸、同样模式的三张（mipmap-xxxhdpi / web/public/icon-192 / web/src/assets）
 *      必须**逐字节相同**。
 *
 * 用法：node scripts/check-app-icons.mjs
 * 依赖：Playwright 的 chromium（与其它 Playwright 守卫同一个浏览器）
 */
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { BG, SOURCE, TARGETS, renderIcon, sourceDataUrl } from './icon-targets.mjs';

/** 允许的平均逐通道差（0~255）。同机重算 ≈ 0。 */
const TOLERANCE = 6;
/**
 * 允许的「与现算结果相差超过 8 的像素占比」。
 *
 * 为什么除了均值还要看占比：图标换了原图时，**均值会骗人** —— 画面大半是平坦的深色底，
 * 均值被摊薄到 2~6，而真正不同的是角色那块。实测把 git 里的旧图标放回去，
 * 19 张的占比是 **15.9%~47.9%**，而现算的一份是 0%（见下方注释里的对照数据）。
 * 取 8% 作阈值：既离旧图有 2 倍余量，也远高于"换个 Chromium 版本、采样核略有出入"的量级。
 */
const MAX_SHARE = 0.08;

const source = await readFile(SOURCE);
const dataUrl = sourceDataUrl(source);
/** 送给页面的是源图，不是图标 —— 页面自己会按配方再算一遍 */
const files = {};
for (const { file } of TARGETS) files[file] = (await readFile(file)).toString('base64');

const browser = await chromium.launch({ channel: 'chromium' });
const page = await browser.newPage();
const version = browser.version();

/** 先按配方现算一份（与 make-icons.mjs 用的是同一个 renderIcon） */
const expected = {};
for (const { file, size, mode } of TARGETS) expected[file] = await renderIcon(page, dataUrl, size, mode);

const results = await page.evaluate(
  async ({ src, files, expected, targets, tolerance, maxShare }) => {
    const load = async (prefix, b64) => {
      const img = new Image();
      img.src = `${prefix}${b64}`;
      await img.decode();
      return img;
    };
    const pixels = (img) => {
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);
      return { data: ctx.getImageData(0, 0, img.width, img.height).data, w: img.width, h: img.height };
    };
    const source = await load('data:image/jpeg;base64,', src.base64);

    const out = [];
    for (const { file, size, mode } of targets) {
      const problems = [];
      const actual = pixels(await load('data:image/png;base64,', files[file]));
      const ref = pixels(await load('data:image/png;base64,', expected[file]));

      if (actual.w !== size || actual.h !== size) problems.push(`尺寸 ${actual.w}×${actual.h}，应为 ${size}×${size}`);

      // ② 内容：与现算结果的平均逐通道差 + 「差得明显的像素占比」
      let sum = 0;
      let n = 0;
      let over = 0;
      const total = Math.min(actual.data.length, ref.data.length) / 4;
      for (let i = 0; i < Math.min(actual.data.length, ref.data.length); i += 4) {
        const d = Math.max(
          Math.abs(actual.data[i] - ref.data[i]),
          Math.abs(actual.data[i + 1] - ref.data[i + 1]),
          Math.abs(actual.data[i + 2] - ref.data[i + 2]),
        );
        sum += Math.abs(actual.data[i] - ref.data[i]) + Math.abs(actual.data[i + 1] - ref.data[i + 1]) + Math.abs(actual.data[i + 2] - ref.data[i + 2]);
        n += 3;
        if (d > 8) over += 1;
      }
      const meanDiff = n ? sum / n : 999;
      const share = total ? over / total : 1;
      if (meanDiff > tolerance || share > maxShare) {
        problems.push(
          `与「现按 ${src.name} 生成」的结果差：均值 ${meanDiff.toFixed(2)}/255（容差 ${tolerance}）、` +
            `明显不同的像素占 ${(share * 100).toFixed(1)}%（上限 ${(maxShare * 100).toFixed(0)}%）` +
            ` —— 图标没跟着原图重新生成？`,
        );
      }

      // ① 几何
      const alphaAt = (x, y) => actual.data[(y * actual.w + x) * 4 + 3];
      if (mode === 'foreground') {
        const inner = Math.round((size * 2) / 3);
        const off = (size - inner) / 2;
        let minX = size;
        let minY = size;
        let maxX = -1;
        let maxY = -1;
        for (let y = 0; y < size; y += 1) {
          for (let x = 0; x < size; x += 1) {
            if (alphaAt(x, y) > 8) {
              if (x < minX) minX = x;
              if (x > maxX) maxX = x;
              if (y < minY) minY = y;
              if (y > maxY) maxY = y;
            }
          }
        }
        const want = `${off},${off}-${off + inner - 1},${off + inner - 1}`;
        if (`${minX},${minY}-${maxX},${maxY}` !== want) {
          problems.push(`前景的不透明范围是 ${minX},${minY}-${maxX},${maxY}，应为 ${want}（整幅缩到 2/3 居中）`);
        }
        if (alphaAt(0, 0) > 8) problems.push(`前景四角必须是透明的，左上角 alpha=${alphaAt(0, 0)}`);
      } else {
        let translucent = 0;
        for (let i = 3; i < actual.data.length; i += 4) if (actual.data[i] < 250) translucent += 1;
        if (translucent) problems.push(`满幅图标里有 ${translucent} 个半透明/透明像素`);
        if (mode === 'round') {
          const corner = pixels(await load('data:image/png;base64,', files[file])).data;
          const [r, g, b] = [corner[0], corner[1], corner[2]];
          const bg = [0x13, 0x16, 0x1f];
          const far = Math.max(Math.abs(r - bg[0]), Math.abs(g - bg[1]), Math.abs(b - bg[2]));
          if (far > 8) problems.push(`圆形版四角应是底色 ${src.bg}，实测 rgb(${r},${g},${b})`);
        }
      }
      out.push({ file, size, mode, meanDiff, share, problems });
    }

    // ③ 同尺寸同模式的三张必须逐字节相同
    const identical = [
      ['app/src/main/res/mipmap-xxxhdpi/ic_launcher.png', 'web/public/icon-192.png'],
      ['web/public/icon-192.png', 'web/src/assets/app-icon-192.png'],
    ];
    const dup = [];
    for (const [a, b] of identical) {
      if (files[a] !== files[b]) dup.push(`${a} 与 ${b} 应完全相同，实际不同`);
    }
    return { out, dup };
  },
  {
    src: { name: SOURCE, base64: source.toString('base64'), bg: BG },
    files,
    expected,
    targets: TARGETS,
    tolerance: TOLERANCE,
    maxShare: MAX_SHARE,
  },
);

let fail = results.dup.length;
for (const { file, size, mode, meanDiff, share, problems } of results.out) {
  const tag = problems.length ? '✗' : '✓';
  console.log(
    `  ${tag} ${file.padEnd(56)} ${String(size).padStart(3)}px ${mode.padEnd(10)} 差 ${meanDiff.toFixed(2)}（明显不同 ${(share * 100).toFixed(2)}%）`,
  );
  for (const p of problems) console.log(`      —— ${p}`);
  fail += problems.length;
}
for (const d of results.dup) console.log(`  ✗ ${d}`);

console.log(`\n源图 ${SOURCE}（${source.length} 字节）· Chromium ${version}`);
console.log(`结果：${results.out.length - results.out.filter((r) => r.problems.length).length} 张一致 / ${results.out.length} 张`);
if (fail) {
  console.error(`\n❌ 有 ${fail} 处不一致：图标必须与 docs/icon-source.jpg 同步（改原图后跑 npm run icons:app）`);
}
await browser.close();
process.exit(fail ? 1 : 0);
