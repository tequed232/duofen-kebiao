/**
 * 筛选 (schedule filter)
 *
 * Tabs: 老师 / 课程 / 地点 / 时间. Search across the embedded schedule, list the hits
 * as 课程 · 老师 · 地点 rows, and jump back to the schedule screen highlighting the
 * chosen course for a few seconds (per the design note). The 地点 tab shows the map
 * panel that hands the address over to the default map app.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { SectionHeader, TopAppBar } from '../components/layout';
import { MdIcon, MdIconButton, MdMenu, MdSwitch, MdTextField, type MenuAction } from '../components/md';
import { ExpandableSheet } from '../components/overlays';
import { MapChooserDialog, highlightKeyFor } from '../components/schedule';
import { useAppState } from '../state/AppState';
import { useNav } from '../nav/navigation';
import {
  WEEKDAY_LONG,
  formatAddress,
  mapProviderById,
  openMapLink,
  parseISODate,
  searchSchedule,
  targetWeekFor,
  toISODate,
  weekNumberFor,
  weekdayIndex,
  type SearchField,
  type SearchHit,
} from '../lib/schedule';

const TABS = ['老师', '课程', '地点', '时间'] as const;
const FIELDS: SearchField[] = ['teacher', 'course', 'place', 'course'];

export default function ScheduleFilterScreen() {
  const nav = useNav();
  const { schedule, settings, updateSettings, setScheduleHighlight, showSnackbar } = useAppState();

  /** 老师 / 课程 / 地点 / 时间四个条件合并在一个面板里 */
  const [teacher, setTeacher] = useState('');
  const [courseQuery, setCourseQuery] = useState('');
  const [place, setPlace] = useState('');
  const [timeEnabled, setTimeEnabled] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  /** ExpandableSheet 需要源元素做展开动画 */
  const filterButtonRef = useRef<HTMLButtonElement>(null);
  const [date, setDate] = useState(() => toISODate(new Date()));
  const [selected, setSelected] = useState<SearchHit | null>(null);
  const [mapChooser, setMapChooser] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);

  const hitKey = (hit: SearchHit) => `${hit.course.name}|${hit.dayIndex}|${hit.period.period}`;

  const activeCount = [teacher, courseQuery, place, timeEnabled ? 'time' : ''].filter(Boolean).length;

  const hits = useMemo(() => {
    const lists: SearchHit[][] = [];
    if (teacher.trim()) lists.push(searchSchedule(schedule, teacher, 'teacher'));
    if (courseQuery.trim()) lists.push(searchSchedule(schedule, courseQuery, 'course'));
    if (place.trim()) lists.push(searchSchedule(schedule, place, 'place'));
    let base = lists.length ? lists[0] : searchSchedule(schedule, '', 'course');
    for (const list of lists.slice(1)) {
      const keys = new Set(list.map(hitKey));
      base = base.filter((hit) => keys.has(hitKey(hit)));
    }
    if (timeEnabled) {
      const index = weekdayIndex(parseISODate(date));
      base = base.filter((hit) => hit.dayIndex === index);
    }
    return base;
  }, [schedule, teacher, courseQuery, place, timeEnabled, date]);

  const filterSummary = [
    teacher.trim() ? `老师 ${teacher.trim()}` : '',
    courseQuery.trim() ? `课程 ${courseQuery.trim()}` : '',
    place.trim() ? `地点 ${place.trim()}` : '',
    timeEnabled ? `时间 ${date} ${WEEKDAY_LONG[weekdayIndex(parseISODate(date))]}` : '',
  ]
    .filter(Boolean)
    .join(' · ');

  const clearFilters = () => {
    setTeacher('');
    setCourseQuery('');
    setPlace('');
    setTimeEnabled(false);
  };

  const openHit = (hit: SearchHit) => {
    const termStart = settings.termStart || schedule.termStart;
    const currentWeek = weekNumberFor(new Date(), termStart);
    const week = targetWeekFor(hit.course, currentWeek);
    setScheduleHighlight({
      key: highlightKeyFor(hit.course, hit.dayIndex),
      dayIndex: hit.dayIndex,
      week,
      until: Date.now() + 5000,
    });
    if (week && week !== currentWeek) {
      showSnackbar({ message: `${hit.course.name} 在第 ${week} 周开课，已切换到该周`, duration: 5000 });
    }
    nav.popTo('schedule');
  };

  const openMap = (address: string) => {
    if (!address) {
      showSnackbar({ message: '该课程没有填写地点', duration: 4000 });
      return;
    }
    setMapChooser(address);
  };

  const menuActions: MenuAction[] = [
    {
      label: '清空筛选条件',
      icon: 'filter_list_off',
      onSelect: () => {
        clearFilters();
        setMenuOpen(false);
      },
    },
    {
      label: '回到今天',
      icon: 'today',
      onSelect: () => {
        setDate(toISODate(new Date()));
        setMenuOpen(false);
      },
    },
  ];

  return (
    <>
      <div className="screen-inner">
        <TopAppBar
          title="筛选"
          onBack={() => nav.pop()}
          backLabel="返回课表"
          actions={
            <MdIconButton
              icon="more_vert"
              label="更多操作"
              onClick={(event) => {
                setMenuAnchor(event.currentTarget);
                setMenuOpen(true);
              }}
            />
          }
        />

        <div className="screen-content">
          {/* 把原来的分类标签 + 搜索栏合并成一个按钮，点开后在同一个面板里填老师/课程/地点/时间 */}
          <button type="button" className="filter-button" ref={filterButtonRef} onClick={() => setSheetOpen(true)}>
            <MdIcon name="filter_list" size={22} />
            <span className="col flex-1" style={{ gap: 2, textAlign: 'left' }}>
              <span className="md-title-small-emphasized">筛选条件</span>
              <span className="md-body-small muted">{filterSummary || '老师 / 课程 / 地点 / 时间 一起设置'}</span>
            </span>
            {activeCount ? <span className="chip md-label-large">{activeCount}</span> : null}
            <MdIcon name="chevron_right" size={22} />
          </button>

          {selected && selected.course.room ? (
            <div className="mt-12">
              <div className="map-preview">
                <div className="row gap-8">
                  <MdIcon name="map" size={20} />
                  <span className="md-title-small-emphasized flex-1">{selected.course.room}</span>
                </div>
                <div className="md-body-small">
                  地图面板仅用于把所选地点交给第三方地图应用继续筛选地址，不内嵌地图数据。
                </div>
                <div>
                  <md-filled-tonal-button onClick={() => openMap(selected.course.room)}>
                    <MdIcon slot="icon" name="navigation" />
                    打开地图导航
                  </md-filled-tonal-button>
                </div>
              </div>
            </div>
          ) : null}

          <div className="mt-16">
            <SectionHeader
              icon="list_alt"
              title={`结果 ${hits.length} 条`}
              trailing={
                activeCount ? (
                  <md-text-button onClick={clearFilters}>清空</md-text-button>
                ) : (
                  <span className="md-label-medium muted">全部</span>
                )
              }
            />
            {hits.length ? (
              <>
                <div className="filter-head md-label-medium">
                  <span>课程</span>
                  <span>老师</span>
                  <span>地点</span>
                </div>
                {hits.map((hit) => (
                  <div
                    className="filter-row"
                    key={`${hit.course.name}-${hit.course.teacher}-${hit.course.room}-${hit.dayIndex}-${hit.period}`}
                    onClick={() => {
                      setSelected(hit);
                      openHit(hit);
                    }}
                  >
                    <div className="col">
                      <span className="col-name md-body-medium">{hit.course.name}</span>
                      <span className="md-label-small muted">
                        {WEEKDAY_LONG[hit.dayIndex]} · {hit.period}
                      </span>
                    </div>
                    <span className="md-body-small">{hit.course.teacher || '—'}</span>
                    <span className="md-body-small">{hit.course.room || '—'}</span>
                  </div>
                ))}
              </>
            ) : (
              <div className="empty-state" style={{ padding: '24px 8px' }}>
                <div className="empty-icon">
                  <MdIcon name="search_off" size={32} />
                </div>
                <div className="md-title-small" style={{ color: 'var(--md-sys-color-on-surface)' }}>
                  没有匹配的课程
                </div>
                <div className="md-body-small">换一个关键词，或切到「时间」按日期查看。</div>
              </div>
            )}
          </div>

          <div className="md-body-small muted mt-16">
            点击任意结果会回到课表并高亮该课程 5 秒。
          </div>
        </div>

        {/* 搜索页也保留底边控制栏（v2 三项：首页 / 搜索 / 设置） */}
      </div>

      <MdMenu anchor={menuAnchor} open={menuOpen} actions={menuActions} onClose={() => setMenuOpen(false)} />

      {/* 老师 / 课程 / 地点 / 时间：一个面板全部搞定 */}
      <ExpandableSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        sourceRef={filterButtonRef}
        icon="filter_list"
        title="筛选条件"
        headerActions={
          <>
            <md-text-button onClick={clearFilters}>清空</md-text-button>
            <md-filled-tonal-button onClick={() => setSheetOpen(false)}>查看结果</md-filled-tonal-button>
          </>
        }
      >
        <div className="col gap-16">
          <div>
            <SectionHeader icon="person" title="老师" />
            <MdTextField label="教师姓名" value={teacher} onValueChange={setTeacher} placeholder="例如 韩堃" />
          </div>
          <div>
            <SectionHeader icon="menu_book" title="课程" />
            <MdTextField label="课程名称" value={courseQuery} onValueChange={setCourseQuery} placeholder="例如 智慧财经素养" />
          </div>
          <div>
            <SectionHeader icon="place" title="地点" />
            <MdTextField label="上课地点" value={place} onValueChange={setPlace} placeholder="例如 16-203 / 教学楼" />
          </div>
          <div>
            <SectionHeader icon="event" title="时间" />
            <div className="row gap-12" style={{ alignItems: 'center' }}>
              <MdSwitch selected={timeEnabled} onSelectedChange={setTimeEnabled} ariaLabel="按日期筛选开关" />
              <span className="md-body-medium flex-1">只看某一天</span>
            </div>
            {timeEnabled ? (
              <div className="col gap-8 mt-8">
                <input
                  type="date"
                  value={date}
                  onChange={(event) => setDate(event.target.value)}
                  className="filter-date"
                />
                <div className="md-body-small muted">
                  {date} 是{WEEKDAY_LONG[weekdayIndex(parseISODate(date))]}
                </div>
              </div>
            ) : null}
          </div>
          <div className="md-body-small muted">
            四个条件会同时生效（交集）；结果里点课程可以跳回课表对应周次，点地点可以打开地图。
          </div>
        </div>
      </ExpandableSheet>

      <MapChooserDialog
        open={Boolean(mapChooser)}
        address={mapChooser ?? ''}
        onCancel={() => setMapChooser(null)}
        onConfirm={(providerId, remember) => {
          const address = mapChooser ?? '';
          if (remember) updateSettings({ mapProvider: providerId }, { message: '已保存默认地图' });
          setMapChooser(null);
          const provider = mapProviderById(providerId);
          if (provider && address) {
            const full = formatAddress(address, settings.schoolName);
            const mode = openMapLink(provider, full);
            showSnackbar({
              message: mode === 'app' ? `正在唤起${provider.label}…` : `已在${provider.label}中搜索「${full}」`,
              duration: 4000,
            });
          }
        }}
      />
    </>
  );
}
