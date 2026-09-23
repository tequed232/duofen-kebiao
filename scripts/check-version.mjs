/**
 * Guard: 版本号只能有一个来源，且各处必须一致。
 *
 * 唯一来源是 web/src/lib/meta.ts 的 APP_VERSION；APK 的 versionName/versionCode 由
 * app/build.gradle.kts 的 webVersion() 从它解析。这里再挡住另外两处容易忘记同步的地方：
 * package.json 的 version、RELEASE_NOTES.md 最新一条的版本。
 *
 * Usage: node scripts/check-version.mjs
 */
import { readFile } from 'node:fs/promises';

const fail = (message) => {
  console.error(`❌ ${message}`);
  process.exit(1);
};

const meta = await readFile('web/src/lib/meta.ts', 'utf8');
const match = meta.match(/APP_VERSION\s*=\s*'v?([0-9]+\.[0-9]+\.[0-9]+)'/);
if (!match) fail('web/src/lib/meta.ts 里找不到 APP_VERSION，它应当是版本号的唯一来源');
const version = match[1];

const pkg = JSON.parse(await readFile('package.json', 'utf8'));
if (pkg.version !== version) {
  fail(`package.json 的 version 是 ${pkg.version}，与 APP_VERSION ${version} 不一致（请同步为 ${version}）`);
}

const notes = await readFile('RELEASE_NOTES.md', 'utf8');
const latest = notes.match(/^##\s+.*?v([0-9]+\.[0-9]+\.[0-9]+)/m);
if (!latest) fail('RELEASE_NOTES.md 里找不到版本标题');
if (latest[1] !== version) {
  fail(`RELEASE_NOTES.md 最新一条是 v${latest[1]}，与 APP_VERSION ${version} 不一致`);
}

// APK 的 versionCode 推导规则必须与 app/build.gradle.kts 的 webVersion() 保持一致
const [major, minor, patch] = version.split('.').map(Number);
const code = major * 10000 + minor * 100 + patch;
const gradle = await readFile('app/build.gradle.kts', 'utf8');
if (!/major\.toInt\(\) \* 10000 \+ minor\.toInt\(\) \* 100 \+ patch\.toInt\(\)/.test(gradle)) {
  fail('app/build.gradle.kts 的 versionCode 推导规则变了，请同步本脚本的预期');
}

console.log(`✅ 版本号一致：v${version}（versionCode ${code}）— meta.ts / package.json / RELEASE_NOTES.md`);
