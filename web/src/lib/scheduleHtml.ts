/**
 * 内置课表算法：把用户从教务系统导出的 **HTML 课表**转换成可视化课表（ScheduleData）。
 *
 * 支持的两种常见导出结构（自动识别）：
 *   A. **网格表**：行 = 节次（含时间），列 = 星期；单元格里是课程信息
 *      例：`<table><tr><td>第1-2节<br>08:30-09:55</td><td>高等数学<br>张三<br>1-201<br>1-16周</td>…`
 *   B. **列表表**：每行一门课，列为 课程名 / 教师 / 教室 / 时间（含星期与节次）
 *      例：`<tr><td>高等数学</td><td>张三</td><td>1-201</td><td>星期一 第1-2节 1-16周</td></tr>`
 *
 * 解析要点（都是教务导出的常见写法）：
 *   · 周次：`1-16周`、`1-16`、`4;6-9;12-20周[1,2]`、`单周`、`双周`
 *   · 节次：`第1-2节`、`1-2节`、`1,2节`、`3-4`
 *   · 星期：`星期一`/`周一`/`周一`/`Monday`/`一`
 *   · 教师与教室：中文姓名（2–4 字，可带「老师」）、教室形如 `1-201`、`A101`、`16-203[48人]`
 *   · 单元格用 `<br>`、换行或「/」分隔多段信息
 */

import type { Course, ScheduleData } from './schedule';

export interface ParsedSchedule extends ScheduleData {
  /** 解析诊断：命中了几门课、用了哪种结构、有哪些可疑单元格 */
  diagnostics: {
    layout: 'grid' | 'list' | 'unknown';
    courses: number;
    skipped: string[];
    weeksDetected: number[];
  };
}

const DAY_NAMES = ['星期一', '星期二', '星期三', '星期四', '星期五', '星期六', '星期日'];
const DAY_PATTERNS: RegExp[] = [
  /(星期|周)\s*([一二三四五六日天])/,
  /\b(mon|tue|wed|thu|fri|sat|sun)day?\b/i,
];

/** 把「一/二/…/日」映射到 0..6 */
function dayIndexFrom(character: string): number {
  const map: Record<string, number> = { 一: 0, 二: 1, 三: 2, 四: 3, 五: 4, 六: 5, 日: 6, 天: 6 };
  if (character in map) return map[character];
  const english: Record<string, number> = { mon: 0, tue: 1, wed: 2, thu: 3, fri: 4, sat: 5, sun: 6 };
  return english[character.slice(0, 3).toLowerCase()] ?? -1;
}

/** 从一段文字里找出星期索引 */
export function detectDayIndex(text: string): number {
  for (const pattern of DAY_PATTERNS) {
    const match = pattern.exec(text);
    if (match) {
      const index = dayIndexFrom(match[2] ?? match[1]);
      if (index >= 0) return index;
    }
  }
  return -1;
}

/** 解析周次表达式 → 周次数组（用于推断学期周数） */
export function parseWeeks(text: string): number[] {
  const weeks = new Set<number>();
  const cleaned = text.replace(/周/g, '');
  for (const segment of cleaned.split(/[;,，、]/)) {
    const range = /^(\d{1,2})\s*[-–~]\s*(\d{1,2})$/.exec(segment.trim());
    if (range) {
      const start = Number(range[1]);
      const end = Number(range[2]);
      for (let week = start; week <= end && week <= 30; week += 1) weeks.add(week);
      continue;
    }
    const single = /^(\d{1,2})$/.exec(segment.trim());
    if (single) weeks.add(Number(single[1]));
  }
  if (!weeks.size) {
    // 单/双周：给一个保守的 1-20 范围
    if (/单周/.test(text)) for (let w = 1; w <= 20; w += 2) weeks.add(w);
    if (/双周/.test(text)) for (let w = 2; w <= 20; w += 2) weeks.add(w);
  }
  return [...weeks].sort((a, b) => a - b);
}

/** 解析节次表达式 → [起始节, 结束节]（1 基） */
export function parsePeriodRange(text: string): [number, number] | null {
  const normalized = text.replace(/第/g, '').replace(/节/g, '');
  const range = /(\d{1,2})\s*[-–~]\s*(\d{1,2})/.exec(normalized);
  if (range) return [Number(range[1]), Number(range[2])];
  const list = /(\d{1,2})\s*[,，]\s*(\d{1,2})/.exec(normalized);
  if (list) return [Number(list[1]), Number(list[2])];
  const single = /(\d{1,2})/.exec(normalized);
  if (single) return [Number(single[1]), Number(single[1])];
  return null;
}

/** 时间 `08:30-09:55` */
export function detectTime(text: string): string | null {
  const match = /(\d{1,2}:\d{2})\s*[-–~至]\s*(\d{1,2}:\d{2})/.exec(text);
  return match ? `${match[1]}-${match[2]}` : null;
}

const TEACHER_RE = /^[\u4e00-\u9fa5]{2,4}(?:老师|教授)?$/;
const ROOM_RE = /^[A-Za-z]?\d{1,2}[-－]\d{2,3}[A-Za-z]?(?:\[\d+人\])?$|^[A-Za-z]\d{2,4}$/;

/** 把单元格/行的若干段文字归类成课程字段 */
function classify(segments: string[]): { course: Omit<Course, 'weeks'> & { weeks: string }; consumed: Set<number> } | null {
  const consumed = new Set<number>();
  let name = '';
  let teacher = '';
  let room = '';
  let weeks = '';

  segments.forEach((segment, index) => {
    const text = segment.trim();
    if (!text) {
      consumed.add(index);
      return;
    }
    if (/(\d{1,2}\s*[-–~,，]\s*\d{1,2}|\d{1,2})\s*周/.test(text) && !weeks) {
      weeks = text.replace(/\s+/g, '');
      consumed.add(index);
      return;
    }
    if (!room && ROOM_RE.test(text)) {
      room = text.replace(/\[\d+人\]$/, '');
      consumed.add(index);
      return;
    }
    if (!teacher && TEACHER_RE.test(text) && text !== name) {
      teacher = text.replace(/老师$|教授$/, '');
      consumed.add(index);
      return;
    }
    if (!name && text.length >= 2) {
      name = text;
      consumed.add(index);
    }
  });

  if (!name) return null;
  return { course: { name, teacher, room, weeks }, consumed };
}

/** 单元格文本 → 多段（按 <br>、换行、斜杠切分） */
function cellSegments(cell: Element): string[] {
  const html = cell.innerHTML ?? '';
  const withBreaks = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|td|span)>/gi, '\n');
  const div = document.createElement('div');
  div.innerHTML = withBreaks;
  const text = div.textContent ?? '';
  return text
    .split(/[\n/／|]+/)
    .map((piece) => piece.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function tableRows(table: HTMLTableElement): HTMLTableRowElement[] {
  return Array.from(table.querySelectorAll('tr'));
}

/**
 * 主入口：把 HTML 文本解析成 ScheduleData。
 * @param html 教务导出的 HTML（整页或片段均可）
 */
export function parseScheduleHtml(html: string): ParsedSchedule {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const tables = Array.from(doc.querySelectorAll('table'));
  const skipped: string[] = [];
  const weeksSeen = new Set<number>();

  // 默认节次表（覆盖大多数教务课表的作息）
  const defaultPeriods = [
    { period: '第1-2节', time: '08:30-09:55', section: 'morning' as const },
    { period: '第3-4节', time: '10:10-11:35', section: 'morning' as const },
    { period: '第5-6节', time: '12:10-13:35', section: 'noon' as const },
    { period: '第7-8节', time: '14:10-15:35', section: 'afternoon' as const },
    { period: '第9-10节', time: '15:50-17:15', section: 'afternoon' as const },
    { period: '第11-12节', time: '18:10-19:35', section: 'evening' as const },
    { period: '第13-14节', time: '19:50-21:15', section: 'evening' as const },
  ];

  /** 收集到的课程：key = 节次序号-1 + 星期 */
  const grid = new Map<string, Course>();
  const gridPeriods = new Map<number, { period: string; time: string; section: string }>();
  let layout: 'grid' | 'list' | 'unknown' = 'unknown';
  let term = '';
  let termStart = '';

  // 学期与开学日期（常见于页面顶部）
  const pageText = (doc.body?.textContent ?? '').replace(/\s+/g, ' ');
  const termMatch = /(20\d{2})\s*[-–~至]\s*(20\d{2})\s*学?年?\s*(第?[一二]学期|[12]学期)?/.exec(pageText);
  if (termMatch) {
    term = `${termMatch[1]}-${termMatch[2]}${termMatch[3] ? `-${termMatch[3].replace(/第|学期/g, '')}` : ''}`;
  }
  const startMatch = /(20\d{2})\s*[年\-/.]\s*(\d{1,2})\s*[月\-/.]\s*(\d{1,2})/.exec(pageText);
  if (startMatch) {
    termStart = `${startMatch[1]}-${String(Number(startMatch[2])).padStart(2, '0')}-${String(Number(startMatch[3])).padStart(2, '0')}`;
  }

  for (const table of tables) {
    const rows = tableRows(table);
    if (rows.length < 2) continue;

    // 找表头：含 3 个以上星期字样的行
    let headerRowIndex = -1;
    let dayColumns: number[] = [];
    rows.forEach((row, index) => {
      const cells = Array.from(row.querySelectorAll('th,td'));
      const found = cells
        .map((cell, cellIndex) => ({ index: cellIndex, day: detectDayIndex(cell.textContent ?? '') }))
        .filter((item) => item.day >= 0);
      if (found.length >= 3 && headerRowIndex < 0) {
        headerRowIndex = index;
        dayColumns = found.map((item) => item.index);
      }
    });

    if (headerRowIndex >= 0) {
      // ---------- A. 网格表 ----------
      layout = 'grid';
      rows.slice(headerRowIndex + 1).forEach((row) => {
        const cells = Array.from(row.querySelectorAll('th,td'));
        if (cells.length <= dayColumns[0]) return;
        const labelSegments = cellSegments(cells[0]);
        const labelText = labelSegments.join(' ');
        const periodRange = parsePeriodRange(labelText);
        if (!periodRange) return;
        const time = detectTime(labelText) ?? '';
        const [start, end] = periodRange;
        gridPeriods.set(start, {
          period: `第${start}-${end}节`,
          time: time || defaultPeriods.find((p) => p.period === `第${start}-${end}节`)?.time || '',
          section:
            defaultPeriods.find((p) => p.period === `第${start}-${end}节`)?.section ??
            (start <= 4 ? 'morning' : start <= 6 ? 'noon' : start <= 10 ? 'afternoon' : 'evening'),
        });

        dayColumns.forEach((column) => {
          const cell = cells[column];
          if (!cell) return;
          const segments = cellSegments(cell);
          if (!segments.length) return;
          const parsed = classify(segments);
          if (!parsed || !parsed.course.name) {
            const text = segments.join(' ').trim();
            if (text && text !== '—' && text !== '-') skipped.push(text.slice(0, 40));
            return;
          }
          const day = detectDayIndex(cells[column - 1]?.textContent ?? '') >= 0
            ? detectDayIndex(cells[column - 1]?.textContent ?? '')
            : dayColumns.indexOf(column);
          if (day < 0) return;
          const weeks = parsed.course.weeks;
          parseWeeks(weeks).forEach((week) => weeksSeen.add(week));
          grid.set(`${start}-${day}`, {
            name: parsed.course.name,
            teacher: parsed.course.teacher,
            room: parsed.course.room,
            weeks,
            className: '',
          });
        });
      });
      continue;
    }

    // ---------- B. 列表表 ----------
    const listHeader = rows[0];
    const headerCells = Array.from(listHeader.querySelectorAll('th,td')).map((cell) =>
      (cell.textContent ?? '').replace(/\s+/g, ''),
    );
    const hasListHeader = headerCells.some((text) => /课程|名称/.test(text)) && headerCells.some((text) => /时间|节次|星期/.test(text));
    if (!hasListHeader) continue;
    layout = layout === 'grid' ? 'grid' : 'list';

    rows.slice(1).forEach((row) => {
      const cells = Array.from(row.querySelectorAll('th,td')).map((cell) => cell);
      const texts = cells.map((cell) => (cell.textContent ?? '').replace(/\s+/g, ' ').trim());
      const joined = texts.join(' / ');
      const day = detectDayIndex(joined);
      const periodRange = parsePeriodRange(joined);
      if (day < 0 || !periodRange) {
        if (joined) skipped.push(joined.slice(0, 40));
        return;
      }
      const parsed = classify(texts.filter(Boolean));
      if (!parsed) {
        skipped.push(joined.slice(0, 40));
        return;
      }
      const [start, end] = periodRange;
      gridPeriods.set(start, {
        period: `第${start}-${end}节`,
        time: detectTime(joined) ?? defaultPeriods.find((p) => p.period === `第${start}-${end}节`)?.time ?? '',
        section: start <= 4 ? 'morning' : start <= 6 ? 'noon' : start <= 10 ? 'afternoon' : 'evening',
      });
      parseWeeks(parsed.course.weeks).forEach((week) => weeksSeen.add(week));
      grid.set(`${start}-${day}`, {
        name: parsed.course.name,
        teacher: parsed.course.teacher,
        room: parsed.course.room,
        weeks: parsed.course.weeks,
        className: '',
      });
    });
  }

  // 组装 ScheduleData：以解析到的节次为骨架，空节次用默认作息补齐
  const periodKeys = [...new Set([...gridPeriods.keys(), ...defaultPeriods.map((_, index) => index * 2 + 1)])].sort(
    (a, b) => a - b,
  );
  const periods = periodKeys.map((start) => {
    const [end] = parsePeriodRange(`第${start}节`) ?? [start, start];
    const meta = gridPeriods.get(start) ?? {
      period: `第${start}-${end + 1}节`,
      time: defaultPeriods.find((p) => p.period === `第${start}-${end + 1}节`)?.time ?? '',
      section: defaultPeriods.find((p) => p.period === `第${start}-${end + 1}节`)?.section ?? 'morning',
    };
    const days: Course[][] = DAY_NAMES.map(() => []);
    DAY_NAMES.forEach((_, dayIndex) => {
      const course = grid.get(`${start}-${dayIndex}`);
      if (course) days[dayIndex] = [course];
    });
    return {
      period: meta.period,
      time: meta.time || '—',
      section: meta.section as 'morning' | 'noon' | 'afternoon' | 'evening',
      days,
    };
  });

  const courses = periods.reduce(
    (sum, period) => sum + period.days.reduce((daySum, day) => daySum + day.length, 0),
    0,
  );

  return {
    owner: '由 HTML 课表导入',
    term: term || '未标注学期',
    termStart: termStart || new Date().toISOString().slice(0, 10),
    days: DAY_NAMES,
    periods,
    diagnostics: {
      layout,
      courses,
      skipped: skipped.slice(0, 12),
      weeksDetected: [...weeksSeen].sort((a, b) => a - b),
    },
  };
}
