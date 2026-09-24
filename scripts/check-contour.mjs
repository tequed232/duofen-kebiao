/**
 * 守卫：单色等高线背景（作者要求模仿《终末地》那套工业风等高线）。
 *
 * 为什么要有它：这是一层"看着对不对"的装饰，但它有**明确的机器可判定部分** ——
 *   · 生成器必须是纯函数：同种子确定、不同种子不雷同、坐标不许跑出画布、密度随档位变；
 *   · 它必须真的被挂上去：设置项、数据集属性、组件渲染、CSS 让出屏幕底色，缺一环就是"看不到"；
 *   · 它必须**零依赖**（全靠自己两段算法）—— 引了库就得走许可台账，这条钉住它别偷偷长回去。
 *
 * 用法：node scripts/check-contour.mjs
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

/* ------------------------------------------------------------- 静态接线 -- */

console.log('=== 接线：设置项 / 数据集 / 渲染 / CSS 缺一不可 ===');
const types = await readFile('web/src/lib/types.ts', 'utf8');
const app = await readFile('web/src/App.tsx', 'utf8');
const css = await readFile('web/src/theme/base.css', 'utf8');
const screen = await readFile('web/src/screens/SettingsScreen.tsx', 'utf8');
const contourSrc = await readFile('web/src/lib/contour.ts', 'utf8');

check("设置项存在（contour: 'off' | 'subtle' | 'bold'）", /contour:\s*'off'\s*\|\s*'subtle'\s*\|\s*'bold'/.test(types));
check("默认值是 subtle", /contour:\s*'subtle'/.test(types));
check('写到 <html data-contour>', app.includes('dataset.contour'));
check('App 里真的渲染了等高线层', app.includes('<ContourBackground'));
check('CSS 有 .contour-layer 图层', css.includes('.contour-layer'));
check(
  '开启时让出 .screen 底色（否则被不透明 surface 挡住）',
  /html\[data-contour='subtle'\]\s*\.screen[\s\S]{0,120}background:\s*transparent/.test(css),
);
check('设置页有入口', screen.includes('等高线背景'));
check('生成器**零依赖**（不 import 任何东西）', !/^\s*import\s/m.test(contourSrc), 'contour.ts 出现了 import —— 引库要同步许可台账');

/* --------------------------------------------------------------- 纯逻辑 -- */

const dir = await mkdtemp(path.join(tmpdir(), 'duofen-contour-'));
const bundle = path.join(dir, 'contour.mjs');
await build({
  entryPoints: ['web/src/lib/contour.ts'],
  bundle: true,
  format: 'esm',
  outfile: bundle,
  platform: 'neutral',
  logLevel: 'silent',
});
const { contourPaths, CONTOUR_PRESETS } = await import(`file://${bundle}`);

console.log('\n=== 生成器：确定性 / 不雷同 / 边界 ===');
const base = { width: 800, height: 1200, resolution: 40, levels: 6 };
const a = contourPaths({ ...base, seed: 7 });
const b = contourPaths({ ...base, seed: 7 });
const c = contourPaths({ ...base, seed: 8 });
check('同种子 → 逐字节相同的路径', a.d === b.d, `长度 ${a.d.length} vs ${b.d.length}`);
check('不同种子 → 不雷同', a.d !== c.d);
check(`有线段产出（${a.segments} 段）`, a.segments > 0);
check('levels 记在结果里', a.levels === 6);

// 坐标必须都在画布内、且都是有限数（NaN 会让整条 path 不渲染 —— 那就"看不到"了）
const numbers = (a.d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
let outOfBounds = 0;
let notFinite = 0;
for (let i = 0; i < numbers.length; i += 2) {
  const x = numbers[i];
  const y = numbers[i + 1];
  if (!Number.isFinite(x) || !Number.isFinite(y)) notFinite += 1;
  else if (x < 0 || x > base.width || y < 0 || y > base.height) outOfBounds += 1;
}
check('所有坐标都是有限数（没有 NaN）', notFinite === 0, `${notFinite} 个`);
check('所有端点都落在画布内', outOfBounds === 0, `${outOfBounds} 个越界`);
check('路径只由 M/L 组成（不掺曲线指令）', /^[ML0-9.\- ]+$/.test(a.d.slice(0, 200)));

console.log('\n=== 密度随档位变化 ===');
const few = contourPaths({ ...base, levels: 3 });
const many = contourPaths({ ...base, levels: 12 });
check(`等值面条数越多线段越多（3 档 ${few.segments} → 12 档 ${many.segments}）`, many.segments > few.segments);
check(
  `预设 bold 比 subtle 密（${CONTOUR_PRESETS.subtle.levels} → ${CONTOUR_PRESETS.bold.levels}）`,
  CONTOUR_PRESETS.bold.levels > CONTOUR_PRESETS.subtle.levels,
);
check(
  '两档透明度都在 (0, 0.3] 且 bold 更明显',
  CONTOUR_PRESETS.subtle.opacity > 0 &&
    CONTOUR_PRESETS.subtle.opacity <= 0.3 &&
    CONTOUR_PRESETS.bold.opacity > CONTOUR_PRESETS.subtle.opacity,
  `subtle=${CONTOUR_PRESETS.subtle.opacity} bold=${CONTOUR_PRESETS.bold.opacity}`,
);

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
