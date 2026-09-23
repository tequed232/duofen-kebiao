/**
 * Create a GitHub release and upload assets using the REST API.
 *
 * The token is read from GITHUB_TOKEN / GH_TOKEN (never printed). In this workspace it
 * is provided by Git Credential Manager:
 *
 *   $out = "protocol=https`nhost=github.com`n" | git credential fill
 *   $env:GITHUB_TOKEN = ($out | Select-String '^password=').Line.Substring(9)
 *
 * 命名与保留规则（2026-09 起，作者要求）：
 *   1. 一个版本只发布两份成品，文件名统一，**不再使用 enhance 这套旧名**：
 *        duofen-kebiao-<版本>.apk          安装包
 *        duofen-kebiao-<版本>-web.zip      网页构建
 *   2. `enhance.apk` 这类「始终最新」的别名不再发布（短链改用 release 直链）。
 *   3. 本仓库 Releases 只保留最近 5 条；更早版本的成品先归档到私有仓库
 *      tequed232/duofen-kebiao-releases，再从本仓库移除附件（release 条目保留）。
 *
 * Usage:
 *   node scripts/github-release.mjs --tag v3.0.2 --name "多分课表 v3.0.2 —— ..." \
 *     --notes RELEASE_NOTES.md \
 *     --asset "duofen-kebiao-3.0.2.apk=app/build/outputs/apk/release/app-release.apk" \
 *     --asset "duofen-kebiao-3.0.2-web.zip=dist-web-3.0.2.zip"
 *
 *   # 只整理历史、不建新版本：
 *   node scripts/github-release.mjs --tag v3.0.2 --prune-only
 */
import { createReadStream, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';

const API = 'https://api.github.com';
const UPLOADS = 'https://uploads.github.com';
const ARCHIVE_REPO = 'tequed232/duofen-kebiao-releases';
const KEEP_RELEASES = 5;

function parseArgs(argv) {
  const args = { assets: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];
    if (key === '--asset') {
      const [name, file] = String(value).split('=');
      args.assets.push({ name, file });
      i += 1;
      continue;
    }
    if (key.startsWith('--')) {
      // 布尔开关：后面跟着另一个 --flag 或没有值时不吞参数
      if (value === undefined || String(value).startsWith('--')) {
        args[key.slice(2)] = true;
        continue;
      }
      args[key.slice(2)] = value;
      i += 1;
    }
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
if (!token) {
  console.error('GITHUB_TOKEN is required');
  process.exit(2);
}

const repo = args.repo ?? 'tequed232/duofen-kebiao';
const archiveRepo = args['archive-repo'] ?? ARCHIVE_REPO;
const keep = Number(args.keep ?? KEEP_RELEASES);
const tag = args.tag;
if (!tag) {
  console.error('--tag is required');
  process.exit(2);
}

/** 从 tag 取规范版本号：v3.0.2 -> 3.0.2、v3.0 -> 3.0、enhance-1.5 -> 1.5 */
function canonicalVersion(value) {
  return String(value).replace(/^v/, '').replace(/^enhance-/, '');
}

/** 统一成品命名：duofen-kebiao-<版本>.apk / duofen-kebiao-<版本>-web.zip */
function canonicalAssetName(version, file) {
  if (/\.apk$/i.test(file)) return `duofen-kebiao-${version}.apk`;
  if (/\.zip$/i.test(file)) return `duofen-kebiao-${version}-web.zip`;
  return path.basename(file);
}

const headers = {
  Authorization: `Bearer ${token}`,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'm3-expressive-release-script',
};

async function api(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { ...headers, ...(options.headers ?? {}) } });
  const text = await response.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }
  if (!response.ok) {
    throw new Error(`${options.method ?? 'GET'} ${url} -> ${response.status}: ${typeof payload === 'string' ? payload : JSON.stringify(payload)}`);
  }
  return payload;
}

const user = await api(`${API}/user`);
console.log(`authenticated as ${user.login}`);

async function apiBuffer(url) {
  const response = await fetch(url, { headers: { ...headers, Accept: 'application/octet-stream' } });
  if (!response.ok) throw new Error(`GET ${url} -> ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

const version = canonicalVersion(tag);
const pruneOnly = args['prune-only'] === true;

let release = null;
if (pruneOnly) {
  console.log(`--prune-only：跳过建版本，只整理 ${tag}`);
} else {
  const body = args.notes ? await readFile(path.resolve(args.notes), 'utf8') : (args.body ?? '');
  try {
    release = await api(`${API}/repos/${repo}/releases/tags/${tag}`);
    console.log(`release ${tag} already exists (id ${release.id})`);
  } catch {
    release = await api(`${API}/repos/${repo}/releases`, {
      method: 'POST',
      body: JSON.stringify({
        tag_name: tag,
        target_commitish: args.target ?? 'main',
        name: args.name ?? tag,
        body,
        draft: false,
        prerelease: false,
      }),
    });
    console.log(`created release ${release.tag_name} (id ${release.id})`);
  }
}

if (!pruneOnly) for (const asset of args.assets ?? []) {
  // 未显式给名字时按规则自动命名，避免再出现 enhance.apk 这类旧名
  const name = asset.name ?? canonicalAssetName(version, asset.file);
  const filePath = path.resolve(asset.file);
  const size = statSync(filePath).size;
  const existing = (release.assets ?? []).find((entry) => entry.name === name);
  if (existing) {
    await api(`${API}/repos/${repo}/releases/assets/${existing.id}`, { method: 'DELETE' });
    console.log(`replaced existing asset ${name}`);
  }
  const uploadUrl = `${UPLOADS}/repos/${repo}/releases/${release.id}/assets?name=${encodeURIComponent(name)}`;
  const stream = Readable.toWeb(createReadStream(filePath));
  const uploaded = await api(uploadUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': String(size) },
    body: stream,
    duplex: 'half',
  });
  console.log(`uploaded ${uploaded.name} (${(uploaded.size / 1024 / 1024).toFixed(2)} MB)`);
}

/**
 * 归档 + 保留策略：本仓库只留最近 keep 条 release 的成品，
 * 更早的先复制到私有归档仓库，再从本仓库移除附件（release 条目与 tag 保留）。
 */
async function archiveAndPrune() {
  const all = await api(`${API}/repos/${repo}/releases?per_page=100`);
  const stale = all.slice(keep);
  if (!stale.length) {
    console.log(`\n保留策略：共 ${all.length} 条 release，无需整理`);
    return;
  }
  console.log(`\n保留策略：共 ${all.length} 条，保留最近 ${keep} 条，整理 ${stale.length} 条`);

  // 归档仓库（不存在则创建为 private）
  let archive = null;
  try {
    archive = await api(`${API}/repos/${archiveRepo}`);
  } catch {
    archive = await api(`${API}/user/repos`, {
      method: 'POST',
      body: JSON.stringify({
        name: archiveRepo.split('/')[1],
        private: true,
        description: '多分课表 APK / Web 构建归档（私有）：所有历史版本成品，主仓库 Releases 只留最近 5 条',
        auto_init: true,
        has_issues: false,
        has_wiki: false,
      }),
    });
    console.log(`  创建归档仓库 ${archive.full_name}（private）`);
  }
  if (!archive.private) console.log(`  ⚠ ${archiveRepo} 不是 private，请检查`);

  for (const old of stale) {
    const finished = await api(`${API}/repos/${repo}/releases/${old.id}`);
    if (!finished.assets?.length) continue;

    // 1) 归档仓库里建同名 tag 的 release，把附件复制过去
    let target = null;
    try {
      target = await api(`${API}/repos/${archiveRepo}/releases/tags/${old.tag_name}`);
    } catch {
      target = await api(`${API}/repos/${archiveRepo}/releases`, {
        method: 'POST',
        body: JSON.stringify({
          tag_name: old.tag_name,
          target_commitish: 'main',
          name: `${old.tag_name} · 归档`,
          body: `从 ${repo} 迁移的历史成品。\n\n源码见主仓库对应 tag。`,
          draft: false,
          prerelease: false,
        }),
      });
    }
    const archived = new Set((target.assets ?? []).map((a) => a.name));
    for (const asset of finished.assets) {
      if (archived.has(asset.name)) continue;
      // 下载再上传：附件只有几 MB，换来归档仓库的长期可追溯
      const buffer = await apiBuffer(asset.url);
      await api(`${UPLOADS}/repos/${archiveRepo}/releases/${target.id}/assets?name=${encodeURIComponent(asset.name)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': String(buffer.length) },
        body: buffer,
      });
      console.log(`  归档 ${old.tag_name}/${asset.name} -> ${archiveRepo}`);
    }

    // 2) 归档确认后才从本仓库移除
    for (const asset of finished.assets) {
      await api(`${API}/repos/${repo}/releases/assets/${asset.id}`, { method: 'DELETE' });
      console.log(`  移除本仓库附件 ${old.tag_name}/${asset.name}`);
    }
  }
  console.log('整理完成：本仓库只保留最近 ' + keep + ' 条 release 的成品');
}

if (args.prune !== false) await archiveAndPrune();

const finalRelease = pruneOnly ? null : await api(`${API}/repos/${repo}/releases/tags/${tag}`);
console.log(
  JSON.stringify(
    finalRelease
      ? { tag: finalRelease.tag_name, url: finalRelease.html_url, assets: finalRelease.assets.map((asset) => asset.name) }
      : { pruned: true, repo, archiveRepo },
    null,
    2,
  ),
);
