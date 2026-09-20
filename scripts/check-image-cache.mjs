/**
 * 本地图片缓存上限的自检（不需要浏览器）。
 *
 * Usage: node scripts/check-image-cache.mjs
 */
import { readFile } from 'node:fs/promises';
import { transform } from 'esbuild';

const source = await readFile('web/src/lib/imageCache.ts', 'utf8');
const { code } = await transform(source, { loader: 'ts', format: 'esm' });
const module = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
const { IMAGE_CACHE_LIMIT, countImages, pruneToLimit } = module;

const image = (marker) => `data:image/png;base64,${marker}`;
const record = (id, createdAt, count) => ({
  id,
  title: `记录 ${id}`,
  note: '',
  images: Array.from({ length: count }, (_, index) => image(`${id}-${index}`)),
  transcript: '文字内容必须保留',
  imageSummary: '',
  keyPoints: [],
  branches: [],
  tags: [],
  createdAt,
  updatedAt: createdAt,
});

const fail = (message) => {
  console.error(`❌ ${message}`);
  process.exit(1);
};

// 1) 上限是 25
if (IMAGE_CACHE_LIMIT !== 25) fail(`默认上限应为 25，实际 ${IMAGE_CACHE_LIMIT}`);

// 2) 没超限时不动
const small = [record('a', 1, 5), record('b', 2, 5)];
const kept = pruneToLimit(small);
if (kept.removed !== 0 || kept.changed.length) fail('未超限时不应删除任何图片');
if (countImages(small) !== 10) fail(`计数应为 10，实际 ${countImages(small)}`);

// 3) 超限时从最旧记录开始删，且只删图片、保留文字
const big = [record('old', 100, 20), record('new', 200, 20)];
const pruned = pruneToLimit(big);
if (countImages(pruned.records) !== 25) fail(`裁剪后应为 25 张，实际 ${countImages(pruned.records)}`);
if (pruned.removed !== 15) fail(`应删 15 张，实际 ${pruned.removed}`);
const oldAfter = pruned.records.find((item) => item.id === 'old');
const newAfter = pruned.records.find((item) => item.id === 'new');
if (oldAfter.images.length !== 5) fail(`最旧记录应剩 5 张，实际 ${oldAfter.images.length}`);
if (newAfter.images.length !== 20) fail(`最新记录不应被删，实际 ${newAfter.images.length}`);
if (oldAfter.transcript !== '文字内容必须保留') fail('删图时不应动到文字内容');
if (pruned.changed.length !== 1) fail(`只有 1 条记录需要写回，实际 ${pruned.changed.length}`);

// 4) 极端情况：单条记录就超过上限
const single = pruneToLimit([record('only', 1, 40)]);
if (countImages(single.records) !== 25) fail('单条记录超限时也应压到 25 张');

// 5) 空列表安全
if (pruneToLimit([]).removed !== 0) fail('空列表不应报错');

console.log('✅ 图片缓存上限自检通过：默认 25 张，超出后从最旧记录开始只删图片、保留文字');
