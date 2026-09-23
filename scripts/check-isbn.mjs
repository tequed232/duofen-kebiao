/**
 * 校验位与解析的回归测试（不需要浏览器，也不需要网络）。
 *
 * 为什么值得留下：ISBN 校验位是「封面识别」里唯一能**确定性判真伪**的信号 ——
 * OCR 读错一位数字就过不了校验。这套算法写错会让识别结果悄悄变差，
 * 所以用公认有效的书号把它钉住。
 *
 * 用法：node scripts/check-isbn.mjs
 */
import { build } from 'esbuild';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dir = await mkdtemp(path.join(tmpdir(), 'duofen-isbn-'));
const bundle = path.join(dir, 'isbn.mjs');
await build({
  entryPoints: ['web/src/lib/isbn.ts'],
  bundle: true,
  format: 'esm',
  outfile: bundle,
  platform: 'neutral',
  logLevel: 'silent',
});

const { extractIsbns, isValidIsbn13, isValidIsbn10 } = await import(`file://${bundle}`);

let pass = 0;
let fail = 0;
const check = (label, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) pass += 1;
  else fail += 1;
  console.log(`  ${ok ? '✓' : '✗'} ${label}${ok ? '' : ` —— 期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}`}`);
};

console.log('=== ISBN-13 校验（公认有效的书号）===');
// 这些是维基百科/各图书馆公开的示例书号，校验位由标准算法保证
for (const isbn of ['9780306406157', '9783161484100', '9781861972712', '9780131103627']) {
  check(isbn, isValidIsbn13(isbn), true);
}
check('错一位数字应判无效', isValidIsbn13('9780306406158'), false);
check('非 978/979 前缀不算 ISBN-13', isValidIsbn13('1234567890128'), false);
check('位数不足不算', isValidIsbn13('978030640615'), false);

console.log('\n=== ISBN-10 校验 ===');
for (const isbn of ['0306406152', '316148410X', '1861972717', '0131103628']) {
  check(isbn, isValidIsbn10(isbn), true);
}
check('末位 X（097522980X）', isValidIsbn10('097522980X'), true);
check('错一位应判无效', isValidIsbn10('0306406153'), false);
check('把有效书号的 X 写成数字应判无效', isValidIsbn10('3161484100'), false);

console.log('\n=== 从 OCR 文本里提取 ===');
const cover = [
  '普通高等教育“十三五”规划教材',
  '高等数学（第七版）上册',
  '同济大学数学系 编',
  '高等教育出版社',
  'ISBN 978-7-04-039663-8',
  '定价 49.80 元',
].join('\n');
const hits = extractIsbns(cover);
check('提取到 1 个', hits.length, 1);
check('归一化为纯数字', hits[0]?.isbn, '9787040396638');
check('识别为 isbn13', hits[0]?.kind, 'isbn13');

check('没有校验位正确的书号时返回空', extractIsbns('ISBN 978-7-04-039663-0').length, 0);
check('无关数字不误报', extractIsbns('学号 20230101001 教室 1-201').length, 0);
check(
  '同一书号重复出现只计一次',
  extractIsbns('9780306406157 与 978-0-306-40615-7').length,
  1,
);

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
