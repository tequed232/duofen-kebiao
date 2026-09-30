/**
 * 守卫：教材区的「添加 / 修改」形状 —— 作者要求
 *   「添加课程可以只在无已经添加的课本时显示（选图识别/手动填写），
 *     若已有被添加的教材，只在旁边显示一个直径和课本容器相等的圆形修改按钮」。
 *
 * 静默坏法：两个入口一直在（学生看到"添加"却已经加过）、或者那颗圆钮被换成普通图标按钮
 * （40px 触摸盒，直径与课本封面不等）—— 页面照常渲染，只有量尺寸才发现。
 *
 * 判定：真实渲染 + 真走一遍"手动填写"把教材存进去，再量：
 *   ① 无教材：添加入口可见（选图识别封面 / 手动填写），没有 .textbook-edit；
 *   ② 有教材：添加入口消失，只剩一颗 .textbook-edit；
 *   ③ 那颗钮是正圆（|宽−高| ≤ 2px）且**直径 ≈ 课本封面容器的高度**（|差| ≤ 2px）。
 *
 * 用法：APP_URL=http://127.0.0.1:5173/ node scripts/check-textbook-button.mjs
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

/** 打开第一节课的详情弹层（教材区就在里面） */
const openCourse = async () => {
  await page.evaluate(() => {
    document.querySelector('.screen:not([aria-hidden="true"]) .timeline-item')?.click();
  });
  await page.waitForTimeout(900);
};
const state = async () => {
  const add = await page.evaluate(() =>
    [...document.querySelectorAll('.sheet-body md-filled-tonal-button, .sheet-body md-outlined-button')]
      .filter((el) => el.getBoundingClientRect().width > 4)
      .map((el) => el.innerText.replace(/\s+/g, ' ').trim()),
  );
  const circle = await page.evaluate(() => {
    const edit = document.querySelector('.textbook-edit');
    if (!edit) return null;
    const rect = edit.getBoundingClientRect();
    const cover = document.querySelector('.textbook-card .textbook-cover')?.getBoundingClientRect();
    return {
      w: rect.width,
      h: rect.height,
      coverH: cover?.height ?? null,
      label: edit.getAttribute('aria-label'),
    };
  });
  return { add, circle };
};

await openCourse();

/* 守卫必须可重复跑：应用状态存在 IndexedDB 里，上一轮留下的教材要清掉，
   否则第二次跑就落在"已有教材"分支上（第一次跑就是这么被自己绊倒的）。 */
const clearBook = async () => {
  if ((await page.locator('.textbook-edit').count()) > 0) {
    await page.locator('.textbook-edit').first().click();
    await page.waitForTimeout(700);
    await page.locator('md-dialog md-text-button:has-text("移除教材")').first().click();
    await page.waitForTimeout(900);
  }
};
await clearBook();

const before = await state();
console.log(`\n[无教材] 添加入口：${JSON.stringify(before.add)}，圆钮：${before.circle ? '有' : '无'}`);
check('无教材时显示「选图识别封面」入口', before.add.some((t) => t.includes('选图识别封面')), '入口不见了');
check('无教材时显示「手动填写」入口', before.add.some((t) => t.includes('手动填写')), '入口不见了');
check('无教材时没有圆形修改按钮', before.circle === null, '不该出现圆钮');

/* 真走一遍手动填写：打开对话框 → 填书名 → 保存并标记 */
/* 半屏弹层挂在手机框里、不在 .screen 内，所以这里不能用 .screen 作用域 */
await page.locator('.sheet-body md-outlined-button:has-text("手动填写")').first().click();
await page.waitForTimeout(700);
await page.locator('md-dialog input, md-dialog textarea').first().fill('高等数学（上册）');
await page.locator('md-dialog md-text-button:has-text("保存并标记")').first().click();
await page.waitForTimeout(1100);

const after = await state();
console.log(`[有教材] 添加入口：${JSON.stringify(after.add)}，圆钮：${after.circle ? JSON.stringify(after.circle) : '无'}`);
check('有教材后「选图识别封面」入口消失', !after.add.some((t) => t.includes('选图识别封面')), '入口还在');
check('有教材后「手动填写」入口消失', !after.add.some((t) => t.includes('手动填写')), '入口还在');
check('有教材时只剩一颗圆形修改按钮', Boolean(after.circle), '没找到 .textbook-edit');
if (after.circle) {
  const { w, h, coverH } = after.circle;
  check(`那颗钮是正圆（宽 ${w.toFixed(1)} / 高 ${h.toFixed(1)}，|差| ≤ 2）`, Math.abs(w - h) <= 2, '不是正圆');
  check(
    `直径 ≈ 课本封面容器高（${h.toFixed(1)} vs ${coverH?.toFixed(1) ?? '?'}，|差| ≤ 2）`,
    coverH !== null && Math.abs(h - coverH) <= 2,
    '直径与课本容器不相等',
  );
}
await page.screenshot({ path: 'build/textbook-edit-circle.png' });
/* 收尾：把这一轮加进去的教材清掉，保证下次跑还是从"无教材"开始 */
await clearBook();
console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
await browser.close();
process.exit(fail ? 1 : 0);
