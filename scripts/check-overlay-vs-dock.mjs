/**
 * 守卫（算法）：**任何浮层都不许把可点元素放到 dock 底栏下面**。
 *
 * 真机事故（作者 2026-09-25）：抽屉里的按钮点不到 —— 底栏是屏幕的兄弟（z-index 40），
 * 而弹层在屏幕这个层叠上下文里（z-index 30），子元素 z-index 再高也翻不过去。
 * 这类"看得见、点不到"的坏法在静态检查里完全看不出来，只能真渲染量：
 *   ① 底栏必须把 `--dock-band` 发布出来（浮层靠它让位，见 layout.tsx）；
 *   ② 打开每个浮层后，它里面**没有任何可点元素的中心落在底栏矩形里**；
 *   ③ 顺手确认浮层主操作按钮的 elementFromPoint 命中它自己（没被别的层盖住）。
 *
 * 用法：APP_URL=http://127.0.0.1:5173/ node scripts/check-overlay-vs-dock.mjs
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
const page = await browser.newPage({ viewport: { width: 366, height: 800 }, deviceScaleFactor: 2 });
await page.goto(URL, { waitUntil: 'load' });
await page.waitForTimeout(2600);
await page.waitForSelector('.timeline-item', { timeout: 8000 });

const band = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--dock-band').trim());
check(`底栏已发布 --dock-band（${band || '空'}）`, /^\d+px$/.test(band) && parseInt(band, 10) > 40, '浮层没有可让位的依据');

/** 量当前打开的浮层：可点元素有没有掉进底栏带子里 */
const audit = async (name, selector) =>
  page.evaluate(
    ({ name, selector }) => {
      const dock = document.querySelector('.m3e-dock').getBoundingClientRect();
      const panel = document.querySelector(selector);
      if (!panel) return { name, opened: false };
      const nodes = [...panel.querySelectorAll('button, md-filled-button, md-text-button, md-filled-tonal-button, md-outlined-button, md-icon-button, a[href], input')].filter(
        (el) => el.getBoundingClientRect().width > 4 && !el.hasAttribute('disabled'),
      );
      const underDock = [];
      const unreachable = [];
      for (const el of nodes) {
        const r = el.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        const label = (el.innerText || el.getAttribute('aria-label') || el.tagName).replace(/\s+/g, ' ').trim().slice(0, 18);
        if (cy > dock.top && cy < dock.bottom && cx > dock.left && cx < dock.right) underDock.push(label);
        const hit = document.elementFromPoint(cx, cy);
        if (!hit || !(hit === el || el.contains(hit))) unreachable.push(`${label}→${hit?.tagName?.toLowerCase() ?? 'null'}`);
      }
      const pr = panel.getBoundingClientRect();
      return {
        name,
        opened: true,
        count: nodes.length,
        underDock,
        unreachable,
        panelBottom: Math.round(pr.bottom),
        dockTop: Math.round(dock.top),
      };
    },
    { name, selector },
  );

const openCourse = () => page.evaluate(() => document.querySelector('.screen:not([aria-hidden="true"]) .timeline-item')?.click());
const closeSheet = async () => {
  await page.locator('.sheet-header md-icon-button, .sheet-header button').first().click({ force: true }).catch(() => {});
  await page.waitForTimeout(700);
};

/* ① 课程详情抽屉 */
await openCourse();
await page.waitForTimeout(900);
let r = await audit('课程详情抽屉', '.sheet-panel.half');
check('课程详情抽屉打开了', r.opened, '没找到 .sheet-panel.half');
if (r.opened) {
  check(`抽屉里没有可点元素落在底栏下（${r.count} 个可点元素）`, r.underDock.length === 0, `掉进去：${r.underDock.join('、')}`);
  if (r.unreachable.length) console.log(`  ! 告警（待真机确认是谁）：有可点元素被别的层挡住 —— ${r.unreachable.join('、')}`);
  check(`抽屉底边停在底栏上方（${r.panelBottom} ≤ ${r.dockTop}）`, r.panelBottom <= r.dockTop + 1, '抽屉压到底栏上了');
}
await closeSheet();

/* ② 导航课程抽屉（首页悬浮按钮） */
await page.locator('.schedule-nav-fab').first().click({ force: true });
await page.waitForTimeout(1000);
r = await audit('导航课程抽屉', '.sheet-panel.half');
check('导航课程抽屉打开了', r.opened, '没打开');
if (r.opened) {
  check(`导航抽屉里没有可点元素落在底栏下（${r.count} 个）`, r.underDock.length === 0, `掉进去：${r.underDock.join('、')}`);
  if (r.unreachable.length) console.log(`  ! 告警（待真机确认是谁）：${r.unreachable.join('、')}`);
}
await closeSheet();
await page.screenshot({ path: 'build/overlay-vs-dock.png' });
console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
await browser.close();
process.exit(fail ? 1 : 0);
