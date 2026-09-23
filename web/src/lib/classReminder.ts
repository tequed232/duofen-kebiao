/**
 * 上课提醒：在临近上课时通过**实况通知（灵动岛 / 流体云）**提醒，并带上两个动作：
 *   · 导航 —— 直接拉起地图 App 到教室
 *   · 课本 —— 回到应用查看这节课要带的教材
 *
 * 设计要点：
 *  1. 每 30 秒检查一次「下一节课」，提前量可调（5/10/15/20/30 分钟，默认 10）；
 *  2. 同一节课只提醒一次（按 课程+日期+节次 去重，去重记录存在 localStorage，重启后不会重复打扰）；
 *  3. 上课后（minutesLeft < 0）自动撤销提醒，不留常驻通知；
 *  4. 不在原生宿主（浏览器）里时不发通知，只更新内部状态。
 */
import type { ScheduleData, ScheduleCourse } from './schedule';
import { nativeClassReminder, nativeStopClassReminder, isNativeShell } from './native';
import { coverThumbnail } from './imaging';

export interface ReminderSettings {
  enabled: boolean;
  /** 提前多少分钟提醒 */
  leadMinutes: number;
}

interface NotifiedMap {
  [key: string]: number;
}

const NOTIFIED_KEY = 'duofen.classReminderNotified';

function readNotified(): NotifiedMap {
  try {
    return JSON.parse(localStorage.getItem(NOTIFIED_KEY) ?? '{}') as NotifiedMap;
  } catch {
    return {};
  }
}

function writeNotified(map: NotifiedMap) {
  try {
    // 只保留最近 3 天，避免无限增长
    const cutoff = Date.now() - 3 * 24 * 60 * 60 * 1000;
    const trimmed: NotifiedMap = {};
    Object.entries(map).forEach(([key, value]) => {
      if (value >= cutoff) trimmed[key] = value;
    });
    localStorage.setItem(NOTIFIED_KEY, JSON.stringify(trimmed));
  } catch {
    /* 忽略 */
  }
}

/** 节次开始时间（"08:30-09:55" → 分钟数） */
function startMinutes(time: string): number | null {
  const match = /^(\d{1,2}):(\d{2})/.exec(time.trim());
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

export interface UpcomingClass {
  course: ScheduleCourse;
  period: string;
  time: string;
  minutesLeft: number;
  startAt: number;
  textbooks: string;
  navigateUri: string;
  /** 教材封面（用于通知大图标）；没拍照就为 undefined */
  cover?: string;
}

/** 找出今天下一节课（含正在进行、刚开始的这节课） */
export function findUpcomingClass(
  schedule: ScheduleData,
  textbooks: Record<string, { title?: string; cover?: string }>,
  schoolName: string,
  now = new Date(),
): UpcomingClass | null {
  const dayIndex = (now.getDay() + 6) % 7; // 周一 = 0
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  let best: UpcomingClass | null = null;

  schedule.periods.forEach((period) => {
    const start = startMinutes(period.time);
    if (start === null) return;
    const courses = period.days[dayIndex] ?? [];
    courses.forEach((course) => {
      const minutesLeft = start - nowMinutes;
      // 已开始 20 分钟以上的课不再提醒
      if (minutesLeft < -20) return;
      if (best && best.minutesLeft <= minutesLeft) return;
      const book = textbooks[course.name];
      const room = course.room ?? '';
      const label = `${schoolName ? schoolName + ' ' : ''}${room}`.trim();
      best = {
        course,
        period: period.period,
        time: period.time,
        minutesLeft,
        startAt: new Date(now.getFullYear(), now.getMonth(), now.getDate(), Math.floor(start / 60), start % 60).getTime(),
        textbooks: book?.title ?? '',
        navigateUri: label ? `geo:0,0?q=${encodeURIComponent(label)}` : '',
        cover: book?.cover,
      };
    });
  });

  return best;
}

/**
 * 启动提醒循环。返回停止函数。
 * @param getContext 每次检查时取最新的课表 / 教材 / 设置（避免闭包拿到旧值）
 */
export function startClassReminderLoop(getContext: () => {
  schedule: ScheduleData;
  textbooks: Record<string, { title?: string; cover?: string }>;
  settings: ReminderSettings & { schoolName?: string };
}): () => void {
  let stopped = false;

  const tick = async () => {
    if (stopped) return;
    const { schedule, textbooks, settings } = getContext();
    if (!settings.enabled) {
      nativeStopClassReminder();
      return;
    }
    const upcoming = findUpcomingClass(schedule, textbooks, settings.schoolName ?? '');
    if (!upcoming) {
      nativeStopClassReminder();
      return;
    }
    if (upcoming.minutesLeft > settings.leadMinutes) {
      // 还没到提醒窗口
      nativeStopClassReminder();
      return;
    }
    const key = `${upcoming.course.name}|${new Date().toDateString()}|${upcoming.period}`;
    const notified = readNotified();
    if (notified[key]) return;
    notified[key] = Date.now();
    writeNotified(notified);

    if (!isNativeShell()) return;
    // 封面先缩成通知用的小图再传原生 —— 原图可能有几 MB，跨进程传会卡
    const cover = upcoming.cover ? (await coverThumbnail(upcoming.cover)) ?? '' : '';
    nativeClassReminder({
      course: upcoming.course.name,
      room: upcoming.course.room ?? '',
      timeText: `${upcoming.period} ${upcoming.time}`,
      textbooks: upcoming.textbooks,
      minutesLeft: upcoming.minutesLeft,
      startAtMillis: upcoming.startAt,
      navigateUri: upcoming.navigateUri,
      coverDataUrl: cover,
    });
  };

  tick();
  const timer = window.setInterval(tick, 30_000);
  return () => {
    stopped = true;
    window.clearInterval(timer);
  };
}
