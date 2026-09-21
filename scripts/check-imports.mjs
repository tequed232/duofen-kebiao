/**
 * 导入自检：扫描 web/src 下所有 .tsx / .ts，找出「用了但没导入」的组件。
 *
 * 背景：本项目已三次因为「JSX 里用了某组件却忘了 import」而在运行时崩成白屏
 * （MODULES、isNativeShell、MdSwitch）。这个脚本在构建前把它们全部揪出来。
 *
 * Usage: node scripts/check-imports.mjs
 */
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const ROOT = 'web/src';
const MD = path.join(ROOT, 'components/md.tsx');

/** md.tsx 实际导出的组件（其它文件的默认导出另行处理） */
const mdSource = await readFile(MD, 'utf8');
const mdExports = new Set([
  ...[...mdSource.matchAll(/export function ([A-Z]\w+)/g)].map((m) => m[1]),
  ...[...mdSource.matchAll(/export (?:type|interface) ([A-Z]\w+)/g)].map((m) => m[1]),
]);
const mdTypes = new Set([...mdSource.matchAll(/export (?:type|interface) ([A-Z]\w+)/g)].map((m) => m[1]));

/** 收集所有源文件 */
async function walk(dir, out = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(full, out);
    else if (/\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

const files = await walk(ROOT);
const problems = [];

for (const file of files) {
  const source = await readFile(file, 'utf8');
  // 本文件里用到的组件（<MdFoo ...> 或 JSX 里的 <Foo）
  const used = new Set([...source.matchAll(/<([A-Z]\w+)[\s/>]/g)].map((m) => m[1]));
  // 本文件导入的符号
  const imported = new Set();
  for (const match of source.matchAll(/import\s+(?:([A-Za-z_$][\w$]*)\s*,\s*)?\{([^}]*)\}\s*from/g)) {
    if (match[1]) imported.add(match[1]);
    match[2]
      .split(',')
      .map((piece) => piece.trim().split(/\s+as\s+/).pop()?.trim())
      .filter(Boolean)
      .forEach((name) => imported.add(name));
  }
  for (const match of source.matchAll(/import\s+([A-Z]\w*)\s+from/g)) imported.add(match[1]);

  for (const name of used) {
    // 只检查我们自己定义的组件（Md 前缀 或 已知本地组件），避免误报（如 React.Fragment）
    const isOurs = name.startsWith('Md') || mdExports.has(name);
    if (!isOurs) continue;
    if (imported.has(name)) continue;
    // 同文件内定义的组件不算
    if (new RegExp(`(?:function|const)\\s+${name}\\b`).test(source)) continue;
    problems.push(`${file}: 使用了 <${name}> 但没有导入`);
  }

  // md.tsx 里导入了但 md.tsx 并未导出的符号
  if (file.endsWith('md.tsx')) continue;
  for (const match of source.matchAll(/import\s+\{([^}]*)\}\s+from\s+['"][^'"]*components\/md['"]/g)) {
    for (const raw of match[1].split(',')) {
      const cleaned = raw.trim().replace(/^type\s+/, '');
      const name = cleaned.split(/\s+as\s+/).pop()?.trim();
      if (!name) continue;
      if (mdTypes.has(name)) continue;
      if (!mdExports.has(name)) problems.push(`${file}: 从 md.tsx 导入了并不存在的 ${name}`);
    }
  }
}

if (problems.length) {
  console.error('❌ 导入自检未通过：');
  problems.forEach((line) => console.error('  - ' + line));
  process.exit(1);
}
console.log(`✅ 导入自检通过（扫描 ${files.length} 个文件，${mdExports.size} 个 md 组件）`);
