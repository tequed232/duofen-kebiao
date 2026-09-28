/**
 * 关于页「致谢 · 名片墙」1×3 列表版式自检：
 * 每人一整行（头像 1 栏 + 信息 2 栏），无溢出、无运行时错误，并截图。
 *
 * 怎么跑（默认端口容易让人卡住，所以写在这里）：
 *   默认连 `http://127.0.0.1:4174/` —— 那是 **`node scripts/serve-dist.mjs` 的端口**
 *   （静态服务 `dist/`，验的是生产构建）：
 *       npm run build && node scripts/serve-dist.mjs &
 *       node scripts/check-about-credits.mjs
 *   想对着别的服务跑就传 APP_URL，例如 dev server 或 preview：
 *       APP_URL=http://127.0.0.1:5173/ node scripts/check-about-credits.mjs
 *
 * 为什么特别写明：本仓库的脚本自述普遍没写前置，结果**有几个守卫长期没人跑**
 * （这条与 check-imports 此前没有被任何脚本引用）。现在它已接进本地守卫脚本，
 * 对着 preview（4173）跑。
 */
import { chromium } from 'playwright';

const appUrl = process.env.APP_URL || 'http://127.0.0.1:4174/';

const browser = await chromium.launch({ channel: 'chromium' });
// 与真机接近：412×892 dp、2x
const page = await browser.newPage({ viewport: { width: 460, height: 940 }, deviceScaleFactor: 2 });

const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

await page.goto(appUrl, { waitUntil: 'load' });
await page.waitForTimeout(2600); // 开屏动画

// 底边栏第 3 格 = 设置
await page.locator('.m3e-dock-tab').nth(2).click();
await page.waitForTimeout(1500);
// 设置 → 关于本软件
await page.locator('md-list-item', { hasText: '关于本软件' }).first().click();
await page.waitForSelector('.credits-wall', { timeout: 8000 });
await page.waitForTimeout(800);

const report = await page.evaluate(() => {
  const round = (n) => Math.round(n);
  const wall = document.querySelector('.credits-wall');
  const cards = [...document.querySelectorAll('.credit-card')];
  const box = (el) => { const r = el.getBoundingClientRect(); return { w: round(r.width), h: round(r.height), top: round(r.top), left: round(r.left) }; };
  const hasInlineSpan = cards.some((c) => /span/.test(c.style.gridColumn || ''));
  // 每行一张：按 top 分组后每组的卡片数应恒为 1
  const byTop = {};
  for (const c of cards) { const t = round(c.getBoundingClientRect().top); (byTop[t] = byTop[t] || []).push(c); }
  const rows = Object.entries(byTop).map(([top, list]) => ({
    top: Number(top),
    perRow: list.length,
    names: list.map((c) => (c.querySelector('.credit-name-row > span') || {}).textContent || ''),
  }));
  return {
    cardCount: cards.length,
    columns: getComputedStyle(wall).gridTemplateColumns,
    hasInlineSpan,
    wall: box(wall),
    cardsLayout: cards.map((c) => {
      const avatar = c.querySelector('.credit-mark');
      const body = c.querySelector('.credit-body');
      const a = avatar ? box(avatar) : null;
      const b = body ? box(body) : null;
      return {
        name: (c.querySelector('.credit-name-row > span') || {}).textContent || '',
        role: (c.querySelector('.credit-body .md-body-small') || {}).textContent || '',
        wide: c.classList.contains('wide'),
        links: c.querySelectorAll('.credit-link').length,
        card: box(c),
        avatar: a,
        body: b,
        // 头像在左、信息在右 —— 且两者垂直中心大致对齐
        avatarLeftOfBody: a && b ? a.left + a.w <= b.left + 1 : false,
        centered: a && b && b.top !== undefined ? true : false,
      };
    }),
    rows,
    overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  };
});

console.log(JSON.stringify(report, null, 2));

// 断言
const fails = [];
if (report.cardCount !== 5) fails.push(`名片数应为 5，实为 ${report.cardCount}`);
if (report.hasInlineSpan) fails.push('仍存在 grid-column 内联跨列样式');
if (report.rows.some((r) => r.perRow !== 1)) fails.push('存在一行多张名片，不是 1×3 列表');
if (report.overflowX) fails.push('出现横向溢出');
if (report.cardsLayout.some((c) => !c.avatarLeftOfBody)) fails.push('存在头像不在信息左侧的名片');
if (report.cardsLayout.some((c) => c.links === 0)) fails.push('存在没有任何平台按钮的名片');
if (errors.length) fails.push('运行时错误: ' + errors.slice(0, 3).join(' | '));

const out = process.env.OUT_DIR || 'screenshots';
await page.locator('.credits-wall').screenshot({ path: `${out}/about-credits-list.png` });
console.log(`\n截图: ${out}/about-credits-list.png`);
console.log(fails.length ? '✗ 未通过:\n - ' + fails.join('\n - ') : '✅ 通过：每行一张名片（1×3 列表），头像在左、按钮齐全、无溢出、无报错');

await browser.close();
process.exit(fails.length ? 1 : 0);
