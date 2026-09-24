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
import { SectionHeader, TopAppBar, useScrolled } from '../components/layout';
import { MdDialog, MdIcon, MdIconButton } from '../components/md';
import { ConfirmDialog } from '../components/overlays';
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
  haptic,
  hasNativeCalendar,
  nativeCalendarImport,
  nativeCalendarRemoveAll,
  nativeCalendarStatus,
  nativeRequestCalendarPermission,
  type NativeCalendarStatus,
} from '../lib/native';
import { LENS_PLAYER } from '../lib/lens';
import { useLens } from '../lib/useLens';
import {
  CALENDAR_MARKER,
  buildCalendarEvents,
  calendarScope,
  eventsToIcs,
  icsFileName,
  type CalendarEventDraft,
} from '../lib/calendarExport';
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
  nearestCourse,
  type NearestCourse,
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

/** 网页版（没有原生桥）的等价实现：下载 .ics，用户双击即可导入系统日历 */
function downloadIcs(name: string, text: string): void {
  const blob = new Blob([text], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** 「修改范围」提示框里的日期：2026年1月5日 */
const formatDay = (date: Date) => `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;

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
  /**
   * 「导航课程」弹层。三态：
   *   undefined = 没打开；null = 打开了但**一周内没有可导航的课**；对象 = 目标那节课。
   * 之所以把"没找到"也做成被打开的状态：不能点了没反应 —— 得告诉作者为什么没得导航。
   */
  const [navTarget, setNavTarget] = useState<NearestCourse | null | undefined>(undefined);
  /* 系统日历：两条按钮（添加到系统日历 / 清除本 App 的日程）各配一个「修改范围」提示框 */
  const [calendarDialog, setCalendarDialog] = useState<'add' | 'remove' | null>(null);
  const [calendarInfo, setCalendarInfo] = useState<NativeCalendarStatus>({ permission: 'unknown', count: 0, calendar: '' });
  const [calendarBusy, setCalendarBusy] = useState(false);
  const { ref: scrollRef, scrolled } = useScrolled<HTMLDivElement>();
  /* 顶部两个小组件也用液态玻璃透镜（参数与底栏同一套） */
  const dateLensRef = useRef<HTMLButtonElement>(null);
  const weekLensRef = useRef<HTMLDivElement>(null);
  useLens(dateLensRef, LENS_PLAYER);
  useLens(weekLensRef, LENS_PLAYER);

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
    haptic('select'); // 点击课表里的课程：确认触感
    setPayload(next);
    setDetailOpen(true);
  };

  /**
   * 「导航课程」：先算**时间上离现在最近的那节课**，再弹层把"最近"的算法与目的地讲清楚。
   * 用 `new Date()` 作为参考时刻（不用 selectedDate）：这个按钮的语义是"现在去哪"，
   * 与当前翻到哪一天无关。
   */
  const openNavCourse = () => {
    haptic('select');
    setNavTarget(nearestCourse(schedule, new Date(), termStart) ?? null);
  };

  const openNavigation = (room: string, course: ScheduleCourse) => {    // 校名 + xx栋xx号：导航时给地图更完整的地址
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
    haptic('tick'); // 周数步进：轻刻度
    setSelectedDate((value) => addDays(value, weeks * 7));
    setCollapsed(false);
  };

  const goToday = () => {
    haptic('heavy'); // 一锤定音的操作：用最重的一档
    setSelectedDate(today);
    setCollapsed(false);
  };

  // 统一走导航模块的规范化实现（标签栈只有一种形态，避免详情页叠加导致的乱跳转）
  const selectTab = (tab: 'schedule' | 'search' | 'settings') => nav.selectTab(tab);

  const todayCount = coursesOfDay(schedule, weekdayIndex(today), weekNumberFor(today, termStart)).length;
  const monthLabel = `${selectedDate.getFullYear()}年${selectedDate.getMonth() + 1}月`;

  /* -------------------------------------- 课表 → 系统日历（两个按钮 + 范围提示） -- */
  const calendarEvents = useMemo(() => buildCalendarEvents(schedule, { termStart }), [schedule, termStart]);
  const calendarRange = useMemo(() => calendarScope(calendarEvents), [calendarEvents]);
  /** APK 里才有原生日历桥；网页版退化成下载 .ics */
  const nativeCalendar = hasNativeCalendar();

  const openCalendarDialog = (mode: 'add' | 'remove') => {
    haptic('select');
    setCalendarInfo(nativeCalendar ? nativeCalendarStatus() : { permission: 'unknown', count: 0, calendar: '' });
    setCalendarDialog(mode);
  };

  const runCalendarImport = () => {
    setCalendarBusy(true);
    const payload = calendarEvents.map(({ title, location, description, start, end, repeat }) => ({
      title,
      location,
      description,
      start,
      end,
      repeat,
    }));
    const result = nativeCalendarImport(JSON.stringify(payload));
    setCalendarBusy(false);
    setCalendarDialog(null);
    setCalendarInfo(nativeCalendarStatus());
    showSnackbar({
      message: result.ok
        ? `已向系统日历写入 ${result.count} 条日程（每条都带「${CALENDAR_MARKER}」标记）`
        : `写入失败：${result.error ?? '未知原因'}`,
      duration: 5000,
    });
  };

  const confirmCalendarAdd = () => {
    if (!nativeCalendar) {
      const name = icsFileName(schedule);
      downloadIcs(name, eventsToIcs(calendarEvents, { calendarName: `${schedule.term} 课表` }));
      setCalendarDialog(null);
      showSnackbar({ message: `已下载 ${name}：双击它即可导入系统日历`, duration: 5000 });
      return;
    }
    if (calendarInfo.permission === 'granted') {
      runCalendarImport();
      return;
    }
    /* 作者要求：先申请「日程项修改」权限，拿到之后再写日历 */
    setCalendarBusy(true);
    const started = nativeRequestCalendarPermission((granted) => {
      setCalendarBusy(false);
      if (granted) {
        setCalendarInfo(nativeCalendarStatus());
        runCalendarImport();
        return;
      }
      setCalendarDialog(null);
      showSnackbar({
        message: '没有日历权限，写不进去。可在系统设置 → 应用 → 多分课表 → 权限里打开「日历」后重试',
        duration: 6000,
      });
    });
    if (!started) {
      setCalendarBusy(false);
      setCalendarDialog(null);
      showSnackbar({ message: '当前环境不支持写入系统日历' });
    }
  };

  const confirmCalendarRemove = () => {
    if (!nativeCalendar) {
      setCalendarDialog(null);
      showSnackbar({
        message: `网页版没有系统日历接口：请到手机日历里搜索「${CALENDAR_MARKER}」手动删除`,
        duration: 6000,
      });
      return;
    }
    setCalendarBusy(true);
    const result = nativeCalendarRemoveAll();
    setCalendarBusy(false);
    setCalendarDialog(null);
    setCalendarInfo(nativeCalendarStatus());
    showSnackbar({
      message: result.ok ? `已清除 ${result.count} 条由本 App 写入的日程` : `清除失败：${result.error ?? '未知原因'}`,
      duration: 5000,
    });
  };

  return (
    <>
      <div className="screen-inner">
        <TopAppBar
          title="多分课表"
          scrolled={scrolled}
          leading={<MdIconButton icon="search_check_2" label="筛选课程" onClick={() => { haptic('select'); nav.push('scheduleFilter', {}, 'slide'); }} />}
          actions={
            <>
              <MdIconButton className="appbar-textbooks" icon="menu_book" label="查看教材" onClick={() => { haptic('select'); nav.push('textbookList', {}, 'slide'); }} />
              <MdIconButton className="appbar-import" icon="edit" label="课表数据与导入" onClick={() => { haptic('select'); setImportOpen(true); }} />
            </>
          }
        />

        <div className="screen-content" ref={scrollRef} style={{ paddingLeft: 0, paddingRight: 0 }}>
          <div className="schedule-head">
            <div className="schedule-meta md-body-small">
              <MdIcon name="calendar_month" size={16} />
              <span>
                {schedule.term} · 第 {week} 教学周 · 共 {maxWeekOf(schedule)} 周
              </span>
              <span className="flex-1" />
              <span>{scheduleImported ? '已导入课表' : '内置课表'}</span>
            </div>

            {/* 系统日历：大按钮 = 一键写入日程，小按钮 = 一键清除本 App 写的日程 */}
            <div className="schedule-calendar-row">
              <md-filled-button className="btn-s" onClick={() => openCalendarDialog('add')}>
                <MdIcon slot="icon" name="event_available" />
                添加到系统日程
              </md-filled-button>
              <MdIconButton
                className="schedule-calendar-clear"
                icon="event_busy"
                label="清除本 App 写入的日程"
                onClick={() => openCalendarDialog('remove')}
              />
              <span className="flex-1" />
              <span className="md-label-small muted schedule-owner">{schedule.owner}</span>
            </div>

            <div className="row gap-8 mt-8" style={{ flexWrap: 'wrap' }}>
              <button type="button" className="schedule-datebutton liquid-glass" ref={dateLensRef} onClick={() => setDateOpen(true)}>
                <MdIcon name="event" size={16} />
                {monthLabel} · {formatMonthDayWeekday(selectedDate)}
                <MdIcon name="expand_more" size={16} />
              </button>
              <span className="md-label-medium muted flex-1">
                {months.length ? `课表覆盖 ${months[0].label} – ${months[months.length - 1].label}` : ''}
              </span>
            </div>

            <div className="week-stepper liquid-glass" ref={weekLensRef}>
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
            onToggleCollapse={() => {
              haptic('tick'); // 收起 / 展开课表
              setCollapsed((value) => !value);
            }}
            onSelectDay={(date) => {
              haptic('tick'); // 滑动找日期：每换一天一次轻刻度
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

          {/* 当天课程区：底部要同时让开「回到今天」FAB 与底栏，
              只有一节课时也能完整显示（见 .schedule-day-list） */}
          <div className="schedule-day-list">
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
      </div>

      {/* 右下角两个常驻按钮（对称并排）：左边「导航课程」= 去时间上离现在最近的那节课，
          右边「回到今天」= 回到今天。单手拇指都够得到。 */}
      <div className="schedule-fab-row">
        <md-fab className="schedule-nav-fab" variant="tonal" label="导航课程" onClick={openNavCourse}>
          <MdIcon slot="icon" name="near_me" />
        </md-fab>
        <md-fab className="schedule-today-fab" variant="primary" label="回到今天" onClick={goToday}>
          <MdIcon slot="icon" name="today" />
        </md-fab>
      </div>

      {/* 导航课程说明 + 确认：先把「最近」是怎么算的说清楚，再给出这一节的具体信息 */}
      <MdDialog
        open={navTarget !== undefined}
        headline="导航课程"
        onClosed={() => setNavTarget(undefined)}
        actions={
          <>
            <md-text-button onClick={() => setNavTarget(undefined)}>取消</md-text-button>
            <md-filled-button
              onClick={() => {
                const target = navTarget;
                setNavTarget(undefined);
                if (target) openNavigation(target.course.room, target.course);
              }}
            >
              导航至 {navTarget?.course.room || '上课地点'}
            </md-filled-button>
          </>
        }
      >
        {navTarget === null ? (
          <>
            依据当前课表，<strong>接下来一周都没有可导航的课</strong>了。
            先把课表导入或翻到有课的那一周，再来点这里。
          </>
        ) : navTarget ? (
          <>
            带你去<strong>时间上离现在最近的那节课</strong>：正在上的那一节优先，否则是今天最早还没开始的一节；
            今天没有了就顺延到接下来一周里的第一节。
            <div className="col gap-4 mt-12">
              <span className="md-title-small-emphasized">{navTarget.course.name}</span>
              <span className="md-body-medium">
                {navTarget.dayOffset === 0 ? '今天' : `${WEEKDAY_SHORT[weekdayIndex(navTarget.date)]}`} · {navTarget.period} · {navTarget.time}
                {navTarget.inSession ? ' · 正在进行' : navTarget.minutesUntil > 0 && navTarget.dayOffset === 0 ? ` · ${navTarget.minutesUntil} 分钟后开始` : ''}
              </span>
              <span className="md-body-medium">
                地点：{navTarget.course.room || '课表里没写教室'}
                {settings.schoolName ? `（${settings.schoolName}）` : ''}
              </span>
              <span className="md-body-small muted">
                导航时会用「教室 + 学校名称」拼成完整地址；学校名称与默认地图都在 设置 → 导航与学校 里改。
              </span>
            </div>
          </>
        ) : null}
      </MdDialog>

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

      {/* 「修改范围」提示框：动手之前先把会发生什么写清楚（作者要求） */}
      <ConfirmDialog
        open={calendarDialog === 'add'}
        destructive={false}
        headline="添加到系统日历"
        confirmLabel={calendarBusy ? '处理中…' : nativeCalendar ? '确认添加' : '下载 .ics'}
        onCancel={() => setCalendarDialog(null)}
        onConfirm={confirmCalendarAdd}
        body={
          <div className="calendar-scope">
            <p className="calendar-scope-lead">
              将向系统日历写入 <b>{calendarRange.count}</b> 条日程（{calendarRange.courses} 门课）
            </p>
            <ul className="calendar-scope-list">
              <li>
                覆盖日期：
                {calendarRange.first ? formatDay(calendarRange.first) : '—'} –{' '}
                {calendarRange.last ? formatDay(calendarRange.last) : '—'}
              </li>
              <li>标题为课程名、地点写教室，正文含节次 / 时间 / 老师 / 班级</li>
              <li>
                每条都带「{CALENDAR_MARKER}」标记 —— 以后可用旁边的按钮一键清除
              </li>
              {nativeCalendar ? (
                <li>
                  写入目标：{calendarInfo.calendar || '系统默认日历'}
                  {calendarInfo.permission === 'granted' ? '（已授权）' : '（首次会先申请日历权限）'}
                </li>
              ) : (
                <li>网页版没有原生日历接口，将改为下载 .ics 文件，双击它即可导入</li>
              )}
            </ul>
            <p className="calendar-scope-note">只往系统日历里加日程：不改课表本身，也不动你已有的其它日程。</p>
          </div>
        }
      />

      <ConfirmDialog
        open={calendarDialog === 'remove'}
        headline="清除本 App 的日程"
        confirmLabel={calendarBusy ? '处理中…' : nativeCalendar ? '确认清除' : '知道了'}
        onCancel={() => setCalendarDialog(null)}
        onConfirm={confirmCalendarRemove}
        body={
          <div className="calendar-scope">
            {nativeCalendar ? (
              <p className="calendar-scope-lead">
                将从系统日历删除 <b>{calendarInfo.count}</b> 条由「多分课表」写入的日程
              </p>
            ) : (
              <p className="calendar-scope-lead">网页版无法直接操作系统日历</p>
            )}
            <ul className="calendar-scope-list">
              <li>
                只删带「{CALENDAR_MARKER}」标记的那些，你手动添加的日程不受影响
              </li>
              <li>删除不可撤销；需要的话可以再点一次「添加到系统日程」重新写入</li>
            </ul>
          </div>
        }
      />
    </>
  );
}
