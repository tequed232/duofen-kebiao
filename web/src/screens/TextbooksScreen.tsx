/**
 * 教材窗口：查看所有已导入 / 已识别的教材。
 *
 * 数据来源：内置教材库（由 12 张封面整理）+ 用户在课程详情里识别或手动填写的覆盖项。
 * 每一项显示封面缩略图、书名、出版社 / 版次 / 系列与归属课程，点「查看课程」跳回课表并高亮该课程。
 */
import { useMemo, useState } from 'react';
import { AppNavBar, SectionHeader, TopAppBar } from '../components/layout';
import { MdIcon, MdIconButton, MdTextField } from '../components/md';
import { useAppState } from '../state/AppState';
import { useNav } from '../nav/navigation';
import { highlightKeyFor } from '../components/schedule';
import { targetWeekFor, weekNumberFor } from '../lib/schedule';

export default function TextbooksScreen() {
  const nav = useNav();
  const { schedule, textbooks, setScheduleHighlight, settings, showSnackbar } = useAppState();
  const [query, setQuery] = useState('');

  /** 课程名 → 该课程在课表里的第一次出现（用于跳转高亮） */
  const courseIndex = useMemo(() => {
    const map = new Map<string, { dayIndex: number }>();
    schedule.periods.forEach((period) => {
      period.days.forEach((courses, dayIndex) => {
        courses.forEach((course) => {
          if (!map.has(course.name)) map.set(course.name, { dayIndex });
        });
      });
    });
    return map;
  }, [schedule]);

  const entries = useMemo(() => {
    const list = Object.values(textbooks)
      .filter((book) => book.title)
      .map((book) => ({ ...book, inSchedule: courseIndex.has(book.course) }));
    const keyword = query.trim();
    const filtered = keyword
      ? list.filter(
          (book) =>
            book.title.includes(keyword) ||
            book.course.includes(keyword) ||
            (book.publisher ?? '').includes(keyword),
        )
      : list;
    return filtered.sort((a, b) => a.course.localeCompare(b.course, 'zh-Hans-CN'));
  }, [textbooks, query, courseIndex]);

  const openCourse = (courseName: string) => {
    const hit = courseIndex.get(courseName);
    if (!hit) {
      showSnackbar({ message: `课表里没有《${courseName}》，可能已换课表`, duration: 4000 });
      return;
    }
    const termStart = settings.termStart || schedule.termStart;
    const currentWeek = weekNumberFor(new Date(), termStart);
    const week = targetWeekFor({ name: courseName, weeks: '' } as never, currentWeek);
    setScheduleHighlight({
      key: highlightKeyFor({ name: courseName, weeks: '' } as never, hit.dayIndex),
      dayIndex: hit.dayIndex,
      week,
      until: Date.now() + 6000,
    });
    nav.popTo('schedule');
  };

  return (
    <div className="screen-inner">
      <TopAppBar title="教材" onBack={() => nav.pop()} backLabel="返回课表" />

      <div className="screen-content">
        <SectionHeader icon="menu_book" title={`已导入教材 ${entries.length} 本`} />
        <div className="mb-12">
          <MdTextField
            label="搜索教材 / 课程 / 出版社"
            value={query}
            onValueChange={setQuery}
            leadingIcon={<MdIcon name="search" />}
          />
        </div>

        {entries.length ? (
          <div className="col gap-8">
            {entries.map((book) => (
              <div className="textbook-card" key={`${book.course}-${book.title}`}>
                {book.cover ? (
                  <img className="textbook-cover" src={book.cover} alt={`${book.title} 封面`} />
                ) : (
                  <div className="textbook-cover placeholder">
                    <MdIcon name="menu_book" size={24} />
                  </div>
                )}
                <div className="col flex-1" style={{ gap: 2 }}>
                  <span className="md-title-small-emphasized">{book.title}</span>
                  <span className="md-body-small muted">
                    {[book.publisher, book.edition, book.series].filter(Boolean).join(' · ') || '未填写出版社'}
                  </span>
                  <span className="md-body-small">
                    归属课程：{book.course}
                    {book.inSchedule ? '' : '（课表中未找到）'}
                    {book.source === 'recognized' ? ' · 封面识别' : book.source === 'manual' ? ' · 手动填写' : ' · 内置库'}
                  </span>
                </div>
                <MdIconButton icon="arrow_forward" label={`查看课程 ${book.course}`} onClick={() => openCourse(book.course)} />
              </div>
            ))}
          </div>
        ) : (
          <div className="col gap-8" style={{ alignItems: 'center', padding: '32px 0' }}>
            <MdIcon name="auto_stories" size={48} />
            <span className="md-title-small-emphasized">{query ? '没有匹配的教材' : '还没有教材记录'}</span>
            <span className="md-body-small muted" style={{ textAlign: 'center' }}>
              到「课表 → 点开任意课程 → 教材 → 拍照识别封面」，识别出的书名会自动挂到该课程上；
              也可以手动填写。识别需要**支持视觉多模态**的模型，见 设置 → API编辑。
            </span>
          </div>
        )}
      </div>

      <AppNavBar active="schedule" onSelect={(tab) => {
        if (tab === 'schedule') nav.popTo('schedule');
        else nav.push(tab === 'search' ? 'scheduleFilter' : 'settings', {}, 'slide');
      }} />
    </div>
  );
}
