/**
 * 守卫：设置页的**分组结构**（作者 2026-09-24 要求把条目按主题归拢）。
 *
 * 为什么要有它：分组是"看着对不对"的东西，谁都能顺手把一行挪回上面 ——
 * 而这类改动**不会报任何错**：页面照常渲染，只是作者要的归类散了。
 * 所以把「哪一组、什么顺序、谁属于谁、每组卡片圆角成套」都钉成可判定的断言。
 *
 * 判定方式：直接读 `SettingsScreen.tsx` 的源码文本，取每个 `SectionHeader title=` 的**行号**、
 * 每个 `slot="headline"` 的行号，然后用"行号落在哪两个 header 之间"来判断归属 ——
 * 不依赖渲染，也不需要浏览器。同一份断言在真机/浏览器上等于"从上往下看的样子"。
 *
 * 用法：node scripts/check-settings-groups.mjs
 */
import { readFile } from 'node:fs/promises';

const FILE = 'web/src/screens/SettingsScreen.tsx';

/** 分组口径（改这里 = 改产品决定；守卫与实现共用同一份顺序） */
const GROUPS = [
  { title: '外观', rows: ['深色模式', '界面缩放', '底栏色散', '底栏散射', '性能模式'] },
  { title: '实时通知', rows: ['上课提醒（灵动岛）', '台词管理', '实时通知（流体云）自检'] },
  { title: '屏幕安全区', rows: ['上端安全区', '下端安全区'] },
  { title: '导航与学校', rows: ['默认跳转地图', '学校名称'] },
  { title: '图像识别与资源', rows: ['本地识别', '允许联网取识别资源', '接口配置'] },
  { title: '关于', rows: ['关于本软件', '开源相关'] },
];

let pass = 0;
let fail = 0;
const check = (label, ok, detail = '') => {
  if (ok) pass += 1;
  else fail += 1;
  console.log(`  ${ok ? '✓' : '✗'} ${label}${ok || !detail ? '' : ` —— ${detail}`}`);
};

const source = await readFile(FILE, 'utf8');
const lines = source.split(/\r?\n/);

/** header 行号（1 基）与标题 */
const headers = [];
lines.forEach((line, index) => {
  const hit = /<SectionHeader[^>]*title="([^"]+)"/.exec(line);
  if (hit) headers.push({ title: hit[1], line: index + 1 });
});

/** 条目行号 + 圆角类 */
const rows = [];
lines.forEach((line, index) => {
  const headline = /slot="headline">([^<]+)</.exec(line);
  if (!headline) return;
  // 圆角类在开标签里；`<md-list-item` 可能跨行，所以先往回找到开标签，再在标签闭合前找类名
  let radius = '';
  let tagStart = -1;
  for (let i = index; i >= 0 && i > index - 14; i -= 1) {
    if (lines[i].includes('<md-list-item')) {
      tagStart = i;
      break;
    }
  }
  if (tagStart >= 0) {
    for (let i = tagStart; i <= index; i += 1) {
      const hit = /rounded-(outer-top|outer-bottom|middle)/.exec(lines[i]);
      if (hit) {
        radius = hit[1];
        break;
      }
      if (i > tagStart && lines[i].includes('>')) break;
    }
  }
  rows.push({ title: headline[1], line: index + 1, radius });
});
console.log(`设置页：${headers.length} 个分组标题、${rows.length} 个条目\n`);

const missingHeaders = GROUPS.filter((group) => !headers.some((header) => header.title === group.title));
check(
  `六个分组标题都在（${GROUPS.map((g) => g.title).join(' / ')}）`,
  missingHeaders.length === 0,
  `缺少：${missingHeaders.map((g) => g.title).join(' / ')}`,
);

const groupOrder = headers
  .map((header) => header.title)
  .filter((title) => GROUPS.some((group) => group.title === title));
check(
  '分组顺序与口径一致',
  JSON.stringify(groupOrder) === JSON.stringify(GROUPS.map((g) => g.title)),
  `实际顺序：${groupOrder.join(' → ')}`,
);

console.log('\n=== 每条设置项必须落在自己那一组里 ===');
const headerLineOf = (title) => headers.find((header) => header.title === title)?.line ?? -1;
for (let i = 0; i < GROUPS.length; i += 1) {
  const group = GROUPS[i];
  const from = headerLineOf(group.title);
  const nextTitle = GROUPS[i + 1]?.title;
  const to = nextTitle ? headerLineOf(nextTitle) : Number.MAX_SAFE_INTEGER;
  const inside = rows.filter((row) => row.line > from && row.line < to).map((row) => row.title);
  const wanted = group.rows;
  const ok = wanted.every((row) => inside.includes(row)) && inside.every((row) => wanted.includes(row));
  check(
    `「${group.title}」= ${wanted.join('、')}`,
    ok,
    `实际是：${inside.join('、') || '(空)'}`,
  );
  // 每组卡片圆角成套：首条 outer-top、末条 outer-bottom
  const groupRows = rows.filter((row) => row.line > from && row.line < to);
  if (groupRows.length) {
    check(
      `「${group.title}」圆角成套（首 top / 末 bottom）`,
      groupRows[0].radius === 'outer-top' && groupRows[groupRows.length - 1].radius === 'outer-bottom',
      `首=${groupRows[0].radius || '(无)'} 末=${groupRows[groupRows.length - 1].radius || '(无)'}`,
    );
  }
}

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
