/**
 * 守卫：底栏**扭曲（透镜折射）档位**的契约。
 *
 * 为什么要有它：作者 2026-09-25 的原话是「要有扭曲效果，就是 Gemini 做的那一版」——
 * 而"扭曲"这件事在本仓库被**改小过三次**（`507e204` 减配、`7973ced` 六项整改），
 * 每一次都只动 `lens.ts` 里几个数：页面照常渲染、不报任何错，真机上就是"看不出来"。
 * 色散那次判断失手（删掉的其实是"分布"而不是色散本身）已经写进
 * `docs/liquidglass-ultimate.md`，这条守卫把结论钉住：**几何与颜色必须分轴，且两档都要在。**
 *
 * 判定方式：读源码文本 + 读设置项声明，不依赖浏览器：
 *   ① three 档（厚透镜 / 收窄 / 关）在类型里、在设置项里、在设置页 UI 里都齐；
 *   ② 厚透镜那组数值必须真的"更厚更狠"（bezel / strength / backdropMax 都大于收窄档），
 *      并且和 `6aeae6d` 那版口径一致（0.85 / 1.6 / 26）；
 *   ③ 几何与颜色**分轴**：色散档只能改 fringe / bands，不许再回头去改 bezel 那些几何参数
 *      （上一次"色散没了"就是把两者揉在一个常量里，为了压色散把位移删了）；
 *   ④ dock 真的把设置项接上了（`dockLensParams(…, effectiveWarp(settings.dockWarp))`），
 *      并且留了 `?warp=` 白名单覆盖给量测脚本用。
 *
 * 用法：node scripts/check-dock-warp.mjs
 */
import { readFile } from 'node:fs/promises';

const LENS = 'web/src/lib/lens.ts';
const TYPES = 'web/src/lib/types.ts';
const LAYOUT = 'web/src/components/layout.tsx';
const SCREEN = 'web/src/screens/SettingsScreen.tsx';

let pass = 0;
let fail = 0;
const check = (label, ok, detail = '') => {
  if (ok) pass += 1;
  else fail += 1;
  console.log(`  ${ok ? '✓' : '✗'} ${label}${ok || !detail ? '' : ` —— ${detail}`}`);
};

const lens = await readFile(LENS, 'utf8');
const types = await readFile(TYPES, 'utf8');
const layout = await readFile(LAYOUT, 'utf8');
const screen = await readFile(SCREEN, 'utf8');

const num = (block, field) => {
  const hit = new RegExp(`${field}\\s*:\\s*([0-9.]+)`).exec(block);
  return hit ? Number(hit[1]) : NaN;
};
const blockOf = (name) => {
  const start = lens.indexOf(`export const ${name}`);
  if (start < 0) return '';
  const end = lens.indexOf('} as const', start);
  return end < 0 ? '' : lens.slice(start, end);
};

console.log('=== 一、三个档位在类型 / 设置项 / UI 三处都齐 ===');
check('lens.ts 声明 DockWarp 三档', /export type DockWarp = 'off' \| 'concise' \| 'thick'/.test(lens), '缺少 DockWarp 类型');
check('types.ts 有 dockWarp 字段且三档一致', /dockWarp:\s*'off'\s*\|\s*'concise'\s*\|\s*'thick'/.test(types), 'AppSettings 里没有 dockWarp');
check('默认档是厚透镜（作者要的"有扭曲效果"）', /dockWarp:\s*'thick'/.test(types), 'DEFAULT_SETTINGS.dockWarp 不是 thick');
check('设置页有「底栏扭曲」条目', /底栏扭曲/.test(screen), '设置页找不到这条');
for (const value of ['thick', 'concise', 'off']) {
  check(`设置页弹层里有 ${value} 选项`, new RegExp(`\\['${value}'`).test(screen), '弹层缺这一档');
}
check('设置页弹层的选项与 setting 联动', /settings\.dockWarp === value/.test(screen), '选项没有回显当前档位');

console.log('\n=== 二、厚透镜那组数值真的"更厚更狠"（对齐 6aeae6d）===');
const thick = blockOf('DOCK_WARP_THICK');
const concise = blockOf('DOCK_WARP_CONCISE');
check('两档几何常量都存在', Boolean(thick) && Boolean(concise), `thick=${thick.length} 字节 concise=${concise.length} 字节`);
const t = { bezel: num(thick, 'bezel'), strength: num(thick, 'strength'), backdropMax: num(thick, 'backdropMax'), falloff: num(thick, 'falloff') };
const c = { bezel: num(concise, 'bezel'), strength: num(concise, 'strength'), backdropMax: num(concise, 'backdropMax'), falloff: num(concise, 'falloff') };
check(
  `厚透镜 bezel > 收窄（${t.bezel} > ${c.bezel}）`,
  Number.isFinite(t.bezel) && Number.isFinite(c.bezel) && t.bezel > c.bezel,
  'bezel 没有真的变厚 —— 真机上就是"看不出来"',
);
check(
  `厚透镜 strength > 收窄（${t.strength} > ${c.strength}）`,
  Number.isFinite(t.strength) && Number.isFinite(c.strength) && t.strength > c.strength,
  'strength 没有真的变强',
);
check(
  `厚透镜 backdrop 位移封顶 > 收窄（${t.backdropMax} > ${c.backdropMax}）`,
  Number.isFinite(t.backdropMax) && Number.isFinite(c.backdropMax) && t.backdropMax > c.backdropMax,
  '真实背景的位移封顶没有放开',
);
check(
  '厚透镜 = 6aeae6d 那版口径（0.85 / 1.6 / 26）',
  t.bezel === 0.85 && t.strength === 1.6 && t.backdropMax === 26,
  `实际 ${t.bezel} / ${t.strength} / ${t.backdropMax}`,
);
check(
  '两档 falloff 都用 3（分布仍收在边缘，不回到"整块在扭"）',
  t.falloff === 3 && c.falloff === 3,
  `thick=${t.falloff} concise=${c.falloff}`,
);

console.log('\n=== 三、几何与颜色分轴（防"为了压色散把位移删了"重演）===');
const params = lens.slice(lens.indexOf('export function dockLensParams'));
check('dockLensParams 同时收 dispersion 与 warp 两个参数', /dockLensParams\(\s*mode[^)]*warp/.test(params), '签名里没有 warp');
check(
  '色散档只决定 fringe / bands',
  /const color[\s\S]{0,200}fringe[\s\S]{0,200}bands/.test(params) && !/bezel\s*:/.test(lens.slice(lens.indexOf("mode === 'ultimate'"), lens.indexOf('export function dockLensParams'))),
  '色散分支里又出现了几何参数',
);
check(
  '厚透镜档不改色散（fringe/bands 来自设置档）',
  !/fringe\s*:/.test(thick),
  'DOCK_WARP_THICK 里出现了 fringe —— 几何不该管颜色',
);
check('「关」档把强度与位移封顶一起归零', /strength:\s*0[\s\S]{0,80}backdropFactor:\s*0/.test(params), '关档没有真的关掉位移');

console.log('\n=== 四、dock 接上了设置项，并留了量测用的白名单覆盖 ===');
check(
  'layout.tsx 用 effectiveWarp(settings.dockWarp)',
  /effectiveWarp\(settings\.dockWarp\)/.test(layout),
  'dock 没接上扭曲档设置',
);
check('layout.tsx 依赖里带了 dockWarp（切档能重建贴图）', /\[settings\.dispersion,\s*settings\.dockWarp\]/.test(layout), 'useMemo 依赖缺 dockWarp，切档要刷新才生效');
check('effectiveWarp 有 ?warp= 白名单', /URLSearchParams\(window\.location\.search\)\.get\('warp'\)/.test(lens), '量测脚本没法覆盖档位');
check('默认（无设置项时）落回厚透镜', /return setting \?\? 'thick'/.test(lens), 'effectiveWarp 的兜底不是 thick');

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
