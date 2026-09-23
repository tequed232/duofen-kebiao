/**
 * 校验「APK 与网页一致」（硬要求）：
 * 直接读 APK（zip）里 assets/www 下的每个文件，与 dist/ 逐个比对
 * （文件名 + 内容 sha256），任何不一致就失败，避免再出现「APK 和网页对不上」。
 *
 * Usage: node scripts/check-apk-parity.mjs [apkPath]
 */
import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const apk = process.argv[2] ?? 'app/build/outputs/apk/release/app-release.apk';
const distDir = 'dist';
const short = (buffer) => createHash('sha256').update(buffer).digest('hex').slice(0, 16);

/** dist/ 下所有文件的相对路径 → 短哈希 */
async function walk(dir, base = '') {
  const out = new Map();
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      for (const [key, value] of await walk(full, rel)) out.set(key, value);
    } else if (await stat(full).then((info) => info.isFile())) {
      out.set(rel, short(await readFile(full)));
    }
  }
  return out;
}

/** 用 .NET 直接读 APK 里 assets/www 的文件（不解压到磁盘） */
const ps = `
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead('${path.resolve(apk)}')
$sha = [System.Security.Cryptography.SHA256]::Create()
foreach ($entry in $zip.Entries) {
  if ($entry.FullName -like 'assets/www/*' -and $entry.Length -gt 0) {
    $stream = $entry.Open()
    $memory = New-Object System.IO.MemoryStream
    $stream.CopyTo($memory)
    $stream.Close()
    $hash = [System.BitConverter]::ToString($sha.ComputeHash($memory.ToArray())).Replace('-', '').ToLower().Substring(0, 16)
    $rel = $entry.FullName.Substring('assets/www/'.Length)
    Write-Output "$rel $hash"
  }
}
$zip.Dispose()
`;

const raw = execFileSync('powershell', ['-NoProfile', '-Command', ps], { encoding: 'utf8' });
const apkFiles = new Map(
  raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const index = line.lastIndexOf(' ');
      return [line.slice(0, index), line.slice(index + 1)];
    }),
);

const distFiles = await walk(distDir);
const missing = [...distFiles.keys()].filter((key) => !apkFiles.has(key));
const extra = [...apkFiles.keys()].filter((key) => !distFiles.has(key));
const differing = [...distFiles.keys()].filter(
  (key) => apkFiles.has(key) && apkFiles.get(key) !== distFiles.get(key),
);

const bundle = [...distFiles.keys()].find((key) => /assets\/index-.*\.js$/.test(key)) ?? '(未找到)';
console.log(`APK      : ${apk}`);
console.log(`网页构建 : ${distFiles.size} 个文件，入口 bundle ${bundle}`);
console.log(`APK 内嵌 : ${apkFiles.size} 个文件`);
if (missing.length) console.log(`缺少: ${missing.slice(0, 6).join(', ')}${missing.length > 6 ? ` …共 ${missing.length}` : ''}`);
if (extra.length) console.log(`多出: ${extra.slice(0, 6).join(', ')}${extra.length > 6 ? ` …共 ${extra.length}` : ''}`);
if (differing.length) console.log(`内容不同: ${differing.slice(0, 6).join(', ')}`);

if (missing.length || extra.length || differing.length) {
  console.error('\n❌ APK 与网页不一致');
  process.exit(1);
}
console.log('\n✅ APK 与网页逐文件一致（文件名 + 内容哈希全部相同）');
