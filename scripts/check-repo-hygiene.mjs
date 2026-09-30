/**
 * 仓库卫生检查：安装包与压缩包不允许进仓库。
 *
 * 为什么：APK / web zip 是**发布物**，只作为 GitHub Release 附件存在。
 * 以前把 enhance*.apk 提交进主仓库，导致 .git 体积涨到 100MB+，而且 Pages 上
 * 会留下一个个历史安装包；这个脚本把它们挡在门外（.gitignore 只防手滑，
 * 这里防 `git add -f` 与别人 PR 里塞进来的二进制）。
 *
 * 用法：node scripts/check-repo-hygiene.mjs
 *   命中禁止的扩展名 → exit 1（守卫会红）
 *   顺带列出被跟踪的大文件（> 2MB），只提示不失败
 */
import { execFileSync } from 'node:child_process';
import { statSync } from 'node:fs';

const FORBIDDEN = /\.(apk|aab|zip|7z|tar|gz|rar|jks|keystore|so|dll|dylib|exe|msi|dmg)$/i;
const BIG_BYTES = 2 * 1024 * 1024;

let tracked = [];
try {
  tracked = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    .split('\0')
    .filter(Boolean);
} catch (error) {
  console.error('✖ 读取 git 索引失败（需要在 git 仓库里运行）：' + (error.message || error));
  process.exit(2);
}

const forbidden = [];
const big = [];
for (const file of tracked) {
  if (FORBIDDEN.test(file)) {
    forbidden.push(file);
    continue;
  }
  try {
    const size = statSync(file).size;
    if (size > BIG_BYTES) big.push({ file, mb: (size / 1024 / 1024).toFixed(2) });
  } catch {
    /* 索引里有、工作区没有（例如刚 git rm --cached）——不算问题 */
  }
}

console.log(`扫描 ${tracked.length} 个被跟踪文件`);

if (big.length) {
  console.log('\n⚠ 大文件（> 2MB，仅提示，不失败）：');
  for (const entry of big) console.log(`   ${entry.mb} MB  ${entry.file}`);
}

if (forbidden.length) {
  console.error('\n✖ 仓库里不允许出现安装包 / 压缩包（它们是 Release 附件，不是源码）：');
  for (const file of forbidden) console.error(`   ${file}`);
  console.error('\n   处理：git rm --cached <file>，然后作为 Release 附件上传：');
  console.error('   node scripts/github-release.mjs --tag vX.Y.Z --asset "enhance.apk=build/release/enhance-X.Y.Z.apk"');
  process.exit(1);
}

console.log('✅ 卫生检查通过：没有被跟踪的安装包 / 压缩包');
if (!big.length) console.log('   也没有超过 2MB 的被跟踪文件');
