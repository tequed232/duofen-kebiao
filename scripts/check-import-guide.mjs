/**
 * 守卫：导入教程里给的**示例**必须真能被应用读出来，而且主路径必须是「本地文件导入」。
 *
 * 为什么需要：作者 2026-09-26 的要求是「尽量只依赖本地导入 HTML / JSON 文件，用指示教用户
 * 拿 AI 把课表照片转成可读的 HTML / JSON」。这条链路有两个很容易悄悄断掉的地方：
 *   ① 提示词里的示例和解析器的契约**不同步**（提示词改了格式、解析器没跟，用户照着做却导不进去）；
 *   ② 导入面板里的入口/文案被后来的重构吃掉，教程还在、但没人能找到。
 * 纯文案检查挡不住 ① —— 所以这里把提示词里 ```html / ```json 代码块的示例**抠出来，
 * 喂给真实的 parseScheduleHtml / parseScheduleJson**，断言至少能读出课程。
 *
 * 用法：
 *   npm run dev
 *   APP_URL=http://127.0.0.1:5173/ node scripts/check-import-guide.mjs
 */
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const APP_URL = process.env.APP_URL ?? 'http://127.0.0.1:5173/';

let pass = 0;
let fail = 0;
const check = (label, ok, detail) => {
  if (ok) pass += 1;
  else fail += 1;
  console.log(`  ${ok ? '✓' : '✗'} ${label}${ok || !detail ? '' : ` —— ${detail}`}`);
};

/* ------------------------------------------------ 1. 源码层面的口径与入口 */
const scheduleSrc = await readFile('web/src/components/schedule.tsx', 'utf8');
const screenSrc = await readFile('web/src/screens/ScheduleScreen.tsx', 'utf8');
const tutorialSrc = await readFile('web/src/screens/ImportTutorial.tsx', 'utf8');
const promptsSrc = await readFile('web/src/lib/importPrompts.ts', 'utf8');

console.log('[1] 主路径是「本地文件导入」+ 教程可见');
check('导入面板的主按钮是「导入课表文件」', /导入课表文件/.test(scheduleSrc), '找不到这个按钮文案');
check('导入面板有引导块（import-guide）', /className="import-guide"/.test(scheduleSrc), '没有 .import-guide 块');
check('引导块能打开教程（onOpenTutorial）', /onOpenTutorial/.test(scheduleSrc) && /onOpenTutorial:/.test(scheduleSrc), 'onOpenTutorial 没接上');
check(
  '课表页真的渲染了教程、并默认落在课表页签',
  /<ImportTutorial/.test(screenSrc) && /initialTab="schedule"/.test(screenSrc),
  'ScheduleScreen 里找不到 ImportTutorial / initialTab="schedule"',
);
check('教程同时给出 JSON 与 HTML 两条提示词', /SCHEDULE_JSON_PROMPT/.test(tutorialSrc) && /SCHEDULE_HTML_PROMPT/.test(tutorialSrc), '教程里少了一条提示词');
check(
  '教程把「存成文件再导入」写成第 3 步',
  /存成\s*\.html/.test(promptsSrc) || /保存成\s*\.html/.test(promptsSrc),
  '提示词/步骤里没提"存成 .html 文件"',
);
check('提示词要求输出可存成 .json', /保存成\s*\.json/.test(promptsSrc) || /存成\s*<code>?\.json/.test(promptsSrc), 'JSON 提示词没提 .json 文件');
check('支持格式提示里含 .html 与 .json', /\.html/.test(promptsSrc) && /\.json/.test(promptsSrc));

/* ------------------------------------------------ 2. 示例必须真能导入 */
const script = `
window.__guide = async () => {
  const P = await import('/src/lib/importPrompts.ts');
  const H = await import('/src/lib/scheduleHtml.ts');
  const J = await import('/src/lib/scheduleJson.ts');
  const pick = (text, lang) => {
    const re = new RegExp('\\x60\\x60\\x60' + lang + '\\\\s*([\\\\s\\\\S]*?)\\\\x60\\x60\\x60');
    const m = re.exec(text);
    return m ? m[1].trim() : null;
  };
  const html = pick(P.SCHEDULE_HTML_PROMPT, 'html');
  const json = pick(P.SCHEDULE_JSON_PROMPT, 'json');
  const count = (data) => data.periods.reduce((t, p) => t + p.days.reduce((s, d) => s + d.length, 0), 0);
  const out = { hasHtml: Boolean(html), hasJson: Boolean(json) };
  try {
    const parsed = H.parseScheduleHtml(html);
    out.html = { courses: count(parsed), names: parsed.periods.flatMap((p) => p.days.flat()).map((c) => c.name) };
  } catch (e) { out.htmlError = String(e.message); }
  try {
    const parsed = J.parseScheduleJson(json);
    out.json = { courses: count(parsed), names: parsed.periods.flatMap((p) => p.days.flat()).map((c) => c.name) };
  } catch (e) { out.jsonError = String(e.message); }
  // 顺便验一验「加了围栏 + 前后说明文字」的整段回复（用户是整段复制的）
  try {
    const wrapped = J.parseScheduleJson('好的，这是课表：\\n\\n\\x60\\x60\\x60json\\n' + json + '\\n\\x60\\x60\\x60\\n\\n请核对。');
    out.jsonWrapped = count(wrapped);
  } catch (e) { out.jsonWrappedError = String(e.message); }
  return out;
};
`;

console.log('\n[2] 提示词里的示例交给真实解析器');
const browser = await chromium.launch({ channel: 'chromium' });
const page = await browser.newPage({ viewport: { width: 460, height: 940 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 140)));
await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
await page.addScriptTag({ content: script });
const r = await page.evaluate(() => window.__guide());
await browser.close();

check('HTML 提示词里带 ```html 示例', r.hasHtml);
check('JSON 提示词里带 ```json 示例', r.hasJson);
check(
  `HTML 示例能被 parseScheduleHtml 读出课程（实得 ${r.html?.courses ?? 0} 门）`,
  (r.html?.courses ?? 0) >= 3,
  r.htmlError ?? `只读到 ${r.html?.courses ?? 0} 门`,
);
check(
  `JSON 示例能被 parseScheduleJson 读出课程（实得 ${r.json?.courses ?? 0} 门）`,
  (r.json?.courses ?? 0) >= 3,
  r.jsonError ?? `只读到 ${r.json?.courses ?? 0} 门`,
);
check(
  `JSON 示例套上「说明文字 + 围栏」也读得出（实得 ${r.jsonWrapped ?? 0} 门）`,
  (r.jsonWrapped ?? 0) >= 3,
  r.jsonWrappedError ?? '读不出',
);
check('HTML 示例里的课名与提示词一致（高等数学）', (r.html?.names ?? []).includes('高等数学'), JSON.stringify(r.html?.names ?? []));
check('JSON 示例里的课名与提示词一致（高等数学）', (r.json?.names ?? []).includes('高等数学'), JSON.stringify(r.json?.names ?? []));
if (errors.length) console.log('  页面错误:', errors.slice(0, 3).join(' | '));

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
