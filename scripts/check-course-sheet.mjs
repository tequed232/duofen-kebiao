/**
 * 守卫：课程详情弹层 = **抖音评论区式半遮蔽底部弹层**，且主操作是「导航至 <地点>」。
 *
 * 作者的要求：「点击课程后弹出的界面参照抖音评论区样式，应该半遮蔽当前屏幕，在最上方显示课程、
 * 时间等等详细信息时不更改，只将下方的导航按钮更改为『导航至 XXX（地点）』」。
 *
 * 这里兜的坏法是"静默"的：弹层还是弹层、信息也还在，只是又变回整屏，或者按钮被改回两个字 ——
 * 页面照常渲染，只有量尺寸 / 读文案才发现。
 *
 * 用法：APP_URL=http://127.0.0.1:5173/ node scripts/check-course-sheet.mjs
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

/* 点第一节课：打开课程详情弹层。课程名从被点的那一行里读出来，用于核对标题 */
const courseName = await page.evaluate(() => {
  const item = document.querySelector('.screen:not([aria-hidden="true"]) .timeline-item');
  const text = (item?.textContent ?? '').replace(/\s+/g, ' ').trim();
  item?.click();
  return text;
});
await page.waitForTimeout(900);

const info = await page.evaluate(() => {
  const phone = document.querySelector('.phone')?.getBoundingClientRect();
  const panel = document.querySelector('.sheet-panel.half, .sheet-panel');
  const rect = panel?.getBoundingClientRect();
  const action = document.querySelector('.sheet-action');
  const actionButton = action?.querySelector('md-filled-button, md-filled-tonal-button, button');
  const scrim = document.querySelector('.sheet-scrim');
  return {
    hasHalf: panel?.classList.contains('half') ?? false,
    panel: rect ? { top: rect.top, bottom: rect.bottom, height: rect.height } : null,
    phone: phone ? { top: phone.top, bottom: phone.bottom, height: phone.height } : null,
    title: document.querySelector('.sheet-title')?.textContent?.trim() ?? '',
    body: (document.querySelector('.sheet-body')?.textContent ?? '').replace(/\s+/g, ' ').slice(0, 200),
    actionText: (actionButton?.innerText ?? action?.textContent ?? '').replace(/\s+/g, ' ').trim(),
    hasActionBar: Boolean(action),
    scrimOpacity: scrim ? getComputedStyle(scrim).opacity : null,
    scrimColor: scrim ? getComputedStyle(scrim).backgroundColor : null,
  };
});

const heightRatio = info.panel && info.phone ? info.panel.height / info.phone.height : 1;
const bottomGap = info.panel && info.phone ? info.phone.bottom - info.panel.bottom : 999;
const topRatio = info.panel && info.phone ? (info.panel.top - info.phone.top) / info.phone.height : 0;

console.log(`\n课程：${courseName || '(未读到)'}`);
console.log(`  弹层高 ${info.panel?.height?.toFixed(0)} / 屏幕高 ${info.phone?.height?.toFixed(0)} = ${(heightRatio * 100).toFixed(0)}%（顶边在屏幕 ${(topRatio * 100).toFixed(0)}% 处，底边距屏底 ${bottomGap.toFixed(1)}px）`);
console.log(`  标题：${info.title}`);
console.log(`  主操作：${info.actionText || '(无)'}`);

check('弹层用的是 half 变体', info.hasHalf, '不是半屏弹层');
check(`贴底（底边距屏底 ${bottomGap.toFixed(1)}px ≤ 2）`, bottomGap <= 2, '弹层没贴底');
check(`半遮蔽（高 ${(heightRatio * 100).toFixed(0)}% ≤ 66%）`, heightRatio <= 0.66, '弹层占满整屏了');
check(`顶边在屏幕下半部分（${(topRatio * 100).toFixed(0)}% ≥ 28%）`, topRatio >= 0.28, '顶边太高，不是半遮蔽');
/* scrim 的半透明来自**颜色本身的 alpha**（32%），不是元素 opacity —— 第一次写成看 opacity
   那条断言永远为假（opacity 是 1）。这里按颜色里的 alpha 判。 */
const scrimAlpha = Number((/([\d.]+)\s*\)$/.exec(info.scrimColor ?? '') ?? [])[1] ?? 1);
check(
  `上半屏可见（scrim 颜色 alpha ${scrimAlpha} ∈ (0,1)）`,
  scrimAlpha > 0 && scrimAlpha < 1,
  `scrim=${info.scrimColor}`,
);
check(
  '顶部信息照旧：标题就是被点那节课的课程名',
  Boolean(courseName) && courseName.includes(info.title) && info.title.length > 0,
  `标题「${info.title}」在被点行「${courseName}」里找不到`,
);
check('顶部信息照旧：节次/时间还在', /\d{1,2}:\d{2}/.test(info.body), '弹层里找不到时间文本');
check('主操作条贴在弹层底部', info.hasActionBar, '没有 .sheet-action');
check(`主操作文案是「导航至 <地点>」（实际「${info.actionText}」）`, /导航至\s*\S/.test(info.actionText), '文案不对');

await page.screenshot({ path: 'build/course-sheet-half.png' });
console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
await browser.close();
process.exit(fail ? 1 : 0);
