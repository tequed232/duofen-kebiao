/**
 * 守卫：「用户自己关掉的对话框不许自己弹回来」（作者 2026-09-29 报的"点击控件弹两次"）。
 *
 * 复现方式：打开「标记教材」对话框 → 点**遮罩**（不是按钮）关掉 → 等两秒 →
 *   旧逻辑：`closed` 事件里看到 `open` 仍为 true 就再 `show()` → 对话框弹回来（= 弹两次）
 *   新逻辑：`closed` 时把上层状态同步成 false → 不会再弹
 * 用法：APP_URL=http://127.0.0.1:5173/ node scripts/check-dialog-close.mjs
 */
import { chromium } from 'playwright';

const APP_URL = process.env.APP_URL ?? 'http://127.0.0.1:5173/';

let pass = 0;
let fail = 0;
const check = (label, ok, detail = '') => {
  if (ok) pass += 1;
  else fail += 1;
  console.log(`  ${ok ? '✓' : '✗'} ${label}${ok || !detail ? '' : ` —— ${detail}`}`);
};

const browser = await chromium.launch({ channel: 'chromium' });
const page = await browser.newPage({ viewport: { width: 412, height: 900 }, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 140)));
await page.goto(APP_URL, { waitUntil: 'load' });
await page.waitForTimeout(2600);

console.log('[1] 打开课程详情 → 教材圆钮 → 标记教材对话框');
await page.locator('.course-chip').first().click();
await page.waitForTimeout(1200);
const pencil = page.locator('.sheet-panel button').first();
check('找得到教材那颗圆钮', (await pencil.count()) > 0, '弹层里没有 button');
await pencil.click({ force: true });
await page.waitForTimeout(1200);
check('对话框打开了', (await page.locator('md-dialog[open]').count()) === 1, `open 的对话框 ${await page.locator('md-dialog[open]').count()} 个`);

console.log('\n[2] 点遮罩把它关掉（不点任何按钮）');
await page.mouse.click(6, 6); // 左上角 = 遮罩
await page.waitForTimeout(1600);
const afterMask = await page.locator('md-dialog[open]').count();
check('点遮罩后对话框关掉了', afterMask === 0, `仍有 ${afterMask} 个开着的对话框`);

console.log('\n[3] 再等两秒，看它会不会自己弹回来');
await page.waitForTimeout(2200);
const afterWait = await page.locator('md-dialog[open]').count();
check('没有自己弹回来（不是"弹两次"）', afterWait === 0, `自己又弹出来 ${afterWait} 个`);

console.log('\n[4] 但不能因此丢掉「再点一次还能打开」');
const pencil2 = page.locator('.sheet-panel button').first();
await pencil2.click({ force: true }).catch(() => {});
await page.waitForTimeout(1200);
check('再点一次仍能打开（可重复进入）', (await page.locator('md-dialog[open]').count()) === 1, '第二次点不开了');

if (errors.length) console.log('  页面错误:', errors.slice(0, 3).join(' | '));
await browser.close();
console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
