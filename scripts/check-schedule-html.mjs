/**
 * 课表 HTML 解析的回归测试（真实浏览器环境跑，因为解析依赖 DOMParser）。
 *
 * 为什么需要：新增的「兼容多模态模型输出」是纯字符串/正则逻辑，
 * 只有编译通过是不够的 —— 围栏剥离、首尾说明文字、嵌套 div 伪表格都极易写错，
 * 而且写错的表现是「用户粘进来解析不出课」，很难从报错里看出根因。
 *
 * 关于单元格格式：解析器按既定契约要求**字段分行**（`<br>` 或 ` ` 换行，
 * 也接受 `/` `|` 分隔），这与「导入教程」里给模型的提示词一致 ——
 * 提示词明确要求一门课一格、每格四行。所以用例都按这个契约写。
 *
 * 用法：
 *   npm run dev                 # 另开一个终端（解析要从源码导入 TS，必须走 dev server）
 *   node scripts/check-schedule-html.mjs
 *   APP_URL=http://127.0.0.1:5174/ node scripts/check-schedule-html.mjs
 */
import { chromium } from 'playwright';

const APP_URL = process.env.APP_URL ?? 'http://127.0.0.1:5173/';

// 一格里四个字段，按解析契约用 <br> 分行
const cell = (name, teacher, room, weeks) => `${name}<br>${teacher}<br>${room}<br>${weeks}`;

const cases = [
  {
    name: '教务导出的网格表（基准）',
    html: `<table>
      <tr><th>节次</th><th>星期一</th><th>星期二</th><th>星期三</th><th>星期四</th><th>星期五</th></tr>
      <tr><td>第1-2节<br>08:30-09:55</td>
          <td>${cell('高等数学', '张三', '1-201', '1-16周')}</td>
          <td>${cell('大学英语', '李四', '2-305', '1-16周')}</td>
          <td></td><td>${cell('程序设计', '王五', '3-101', '1-8周')}</td><td></td></tr>
      <tr><td>第3-4节<br>10:10-11:35</td>
          <td>${cell('线性代数', '赵六', '1-202', '1-16周')}</td>
          <td></td><td>${cell('体育', '钱七', '操场', '1-16周')}</td><td></td><td>${cell('思想道德与法治', '孙八', '4-201', '1-16周')}</td></tr>
    </table>`,
    expect: { minCourses: 5, layout: 'grid' },
  },
  {
    name: '模型输出带 ```html 围栏与前后说明文字',
    html: `好的，这是转换结果：

\`\`\`html
<table>
<tr><th>节次</th><th>星期一</th><th>星期二</th><th>星期三</th></tr>
<tr><td>第1-2节 08:30-09:55</td>
    <td>${cell('高等数学', '张三', '1-201', '1-16周')}</td>
    <td></td>
    <td>${cell('大学英语', '李四', '2-305', '1-16周')}</td></tr>
</table>
\`\`\`

希望对你有帮助！`,
    expect: { minCourses: 2, layout: 'grid', normalized: '围栏' },
  },
  {
    name: '模型输出无围栏、前后带解释文字',
    html: `我已按你的要求整理成表格：<table><tr><th>节次</th><th>星期一</th><th>星期二</th><th>星期三</th></tr><tr><td>第1-2节 08:30-09:55</td><td>${cell('高等数学', '张三', '1-201', '1-16周')}</td><td>${cell('大学物理', '李四', '2-101', '1-16周')}</td><td></td></tr></table>以上是完整课表，请核对。`,
    expect: { minCourses: 2, layout: 'grid', normalized: '说明文字' },
  },
  {
    name: '嵌套 div 伪表格（正则会在第一个内层 </div> 截断）',
    html: `<div role="row"><div role="cell">节次</div><div role="cell">星期一</div><div role="cell">星期二</div><div role="cell">星期三</div></div>
      <div role="row"><div role="cell">第1-2节 08:30-09:55</div><div role="cell">${cell('高等数学', '张三', '1-201', '1-16周')}</div><div role="cell"></div><div role="cell">${cell('大学英语', '李四', '2-305', '1-16周')}</div></div>
      <div role="row"><div role="cell">第3-4节 10:10-11:35</div><div role="cell">${cell('线性代数', '赵六', '1-202', '1-16周')}</div><div role="cell">${cell('体育', '钱七', '操场', '1-16周')}</div><div role="cell"></div></div>`,
    expect: { minCourses: 4, normalized: 'div 网格' },
  },
  {
    name: 'ul/li 列表：li 内用换行分隔字段 → 拆成多格',
    html: `<ul>
      <li>${cell('高等数学', '张三', '1-201', '星期一 第1-2节 1-16周')}</li>
      <li>${cell('大学英语', '李四', '2-305', '星期二 第1-2节 1-16周')}</li>
      <li>${cell('线性代数', '赵六', '1-202', '星期三 第3-4节 1-16周')}</li>
    </ul>`,
    expect: { minCourses: 2, normalized: '列表' },
  },
  {
    name: '整页教务导出：学期与课表都在，正常解析',
    html: `<!DOCTYPE html><html><head><title>课表</title></head><body>
      <h1>2026-2027学年第一学期课表</h1>
      <table><tr><th>节次</th><th>星期一</th><th>星期二</th><th>星期三</th></tr>
      <tr><td>第1-2节 08:30-09:55</td><td>${cell('高等数学', '张三', '1-201', '1-16周')}</td><td></td><td>${cell('大学英语', '李四', '2-305', '1-16周')}</td></tr></table>
      </body></html>`,
    // 「学年」是两个字符：旧的 学?年? 正则对不上，这里钉住
    expect: { minCourses: 2, termIncludes: '2026' },
  },
  {
    name: '斜杠分隔字段（另一种常见写法）',
    html: `<table><tr><th>节次</th><th>星期一</th><th>星期二</th><th>星期三</th></tr>
      <tr><td>第1-2节 08:30-09:55</td><td>高等数学/张三/1-201/1-16周</td><td>大学物理/李四/2-101/1-16周</td><td></td></tr></table>`,
    expect: { minCourses: 2 },
  },
  {
    name: '不含课程名的空表不应误报',
    html: '<table><tr><th>节次</th><th>星期一</th><th>星期二</th><th>星期三</th></tr><tr><td>第1-2节 08:30-09:55</td><td></td><td></td><td></td></tr></table>',
    expect: { maxCourses: 0 },
  },
  {
    name: '完全不是课表的 HTML 不应报错',
    html: '<div><p>这是一段普通文字，没有任何课程信息。</p></div>',
    expect: { maxCourses: 0 },
  },
];

// 在页面里 import 源码模块来跑：解析依赖 DOMParser，Node 里没有
const script = `
  window.__check = async (cases) => {
    const { parseScheduleHtml } = await import('/src/lib/scheduleHtml.ts');
    return cases.map((c) => {
      try {
        const parsed = parseScheduleHtml(c.html);
        return {
          name: c.name,
          courses: parsed.diagnostics.courses,
          layout: parsed.diagnostics.layout,
          term: parsed.term,
          normalization: parsed.diagnostics.normalization || [],
          expect: c.expect,
        };
      } catch (error) {
        return { name: c.name, error: String((error && error.message) || error), expect: c.expect };
      }
    });
  };
`;

let pass = 0;
let fail = 0;
const check = (label, ok, detail) => {
  if (ok) {
    pass += 1;
    console.log(`  ✓ ${label}`);
  } else {
    fail += 1;
    console.log(`  ✗ ${label}${detail ? ` —— ${detail}` : ''}`);
  }
};

const browser = await chromium.launch({ channel: 'chromium' });
const page = await browser.newPage();
await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
await page.addScriptTag({ content: script });
const results = await page.evaluate((c) => window.__check(c), cases);
await browser.close();

if (!Array.isArray(results) || results.length !== cases.length) {
  console.error(`✗ 用例没有全部执行：期望 ${cases.length} 条，实际 ${Array.isArray(results) ? results.length : '非数组'}`);
  process.exit(1);
}

for (const r of results) {
  console.log(`\n[${r.name}]`);
  if (r.error) {
    check('解析未抛错', false, r.error);
    continue;
  }
  const e = r.expect;
  if (e.minCourses !== undefined) check(`识别到 ≥${e.minCourses} 门课`, r.courses >= e.minCourses, `实际 ${r.courses} 门`);
  if (e.maxCourses !== undefined) check(`识别到 ≤${e.maxCourses} 门课`, r.courses <= e.maxCourses, `实际 ${r.courses} 门`);
  if (e.layout) check(`布局识别为 ${e.layout}`, r.layout === e.layout, `实际 ${r.layout}`);
  if (e.normalized) {
    check(`归一化命中「${e.normalized}」`, r.normalization.some((n) => n.includes(e.normalized)), `实际 [${r.normalization.join(' / ')}]`);
  }
  if (e.termIncludes) check(`学期信息保留（含 ${e.termIncludes}）`, String(r.term).includes(e.termIncludes), `实际「${r.term}」`);
}

console.log(`\n结果：${pass} 通过 / ${fail} 失败（共 ${cases.length} 个用例）`);
process.exit(fail ? 1 : 0);
