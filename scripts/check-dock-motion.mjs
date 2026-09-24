/**
 * 守卫：底栏**运动行为**（轻点 duang / 拖动跟手收敛）—— 接进 CI，跑在 dev server 阶段。
 *
 * 为什么值得占一条 CI：这条路径是手势热路径，改它的人（包括我自己）只看"页面还渲染得出来"，
 * 而坏掉的样子是"手感差一点"——没有任何东西会报红。2026-09-25 就是这样漏掉一个真 bug：
 * 拖动时弹簧算的是**底栏内坐标**，而 `applyFrame(jx)` 内部又减了一次 `geo.left`，
 * 色块在拖动中整体偏左一个左边距（460px 视口下偏 36px、真机约 42 设备像素），
 * 表现是"色块一直吊在手指左边、松手才弹回正确位置"。本地探针量到残余偏差
 * **慢拖 12px / 快拖 39px 且手指停住 400ms 也不收敛**；修好后两种情况都收敛到 **3px**。
 *
 * 两条断言（都用「比值 / 收敛」而不是绝对像素，换机器不假红）：
 *   ① 轻点：色块有中间帧 + 末段过冲（= 「移过去 duang」，不是闪现）；
 *   ② 拖动：手指停下后，色块中心追上手指（残余 < 8px）—— 这一条正是上面那个 bug 的探针。
 *
 * 用法（CI 里由 auto-review 的 dev server 阶段调用）：
 *   APP_URL=http://127.0.0.1:5173/ node scripts/check-dock-motion.mjs
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
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).split('\n')[0]));
await page.goto(URL, { waitUntil: 'load' });
await page.waitForTimeout(2600);
await page.waitForSelector('.m3e-dock', { timeout: 8000 });

const geo = await page.evaluate(() => {
  const r = document.querySelector('.m3e-dock').getBoundingClientRect();
  const tabs = [...document.querySelectorAll('.m3e-dock-tab')].map((t) => {
    const b = t.getBoundingClientRect();
    return b.x - r.x + b.width / 2;
  });
  return { left: r.x, top: r.y, width: r.width, height: r.height, tabs };
});
const centerOf = () =>
  page.evaluate(() => {
    const s = document.querySelector('.m3e-dock-slider').getBoundingClientRect();
    return s.x + s.width / 2;
  });

/* ---------- ① 轻点 duang ---------- */
console.log('\n[1] 轻点切换标签：位移轨迹');
const tapX = geo.left + geo.tabs[2];
const tapY = geo.top + geo.height / 2;
const before = await centerOf();
await page.mouse.move(tapX, tapY);
await page.mouse.down();
await page.waitForTimeout(60);
await page.mouse.up();
const track = [];
for (let i = 0; i < 60; i += 1) {
  track.push(Number((await centerOf()).toFixed(1)));
  await page.waitForTimeout(16);
}
const target = track[track.length - 1];
const moved = Math.abs(target - before);
const maxTravel = Math.max(...track.map((v) => Math.abs(v - before)));
const intermediate = track.filter((v) => Math.abs(v - before) > 1 && Math.abs(v - target) > 1).length;
check(`轻点后色块确实换了位置（位移 ${moved.toFixed(1)}px）`, moved > 20, '色块没动');
check(`是「移过去」而不是闪现（中间帧 ${intermediate} 帧）`, intermediate >= 3, '第一帧就到位 = 闪现');
check(`末段有弹簧过冲（最大行程 ${maxTravel.toFixed(1)}px > 终点 ${moved.toFixed(1)}px）`, maxTravel > moved + 0.5, '没有 overshoot');

/* ---------- ② 拖动跟手收敛 ---------- */
console.log('\n[2] 按住拖动后停住：色块会不会追上手指');
await page.waitForTimeout(400);
const startX = geo.left + 24;
await page.mouse.move(startX, tapY);
await page.mouse.down();
await page.waitForTimeout(70);
const lag = [];
for (let i = 1; i <= 8; i += 1) {
  const fx = startX + i * 14;
  await page.mouse.move(fx, tapY);
  await page.waitForTimeout(40);
  lag.push(Number((fx - (await centerOf())).toFixed(1)));
}
const rest = [];
for (let i = 0; i < 6; i += 1) {
  await page.waitForTimeout(70);
  rest.push(Number((startX + 8 * 14 - (await centerOf())).toFixed(1)));
}
await page.mouse.up();
const residual = Math.abs(rest[rest.length - 1]);
console.log(`    拖动中偏差 ${lag.join(', ')}`);
console.log(`    停住后残余 ${rest.join(', ')}`);
check(`手指停住后色块追上来（残余 ${residual}px < 8px）`, residual < 8, '色块一直吊在手指后面 —— 坐标系/弹簧又改坏了');
check(`拖动中确实有滞后（不是硬钉在手指上）`, Math.abs(lag[0]) > 1, '偏差恒为 0，说明没有弹簧滤波');

check('页面无运行时错误', errors.length === 0, errors.slice(0, 2).join(' / '));

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
await browser.close();
process.exit(fail ? 1 : 0);
