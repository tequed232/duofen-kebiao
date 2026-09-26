/**
 * 守卫：设置 → 主页 里的「显示『导航课程』」开关真的控制主页那颗按钮。
 *
 * 为什么需要：作者 2026-09-29 要求「在设置里创建一个空间，有开关和容器说明，
 * 控制主页里『导航课程』的存在：打开就显示、关闭就不显示」。
 * 这类开关最容易变成「设置里能拨、主页没反应」—— 界面照常渲染，谁都不报错。
 * 所以这里走**真实点击链路**：设置页 → 主页分组 → 拨开关 → 回主页看按钮在不在，
 * 最后再拨回来（把状态还原，避免影响其它守卫）。
 *
 * 三个踩过的坑（都写在这儿，省得下次重踩）：
 *   ① 屏幕是常驻 DOM：同一块设置在 DOM 里有两份，非活动那份带 `aria-hidden="true"`。
 *      定位一律加 `.screen:not([aria-hidden="true"])`（与 check-settings-groups 同一套写法）。
 *   ② `md-switch` 上的 aria-label 会被渲染成 `data-aria-label`，按 aria 属性选不中；
 *      所以设置页那颗开关带了稳定的 `id="home-nav-course-switch"`。
 *   ③ 两份屏幕叠在一起时，底下那份会「拦点击」，所以点击用 force: true。
 *
 * 用法：APP_URL=http://127.0.0.1:5173/ node scripts/check-home-nav-toggle.mjs
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
const page = await browser.newPage({ viewport: { width: 420, height: 900 }, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 140)));

/** 活动屏幕（非 aria-hidden 的那一份） */
const active = () => page.locator('.screen:not([aria-hidden="true"])');
const row = (title) =>
  active().locator(`md-list-item:has([slot="headline"]:text-is("${title}"))`).first();
const navSwitch = () => active().locator('#home-nav-course-switch').first();
const navFabCount = () => page.locator('.schedule-nav-fab').count();
const openTab = async (tab) => {
  await page.locator('.m3e-dock-tab', { hasText: tab }).first().click();
  await page.waitForTimeout(800);
};

await page.goto(APP_URL, { waitUntil: 'load' });
await page.waitForTimeout(2600);

console.log('[1] 默认状态：主页有「导航课程」');
check('默认显示「导航课程」', (await navFabCount()) > 0, '默认就找不到这颗按钮');

console.log('\n[2] 设置 → 主页：这一栏要有开关 + 容器说明');
await openTab('设置');
check('设置首页能看到「主页」这一栏', (await row('主页').count()) > 0, '找不到主页分组入口');
await row('主页').click({ force: true, timeout: 5000 });
await page.waitForTimeout(900);

const sectionText = await active().last().innerText();
check('分组里有「显示『导航课程』」开关条目', /显示「导航课程」/.test(sectionText), sectionText.slice(0, 80));
check('有容器说明（浮动按钮区）', /主页浮动按钮区/.test(sectionText), '没看到浮动按钮区的说明');
check('开关本体存在', (await navSwitch().count()) > 0, '找不到 #home-nav-course-switch');

console.log('\n[3] 关掉它：主页不该再有那颗按钮');
await navSwitch().click({ force: true, timeout: 5000 });
await page.waitForTimeout(900);
await openTab('首页');
check('关闭后主页没有「导航课程」', (await navFabCount()) === 0, '按钮还在');

console.log('\n[4] 再打开：按钮回来（并把状态还原）');
await openTab('设置');
await row('主页').click({ force: true, timeout: 5000 });
await page.waitForTimeout(900);
await navSwitch().click({ force: true, timeout: 5000 });
await page.waitForTimeout(900);
await openTab('首页');
check('重新打开后主页又有「导航课程」', (await navFabCount()) > 0, '按钮没回来');

if (errors.length) console.log('\n页面错误:', errors.slice(0, 3).join(' | '));
await browser.close();
console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
