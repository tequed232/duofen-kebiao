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

const { extractIsbns, isValidIsbn13, isValidIsbn10, formatIsbn13 } = await import(`file://${bundle}`);

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

console.log('\n=== 裸 13 位串（条码区没有连字符）===');
// 曾经的坑：pattern13 用量词 {10,17}，而 `97[89]` 已占 3 位，裸 13 位串只剩 10 位，
// 配上末尾 \d 至少要 14 位 → 「9780306406157」永远抽不出来。
// 上面那条「重复出现只计一次」正是因此**假通过**：长度恰好为 1 是因为裸串没被抽到，
// 不是因为去重生效。改成 {9,17} 之后它才真正走一遍去重。
check('裸 13 位能抽到', extractIsbns('9780306406157').length, 1);
check('裸 13 位归一化为纯数字', extractIsbns('9780306406157')[0]?.isbn, '9780306406157');
check('裸 13 位只算一条（不重复计为 10 位）', extractIsbns('9787040396638').length, 1);
check('串中间的 OCR 误读仍能还原（O→0）', extractIsbns('ISBN 978-7-O4-O39663-8')[0]?.isbn, '9787040396638');
check('裸串与带连字符串混排仍只计一次', extractIsbns('9780306406157 978-0-306-40615-7').length, 1);

console.log('\n=== formatIsbn13 格式化 ===');
// 曾经的坑：rest 有 8 位，却只取 slice(2, 7) 共 5 位，静默丢一位数字 ——
// 格式化出来的「978-7-04-03966-8」其实只有 12 位。
check('格式化后数字一个不少', formatIsbn13('9787040396638').replace(/\D/g, ''), '9787040396638');
check('中国组号按标准分段', formatIsbn13('9787040396638'), '978-7-04-039663-8');
check('非 13 位原样返回', formatIsbn13('123'), '123');

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
