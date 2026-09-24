/**
 * 校验「APK 与网页一致」（硬要求）：
 * 直接读 APK（zip）里 assets/www 下的每个文件，与 dist/ 逐个比对
 * （文件名 + 内容 sha256），任何不一致就失败，避免再出现「APK 和网页对不上」。
 *
 * Usage: node scripts/check-apk-parity.mjs [apkPath]
 */
import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';
import path from 'node:path';

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

/** 直接读 APK（zip）里 `assets/www/` 下的文件哈希 —— **纯 Node，不依赖 PowerShell**。
 *
 * 为什么不能用 PowerShell：这条守卫现在跑在 CI 的 **ubuntu** runner 上，
 * 而它原先 `execFileSync('powershell', …)` —— 那里根本没有 `powershell`，
 * 于是接进 CI 的第一次运行就 ENOENT 失败（Android build #200 的第 10 步）。
 * 自己解析 zip 的中央目录即可跨平台，也不需要把 58 MB 的 ocr 解压到磁盘。
 *
 * 只支持 ZIP64 以外的常规条目 —— 本仓库的 APK 约 25 MB / 180 余条目，远在限制之内；
 * 真遇到 ZIP64 会明确报出来而不是给出错误结论。
 */
function readApkHashes(apkPath) {
  const buf = readFileSync(apkPath);
  const EOCD = 0x06054b50;
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 22 - 0xffff; i -= 1) {
    if (buf.readUInt32LE(i) === EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('不是有效的 zip：找不到 EOCD');
  const count = buf.readUInt16LE(eocd + 10);
  const cdOffset = buf.readUInt32LE(eocd + 16);
  if (count === 0xffff || cdOffset === 0xffffffff) throw new Error('该 zip 使用了 ZIP64，本脚本未支持');

  const out = new Map();
  let p = cdOffset;
  for (let i = 0; i < count; i += 1) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error(`中央目录第 ${i} 项签名不对`);
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    p += 46 + nameLen + extraLen + commentLen;

    if (!name.startsWith('assets/www/')) continue;
    if (buf.readUInt32LE(localOffset) !== 0x04034b50) throw new Error(`${name}: 本地头签名不对`);
    const lNameLen = buf.readUInt16LE(localOffset + 26);
    const lExtraLen = buf.readUInt16LE(localOffset + 28);
    const start = localOffset + 30 + lNameLen + lExtraLen;
    const data = buf.subarray(start, start + compSize);
    // 0 = stored，8 = deflate；安卓打包用 deflate
    const content = method === 0 ? data : inflateRawSync(data);
    out.set(name.slice('assets/www/'.length), short(content));
  }
  return out;
}

/**
 * APK 里**有意**比网页产物多出来的那部分：打进安装包的本地识别资源。
 *
 * 为什么会有差：`vite.config.ts` 的 `stripLocalOcrFromDist` 在构建收尾把 `dist/ocr` 删掉，
 * 好让网页产物维持 2.1 MB（识别资源约 58 MB，网页版需要时开发者跑 `npm run setup:ocr` 自取）；
 * 而 APK 侧由 `app/build.gradle.kts` 的 `syncOcrAssets` 把它们塞进 `assets/www/ocr`。
 * 所以「APK 比 dist 多出 ocr/」是**设计如此**，不是不一致。
 *
 * 但不能因此把多出来的一律放过 —— 只认这一个前缀，其它任何多出来的文件仍然报不一致，
 * 否则这条守约会退化成"永远绿"。这正是它此前一直红的原因：多出的 22 个 ocr 文件
 * 被当成不一致，于是「只要有识别资源的 APK 就必然失败」。
 */
const APK_ONLY_PREFIX = 'ocr/';

const apkFiles = readApkHashes(apk);
const distFiles = await walk(distDir);
const missing = [...distFiles.keys()].filter((key) => !apkFiles.has(key));
const extrasRaw = [...apkFiles.keys()].filter((key) => !distFiles.has(key));
const deliberate = extrasRaw.filter((key) => key.startsWith(APK_ONLY_PREFIX));
const extra = extrasRaw.filter((key) => !key.startsWith(APK_ONLY_PREFIX));
const differing = [...distFiles.keys()].filter(
  (key) => apkFiles.has(key) && apkFiles.get(key) !== distFiles.get(key),
);

const bundle = [...distFiles.keys()].find((key) => /assets\/index-.*\.js$/.test(key)) ?? '(未找到)';
console.log(`APK      : ${apk}`);
console.log(`网页构建 : ${distFiles.size} 个文件，入口 bundle ${bundle}`);
console.log(`APK 内嵌 : ${apkFiles.size} 个文件`);
console.log(
  `有意多出 : ${deliberate.length} 个（${APK_ONLY_PREFIX}，打进 APK 的本地识别资源，网页产物按设计不含）`,
);
if (missing.length) console.log(`缺少: ${missing.slice(0, 6).join(', ')}${missing.length > 6 ? ` …共 ${missing.length}` : ''}`);
if (extra.length) console.log(`多出（非预期）: ${extra.slice(0, 6).join(', ')}${extra.length > 6 ? ` …共 ${extra.length}` : ''}`);
if (differing.length) console.log(`内容不同: ${differing.slice(0, 6).join(', ')}`);

if (missing.length || extra.length || differing.length) {
  console.error('\n❌ APK 与网页不一致');
  process.exit(1);
}
console.log(
  `\n✅ 网页产物的 ${distFiles.size} 个文件在 APK 里逐文件一致（文件名 + 内容哈希全部相同）` +
    `，另有 ${deliberate.length} 个 ${APK_ONLY_PREFIX} 资源按设计只进 APK`,
);
