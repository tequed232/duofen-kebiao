/**
 * 守卫：课本封面的「本地导入 → 识别 → 进对话框」这条路（相机/相册两条入口）。
 *
 * 为什么要有它：作者要求「课本封面可以通过调用系统原生相机拍照导入，直接点击主页的课程，
 * 然后在控件中显示对应课本和对应封面」。真机侧已验证「点按钮 → 系统相机被拉起 → 拍完回到应用」，
 * 但**相机 UI 无法在自动化里稳定按快门**，所以网页这一半（选到文件之后：压缩 → 存封面 →
 * 打开「标记教材」对话框并把封面显示出来）必须由这条守卫兜住 —— 它用 Playwright 的
 * filechooser 拦截，喂一张真实图片进去，断言结果。
 *
 * 用法：APP_URL=http://127.0.0.1:5173/ node scripts/check-cover-import.mjs
 */
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const APP_URL = process.env.APP_URL ?? 'http://127.0.0.1:5173/';
/** 用仓库里现成的一张图当"课本封面"（内容是什么不重要，链路走通就行） */
const IMAGE = { name: 'cover.png', mimeType: 'image/png', buffer: readFileSync('web/public/icon-192.png') };

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

/** 打开一门课；如果它已有教材就先移除（添加入口只在没有教材时出现） */
const openCourseWithoutTextbook = async () => {
  await page.locator('.course-chip').first().click();
  await page.waitForTimeout(1200);
  const pencil = page.locator('.sheet-panel button.textbook-edit');
  if (await pencil.count()) {
    await pencil.first().click();
    await page.waitForTimeout(1000);
    const remove = page.locator('md-dialog[open] md-text-button', { hasText: '移除教材' });
    if (await remove.count()) {
      await remove.first().click();
      await page.waitForTimeout(1400);
    }
  }
};

const dialogCover = () =>
  page.evaluate(() => {
    const dialog = document.querySelector('md-dialog[open]');
    const img = dialog?.querySelector('img');
    return {
      open: Boolean(dialog),
      headline: dialog?.querySelector('[slot="headline"]')?.textContent?.trim().slice(0, 12) ?? '',
      coverSrc: (img?.getAttribute('src') ?? '').slice(0, 20),
      coverW: img ? Math.round(img.getBoundingClientRect().width) : 0,
      hasTitle: (dialog?.querySelector('md-outlined-text-field')?.value ?? '').length > 0,
    };
  });

console.log('[1] 相机入口（capture=environment）→ 喂一张图 → 封面进对话框');
await openCourseWithoutTextbook();
const cameraBtn = page.locator('.sheet-panel md-filled-tonal-button, .sheet-panel md-outlined-button', { hasText: '拍照识别封面' });
check('「拍照识别封面」按钮存在（没有教材时才出现）', (await cameraBtn.count()) > 0, '找不到按钮');

const [chooser] = await Promise.all([page.waitForEvent('filechooser', { timeout: 8000 }), cameraBtn.first().click()]);
check('点按钮真的打开了文件选择器（capture 走同一条 onShowFileChooser）', Boolean(chooser), '没有 filechooser 事件');
const accept = chooser ? await chooser.element().getAttribute('accept') : null;
check('accept 限定图片', accept === 'image/*', `accept=${accept}`);
/**
 * `capture` 不能从 Playwright 的 filechooser 元素上读：那返回的是它**自己造的**代理 input，
 * 只有 accept 会被带过来。所以这条改为在源码层钉住（真机上"点它确实调起了系统相机"已实测两次）。
 */
const imagingSrc = readFileSync('web/src/lib/imaging.ts', 'utf8');
const scheduleSrc = readFileSync('web/src/components/schedule.tsx', 'utf8');
check(
  '相机入口确实传了 capture=environment（源码层）',
  /input\.capture\s*=.*environment/.test(imagingSrc) &&
    /captureImageFile[\s\S]{0,200}capture:\s*'environment'/.test(imagingSrc) &&
    /captureCover\('camera'\)/.test(scheduleSrc),
  'imaging.ts / schedule.tsx 里的 capture 接线不完整',
);
if (chooser) await chooser.setFiles(IMAGE);
await page.waitForTimeout(1800);

const state = await dialogCover();
console.log('   对话框:', JSON.stringify(state));
check('「标记教材」对话框打开了', state.open, '没开');
check('封面是本地图片（blob/data）且渲染出来了', /^(blob:|data:image)/.test(state.coverSrc) && state.coverW > 0, `src=${state.coverSrc} 宽=${state.coverW}`);

console.log('\n[2] 相册入口（无 capture）→ 同一张图 → 封面同样进对话框');
await page.keyboard.press('Escape').catch(() => {});
await page.waitForTimeout(600);
await page.evaluate(() => {
  const d = document.querySelector('md-dialog[open]');
  if (d?.close) d.close();
});
await page.waitForTimeout(900);
// 这门课现在"有教材"了（上一步存了封面）→ 先移除，再加一次
await openCourseWithoutTextbook();
const albumBtn = page.locator('.sheet-panel md-filled-tonal-button, .sheet-panel md-outlined-button', { hasText: '从相册选图' });
check('「从相册选图」按钮存在', (await albumBtn.count()) > 0, '找不到按钮');
const [chooser2] = await Promise.all([page.waitForEvent('filechooser', { timeout: 8000 }), albumBtn.first().click()]);
const capture2 = chooser2 ? await chooser2.element().getAttribute('capture') : null;
check('相册入口不带 capture（弹系统文件/相册选择器）', capture2 === null, `capture=${capture2}`);
if (chooser2) await chooser2.setFiles(IMAGE);
await page.waitForTimeout(1800);
const state2 = await dialogCover();
console.log('   对话框:', JSON.stringify(state2));
check('相册那条路也能把封面带进对话框', state2.open && state2.coverW > 0, JSON.stringify(state2));

if (errors.length) console.log('  页面错误:', errors.slice(0, 3).join(' | '));
await browser.close();
console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
