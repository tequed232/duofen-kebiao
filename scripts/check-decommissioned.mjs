/**
 * 「停用子系统」残留检查：一个子系统一旦决定下线，就不允许它的代码再悄悄回来。
 *
 * 为什么需要它：本仓库踩过多次「半截回滚」—— 原生 Dock 在真机上「可见但点击无反应」
 * 被停用，宿主里 addView 与 `--native-dock` 注入都删了，却留下：
 *   · 整个 NativeDock.kt（221 行，从未被实例化）
 *   · MainActivity 里恒为 null 的 dock 字段与空操作 dockActive 桥
 *   · 网页侧无人消费的 DuofenDock 接口、nativeDockActive() 同步
 * 见 docs/PROJECT-STATE.md「易踩的坑」第 10 条。这类残留「看起来还在工作」，
 * 编译也不会报错，只能靠守卫长期兜住。
 *
 * 用法：node scripts/check-decommissioned.mjs
 *   命中已下线子系统的文件 / 符号 → exit 1（CI 会红）
 *
 * 新增下线子系统时，在下方 REMOVED 清单里加一条声明即可。
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

/**
 * 已下线子系统清单。
 * @typedef {Object} RemovedSubsystem
 * @property {string} name                子系统名（用于报告）
 * @property {RegExp[]} [forbidPaths]     命中即失败的「被跟踪路径」
 * @property {RegExp[]} [forbidTokens]    在 scanRoots 下的文件内容里命中即失败
 * @property {string[]} [scanRoots]       内容扫描的路径前缀（默认 app/ web/，不扫 docs —— 文档允许记录历史）
 * @type {RemovedSubsystem[]}
 */
const REMOVED = [
  {
    name: 'native-dock（原生底栏，2026-09 真机回滚）',
    scanRoots: ['app/', 'web/'],
    forbidPaths: [/NativeDock\.kt$/],
    forbidTokens: [
      /NativeDock/, // 类名 / 类型引用
      /dockactive/i, // dockActive 桥、nativeDockActive() 同步（含各种大小写）
      /DuofenDock/, // 网页暴露给原生底栏的回调接口
      /--native-dock/, // 给原生底栏预留高度的 CSS 变量（含注入与读取）
    ],
  },
];

let tracked = [];
try {
  tracked = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    .split('\0')
    .filter(Boolean);
} catch (error) {
  console.error('✖ 读取 git 索引失败（需要在 git 仓库里运行）：' + (error.message || error));
  process.exit(2);
}

/** @type {{file:string, name:string, hits:string[]}[]} */
const failures = [];

for (const sub of REMOVED) {
  const roots = sub.scanRoots ?? ['app/', 'web/'];

  // ① 路径级检查（对全部被跟踪文件）
  for (const file of tracked) {
    for (const re of sub.forbidPaths ?? []) {
      if (re.test(file)) {
        failures.push({ file, name: sub.name, hits: [`路径匹配 ${re}`] });
      }
    }
  }

  // ② 内容级检查（只扫 scanRoots 下的文本文件）
  const inScope = tracked.filter((file) => roots.some((root) => file.replace(/\\/g, '/').startsWith(root)));
  for (const file of inScope) {
    let content;
    try {
      content = readFileSync(file, 'utf8');
    } catch {
      continue; // 索引里有、工作区没有 —— 交给卫生/其它检查
    }
    const hits = [];
    for (const re of sub.forbidTokens ?? []) {
      if (re.test(content)) hits.push(`符号 ${re}`);
    }
    if (hits.length) failures.push({ file, name: sub.name, hits });
  }
}

console.log(`扫描 ${tracked.length} 个被跟踪文件，核对 ${REMOVED.length} 个已下线子系统`);

if (failures.length) {
  console.error('\n✖ 发现已下线子系统的残留（半截回滚）：');
  for (const f of failures) {
    console.error(`   [${f.name}] ${f.file}`);
    for (const h of f.hits) console.error(`       - ${h}`);
  }
  console.error('\n   该子系统已决定停用，请连同宿主注入 / 数据产物 / 接口 / 文档记载一起清干净；');
  console.error('   若确要重新启用，请先人工确认并从本守卫的 REMOVED 清单里移除对应声明。');
  process.exit(1);
}

console.log('✅ 已下线子系统无残留：没有文件 / 符号被重新引入');
