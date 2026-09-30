/**
 * 课表 JSON 导入的回归测试。
 *
 * 为什么需要：作者 2026-09-26 报「HTML / JSON 导入失效，主页拿不到新课表」。查下来是
 * **JSON 这条路根本不存在** —— `parseScheduleFile` 只认 .doc/.rtf、.html、.csv/.txt，
 * 粘 JSON 会掉进纯文本解析器报「没有解析到课表节次」。补上之后必须钉住三件事：
 *   ① 两种形状（应用自己的 ScheduleData / 模型常吐的扁平 courses[]）都能解析；
 *   ② 容忍围栏与前后说明文字（跟 HTML 那条路一样）；
 *   ③ 解析不出课程时**抛错**，绝不返回空课表 —— 空课表会被上层当成功，
 *      而主页「没有课程就回落内置课表」会继续显示旧表，用户看到的就是「导入了但主页没变」。
 *
 * 用法：node scripts/check-schedule-json.mjs
 */
import { build } from 'esbuild';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dir = await mkdtemp(path.join(tmpdir(), 'duofen-schedule-json-'));
const bundle = path.join(dir, 'scheduleJson.mjs');
await build({
  entryPoints: ['web/src/lib/scheduleJson.ts'],
  bundle: true,
  format: 'esm',
  outfile: bundle,
  platform: 'neutral',
  logLevel: 'silent',
});

const { parseScheduleJson, looksLikeJson } = await import(`file://${bundle}`);

let pass = 0;
let fail = 0;
const check = (label, ok, detail) => {
  if (ok) pass += 1;
  else fail += 1;
  console.log(`  ${ok ? '✓' : '✗'} ${label}${ok || !detail ? '' : ` —— ${detail}`}`);
};
const eq = (label, actual, expected) => check(label, JSON.stringify(actual) === JSON.stringify(expected), `期望 ${JSON.stringify(expected)}，实为 ${JSON.stringify(actual)}`);
const throws = (label, fn, pattern) => {
  try {
    fn();
    check(label, false, '没有抛错');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    check(label, pattern.test(message), message);
  }
};
const courses = (data) => data.periods.flatMap((period) => period.days.flat());

console.log('[1] 应用自己的形状（ScheduleData）');
const appShape = parseScheduleJson(
  JSON.stringify({
    owner: '罗xx',
    term: '2026-2027-1',
    termStart: '2026-09-07',
    days: ['星期一', '星期二'],
    periods: [
      {
        period: '第1-2节',
        time: '08:30-09:55',
        section: 'morning',
        days: [[{ name: '高等数学', teacher: '张三', room: '1-201', weeks: '1-16' }], [], []],
      },
      { period: '第5-6节', days: [[], [{ name: '大学英语', teacher: '李四', room: '2-305', weeks: [1, 2, 3, 5] }], []] },
    ],
  }),
);
eq('节次数', appShape.periods.length, 2);
eq('课程数', courses(appShape).length, 2);
eq('课程名', courses(appShape).map((c) => c.name), ['高等数学', '大学英语']);
eq('缺 section 时按节次数字兜底（第5-6节 → noon）', appShape.periods[1].section, 'noon');
eq('weeks 数组收敛成规格串', appShape.periods[1].days[1][0].weeks, '1-3;5');
eq('termStart 原样带过', appShape.termStart, '2026-09-07');
eq('days 原样带过', appShape.days, ['星期一', '星期二']);
eq('不写 section 时 time 缺省为空串', appShape.periods[1].time, '');

console.log('\n[2] 模型常吐的扁平形状（courses[]）');
const flat = parseScheduleJson(
  JSON.stringify({
    term: '2026-2027-1',
    courses: [
      { name: '程序设计基础', day: '星期一', period: '第3-4节', teacher: '王五', room: '3-101' },
      { name: '大学物理', day: 'Wednesday', period: '第1-2节', teacher: '孙八', room: '2-101', weeks: '1-8周' },
      { name: '人工智能导论', day: '3', period: '5-6', teacher: '钱七', room: '4-201' },
    ],
  }),
);
eq('按节次数字排序后的节次标签', flat.periods.map((p) => p.period), ['第1-2节', '第3-4节', '5-6节']);
eq('周三两门课都归到下标 2', flat.periods.flatMap((p) => p.days[2]).map((c) => c.name), ['大学物理', '人工智能导论']);
eq('星期一归到下标 0', flat.periods[1].days[0].map((c) => c.name), ['程序设计基础']);
eq('英文星期 + 纯数字星期都认', [flat.periods[0].days[2].length > 0, flat.periods[2].days[2].length > 0], [true, true]);
eq('weeks 里的「周」被去掉', flat.periods[0].days[2][0].weeks, '1-8');
eq('扁平形状默认铺满七天', flat.days.length, 7);

console.log('\n[3] 围栏与前后说明文字');
const fenced = parseScheduleJson(
  '好的，课表整理成 JSON 如下：\n\n```json\n{"courses":[{"name":"高等数学","day":"周一","period":"第1-2节"}]}\n```\n\n请核对。',
);
eq('围栏 + 说明文字也能解析', courses(fenced).map((c) => c.name), ['高等数学']);
const wrapped = parseScheduleJson('{"code":0,"schedule":{"courses":[{"name":"线性代数","day":"周二","period":"第1-2节"}]}}');
eq('{ schedule: {…} } 包一层也认', courses(wrapped).map((c) => c.name), ['线性代数']);
const arrayRoot = parseScheduleJson('[{"name":"大学物理","day":"周五","period":"第3-4节"}]');
eq('顶层直接是数组也认', courses(arrayRoot).map((c) => c.name), ['大学物理']);

console.log('\n[4] 解析不出课程必须抛错（不许返回空课表）');
throws('空对象', () => parseScheduleJson('{}'), /没有课程/);
throws('只有元数据', () => parseScheduleJson('{"term":"2026-2027-1"}'), /没有课程/);
throws('课程缺星期/节次', () => parseScheduleJson('{"courses":[{"name":"高数"}]}'), /没有课程/);
throws('空数组', () => parseScheduleJson('[]'), /没有课程/);
throws('语法坏掉', () => parseScheduleJson('{"courses":['), /语法错误|没有闭合/);
throws('根本没有 JSON', () => parseScheduleJson('第1-2节\t高等数学'), /没有找到 JSON/);

console.log('\n[5] looksLikeJson 的判定');
eq('裸对象', looksLikeJson('{"courses":[]}'), true);
eq('围栏 JSON', looksLikeJson('```json\n{"courses":[]}\n```'), true);
eq('说明文字 + 对象', looksLikeJson('这是课表： {"periods":[]}'), true);
eq('HTML 表格不算 JSON', looksLikeJson('<table><tr><td>高等数学</td></tr></table>'), false);
eq('制表符文本不算 JSON', looksLikeJson('节次\t星期一\n第1-2节\t高等数学'), false);
eq('空串', looksLikeJson('   '), false);

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
