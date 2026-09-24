/**
 * 守卫：主页「导航课程」按钮 —— 它按什么规则选目的地、点了之后说什么、和「回到今天」怎么并排。
 *
 * 作者 2026-09-25 的要求：「直接在主页：回到今天的左边做一个对称的『导航课程』，
 * 并在弹出窗口中说明其为『时间上最近的课程位置』」。
 *
 * 这类需求坏起来是**静默**的：按钮挪了位置、弹层少了一个分支（比如"一周内没课"时点了没反应）、
 * 或者"最近"的口径从"正在上的那节"悄悄变成"今天第一节"—— 页面照常渲染，谁都不报错。
 * 所以这里三件事一起钉：
 *   ① 纯逻辑（esbuild 直接跑 `web/src/lib/schedule.ts`）：正在上 > 今天下一节 > 顺延到后面有课的那天；空课表返回 null；
 *   ② 接线与文案：按钮在同一行、位置在「回到今天」左边，「没得导航」也有提示，确认按钮写「导航至 <地点>」；
 *   ③ 真实渲染（给了 APP_URL 才跑，CI 的 dev server 阶段）：两个按钮同底边、间距对称，点开是那个弹层。
 *
 * 用法：node scripts/check-nav-course.mjs
 *       APP_URL=http://127.0.0.1:5173/ node scripts/check-nav-course.mjs
 */
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';

let pass = 0;
let fail = 0;
const check = (label, ok, detail = '') => {
  if (ok) pass += 1;
  else fail += 1;
  console.log(`  ${ok ? '✓' : '✗'} ${label}${ok || !detail ? '' : ` —— ${detail}`}`);
};

/* ------------------------------------------------------- ① 纯逻辑 -- */
const dir = await mkdtemp(path.join(tmpdir(), 'duofen-navcourse-'));
const bundle = path.join(dir, 'schedule.mjs');
await build({
  entryPoints: ['web/src/lib/schedule.ts'],
  bundle: true,
  format: 'esm',
  outfile: bundle,
  platform: 'neutral',
  logLevel: 'silent',
});
const S = await import(`file://${bundle}`);

const course = (name, room) => ({ name, weeks: '1-20', teacher: 'T', className: 'C', room });
const period = (period, time, days) => ({ period, time, section: 'morning', days });
const scheduleWith = (periods) => ({ owner: 't', term: 't', termStart: '2026-09-21', days: [], periods });

console.log('=== 时间解析 ===');
check(`minutesOfClock('08:30') = 510`, S.minutesOfClock('08:30') === 510, String(S.minutesOfClock('08:30')));
check(`minutesOfClock('9:05') = 545`, S.minutesOfClock('9:05') === 545, String(S.minutesOfClock('9:05')));
check(`courseClockRange('08:30-09:55') = [510, 595]`, JSON.stringify(S.courseClockRange('08:30-09:55')) === '[510,595]', JSON.stringify(S.courseClockRange('08:30-09:55')));
check('解析不了的输入不抛错（返回 NaN）', Number.isNaN(S.minutesOfClock('待定')), '应当返回 NaN');

console.log('\n=== 「最近」的口径：正在上 > 今天下一节 > 顺延 ===');
/* 周四 2026-09-24：第1-2节 08:30-09:55 早课、第5-6节 14:10-15:35 午课；周五 10:00 一节。
   注意**每节课只放在它自己的节次里** —— 一开始把两门课都塞进两个节次的 days 里，
   `coursesOfDay` 于是返回 4 条（同一门课在两个节次下各出现一次），
   量出来的是"夹具错了"，不是函数错了。 */
const emptyDays = () => [[], [], [], [], [], [], []];
const thuMorning = emptyDays();
thuMorning[3] = [course('周四早课', 'A101')];
const thuAfternoon = emptyDays();
thuAfternoon[3] = [course('周四午课', 'B202')];
const friMorning = emptyDays();
friMorning[4] = [course('周五课', 'C303')];
const schedule = scheduleWith([
  period('第1-2节', '08:30-09:55', thuMorning),
  period('第5-6节', '14:10-15:35', thuAfternoon),
  period('第3-4节', '10:00-11:25', friMorning),
]);

const inSession = S.nearestCourse(schedule, new Date('2026-09-24T08:40:00'), '2026-09-21');
check('正在上的那一节优先（08:40 → 周四早课）', inSession?.course.name === '周四早课', inSession?.course.name ?? 'null');
check('正在上时 inSession=true 且 minutesUntil=0', inSession?.inSession === true && inSession?.minutesUntil === 0, JSON.stringify({ inSession: inSession?.inSession, minutesUntil: inSession?.minutesUntil }));

const next = S.nearestCourse(schedule, new Date('2026-09-24T08:00:00'), '2026-09-21');
check('今天还没开始的最早一节（08:00 → 周四早课，30 分钟后）', next?.course.name === '周四早课' && next?.minutesUntil === 30, `${next?.course.name} / ${next?.minutesUntil}`);
check('当天就在今天（dayOffset=0）', next?.dayOffset === 0, String(next?.dayOffset));

const inSessionAfternoon = S.nearestCourse(schedule, new Date('2026-09-24T15:00:00'), '2026-09-21');
check('下午 15:00 正在上午课 → 给午课（不是早课）', inSessionAfternoon?.course.name === '周四午课', inSessionAfternoon?.course.name ?? 'null');
check('正在上时也标 inSession', inSessionAfternoon?.inSession === true, String(inSessionAfternoon?.inSession));

const afterNoon = S.nearestCourse(schedule, new Date('2026-09-24T16:30:00'), '2026-09-21');
check('今天上完了就找下一节（16:30 → 应给周五课）', afterNoon?.course.name === '周五课', afterNoon?.course.name ?? 'null');
check('顺延到周五（dayOffset=1）', afterNoon?.dayOffset === 1, String(afterNoon?.dayOffset));

const lateNight = S.nearestCourse(schedule, new Date('2026-09-24T23:30:00'), '2026-09-21');
check('深夜点也是找下一节（不应给出今天已上完的课）', lateNight?.dayOffset === 1 && lateNight?.inSession === false, `offset=${lateNight?.dayOffset}`);

check('空课表返回 null', S.nearestCourse(scheduleWith([]), new Date('2026-09-24T09:00:00'), '2026-09-21') === null, '应当返回 null');
check(
  '不变式：返回的那节一定是"还没开始"或"正在上"',
  [new Date('2026-09-24T07:00:00'), new Date('2026-09-24T09:00:00'), new Date('2026-09-24T13:00:00'), new Date('2026-09-24T20:00:00')].every((now) => {
    const r = S.nearestCourse(schedule, now, '2026-09-21');
    if (!r) return false;
    return r.inSession || r.dayOffset > 0 || r.minutesUntil > 0;
  }),
  '出现了"已经上完"的结果',
);

/* ------------------------------------------------------- ② 接线与文案 -- */
console.log('\n=== 接线与文案 ===');
const screen = await readFile('web/src/screens/ScheduleScreen.tsx', 'utf8');
const css = await readFile('web/src/theme/components.css', 'utf8');

check('主页有「导航课程」按钮', /label="导航课程"/.test(screen), '找不到这个按钮');
check('用新函数算目标（nearestCourse）', /nearestCourse\(schedule,\s*new Date\(\)/.test(screen), '没有用 nearestCourse，或参考时刻不是"现在"');
check(
  '按钮排在「回到今天」左边',
  screen.indexOf('schedule-nav-fab') > -1 && screen.indexOf('schedule-nav-fab') < screen.indexOf('schedule-today-fab'),
  '顺序不对 —— 要求是在回到今天的左边',
);
check('两个按钮在同一行容器里', /schedule-fab-row[\s\S]{0,400}schedule-nav-fab[\s\S]{0,200}schedule-today-fab/.test(screen), '不在同一个 flex 行里');
check('.schedule-fab-row 用 flex + gap 保证对称', /\.schedule-fab-row\s*\{[^}]*display:\s*flex[^}]*gap:\s*\d+px/.test(css), 'CSS 里没有这一行容器');
check(
  '「一周内没课」也有提示（点了不能没反应）',
  /navTarget === null[\s\S]{0,300}没有可导航的课/.test(screen),
  '缺少空态分支',
);
check('确认按钮写成「导航至 <地点>」', /导航至\s*\{?[\s\S]{0,60}room/.test(screen), '确认按钮文案不对');
check('弹层里解释了"最近"是怎么算的', /时间上离现在最近/.test(screen) && /正在上的那一节优先/.test(screen), '缺少口径说明（作者要求优化表述）');
check('弹层给出课名/节次/时间/地点四要素', /navTarget\.course\.name/.test(screen) && /navTarget\.period/.test(screen) && /navTarget\.time/.test(screen) && /navTarget\.course\.room/.test(screen), '四要素不全');

/* ------------------------------------------------------- ③ 真实渲染（可选） -- */
if (process.env.APP_URL) {
  console.log('\n=== 真实渲染 ===');
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ channel: 'chromium' });
  const page = await browser.newPage({ viewport: { width: 460, height: 940 }, deviceScaleFactor: 2 });
  await page.goto(process.env.APP_URL, { waitUntil: 'load' });
  await page.waitForTimeout(2800);
  await page.waitForSelector('.schedule-fab-row', { timeout: 8000 });

  const rects = await page.evaluate(() => {
    const box = (sel) => {
      const r = document.querySelector(sel).getBoundingClientRect();
      return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
    };
    const nav = box('.schedule-nav-fab');
    const today = box('.schedule-today-fab');
    return { nav, today, gap: today.x - nav.right };
  });
  check(
    `两个按钮同一底边（差 ${Math.abs(rects.nav.bottom - rects.today.bottom).toFixed(2)}px < 1.5）`,
    Math.abs(rects.nav.bottom - rects.today.bottom) < 1.5,
    '没有对齐',
  );
  check('「导航课程」确实在「回到今天」左边', rects.nav.x + rects.nav.width <= rects.today.x + 1.5, `nav.right=${rects.nav.right} today.x=${rects.today.x}`);
  check(`两者间距 ≈ 12px（实测 ${rects.gap.toFixed(1)}px）`, Math.abs(rects.gap - 12) < 4, '间距不是 12px');

  await page.locator('.schedule-nav-fab').click();
  await page.waitForTimeout(700);
  const text = await page.evaluate(() => document.body.innerText);
  /* 真实时钟下可能是"有目标"也可能是"一周内没课"（第 4 周周五之后、第 5 周只有部分课），
     两种状态都必须是**有话说**的；目标分支另用固定时钟单独验一遍。 */
  const targetBranch = /时间上离现在最近/.test(text) && /导航至/.test(text);
  const emptyBranch = /没有可导航的课/.test(text);
  check('点开后弹出「导航课程」弹层（有目标 / 空态二者之一）', targetBranch || emptyBranch, '弹层内容不符合任何一个状态');
  const confirm = await page.evaluate(() => {
    const buttons = [...document.querySelectorAll('md-filled-button, button')];
    const hit = buttons.find((b) => /导航至/.test(b.innerText || ''));
    return hit ? hit.innerText.replace(/\s+/g, ' ').trim() : '(没找到)';
  });
  check(`确认按钮是「导航至 <地点>」（实际「${confirm}」）`, /^导航至/.test(confirm), '文案不对');
  await page.screenshot({ path: 'build/nav-course-dialog.png' });

  /* 固定时钟：2026-09-24（第 4 周周四）08:40 —— 内置课表这一节"智慧财经素养"正在上，
     这一遍必须走**目标分支**，把课名/节次/地点都渲染出来。 */
  const p2 = await browser.newPage({ viewport: { width: 460, height: 940 }, deviceScaleFactor: 2 });
  await p2.addInitScript(() => {
    const Real = Date;
    const fixed = new Real('2026-09-24T08:40:00').getTime();
    class FakeDate extends Real {
      constructor(...args) {
        if (args.length === 0) super(fixed);
        else super(...args);
      }
      static now() {
        return fixed;
      }
    }
    // @ts-ignore
    window.Date = FakeDate;
  });
  await p2.goto(process.env.APP_URL, { waitUntil: 'load' });
  await p2.waitForTimeout(2800);
  await p2.locator('.schedule-nav-fab').click();
  await p2.waitForTimeout(700);
  const text2 = await p2.evaluate(() => document.body.innerText);
  check('固定时钟（周四 08:40）走目标分支并说明口径', /时间上离现在最近/.test(text2) && /正在上的那一节优先/.test(text2), '口径说明缺失');
  check('目标分支给出课名与节次/时间', /08:30-09:55/.test(text2) && /正在上|分钟后开始/.test(text2), '缺少这一节的具体信息');
  check('目标分支的确认按钮带上了地点', /导航至\s*\S/.test(text2) && !/导航至 上课地点/.test(text2), '没有把教室写进按钮');
  /* 文案里不许露出 Markdown 记号：JSX 是 HTML，`**加粗**` 不会渲染，会原样显示成星号。
     第一版就踩了这个 —— 弹层里写着「**时间上离现在最近的那节课**」。 */
  const rawMarkdown = await p2.evaluate(() => (document.body.innerText.match(/\*\*|^#{1,3}\s/m) ?? []).length);
  check('弹层文案里没有露出 Markdown 记号', rawMarkdown === 0, `发现 ${rawMarkdown} 处 ** 或 # 标题`);
  await p2.screenshot({ path: 'build/nav-course-target.png' });
  await browser.close();
}

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
