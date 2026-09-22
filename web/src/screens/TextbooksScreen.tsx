/**
 * 教材窗口：查看 / 管理所有已导入、已识别的教材。
 *
 * 数据来源：内置教材库 + 用户在课程详情里识别或手动填写的覆盖项 + 本窗口快捷添加的条目。
 * 管理能力（作者要求）：
 *   · **多选删除**：右上角「多选」进入选择模式 → 勾选若干 → 底部出现「删除选中 / 全选 / 取消」
 *   · **快捷添加**：右下角 FAB「添加教材」→ 填书名 / 归属课程 / 出版社，立即入列
 * 删除采用「隐藏清单」实现（键写在 localStorage），不当场销毁数据，随时可回档。
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppNavBar, SectionHeader, TopAppBar } from '../components/layout';
import { MdDialog, MdIcon, MdIconButton, MdTextField } from '../components/md';
import { useAppState } from '../state/AppState';
import { useNav } from '../nav/navigation';
import { highlightKeyFor } from '../components/schedule';
import { targetWeekFor, weekNumberFor } from '../lib/schedule';

const HIDDEN_KEY = 'duofen.hiddenTextbooks';
const ADDED_KEY = 'duofen.addedTextbooks';

interface AddedBook {
  title: string;
  course: string;
  publisher?: string;
}

function readList<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeList(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* 忽略 */
  }
}

export default function TextbooksScreen() {
  const nav = useNav();
  const { schedule, textbooks, setScheduleHighlight, settings, showSnackbar } = useAppState();
  const [query, setQuery] = useState('');

  /* -------------------------------------------------- 多选 / 删除 / 添加 */
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [hidden, setHidden] = useState<string[]>(() => readList<string[]>(HIDDEN_KEY, []));
  const [added, setAdded] = useState<AddedBook[]>(() => readList<AddedBook[]>(ADDED_KEY, []));
  const [addOpen, setAddOpen] = useState(false);
  const [draft, setDraft] = useState<AddedBook>({ title: '', course: '', publisher: '' });

  useEffect(() => writeList(HIDDEN_KEY, hidden), [hidden]);
  useEffect(() => writeList(ADDED_KEY, added), [added]);

  const keyOf = useCallback((book: { course: string; title: string }) => `${book.course}｜${book.title}`, []);

  /* 课程名 → 该课程在课表里的第一次出现（用于跳转高亮） */
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
    const fromState = Object.values(textbooks)
      .filter((book) => book.title)
      .map((book) => ({ ...book, inSchedule: courseIndex.has(book.course) }));
    const fromAdded = added.map((book) => ({
      ...book,
      edition: '',
      series: '',
      source: 'manual' as const,
      cover: '',
      inSchedule: courseIndex.has(book.course),
    }));
    const seen = new Set<string>();
    const list = [...fromAdded, ...fromState].filter((book) => {
      const key = keyOf(book);
      if (hidden.includes(key) || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
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
  }, [textbooks, added, hidden, query, courseIndex, keyOf]);

  const toggle = (key: string) =>
    setSelected((prev) => (prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key]));

  const selectAll = () => setSelected(entries.map((book) => keyOf(book)));
  const exitSelect = () => {
    setSelectMode(false);
    setSelected([]);
  };

  /** 删除 = 加入隐藏清单（不当场销毁，可随时回档）；对快捷添加的条目同时从添加清单移除 */
  const removeSelected = () => {
    if (!selected.length) return;
    const count = selected.length;
    setHidden((prev) => [...new Set([...prev, ...selected])]);
    setAdded((prev) => prev.filter((book) => !selected.includes(keyOf(book))));
    exitSelect();
    showSnackbar({ message: `已移除 ${count} 本教材（隐藏清单，可回档）`, duration: 4000 });
  };

  const submitAdd = () => {
    const title = draft.title.trim();
    if (!title) {
      showSnackbar({ message: '请先填写教材名称', duration: 3000 });
      return;
    }
    setAdded((prev) => [
      { title, course: draft.course.trim() || '未指定课程', publisher: draft.publisher?.trim() || '' },
      ...prev,
    ]);
    setDraft({ title: '', course: '', publisher: '' });
    setAddOpen(false);
    showSnackbar({ message: `已添加《${title}》`, duration: 3000 });
  };

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
      <TopAppBar
        title={selectMode ? `已选 ${selected.length} 本` : '教材'}
        onBack={() => (selectMode ? exitSelect() : nav.pop())}
        backLabel={selectMode ? '退出多选' : '返回课表'}
        actions={
          selectMode ? (
            <>
              <md-text-button onClick={selectAll}>全选</md-text-button>
              <md-text-button onClick={removeSelected} disabled={!selected.length}>
                删除选中
              </md-text-button>
            </>
          ) : (
            <MdIconButton icon="checklist" label="多选" onClick={() => setSelectMode(true)} />
          )
        }
      />

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

        {selectMode ? (
          <div className="md-body-small muted mb-8">
            点卡片勾选；右上角可「全选 / 删除选中」。删除只是移入隐藏清单，数据不会当场销毁。
          </div>
        ) : null}

        {entries.length ? (
          <div className="col gap-8">
            {entries.map((book) => {
              const key = keyOf(book);
              const active = selected.includes(key);
              return (
                <div
                  className={`textbook-card${active ? ' selected' : ''}${selectMode ? ' selectable' : ''}`}
                  key={key}
                  onClick={selectMode ? () => toggle(key) : undefined}
                >
                  {selectMode ? (
                    <span className={`textbook-check${active ? ' on' : ''}`} aria-hidden="true">
                      <MdIcon name={active ? 'check_circle' : 'radio_button_unchecked'} size={22} />
                    </span>
                  ) : null}
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
                  {selectMode ? null : (
                    <MdIconButton
                      icon="arrow_forward"
                      label={`查看课程 ${book.course}`}
                      onClick={() => openCourse(book.course)}
                    />
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="col gap-8" style={{ alignItems: 'center', padding: '32px 0' }}>
            <MdIcon name="auto_stories" size={48} />
            <span className="md-title-small-emphasized">{query ? '没有匹配的教材' : '还没有教材记录'}</span>
            <span className="md-body-small muted" style={{ textAlign: 'center' }}>
              到「课表 → 点开任意课程 → 教材 → 选图识别封面」，识别出的书名会自动挂到该课程上；
              也可以点右下角「添加教材」手动补录。
            </span>
          </div>
        )}
      </div>

      {/* 快捷添加：右下角 FAB */}
      {selectMode ? null : (
        <md-fab className="textbook-fab" variant="primary" label="添加教材" onClick={() => setAddOpen(true)}>
          <MdIcon slot="icon" name="add" />
          添加教材
        </md-fab>
      )}

      {/* 选择模式的底部操作条 */}
      {selectMode ? (
        <div className="textbook-action-bar">
          <md-text-button onClick={exitSelect}>取消</md-text-button>
          <span className="md-label-medium flex-1">已选 {selected.length} / {entries.length}</span>
          <md-filled-tonal-button onClick={removeSelected} disabled={!selected.length}>
            <MdIcon slot="icon" name="delete" />
            删除选中
          </md-filled-tonal-button>
        </div>
      ) : null}

      <MdDialog
        open={addOpen}
        headline="快捷添加教材"
        onClosed={() => setAddOpen(false)}
        actions={
          <>
            <md-text-button onClick={() => setAddOpen(false)}>取消</md-text-button>
            <md-filled-button onClick={submitAdd}>添加</md-filled-button>
          </>
        }
      >
        <div className="col gap-12">
          <MdTextField
            label="教材名称"
            value={draft.title}
            onValueChange={(value) => setDraft((prev) => ({ ...prev, title: value }))}
            leadingIcon={<MdIcon name="menu_book" />}
          />
          <MdTextField
            label="归属课程"
            value={draft.course}
            onValueChange={(value) => setDraft((prev) => ({ ...prev, course: value }))}
            supportingText="填课表里的课程名，之后就能「查看课程」跳回课表"
            leadingIcon={<MdIcon name="school" />}
          />
          <MdTextField
            label="出版社（可留空）"
            value={draft.publisher ?? ''}
            onValueChange={(value) => setDraft((prev) => ({ ...prev, publisher: value }))}
          />
        </div>
      </MdDialog>

      <AppNavBar
        active="schedule"
        onSelect={(tab) => {
          if (tab === 'schedule') {
            nav.popTo('schedule');
            return;
          }
          nav.popTo('schedule');
          nav.push(tab === 'search' ? 'scheduleFilter' : 'settings', {}, 'slide');
        }}
      />
    </div>
  );
}
