/**
 * 精确删除设置页里「语音输入强度调整 / 相机清晰度调整」两个列表项及其滑块控制行，
 * 并删除数值编辑对话框；同时给「底边栏风格（互斥）」补一个 end 插槽开关。
 *
 * 与上一版脚本的差别：**先打印将要删除的行号供核对**，并在删除后做残留校验，
 * 任何一项没删干净就报错退出（不写文件），避免再改坏设置页。
 *
 * Usage: node scripts/strip-settings-v2.mjs
 */
import { readFile, writeFile } from 'node:fs/promises';

const FILE = 'web/src/screens/SettingsScreen.tsx';
const original = await readFile(FILE, 'utf8');
const lines = original.split(/\r?\n/);
const drop = new Set();

/** 返回列表项的 [start, end] 行号 */
function listItemSpan(marker) {
  const m = lines.findIndex((line) => line.includes(marker) && line.includes('headline') === false && line.includes('slot="headline"'));
  if (m < 0) return null;
  let s = m;
  while (s > 0 && !/^\s*<md-list-item/.test(lines[s])) s -= 1;
  let e = s;
  while (e < lines.length && !/^\s*<\/md-list-item>/.test(lines[e])) e += 1;
  return [s, e];
}

/** 从 from+1 起找紧随其后的 list-control-row 块 */
function controlRowSpan(from) {
  let s = from + 1;
  while (s < lines.length && lines[s].trim() === '') s += 1;
  if (!lines[s]?.includes('list-control-row')) return null;
  let e = s;
  while (e < lines.length && !/^\s{10,}<\/div>\s*$/.test(lines[e])) e += 1;
  return [s, e];
}

const report = [];
for (const marker of ['语音输入强度调整', '相机清晰度调整']) {
  const span = listItemSpan(marker);
  if (!span) {
    console.log(`! 未找到列表项：${marker}`);
    continue;
  }
  const control = controlRowSpan(span[1]);
  report.push(`${marker}: 行 ${span[0] + 1}~${span[1] + 1}${control ? ` + 控制行 ${control[0] + 1}~${control[1] + 1}` : ''}`);
  for (let i = span[0]; i <= span[1]; i += 1) drop.add(i);
  if (control) for (let i = control[0]; i <= control[1]; i += 1) drop.add(i);
}

// 数值编辑对话框整块
const dialogStart = lines.findIndex((line) => line.includes('valueDialog !== null'));
if (dialogStart > 0) {
  let s = dialogStart;
  while (s > 0 && !/^\s*<MdDialog/.test(lines[s])) s -= 1;
  let e = s;
  while (e < lines.length && !/^\s*<\/MdDialog>\s*$/.test(lines[e])) e += 1;
  report.push(`数值编辑对话框: 行 ${s + 1}~${e + 1}`);
  for (let i = s; i <= e; i += 1) drop.add(i);
}

console.log('将删除：');
report.forEach((line) => console.log('  -', line));

let source = lines.filter((_, index) => !drop.has(index)).join('\n');

// 底边栏风格开关
if (!source.includes('液态玻璃底边栏开关')) {
  source = source.replace(
    /(\s*<div slot="headline">底边栏风格（互斥）<\/div>)/,
    `$1
              <div slot="end">
                <MdSwitch
                  selected={settings.liquidGlass}
                  onSelectedChange={(value) =>
                    updateSettings(
                      { liquidGlass: value },
                      { message: value ? '已切换为液态玻璃底边栏' : '已切换为 Material 3 原生底边栏' },
                    )
                  }
                  ariaLabel="液态玻璃底边栏开关"
                />
              </div>`,
  );
}

const left = {
  语音: (source.match(/语音输入强度/g) ?? []).length,
  相机: (source.match(/相机清晰度/g) ?? []).length,
  滑块: (source.match(/MdSlider/g) ?? []).length,
  控制行: (source.match(/list-control-row/g) ?? []).length,
  开关: (source.match(/液态玻璃底边栏开关/g) ?? []).length,
};
console.log('删除后残留：', JSON.stringify(left));

if (left.语音 || left.相机 || left.控制行 === 0 || left.开关 === 0) {
  console.error('❌ 残留校验未通过，未写入文件（保持原样）');
  process.exit(1);
}

await writeFile(FILE, source, 'utf8');
console.log('✅ 设置页精简完成');
