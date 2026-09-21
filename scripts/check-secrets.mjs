/**
 * API 密钥 / 凭据泄露自检。
 *
 * 检查三处：
 *   1. 工作区所有被 git 跟踪的文件（git ls-files）
 *   2. git 历史（--all 的 pickaxe 搜索，覆盖已删除但仍在历史里的内容）
 *   3. 构建产物（dist/ 与 APK 内嵌资源）
 *
 * 输出**只显示命中前缀与长度**，绝不回显完整密钥。
 *
 * Usage: node scripts/check-secrets.mjs
 */
import { execFileSync } from 'node:child_process';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';

const PATTERNS = [
  { name: 'OpenAI/DeepSeek 风格密钥', re: /\bsk-[A-Za-z0-9_-]{16,}/g },
  { name: 'GitHub PAT (classic)', re: /\bghp_[A-Za-z0-9]{20,}/g },
  { name: 'GitHub OAuth token', re: /\bgho_[A-Za-z0-9]{20,}/g },
  { name: 'GitHub fine-grained PAT', re: /\bgithub_pat_[A-Za-z0-9_]{20,}/g },
  { name: 'Google API key', re: /\bAIza[0-9A-Za-z_-]{30,}/g },
  { name: 'AWS Access Key', re: /\bAKIA[0-9A-Z]{16}\b/g },
  { name: 'Slack token', re: /\bxox[baprs]-[A-Za-z0-9-]{10,}/g },
  { name: '私钥块', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g },
  { name: 'Bearer 授权头', re: /Authorization\s*[:=]\s*['"]?Bearer\s+[A-Za-z0-9._-]{16,}/gi },
  { name: '硬编码 password/secret/token 赋值', re: /\b(password|passwd|secret|api[_-]?key|access[_-]?token)\b\s*[:=]\s*['"][^'"\s]{8,}['"]/gi },
  // 邮箱要像真的：域名要有字母 TLD，且本地部分不能是纯大写关键词（避免 @media / @20..48 之类误报）
  { name: '邮箱地址', re: /(?<![A-Z])\b[a-z0-9._%+-]{2,}@(?:[a-z0-9-]+\.)+[a-z]{2,}\b/g },
  { name: '国内手机号', re: /\b1[3-9]\d{9}\b/g },
];

const ALLOW_EMAIL = new Set(['admin@example.com']); // 占位邮箱不算泄露

const redact = (value) => `${value.slice(0, 4)}…(${value.length} 字符)`;

function scan(text, label, hits) {
  for (const { name, re } of PATTERNS) {
    for (const match of text.matchAll(re)) {
      const value = match[0];
      if (name === '邮箱地址' && ALLOW_EMAIL.has(value)) continue;
      if (name === '硬编码 password/secret/token 赋值' && /(input|placeholder|example|demo|xxx|你的|示例)/i.test(value)) continue;
      hits.push({ label, name, sample: redact(value) });
    }
  }
}

/* ------------------------------------------------------------ 1) 工作区 */
const tracked = execFileSync('git', ['ls-files'], { encoding: 'utf8' }).split(/\r?\n/).filter(Boolean);
const hits = [];
const binaryExt = /\.(png|jpg|jpeg|gif|webp|woff2?|ttf|otf|apk|zip|ico|mp4|dex|jar)$/i;

for (const file of tracked) {
  if (binaryExt.test(file)) continue;
  const info = await stat(file).catch(() => null);
  if (!info || info.size > 2_000_000) continue;
  const text = await readFile(file, 'utf8').catch(() => '');
  if (text) scan(text, file, hits);
}

/* ------------------------------------------------------ 2) 构建产物 */
async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else out.push(full);
  }
  return out;
}
for (const file of await walk('dist')) {
  if (binaryExt.test(file)) continue;
  const text = await readFile(file, 'utf8').catch(() => '');
  if (text) scan(text, `dist: ${path.basename(file)}`, hits);
}

/* ---------------------------------------------------------- 3) 敏感文件 */
const SENSITIVE = /(^|\/)(\.env|\.env\..*|id_rsa|.*\.pem|.*\.key|.*\.jks|.*\.keystore|credentials.*|secrets?\.(json|ya?ml))$/i;
const sensitiveTracked = tracked.filter((file) => SENSITIVE.test(file));

/* -------------------------------------------------------------- 4) 历史 */
const HISTORY_PATTERNS = [
  { name: 'sk- 密钥（历史）', needle: 'sk-' },
  { name: 'ghp_/gho_ token（历史）', needle: 'ghp_' },
  { name: 'Google API key（历史）', needle: 'AIza' },
  { name: 'AWS key（历史）', needle: 'AKIA' },
  { name: '私钥块（历史）', needle: 'BEGIN RSA PRIVATE KEY' },
  { name: 'gmail 邮箱（历史）', needle: '@gmail.com' },
];
const history = [];
for (const { name, needle } of HISTORY_PATTERNS) {
  try {
    const out = execFileSync('git', ['log', '--all', '--oneline', '-S', needle], { encoding: 'utf8' })
      .split(/\r?\n/)
      .filter(Boolean);
    if (out.length) history.push({ name, commits: out.length, first: out[0] });
  } catch {
    /* 忽略 */
  }
}

/* -------------------------------------------------------------- 输出 */
console.log(`被跟踪文件：${tracked.length} 个；构建产物已扫描`);
console.log(`敏感文件名匹配：${sensitiveTracked.length ? sensitiveTracked.join(', ') : '无'}`);
console.log('');

if (!hits.length) {
  console.log('✅ 工作区与 dist/ 未发现密钥/凭据类内容');
} else {
  const grouped = new Map();
  for (const hit of hits) {
    const key = `${hit.name} @ ${hit.label}`;
    grouped.set(key, [...(grouped.get(key) ?? []), hit.sample]);
  }
  console.log(`⚠️ 命中 ${hits.length} 处（仅显示前缀）：`);
  for (const [key, samples] of grouped) console.log(`  - ${key} ×${samples.length}  例：${samples[0]}`);
}

console.log('');
if (!history.length) {
  console.log('✅ git 历史未命中密钥类特征串');
} else {
  console.log('⚠️ git 历史命中（说明曾经提交过，即使后来删除也仍在历史里）：');
  for (const item of history) console.log(`  - ${item.name}：${item.commits} 个提交，最早 ${item.first}`);
}
