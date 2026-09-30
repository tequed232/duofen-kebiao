/**
 * 守卫：抽屉抓手的手势 —— 往上拖到全屏、往下拖够多则关闭，且**任何时刻都不越过底栏带子**。
 *   APP_URL=http://127.0.0.1:5173/ node build/check-grabber-drag.cjs
 */
const { chromium } = require('playwright');

let pass = 0;
let fail = 0;
const check = (label, ok, detail = '') => {
  if (ok) pass += 1;
  else fail += 1;
  console.log(`  ${ok ? '✓' : '✗'} ${label}${ok || !detail ? '' : ` —— ${detail}`}`);
};
const drag = async (page, fromY, toY) => {
  const g = await page.locator('.sheet-grabber').first().boundingBox();
  const x = g.x + g.width / 2;
  await page.mouse.move(x, fromY ?? g.y + g.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 6; i += 1) {
    await page.mouse.move(x, (fromY ?? g.y + g.height / 2) + ((toY - (fromY ?? g.y + g.height / 2)) * i) / 6);
    await page.waitForTimeout(30);
  }
  await page.mouse.up();
  await page.waitForTimeout(500);
};

(async () => {
  const browser = await chromium.launch({ channel: 'chromium' });
  const page = await browser.newPage({ viewport: { width: 366, height: 800 }, deviceScaleFactor: 2 });
  await page.goto(process.env.APP_URL || 'http://127.0.0.1:5173/', { waitUntil: 'load' });
  await page.waitForTimeout(2600);
  await page.waitForSelector('.schedule-nav-fab', { timeout: 8000 });
  /* 用首页「导航课程」悬浮按钮开抽屉（课程行的点击在无头下时灵时不灵） */
  await page.locator('.schedule-nav-fab').first().click({ force: true });
  await page.waitForSelector('.sheet-panel.half', { timeout: 8000 });
  await page.waitForTimeout(500);

  const geo = () =>
    page.evaluate(() => {
      const panel = document.querySelector('.sheet-panel.half');
      const dock = document.querySelector('.m3e-dock')?.getBoundingClientRect();
      const layer = panel?.parentElement?.getBoundingClientRect();
      if (!panel) return null;
      const r = panel.getBoundingClientRect();
      return {
        h: Math.round(r.height),
        ratio: layer ? r.height / layer.height : 0,
        bottom: Math.round(r.bottom),
        dockTop: dock ? Math.round(dock.top) : null,
        expanded: panel.dataset.expanded === '1',
      };
    });

  const half = await geo();
  check(`半屏起始（高 ${half.h}px，占屏幕 ${(half.ratio * 100).toFixed(0)}%）`, half.ratio <= 0.66, '起始不是半屏');
  check(`半屏时停在底栏上方（${half.bottom} ≤ ${half.dockTop}）`, half.bottom <= half.dockTop + 1, '压住底栏');

  /* 往上拖 → 全屏 */
  await drag(page, undefined, half.h ? 120 : 120);
  const full = await geo();
  check(`往上拖后展开（高 ${full.h}px，占屏幕 ${(full.ratio * 100).toFixed(0)}% ≥ 80%）`, full.ratio >= 0.8, '没展开到全屏');
  check(`展开后仍不越过底栏（${full.bottom} ≤ ${full.dockTop}）`, full.bottom <= full.dockTop + 1, '展开后压住底栏了');
  check('面板标了 expanded', full.expanded, 'expanded 状态没标');

  /* 往下拖够多 → 关闭 */
  const g = await page.locator('.sheet-grabber').first().boundingBox();
  await drag(page, g.y + g.height / 2, g.y + g.height / 2 + 260);
  const closed = await page.evaluate(() => Boolean(document.querySelector('.sheet-layer.open .sheet-panel')));
  check('往下拖够多后抽屉关闭', !closed, '还开着');

  console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
