/**
 * 从 `docs/icon-source.jpg` 生成**全套应用图标**（安卓 5 档密度 × 3 种 + 网页 4 张）。
 *
 *   node scripts/make-icons.mjs
 *
 * 为什么用 Playwright：仓库里没有任何图像处理库（sharp / jimp / canvas 都没装），
 * 而 chromium 的 canvas 自带高质量降采样（imageSmoothingQuality='high'），
 * 于是"借一个已经存在的浏览器"比新加一条依赖更划算。脚本本身不联网、不装东西。
 *
 * 口径（含前景 2/3 安全区、圆形遮罩、底色）全部在 scripts/icon-targets.mjs 里，
 * 与守卫 scripts/check-app-icons.mjs 共用同一份 —— 改了配方，守卫认的就是新配方。
 *
 * 换新原图（比如作者又超分了一版）之后：覆盖 `docs/icon-source.jpg` 再跑这一条即可。
 */
import { readFile, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { SOURCE, TARGETS, BG, renderIcon, sourceDataUrl } from './icon-targets.mjs';

const dataUrl = sourceDataUrl(await readFile(SOURCE));
const browser = await chromium.launch({ channel: 'chromium' });
const page = await browser.newPage();

const lines = [];
for (const { file, size, mode } of TARGETS) {
  const base64 = await renderIcon(page, dataUrl, size, mode);
  const buf = Buffer.from(base64, 'base64');
  await writeFile(file, buf);
  lines.push(`${file.padEnd(56)} ${String(size).padStart(3)}px ${mode.padEnd(10)} ${String(Math.round(buf.length / 1024)).padStart(4)} KB`);
}

console.log(`源图：${SOURCE}（整幅等比、不裁切；底色 ${BG}）`);
console.log(lines.join('\n'));
console.log(`\n共 ${lines.length} 张。`);

await browser.close();
