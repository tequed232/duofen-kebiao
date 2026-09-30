/**
 * 守卫：各种屏幕比例 / 被浏览器切割的视口下，界面不许「跑出屏幕」。
 *
 * 为什么需要：作者 2026-09-29 要求「做好在各种比例的设备中的运行效果，9:16、4:3 这样，
 * 还有屏幕被浏览器切割导致内容显示不出来的情况也要考虑」。这类问题在单一视口下永远看不出来：
 *   · 4:3 横屏（1024×768）时底栏 / 浮动按钮会不会被挤出屏幕；
 *   · 视口很矮（浏览器地址栏 + 键盘切掉一半）时，底栏会不会顶到浮动按钮、甚至把课表压没；
 *   · `.phone` 是 `overflow: hidden` 的定高外壳，一旦内部超高就是**直接看不见**，不是滚动。
 *
 * 判定（每个视口一组）：
 *   ① 没有横向溢出（文档 scrollWidth ≤ 视口宽 + 1）；
 *   ② 手机外壳完整落在视口内（top ≥ 0、bottom ≤ 视口高 + 1）；
 *   ③ 底栏完整可见，且宽度不超视口；
 *   ④ 主页浮动按钮行完整可见、**不与底栏重叠**、也不与顶栏重叠；
 *   ⑤ 内容容器在高度不够时是「可滚动」的（overflow-y: auto/scroll），而不是被裁掉。
 * 另外在最矮 / 4:3 横屏两种极端下打开「课表数据」面板，确认面板与主按钮真的在视口内。
 *
 * 用法：APP_URL=http://127.0.0.1:5173/ node scripts/check-viewport.mjs
 */
import { chromium } from 'playwright';

const APP_URL = process.env.APP_URL ?? 'http://127.0.0.1:5173/';

const VIEWPORTS = [
  { name: '9:16 常见手机', width: 390, height: 844 },
  { name: '窄长（20:9）', width: 360, height: 900 },
  { name: '4:3 竖屏平板', width: 768, height: 1024 },
  { name: '4:3 横屏', width: 1024, height: 768 },
  { name: '超矮（浏览器/键盘切割）', width: 740, height: 360 },
  { name: '被切成半屏', width: 412, height: 500 },
];

let pass = 0;
let fail = 0;
const check = (label, ok, detail) => {
  if (ok) pass += 1;
  else fail += 1;
  console.log(`  ${ok ? '✓' : '✗'} ${label}${ok || !detail ? '' : ` —— ${detail}`}`);
};

const probe = () => {
  const rect = (selector) => {
    const el = document.querySelector(selector);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height };
  };
  const content = document.querySelector('.screen-content');
  return {
    viewport: { w: window.innerWidth, h: window.innerHeight },
    docScrollWidth: document.documentElement.scrollWidth,
    phone: rect('.phone'),
    dock: rect('.m3e-dock'),
    fabRow: rect('.schedule-fab-row'),
    navFab: rect('.schedule-nav-fab'),
    appBar: rect('.app-bar'),
    contentOverflowY: content ? getComputedStyle(content).overflowY : null,
    contentScrolls: content ? content.scrollHeight > content.clientHeight + 1 : false,
    bodyOverflowY: getComputedStyle(document.body).overflowY,
  };
};


/**
 * 打开「课表数据」面板。
 * 入口在 2026-09-29 从主页右上角的铅笔搬到了 **设置 → 课表编辑 → 课表数据与导入**，
 * 所以守卫也走真实路径。设置页在 DOM 里有两份屏幕副本，非活动那份带 `aria-hidden="true"`
 * 且会拦住点击，因此按标题在活动屏幕里选并 force 点击。
 */
const activeRow = (page, title) =>
  page.locator(`.screen:not([aria-hidden="true"]) md-list-item:has([slot="headline"]:text-is("${title}"))`).first();

const openImportSheet = async (page) => {
  await page.locator('.m3e-dock-tab', { hasText: '设置' }).first().click();
  await page.waitForTimeout(800);
  await activeRow(page, '课表编辑').click({ force: true, timeout: 5000 });
  await page.waitForTimeout(700);
  await activeRow(page, '课表数据与导入').click({ force: true, timeout: 5000 });
  await page.waitForTimeout(1000);
};

const browser = await chromium.launch({ channel: 'chromium' });
const page = await browser.newPage({ viewport: VIEWPORTS[0] });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 140)));

for (const vp of VIEWPORTS) {
  console.log(`\n[${vp.name}] ${vp.width}×${vp.height}`);
  await page.setViewportSize({ width: vp.width, height: vp.height });
  await page.goto(APP_URL, { waitUntil: 'load' });
  await page.waitForTimeout(2600); // 开屏

  const m = await page.evaluate(probe);
  const limit = 1;

  check('没有横向溢出', m.docScrollWidth <= m.viewport.w + limit, `文档宽 ${m.docScrollWidth} > 视口 ${m.viewport.w}`);

  if (!m.phone) {
    check('找得到手机外壳 .phone', false);
    continue;
  }
  check('手机外壳完整在视口内', m.phone.top >= -limit && m.phone.bottom <= m.viewport.h + limit, `top=${m.phone.top.toFixed(0)} bottom=${m.phone.bottom.toFixed(0)} 视口高=${m.viewport.h}`);

  if (m.dock) {
    check('底栏完整可见', m.dock.bottom <= m.viewport.h + limit && m.dock.top >= -limit, `bottom=${m.dock.bottom.toFixed(0)} top=${m.dock.top.toFixed(0)}`);
    check('底栏不超视口宽', m.dock.width <= m.viewport.w + limit, `宽 ${m.dock.width.toFixed(0)}`);
  } else {
    check('找得到底栏 .m3e-dock', false);
  }

  if (m.fabRow) {
    check('浮动按钮行完整可见', m.fabRow.top >= -limit && m.fabRow.bottom <= m.viewport.h + limit, `top=${m.fabRow.top.toFixed(0)} bottom=${m.fabRow.bottom.toFixed(0)}`);
    if (m.dock) check('浮动按钮不与底栏重叠', m.fabRow.bottom <= m.dock.top + limit, `按钮 bottom=${m.fabRow.bottom.toFixed(0)} 底栏 top=${m.dock.top.toFixed(0)}`);
    if (m.appBar) check('浮动按钮不与顶栏重叠', m.fabRow.top >= m.appBar.bottom - limit, `按钮 top=${m.fabRow.top.toFixed(0)} 顶栏 bottom=${m.appBar.bottom.toFixed(0)}`);
    if (m.navFab) check('「导航课程」按钮在视口内', m.navFab.left >= -limit && m.navFab.right <= m.viewport.w + limit, `left=${m.navFab.left.toFixed(0)} right=${m.navFab.right.toFixed(0)}`);
  }

  check(
    '内容高度不够时可滚动（不是被裁掉）',
    !m.contentScrolls || ['auto', 'scroll'].includes(m.contentOverflowY ?? ''),
    `溢出但 overflow-y=${m.contentOverflowY}`,
  );
}

/* ---- 最窄视口下打开课程详情：教材区那几颗按钮不许被右边缘裁掉 ----
   真机事故（2026-09-29）：366dp 上三颗按钮（拍照识别封面 / 从相册选图 / 手动填写）
   排不下，第三颗被裁成半个字。这里在最窄视口复现并钉住。 */
for (const vp of [VIEWPORTS[1], VIEWPORTS[0]]) {
  console.log(`\n[课程详情按钮行] ${vp.name} ${vp.width}×${vp.height}`);
  await page.setViewportSize({ width: vp.width, height: vp.height });
  await page.goto(APP_URL, { waitUntil: 'load' });
  await page.waitForTimeout(2600);
  const chip = page.locator('.course-chip').first();
  if ((await chip.count()) === 0) {
    check('找得到一节课来打开详情', false, '课表上没有任何 .course-chip');
    continue;
  }
  await chip.click({ force: true });
  await page.waitForTimeout(1200);
  const overflow = await page.evaluate(() => {
    const panel = document.querySelector('.sheet-panel');
    if (!panel) return { noPanel: true };
    const buttons = [...panel.querySelectorAll('md-filled-tonal-button, md-outlined-button, md-text-button, md-filled-button')];
    const boxes = buttons.map((b) => {
      const r = b.getBoundingClientRect();
      return { text: (b.textContent ?? '').trim().slice(0, 12), left: r.left, right: r.right, width: r.width };
    });
    // 关着的对话框里的按钮尺寸是 0×0，不算「被压窄」——只看真正渲染出来的
    const rendered = boxes.filter((b) => b.width > 1);
    return {
      vw: window.innerWidth,
      worst: boxes.reduce((max, b) => Math.max(max, b.right), 0),
      outside: boxes.filter((b) => b.right > window.innerWidth + 1).map((b) => b.text),
      zero: rendered.filter((b) => b.width < 24).map((b) => b.text),
      count: rendered.length,
    };
  });
  check('详情弹层打开了', !overflow.noPanel, '找不到 .sheet-panel');
  if (overflow.noPanel) continue;
  check(
    `详情里的按钮都没被右边缘裁掉（最右 ${Math.round(overflow.worst)} ≤ 视口 ${overflow.vw}）`,
    overflow.outside.length === 0,
    `越界按钮：${overflow.outside.join('、') || '(无)'}`,
  );
  check('按钮都有正常宽度（没被压成一条）', overflow.zero.length === 0, `过窄：${overflow.zero.join('、') || '(无)'}`);
}

/* ---- 极端视口下打开「课表数据」面板：面板与主按钮必须真的在视口里 ---- */
for (const vp of [VIEWPORTS[4], VIEWPORTS[3]]) {
  console.log(`\n[面板] ${vp.name} ${vp.width}×${vp.height}`);
  await page.setViewportSize({ width: vp.width, height: vp.height });
  await page.goto(APP_URL, { waitUntil: 'load' });
  await page.waitForTimeout(2600);
  await openImportSheet(page);
  await page.waitForTimeout(900);
  const panel = await page.evaluate(() => {
    const el = document.querySelector('.sheet-panel');
    const btn = [...document.querySelectorAll('md-filled-tonal-button')].find((n) => n.textContent.includes('导入课表文件'));
    const box = (node) => {
      if (!node) return null;
      const r = node.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height };
    };
    return { panel: box(el), button: box(btn), vw: window.innerWidth, vh: window.innerHeight };
  });
  check('面板存在于视口内', Boolean(panel.panel) && panel.panel.top >= -1 && panel.panel.bottom <= panel.vh + 1, JSON.stringify(panel.panel));
  check(
    '「导入课表文件」按钮可见且在视口内',
    Boolean(panel.button) && panel.button.width > 0 && panel.button.top >= -1 && panel.button.bottom <= panel.vh + 1,
    JSON.stringify(panel.button),
  );
}

if (errors.length) console.log('\n页面错误:', errors.slice(0, 3).join(' | '));
await browser.close();
console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
