/** Global application state: settings, records, live draft, snackbar and theme. */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import * as db from '../lib/db';
import { deriveKeyPoints } from '../lib/api';
import { DEFAULT_SETTINGS, EMPTY_DRAFT, type AppSettings, type Draft, type NoteRecord, type QaBranch } from '../lib/types';
import { applyRoles, buildThemes, detectSeed, type SeedSource } from '../theme/palette';
import { formatDateTime, uid } from '../lib/utils';
import { EMBEDDED_SCHEDULE } from '../data/schedule';
import type { ScheduleData } from '../lib/schedule';
import { libraryTextbook, type Textbook } from '../lib/textbooks';
import { IMAGE_CACHE_LIMIT, countImages, pruneToLimit } from '../lib/imageCache';

/** Temporary highlight applied when the filter screen jumps back to the schedule. */
export interface ScheduleHighlight {
  key: string;
  dayIndex: number;
  /** teaching week the course actually runs in (when it differs from the current week) */
  week?: number;
  until: number;
}

export interface SnackbarMessage {
  id: number;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  duration: number;
}

export interface UpdateOptions {
  message?: string;
  undoLabel?: string;
  undoable?: boolean;
}

export interface RecordInput {
  title?: string;
  note?: string;
  images?: string[];
  transcript?: string;
  imageSummary?: string;
  keyPoints?: string[];
  branches?: QaBranch[];
  tags?: string[];
}

interface AppStateValue {
  ready: boolean;
  settings: AppSettings;
  records: NoteRecord[];
  draft: Draft;
  /** key points currently displayed (API provided, or derived from the captured text) */
  effectiveKeyPoints: string[];
  seed: SeedSource;
  dynamicColor: boolean;
  /** embedded course schedule, overridden by an imported one */
  schedule: ScheduleData;
  scheduleImported: boolean;
  setSchedule: (data: ScheduleData | null) => void;
  scheduleHighlight: ScheduleHighlight | null;
  setScheduleHighlight: (highlight: ScheduleHighlight | null) => void;
  /** 课程名 → 教材（内置教材库 + 用户识别/填写的覆盖） */
  textbooks: Record<string, Textbook>;
  setTextbook: (courseName: string, textbook: Textbook | null) => void;
  /** 本地已缓存的图片张数 / 上限（默认 25），以及手动清理入口 */
  imageStats: { used: number; limit: number };
  pruneImages: () => Promise<void>;
  updateSettings: (patch: Partial<AppSettings>, options?: UpdateOptions) => void;
  createRecord: (input: RecordInput) => Promise<NoteRecord>;
  updateRecord: (id: string, patch: Partial<NoteRecord>) => Promise<void>;
  removeRecord: (id: string) => Promise<void>;
  clearAllRecords: () => Promise<void>;
  restoreRecords: (list: NoteRecord[]) => Promise<void>;
  setDraft: (patch: Partial<Draft>) => void;
  appendTranscript: (text: string) => void;
  addBranchAnswer: (question: string, answer: string, topic: string, source: 'api' | 'local' | 'none') => void;
  resetDraft: () => void;
  markDraftSaved: () => void;
  showSnackbar: (options: Omit<SnackbarMessage, 'id' | 'duration'> & { duration?: number }) => void;
  hideSnackbar: () => void;
  snackbar: SnackbarMessage | null;
}

const AppStateContext = createContext<AppStateValue | null>(null);

export function useAppState(): AppStateValue {
  const value = useContext(AppStateContext);
  if (!value) throw new Error('useAppState must be used inside <AppStateProvider>');
  return value;
}

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [records, setRecords] = useState<NoteRecord[]>([]);
  const [draft, setDraftState] = useState<Draft>(EMPTY_DRAFT);
  const [snackbar, setSnackbar] = useState<SnackbarMessage | null>(null);
  const [seed] = useState<SeedSource>(() => detectSeed());
  const theme = useMemo(() => buildThemes(seed), [seed]);
  const [importedSchedule, setImportedSchedule] = useState<ScheduleData | null>(null);
  const [textbookOverrides, setTextbookOverrides] = useState<Record<string, Textbook>>({});
  const [scheduleHighlight, setScheduleHighlight] = useState<ScheduleHighlight | null>(null);

  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const snackbarTimer = useRef<number | undefined>(undefined);
  const draftTimer = useRef<number | undefined>(undefined);

  /* ------------------------------------------------------------- loading */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [storedSettings, storedRecords, storedDraft, storedSchedule, storedTextbooks] = await Promise.all([
        db.readSettings(),
        db.getAllRecords(),
        db.readKv<Draft>(db.DRAFT_KEY),
        db.readKv<ScheduleData>(db.SCHEDULE_KEY),
        db.readKv<Record<string, Textbook>>(db.TEXTBOOK_KEY),
      ]);
      if (cancelled) return;
      setSettings({ ...DEFAULT_SETTINGS, ...storedSettings });
      setRecords(storedRecords);
      if (storedDraft) setDraftState({ ...EMPTY_DRAFT, ...storedDraft, interim: '' });
      if (storedSchedule?.periods?.length) setImportedSchedule(storedSchedule);
      if (storedTextbooks) setTextbookOverrides(storedTextbooks);
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const scheduleHasCourses = Boolean(importedSchedule?.periods?.some((period) => period.days.some((day) => day.length > 0)));
    // 已保存的课表若为空（例如曾被清空），回落到内置课表 —— 恢复内置数据后立刻生效，且不删用户数据
    const schedule = scheduleHasCourses ? (importedSchedule as ScheduleData) : EMBEDDED_SCHEDULE;

  const setSchedule = useCallback<AppStateValue['setSchedule']>((data) => {
    if (!data) {
      setImportedSchedule(null);
      void db.removeKv(db.SCHEDULE_KEY);
      return;
    }
    setImportedSchedule(data);
    void db.writeKv(db.SCHEDULE_KEY, data);
  }, []);

  /** 教材：内置教材库 + 用户在界面上识别/填写/移除的结果 */
  const textbooks = useMemo(() => {
    const merged: Record<string, Textbook> = {};
    for (const period of schedule.periods) {
      for (const day of period.days) {
        for (const course of day) {
          if (merged[course.name]) continue;
          const fromLibrary = libraryTextbook(course.name);
          if (fromLibrary) merged[course.name] = fromLibrary;
        }
      }
    }
    return { ...merged, ...textbookOverrides };
  }, [schedule, textbookOverrides]);

  const setTextbook = useCallback<AppStateValue['setTextbook']>((courseName, textbook) => {
    setTextbookOverrides((value) => {
      const next = { ...value };
      if (!textbook) {
        // 移除：写一个显式的空记录，避免又回落到内置教材
        next[courseName] = { course: courseName, title: '', publisher: '', source: 'manual' };
      } else {
        next[courseName] = { ...textbook, course: courseName };
      }
      void db.writeKv(db.TEXTBOOK_KEY, next);
      return next;
    });
  }, []);

  /* --------------------------------------------------------- persistence */
  useEffect(() => {
    if (!ready) return;
    void db.writeSettings(settings);
  }, [settings, ready]);

  useEffect(() => {
    if (!ready) return;
    window.clearTimeout(draftTimer.current);
    draftTimer.current = window.setTimeout(() => {
      void db.writeKv(db.DRAFT_KEY, { ...draft, interim: '' });
    }, 400);
    return () => window.clearTimeout(draftTimer.current);
  }, [draft, ready]);

  /* --------------------------------------------------------------- theme */
  useEffect(() => {
    applyRoles(settings.darkMode ? theme.dark : theme.light, settings.darkMode);
  }, [settings.darkMode, theme]);

  /* ------------------------------------------------------------ snackbar */
  const hideSnackbar = useCallback(() => setSnackbar(null), []);

  const showSnackbar = useCallback<AppStateValue['showSnackbar']>((options) => {
    window.clearTimeout(snackbarTimer.current);
    const message: SnackbarMessage = {
      id: Date.now(),
      duration: options.duration ?? 5000,
      message: options.message,
      actionLabel: options.actionLabel,
      onAction: options.onAction,
    };
    setSnackbar(message);
    snackbarTimer.current = window.setTimeout(() => setSnackbar(null), message.duration);
  }, []);

  useEffect(() => () => window.clearTimeout(snackbarTimer.current), []);

  /* ------------------------------------------------------------ settings */
  const updateSettings = useCallback<AppStateValue['updateSettings']>(
    (patch, options) => {
      const previous: Partial<AppSettings> = {};
      const current = settingsRef.current;
      (Object.keys(patch) as (keyof AppSettings)[]).forEach((key) => {
        (previous as Record<string, unknown>)[key] = current[key];
      });
      setSettings((value) => ({ ...value, ...patch }));
      if (options?.undoable === false) return;
      showSnackbar({
        message: options?.message ?? '已保存',
        actionLabel: options?.undoLabel ?? '撤销',
        onAction: () => {
          setSettings((value) => ({ ...value, ...previous }));
          showSnackbar({ message: '已撤销修改', duration: 2500 });
        },
      });
    },
    [showSnackbar],
  );

  /* ------------------------------------------------------------- records */
  const createRecord = useCallback<AppStateValue['createRecord']>(
    async (input) => {
      const now = Date.now();
      const record: NoteRecord = {
        id: uid('rec'),
        title: input.title?.trim() || `记录 · ${formatDateTime(now)}`,
        note: input.note ?? '',
        images: input.images ?? [],
        transcript: input.transcript ?? '',
        imageSummary: input.imageSummary ?? '',
        keyPoints: input.keyPoints ?? [],
        branches: input.branches ?? [],
        tags: input.tags ?? [],
        createdAt: now,
        updatedAt: now,
      };
      await db.putRecord(record);
      // 写入后立刻按上限裁剪：本地最多保留 IMAGE_CACHE_LIMIT 张图（文字一律保留）
      setRecords((value) => {
        const result = pruneToLimit([record, ...value]);
        if (result.removed) {
          void (async () => {
            for (const changed of result.changed) await db.putRecord(changed);
          })();
        }
        return result.records;
      });
      return record;
    },
    [],
  );

  /** 本地图片缓存：超出上限就从最旧的记录开始删图（文字一律保留） */
  const imageStats = useMemo(
    () => ({ used: countImages(records, draft.images ?? []), limit: IMAGE_CACHE_LIMIT }),
    [records, draft.images],
  );

  const pruneImages = useCallback(async () => {
    const result = pruneToLimit(records);
    if (!result.removed) {
      showSnackbar({ message: `本地图片 ${countImages(records)} 张，未超过 ${IMAGE_CACHE_LIMIT} 张上限`, duration: 3500 });
      return;
    }
    setRecords(result.records);
    for (const record of result.changed) await db.putRecord(record);
    showSnackbar({
      message: `已清理 ${result.removed} 张旧图片，保留最近 ${IMAGE_CACHE_LIMIT} 张（文字内容不受影响）`,
      duration: 4500,
    });
  }, [records, showSnackbar]);

  const updateRecord = useCallback<AppStateValue['updateRecord']>(async (id, patch) => {
    let updated: NoteRecord | undefined;
    setRecords((value) =>
      value.map((record) => {
        if (record.id !== id) return record;
        updated = { ...record, ...patch, updatedAt: Date.now() };
        return updated;
      }),
    );
    if (updated) await db.putRecord(updated);
  }, []);

  const removeRecord = useCallback<AppStateValue['removeRecord']>(async (id) => {
    setRecords((value) => value.filter((record) => record.id !== id));
    await db.deleteRecord(id);
  }, []);

  const clearAllRecords = useCallback<AppStateValue['clearAllRecords']>(async () => {
    setRecords([]);
    await db.clearRecords();
  }, []);

  const restoreRecords = useCallback(async (list: NoteRecord[]) => {
    setRecords([...list].sort((a, b) => b.createdAt - a.createdAt));
    await Promise.all(list.map((record) => db.putRecord(record)));
  }, []);

  /* --------------------------------------------------------------- draft */
  const setDraft = useCallback<AppStateValue['setDraft']>((patch) => {
    setDraftState((value) => ({ ...value, ...patch, updatedAt: Date.now() }));
  }, []);

  const appendTranscript = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setDraftState((value) => {
      const needsSpace = value.transcript && !/[\s\n]$/.test(value.transcript);
      return {
        ...value,
        transcript: `${value.transcript}${needsSpace ? ' ' : ''}${trimmed}`,
        updatedAt: Date.now(),
      };
    });
  }, []);

  const addBranchAnswer = useCallback<AppStateValue['addBranchAnswer']>((question, answer, topic, source) => {
    setDraftState((value) => {
      const branches = value.branches.map((branch) => ({ ...branch, entries: [...branch.entries] }));
      const entry = { id: uid('qa'), question, answer, source, createdAt: Date.now() };
      const index = branches.findIndex((branch) => branch.topic === topic);
      if (index >= 0) {
        branches[index].entries.push(entry);
      } else {
        branches.push({ id: uid('br'), topic, entries: [entry] });
      }
      return { ...value, branches, updatedAt: Date.now() };
    });
  }, []);

  const resetDraft = useCallback(() => setDraftState({ ...EMPTY_DRAFT }), []);

  const markDraftSaved = useCallback(() => {
    window.clearTimeout(draftTimer.current);
    void db.writeKv(db.DRAFT_KEY, EMPTY_DRAFT);
  }, []);

  const effectiveKeyPoints = useMemo(() => {
    if (draft.keyPoints.length) return draft.keyPoints;
    const text = `${draft.transcript}\n${draft.imageSummary}`.trim();
    return text ? deriveKeyPoints(text) : [];
  }, [draft.keyPoints, draft.transcript, draft.imageSummary]);

  const value = useMemo<AppStateValue>(
    () => ({
      ready,
      settings,
      records,
      draft,
      effectiveKeyPoints,
      seed,
      dynamicColor: theme.dynamic,
      schedule,
      scheduleImported: importedSchedule !== null,
      setSchedule,
      scheduleHighlight,
      setScheduleHighlight,
      textbooks,
      setTextbook,
      imageStats,
      pruneImages,
      updateSettings,
      createRecord,
      updateRecord,
      removeRecord,
      clearAllRecords,
      restoreRecords,
      imageStats,
      pruneImages,
      setDraft,
      appendTranscript,
      addBranchAnswer,
      resetDraft,
      markDraftSaved,
      showSnackbar,
      hideSnackbar,
      snackbar,
    }),
    [
      ready,
      settings,
      records,
      draft,
      effectiveKeyPoints,
      seed,
      theme.dynamic,
      schedule,
      importedSchedule,
      setSchedule,
      scheduleHighlight,
      setScheduleHighlight,
      textbooks,
      setTextbook,
      imageStats,
      pruneImages,
      updateSettings,
      createRecord,
      updateRecord,
      removeRecord,
      clearAllRecords,
      restoreRecords,
      imageStats,
      pruneImages,
      setDraft,
      appendTranscript,
      addBranchAnswer,
      resetDraft,
      markDraftSaved,
      showSnackbar,
      hideSnackbar,
      snackbar,
    ],
  );

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}
