#!/usr/bin/env node
/**
 * 前端安全守卫（本地代码审查的自动化部分）。
 *
 * 拦三类东西，因为它们在本项目里都曾是真实问题或真实风险：
 *   1. 注入面：`innerHTML` / `dangerouslySetInnerHTML` / `eval` / `new Function` / `document.write`。
 *      本项目会解析**用户导入的外部文件**（HTML 课表），把它的标记塞进 innerHTML 属于典型注入面。
 *   2. 密钥进 URL：`?key=` / `?token=` 这类查询参数会进浏览器历史、日志与 Referer。
 *   3. 明文 http 端点：请求体里带用户密钥与整张图片，公网走 http 等于明文广播（本机/局域网放行）。
 *
 * 注释里的词不算命中（先剥注释再匹配）；`http://localhost`、`10.x`、`192.168.x`、`172.16-31.x` 视为本机。
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const SCAN_DIRS = ['web/src'];
const EXTENSIONS = /\.(ts|tsx|js|jsx|mjs)$/;

const HARD = [
  { name: '注入面 innerHTML', re: /\binnerHTML\b/ },
  { name: '注入面 dangerouslySetInnerHTML', re: /dangerouslySetInnerHTML/ },
  { name: '注入面 eval', re: /(^|[^.\w$])eval\s*\(/ },
  { name: '注入面 new Function', re: /new\s+Function\s*\(/ },
  { name: '注入面 document.write', re: /document\.write\s*\(/ },
  { name: '密钥写进 URL', re: /[?&](api[_-]?key|key|token|access[_-]?token|secret)=/i },
];

const LOCAL_HOSTS = /^(localhost|127\.0\.0\.1|\[::1\]|::1|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/;
/** XML 命名空间不是网络端点（SVG 必带 http://www.w3.org/2000/svg），单独放行 */
const NAMESPACE_HOSTS = /^(www\.w3\.org|schemas\.android\.com|schemas\.microsoft\.com)\//;
const PLAINTEXT = /http:\/\/[^\s'"`)]+/g;

/** 粗暴但够用的注释剥离：字符串里的 `//` 会误伤，所以只用于"找可疑词"这一步。 */
function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (entry === 'node_modules' || entry === 'dist') continue;
      yield* walk(full);
    } else if (EXTENSIONS.test(entry)) {
      yield full;
    }
  }
}

const findings = [];
const warnings = [];

for (const dir of SCAN_DIRS) {
  for (const file of walk(join(root, dir))) {
    const rel = relative(root, file).replace(/\\/g, '/');
    const raw = readFileSync(file, 'utf8');
    const code = stripComments(raw);
    const lines = code.split(/\r?\n/);

    lines.forEach((line, index) => {
      for (const rule of HARD) {
        if (rule.re.test(line)) findings.push({ rule: rule.name, file: rel, line: index + 1, text: line.trim().slice(0, 96) });
      }
      for (const match of line.match(PLAINTEXT) ?? []) {
        const host = match.replace(/^http:\/\//, '');
        if (LOCAL_HOSTS.test(host) || NAMESPACE_HOSTS.test(host)) continue;
        warnings.push({ file: rel, line: index + 1, url: match.slice(0, 72) });
      }
    });
  }
}

console.log('前端安全守卫：web/src 下的注入面 / 密钥进 URL / 明文 http');
console.log('');

if (findings.length) {
  console.log(`❌ 命中 ${findings.length} 处（必须处理）:`);
  for (const f of findings) console.log(`  - [${f.rule}] ${f.file}:${f.line}  ${f.text}`);
} else {
  console.log('✅ 注入面与密钥进 URL：0 处');
}

if (warnings.length) {
  console.log('');
  console.log(`⚠️ 明文 http 端点 ${warnings.length} 处（公网地址必须换 https；本机/局域网会被自动放行）:`);
  for (const w of warnings) console.log(`  - ${w.file}:${w.line}  ${w.url}`);
} else {
  console.log('✅ 明文 http 端点：0 处');
}

console.log('');
console.log(`清单：注入面 ${findings.filter((f) => f.rule.startsWith('注入面')).length} 处、密钥进 URL ${findings.filter((f) => !f.rule.startsWith('注入面')).length} 处、明文 http ${warnings.length} 处`);
process.exit(findings.length ? 1 : 0);
