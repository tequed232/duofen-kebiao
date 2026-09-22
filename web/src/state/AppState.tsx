/** Global application state: settings, schedule, textbooks, snackbar and theme. */
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
import { DEFAULT_SETTINGS, type AppSettings } from '../lib/types';
import { applyRoles, buildThemes, detectSeed, type SeedSource } from '../theme/palette';
import { EMBEDDED_SCHEDULE } from '../data/schedule';
import type { ScheduleData } from '../lib/schedule';
import { libraryTextbook, type Textbook } from '../lib/textbooks';

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

interface AppStateValue {
  ready: boolean;
  settings: AppSettings;
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
  updateSettings: (patch: Partial<AppSettings>, options?: UpdateOptions) => void;
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
  const [snackbar, setSnackbar] = useState<SnackbarMessage | null>(null);
  const [seed] = useState<SeedSource>(() => detectSeed());
  const theme = useMemo(() => buildThemes(seed), [seed]);
  const [importedSchedule, setImportedSchedule] = useState<ScheduleData | null>(null);
  const [textbookOverrides, setTextbookOverrides] = useState<Record<string, Textbook>>({});
  const [scheduleHighlight, setScheduleHighlight] = useState<ScheduleHighlight | null>(null);

  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const snackbarTimer = useRef<number | undefined>(undefined);

  /* ------------------------------------------------------------- loading */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [storedSettings, storedSchedule, storedTextbooks] = await Promise.all([
        db.readSettings(),
        db.readKv<ScheduleData>(db.SCHEDULE_KEY),
        db.readKv<Record<string, Textbook>>(db.TEXTBOOK_KEY),
      ]);
      if (cancelled) return;
      setSettings({ ...DEFAULT_SETTINGS, ...storedSettings });
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

  const value = useMemo<AppStateValue>(
    () => ({
      ready,
      settings,
      seed,
      dynamicColor: theme.dynamic,
      schedule,
      scheduleImported: importedSchedule !== null,
      setSchedule,
      scheduleHighlight,
      setScheduleHighlight,
      textbooks,
      setTextbook,
      updateSettings,
      showSnackbar,
      hideSnackbar,
      snackbar,
    }),
    [
      ready,
      settings,
      seed,
      theme.dynamic,
      schedule,
      importedSchedule,
      setSchedule,
      scheduleHighlight,
      textbooks,
      setTextbook,
      updateSettings,
      showSnackbar,
      hideSnackbar,
      snackbar,
    ],
  );

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}
