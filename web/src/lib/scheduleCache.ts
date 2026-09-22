/**
 * 本地缓存课表：每次导入/替换课表时留一份**快照**（最多 3 份），
 * 之后可以一键恢复到任意一份 —— 换课表、导入失败、误操作都能回退。
 *
 * 存储：IndexedDB 的 kv 表（键 `scheduleCache`），与课表数据同库，随应用一起离线可用。
 */
import * as db from './db';
import type { ScheduleData } from './schedule';

const CACHE_KEY = 'scheduleCache';
const MAX_SNAPSHOTS = 3;

export interface ScheduleSnapshot {
  id: string;
  /** 来源文件名或「内置课表」「粘贴导入」 */
  source: string;
  /** 保存时间（毫秒） */
  at: number;
  /** 课程总数，用于列表里一眼看出内容多少 */
  courses: number;
  schedule: ScheduleData;
}

function countCourses(schedule: ScheduleData): number {
  return schedule.periods.reduce(
    (sum, period) => sum + period.days.reduce((daySum, day) => daySum + day.length, 0),
    0,
  );
}

/** 读取全部快照（新→旧） */
export async function listSnapshots(): Promise<ScheduleSnapshot[]> {
  try {
    const stored = await db.readKv<ScheduleSnapshot[]>(CACHE_KEY);
    return (stored ?? []).slice().sort((a, b) => b.at - a.at);
  } catch {
    return [];
  }
}

/** 保存一份快照（自动去重 + 只保留最近 3 份） */
export async function saveSnapshot(
  schedule: ScheduleData,
  source: string,
): Promise<ScheduleSnapshot[]> {
  const snapshot: ScheduleSnapshot = {
    id: `snap-${Date.now()}`,
    source: source || '未命名来源',
    at: Date.now(),
    courses: countCourses(schedule),
    schedule,
  };
  const existing = await listSnapshots();
  // 同来源同内容不重复保存
  const fingerprint = `${snapshot.source}|${snapshot.courses}|${schedule.term}|${schedule.termStart}`;
  const deduped = existing.filter(
    (item) => `${item.source}|${item.courses}|${item.schedule.term}|${item.schedule.termStart}` !== fingerprint,
  );
  const next = [snapshot, ...deduped].slice(0, MAX_SNAPSHOTS);
  try {
    await db.writeKv(CACHE_KEY, next);
  } catch {
    /* 存不下也不影响主流程 */
  }
  return next;
}

/** 取一份快照（用于恢复） */
export async function getSnapshot(id: string): Promise<ScheduleSnapshot | null> {
  const all = await listSnapshots();
  return all.find((item) => item.id === id) ?? null;
}

/** 清空缓存 */
export async function clearSnapshots(): Promise<void> {
  try {
    await db.writeKv(CACHE_KEY, []);
  } catch {
    /* 忽略 */
  }
}

/** 相对时间文案：刚刚 / N 分钟前 / N 小时前 / N 天前 */
export function relativeTime(at: number, now = Date.now()): string {
  const diff = Math.max(0, now - at);
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} 天前`;
  return new Date(at).toLocaleDateString('zh-Hans-CN');
}
