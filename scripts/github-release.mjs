/**
 * Create a GitHub release and upload assets using the REST API.
 *
 * The token is read from GITHUB_TOKEN / GH_TOKEN (never printed). In this workspace it
 * is provided by Git Credential Manager:
 *
 *   $out = "protocol=https`nhost=github.com`n" | git credential fill
 *   $env:GITHUB_TOKEN = ($out | Select-String '^password=').Line.Substring(9)
 *
 * Usage:
 *   node scripts/github-release.mjs --tag v1.0.2 --name "v1.0.2 · ..." \
 *     --notes RELEASE_NOTES.md --asset "m3-expressive-web-1.0.2.zip=build/m3-expressive-web-1.0.2.zip"
 */
import { createReadStream, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';

const API = 'https://api.github.com';
const UPLOADS = 'https://uploads.github.com';

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
const tag = args.tag;
if (!tag) {
  console.error('--tag is required');
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

const body = args.notes ? await readFile(path.resolve(args.notes), 'utf8') : (args.body ?? '');

let release = null;
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

for (const asset of args.assets) {
  const filePath = path.resolve(asset.file);
  const size = statSync(filePath).size;
  const existing = (release.assets ?? []).find((entry) => entry.name === asset.name);
  if (existing) {
    await api(`${API}/repos/${repo}/releases/assets/${existing.id}`, { method: 'DELETE' });
    console.log(`replaced existing asset ${asset.name}`);
  }
  const uploadUrl = `${UPLOADS}/repos/${repo}/releases/${release.id}/assets?name=${encodeURIComponent(asset.name)}`;
  const stream = Readable.toWeb(createReadStream(filePath));
  const uploaded = await api(uploadUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': String(size) },
    body: stream,
    duplex: 'half',
  });
  console.log(`uploaded ${uploaded.name} (${(uploaded.size / 1024 / 1024).toFixed(2)} MB)`);
}

const finalRelease = await api(`${API}/repos/${repo}/releases/tags/${tag}`);
console.log(
  JSON.stringify(
    { tag: finalRelease.tag_name, url: finalRelease.html_url, assets: finalRelease.assets.map((asset) => asset.name) },
    null,
    2,
  ),
);
