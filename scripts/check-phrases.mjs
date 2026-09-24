/**
 * 守卫：预制语料常驻通知（通知栏桌宠）的**可判定部分**。
 *
 * 需求书：`docs/notification-phrases.md`（豆包）+ 作者在群里补的两条
 * （展示语料后必须还原基础状态；实时通知上也要有「戳一下」）。
 *
 * 这个功能大部分只能在真机上看（通知栏渲染、后台剪贴板、前台服务存活），
 * 但**下面这些是机器能判死的**，而且正是最容易在后续改动里被顺手改坏的部分：
 *
 *   ① 静态契约：manifest 里的服务声明 / 权限 / 前台服务类型；Kotlin 与 native.ts
 *      两端的桥方法成对存在；通知渠道与 id 与实况通知**不撞车**；路由在四个地方都注册了；
 *   ② 纯逻辑（用 esbuild 直接跑 `web/src/lib/phrases.ts`）：清洗、增删、默认集、
 *      轮播（随机/顺序）、间隔钳制、波动范围、**状态机还原规则**；
 *   ③ 默认语料必须是**自制**的（参考 App 的台词是第三方内容，不能抄）。
 *
 * 用法：node scripts/check-phrases.mjs
 */
import { build } from 'esbuild';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

let pass = 0;
let fail = 0;
const check = (label, ok, detail = '') => {
  if (ok) pass += 1;
  else fail += 1;
  console.log(`  ${ok ? '✓' : '✗'} ${label}${ok || !detail ? '' : ` —— ${detail}`}`);
};
const eq = (label, actual, expected) =>
  check(label, JSON.stringify(actual) === JSON.stringify(expected), `期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}`);

const read = (file) => readFile(file, 'utf8');

/* ------------------------------------------------------------- ① 静态契约 -- */

console.log('=== manifest：前台服务声明 / 权限 / 类型 ===');
const manifest = await read('app/src/main/AndroidManifest.xml');
check('声明了 .PhraseService', /<service[\s\S]*android:name="\.PhraseService"/.test(manifest));
check('服务 exported=false（不允许外部拉起）', /android:name="\.PhraseService"[\s\S]{0,200}?android:exported="false"/.test(manifest));
check('foregroundServiceType=specialUse', /android:name="\.PhraseService"[\s\S]{0,200}?android:foregroundServiceType="specialUse"/.test(manifest));
check('有 FOREGROUND_SERVICE 权限', manifest.includes('android.permission.FOREGROUND_SERVICE"'));
check('有 FOREGROUND_SERVICE_SPECIAL_USE 权限', manifest.includes('android.permission.FOREGROUND_SERVICE_SPECIAL_USE'));
check('声明了 specialUse 子类型 property', manifest.includes('PROPERTY_SPECIAL_USE_FGS_SUBTYPE'));

console.log('\n=== 渠道 / 通知 id 不与实况通知撞车（任务书 §2.1）===');
const serviceKt = await read('app/src/main/java/com/app/m3expressive/PhraseService.kt');
const liveKt = await read('app/src/main/java/com/app/m3expressive/LiveUpdates.kt');
const phraseChannel = /const val CHANNEL_ID = "([^"]+)"/.exec(serviceKt)?.[1] ?? '';
const liveChannel = /const val CHANNEL_ID = "([^"]+)"/.exec(liveKt)?.[1] ?? '';
check(`渠道不同（${phraseChannel} ≠ ${liveChannel}）`, Boolean(phraseChannel) && phraseChannel !== liveChannel);
const phraseId = Number(/const val NOTIFICATION_ID = (\d+)/.exec(serviceKt)?.[1] ?? 0);
const liveId = Number(/const val NOTIFICATION_ID = (\d+)/.exec(liveKt)?.[1] ?? 0);
check(`通知 id 不同（${phraseId} ≠ ${liveId}）`, phraseId > 0 && phraseId !== liveId);
check('常驻通知 setOngoing(true)', serviceKt.includes('setOngoing(true)'));
check('常驻通知 setOnlyAlertOnce(true)', serviceKt.includes('setOnlyAlertOnce(true)'));
/* 通知栏里的动作：**作者在真机上删繁就简**，最终只留一颗「戳一下」——
   不要「语料」列表、也不要「管理」入口（点通知主体打开应用即可）。
   这里同时断言"必须有"和"必须没有"，缺一半都挡不住回归。 */
const actionLines = serviceKt
  .split('\n')
  .map((line) => line.trim())
  .filter((line) => line.includes('addAction('));
check('通知栏只有一颗动作按钮', actionLines.length === 1, `实际 ${actionLines.length} 颗：${actionLines.join(' | ')}`);
check(
  '那颗按钮是「戳一下」且不跳 Activity',
  Boolean(actionLines[0]?.includes('"戳一下"')) && Boolean(actionLines[0]?.includes('pokeIntent(')),
  actionLines[0] ?? '（没找到 addAction）',
);
check('不再有「语料」列表动作（作者要求）', !serviceKt.includes('"语料"'));
check('不再有「管理」入口动作（作者要求）', !serviceKt.includes('"管理"') && !serviceKt.includes('manageIntent'));
check('给 BigTextStyle → 通知默认展开显示（作者要求）', serviceKt.includes('BigTextStyle'));
check('前台服务启动用 startForeground', serviceKt.includes('ServiceCompat.startForeground'));
check('自动播放用 setAndAllowWhileIdle（Doze 下也能醒）', serviceKt.includes('setAndAllowWhileIdle'));

console.log('\n=== 实时通知上也有「戳一下」（作者补充要求）===');
check('LiveUpdates 里加了「戳一下」动作', liveKt.includes('"戳一下"') && liveKt.includes('PhraseService.ACTION_POKE'));

console.log('\n=== 桥方法两端成对存在 ===');
const bridgeNames = [
  'startPhraseService',
  'stopPhraseService',
  'phrasesConfig',
  'phrasesStatus',
  'phrasePoke',
  'setPhraseBaseState',
];
const mainKt = await read('app/src/main/java/com/app/m3expressive/MainActivity.kt');
const nativeTs = await read('web/src/lib/native.ts');
for (const name of bridgeNames) {
  const inKotlin = new RegExp(`fun ${name}\\(`).test(mainKt);
  const inWeb = nativeTs.includes(`api?.${name}`) || nativeTs.includes(`api.${name}`);
  check(`${name}：Kotlin + native.ts 都在`, inKotlin && inWeb, `Kotlin=${inKotlin} web=${inWeb}`);
}

console.log('\n=== 路由／页面四处都注册了 ===');
const navTs = await read('web/src/nav/navigation.tsx');
const appTs = await read('web/src/App.tsx');
const settingsTs = await read('web/src/screens/SettingsScreen.tsx');
check('navigation.tsx 有 phraseManager 路由', navTs.includes("'phraseManager'"));
check('App.tsx 的 SCREENS 映射有 phraseManager', /phraseManager:\s*PhraseManagerScreen/.test(appTs));
check('App.tsx 的 tabForRoute 把 phraseManager 归到 settings', /phraseManager'\s*\)\s*\{?[\s\S]{0,120}return 'settings'/.test(appTs));
check('SettingsScreen 有入口', settingsTs.includes("push('phraseManager'"));

/* ------------------------------------------------------------- ② 纯逻辑 -- */

const dir = await mkdtemp(path.join(tmpdir(), 'duofen-phrases-'));
const bundle = path.join(dir, 'phrases.mjs');
await build({
  entryPoints: ['web/src/lib/phrases.ts'],
  bundle: true,
  format: 'esm',
  outfile: bundle,
  platform: 'neutral',
  logLevel: 'silent',
});
const P = await import(`file://${bundle}`);

console.log('\n=== 清洗 / 增删 / 默认集 ===');
eq('去空白 + 去空串 + 去重', P.normalizePhrases([' a ', '', 'a', 'b']), ['a', 'b']);
check(`默认语料 ≥ 6 条（实际 ${P.PHRASE_DEFAULTS.length}）`, P.PHRASE_DEFAULTS.length >= 6);
check('默认语料没有空串', P.PHRASE_DEFAULTS.every((text) => text.trim().length > 0));
check('默认语料没有重复', new Set(P.PHRASE_DEFAULTS).size === P.PHRASE_DEFAULTS.length);

// 第三方内容（参考 App「小鲸鱼」的台词）一个都不许出现在默认集里
const THIRD_PARTY = ['毛线球', '主人', '鲸', '铲屎', '撸我', '彩礼', '打老婆'];
const leaked = P.PHRASE_DEFAULTS.filter((text) => THIRD_PARTY.some((word) => text.includes(word)));
check('默认语料是自制的（不含参考 App 的台词）', leaked.length === 0, `泄漏：${leaked.join(' / ')}`);

const base = { ...P.DEFAULT_PHRASE_CONFIG, phrases: ['甲', '乙'] };
eq('添加一条', P.addPhrase(base, '丙').phrases, ['甲', '乙', '丙']);
eq('添加重复的不生效', P.addPhrase(base, '甲').phrases, ['甲', '乙']);
eq('删除第 0 条', P.removePhrase(base, 0).phrases, ['乙']);
eq('删除越界下标不动', P.removePhrase(base, 9).phrases, ['甲', '乙']);
eq('恢复默认 = 内置集', P.restoreDefaultPhrases({ ...base, phrases: [] }).phrases, P.PHRASE_DEFAULTS);

console.log('\n=== 边界钳制 ===');
eq('间隔下限 1 分钟', P.clampInterval(0), 1);
eq('间隔上限 120 分钟', P.clampInterval(9999), 120);
eq('间隔非法值回落默认', P.clampInterval(Number.NaN), P.DEFAULT_PHRASE_CONFIG.intervalMin);
eq('波动下限 0', P.clampFluctuation(-5), 0);
eq('波动上限 100', P.clampFluctuation(250), 100);
eq('坏配置整体回落默认', P.loadPhraseConfig(null), P.DEFAULT_PHRASE_CONFIG);
eq('坏配置里的越界间隔被钳住', P.loadPhraseConfig({ intervalMin: 999 }).intervalMin, 120);
eq('坏配置里的模式回落 random', P.loadPhraseConfig({ mode: 'weird' }).mode, 'random');
check('空列表是合法状态（不塞回默认集）', P.loadPhraseConfig({ phrases: [] }).phrases.length === 0);

console.log('\n=== 轮播：顺序循环 / 随机不撞上一条 ===');
const seq = { phrases: ['甲', '乙', '丙'], mode: 'sequential' };
eq('顺序：0→1', P.nextPhraseIndex(seq, 0), 1);
eq('顺序：末位回到 0', P.nextPhraseIndex(seq, 2), 0);
const rand = { phrases: ['甲', '乙', '丙'], mode: 'random' };
eq('随机命中第 0 条（rng=0）', P.nextPhraseIndex(rand, 2, () => 0), 0);
eq('随机撞上上一条时顺延（rng=0 且 cursor=0）', P.nextPhraseIndex(rand, 0, () => 0), 1);
eq('单条列表 → 恒为 0', P.nextPhraseIndex({ phrases: ['甲'], mode: 'random' }, 0, () => 0.9), 0);
eq('空列表 → -1', P.nextPhraseIndex({ phrases: [], mode: 'random' }, 0), -1);

console.log('\n=== 间隔与波动 ===');
eq('波动 0% = 精确间隔', P.effectiveIntervalMs({ intervalMin: 5, fluctuationPct: 0 }), 5 * 60_000);
eq('波动 50% 且 rng=0 → 下限（0.5×）', P.effectiveIntervalMs({ intervalMin: 10, fluctuationPct: 50 }, () => 0), 5 * 60_000);
check(
  '波动 50% 且 rng≈1 → 上限（1.5×，允许 1ms 取整误差）',
  Math.abs(P.effectiveIntervalMs({ intervalMin: 10, fluctuationPct: 50 }, () => 0.999999) - 15 * 60_000) <= 1,
  String(P.effectiveIntervalMs({ intervalMin: 10, fluctuationPct: 50 }, () => 0.999999)),
);
eq('波动 100% 且 rng=0.5 → 原间隔', P.effectiveIntervalMs({ intervalMin: 10, fluctuationPct: 100 }, () => 0.5), 10 * 60_000);

console.log('\n=== 状态机：语料展示后必须还原基础状态（作者点名要求）===');
eq('空闲文案', P.baseStateText({ kind: 'idle' }), '多分课表正在后台运行');
eq('导航中文案', P.baseStateText({ kind: 'navigating', destination: '16栋203' }), '导航到16栋203');
eq('导航目的地为空时兜底', P.baseStateText({ kind: 'navigating', destination: '  ' }), '导航中');

let state = P.initialPhraseState();
state = P.reducePhraseState(state, { type: 'base', state: { kind: 'navigating', destination: '16栋203' } });
const showingState = P.reducePhraseState(state, { type: 'show', text: '该上课啦～别忘了带课本' });
eq('展示语料时正文 = 语料', P.notificationText(showingState), '该上课啦～别忘了带课本');
eq('展示语料**不修改** base', showingState.base, { kind: 'navigating', destination: '16栋203' });
const restored = P.reducePhraseState(showingState, { type: 'restore' });
eq('还原后正文 = 基础状态（导航中）', P.notificationText(restored), '导航到16栋203');

let idleState = P.reducePhraseState(P.initialPhraseState(), { type: 'show', text: '今天也要好好听课呀' });
idleState = P.reducePhraseState(idleState, { type: 'restore' });
eq('空闲状态下展示后还原', P.notificationText(idleState), '多分课表正在后台运行');

// 穷举一串动作，验证不变式：show/restore 期间 base 恒定
const actions = [
  { type: 'show', text: 'A' },
  { type: 'restore' },
  { type: 'base', state: { kind: 'navigating', destination: 'X' } },
  { type: 'show', text: 'B' },
  { type: 'show', text: 'C' },
  { type: 'restore' },
];
let walk = P.initialPhraseState();
let baseChangedByPhrase = false;
for (const action of actions) {
  const before = JSON.stringify(walk.base);
  walk = P.reducePhraseState(walk, action);
  if (action.type !== 'base' && JSON.stringify(walk.base) !== before) baseChangedByPhrase = true;
}
check('6 步动作序列里 base 只被 base 动作改过', !baseChangedByPhrase);
eq('末态 = 最后一次 base 的文案', P.notificationText(walk), '导航到X');

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
