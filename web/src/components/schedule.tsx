/**
 * 课表 (schedule) building blocks:
 *  - PagedWeekBoard: the 4x4 board (上午/中午/下午/晚上 × 4 days) that pages left/right
 *    through the seven days of a teaching week; the table itself does not move with
 *    the pointer - a left/right swipe switches page with a spring animation.
 *  - MonthDateDialog: 识别课表月份，按月份或具体日期跳转。
 *  - DayTimeline: the selected day's courses grouped by 上午/中午/下午/晚上.
 *  - CourseDetailSheet / MapChooserDialog / ScheduleImportSheet.
 */
import { Fragment, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { MdIcon, MdIconButton, MdTextField, useMdDialog } from './md';
import { analyzeImage } from '../lib/api';
import { listSnapshots, relativeTime, saveSnapshot, type ScheduleSnapshot } from '../lib/scheduleCache';
import { guessPublisher, matchCourseByText } from '../lib/textbooks';
import { AlertDialog, ExpandableSheet } from './overlays';
import {
  MAP_PROVIDERS,
  SCHEDULE_SECTIONS,
  WEEKDAY_SHORT,
  addDays,
  courseDates,
  courseKey,
  courseRunsInWeek,
  courseWeekLabel,
  coursesOfDay,
  formatMonthDay,
  formatMonthDayWeekday,
  isSameDay,
  mapProviderById,
  maxWeekOf,
  parseISODate,
  parseHtmlSchedule,
  parseScheduleFile,
  parseTextSchedule,
  startOfWeek,
  termMonths,
  toISODate,
  weekdayIndex,
  type DayCourse,
  type ScheduleCourse,
  type ScheduleData,
  type SchedulePeriod,
  type ScheduleSection,
} from '../lib/schedule';
import { looksLikeJson, parseScheduleJson } from '../lib/scheduleJson';
import { IMPORT_FILE_HINT } from '../lib/importPrompts';
import { useAppState } from '../state/AppState';
import { captureImageFile, pickFile, prepareImageFile } from '../lib/imaging';

/* --------------------------------------------------------------- helpers --- */

/** Stable tone per course so the same class keeps the same container color. */
function toneOf(course: ScheduleCourse): 0 | 1 | 2 {
  let hash = 0;
  for (let i = 0; i < course.name.length; i += 1) hash = (hash * 31 + course.name.charCodeAt(i)) % 997;
  return (hash % 3) as 0 | 1 | 2;
}

export function highlightKeyFor(course: ScheduleCourse, dayIndex: number): string {
  return `${courseKey(course)}#${dayIndex}`;
}

/* --------------------------------------------- 4x4 paged week board -------- */

interface BoardDay {
  date: Date;
  dayIndex: number;
  /** the fourth column of the second page belongs to the next teaching week */
  nextWeek: boolean;
}

interface BoardCellCourse {
  course: ScheduleCourse;
  period: SchedulePeriod;
}

const PAGE_SIZE = 4;
const MAX_CHIPS = 3;

/**
 * The four-by-four board: four rows (上午 / 中午 / 下午 / 晚上) × four day columns.
 * A teaching week has seven days, so the board pages left/right to cover them
 * (page 1: 周一–周四, page 2: 周五–周日 + 下周一) with a finger-following drag.
 */
export function PagedWeekBoard({
  schedule,
  week,
  anchorDate,
  selectedDate,
  highlightKey,
  collapsed,
  onToggleCollapse,
  onSelectDay,
  onOpenCourse,
}: {
  schedule: ScheduleData;
  week: number;
  /** a date inside the week shown by the board */
  anchorDate: Date;
  selectedDate: Date;
  highlightKey?: string | null;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onSelectDay: (date: Date) => void;
  onOpenCourse: (payload: { course: ScheduleCourse; period: SchedulePeriod; dayIndex: number }) => void;
}) {
  const today = new Date();
  const mondayKey = toISODate(startOfWeek(anchorDate));
  const monday = useMemo(() => parseISODate(mondayKey), [mondayKey]);

  const pages = useMemo<BoardDay[][]>(
    () => [
      [0, 1, 2, 3].map((offset) => ({ date: addDays(monday, offset), dayIndex: offset, nextWeek: false })),
      [4, 5, 6, 7].map((offset) => ({
        date: addDays(monday, offset),
        dayIndex: offset % 7,
        nextWeek: offset === 7,
      })),
    ],
    [monday],
  );

  const [page, setPage] = useState(() => (weekdayIndex(selectedDate) >= PAGE_SIZE ? 1 : 0));
  // 手势只用来“翻页/收起”，表格本身不跟着指针平移：滑动结束后用弹簧动画切到目标页
  const startX = useRef(0);
  const startY = useRef(0);
  const captured = useRef(false);
  const boardRef = useRef<HTMLDivElement>(null);

  // keep the visible page in sync when the selected day moves to the other half
  useEffect(() => {
    if (!isSameDay(startOfWeek(selectedDate), monday)) return;
    const index = weekdayIndex(selectedDate);
    setPage(index >= PAGE_SIZE ? 1 : 0);
  }, [selectedDate, monday]);

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    startX.current = event.clientX;
    startY.current = event.clientY;
    captured.current = false;
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (captured.current) return;
    const dx = Math.abs(event.clientX - startX.current);
    const dy = Math.abs(event.clientY - startY.current);
    // 只有真正开始滑动时才捕获指针，短按仍然落到课程卡片上
    if (Math.max(dx, dy) < 14) return;
    captured.current = true;
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
  };

  const endGesture = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!captured.current) return;
    captured.current = false;
    const dx = event.clientX - startX.current;
    const dy = event.clientY - startY.current;
    const horizontal = Math.abs(dx) > Math.abs(dy);

    if (horizontal && Math.abs(dx) > 44) {
      // 左右滑动：直接翻到上一页 / 下一页（不跟手平移）
      setPage((value) => (dx < 0 ? Math.min(pages.length - 1, value + 1) : Math.max(0, value - 1)));
      return;
    }
    if (!horizontal && Math.abs(dy) > 40) {
      // 向下滑收起课表，向上滑展开
      if (dy > 0 && !collapsed) onToggleCollapse();
      else if (dy < 0 && collapsed) onToggleCollapse();
    }
  };

  const sections = useMemo(
    () =>
      SCHEDULE_SECTIONS.map((section) => ({
        ...section,
        periods: schedule.periods.filter((period) => period.section === section.id),
      })).filter((section) => section.periods.length),
    [schedule.periods],
  );

  const cellsFor = (dayIndex: number, section: ScheduleSection): BoardCellCourse[] => {
    const periods = schedule.periods.filter((period) => period.section === section);
    const result: BoardCellCourse[] = [];
    for (const period of periods) {
      for (const course of period.days[dayIndex] ?? []) {
        if (courseRunsInWeek(course, week)) result.push({ course, period });
      }
    }
    return result;
  };

  const dayCourseCount = (dayIndex: number) =>
    schedule.periods.reduce(
      (total, period) =>
        total + (period.days[dayIndex] ?? []).filter((course) => courseRunsInWeek(course, week)).length,
      0,
    );

  return (
    <div className={['week-board', collapsed ? 'collapsed' : ''].join(' ').trim()}>
      {/* collapsed summary bar: 向下滑动收起课表后显示更多内容 */}
      <button type="button" className="week-collapse-bar" onClick={onToggleCollapse} aria-expanded={!collapsed}>
        <MdIcon name="calendar_month" size={20} />
        <span className="flex-1 md-title-small-emphasized">
          第 {week} 周 · {WEEKDAY_SHORT[weekdayIndex(selectedDate)]} {formatMonthDay(selectedDate)} ·{' '}
          {dayCourseCount(weekdayIndex(selectedDate))} 门课
        </span>
        <span className="md-label-medium muted">{collapsed ? '展开课表' : '收起课表'}</span>
        <MdIcon name={collapsed ? 'expand_more' : 'expand_less'} size={20} />
      </button>

      <div className="week-board-body">
        <div
          className="week-board-viewport"
          ref={boardRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endGesture}
          onPointerCancel={endGesture}
          role="group"
          aria-label="四日课表，左右滑动翻页查看一周七天"
        >
          <div
            className="week-pages"
            style={{
              transform: `translate3d(${-page * 100}%, 0, 0)`,
              transition:
                'transform var(--md-sys-motion-spring-spatial-fast-duration, 350ms) var(--md-sys-motion-spring-spatial-fast, ease-out)',
            }}
          >
            {pages.map((days, pageIndex) => (
              <div className="week-page" key={`page-${pageIndex}`} aria-hidden={pageIndex !== page}>
                <div className="week-grid">
                  <div className="week-corner">
                    <MdIcon name="schedule" size={16} />
                  </div>
                  {days.map((day) => {
                    const classes = ['week-day-head'];
                    if (isSameDay(day.date, today)) classes.push('today');
                    if (isSameDay(day.date, selectedDate)) classes.push('selected');
                    if (day.nextWeek) classes.push('next-week');
                    return (
                      <div
                        className={classes.join(' ')}
                        key={day.date.toISOString()}
                        onClick={() => onSelectDay(day.date)}
                      >
                        <span className="md-label-large-emphasized">
                          {WEEKDAY_SHORT[day.dayIndex]}
                          {day.nextWeek ? <span className="md-label-small"> 下</span> : null}
                        </span>
                        <span className="md-label-small">{formatMonthDay(day.date)}</span>
                      </div>
                    );
                  })}

                  {sections.map((section) => {
                    const first = section.periods[0];
                    const last = section.periods[section.periods.length - 1];
                    return (
                      <Fragment key={section.id}>
                        <div className="week-row-head">
                          <span className="md-label-medium-emphasized">{section.label}</span>
                          <span className="md-label-small muted">{first.time.split('-')[0]}</span>
                        </div>
                        {days.map((day) => {
                          const cells = cellsFor(day.dayIndex, section.id);
                          return (
                            <div className="week-cell" key={`${section.id}-${day.date.toISOString()}`}>
                              {cells.slice(0, MAX_CHIPS).map((cell) => {
                                const tone = toneOf(cell.course);
                                const highlighted = highlightKey === highlightKeyFor(cell.course, day.dayIndex);
                                return (
                                  <button
                                    type="button"
                                    key={`${cell.course.name}-${cell.course.teacher}-${cell.period.period}`}
                                    className={`course-chip${tone ? ` tone-${tone}` : ''}${highlighted ? ' highlight' : ''}`}
                                    onClick={() => onOpenCourse({ course: cell.course, period: cell.period, dayIndex: day.dayIndex })}
                                  >
                                    <span className="chip-period">{cell.period.period.replace('第', '').replace('节', '')}</span>
                                    {cell.course.name}
                                  </button>
                                );
                              })}
                              {cells.length > MAX_CHIPS ? (
                                <button
                                  type="button"
                                  className="course-chip more"
                                  onClick={() => onSelectDay(day.date)}
                                >
                                  +{cells.length - MAX_CHIPS} 门
                                </button>
                              ) : null}
                              {!cells.length ? <div className="sched-empty">—</div> : null}
                            </div>
                          );
                        })}
                      </Fragment>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="week-board-footer">
          <button
            type="button"
            className="board-dot"
            aria-label="上一页"
            disabled={page === 0}
            onClick={() => setPage((value) => Math.max(0, value - 1))}
          >
            <MdIcon name="chevron_left" size={18} />
          </button>
          <div className="board-dots">
            {pages.map((_, index) => (
              <span
                key={`dot-${index}`}
                className={`board-dot-pill${index === page ? ' active' : ''}`}
                onClick={() => setPage(index)}
              />
            ))}
          </div>
          <span className="md-label-small muted flex-1" style={{ textAlign: 'center' }}>
            {page === 0 ? '周一 – 周四' : '周五 – 周日'} · 共 7 天
          </span>
          <button
            type="button"
            className="board-dot"
            aria-label="下一页"
            disabled={page === pages.length - 1}
            onClick={() => setPage((value) => Math.min(pages.length - 1, value + 1))}
          >
            <MdIcon name="chevron_right" size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}

/** Month / date picker: 识别课表月份并跳转到该月某一周。 */
export function MonthDateDialog({
  open,
  schedule,
  value,
  onCancel,
  onPick,
}: {
  open: boolean;
  schedule: ScheduleData;
  value: Date;
  onCancel: () => void;
  onPick: (date: Date) => void;
}) {
  const months = useMemo(() => termMonths(schedule), [schedule]);
  const [date, setDate] = useState(() => toISODate(value));
  const dialogRef = useMdDialog(open);
  useEffect(() => {
    if (open) setDate(toISODate(value));
  }, [open, value]);

  return (
    <md-dialog ref={dialogRef} className="app-dialog">
      <div slot="headline">选择日期 / 月份</div>
      <div slot="content" className="md-body-medium">
        <div className="muted mb-8">
          课表覆盖 {months.length ? `${months[0].label} – ${months[months.length - 1].label}` : '当前学期'}
          （{schedule.term}，共 {maxWeekOf(schedule)} 个教学周）
        </div>
        <div className="month-chips">
          {months.map((month) => {
            const active = value.getFullYear() === month.year && value.getMonth() === month.month;
            return (
              <button
                type="button"
                key={month.label}
                className={`chip${active ? ' solid' : ''}`}
                onClick={() => onPick(month.firstMonday)}
              >
                <span className="md-label-large">{month.label}</span>
                <span className="md-label-small">第 {month.weeks[0]}–{month.weeks[month.weeks.length - 1]} 周</span>
              </button>
            );
          })}
        </div>
        <div className="md-title-small-emphasized mt-16 mb-8">按具体日期跳转</div>
        <input
          type="date"
          value={date}
          onChange={(event) => setDate(event.target.value)}
          style={{
            height: 56,
            width: '100%',
            borderRadius: 16,
            border: '1px solid var(--md-sys-color-outline)',
            background: 'var(--md-sys-color-surface)',
            color: 'var(--md-sys-color-on-surface)',
            padding: '0 16px',
            fontFamily: 'var(--md-ref-typeface-brand)',
            fontSize: 16,
          }}
        />
        <div className="md-body-small muted mt-8">
          所选日期所在教学周与星期会一起定位到课表。
        </div>
      </div>
      <div slot="actions">
        <md-text-button onClick={onCancel}>取消</md-text-button>
        <md-text-button onClick={() => date && onPick(parseISODate(date))}>跳转</md-text-button>
      </div>
    </md-dialog>
  );
}

/* ------------------------------------------------------------ day timeline -- */

export function DayTimeline({
  schedule,
  date,
  week,
  onOpenCourse,
  onNavigate,
  highlightKey,
}: {
  schedule: ScheduleData;
  date: Date;
  week: number;
  onOpenCourse: (payload: { course: ScheduleCourse; period: SchedulePeriod; dayIndex: number }) => void;
  onNavigate: (address: string, course: ScheduleCourse) => void;
  highlightKey?: string | null;
}) {
  const dayIndex = (date.getDay() + 6) % 7;
  const entries = coursesOfDay(schedule, dayIndex, week);
  const [expanded, setExpanded] = useState<string | null>(null);

  if (!entries.length) {
    return (
      <div className="empty-state" style={{ padding: '24px 16px' }}>
        <div className="empty-icon">
          <MdIcon name="event_available" size={32} />
        </div>
        <div className="md-title-small" style={{ color: 'var(--md-sys-color-on-surface)' }}>
          这一天没有课程
        </div>
        <div className="md-body-small">第 {week} 周 · {WEEKDAY_SHORT[dayIndex]} {formatMonthDay(date)}</div>
      </div>
    );
  }

  return (
    <div>
      {SCHEDULE_SECTIONS.map((section) => {
        const sectionEntries = entries.filter((entry) => entry.section === section.id);
        if (!sectionEntries.length) return null;
        return (
          <div key={section.id}>
            <div className="timeline-section-label">
              <span className="md-label-medium-emphasized">{section.label}</span>
              <span className="rule" />
            </div>
            {sectionEntries.map((entry) => {
              const key = `${entry.period}-${courseKey(entry.course)}`;
              const isOpen = expanded === key;
              const highlighted = highlightKey === highlightKeyFor(entry.course, dayIndex);
              const period = schedule.periods[entry.periodIndex];
              return (
                <div
                  className="timeline-item"
                  key={key}
                  onClick={() => onOpenCourse({ course: entry.course, period, dayIndex })}
                  style={highlighted ? { outline: '2px solid var(--md-sys-color-primary)' } : undefined}
                >
                  <div className="timeline-time">
                    <div className="md-label-small-emphasized">{entry.period.replace('第', '').replace('节', '')}</div>
                    <div className="md-label-small" style={{ opacity: 0.75 }}>
                      {entry.time.split('-')[0]}
                    </div>
                  </div>
                  <div className="timeline-body">
                    <div className="row gap-8">
                      <span className="md-title-small-emphasized flex-1">{entry.course.name}</span>
                      <MdIconButton
                        icon={isOpen ? 'expand_less' : 'expand_more'}
                        label={isOpen ? '收起课程信息' : '展开课程信息'}
                        onClick={(event) => {
                          event.stopPropagation();
                          setExpanded(isOpen ? null : key);
                        }}
                      />
                    </div>
                    <div className="row gap-8 muted md-body-small">
                      <MdIcon name="person" size={14} />
                      <span>{entry.course.teacher || '未填写教师'}</span>
                      <MdIcon name="repeat" size={14} />
                      <span>{courseWeekLabel(entry.course)}</span>
                    </div>
                    {isOpen ? (
                      <div className="timeline-details">
                        <div className="timeline-detail-row md-body-small">
                          <MdIcon name="schedule" size={16} />
                          <span>
                            {entry.period} · {entry.time}
                          </span>
                        </div>
                        <div className="timeline-detail-row md-body-small">
                          <MdIcon name="groups" size={16} />
                          <span>{entry.course.className || '—'}</span>
                        </div>
                        <div className="row" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                          <MdIcon name="place" size={16} />
                          <span className="md-body-small muted">{entry.course.room || '未填写地点'}</span>
                          {entry.course.room ? (
                            <button
                              type="button"
                              className="address-button"
                              onClick={(event) => {
                                event.stopPropagation();
                                onNavigate(entry.course.room, entry.course);
                              }}
                            >
                              <MdIcon name="navigation" size={16} />
                              导航前往
                            </button>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------- course detail sheet */

export function CourseDetailSheet({
  open,
  payload,
  onClose,
  onNavigate,
}: {
  open: boolean;
  payload: { course: ScheduleCourse; period: SchedulePeriod; dayIndex: number } | null;
  onClose: () => void;
  onNavigate: (address: string, course: ScheduleCourse) => void;
}) {
  const sourceRef = useRef<HTMLDivElement>(null);
  const { schedule, settings } = useAppState();
  const course = payload?.course;
  const termStart = settings.termStart || schedule.termStart;
  // 识别课表月份：把周次换算成具体上课日期
  const dates = course && payload ? courseDates(course, termStart, payload.dayIndex) : [];
  const upcoming = dates.filter((date) => date >= new Date());
  const shown = (upcoming.length ? upcoming : dates).slice(0, 5);
  return (
    <ExpandableSheet
      open={open}
      onClose={onClose}
      sourceRef={sourceRef}
      icon="event"
      title={course?.name ?? '课程'}
      /* 抖音评论区那种半遮蔽弹层：顶部课程/时间等信息照旧，**只把下方主操作**
         换成「导航至 <地点>」并贴在弹层底部。 */
      variant="half"
      actions={
        course ? (
          course.room ? (
            <md-filled-button onClick={() => onNavigate(course.room, course)}>
              <MdIcon slot="icon" name="navigation" />
              导航至 {course.room}
            </md-filled-button>
          ) : (
            <span className="md-body-small muted">课表里没写教室，先在「设置 → 导航与学校」里补上，或手动复制地址</span>
          )
        ) : null
      }
    >
      <div ref={sourceRef} />
      {course ? (
        <div className="col gap-12">
          <div className="row gap-8">
            <MdIcon name="schedule" size={18} />
            <span className="md-body-medium">
              {WEEKDAY_SHORT[payload!.dayIndex]} · {payload!.period.period} · {payload!.period.time}
            </span>
          </div>
          <div className="row gap-8">
            <MdIcon name="person" size={18} />
            <span className="md-body-medium">{course.teacher || '未填写教师'}</span>
          </div>
          <div className="row gap-8">
            <MdIcon name="groups" size={18} />
            <span className="md-body-medium">{course.className || '—'}</span>
          </div>
          <div className="row gap-8">
            <MdIcon name="repeat" size={18} />
            <span className="md-body-medium">{courseWeekLabel(course)}</span>
          </div>
          {dates.length ? (
            <div className="col gap-4">
              <div className="row gap-8">
                <MdIcon name="event_available" size={18} />
                <span className="md-body-medium">
                  共 {dates.length} 次课 · {dates[0].getMonth() + 1}月 – {dates[dates.length - 1].getMonth() + 1}月
                </span>
              </div>
              <div className="chip-row">
                {shown.map((date) => (
                  <span className="chip" key={date.toISOString()}>
                    <span className="md-label-large">{formatMonthDayWeekday(date)}</span>
                  </span>
                ))}
                {dates.length > shown.length ? (
                  <span className="chip">
                    <span className="md-label-large">+{dates.length - shown.length}</span>
                  </span>
                ) : null}
              </div>
            </div>
          ) : null}
          <div className="row gap-8" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
            <MdIcon name="place" size={18} />
            <span className="md-body-medium flex-1">{course.room || '未填写地点'}</span>
          </div>

          {/* 教材：内置教材库 + 封面识别结果 */}
          <TextbookSection courseName={course.name} />
        </div>
      ) : null}
    </ExpandableSheet>
  );
}

/* ------------------------------------------------------------ textbooks ---- */

/**
 * 课程详情里的「教材」：优先显示识别/填写结果，其次显示内置教材库
 * （内置库由 12 张教材封面照片整理而来）。可以选图识别封面、手动填写或移除。
 */
export function TextbookSection({ courseName }: { courseName: string }) {
  const { schedule, settings, textbooks, setTextbook, showSnackbar } = useAppState();
  const book = textbooks[courseName];
  const hasBook = Boolean(book && (book.title || book.cover));

  const [dialogOpen, setDialogOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  /** 识别进度文案（交给多模态接口那一步），空串表示不在识别中 */
  const [ocrProgress, setOcrProgress] = useState('');
  const [cover, setCover] = useState<string | null>(null);
  const [ocrText, setOcrText] = useState('');
  const [title, setTitle] = useState('');
  const [publisher, setPublisher] = useState('');
  const [edition, setEdition] = useState('');
  const [target, setTarget] = useState(courseName);
  // 用户点遮罩/Esc 关掉对话框时把状态同步成关（否则它会自己弹回来 —— 作者报的"弹两次"）
  const dialogRef = useMdDialog(dialogOpen, () => setDialogOpen(false));

  const courseNames = useMemo(() => {
    const names = new Set<string>();
    schedule.periods.forEach((period) => period.days.forEach((day) => day.forEach((course) => names.add(course.name))));
    return [...names];
  }, [schedule]);

  /** 取封面文字里最长的一行，通常就是书名 */
  const longestLine = (text: string) =>
    text
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .sort((a, b) => b.length - a.length)[0] ?? '';

  const openDialog = (prefill?: { ocr?: string; cover?: string | null; matched?: string }) => {
    const text = prefill?.ocr ?? '';
    const matched = prefill?.matched ?? courseName;
    const library = textbooks[matched];
    const recognized = longestLine(text);
    setOcrText(text);
    setCover(prefill?.cover ?? book?.cover ?? null);
    setTarget(matched);
    setTitle(library?.title || recognized || '');
    setPublisher(library?.publisher || guessPublisher(text) || '');
    setEdition(library?.edition ?? '');
    setDialogOpen(true);
  };

  /**
   * 选择封面图片：从相册选图后交给**多模态模型**识别，再进对话框确认（相机功能已剔除）。
   *
   * 2026-09-27 下线了本地识别（OpenCV 预处理 + Tesseract 中文 OCR）：作者实测免费多模态模型
   * 读封面又准又省事，而本地那套要给每个包塞 40+ MB 的 wasm 与中文模型（APK 从 26 MB 掉到
   * 4 MB 就是这一刀）。现在只有一条识别路：设置里配好「多模态接口」→ 交给它读；
   * 没配就只保存封面，让用户在对话框里手填或粘贴封面文字。
   *
   * 2026-09-29 作者要求封面支持**系统原生相机拍照**：默认走 `capture="environment"`
   * 直接唤起相机；想从相册挑旧图时才用 mode='library'。
   */
  const captureCover = async (mode: 'camera' | 'library' = 'camera') => {
    const file = mode === 'camera' ? await captureImageFile() : await pickFile('教材封面', 'image/*');
    if (!file) return;
    setBusy(true);
    try {
      const dataUrl = await prepareImageFile(file, settings.cameraSharpness);
      setCover(dataUrl);

      if (settings.visionApiUrl.trim()) {
        try {
          setOcrProgress('正在交给多模态接口识别…');
          const result = await analyzeImage(dataUrl, settings);
          const text = [result.summary, ...result.keyPoints].join('\n');
          const matched = matchCourseByText(text, courseNames)?.course ?? courseName;
          openDialog({ ocr: text, cover: dataUrl, matched });
          showSnackbar({ message: `已用多模态接口识别，匹配到《${matched}》`, duration: 4000 });
          return;
        } catch (error) {
          showSnackbar({
            message: `识别失败：${error instanceof Error ? error.message : '未知错误'}。封面已保存，可以手填或粘贴文字。`,
            duration: 8000,
          });
        } finally {
          setOcrProgress('');
        }
      }

      // 没配接口（或接口失败）：仍然保存封面，让用户手填或粘贴
      openDialog({ cover: dataUrl, matched: courseName });
      if (!settings.visionApiUrl.trim()) {
        showSnackbar({
          message: '还没配置多模态接口：封面已保存，可在对话框里手填，或点「导入教程」看怎么配。',
          duration: 8000,
        });
      }
    } finally {
      setOcrProgress('');
      setBusy(false);
    }
  };

  const applyRecognizedText = () => {
    const matched = matchCourseByText(ocrText, courseNames)?.course;
    if (!matched) {
      showSnackbar({ message: '没有匹配到课程，可手动选择归属课程', duration: 4000 });
      return;
    }
    const library = textbooks[matched];
    setTarget(matched);
    // 匹配到课程后，用该课程的内置教材（或封面文字）自动填充书名与出版社
    setTitle(library?.title || longestLine(ocrText) || title);
    setPublisher(library?.publisher || guessPublisher(ocrText) || publisher);
    setEdition(library?.edition ?? edition);
    showSnackbar({ message: `已匹配到《${matched}》，书名与出版社已自动填充`, duration: 4000 });
  };

  const saveBook = () => {
    const finalTitle = title.trim() || '未命名教材';
    setTextbook(target, {
      course: target,
      title: finalTitle,
      publisher: publisher.trim(),
      edition: edition.trim() || undefined,
      cover: cover ?? undefined,
      source: ocrText ? 'recognized' : 'manual',
    });
    setDialogOpen(false);
    showSnackbar({ message: `已把《${finalTitle}》标记到《${target}》`, duration: 4000 });
  };

  return (
    <div className="col gap-8">
      <div className="row gap-8">
        <MdIcon name="menu_book" size={18} />
        <span className="md-title-small-emphasized flex-1">教材</span>
        {hasBook ? (
          <span className="md-label-small muted">
            {book?.source === 'library' ? '按封面识别 · 内置库' : book?.source === 'recognized' ? '封面识别' : '手动填写'}
            {book?.reference ? ' · 参考' : ''}
          </span>
        ) : null}
      </div>

      {hasBook ? (
        <div className="textbook-card">
          {book?.cover ? (
            <img className="textbook-cover" src={book.cover} alt={`${book.title} 封面`} />
          ) : (
            <div className="textbook-cover placeholder">
              <MdIcon name="menu_book" size={26} />
            </div>
          )}
          <div className="col flex-1" style={{ gap: 2 }}>
            <span className="md-title-small-emphasized">{book?.title}</span>
            <span className="md-body-small muted">
              {[book?.publisher, book?.edition, book?.series].filter(Boolean).join(' · ') || '未填写出版社'}
            </span>
          </div>
          {/* 作者要求：已有教材时**不留「添加」入口**，只在旁边放一颗圆形修改按钮，
              直径与课本封面容器等高（见 .textbook-edit 的 align-self:stretch + aspect-ratio:1）。
              移除动作移进「标记教材」对话框，避免再加第二颗圆钮。 */}
          <button type="button" className="textbook-edit" aria-label="修改教材" onClick={() => openDialog()}>
            <MdIcon name="edit" size={20} />
          </button>
        </div>
      ) : (
        <div className="md-body-small muted">尚未识别教材，可拍一张封面或手动填写。</div>
      )}

      {/* 「添加课程（选图识别 / 手动填写）」只在**还没有教材**时出现 */}
      {hasBook ? null : (
        <>
          {/* 三颗按钮在 366dp 的真机上排不下：原来第三颗「手动填写」会被右边缘裁掉
              （2026-09-29 真机截图实测）。这里允许换行 + 行间距，窄屏自动落到第二行。 */}
          <div className="button-group pill" style={{ justifyContent: 'flex-start', flexWrap: 'wrap', rowGap: 8 }}>
            <md-filled-tonal-button className="btn-s" onClick={() => void captureCover('camera')} disabled={busy ? '' : undefined}>
              <MdIcon slot="icon" name="photo_camera" />
              拍照识别封面
            </md-filled-tonal-button>
            <md-outlined-button className="btn-s" onClick={() => void captureCover('library')} disabled={busy ? '' : undefined}>
              <MdIcon slot="icon" name="photo_library" />
              从相册选图
            </md-outlined-button>
            <md-outlined-button className="btn-s" onClick={() => openDialog()}>
              <MdIcon slot="icon" name="edit_note" />
              手动填写
            </md-outlined-button>
          </div>
          {ocrProgress ? <div className="md-body-small muted mt-8">{ocrProgress}</div> : null}
        </>
      )}

      <md-dialog ref={dialogRef} className="app-dialog">
        <div slot="headline">标记教材</div>
        <div slot="content" className="md-body-medium">
          <div className="md-body-small muted mb-8">
            可粘贴/输入封面上的文字，应用会自动匹配到课表里的课程；也可以直接填写书名。
          </div>
          <MdTextField
            label="封面文字（可选）"
            value={ocrText}
            onValueChange={setOcrText}
            type="textarea"
            rows={3}
            onEnter={applyRecognizedText}
          />
          <div className="mt-8">
            <md-text-button onClick={applyRecognizedText}>按文字匹配课程</md-text-button>
          </div>
          <div className="mt-12">
            <MdTextField label="书名" value={title} onValueChange={setTitle} />
          </div>
          <div className="mt-12">
            <MdTextField label="出版社" value={publisher} onValueChange={setPublisher} />
          </div>
          <div className="mt-12">
            <MdTextField label="版次（可选）" value={edition} onValueChange={setEdition} />
          </div>
          <div className="mt-12">
            <label className="md-label-large" htmlFor="textbook-course">
              归属课程
            </label>
            <select
              id="textbook-course"
              className="textbook-select"
              value={target}
              onChange={(event) => setTarget(event.target.value)}
            >
              {courseNames.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>
          {cover ? (
            <div className="row gap-12 mt-12" style={{ alignItems: 'center' }}>
              <img className="textbook-cover" src={cover} alt="封面预览" />
              <span className="md-body-small muted flex-1">将随教材一起保存到本机</span>
            </div>
          ) : null}
        </div>
        <div slot="actions">
          {hasBook ? (
            <md-text-button
              onClick={() => {
                setDialogOpen(false);
                setTextbook(courseName, null);
                showSnackbar({ message: '已移除该课程的教材', duration: 3000 });
              }}
            >
              移除教材
            </md-text-button>
          ) : null}
          <md-text-button onClick={() => setDialogOpen(false)}>取消</md-text-button>
          <md-text-button onClick={saveBook}>保存并标记</md-text-button>
        </div>
      </md-dialog>
    </div>
  );
}

/* --------------------------------------------------------- map chooser ----- */

export function MapChooserDialog({
  open,
  address,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  address: string;
  onCancel: () => void;
  onConfirm: (providerId: string, remember: boolean) => void;
}) {
  const [selected, setSelected] = useState(MAP_PROVIDERS[0].id);
  const [remember, setRemember] = useState(false);
  /* 半屏弹层的展开动画需要一个"从哪儿长出来"的源矩形；这里没有具体来源元素，
     传一个空 ref 即可（内部会退化成从弹层自身位置展开）。 */
  const sourceRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (open) {
      setSelected(MAP_PROVIDERS[0].id);
      setRemember(false);
    }
  }, [open]);

  return (
    /* 「导航到 XX 地点」这套也走抖音式半遮蔽弹层：与课程详情同一套手感（贴底、半屏、可点遮罩关） */
    <ExpandableSheet
      open={open}
      onClose={onCancel}
      sourceRef={sourceRef}
      icon="place"
      title="导航到"
      variant="half"
      actions={
        <>
          <md-text-button onClick={onCancel}>取消</md-text-button>
          <span className="flex-1" />
          <md-filled-button onClick={() => onConfirm(selected, remember)}>打开地图</md-filled-button>
        </>
      }
    >
      <div className="col gap-8">
        <div className="muted">将为「{address}」启动导航</div>
        {MAP_PROVIDERS.map((provider) => (
          <div
            key={provider.id}
            className={`map-option${selected === provider.id ? ' selected' : ''}`}
            onClick={() => setSelected(provider.id)}
          >
            <MdIcon name={selected === provider.id ? 'radio_button_checked' : 'radio_button_unchecked'} />
            <div className="col flex-1">
              <span className="md-title-small-emphasized">{provider.label}</span>
              <span className="md-body-small">{provider.hint}</span>
            </div>
          </div>
        ))}
        <label className="row gap-8 mt-12" style={{ alignItems: 'center' }}>
          <input
            type="checkbox"
            checked={remember}
            onChange={(event) => setRemember(event.target.checked)}
            style={{ width: 18, height: 18, accentColor: 'var(--md-sys-color-primary)' }}
          />
          <span className="md-body-medium">记住选择（写入设置，之后不再询问）</span>
        </label>
      </div>
    </ExpandableSheet>
  );
}

/* ------------------------------------------------------ schedule import ---- */

export function ScheduleImportSheet({
  open,
  onClose,
  onImported,
  onOpenTutorial,
}: {
  open: boolean;
  onClose: () => void;
  onImported: (message: string) => void;
  /** 打开「导入教程」（含可复制的提示词）：本面板会先关掉自己，避免两层弹层叠着 */
  onOpenTutorial: () => void;
}) {
  const sourceRef = useRef<HTMLDivElement>(null);
  const { settings, updateSettings, setSchedule, schedule, scheduleImported, showSnackbar } = useAppState();
  const [pasted, setPasted] = useState('');
  const [busy, setBusy] = useState(false);
  const [termStart, setTermStart] = useState(settings.termStart || schedule.termStart);
  /** 本地缓存课表（快照）：导入时自动留档，可一键恢复 */
  const [snapshots, setSnapshots] = useState<ScheduleSnapshot[]>([]);
  /** 「没有读取到可用内容」的警告窗口（作者要求：这种事必须挡住视线，不能只飘一条 snackbar） */
  const [warning, setWarning] = useState<{ headline: string; detail: string } | null>(null);

  /** 一份课表里到底有几门课：0 门就等于「什么都没读到」，不能当导入成功 */
  const countCourses = (data: ScheduleData) =>
    data.periods.reduce((total, period) => total + period.days.reduce((sum, day) => sum + day.length, 0), 0);

  const refreshSnapshots = () => {
    void listSnapshots().then(setSnapshots);
  };

  useEffect(() => {
    if (open) refreshSnapshots();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (open) setTermStart(settings.termStart || schedule.termStart);
  }, [open, settings.termStart, schedule.termStart]);

  const importFile = async () => {
    // 不限制 accept：调起系统文件浏览器（Android 文件管理器 / iOS 文件 App / 桌面资源管理器）
    // 让用户自由选择，选完再按内容嗅探格式（RTF、HTML 表格、CSV/文本）
    const file = await pickFile('课表文件');
    if (!file) return;
    setBusy(true);
    try {
      const parsed = await parseScheduleFile(file);
      // 「解析器没报错」不等于「读到了课」：一份只有节次、没有课程的课表导入进来，
      // 主页会因为"没有课程就回落内置课表"继续显示旧表 —— 用户看到的就是"导入了但没变"。
      if (!countCourses(parsed)) throw new Error('里面没有解析到任何课程');
      // 本地缓存：留一份快照，之后可一键恢复（最多 3 份）
      await saveSnapshot(parsed, file.name);
      refreshSnapshots();
      setSchedule(parsed);
      onImported(`已导入 ${file.name}：${parsed.periods.length} 个节次`);
    } catch (error) {
      const reason = error instanceof Error ? error.message : '未知错误';
      showSnackbar({
        message: `“${file.name}”解析失败：${reason}。支持教务系统导出的 .doc/.rtf、另存为的 .html、.json（应用形状或扁平 courses[]），以及 .csv/.txt 文本。`,
        duration: 8000,
      });
      setWarning({ headline: '没有读取到可用的课表内容', detail: `“${file.name}”：${reason}` });
    } finally {
      setBusy(false);
    }
  };

  const importText = () => {
    if (!pasted.trim()) {
      showSnackbar({ message: '请先粘贴课表文本', duration: 4000 });
      return;
    }
    try {
      // 粘贴内容里带 <table> 就按 HTML 课表解析（与「选文件」那条路的判定一致）——
      // 以前粘贴路径只会走纯文本解析器，于是从网页里复制的表格一直报「没有解析到课表节次」。
      // JSON 同理：模型给的常常就是一段 JSON（```json 围栏 + 前后说明文字也算）。
      const parsed = /<table/i.test(pasted)
        ? parseHtmlSchedule(pasted)
        : looksLikeJson(pasted)
          ? parseScheduleJson(pasted)
          : parseTextSchedule(pasted);
      if (!countCourses(parsed)) throw new Error('里面没有解析到任何课程');
      setSchedule(parsed);
      setPasted('');
      onImported(`已从文本导入：${parsed.periods.length} 个节次`);
    } catch (error) {
      const reason = error instanceof Error ? error.message : '未知错误';
      showSnackbar({ message: `文本解析失败：${reason}`, duration: 6000 });
      setWarning({ headline: '没有读取到可用的课表内容', detail: `粘贴的内容：${reason}` });
    }
  };

  const stat = schedule.periods.reduce(
    (total, period) => total + period.days.reduce((sum, day) => sum + day.length, 0),
    0,
  );

  return (
    <ExpandableSheet open={open} onClose={onClose} sourceRef={sourceRef} icon="edit_calendar" title="课表数据">
      <div ref={sourceRef} />
      <div className="col gap-12">
        {/* 本地缓存课表：每次导入自动留档，可一键恢复（最多 3 份） */}
        {snapshots.length ? (
          <div className="schedule-cache">
            <div className="md-title-small-emphasized mb-4">本地缓存课表（最近 {snapshots.length} 份）</div>
            <div className="col gap-6">
              {snapshots.map((snap) => (
                <div className="row gap-8" key={snap.id} style={{ alignItems: 'center' }}>
                  <span className="md-body-small flex-1">
                    {snap.source} · {snap.courses} 门课 · {relativeTime(snap.at)}
                  </span>
                  <md-text-button
                    onClick={() => {
                      setSchedule(snap.schedule);
                      onImported(`已恢复《${snap.source}》`);
                      onClose();
                    }}
                  >
                    恢复
                  </md-text-button>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="md-body-medium muted">
          当前课表：{scheduleImported ? '已导入' : '内置（来自 学生课表.doc）'} · {schedule.owner || '未署名'} · {schedule.term} ·{' '}
          {schedule.periods.length} 节次 · {stat} 门课
        </div>

        <div className="button-group" style={{ justifyContent: 'flex-start' }}>
          <md-filled-tonal-button onClick={() => void importFile()} disabled={busy ? '' : undefined}>
            <MdIcon slot="icon" name="folder_open" />
            导入课表文件
          </md-filled-tonal-button>
          <md-outlined-button onClick={() => { setSchedule(null); onImported('已恢复内置课表'); }}>
            <MdIcon slot="icon" name="settings_backup_restore" />
            恢复内置
          </md-outlined-button>
        </div>
        <div className="md-body-small muted">
          点「导入课表文件」会调起系统自带的文件浏览器（Android 文件管理器 / iOS 文件 / 桌面资源管理器），
          文件类型不限，选中后按内容自动识别：{IMPORT_FILE_HINT}。导入结果保存在本机。
        </div>

        {/* 作者 2026-09-26 的要求：主路径是「本地导入 HTML / JSON 文件」，
            所以这里直接把「怎么用 AI 把课表照片变成文件」的教程挂在这一步旁边 */}
        <div className="import-guide">
          <div className="row gap-8" style={{ alignItems: 'center' }}>
            <MdIcon name="auto_awesome" size={18} />
            <span className="md-title-small-emphasized flex-1">没有现成的课表文件？让 AI 帮你转</span>
          </div>
          <div className="md-body-small muted mt-4">
            把课表截图交给 DeepSeek / Gemini / ChatGPT，附上教程里的提示词，让它输出
            <strong> HTML 或 JSON</strong>，存成 <code>.html</code> / <code>.json</code> 文件后用上面的按钮导入 ——
            这是最省事、也最不容易出错的一条路。
          </div>
          <div className="row gap-8 mt-8 wrap">
            <md-text-button
              className="import-guide-open"
              onClick={() => {
                onClose();
                onOpenTutorial();
              }}
            >
              <MdIcon slot="icon" name="menu_book" />
              看导入教程（含可复制的提示词）
            </md-text-button>
          </div>
        </div>

        <MdTextField
          label="粘贴课表文本"
          value={pasted}
          onValueChange={setPasted}
          type="textarea"
          rows={4}
          supportingText="首行为「节次/星期 星期一 …」，随后每个节次一行，制表符分隔各天；也可以直接粘一段 JSON 课表"
        />
        {/* 作者 2026-09-27 反馈：这颗按钮原来是个纯文字按钮，和下面的「学期开始日期」标题糊在一起，
            根本看不出是能点的动作。改成有底色、有图标的实心按钮，并和输入框/标题拉开距离。 */}
        <div className="paste-import-row">
          <md-filled-tonal-button onClick={importText}>
            <MdIcon slot="icon" name="send" />
            解析并导入文本
          </md-filled-tonal-button>
        </div>

        <div className="col gap-8">
          <div className="md-title-small-emphasized">学期开始日期（第 1 周周一）</div>
          <input
            type="date"
            value={termStart}
            onChange={(event) => setTermStart(event.target.value)}
            style={{
              height: 56,
              borderRadius: 16,
              border: '1px solid var(--md-sys-color-outline)',
              background: 'var(--md-sys-color-surface)',
              color: 'var(--md-sys-color-on-surface)',
              padding: '0 16px',
              fontFamily: 'var(--md-ref-typeface-brand)',
              fontSize: 16,
            }}
          />
          <div className="row gap-8">
            <md-filled-tonal-button
              className="btn-s"
              onClick={() => {
                updateSettings({ termStart }, { message: '已保存学期开始日期' });
              }}
            >
              保存日期
            </md-filled-tonal-button>
            <span className="md-body-small muted flex-1">用于计算当前教学周，进而过滤每周实际开设的课程。</span>
          </div>
        </div>
      </div>

      {/* 没读到可用内容时的警告窗口（作者要求：这种事不能只飘一条会自己消失的 snackbar） */}
      <AlertDialog
        open={Boolean(warning)}
        headline={warning?.headline ?? '没有读取到可用的课表内容'}
        onClose={() => setWarning(null)}
      >
        <div className="col gap-12">
          <span>{warning?.detail}</span>
          <span className="muted">
            当前课表没有被改动。可以试试：教务系统导出的 .doc/.rtf、网页另存的 .html 表格、.json
            （应用形状 {'{ "periods": [{ "days": [[…]] }] }'} 或扁平
            {' { "courses": [{ "name": …, "day": …, "period": … }] }'}），以及制表符分隔的 .csv/.txt；
            也可以直接把内容贴进下面的「粘贴课表文本」。
          </span>
        </div>
      </AlertDialog>
    </ExpandableSheet>
  );
}
