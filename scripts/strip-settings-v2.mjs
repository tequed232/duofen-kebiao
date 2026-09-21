/**
 * v2 设置页精简（按行号定位，避免 JSX 配平误判）：
 *   1. 删除「语音输入强度调整」「相机清晰度调整」两个列表项及其下方的滑块控制行；
 *   2. 删除数值编辑对话框（valueDialog）；
 *   3. 给「底边栏风格（互斥）」补一个 end 插槽开关。
 *
 * Usage: node scripts/strip-settings-v2.mjs
 */
import { readFile, writeFile } from 'node:fs/promises';

const FILE = 'web/src/screens/SettingsScreen.tsx';
const lines = (await readFile(FILE, 'utf8')).split(/\r?\n/);
const drop = new Set();

/** 删除以 marker 文案所在的列表项 + 紧随其后的 list-control-row 块 */
function dropListRowWithControl(marker) {
  const m = lines.findIndex((line) => line.includes(marker));
  if (m < 0) return false;
  let s = m;
  while (s > 0 && !/^\s*<md-list-item/.test(lines[s])) s -= 1;
  let e = s;
  while (e < lines.length && !/^\s*<\/md-list-item>/.test(lines[e])) e += 1;
  for (let i = s; i <= e; i += 1) drop.add(i);
  // 跳过空行后删除控制行
  let c = e + 1;
  while (c < lines.length && lines[c].trim() === '') c += 1;
  if (lines[c]?.includes('list-control-row')) {
    let end = c;
    while (end < lines.length && !/^\s*<\/div>\s*$/.test(lines[end])) end += 1;
    for (let i = c; i <= end; i += 1) drop.add(i);
  }
  return true;
}

const removedVoice = dropListRowWithControl('语音输入强度调整');
const removedCamera = dropListRowWithControl('相机清晰度调整');

/** 删除数值编辑对话框整块 */
const dialogStart = lines.findIndex((line) => line.includes('valueDialog !== null'));
if (dialogStart > 0) {
  let s = dialogStart;
  while (s > 0 && !/^\s*<MdDialog/.test(lines[s])) s -= 1;
  // MdDialog 以 `</MdDialog>` 结束
  let e = s;
  while (e < lines.length && !/^\s*<\/MdDialog>\s*$/.test(lines[e])) e += 1;
  for (let i = s; i <= e; i += 1) drop.add(i);
}

let next = lines.filter((_, index) => !drop.has(index));

// 底边栏风格：补 end 插槽开关
let source = next.join('\n');
const switchBlock = `              <div slot="end">
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
              </div>`;
source = source.replace(
  /(\s*<div slot="headline">底边栏风格（互斥）<\/div>)/,
  `$1\n${switchBlock}`,
);

await writeFile(FILE, source, 'utf8');
console.log(`已删除行数：${drop.size}（语音项=${removedVoice} 相机项=${removedCamera}）`);
console.log(`残留：语音=${(source.match(/语音输入强度/g) ?? []).length} 相机=${(source.match(/相机清晰度/g) ?? []).length} 对话框=${(source.match(/valueDialog/g) ?? []).length} 开关=${(source.match(/液态玻璃底边栏开关/g) ?? []).length}`);
