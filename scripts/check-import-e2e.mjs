/**
 * 端到端：把「多模态模型输出的 HTML」粘进**真实导入界面**，看课表是否真的导入成功。
 *
 * 为什么要这条：`scripts/check-schedule-html.mjs` 只验解析器（剥 markdown 围栏、去首尾说明、
 * div 伪表格转 table），**从没走过真实导入 UI**。而导入教程教用户的就是「把模型回复整段粘进来」——
 * 那就得证明这条路真的通，而不是只证明解析函数对。
 *
 * 曾经它是坏的：选择器写的是 `md-text-field`，而项目的 MdTextField 包装组件渲染成
 * `md-outlined-text-field`（见 web/src/components/md.tsx）。组件更名后整条用例退化成
 * 「永远报找不到输入框」，于是它**既没有报出真问题、也没有提供任何保护**。
 * 教训：E2E 的选择器要对着真实 DOM 写，坏掉的守卫比没有守卫更危险 —— 它会让人以为覆盖到了。
 *
 * 用法：APP_URL=http://127.0.0.1:5173/ node scripts/check-import-e2e.mjs
 * 依赖：dev server + Playwright 的 chromium（与 check-schedule-html 同一套环境）
 */
import { chromium } from 'playwright';

const URL = process.env.APP_URL || 'http://127.0.0.1:5173/';

/** 模拟模型回复：带前后说明文字 + ```html 围栏 —— 与导入教程里教的情形一致 */
const MODEL_REPLY = `好的，我已经把课表整理成 HTML 表格：

\`\`\`html
<table>
  <tr><th>节次</th><th>星期一</th><th>星期二</th><th>星期三</th><th>星期四</th><th>星期五</th></tr>
  <tr>
    <td>第1-2节<br>08:30-09:55</td>
    <td>高等数学<br>张三<br>1-201<br>1-16周</td>
    <td>大学英语<br>李四<br>2-305<br>1-16周</td>
    <td></td>
    <td>程序设计基础<br>王五<br>3-101<br>1-8周</td>
    <td></td>
  </tr>
  <tr>
    <td>第3-4节<br>10:10-11:35</td>
    <td>线性代数<br>赵六<br>1-202<br>1-16周</td>
    <td></td>
    <td>人工智能导论<br>钱七<br>4-201<br>1-16周</td>
    <td></td>
    <td>大学物理<br>孙八<br>2-101<br>1-16周</td>
  </tr>
</table>
\`\`\`

以上是完整课表，请核对。`;

/** 期望导入后课表里能看到的课程 */
const EXPECTED = ['高等数学', '大学英语', '程序设计基础', '线性代数', '人工智能导论', '大学物理'];

let pass = 0;
let fail = 0;
const check = (label, ok, detail) => {
  if (ok) pass += 1;
  else fail += 1;
  console.log(`  ${ok ? '✓' : '✗'} ${label}${ok || !detail ? '' : ` —— ${detail}`}`);
};


/**
 * 打开「课表数据」面板。
 * 入口在 2026-09-29 从主页右上角的铅笔搬到了 **设置 → 课表编辑 → 课表数据与导入**，
 * 所以守卫也走真实路径。注意：设置页在 DOM 里有两份屏幕副本，非活动那份带
 * `aria-hidden="true"` 且会**拦住点击**，所以要按标题在活动屏幕里选，并 force 点击。
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
const page = await browser.newPage({ viewport: { width: 460, height: 940 }, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 140)));

await page.goto(URL, { waitUntil: 'load' });
await page.waitForTimeout(2600); // 开屏

console.log('\n[1] 打开导入面板');
await openImportSheet(page);
await page.waitForTimeout(900);
const pasteField = page.locator('md-outlined-text-field').first();
const sheetVisible = await pasteField.isVisible().catch(() => false);
check('导入面板已打开', sheetVisible, '找不到粘贴输入框（md-outlined-text-field）');

console.log('\n[2] 粘贴「模型输出」并导入');
// md-outlined-text-field 的 value 是宿主元素上的属性（Material Web），
// 且组件在宿主上监听 input（md.tsx 的 useEffect），所以对宿主写值 + 派发 input 即可。
const filled = await page.evaluate((text) => {
  const host = document.querySelector('md-outlined-text-field');
  if (!host) return 'no-host';
  host.value = text;
  host.dispatchEvent(new Event('input', { bubbles: true }));
  const inner = host.querySelector('input, textarea');
  return (inner ? inner.value : String(host.value ?? '')).length;
}, MODEL_REPLY);
check('内容已写入输入框', typeof filled === 'number' && filled > 200, String(filled));

await page.waitForTimeout(400);
const importBtn = page.locator('md-filled-tonal-button, md-text-button', { hasText: '解析并导入文本' }).first();
check('「解析并导入文本」按钮存在', (await importBtn.count()) > 0);
await importBtn.click();
await page.waitForTimeout(1800);

console.log('\n[3] 结果核对');
const snack = await page.locator('.snackbar').innerText().catch(() => '');
console.log('  snackbar:', JSON.stringify(snack.replace(/\s+/g, ' ').slice(0, 90)));

await page.keyboard.press('Escape').catch(() => {});
await page.waitForTimeout(600);
const body = await page.locator('.phone').innerText().catch(() => '');
const found = EXPECTED.filter((name) => body.includes(name));
console.log('  课表页出现的课程:', JSON.stringify(found));

check(`导入后课表里能看到全部 ${EXPECTED.length} 门课`, found.length === EXPECTED.length, `只找到 ${found.length} 门：${found.join('/')}`);
check('snackbar 报的是「已从文本导入」而不是失败', /已从文本导入|已导入/.test(snack), snack || '(无 snackbar)');
check('没有报「没有解析到课表节次」', !/没有解析到/.test(snack), snack);

/* ---------------------------------------------- [4] 反例：坏输入必须被拒绝，且不许动原课表
   这一段钉的是**拒绝行为**：粘贴「含 <table> 但不是课表」的内容时，必须报失败、
   不得把空导入说成成功、也不得把原有课表清空。

   复盘（避免以后有人来"修"一个不存在的 bug）：
   曾经怀疑这里存在「0 节次却被报成功」的缺陷。实测证明**不可达** ——
   `parseHtmlSchedule` 与 `parseTextSchedule` 最终都走 `scheduleFromCells`，
   那里有 `if (!periods.length) throw`；而新算法那条路也只在 `diagnostics.courses > 0`
   时才被采用，`periods` 与 `courses` 是同一份数据算出来的，不会出现 courses>0 而 periods 空。
   那个"缺陷"是一次反向验证的 stub 造出来的假象（stub 清空了 periods 却留着 courses）。
   所以产品侧**不加**守卫：守护一个不可达状态只会变成没人能测、也没人能删的死代码。 */
console.log('\n[4] 反例：粘贴「含 table 但不是课表」的内容');
const NOT_A_SCHEDULE = `这是模型给的表格，不过它不是课表：

<table>
  <tr><td>姓名</td><td>分数</td></tr>
  <tr><td>张三</td><td>95</td></tr>
</table>`;

await openImportSheet(page);
await page.waitForTimeout(900);
await page.evaluate((text) => {
  const host = document.querySelector('md-outlined-text-field');
  host.value = text;
  host.dispatchEvent(new Event('input', { bubbles: true }));
}, NOT_A_SCHEDULE);
await page.waitForTimeout(300);
await page.locator('md-filled-tonal-button, md-text-button', { hasText: '解析并导入文本' }).first().click();
await page.waitForTimeout(1500);
const badSnack = await page.locator('.snackbar').innerText().catch(() => '');
console.log('  snackbar:', JSON.stringify(badSnack.replace(/\s+/g, ' ').slice(0, 80)));
check('解析不出节次时必须报失败', /没有解析到/.test(badSnack), `实际：「${badSnack.trim()}」`);
check('不得把空导入说成成功', !/已从文本导入|已导入/.test(badSnack), `实际：「${badSnack.trim()}」`);

// 作者 2026-09-26 的要求：没读到可用内容必须有个**挡住视线的警告窗口**，
// 不能只飘一条会自己消失的 snackbar（用户回头只看到"课表没变"，不知道导入失败过）
// 读对话框全文：md-dialog 是自定义元素，host 的 innerText 拿不到 slot 里的内容，
// 所以直接取它光 DOM 里各 slot 节点的 textContent
const warnDialog = await page.evaluate(() => {
  const dialog = document.querySelector('md-dialog[open]');
  if (!dialog) return '';
  return Array.from(dialog.querySelectorAll('[slot]'))
    .map((node) => node.textContent ?? '')
    .join(' ');
});
check('必须弹出「没有读取到可用内容」的警告窗口', /没有读取到可用/.test(warnDialog), `对话框内容：「${warnDialog.replace(/\s+/g, ' ').slice(0, 70)}」`);
check('警告窗口要说明当前课表没被改动', /没有被改动/.test(warnDialog), '警告窗口里没有这句');
// 关闭：用真实鼠标点「知道了」。Material Web 的按钮在 slot="actions" 里，
// Playwright 的 locator.click 会误判成"被父层拦住"，所以按坐标点（跟用户点一样）。
const okBtn = await page.locator('md-dialog[open] md-text-button').last().boundingBox();
if (okBtn) await page.mouse.click(okBtn.x + okBtn.width / 2, okBtn.y + okBtn.height / 2);
await page.waitForTimeout(900);
const stillOpen = await page.evaluate(() => Boolean(document.querySelector('md-dialog[open]')));
check('点「知道了」之后警告窗口要关掉', !stillOpen, '对话框还开着');

await page.keyboard.press('Escape').catch(() => {});
await page.waitForTimeout(600);
const bodyAfter = await page.locator('.phone').innerText().catch(() => '');
const kept = EXPECTED.filter((name) => bodyAfter.includes(name));
check('失败时不得清空原有课表', kept.length === EXPECTED.length, `只剩 ${kept.length} 门：${kept.join('/')}`);

/* ---------------------------------------------- [5] JSON 也要能导入，并且真的到主页
   作者 2026-09-26 报的「HTML / JSON 导入失效，主页拿不到新课表」：JSON 那条路原来**不存在**，
   粘 JSON 会掉进纯文本解析器报「没有解析到课表节次」。这里钉两件事：
     a. 扁平 courses[] 形状（模型最常吐的）能导入；
     b. **故意不给 termStart**：主页要拿学期开始日期算"当前第几周"，缺了它周次过滤会把课全挡掉，
        表现就是"导入了但主页没变"——所以 AppState 必须从上一份/内置课表继承这个字段。
        这条断言就是为了让那种"看起来导入成功、其实主页没换"的回归没法再悄悄发生。 */
console.log('\n[5] 粘贴 JSON 课表（不给 termStart，必须继承）');
const JSON_SCHEDULE = JSON.stringify({
  term: '2026-2027-1',
  courses: [
    { name: 'JSON 程序设计', day: '星期一', period: '第1-2节', teacher: '王五', room: '3-101', weeks: '1-16' },
    { name: 'JSON 大学物理', day: '星期三', period: '第3-4节', teacher: '孙八', room: '2-101', weeks: [1, 2, 3] },
  ],
});

await openImportSheet(page);
await page.waitForTimeout(900);
await page.evaluate((text) => {
  const host = document.querySelector('md-outlined-text-field');
  host.value = text;
  host.dispatchEvent(new Event('input', { bubbles: true }));
}, JSON_SCHEDULE);
await page.waitForTimeout(300);
await page.locator('md-filled-tonal-button, md-text-button', { hasText: '解析并导入文本' }).first().click();
await page.waitForTimeout(1600);
const jsonSnack = await page.locator('.snackbar').innerText().catch(() => '');
console.log('  snackbar:', JSON.stringify(jsonSnack.replace(/\s+/g, ' ').slice(0, 90)));
check('JSON 必须报导入成功（而不是「没有解析到课表节次」）', /已从文本导入|已导入/.test(jsonSnack) && !/没有解析到/.test(jsonSnack), jsonSnack);

await page.keyboard.press('Escape').catch(() => {});
await page.waitForTimeout(700);
const jsonBody = await page.locator('.phone').innerText().catch(() => '');
check('JSON 里的课必须出现在主页课表上', jsonBody.includes('JSON 程序设计') && jsonBody.includes('JSON 大学物理'), '主页没看到 JSON 导入的课');

if (errors.length) console.log('  页面错误:', errors.slice(0, 3).join(' | '));
console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
await browser.close();
process.exit(fail ? 1 : 0);
