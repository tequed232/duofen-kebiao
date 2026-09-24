/**
 * 守卫：**色散在两种散射档下都必须看得见**（跑在 CI 的 dev server 阶段，需要真实渲染）。
 *
 * 为什么值得占一条 CI：作者 2026-09-25 的反馈是「dock 栏毛玻璃效果太重了，没有展示出色散效果」。
 * 根因不是滤链被删，而是「散射=强」那一档把底色提到 **58%**，一层近乎不透明的膜盖在玻璃上 ——
 * 色散还在跑，只是被盖住了。这种"参数把效果压没"的坏法**不会报任何错**，
 * 静态检查也看不出来（滤链、dataset 全都在），只能靠**真实渲染 + 像素**兜住。
 *
 * 量法：灰阶棋盘格压在底栏背后（灰阶自身 R≡B，|R−B| 只可能来自三通道位移差 = 色散），
 * 分上/中/下三条带统计；判据是「边缘带显著高于中间带」，不是绝对下限 —— 换机器/DPR 不假红。
 * 底色 alpha 的调参表（2026-09-25 实测，色散=极致档）：
 *
 *   alpha   上边缘带 |R−B|   中间带   下边缘带
 *    58%        6.55          1.41      3.54     ← 修前：色散基本被盖住
 *    45%        9.60          2.27      5.07
 *    30%       13.47          2.49      6.42     ← 现在「强」档取这一档
 *    22%       15.94          2.66      7.35
 *     0%       23.06          2.63      9.54     ← 「轻」档（默认）
 *
 * 用法：APP_URL=http://127.0.0.1:5173/ node scripts/check-dock-scatter-dispersion.mjs
 */
import { chromium } from 'playwright';

const URL = process.env.APP_URL || 'http://127.0.0.1:5173/';

let pass = 0;
let fail = 0;
const check = (label, ok, detail = '') => {
  if (ok) pass += 1;
  else fail += 1;
  console.log(`  ${ok ? '✓' : '✗'} ${label}${ok || !detail ? '' : ` —— ${detail}`}`);
};

const browser = await chromium.launch({ channel: 'chromium' });
const page = await browser.newPage({ viewport: { width: 460, height: 940 }, deviceScaleFactor: 2 });
await page.goto(`${URL}?dispersion=ultimate`, { waitUntil: 'load' });
await page.waitForTimeout(2600);
await page.waitForSelector('.m3e-dock', { timeout: 8000 });

/* 灰阶棋盘：z-index 35，压在底栏（40）下面、屏幕内容上面 */
await page.evaluate(() => {
  const layer = document.createElement('div');
  layer.style.cssText = [
    'position:fixed',
    'inset:0',
    'z-index:35',
    'pointer-events:none',
    'background:repeating-conic-gradient(#000 0% 25%,#fff 0% 50%) 0 0/24px 24px',
  ].join(';');
  document.querySelector('.phone')?.appendChild(layer);
});
await page.waitForTimeout(400);

const measure = async () => {
  const shot = await page.locator('.m3e-dock').screenshot();
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + b64;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const { data } = ctx.getImageData(0, 0, img.width, img.height);
    const x0 = Math.round(img.width * 0.3);
    const x1 = Math.round(img.width * 0.7);
    const band = (y0, y1) => {
      let sum = 0;
      let n = 0;
      for (let y = y0; y < y1; y += 1) {
        for (let x = x0; x < x1; x += 1) {
          const i = (y * img.width + x) * 4;
          sum += Math.abs(data[i] - data[i + 2]);
          n += 1;
        }
      }
      return sum / n;
    };
    const h = img.height;
    return {
      top: band(0, Math.max(1, Math.round(h * 0.22))),
      middle: band(Math.round(h * 0.4), Math.round(h * 0.6)),
      bottom: band(Math.round(h * 0.78), h),
      bg: getComputedStyle(document.querySelector('.m3e-dock')).backgroundColor,
    };
  }, shot.toString('base64'));
};

for (const scatter of ['concise', 'strong']) {
  await page.evaluate((mode) => {
    document.documentElement.dataset.dockScatter = mode;
  }, scatter);
  await page.waitForTimeout(400);
  const r = await measure();
  const edge = Math.max(r.top, r.bottom);
  console.log(`\n散射=${scatter}（底色 ${r.bg}）`);
  console.log(`  |R−B| 上 ${r.top.toFixed(2)} / 中 ${r.middle.toFixed(2)} / 下 ${r.bottom.toFixed(2)}`);
  check(
    `边缘有色散且集中在边缘（边缘 ${edge.toFixed(1)} ≥ 中间带 ${r.middle.toFixed(1)} 的 2 倍，且 > 8）`,
    edge > r.middle * 2 && edge > 8,
    '色散被磨砂盖住了 —— 检查这一档的底色 alpha（>45% 就会把彩边盖没）',
  );
}

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
await browser.close();
process.exit(fail ? 1 : 0);
