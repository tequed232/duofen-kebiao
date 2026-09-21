/**
 * 历史 (History)
 *
 * "最近三次记录" top app bar with a more_vert overflow menu, a search field
 * (records are filtered by title / tag / transcript), the record cards and the
 * shared nav bar. Cards open the record detail screen.
 */
import { useEffect, useMemo, useState } from 'react';
import { AppNavBar, EmptyState, TopAppBar, useScrolled } from '../components/layout';
import { MdDialog, MdIcon, MdIconButton, MdMenu, MdTextField, type MenuAction } from '../components/md';
import { ConfirmDialog } from '../components/overlays';
import { RecordCard } from '../components/content';
import { useAppState } from '../state/AppState';
import { useNav } from '../nav/navigation';
import { analyzeImage } from '../lib/api';
import { pickImageFile, prepareImageFile } from '../lib/imaging';
import { formatDateTime } from '../lib/utils';
import type { NoteRecord } from '../lib/types';

type PendingConfirm = { kind: 'clear' } | { kind: 'delete'; record: NoteRecord } | null;

export default function HistoryScreen() {
  const nav = useNav();
  const { records, settings, createRecord, updateRecord, removeRecord, clearAllRecords, restoreRecords, showSnackbar } =
    useAppState();

  const [query, setQuery] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [appMenuOpen, setAppMenuOpen] = useState(false);
  const [appMenuAnchor, setAppMenuAnchor] = useState<HTMLElement | null>(null);
  const [cardMenu, setCardMenu] = useState<{ anchor: HTMLElement; record: NoteRecord } | null>(null);
  const [pending, setPending] = useState<PendingConfirm>(null);
  const [editing, setEditing] = useState<NoteRecord | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editNote, setEditNote] = useState('');
  const [busy, setBusy] = useState(false);
  const { ref: scrollRef, scrolled } = useScrolled<HTMLDivElement>();

  useEffect(() => {
    if (editing) {
      setEditTitle(editing.title);
      setEditNote(editing.note);
    }
  }, [editing]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return records;
    return records.filter((record) =>
      [record.title, record.note, record.imageSummary, record.transcript, ...record.tags]
        .join(' ')
        .toLowerCase()
        .includes(needle),
    );
  }, [query, records]);

  const visible = showAll ? filtered : filtered.slice(0, 3);

  const title = showAll ? '全部记录' : '最近三次记录';

  const appMenuActions: MenuAction[] = [
    {
      label: showAll ? '仅显示最近三次' : '显示全部记录',
      icon: showAll ? 'filter_list' : 'list',
      onSelect: () => {
        setShowAll((value) => !value);
        setAppMenuOpen(false);
      },
    },
    {
      label: '从相册导入图片',
      icon: 'add_photo_alternate',
      onSelect: () => {
        setAppMenuOpen(false);
        void importFromLibrary();
      },
    },
    {
      label: '清空全部记录',
      icon: 'delete_sweep',
      disabled: !records.length,
      onSelect: () => {
        setAppMenuOpen(false);
        setPending({ kind: 'clear' });
      },
    },
  ];

  const importFromLibrary = async () => {
    const file = await pickImageFile();
    if (!file) return;
    setBusy(true);
    try {
      const dataUrl = await prepareImageFile(file, settings.cameraSharpness);
      const record = await createRecord({
        title: `图片记录 · ${formatDateTime(Date.now())}`,
        images: [dataUrl],
      });
      showSnackbar({
        message: '已导入图片并创建记录',
        actionLabel: '撤销',
        onAction: () => void removeRecord(record.id),
      });
      if (settings.visionApiUrl.trim()) {
        try {
          const result = await analyzeImage(dataUrl, settings);
          await updateRecord(record.id, {
            imageSummary: result.summary,
            keyPoints: result.keyPoints,
            note: result.summary,
            tags: result.tags,
          });
          showSnackbar({ message: '图片已识别并生成总结' });
        } catch (caught) {
          showSnackbar({
            message: `识别失败：${caught instanceof Error ? caught.message : '未知错误'}`,
            duration: 6000,
          });
        }
      }
    } finally {
      setBusy(false);
    }
  };

  const selectTab = (tab: 'schedule' | 'search' | 'settings') => {
    // v2：底边栏三项 —— 首页=课表（栈底）、搜索=筛选页、设置
    if (tab === 'schedule') {
      nav.popTo('schedule');
      return;
    }
    nav.push(tab === 'search' ? 'scheduleFilter' : 'settings', {}, 'slide');
  };

  const confirmPending = async () => {
    if (!pending) return;
    if (pending.kind === 'clear') {
      const snapshot = records;
      await clearAllRecords();
      setPending(null);
      showSnackbar({
        message: '已清空全部记录',
        actionLabel: '撤销',
        onAction: () => {
          void restoreRecords(snapshot);
          showSnackbar({ message: '已恢复记录' });
        },
      });
      return;
    }
    const record = pending.record;
    await removeRecord(record.id);
    setPending(null);
    showSnackbar({
      message: '已删除该记录',
      actionLabel: '撤销',
      onAction: async () => {
        await restoreRecords([record]);
        showSnackbar({ message: '已恢复记录' });
      },
    });
  };

  return (
    <>
      <div className="screen-inner">
        <TopAppBar
          title={title}
          scrolled={scrolled}
          actions={
            <MdIconButton
              icon="more_vert"
              label="更多操作"
              onClick={(event) => {
                setAppMenuAnchor(event.currentTarget);
                setAppMenuOpen(true);
              }}
            />
          }
        />

        <div className="screen-content" ref={scrollRef}>
          <MdTextField
            label="搜索记录"
            value={query}
            onValueChange={setQuery}
            placeholder="标题、标签或内容"
            leadingIcon={<MdIcon name="search" />}
            trailingIcon={
              query ? <MdIconButton icon="close" label="清空搜索" onClick={() => setQuery('')} /> : undefined
            }
          />

          {!records.length ? (
            <div className="flex-1 col" style={{ justifyContent: 'center' }}>
              <EmptyState
                icon="photo_library"
                title="还没有任何记录"
                description="拍一张照片或在主页录制语音，记录会自动保存在本机浏览器中。"
                action={
                  <div className="row gap-8">
                    <md-filled-button onClick={() => nav.push('camera', {}, 'zoom')}>
                      <MdIcon slot="icon" name="photo_camera" />
                      去拍照
                    </md-filled-button>
                    <md-outlined-button onClick={() => void importFromLibrary()}>
                      <MdIcon slot="icon" name="add_photo_alternate" />
                      从相册导入
                    </md-outlined-button>
                  </div>
                }
              />
            </div>
          ) : null}

          {records.length && !visible.length ? (
            <div className="flex-1 col" style={{ justifyContent: 'center' }}>
              <EmptyState
                icon="search_off"
                title="没有匹配的记录"
                description={`没有找到与“${query}”相关的记录，换个关键词试试。`}
                action={<md-outlined-button onClick={() => setQuery('')}>清空搜索</md-outlined-button>}
              />
            </div>
          ) : null}

          {visible.length ? (
            <div className="col gap-12 mt-12">
              {visible.map((record) => (
                <RecordCard
                  key={record.id}
                  record={record}
                  onOpen={() => nav.push('record', { id: record.id }, 'slide')}
                  onMenu={(anchor) => setCardMenu({ anchor, record })}
                />
              ))}
              {!showAll && filtered.length > 3 ? (
                <md-text-button onClick={() => setShowAll(true)}>
                  查看全部 {filtered.length} 条记录
                </md-text-button>
              ) : null}
            </div>
          ) : null}

          {busy ? (
            <div className="loading-inline md-body-medium mt-12">
              <md-circular-progress indeterminate />
              <span>正在导入图片…</span>
            </div>
          ) : null}
        </div>

        <AppNavBar active="schedule" onSelect={selectTab} />
      </div>

      <MdMenu anchor={appMenuAnchor} open={appMenuOpen} actions={appMenuActions} onClose={() => setAppMenuOpen(false)} />

      <MdMenu
        anchor={cardMenu?.anchor ?? null}
        open={Boolean(cardMenu)}
        onClose={() => setCardMenu(null)}
        actions={
          cardMenu
            ? [
                {
                  label: '查看详情',
                  icon: 'open_in_new',
                  onSelect: () => {
                    nav.push('record', { id: cardMenu.record.id }, 'slide');
                    setCardMenu(null);
                  },
                },
                {
                  label: '编辑标题与说明',
                  icon: 'edit',
                  onSelect: () => {
                    setEditing(cardMenu.record);
                    setCardMenu(null);
                  },
                },
                {
                  label: '删除记录',
                  icon: 'delete',
                  onSelect: () => {
                    setPending({ kind: 'delete', record: cardMenu.record });
                    setCardMenu(null);
                  },
                },
              ]
            : []
        }
      />

      <ConfirmDialog
        open={Boolean(pending)}
        headline={pending?.kind === 'clear' ? '清空全部记录？' : '删除这条记录？'}
        body={
          pending?.kind === 'clear'
            ? `将删除全部 ${records.length} 条记录，删除后可通过提示条撤销。`
            : `“${pending?.kind === 'delete' ? pending.record.title : ''}”将被删除，删除后可通过提示条撤销。`
        }
        onCancel={() => setPending(null)}
        onConfirm={() => void confirmPending()}
      />

      <MdDialog
        open={Boolean(editing)}
        headline="编辑记录"
        onClosed={() => setEditing(null)}
        actions={
          <>
            <md-text-button onClick={() => setEditing(null)}>取消</md-text-button>
            <md-text-button
              onClick={() => {
                if (!editing) return;
                const previous = { title: editing.title, note: editing.note };
                const next = { title: editTitle.trim() || previous.title, note: editNote };
                void updateRecord(editing.id, next);
                setEditing(null);
                showSnackbar({
                  message: '已保存修改',
                  actionLabel: '撤销',
                  onAction: () => void updateRecord(editing.id, previous),
                });
              }}
            >
              保存
            </md-text-button>
          </>
        }
      >
        <MdTextField label="标题" value={editTitle} onValueChange={setEditTitle} />
        <div className="mt-12">
          <MdTextField label="辅助说明文字" value={editNote} onValueChange={setEditNote} />
        </div>
      </MdDialog>
    </>
  );
}
