/**
 * 把课表换算成「系统日历的日程项」—— **纯函数，不碰 DOM、不碰原生桥**。
 *
 * 为什么要单独一层：这一段是「时间/周次/标题/地点/老师」的映射规则，
 * 也是整个导入功能里唯一**能被机器判定**的部分。守卫
 * `scripts/check-calendar-export.mjs` 直接用 esbuild 把它跑起来验证
 * （节次→时间、周次→重复次数、每条都要带标记、ICS 的结构与折行）。
 *
 * 口径（作者 2026-09-24 当面要求）：
 *   · 一条日程 = 一门课在某一段**连续周次**里的重复上课（`RRULE:FREQ=WEEKLY;COUNT=n`）；
 *     周次不连续（"4;6-9;12-20"）就拆成多条，这样既不丢周次也不用 RDATE 那套复杂规则；
 *   · 时间取课表里每个节次自己的 `time`（"08:30-09:55"），不自己造；
 *   · 每条都必须带标记「来自多分课表」，否则「一键清除」清不干净；
 *   · 首次上课的日期 = 第 1 教学周的周一 + (周次−1)×7 + 星期序号。
 */
import {
  addDays,
  maxWeekOf,
  parseISODate,
  parseWeekSpec,
  type ScheduleCourse,
  type ScheduleData,
} from './schedule';

/** 导入到系统日历的日程统一带这个标记；原生侧也用它做兜底匹配（万一自定义列没被日历提供方保存） */
export const CALENDAR_MARKER = '来自多分课表';
/** CalendarContract 的 CUSTOM_APP_URI：原生侧据此认领自己写进去的日程 */
export const CALENDAR_APP_URI_PREFIX = 'duofen://course/';

export interface CalendarEventDraft {
  /** 稳定去重键：课程 + 星期 + 节次 + 起始周 */
  key: string;
  title: string;
  location: string;
  description: string;
  /** 首次上课的本地时间（epoch 毫秒） */
  start: number;
  /** 首次下课的本地时间（epoch 毫秒） */
  end: number;
  /** 连续重复的周数，>=1；1 表示只上一次 */
  repeat: number;
}

/** 把一串周次压成连续区间：[4,6,7,8,9,12] → [[4,4],[6,9],[12,12]] */
export function weekRuns(weeks: number[]): Array<[number, number]> {
  const sorted = [...new Set(weeks)].filter((week) => Number.isFinite(week) && week > 0).sort((a, b) => a - b);
  const runs: Array<[number, number]> = [];
  for (const week of sorted) {
    const last = runs[runs.length - 1];
    if (last && week === last[1] + 1) last[1] = week;
    else runs.push([week, week]);
  }
  return runs;
}

/** "08:30-09:55" → { startMin: 510, endMin: 595 }；认不出来返回 null（这条节次就不导） */
export function parseClockRange(time: string): { startMin: number; endMin: number } | null {
  const match = /(\d{1,2}):(\d{2})\s*[-–~]\s*(\d{1,2}):(\d{2})/.exec(time ?? '');
  if (!match) return null;
  const startMin = Number(match[1]) * 60 + Number(match[2]);
  const endMin = Number(match[3]) * 60 + Number(match[4]);
  if (endMin <= startMin) return null;
  return { startMin, endMin };
}

/** 某天的第 N 分钟 → 本地时间戳（避开夏令时那套：直接用 Date 的本地构造） */
function atMinutes(day: Date, minutes: number): number {
  const date = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, 0, 0, 0);
  return date.getTime() + minutes * 60_000;
}

/** 日程正文：把作者要求的「时间 / 课程名 / 地点 / 老师 / 来自多分课表」都落到字段里 */
function describe(course: ScheduleCourse, periodText: string, timeText: string): string {
  const lines = [`${periodText} ${timeText}`.trim()];
  if (course.teacher) lines.push(`老师：${course.teacher}`);
  if (course.className) lines.push(`班级：${course.className}`);
  lines.push(`${CALENDAR_MARKER}（由 App 导入，可在「多分课表」里一键清除）`);
  return lines.join('\n');
}

export interface BuildOptions {
  /** 覆盖课表自带的学期首周一（设置页可以改），ISO yyyy-mm-dd */
  termStart?: string;
  /** 周次写空时的默认重复次数（整学期），默认取课表里出现过的最大周次 */
  maxWeeks?: number;
}

/** 课表 → 待写入系统日历的日程草稿（顺序稳定：先按星期、再按节次） */
export function buildCalendarEvents(schedule: ScheduleData, options: BuildOptions = {}): CalendarEventDraft[] {
  const termStart = parseISODate(options.termStart || schedule.termStart);
  const maxWeek = Math.max(1, options.maxWeeks ?? maxWeekOf(schedule) ?? 1);
  const events: CalendarEventDraft[] = [];

  schedule.periods.forEach((period) => {
    const clock = parseClockRange(period.time);
    if (!clock) return;
    period.days.forEach((courses, dayIndex) => {
      for (const course of courses) {
        if (!course?.name) continue;
        const weeks = [...parseWeekSpec(course.weeks)];
        // 周次写空 = 整学期都在上（与 courseRunsInWeek 的口径一致）
        const runs = weeks.length ? weekRuns(weeks) : [[1, maxWeek] as [number, number]];
        for (const [from, to] of runs) {
          const day = addDays(termStart, (from - 1) * 7 + dayIndex);
          events.push({
            key: `${course.name}|${dayIndex}|${period.period}|${from}`,
            title: course.name.trim(),
            location: (course.room ?? '').trim(),
            description: describe(course, period.period, period.time),
            start: atMinutes(day, clock.startMin),
            end: atMinutes(day, clock.endMin),
            repeat: to - from + 1,
          });
        }
      }
    });
  });

  return events;
}

export interface CalendarScope {
  /** 会写进日历的日程条数 */
  count: number;
  /** 涉及多少门课 */
  courses: number;
  /** 第一条 / 最后一条的时间（用于「修改范围」提示框） */
  first: Date | null;
  last: Date | null;
}

/** 给「醒目的提示框」用的修改范围摘要 —— 用户点之前要能看清会发生什么 */
export function calendarScope(events: CalendarEventDraft[]): CalendarScope {
  if (!events.length) return { count: 0, courses: 0, first: null, last: null };
  let min = Infinity;
  let max = -Infinity;
  const courses = new Set<string>();
  for (const event of events) {
    min = Math.min(min, event.start);
    // 最后一条的“可见结束”要算上重复周次
    max = Math.max(max, event.start + (event.repeat - 1) * 7 * 24 * 3600_000);
    courses.add(event.title);
  }
  return { count: events.length, courses: courses.size, first: new Date(min), last: new Date(max) };
}

/* -------------------------------------------------------------------- ICS -- */
/* 网页版（浏览器里没有原生桥）用**下载 .ics** 作为等价实现：双击即导入系统日历。
   Android 侧不走这条路（那边直接写 CalendarContract，能一键清除）。 */

const pad = (value: number, size = 2) => String(value).padStart(size, '0');

/** 本地时间 → ICS 的 UTC 基本格式（20260928T003000Z） */
export function toIcsStamp(epochMs: number): string {
  const d = new Date(epochMs);
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

/** ICS 文本里的转义：反斜杠 / 分号 / 逗号 / 换行 */
export function escapeIcsText(value: string): string {
  return (value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/** 按 RFC 5545 折行：一行不超过 75 个**字节**，续行以空格开头（中文按 UTF-8 字节算，别按字符） */
export function foldIcsLine(line: string): string {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) return line;
  const out: string[] = [];
  let current = '';
  let bytes = 0;
  for (const char of line) {
    const size = encoder.encode(char).length;
    if (bytes + size > (out.length ? 74 : 75)) {
      out.push(current);
      current = '';
      bytes = 0;
    }
    current += char;
    bytes += size;
  }
  if (current) out.push(current);
  return out.map((part, index) => (index === 0 ? part : ` ${part}`)).join('\r\n');
}

export interface IcsOptions {
  /** 日历名（部分客户端会把它当"导入到哪个日历"的提示） */
  calendarName?: string;
  /** DTSTAMP；固定传入便于守卫比对 */
  stamp?: number;
}

export function eventsToIcs(events: CalendarEventDraft[], options: IcsOptions = {}): string {
  const stamp = toIcsStamp(options.stamp ?? Date.now());
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//duofen-kebiao//calendar-export//CN',
    'CALSCALE:GREGORIAN',
    `X-WR-CALNAME:${escapeIcsText(options.calendarName ?? '多分课表')}`,
  ];
  for (const event of events) {
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${escapeIcsText(event.key)}@duofen-kebiao`);
    lines.push(`DTSTAMP:${stamp}`);
    lines.push(`DTSTART:${toIcsStamp(event.start)}`);
    lines.push(`DTEND:${toIcsStamp(event.end)}`);
    if (event.repeat > 1) lines.push(`RRULE:FREQ=WEEKLY;COUNT=${event.repeat}`);
    lines.push(`SUMMARY:${escapeIcsText(event.title)}`);
    if (event.location) lines.push(`LOCATION:${escapeIcsText(event.location)}`);
    if (event.description) lines.push(`DESCRIPTION:${escapeIcsText(event.description)}`);
    lines.push('TRANSP:OPAQUE');
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(foldIcsLine).join('\r\n') + '\r\n';
}

/** 文件名：多分课表-2026-2027-1.ics */
export function icsFileName(schedule: ScheduleData): string {
  const term = (schedule.term || 'schedule').replace(/[\\/:*?"<>|\s]+/g, '-');
  return `多分课表-${term}.ics`;
}
