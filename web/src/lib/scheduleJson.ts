/**
 * 课表 JSON 导入。
 *
 * 为什么要有它：`parseScheduleFile` 原来只认 **.doc/.rtf、.html、.csv/.txt** 四条路，
 * 粘 JSON 会掉进「纯文本解析器」→ 报「没有解析到课表节次」。可现实里 JSON 是最好给的一种格式：
 * 多模态模型、别的课表工具、自己写脚本导出的，常常就是一段 JSON。作者 2026-09-26 报的
 * 「HTML / JSON 导入失效，主页没拿到新课表」就是这条路**根本不存在**。
 *
 * 两种形状都收（这是刻意的宽松，不是凑合）：
 *
 *  A. 应用自己的形状（`ScheduleData`）：`{ owner, term, termStart, days, periods:[{ period, time, section, days:[[course,…],…] }] }`
 *     —— 从别处导出/自己拼的完整课表，字段名对得上就用原值，缺失的补默认值。
 *  B. 扁平课程数组：`{ courses:[{ name, day, period, teacher, room, weeks }] }`（或顶层就是数组）
 *     —— 多模态模型最常吐的形状，按「星期 × 节次」聚合成上面的矩阵。
 *
 * 还容忍：```json 围栏、前后带说明文字、`{ "schedule": {…} }` 包一层。
 * 解析不出任何课程时**抛错**，绝不返回一张空课表 —— 空课表会被上层当成"导入成功"，
 * 而主页会因为"没有课程就回落内置课表"继续显示旧表，用户看到的就是「导入了但主页没变」。
 */
import type { ScheduleCourse, ScheduleData, SchedulePeriod, ScheduleSection } from './schedule';

/** 与 schedule.ts 保持一致；这里各写一份是为了不引入运行时循环依赖（那边要 import 本模块） */
const WEEKDAYS_LONG = ['星期一', '星期二', '星期三', '星期四', '星期五', '星期六', '星期日'];
const SECTIONS: ScheduleSection[] = ['morning', 'noon', 'afternoon', 'evening'];

/** 星期字段的各种写法 → 0(周一) … 6(周日) */
const WEEKDAY_ALIASES: Array<[RegExp, number]> = [
  [/^(星期一|周一|礼拜一|monday|mon|1)$/i, 0],
  [/^(星期二|周二|礼拜二|tuesday|tue|2)$/i, 1],
  [/^(星期三|周三|礼拜三|wednesday|wed|3)$/i, 2],
  [/^(星期四|周四|礼拜四|thursday|thu|4)$/i, 3],
  [/^(星期五|周五|礼拜五|friday|fri|5)$/i, 4],
  [/^(星期六|周六|礼拜六|saturday|sat|6)$/i, 5],
  [/^(星期日|星期天|周日|周天|礼拜日|sunday|sun|7|0)$/i, 6],
];

export const asText = (value: unknown): string => (typeof value === 'string' ? value : typeof value === 'number' ? String(value) : '');

/** 节次标签里的数字 → 上/中/下/晚 四段（缺 section 字段时用它兜底） */
export const sectionForPeriod = (label: string, fallbackIndex: number): ScheduleSection => {
  const matched = /(\d{1,2})/.exec(label);
  const order = matched ? Number(matched[1]) : fallbackIndex * 2 + 1;
  if (order <= 4) return 'morning';
  if (order <= 6) return 'noon';
  if (order <= 8) return 'afternoon';
  return 'evening';
};

/** 星期字段 → 下标；认不出来返回 -1 */
export const weekdayIndex = (value: unknown): number => {
  const text = asText(value).trim();
  if (!text) return -1;
  for (const [re, index] of WEEKDAY_ALIASES) if (re.test(text)) return index;
  return -1;
};

/** 周次：字符串原样（去掉「周」）、数字、数字数组都收 → `weeks` 规格串 */
export const weeksToSpec = (value: unknown): string => {
  if (Array.isArray(value)) {
    const numbers = [...new Set(value.map((v) => Number(v)).filter((n) => Number.isFinite(n) && n > 0))].sort((a, b) => a - b);
    if (!numbers.length) return '';
    const runs: string[] = [];
    let start = numbers[0];
    let prev = numbers[0];
    for (const n of numbers.slice(1)) {
      if (n === prev + 1) {
        prev = n;
        continue;
      }
      runs.push(start === prev ? String(start) : `${start}-${prev}`);
      start = n;
      prev = n;
    }
    runs.push(start === prev ? String(start) : `${start}-${prev}`);
    return runs.join(';');
  }
  return asText(value).replace(/\s+/g, '').replace(/周/g, '');
};

const courseFrom = (raw: unknown): ScheduleCourse | null => {
  if (!raw || typeof raw !== 'object') {
    const name = asText(raw).trim();
    return name ? { name, weeks: '', teacher: '', className: '', room: '' } : null;
  }
  const item = raw as Record<string, unknown>;
  const name = (asText(item.name) || asText(item.course) || asText(item.courseName) || asText(item.title)).trim();
  if (!name) return null;
  return {
    name,
    weeks: weeksToSpec(item.weeks ?? item.week ?? item.weekRange ?? item.weeksText),
    teacher: asText(item.teacher) || asText(item.teacherName),
    className: asText(item.className) || asText(item.class) || asText(item.major),
    room: asText(item.room) || asText(item.location) || asText(item.place) || asText(item.classroom),
    raw: asText(item.raw) || undefined,
  };
};

/** 从一段可能带围栏/说明文字/前后废话的文本里抠出 JSON */
export const extractJsonValue = (text: string): unknown => {
  const unfenced = text.replace(/```(?:json|JSON)?/g, '');
  const start = unfenced.search(/[[{]/);
  if (start === -1) throw new Error('没有找到 JSON 内容（应是一段 {...} 或 [...]）');
  // 从第一个 { 或 [ 起，按括号配平截取（字符串里的括号要跳过）
  const open = unfenced[start];
  const close = open === '{' ? '}' : ']';
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < unfenced.length; i += 1) {
    const ch = unfenced[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === open) depth += 1;
    else if (ch === close) {
      depth -= 1;
      if (depth === 0) {
        const slice = unfenced.slice(start, i + 1);
        try {
          return JSON.parse(slice);
        } catch (error) {
          throw new Error(`JSON 语法错误：${error instanceof Error ? error.message : '无法解析'}`);
        }
      }
    }
  }
  throw new Error('JSON 括号没有闭合（可能被截断了）');
};

const countCourses = (periods: SchedulePeriod[]) =>
  periods.reduce((total, period) => total + period.days.reduce((sum, day) => sum + day.length, 0), 0);

/** A 形状：应用自己的 ScheduleData */
const fromAppShape = (node: Record<string, unknown>): ScheduleData | null => {
  const rawPeriods = node.periods;
  if (!Array.isArray(rawPeriods)) return null;
  const periods: SchedulePeriod[] = rawPeriods.map((entry, index) => {
    const item = (entry ?? {}) as Record<string, unknown>;
    const label = asText(item.period) || asText(item.name) || `第${index * 2 + 1}-${index * 2 + 2}节`;
    const section = SECTIONS.includes(item.section as ScheduleSection) ? (item.section as ScheduleSection) : sectionForPeriod(label, index);
    const rawDays = Array.isArray(item.days) ? item.days : [];
    const days: ScheduleCourse[][] = [];
    for (let day = 0; day < 7; day += 1) {
      const cell = rawDays[day];
      if (Array.isArray(cell)) {
        days.push(cell.map(courseFrom).filter((course): course is ScheduleCourse => Boolean(course)));
      } else if (cell && typeof cell === 'object') {
        const single = courseFrom(cell);
        days.push(single ? [single] : []);
      } else {
        days.push([]);
      }
    }
    return { period: label, time: asText(item.time) || asText(item.timeRange), section, days };
  });
  const days = Array.isArray(node.days) ? node.days.map(asText).filter(Boolean) : WEEKDAYS_LONG;
  return {
    owner: asText(node.owner) || '未署名',
    term: asText(node.term) || asText(node.termName) || '',
    termStart: asText(node.termStart) || asText(node.startDate) || '',
    days: days.length ? days : WEEKDAYS_LONG,
    periods,
  };
};

/** B 形状：扁平课程数组 → 星期 × 节次 矩阵 */
const fromFlatCourses = (list: unknown[], meta: Record<string, unknown>): ScheduleData | null => {
  const parsed: Array<{ course: ScheduleCourse; day: number; period: string }> = [];
  for (const entry of list) {
    const course = courseFrom(entry);
    if (!course) continue;
    const item = (entry ?? {}) as Record<string, unknown>;
    const day = weekdayIndex(item.day ?? item.weekday ?? item.weekDay ?? item.week ?? item['星期'] ?? item['周几']);
    const label = asText(item.period) || asText(item.section) || asText(item.periodName) || asText(item['节次']) || asText(item['时段']);
    if (day === -1 || !label) continue; // 缺星期或节次的条目跳过（下面会按"一条都没聚起来"报错）
    parsed.push({ course, day, period: /节$/.test(label) ? label : `${label}节` });
  }
  if (!parsed.length) return null;

  const labels: string[] = [];
  for (const { period } of parsed) if (!labels.includes(period)) labels.push(period);
  // 节次按标签里的首个数字排序，让「第1-2节」排在「第3-4节」前面
  labels.sort((a, b) => {
    const na = Number(/(\d{1,2})/.exec(a)?.[1] ?? 99);
    const nb = Number(/(\d{1,2})/.exec(b)?.[1] ?? 99);
    return na - nb;
  });

  const periods: SchedulePeriod[] = labels.map((label, index) => {
    const days: ScheduleCourse[][] = Array.from({ length: 7 }, () => []);
    for (const row of parsed) if (row.period === label) days[row.day].push(row.course);
    return { period: label, time: '', section: sectionForPeriod(label, index), days };
  });
  return {
    owner: asText(meta.owner) || '未署名',
    term: asText(meta.term) || asText(meta.termName) || '',
    termStart: asText(meta.termStart) || asText(meta.startDate) || '',
    days: WEEKDAYS_LONG,
    periods,
  };
};

/** 主入口：一段 JSON 文本 → ScheduleData（解析不出课程就抛错，不返回空表） */
export const parseScheduleJson = (text: string): ScheduleData => {
  const value = extractJsonValue(text);
  const meta = (value && typeof value === 'object' && !Array.isArray(value) ? value : {}) as Record<string, unknown>;
  /** 允许 { "schedule": {…} } / { "data": {…} } 包一层 */
  const inner = (meta.schedule ?? meta.data ?? meta.result) as Record<string, unknown> | undefined;
  const target = inner && typeof inner === 'object' && !Array.isArray(inner) ? { ...meta, ...inner } : meta;

  const appShape = fromAppShape(target as Record<string, unknown>);
  if (appShape && countCourses(appShape.periods) > 0) return appShape;

  const listCandidates: unknown[] = [
    target.courses,
    target.lessons,
    target.items,
    target.list,
    Array.isArray(value) ? value : undefined,
    Array.isArray(inner) ? inner : undefined,
  ];
  for (const candidate of listCandidates) {
    if (!Array.isArray(candidate)) continue;
    const flat = fromFlatCourses(candidate, target as Record<string, unknown>);
    if (flat && countCourses(flat.periods) > 0) return flat;
  }

  throw new Error('JSON 里没有课程：需要 periods[].days[][]（应用形状）或 courses[]（每条含 name + day + period）');
};

/** 判断一段文本像不像 JSON（围栏、前后带说明文字都算） */
export const looksLikeJson = (text: string): boolean => {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (/^[[{]/.test(trimmed)) return true;
  if (/```(?:json)?\s*[[{]/i.test(trimmed)) return true;
  return /[[{][\s\S]*"(?:periods|courses|lessons|schedule|period|节次)"\s*:/.test(trimmed);
};
