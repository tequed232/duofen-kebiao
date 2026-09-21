/**
 * 删除设置页里剩余的绝对定位 overlay 块（按 div 配平精确切除，避免误删）。
 * Usage: node scripts/drop-settings-overlays.mjs
 */
import { readFile, writeFile } from 'node:fs/promises';

const FILE = 'web/src/screens/SettingsScreen.tsx';
const lines = (await readFile(FILE, 'utf8')).split(/\r?\n/);

let start = lines.findIndex((line) => line.includes('group-overlay'));
// 若上一行是注释，一并删掉
if (start > 0 && lines[start - 1].includes('{/*')) start -= 1;
if (start < 0) {
  console.log('没有剩余的 group-overlay');
  process.exit(0);
}

let depth = 0;
let seen = 0;
let end = -1;
for (let i = start; i < lines.length; i += 1) {
  const opens = (lines[i].match(/<div\b/g) ?? []).length;
  const closes = (lines[i].match(/<\/div>/g) ?? []).length;
  seen += opens;
  depth += opens - closes;
  if (seen > 0 && depth === 0) {
    end = i;
    break;
  }
}

if (end < 0) throw new Error('无法确定 overlay 块的结束位置');

const kept = [...lines.slice(0, start), ...lines.slice(end + 1)];
await writeFile(FILE, kept.join('\n'), 'utf8');
console.log(`已删除第 ${start + 1}~${end + 1} 行（${end - start + 1} 行，含 ${seen} 个 overlay 容器）`);
