/**
 * 守卫：课表 → 系统日历的日程换算（`web/src/lib/calendarExport.ts`）。
 *
 * 为什么值得留下：这一段是导入功能里**唯一能确定性判定**的部分 ——
 * 时间/周次/标题/地点/老师/标记全是纯映射，写错了不会报错，只会让用户日历里多出一堆
 * 时间不对、或者「一键清除」清不掉的条目。而真机上的写入路径没法在 CI 里跑，
 * 所以把映射规则钉死在这里。
 *
 * 用法：node scripts/check-calendar-export.mjs
 */
import { build } from 'esbuild';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dir = await mkdtemp(path.join(tmpdir(), 'duofen-calendar-'));
const bundle = path.join(dir, 'calendarExport.mjs');
await build({
  entryPoints: ['web/src/lib/calendarExport.ts'],
  bundle: true,
  format: 'esm',
  outfile: bundle,
  platform: 'neutral',
  logLevel: 'silent',
});

const { buildCalendarEvents, calendarScope, eventsToIcs, parseClockRange, weekRuns, CALENDAR_MARKER, toIcsStamp, foldIcsLine } =
  await import(`file://${bundle}`);

let pass = 0;
let fail = 0;
const check = (label, ok, detail = '') => {
  if (ok) pass += 1;
  else fail += 1;
  console.log(`  ${ok ? '✓' : '✗'} ${label}${ok || !detail ? '' : ` —— ${detail}`}`);
};
const eq = (label, actual, expected) =>
  check(label, JSON.stringify(actual) === JSON.stringify(expected), `期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}`);

/* ---------------------------------------------------------------- 周次与时间 -- */

console.log('=== 周次压缩成连续区间 ===');
eq('4;6-9;12-20 → [[4,4],[6,9],[12,20]]', weekRuns([4, 6, 7, 8, 9, 12, 20]), [[4, 4], [6, 9], [12, 12], [20, 20]]);
eq('乱序 2,1,3 → [[1,3]]', weekRuns([2, 1, 3]), [[1, 3]]);
eq('重复值去重', weekRuns([5, 5, 6]), [[5, 6]]);
eq('空数组', weekRuns([]), []);

console.log('\n=== 节次时间解析 ===');
eq('08:30-09:55', parseClockRange('08:30-09:55'), { startMin: 510, endMin: 595 });
eq('10:15~11:40（波浪号也认）', parseClockRange('10:15~11:40'), { startMin: 615, endMin: 700 });
eq('认不出来 → null（这条节次不导）', parseClockRange('待定'), null);
eq('结束早于开始 → null', parseClockRange('09:55-08:30'), null);

/* ---------------------------------------------------------------- 日程映射 -- */

// 2026-01-05 是周一（第 1 教学周的周一）
const termStart = '2026-01-05';
if (new Date(2026, 0, 5).getDay() !== 1) {
  console.error('❌ 测试夹具错了：2026-01-05 不是周一，请换一个真的周一再跑');
  process.exit(1);
}

const courseA = { name: '高等数学（一）', weeks: '1-3', teacher: '张三', className: '会计1班', room: '16栋203' };
const courseB = { name: '大学英语（二）', weeks: '3;5-6', teacher: '李四', className: '会计1班', room: '5栋101' };
const empty = [];
const schedule = {
  owner: 'Tequed232',
  term: '2025-2026-2',
  termStart,
  days: ['周一', '周二', '周三', '周四', '周五', '周六', '周日'],
  periods: [
    { period: '第1-2节', time: '08:30-09:55', section: 'morning', days: [[courseA], empty, empty, empty, empty, empty, empty] },
    { period: '第3-4节', time: '10:15-11:40', section: 'morning', days: [empty, empty, [courseB], empty, empty, empty, empty] },
    { period: '第5-6节', time: '时间待定', section: 'afternoon', days: [[courseA], empty, empty, empty, empty, empty, empty] },
  ],
};

const events = buildCalendarEvents(schedule);
console.log(`\n=== 课表 → 日程（共 ${events.length} 条）===`);
eq('条数：A 连续 3 周 1 条 + B 拆成 2 条；时间认不出的节次整条跳过', events.length, 3);
eq(
  'A 的第一次：第 1 周周一 08:30（本地）',
  new Date(events[0].start).toString().slice(0, 24),
  new Date(2026, 0, 5, 8, 30).toString().slice(0, 24),
);
eq('A 的第一次下课 09:55', new Date(events[0].end).getHours() * 60 + new Date(events[0].end).getMinutes(), 9 * 60 + 55);
eq('A 重复 3 周', events[0].repeat, 3);
eq('标题 = 课程名', events[0].title, '高等数学（一）');
eq('地点 = 教室', events[0].location, '16栋203');
check('正文含老师', events[0].description.includes('老师：张三'), events[0].description);
check('正文含班级', events[0].description.includes('班级：会计1班'), events[0].description);
check('正文含节次与时间', events[0].description.includes('第1-2节 08:30-09:55'), events[0].description);

const bEvents = events.filter((e) => e.title === '大学英语（二）');
eq('B 被拆成 2 条（3 周 / 5-6 周）', bEvents.length, 2);
eq('B 第一条 = 第 3 周周三 10:15', new Date(bEvents[0].start).toString().slice(0, 24), new Date(2026, 0, 21, 10, 15).toString().slice(0, 24));
eq('B 第一条只重复 1 周', bEvents[0].repeat, 1);
eq('B 第二条 = 第 5 周周三（跨过第 4 周）', new Date(bEvents[1].start).toString().slice(0, 24), new Date(2026, 1, 4, 10, 15).toString().slice(0, 24));
eq('B 第二条重复 2 周', bEvents[1].repeat, 2);

console.log('\n=== 每条都必须带标记（清除功能全靠它）===');
/* 这里比对**字面量**而不是 CALENDAR_MARKER 常量本身：拿常量去断言常量是自指的，
   改掉标记字符串同样会通过 —— 那种"永远绿"的断言不要。 */
const MARKER_LITERAL = '来自多分课表';
check(`常量本身就是「${MARKER_LITERAL}」`, CALENDAR_MARKER === MARKER_LITERAL, `实际 ${CALENDAR_MARKER}`);
const missing = events.filter((e) => !e.description.includes(MARKER_LITERAL));
check(`全部 ${events.length} 条正文都含「${MARKER_LITERAL}」`, missing.length === 0, `有 ${missing.length} 条没有标记`);
check('标题不带标记（日历里看着干净）', events.every((e) => !e.title.includes(MARKER_LITERAL)));
eq('key 稳定且互不重复', new Set(events.map((e) => e.key)).size, events.length);

console.log('\n=== 周次写空 = 整学期 ===');
const openWeeks = buildCalendarEvents({ ...schedule, periods: [{ period: '第1-2节', time: '08:30-09:55', section: 'morning', days: [[{ ...courseA, weeks: '' }], empty, empty, empty, empty, empty, empty] }] }, { maxWeeks: 16 });
eq('空周次 → 重复 16 周', openWeeks[0].repeat, 16);

console.log('\n=== 「修改范围」摘要 ===');
const scope = calendarScope(events);
eq('条数', scope.count, 3);
eq('课程门数', scope.courses, 2);
eq('首条日期', scope.first && scope.first.toString().slice(0, 15), new Date(2026, 0, 5).toString().slice(0, 15));
check('末条日期覆盖到 2 月（含重复周次）', scope.last && scope.last.getMonth() === 1, scope.last ? scope.last.toString() : 'null');
eq('空日程 → 全 0', calendarScope([]), { count: 0, courses: 0, first: null, last: null });

/* -------------------------------------------------------------------- ICS -- */

console.log('\n=== ICS（网页版兜底）===');
const ics = eventsToIcs(events, { stamp: Date.UTC(2026, 0, 1, 0, 0, 0) });
const lines = ics.split('\r\n');
check('每个 VEVENT 有 BEGIN/END', (ics.match(/BEGIN:VEVENT/g) || []).length === 3 && (ics.match(/END:VEVENT/g) || []).length === 3);
check('以 CRLF 结尾', ics.endsWith('\r\n'));
check('不含裸 LF（除 CRLF 外）', !/[^\r]\n/.test(ics));
eq('DTSTART 用 UTC 基本格式', (ics.match(/DTSTART:(\d{8}T\d{6}Z)/g) || [])[0], 'DTSTART:' + toIcsStamp(events[0].start));
check('DTSTART 换算正确（本地 08:30 → UTC）', ics.includes(`DTSTART:${toIcsStamp(new Date(2026, 0, 5, 8, 30).getTime())}`));
check('重复 >1 才写 RRULE', (ics.match(/RRULE:FREQ=WEEKLY;COUNT=3/g) || []).length === 1 && !ics.includes('COUNT=1'));
check('UID 唯一', new Set((ics.match(/UID:[^\r]+/g) || [])).size === 3);

console.log('\n=== ICS 折行与转义（RFC 5545）===');
const encoder = new TextEncoder();
const longFold = foldIcsLine('SUMMARY:' + '很长的中文课程名称'.repeat(12));
check('折行后每行不超过 75 字节', longFold.split('\r\n').every((l) => encoder.encode(l).length <= 75), `最长 ${Math.max(...longFold.split('\r\n').map((l) => encoder.encode(l).length))} 字节`);
check('续行以空格开头', longFold.split('\r\n').slice(1).every((l) => l.startsWith(' ')));
check('折行不切开多字节字符', !/\uFFFD/.test(longFold));
check('短行不折', foldIcsLine('SUMMARY:短') === 'SUMMARY:短');

const tricky = eventsToIcs(
  [{ key: 'k,1;2', title: '英语,听说;读写', location: '16栋,203', description: '第一行\n第二行;分号', start: Date.UTC(2026, 0, 5, 0, 30), end: Date.UTC(2026, 0, 5, 1, 55), repeat: 1 }],
  { stamp: Date.UTC(2026, 0, 1) },
);
check('逗号被转义', tricky.includes('SUMMARY:英语\\,听说\\;读写'), tricky.split('\r\n').find((l) => l.startsWith('SUMMARY')));
check('换行被转成 \\n', tricky.includes('第一行\\n第二行\\;分号'));
check('UID 里的分隔符被转义', tricky.includes('UID:k\\,1\\;2@duofen-kebiao'));

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
