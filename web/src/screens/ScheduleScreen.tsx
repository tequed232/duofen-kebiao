/**
 * 课表 (schedule) - "多分课表"
 *
 * The schedule is embedded in the app (web/src/data/schedule.ts, generated from the
 * school's 学生课表.doc) and can be replaced by an imported file/pasted text.
 *
 * Layout: app bar (筛选 / 课表数据) → 月份与日期选择 + 周次 stepper → the 4x4 board
 * (上午/中午/下午/晚上 × 四天，左右翻页覆盖一周七天) → the selected day's timeline.
 * 向下滚动会把课表收起成一行摘要，腾出空间显示当天课程；再次点击即可展开。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { AppNavBar, SectionHeader, TopAppBar, useScrolled } from '../components/layout';
import { MdIcon, MdIconButton } from '../components/md';
import {
  CourseDetailSheet,
  DayTimeline,
  MapChooserDialog,
  MonthDateDialog,
  PagedWeekBoard,
  ScheduleImportSheet,
  highlightKeyFor,
} from '../components/schedule';
import { useAppState } from '../state/AppState';
import { useNav } from '../nav/navigation';
import {
  WEEKDAY_LONG,
  WEEKDAY_SHORT,
  addDays,
  activeWeekdays,
  coursesOfDay,
  formatAddress,
  formatMonthDay,
  formatMonthDayWeekday,
  openMapLink,
  mapProviderById,
  maxWeekOf,
  parseISODate,
  startOfWeek,
  termMonths,
  weekNumberFor,
  weekdayIndex,
  type ScheduleCourse,
  type ScheduleData,
  type SchedulePeriod,
} from '../lib/schedule';

interface CoursePayload {
  course: ScheduleCourse;
  period: SchedulePeriod;
  dayIndex: number;
}

/** Today when it has courses, otherwise the first weekday that has any. */
function initialSelection(schedule: ScheduleData, week: number, today: Date): Date {
  if (coursesOfDay(schedule, weekdayIndex(today), week).length) return today;
  const active = activeWeekdays(schedule);
  for (let offset = 0; offset < 7; offset += 1) {
    const candidate = addDays(startOfWeek(today), offset);
    if (active.includes(weekdayIndex(candidate)) && coursesOfDay(schedule, weekdayIndex(candidate), week).length) {
      return candidate;
    }
  }
  return today;
}

export default function ScheduleScreen() {
  const nav = useNav();
  const {
    schedule,
    settings,
    updateSettings,
    scheduleImported,
    scheduleHighlight,
    setScheduleHighlight,
    showSnackbar,
  } = useAppState();
  const termStart = settings.termStart || schedule.termStart;

  const today = useMemo(() => new Date(), []);
  const [selectedDate, setSelectedDate] = useState(() =>
    initialSelection(schedule, weekNumberFor(today, settings.termStart || schedule.termStart), today),
  );
  const [payload, setPayload] = useState<CoursePayload | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [mapChooser, setMapChooser] = useState<{ address: string; course: ScheduleCourse } | null>(null);
  const { ref: scrollRef, scrolled } = useScrolled<HTMLDivElement>();

  const week = weekNumberFor(selectedDate, termStart);
  const dayIndex = weekdayIndex(selectedDate);
  const months = useMemo(() => termMonths(schedule), [schedule]);

  /* 不再随滚动自动收起课表：让课表随页面一起滚动，消除来回抖动（作者反馈） */

  /* highlight coming back from the filter screen */
  useEffect(() => {
    if (!scheduleHighlight) return undefined;
    const remaining = scheduleHighlight.until - Date.now();
    if (remaining <= 0) {
      setScheduleHighlight(null);
      return undefined;
    }
    // jump to the week the course actually runs in, then to that weekday
    const target = scheduleHighlight.week
      ? addDays(addDays(startOfWeek(parseISODate(termStart)), (scheduleHighlight.week - 1) * 7), scheduleHighlight.dayIndex)
      : addDays(startOfWeek(selectedDate), scheduleHighlight.dayIndex);
    setSelectedDate(target);
    setCollapsed(false);
    const timer = window.setTimeout(() => setScheduleHighlight(null), remaining);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scheduleHighlight]);

  /* when the schedule changes, keep the selection on a day that has courses */
  useEffect(() => {
    const active = activeWeekdays(schedule);
    if (!active.length) return;
    if (!active.includes(weekdayIndex(selectedDate))) {
      setSelectedDate(addDays(startOfWeek(selectedDate), active[0]));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schedule]);

  const openCourse = (next: CoursePayload) => {
    setPayload(next);
    setDetailOpen(true);
  };

  const openNavigation = (room: string, course: ScheduleCourse) => {
    // 校名 + xx栋xx号：导航时给地图更完整的地址
    const address = formatAddress(room, settings.schoolName);
    const provider = mapProviderById(settings.mapProvider);
    if (provider) {
      const mode = openMapLink(provider, address);
      showSnackbar({
        message: mode === 'app' ? `正在唤起${provider.label}…` : `已在${provider.label}中搜索「${address}」`,
        duration: 4000,
      });
      return;
    }
    setMapChooser({ address, course });
  };

  const shiftWeek = (weeks: number) => {
    setSelectedDate((value) => addDays(value, weeks * 7));
    setCollapsed(false);
  };

  const goToday = () => {
    setSelectedDate(today);
    setCollapsed(false);
  };

  // 统一走导航模块的规范化实现（标签栈只有一种形态，避免详情页叠加导致的乱跳转）
  const selectTab = (tab: 'schedule' | 'search' | 'settings') => nav.selectTab(tab);

  const todayCount = coursesOfDay(schedule, weekdayIndex(today), weekNumberFor(today, termStart)).length;
  const monthLabel = `${selectedDate.getFullYear()}年${selectedDate.getMonth() + 1}月`;

  return (
    <>
      <div className="screen-inner">
        <TopAppBar
          title="多分课表"
          scrolled={scrolled}
          leading={<MdIconButton icon="search_check_2" label="筛选课程" onClick={() => nav.push('scheduleFilter', {}, 'slide')} />}
          actions={
            <>
              <MdIconButton className="appbar-textbooks" icon="menu_book" label="查看教材" onClick={() => nav.push('textbookList', {}, 'slide')} />
              <MdIconButton className="appbar-today" icon="today" label="回到今天" onClick={goToday} />
              <MdIconButton className="appbar-record" icon="photo_camera" label="语音与相机记录" onClick={() => nav.push('home', {}, 'slide')} />
              <MdIconButton className="appbar-import" icon="edit" label="课表数据与导入" onClick={() => setImportOpen(true)} />
            </>
          }
        />

        <div className="screen-content" ref={scrollRef} style={{ paddingLeft: 0, paddingRight: 0 }}>
          <div className="schedule-head">
            <div className="schedule-hero" aria-hidden="true" />
            <div className="schedule-meta md-body-small">
              <MdIcon name="calendar_month" size={16} />
              <span>
                {schedule.term} · 第 {week} 教学周 · 共 {maxWeekOf(schedule)} 周
              </span>
              <span className="flex-1" />
              <span>{scheduleImported ? '已导入课表' : '内置课表'}</span>
              <span>{schedule.owner}</span>
            </div>

            <div className="row gap-8 mt-8" style={{ flexWrap: 'wrap' }}>
              <button type="button" className="schedule-datebutton" onClick={() => setDateOpen(true)}>
                <MdIcon name="event" size={16} />
                {monthLabel} · {formatMonthDayWeekday(selectedDate)}
                <MdIcon name="expand_more" size={16} />
              </button>
              <span className="md-label-medium muted flex-1">
                {months.length ? `课表覆盖 ${months[0].label} – ${months[months.length - 1].label}` : ''}
              </span>
            </div>

            <div className="week-stepper">
              <MdIconButton icon="chevron_left" label="上一周" onClick={() => shiftWeek(-1)} />
              <span className="week-label md-title-small-emphasized">
                第 {week} 周 · {formatMonthDay(addDays(startOfWeek(selectedDate), 6))} 止
              </span>
              <MdIconButton icon="chevron_right" label="下一周" onClick={() => shiftWeek(1)} />
            </div>
          </div>

          <PagedWeekBoard
            schedule={schedule}
            week={week}
            anchorDate={selectedDate}
            selectedDate={selectedDate}
            highlightKey={scheduleHighlight?.key ?? null}
            collapsed={collapsed}
            onToggleCollapse={() => setCollapsed((value) => !value)}
            onSelectDay={(date) => {
              setSelectedDate(date);
              setCollapsed(false);
            }}
            onOpenCourse={openCourse}
          />

          <div className="md-body-small muted" style={{ padding: '8px 16px 0' }}>
            左右滑动课表翻页（一周七天）· 向下滚动收起课表 · 今天 {WEEKDAY_SHORT[weekdayIndex(today)]} 共 {todayCount} 门课
          </div>

          <div style={{ padding: '12px 16px 0' }}>
            <SectionHeader
              icon="event_note"
              title={`${WEEKDAY_LONG[dayIndex]} · ${formatMonthDay(selectedDate)}`}
              trailing={
                <span className="md-label-medium muted">
                  第 {week} 周 · {coursesOfDay(schedule, dayIndex, week).length} 门课
                </span>
              }
            />
          </div>

          <div style={{ padding: '0 16px 24px' }}>
            <DayTimeline
              schedule={schedule}
              date={selectedDate}
              week={week}
              highlightKey={scheduleHighlight?.key ?? null}
              onOpenCourse={openCourse}
              onNavigate={openNavigation}
            />
          </div>
        </div>

        <AppNavBar active="schedule" onSelect={selectTab} />
      </div>

      <CourseDetailSheet
        open={detailOpen}
        payload={payload}
        onClose={() => setDetailOpen(false)}
        onNavigate={(address, course) => {
          setDetailOpen(false);
          openNavigation(address, course);
        }}
      />

      <ScheduleImportSheet
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={(message) => {
          setImportOpen(false);
          showSnackbar({ message });
        }}
      />

      <MonthDateDialog
        open={dateOpen}
        schedule={schedule}
        value={selectedDate}
        onCancel={() => setDateOpen(false)}
        onPick={(date) => {
          setSelectedDate(date);
          setCollapsed(false);
          setDateOpen(false);
          showSnackbar({ message: `已定位到 ${formatMonthDayWeekday(date)}（第 ${weekNumberFor(date, termStart)} 周）` });
        }}
      />

      <MapChooserDialog
        open={Boolean(mapChooser)}
        address={mapChooser?.address ?? ''}
        onCancel={() => setMapChooser(null)}
        onConfirm={(providerId, remember) => {
          const provider = mapProviderById(providerId);
          const address = mapChooser?.address ?? '';
          if (remember) {
            updateSettings({ mapProvider: providerId }, { message: `已把${provider?.label ?? '地图'}设为默认` });
          }
          setMapChooser(null);
          if (provider && address) {
            const mode = openMapLink(provider, address);
            showSnackbar({
              message: mode === 'app' ? `正在唤起${provider.label}…` : `已在${provider.label}中搜索「${address}」`,
              duration: 4000,
            });
          }
        }}
      />
    </>
  );
}
