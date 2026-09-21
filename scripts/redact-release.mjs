/**
 * Redact a personal name from the published GitHub releases:
 *  - rewrite the release bodies (v1.0.2 / v1.0.3)
 *  - delete the build assets that embed the old name (the v1.0.3 web zip and APK)
 *
 * Usage:
 *   node --use-system-ca scripts/redact-release.mjs "[old name]" "（历史班级署名）"
 */
import { readFile } from 'node:fs/promises';

const API = 'https://api.github.com';
const repo = 'tequed232/duofen-kebiao';
const [oldName, replacement] = process.argv.slice(2);
if (!oldName || !replacement) {
  console.error('usage: node --use-system-ca scripts/redact-release.mjs <oldName> <replacement>');
  process.exit(2);
}

const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
if (!token) {
  console.error('GITHUB_TOKEN is required');
  process.exit(2);
}

const headers = {
  Authorization: `Bearer ${token}`,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'm3-expressive-release-script',
};

async function api(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { ...headers, ...(options.headers ?? {}) } });
  if (response.status === 204) return null;
  const text = await response.text();
  if (!response.ok) throw new Error(`${options.method ?? 'GET'} ${url} -> ${response.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

const releases = await api(`${API}/repos/${repo}/releases`);
const notesFile = await readFile('RELEASE_NOTES.md', 'utf8').catch(() => null);

for (const release of releases) {
  let body = release.body ?? '';
  const dirty = body.includes(oldName);
  let nextBody = body.split(oldName).join(replacement);

  // v1.0.3 的说明直接用当前文件内容覆盖，保证与仓库一致
  if (release.tag_name === 'v1.0.3' && notesFile) nextBody = notesFile;

  if (nextBody !== body) {
    await api(`${API}/repos/${repo}/releases/${release.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ body: nextBody }),
    });
    console.log(`release ${release.tag_name}: body updated${dirty ? ' (name redacted)' : ''}`);
  } else {
    console.log(`release ${release.tag_name}: body unchanged`);
  }

  // 构建产物里内嵌了旧署名，直接撤下，避免继续对外分发
  for (const asset of release.assets ?? []) {
    if (/\.(zip|apk)$/i.test(asset.name) && release.tag_name !== 'v1.0.4') {
      await api(`${API}/repos/${repo}/releases/assets/${asset.id}`, { method: 'DELETE' });
      console.log(`release ${release.tag_name}: deleted asset ${asset.name} (embeds the old signature)`);
    }
  }
}

const final = await api(`${API}/repos/${repo}/releases`);
for (const release of final) {
  console.log(`${release.tag_name}: assets=[${(release.assets ?? []).map((asset) => asset.name).join(', ')}] nameInBody=${(release.body ?? '').includes(oldName)}`);
}
