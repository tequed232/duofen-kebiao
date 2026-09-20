/**
 * 本地图片缓存上限。
 *
 * 为什么需要：图片以 data URL 存在 IndexedDB 里，数量一多就会占满存储、拖慢启动。
 * 按用户要求，本地最多保留 **25 张**：超出后从**最旧的记录**开始丢弃图片（记录本身的
 * 文字、要点、问答都保留），并写回数据库。
 *
 * 纯函数实现，便于单测（scripts/check-image-cache.mjs）。
 */
import type { NoteRecord } from './types';

/** 本地保留的图片上限（用户要求：大约 25 张就够） */
export const IMAGE_CACHE_LIMIT = 25;

export function countImages(records: NoteRecord[], extra: string[] = []): number {
  return records.reduce((total, record) => total + (record.images?.length ?? 0), 0) + extra.length;
}

export interface PruneResult {
  /** 处理后的记录（只在需要时返回新数组） */
  records: NoteRecord[];
  /** 实际删掉的图片数量 */
  removed: number;
  /** 需要写回数据库的记录 */
  changed: NoteRecord[];
}

/**
 * 把图片总数压到 limit 以内：按时间**从旧到新**丢弃。
 * @param records 记录列表（顺序不重要，内部按 createdAt 升序处理）
 * @param limit 允许保留的图片总数
 */
export function pruneToLimit(records: NoteRecord[], limit = IMAGE_CACHE_LIMIT): PruneResult {
  const total = countImages(records);
  if (total <= limit) return { records, removed: 0, changed: [] };

  const oldestFirst = [...records].sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
  const drop = new Map<string, number>();
  let overflow = total - limit;

  for (const record of oldestFirst) {
    if (overflow <= 0) break;
    const owned = record.images?.length ?? 0;
    if (!owned) continue;
    const take = Math.min(owned, overflow);
    drop.set(record.id, take);
    overflow -= take;
  }

  const changed: NoteRecord[] = [];
  const next = records.map((record) => {
    const take = drop.get(record.id) ?? 0;
    if (!take) return record;
    // images 约定「新的在前」，因此裁掉的是数组尾部（最旧的那几张）
    const images = record.images.slice(0, Math.max(0, record.images.length - take));
    const updated = { ...record, images };
    changed.push(updated);
    return updated;
  });

  const removed = [...drop.values()].reduce((sum, value) => sum + value, 0);
  return { records: next, removed, changed };
}
