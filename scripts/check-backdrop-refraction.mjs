/**
 * 判定引擎是否还认 `backdrop-filter: url(#svg)` —— 以及位移图能不能用 feImage。
 *
 * 为什么要有这条守卫：docs 里曾长期记着「Chromium/WebView 会丢弃 backdrop-filter 里的
 * url(#svg)，所以网页端无法对背景做真实折射」，整条液态玻璃的技术路线就是按这个前提定的。
 * 但那条结论来自 build/test-backdrop-url.mjs —— 它用 feImage 指向一张纯色 data URL 做位移图，
 * 开/关截图完全一致，于是判定 url() 被忽略。
 *
 * 「截图一致」至少有两种成因，修法完全不同：
 *   ① url() 整个被丢弃            → 只能改用模糊/扩散近似，无解；
 *   ② url() 生效、但 feImage 取不到图 → in2 为空 → 位移恒为 0 → 同样一致，换位移图来源即可。
 * 所以必须把两者分开测，并带上一个"必然生效"的对照（blur），否则一次假阴性就会写进文档、
 * 再被四份文档引用，最后没人敢动。
 *
 * 用法：node scripts/check-backdrop-refraction.mjs
 * 依赖：Playwright 的 chromium（与 check-schedule-html 同一个浏览器）
 */
import { chromium } from 'playwright';

/** 纯色位移图：R=255 → X 正向拉满，G=128 → Y 不偏，于是整块背景均匀平移 */
const MAP_SVG =
  "data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='8'%3E%3Crect width='8' height='8' fill='rgb(255,128,128)'/%3E%3C/svg%3E";

const PAGE = `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;padding:0;background:#000}
  #bg{position:fixed;inset:0;background:repeating-linear-gradient(90deg,#ff2d2d 0 10px,#2d6bff 10px 20px)}
  #dot{position:fixed;left:150px;top:110px;width:70px;height:70px;border-radius:50%;background:#22ff88}
  #g{position:fixed;left:60px;top:60px;width:240px;height:180px;background:rgba(255,255,255,0.001)}
</style></head><body>
<div id="bg"></div><div id="dot"></div><div id="g"></div>
<svg width="0" height="0" style="position:absolute" aria-hidden="true">
  <filter id="f-turb" x="-30%" y="-30%" width="160%" height="160%">
    <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="1" seed="3" result="noise"/>
    <feDisplacementMap in="SourceGraphic" in2="noise" scale="70" xChannelSelector="R" yChannelSelector="G"/>
  </filter>
  <filter id="f-feimg" x="-30%" y="-30%" width="160%" height="160%">
    <feImage href="${MAP_SVG}" result="map" preserveAspectRatio="none"/>
    <feDisplacementMap in="SourceGraphic" in2="map" scale="70" xChannelSelector="R" yChannelSelector="G"/>
  </filter>
</svg>
</body></html>`;

let pass = 0;
let fail = 0;
const check = (label, ok, detail) => {
  if (ok) pass += 1;
  else fail += 1;
  console.log(`  ${ok ? '✓' : '✗'} ${label}${ok || !detail ? '' : ` —— ${detail}`}`);
};

const browser = await chromium.launch({ channel: 'chromium' });
const version = browser.version();
const page = await browser.newPage({ viewport: { width: 620, height: 300 }, deviceScaleFactor: 1 });
await page.setContent(PAGE, { waitUntil: 'load' });
await page.waitForTimeout(300);

const decode = (buf) =>
  page.evaluate(async (b64) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + b64;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    return Array.from(ctx.getImageData(0, 0, img.width, img.height).data);
  }, buf.toString('base64'));

/** 同一块区域、同一次加载，只换 backdrop-filter 的值 —— 必须同区域，否则量到的是区域差 */
const shot = async (value) => {
  await page.evaluate((v) => {
    document.getElementById('g').style.backdropFilter = v;
  }, value);
  await page.waitForTimeout(260);
  return decode(await page.locator('#g').screenshot());
};

const diff = (a, b) => {
  const n = Math.min(a.length, b.length);
  let sum = 0;
  let count = 0;
  for (let i = 0; i < n; i += 4) {
    sum += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
    count += 1;
  }
  return count ? sum / count / 3 : 0;
};

const base = await shot('none');
const dBlur = diff(await shot('blur(6px)'), base);
const dTurb = diff(await shot('url(#f-turb)'), base);
const dFeimg = diff(await shot('url(#f-feimg)'), base);

console.log(`\n=== backdrop-filter 对背景的真实作用（Chromium ${version}）===`);
console.log(`  blur(6px)        与无滤镜基线的平均逐像素差 ${dBlur.toFixed(2)}`);
console.log(`  url(#f-turb)     feTurbulence 当位移图，差 ${dTurb.toFixed(2)}`);
console.log(`  url(#f-feimg)    feImage     当位移图，差 ${dFeimg.toFixed(2)}`);

// 对照先立住：blur 都不生效的话，说明测量方法本身坏了，后面两条结论不可信
check('对照：blur 在 backdrop-filter 里生效', dBlur > 1, `差 ${dBlur.toFixed(2)}，测量方法可疑`);
check(
  'url(#svg) 通道未被丢弃（feTurbulence 位移图生效）',
  dTurb > 1,
  `差 ${dTurb.toFixed(2)} —— 引擎丢弃了 backdrop-filter 里的 url()`,
);
check(
  'feImage 位移图在 backdrop-filter 里生效',
  dFeimg > 1,
  `差 ${dFeimg.toFixed(2)} —— feImage 取不到图，位移恒为 0`,
);

console.log(
  '\n注：本守卫量的是当前 Chromium 的**真实行为**。若哪天它红了，说明引擎变了 ——\n' +
    '    那时 docs/context-links.md 里关于折射可行性的记录需要跟着改，而不是反过来假设它一定成立。',
);

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
await browser.close();
process.exit(fail ? 1 : 0);
