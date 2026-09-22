/**
 * Course schedule domain logic: week math, the client side importers
 * (RTF/DOC, HTML tables, pasted text) and map deep links.
 *
 * The schedule itself is embedded in web/src/data/schedule.ts (generated from the
 * school's 学生课表.doc export by scripts/import-schedule.mjs); a schedule imported
 * by the user is stored in IndexedDB and overrides the embedded one.
 */
import { parseScheduleHtml } from './scheduleHtml';

export type ScheduleSection = 'morning' | 'noon' | 'afternoon' | 'evening';

export interface ScheduleCourse {
  name: string;
  /** week spec without the 周 suffix, e.g. "4;6-9;12-20" */
  weeks: string;
  teacher: string;
  className: string;
  room: string;
  /** raw cell text, kept for the detail sheet */
  raw?: string;
}

export interface SchedulePeriod {
  /** 第1-2节 */
  period: string;
  /** 08:30-09:55 */
  time: string;
  section: ScheduleSection;
  /** one entry per weekday (Monday first) */
  days: ScheduleCourse[][];
}

export interface ScheduleData {
  owner: string;
  term: string;
  /** ISO date (yyyy-mm-dd) of the Monday of teaching week 1 */
  termStart: string;
  days: string[];
  periods: SchedulePeriod[];
}

export const SCHEDULE_SECTIONS: { id: ScheduleSection; label: string }[] = [
  { id: 'morning', label: '上午' },
  { id: 'noon', label: '中午' },
  { id: 'afternoon', label: '下午' },
  { id: 'evening', label: '晚上' },
];

export const WEEKDAY_SHORT = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
export const WEEKDAY_LONG = ['星期一', '星期二', '星期三', '星期四', '星期五', '星期六', '星期日'];

/* ------------------------------------------------------------------ dates -- */

export function parseISODate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1);
}

export function toISODate(date: Date): string {
  const pad = (value: number) => value.toString().padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function addDays(date: Date, amount: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

/** Monday based index: 0 = 周一 ... 6 = 周日 */
export function weekdayIndex(date: Date): number {
  return (date.getDay() + 6) % 7;
}

/** Monday of the week containing `date`. */
export function startOfWeek(date: Date): Date {
  return addDays(date, -weekdayIndex(date));
}

/** Teaching week number for a date (1 based, clamped to >= 1). */
export function weekNumberFor(date: Date, termStart: string): number {
  const start = startOfWeek(parseISODate(termStart));
  const target = startOfWeek(date);
  const days = Math.round((target.getTime() - start.getTime()) / 86_400_000);
  return Math.max(1, Math.floor(days / 7) + 1);
}

export function formatMonthDay(date: Date): string {
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

export function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/* -------------------------------------------------------------- week spec -- */

/** "4;6-9;12-20" -> {4,6,7,8,9,12,...,20} */
export function parseWeekSpec(spec: string): Set<number> {
  const weeks = new Set<number>();
  const cleaned = spec.replace(/周/g, '').replace(/\[[^\]]*\]/g, '').trim();
  if (!cleaned) return weeks;
  for (const part of cleaned.split(/[;,，、\s]+/)) {
    if (!part) continue;
    const range = /^(\d+)\s*-\s*(\d+)$/.exec(part);
    if (range) {
      const from = Number(range[1]);
      const to = Number(range[2]);
      for (let week = Math.min(from, to); week <= Math.max(from, to); week += 1) weeks.add(week);
      continue;
    }
    const single = /^(\d+)$/.exec(part);
    if (single) weeks.add(Number(single[1]));
  }
  return weeks;
}

export function courseRunsInWeek(course: ScheduleCourse, week: number): boolean {
  const weeks = parseWeekSpec(course.weeks);
  if (!weeks.size) return true; // no week restriction -> always shown
  return weeks.has(week);
}

export function courseWeekLabel(course: ScheduleCourse): string {
  const raw = course.weeks.replace(/周/g, '').trim();
  return raw ? `${raw} 周` : '每周';
}

/** The week a course should be shown for: the current one when it runs, else the next (or first) one. */
export function targetWeekFor(course: ScheduleCourse, currentWeek: number): number | undefined {
  const weeks = [...parseWeekSpec(course.weeks)].sort((a, b) => a - b);
  if (!weeks.length) return undefined;
  return weeks.find((week) => week >= currentWeek) ?? weeks[0];
}

/* ----------------------------------------------------------------- lookup -- */

export interface DayCourse {
  period: string;
  time: string;
  section: ScheduleSection;
  course: ScheduleCourse;
  periodIndex: number;
}

/** All courses of a weekday (0 = Monday) for a given teaching week. */
export function coursesOfDay(schedule: ScheduleData, dayIndex: number, week: number): DayCourse[] {
  const result: DayCourse[] = [];
  schedule.periods.forEach((period, periodIndex) => {
    for (const course of period.days[dayIndex] ?? []) {
      if (courseRunsInWeek(course, week)) {
        result.push({ period: period.period, time: period.time, section: period.section, course, periodIndex });
      }
    }
  });
  return result;
}

/** True when the weekday has any course at all (ignoring the week filter). */
export function dayHasCourses(schedule: ScheduleData, dayIndex: number): boolean {
  return schedule.periods.some((period) => (period.days[dayIndex] ?? []).length > 0);
}

/** Weekdays that actually carry courses, used to pick the default four day window. */
export function activeWeekdays(schedule: ScheduleData): number[] {
  const result: number[] = [];
  for (let day = 0; day < 7; day += 1) if (dayHasCourses(schedule, day)) result.push(day);
  return result;
}

export function courseKey(course: ScheduleCourse): string {
  return `${course.name}|${course.teacher}|${course.room}`;
}

/** The last teaching week mentioned anywhere in the schedule (1 when unknown). */
export function maxWeekOf(schedule: ScheduleData): number {
  let max = 1;
  for (const period of schedule.periods) {
    for (const day of period.days) {
      for (const course of day) {
        for (const week of parseWeekSpec(course.weeks)) max = Math.max(max, week);
      }
    }
  }
  return max;
}

export interface TermMonth {
  year: number;
  /** 0 based, like Date#getMonth */
  month: number;
  label: string;
  /** Monday that starts the first teaching week inside this month */
  firstMonday: Date;
  weeks: number[];
}

/** 识别课表覆盖的月份：从学期开始到最后一个教学周。 */
export function termMonths(schedule: ScheduleData): TermMonth[] {
  const start = startOfWeek(parseISODate(schedule.termStart));
  const lastWeek = maxWeekOf(schedule);
  const end = addDays(start, lastWeek * 7 - 1);
  const months: TermMonth[] = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  while (cursor <= end) {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const monthStart = new Date(year, month, 1);
    const monthEnd = new Date(year, month + 1, 0);
    // teaching weeks whose Monday falls inside this month (or that overlap its first days)
    const weeks: number[] = [];
    for (let week = 1; week <= lastWeek; week += 1) {
      const monday = addDays(start, (week - 1) * 7);
      const sunday = addDays(monday, 6);
      if (monday <= monthEnd && sunday >= monthStart) weeks.push(week);
    }
    if (weeks.length) {
      const firstWeekMonday = addDays(start, (weeks[0] - 1) * 7);
      months.push({
        year,
        month,
        label: `${year}年${month + 1}月`,
        firstMonday: firstWeekMonday < monthStart ? monthStart : firstWeekMonday,
        weeks,
      });
    }
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return months;
}

/** 把某门课的周次换算成具体上课日期（用于显示月份与具体日期）。 */
export function courseDates(course: ScheduleCourse, termStart: string, dayIndex: number): Date[] {
  const start = startOfWeek(parseISODate(termStart));
  return [...parseWeekSpec(course.weeks)]
    .sort((a, b) => a - b)
    .map((week) => addDays(start, (week - 1) * 7 + dayIndex));
}

export function formatMonthDayWeekday(date: Date): string {
  return `${date.getMonth() + 1}月${date.getDate()}日 ${WEEKDAY_SHORT[weekdayIndex(date)]}`;
}

export type ScheduleField = 'course' | 'teacher' | 'place';

export interface SearchHit {
  field: ScheduleField;
  course: ScheduleCourse;
  dayIndex: number;
  dayLabel: string;
  period: string;
  time: string;
}

/** Search courses by name / teacher / room, de-duplicated into a flat list. */
export function searchSchedule(schedule: ScheduleData, query: string, field: ScheduleField | 'all' = 'all'): SearchHit[] {
  const needle = query.trim().toLowerCase();
  const hits: SearchHit[] = [];
  const seen = new Set<string>();
  schedule.periods.forEach((period) => {
    period.days.forEach((courses, dayIndex) => {
      for (const course of courses) {
        const haystack =
          field === 'teacher' ? course.teacher : field === 'place' ? course.room : field === 'course' ? course.name : `${course.name} ${course.teacher} ${course.room}`;
        if (needle && !haystack.toLowerCase().includes(needle)) continue;
        const key = `${field}|${courseKey(course)}|${dayIndex}|${period.period}`;
        if (seen.has(key)) continue;
        seen.add(key);
        hits.push({
          field: field === 'all' ? 'course' : field,
          course,
          dayIndex,
          dayLabel: WEEKDAY_LONG[dayIndex] ?? schedule.days[dayIndex] ?? '',
          period: period.period,
          time: period.time,
        });
      }
    });
  });
  return hits;
}

/* ------------------------------------------------------------------- maps -- */

export interface MapProvider {
  id: string;
  label: string;
  /** build a URL that searches/navigates to the given address */
  url: (address: string) => string;
  hint: string;
}

export const MAP_PROVIDERS: MapProvider[] = [
  {
    id: 'amap',
    label: '高德地图',
    hint: 'uri.amap.com 地点搜索',
    url: (address) => `https://uri.amap.com/search?keyword=${encodeURIComponent(address)}&src=m3notes&coordinate=gaode&callnative=1`,
  },
  {
    id: 'baidu',
    label: '百度地图',
    hint: 'map.baidu.com 地点检索',
    url: (address) => `https://map.baidu.com/search?querytype=s&wd=${encodeURIComponent(address)}`,
  },
  {
    id: 'tencent',
    label: '腾讯地图',
    hint: 'apis.map.qq.com 地点搜索',
    url: (address) => `https://apis.map.qq.com/uri/v1/search?keyword=${encodeURIComponent(address)}&referer=m3notes`,
  },
  {
    id: 'google',
    label: 'Google 地图',
    hint: 'google.com/maps 搜索',
    url: (address) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`,
  },
  {
    id: 'apple',
    label: 'Apple 地图',
    hint: 'maps.apple.com 搜索',
    url: (address) => `https://maps.apple.com/?q=${encodeURIComponent(address)}`,
  },
];

export function mapProviderById(id: string): MapProvider | undefined {
  return MAP_PROVIDERS.find((provider) => provider.id === id);
}

/**
 * 把教室拼成完整地址：校名 + 「xx栋xx号」。
 * 「16-203」→「16栋203」；含楼/馆/室/校区的地址直接接在校名后面。
 */
export function formatAddress(room: string, schoolName: string): string {
  const school = schoolName.trim();
  const raw = room.replace(/\[\d+人\]/g, '').trim();
  if (!raw) return school;
  const building = /^(\d+)\s*[-–]\s*(\d+)$/.exec(raw);
  let detail = raw;
  if (building) detail = `${building[1]}栋${building[2]}号`;
  else if (/^\d+[-–]/.test(raw)) detail = raw.replace(/^(\d+)\s*[-–]\s*/, '$1栋');
  const alreadyCampus = /校区|大学|学院/.test(raw);
  if (!school) return detail;
  return alreadyCampus ? `${school}${detail}` : `${school} ${detail}`;
}

/**
 * 各家的「App 内跳转」URI（Android/iOS 应用直接以 Activity 打开）。
 * 桌面或不支持时会退回 https 网页地址。
 */
export function mapAppUri(providerId: string, address: string): string | null {
  const encoded = encodeURIComponent(address);
  switch (providerId) {
    case 'amap':
      return `androidamap://keywordNavi?sourceApplication=duofen-kebiao&keyword=${encoded}&style=2`;
    case 'baidu':
      return `baidumap://map/geocoder?address=${encoded}&src=webapp.duofen-kebiao`;
    case 'tencent':
      return `qqmap://map/search?keyword=${encoded}&referer=duofen-kebiao`;
    case 'google':
      return `google.navigation:q=${encoded}`;
    case 'apple':
      return `maps://?q=${encoded}`;
    default:
      return null;
  }
}

function isMobileLike(): boolean {
  return /Android|iPhone|iPad|iPod|HarmonyOS|Mobile/i.test(navigator.userAgent);
}

/**
 * 打开地图：移动端先尝试直接唤起地图 App（Activity / URL Scheme），
 * 1.2 秒内没有切走就退回网页地址；桌面直接开网页。
 */
export function openMapLink(provider: MapProvider, address: string): 'app' | 'web' {
  const web = provider.url(address);
  const app = mapAppUri(provider.id, address);
  if (!app || !isMobileLike()) {
    window.open(web, '_blank', 'noopener,noreferrer');
    return 'web';
  }
  let fellBack = false;
  const timer = window.setTimeout(() => {
    fellBack = true;
    window.open(web, '_blank', 'noopener,noreferrer');
  }, 1200);
  const onHide = () => {
    if (fellBack) return;
    window.clearTimeout(timer);
    document.removeEventListener('visibilitychange', onHide);
  };
  document.addEventListener('visibilitychange', onHide);
  window.location.href = app;
  return 'app';
}

/* -------------------------------------------------------------- importers -- */
/* The importers run in the browser: no Node APIs, only TextDecoder/DOMParser. */

const CELL = '\u001f';
const ROW = '\u001e';

function stripRtfDestinations(text: string): string {
  const skip = ['fonttbl', 'colortbl', 'stylesheet', 'info', 'listtable', 'listoverridetable', 'generator', 'pict', 'header', 'footer'];
  let out = '';
  let i = 0;
  while (i < text.length) {
    if (text[i] === '{') {
      const match = /^\{\\(\*?)([a-z]+)/.exec(text.slice(i, i + 40));
      if (match && (match[1] === '*' || skip.includes(match[2]))) {
        let depth = 0;
        let j = i;
        while (j < text.length) {
          if (text[j] === '\\' && text[j + 1] === '{') j += 1;
          else if (text[j] === '{') depth += 1;
          else if (text[j] === '}') {
            depth -= 1;
            if (depth === 0) break;
          }
          j += 1;
        }
        i = j + 1;
        continue;
      }
    }
    out += text[i];
    i += 1;
  }
  return out;
}

/** RTF text -> UTF-8 string, keeping the raw bytes of the document text. */
function rtfToMarkedText(text: string): string {
  const bytes: number[] = [];
  const pushRaw = (char: string) => {
    const code = char.codePointAt(0) ?? 0;
    if (code <= 0xff) bytes.push(code);
    else bytes.push(...new TextEncoder().encode(String.fromCodePoint(code)));
  };
  const pushText = (value: string) => bytes.push(...new TextEncoder().encode(value));

  let i = 0;
  while (i < text.length) {
    const char = text[i];
    if (char === '{' || char === '}') {
      i += 1;
      continue;
    }
    if (char !== '\\') {
      pushRaw(char);
      i += 1;
      continue;
    }
    const rest = text.slice(i);
    let match = /^\\u(-?\d+)\s?\??/.exec(rest);
    if (match) {
      const code = Number(match[1]);
      pushText(String.fromCharCode(code < 0 ? code + 65536 : code));
      i += match[0].length;
      continue;
    }
    match = /^\\'([0-9a-fA-F]{2})/.exec(rest);
    if (match) {
      bytes.push(parseInt(match[1], 16));
      i += match[0].length;
      continue;
    }
    match = /^\\([a-zA-Z]+)(-?\d+)?\s?/.exec(rest);
    if (match) {
      const word = match[1];
      if (word === 'cell') pushText(CELL);
      else if (word === 'row' || word === 'nestrow') pushText(ROW);
      else if (word === 'par' || word === 'line') pushText('\n');
      else if (word === 'tab') pushText('\t');
      i += match[0].length;
      continue;
    }
    i += 1;
  }
  return new TextDecoder('utf-8').decode(new Uint8Array(bytes));
}

function cleanCell(text: string): string {
  return text
    .split('\n')
    .map((line) => line.replace(/[\u0000-\u0008\u000b-\u001d]/g, '').trim())
    .filter((line) => line && !/^-{3,}$/.test(line))
    .join('\n')
    .trim();
}

function parseCoursesFromCell(cell: string): ScheduleCourse[] {
  if (!cell) return [];
  const lines = cell.split('\n').map((line) => line.trim()).filter(Boolean);
  const courses: { name: string; details: string[] }[] = [];
  for (const line of lines) {
    // a course name is a free text line; weeks / teacher / class / room lines are details
    const isDetail =
      /^\[.*\]$/.test(line) ||
      /周\[/.test(line) ||
      /班$|班\[/.test(line) ||
      /^\d+-\d+/.test(line) ||
      /[馆室楼]|校区|\[\d+人\]/.test(line);
    if (!isDetail || !courses.length) courses.push({ name: line, details: [] });
    else courses[courses.length - 1].details.push(line);
  }
  return courses.map((course) => {
    const weeks = course.details.find((line) => /周\[/.test(line)) ?? '';
    const teacher = course.details.find((line) => /^\[.*\]$/.test(line)) ?? '';
    const rest = course.details.filter((line) => line !== weeks && line !== teacher);
    const roomIndex = rest.findIndex((line) => /\d+-\d+|馆|室|校区|楼/.test(line));
    return {
      name: course.name,
      weeks: weeks.replace(/\[.*\]/, '').replace(/周$/, '').trim(),
      teacher: teacher.replace(/^\[|\]$/g, '').trim(),
      className: (rest.find((_, index) => index !== roomIndex) ?? '').trim(),
      room: (roomIndex >= 0 ? rest[roomIndex] : '').replace(/\[\d+人\]/g, '').trim(),
      raw: course.details.join(' / '),
    };
  });
}

function sectionOf(period: string): ScheduleSection {
  if (/中午/.test(period)) return 'noon';
  const index = Number(/第(\d+)/.exec(period)?.[1] ?? 0);
  if (index <= 4) return 'morning';
  if (index <= 8) return 'afternoon';
  return 'evening';
}

/** Build a schedule from a rows x cells matrix of already extracted text. */
export function scheduleFromCells(
  rows: string[][],
  meta: { owner?: string; term?: string; termStart?: string } = {},
): ScheduleData {
  const timeRe = /(\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2})/;
  const headerRow = rows.find((cells) => (cells[0] ?? '').includes('星期') || (cells[0] ?? '').includes('节次'));
  let days = (headerRow ?? []).slice(1).map((cell) => cell.replace(/\s/g, '')).filter(Boolean);
  if (days.length < 5) days = WEEKDAY_LONG.slice();

  const periods: SchedulePeriod[] = [];
  for (const cells of rows) {
    const first = (cells[0] ?? '').replace(/\n/g, ' ').trim();
    if (!/^第.*节/.test(first)) continue;
    const match = /^(第\S*节)\s*(.*)$/.exec(first);
    const period = match?.[1] ?? first;
    const time = (match?.[2] ?? '').match(timeRe)?.[1] ?? match?.[2]?.trim() ?? '';
    periods.push({
      period,
      time,
      section: sectionOf(period),
      days: days.map((_, index) => parseCoursesFromCell(cells[index + 1] ?? '')),
    });
  }
  if (!periods.length) throw new Error('没有解析到课表节次，请确认文件内容');

  const firstYear = new Date().getFullYear();
  const term = meta.term ?? `${firstYear}-${firstYear + 1}-1`;
  return {
    owner: meta.owner ?? '',
    term,
    termStart: meta.termStart ?? toISODate(startOfWeek(new Date(firstYear, 8, 1))),
    days: days.length ? days : WEEKDAY_LONG.slice(),
    periods,
  };
}

/** Parse the school system's RTF/DOC export. */
export function parseRtfSchedule(buffer: ArrayBuffer): ScheduleData {
  const bytes = new Uint8Array(buffer);
  let latin = '';
  for (let i = 0; i < bytes.length; i += 1) latin += String.fromCharCode(bytes[i]);
  const marked = rtfToMarkedText(stripRtfDestinations(latin));
  const rows = marked
    .split(ROW)
    .map((row) => row.split(CELL).map(cleanCell))
    .filter((cells) => cells.some(Boolean) && !/iText|课表信息/.test(cells[0] ?? ''));

  const owner = /课表信息/.exec(marked) ? (/(\S+)\s+课表信息/.exec(marked)?.[1] ?? '').replace(/^.*?(\S+)$/, '$1') : '';
  const term = /(\d{4}-\d{4}-\d)/.exec(marked)?.[1];
  return scheduleFromCells(rows, { owner, term });
}

/** Parse an HTML page/table export (浏览器"另存为"或教务系统导出). */
export function parseHtmlSchedule(html: string): ScheduleData {
  // 先用新的「HTML 课表算法」解析（支持网格表与列表表两种导出结构）；
  // 若它一门课都没识别出来，再回落到下面的旧实现。
  try {
    const better = parseScheduleHtml(html);    if (better.diagnostics.courses > 0) {
      return better;
    }
  } catch {
    /* 继续走旧实现 */
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const table = doc.querySelector('table');
  if (!table) throw new Error('HTML 里没有找到表格');
  const rows: string[][] = [];
  table.querySelectorAll('tr').forEach((tr) => {
    const cells = Array.from(tr.querySelectorAll('th,td')).map((cell) =>
      (cell.textContent ?? '').replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ').trim(),
    );
    if (cells.length) rows.push(cells);
  });
  const text = doc.body.textContent ?? '';
  return scheduleFromCells(rows, { term: /(\d{4}-\d{4}-\d)/.exec(text)?.[1] });
}

/**
 * Parse pasted plain text: one line per cell, tab separated rows, the format the
 * RTF dump / 教务系统 copy produces.
 */
export function parseTextSchedule(text: string): ScheduleData {
  const normalized = text.replace(/\r\n?/g, '\n');
  const rows = normalized
    .split(/\n\s*\n|(?=^节次)/m)
    .map((block) => block.split('\n').filter((line) => line.trim().length))
    .filter((lines) => lines.length);

  // rebuild a matrix: a period line starts a row, following lines belong to the previous cell
  const matrix: string[][] = [];
  let current: string[] | null = null;
  const periodRe = /^第.*节/;
  for (const line of normalized.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (/^节次|^星期/.test(trimmed)) {
      matrix.push(trimmed.split(/\t|\s{2,}/).map((cell) => cell.trim()));
      current = null;
      continue;
    }
    if (periodRe.test(trimmed)) {
      current = trimmed.includes('\t') ? trimmed.split('\t') : [trimmed];
      matrix.push(current);
      continue;
    }
    if (current) {
      if (trimmed.includes('\t')) current.push(...trimmed.split('\t'));
      else if (current.length > 1) current[current.length - 1] = `${current[current.length - 1]}\n${trimmed}`;
      else current.push(trimmed);
    }
  }
  const cleaned = matrix.map((cells) => cells.map((cell) => cleanCell(cell)));
  void rows;
  return scheduleFromCells(cleaned, {});
}

/** Unified importer used by the UI. */
export async function parseScheduleFile(file: File): Promise<ScheduleData> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.rtf') || name.endsWith('.doc')) {
    return parseRtfSchedule(await file.arrayBuffer());
  }
  const text = await file.text();
  if (name.endsWith('.html') || name.endsWith('.htm') || /<table/i.test(text)) {
    return parseHtmlSchedule(text);
  }
  if (name.endsWith('.csv') || name.endsWith('.txt') || name.endsWith('.tsv')) {
    return parseTextSchedule(text);
  }
  // last resort: sniff the content
  if (/^\{\\rtf/.test(text.slice(0, 20))) return parseRtfSchedule(await file.arrayBuffer());
  return parseTextSchedule(text);
}
