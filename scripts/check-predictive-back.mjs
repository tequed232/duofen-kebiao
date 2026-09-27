/**
 * 守卫：可预测式返回（Android 14+ 手势返回）**提交时不许再叠一次标准弹出动画**。
 *
 * 作者 2026-09-29 反馈：「用原生可预测式返回也会导致弹出两次的冲击效果」。
 * 机制：手势期间网页已经把「上一屏」按进度放大预览（`--predictive` 0→1 时 scale 0.86→1）；
 * 原生提交时 `webView.goBack()` → `popstate` 里**又**设了一次 `exiting`，同一段过场播两遍，
 * 而且松手瞬间还会从半途跳回标准动画的起点（冲击感）。
 *
 * 这条守卫完全复刻原生那三相调用（页面里原生就是这么调的）：
 *   start() → progress(0.6) → history.back()（= 原生 goBack → popstate）
 * 然后断言提交过程中**没有出现 `.screen.exit-*`**（第二遍动画），且预览层平滑收到 scale 1。
 *
 * 用法：APP_URL=http://127.0.0.1:5173/ node scripts/check-predictive-back.mjs
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

console.log('[1] 先入栈一屏（设置 → 外观），让历史栈有 2 层');
await page.locator('.m3e-dock-tab', { hasText: '设置' }).first().click();
await page.waitForTimeout(700);
await page
  .locator('.screen:not([aria-hidden="true"]) md-list-item:has([slot="headline"]:text-is("外观"))')
  .first()
  .click({ force: true });
await page.waitForTimeout(1000);
// 注意：首页/搜索/设置 三个标签屏是常驻 DOM 的（非激活的带 aria-hidden），所以层数不是"历史栈深度"
const screensBefore = await page.locator('.screen').count();
check('上一层屏已经入栈（层数 ≥ 2）', screensBefore >= 2, `层数 ${screensBefore}`);

// 记录提交过程中的类名变化
await page.evaluate(() => {
  window.__pb = [];
  const t0 = performance.now();
  const at = () => Math.round(performance.now() - t0);
  const snap = (why) => {
    document.querySelectorAll('.screen').forEach((el) => {
      const cls = String(el.className);
      if (/exit-|enter-|peek|dir-/.test(cls)) window.__pb.push(`${at()}ms ${why} ${cls}`);
    });
    const phone = document.querySelector('.phone');
    if (phone) window.__pb.push(`${at()}ms ${why} phone=${String(phone.className)} pred=${phone.style.getPropertyValue('--predictive')}`);
  };
  new MutationObserver(() => snap('mut')).observe(document.body, { attributes: true, attributeFilter: ['class', 'style'], subtree: true });
  window.__pbSnap = snap;
});

console.log('[2] 复刻原生三相：start() → progress(0.6) → 提交（history.back()）');
const preview = await page.evaluate(() => {
  window.DuofenBack?.start?.();
  window.DuofenBack?.progress?.(0.6);
  return {
    hasApi: Boolean(window.DuofenBack),
    predictive: document.querySelector('.phone')?.classList.contains('predictive') ?? false,
  };
});
check('原生桥 window.DuofenBack 存在', preview.hasApi, '没有桥');
check('手势开始后进入预览态（.phone.predictive）', preview.predictive, `class=${preview.predictive}`);
// peek 层是 React 状态渲染的、--predictive 是 rAF 合并后写的，都要等一帧才算数
await page.waitForTimeout(180);
const peekCount = await page.locator('.screen.peek').count();
check('预览层渲染出来了（.screen.peek）', peekCount === 1, `peek=${peekCount}`);
const progressValue = await page.evaluate(() => Number(document.querySelector('.phone')?.style.getPropertyValue('--predictive') ?? 0));
check('进度写进了 --predictive（rAF 合并后）', progressValue > 0.5, `--predictive=${progressValue}`);

/**
 * 逐帧对照 Telegram 录屏（build\vtrans-sheet.png）定的口径：
 *   **正在被退出的那一屏以顶边为锚点缩下去**（顶栏钉住、内容往上收、下缘收圆角），
 *   底下那一屏原地满屏露出来。
 * 所以这里量：退出屏必须 scale < 1、transform-origin 在顶部、没有明显下移、下缘有圆角；
 * 底下那屏保持原尺寸。
 */
const during = await page.evaluate(() => {
  const read = (el) => {
    if (!el) return null;
    const cs = getComputedStyle(el);
    const m = /matrix\(([^)]+)\)/.exec(cs.transform);
    const p = m ? m[1].split(',').map((v) => Number(v.trim())) : null;
    return {
      raw: cs.transform,
      sx: p ? p[0] : 1,
      ty: p ? p[5] : 0,
      origin: cs.transformOrigin,
      bottomRadius: parseFloat(cs.borderBottomLeftRadius) || 0,
    };
  };
  // 当前屏（正在被退出的那屏）：aria-hidden="false"；非激活的标签屏是 "true"
  const top = [...document.querySelectorAll('.screen:not(.peek)')].find((el) => el.getAttribute('aria-hidden') !== 'true');
  return { outgoing: read(top), peek: read(document.querySelector('.screen.peek')) };
});
console.log('   手势中（progress=0.6）:', JSON.stringify(during));
check('被退出的屏在缩下去（scale < 1）', (during.outgoing?.sx ?? 1) < 0.99, `scaleX=${during.outgoing?.sx}`);
// 下沉幅度必须"一眼看得见"：作者 2026-09-29 反馈过"完全没有下沉效果"（系数太小）。
// 这里在 progress=0.6 处钉住下限：缩放 ≤ 0.85（即内缩 ≥ 27px @365），半径 ≥ 20px。
check('下沉幅度够大（progress=0.6 时 scale ≤ 0.85）', (during.outgoing?.sx ?? 1) <= 0.85, `scaleX=${during.outgoing?.sx}`);
check('下缘圆角够明显（≥ 20px）', (during.outgoing?.bottomRadius ?? 0) >= 20, `radius=${during.outgoing?.bottomRadius}`);
check('缩放锚点在顶边（transform-origin 的 Y 为 0）', /^\d+(\.\d+)?px 0px/.test(during.outgoing?.origin ?? ''), `origin=${during.outgoing?.origin}`);
check('没有整体下移（|translateY| ≤ 1px）', Math.abs(during.outgoing?.ty ?? 99) <= 1, `translateY=${during.outgoing?.ty}`);
check('下缘有圆角（≥ 8px）', (during.outgoing?.bottomRadius ?? 0) >= 8, `border-bottom-radius=${during.outgoing?.bottomRadius}`);
check('底下那屏原地满屏（transform 为 none）', during.peek?.raw === 'none', `peek transform=${during.peek?.raw}`);

/**
 * 两条防回归：
 *  ① 预览用**栈里那一层**（不是再渲染一份副本）—— 副本会在提交那一帧与真身重叠，实测就是"残影"；
 *  ② 被预览的那层必须**紧贴在当前屏下面**（DOM 顺序相邻），否则缩下去露出来的可能是别的标签屏
 *     （实测看到背景冒出主页就是这个）。
 */
const structure = await page.evaluate(() => {
  const all = [...document.querySelectorAll('.screen')];
  const peek = document.querySelector('.screen.peek');
  const top = all.find((el) => el.classList.contains('predictive-top'));
  return {
    total: all.length,
    peekCount: all.filter((el) => el.classList.contains('peek')).length,
    adjacent: Boolean(peek && top && peek.nextElementSibling === top),
    hiddenCount: all.filter((el) => getComputedStyle(el).visibility === 'hidden').length,
  };
});
console.log('   手势中的层结构:', JSON.stringify(structure));
check('没有为预览额外渲染副本（层数不变）', structure.total === screensBefore, `手势中层数 ${structure.total}，手势前 ${screensBefore}`);
check('只标记了一层 .peek', structure.peekCount === 1, `peek=${structure.peekCount}`);
check('被预览的那层紧贴当前屏下面（DOM 相邻）', structure.adjacent, '不相邻，可能露出别的屏');
check('其余层都隐藏了（不会透出别的标签屏）', structure.hiddenCount >= structure.total - 2, `hidden=${structure.hiddenCount} / total=${structure.total}`);

await page.waitForTimeout(150);
await page.evaluate(() => window.history.back()); // = 原生 performBack() → webView.goBack()
await page.waitForTimeout(700);

const trace = await page.evaluate(() => {
  window.__pbSnap?.('final');
  return window.__pb;
});
const exitEvents = trace.filter((l) => /exit-/.test(l));
const peekTransform = await page.evaluate(() => {
  const phone = document.querySelector('.phone');
  const top = document.querySelector('.screen:not([aria-hidden="true"]):not(.peek)');
  return {
    predictiveLeft: phone?.classList.contains('predictive') ?? false,
    commitLeft: phone?.classList.contains('predictive-commit') ?? false,
    progress: phone?.style.getPropertyValue('--predictive') ?? '',
    topTransform: top ? getComputedStyle(top).transform : 'n/a',
    screens: document.querySelectorAll('.screen').length,
    peek: document.querySelectorAll('.screen.peek').length,
  };
});

console.log('   事件轨迹（前 12 条）:');
for (const line of trace.slice(0, 12)) console.log('     ' + line);
console.log('   收尾状态:', JSON.stringify(peekTransform));

check('提交时**没有再叠一遍标准弹出动画**（无 .screen.exit-*）', exitEvents.length === 0, `出现了 ${exitEvents.length} 条：${exitEvents.slice(0, 3).join(' | ')}`);
check('提交后那一屏是"继续下沉退场"（出现过 .predictive-out）', /predictive-out/.test(trace.join(' ')), '没有 predictive-out 轨迹');
check('手势态收干净了（.phone 不再是 predictive/commit）', !peekTransform.predictiveLeft && !peekTransform.commitLeft, JSON.stringify(peekTransform));
check('只退了一层（层数 −1）', peekTransform.screens === screensBefore - 1, `前 ${screensBefore} → 后 ${peekTransform.screens}`);
check('顶层屏回到正常尺寸（transform 为 none 或单位矩阵）', /none|matrix\(1, 0, 0, 1, 0, 0\)/.test(peekTransform.topTransform), `transform=${peekTransform.topTransform}`);

if (errors.length) console.log('  页面错误:', errors.slice(0, 3).join(' | '));
await browser.close();
console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
