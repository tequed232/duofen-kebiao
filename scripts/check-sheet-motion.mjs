/**
 * 守卫：弹层（ExpandableSheet）的开合动效必须**只开一次、且单调收敛**。
 *
 * 背景（作者 2026-09-29 报「点击控件时界面弹出两次 + 有类似冲击效果」）：
 *   ① 真机 CDP 逐帧采样（365×800 / dpr 3.5）显示，动画起点是 `scale(0.89, **0.02**)` ——
 *      面板从一根头发丝里窜出来，观感就是"被弹了一下"。已把起点下限提到 (0.6, 0.35)。
 *   ② 「弹两次」在真机上没复现出来（`.sheet-layer` 只添加一次、`md-dialog[open]` 只置位一次），
 *      所以这条守卫同时把"只开一次 + 动画不回跳"钉住：一旦有人把相位逻辑改坏（关了又开、
 *      或者布局效应重跑导致动画从头来一遍），逐帧采样里的 scale 会先增后大幅回落 → 报红。
 *
 * 用法：APP_URL=http://127.0.0.1:5173/ node scripts/check-sheet-motion.mjs
 */
import { chromium } from 'playwright';

const APP_URL = process.env.APP_URL ?? 'http://127.0.0.1:5173/';

let pass = 0;
let fail = 0;
const check = (label, ok, detail = '') => {
  if (ok) pass += 1;
  else fail += 1;
  console.log(`  ${ok ? '✓' : '✗'} ${label}${ok || !detail ? '' : ` —— ${detail}`}`);
};

const browser = await chromium.launch({ channel: 'chromium' });
const page = await browser.newPage({ viewport: { width: 365, height: 800 }, deviceScaleFactor: 3.5 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 140)));
await page.goto(APP_URL, { waitUntil: 'load' });
await page.waitForTimeout(2600);

// 记下弹层被添加了几次（只开一次的硬证据）
await page.evaluate(() => {
  window.__sheetAdds = 0;
  new MutationObserver((records) => {
    for (const r of records) {
      for (const n of r.addedNodes) {
        if (n.nodeType === 1 && String(n.className ?? '').includes('sheet-layer')) window.__sheetAdds += 1;
      }
    }
  }).observe(document.body, { childList: true, subtree: true });
});

console.log('[1] 点一节课，逐帧采样开启动效');
const chip = page.locator('.course-chip').first();
check('课表上找得到课程', (await chip.count()) > 0, '没有任何 .course-chip');
await chip.click({ force: true });

const frames = await page.evaluate(
  () =>
    new Promise((resolve) => {
      const out = [];
      const t0 = performance.now();
      const tick = () => {
        const panel = document.querySelector('.sheet-panel');
        if (panel) {
          const cs = getComputedStyle(panel);
          const m = /matrix\(([^)]+)\)/.exec(cs.transform);
          const parts = m ? m[1].split(',').map((v) => Number(v.trim())) : null;
          out.push({ t: Math.round(performance.now() - t0), sx: parts ? parts[0] : 1, sy: parts ? parts[3] : 1, tx: parts ? parts[5] : 0 });
        }
        if (performance.now() - t0 < 1400) requestAnimationFrame(tick);
        else resolve(out);
      };
      tick();
    }),
);

const adds = await page.evaluate(() => window.__sheetAdds);
const first = frames[0];
const last = frames[frames.length - 1];
console.log(`  采样 ${frames.length} 帧；起始 scale(${first?.sx?.toFixed(3)}, ${first?.sy?.toFixed(3)}) → 末帧 scale(${last?.sx?.toFixed(3)}, ${last?.sy?.toFixed(3)})`);

check('弹层只被挂载一次（不是"弹两次"）', adds === 1, `实际挂载 ${adds} 次`);
check('起始纵向缩放不再是一根头发丝（≥ 0.3）', (first?.sy ?? 0) >= 0.3, `起始 scaleY=${first?.sy}`);
check('起始横向缩放不太小（≥ 0.5）', (first?.sx ?? 0) >= 0.5, `起始 scaleX=${first?.sx}`);
check('最终收敛到原尺寸（scaleY ≥ 0.999）', (last?.sy ?? 0) >= 0.999, `末帧 scaleY=${last?.sy}`);
check('最终回到原位（|translateX| ≤ 0.5）', Math.abs(last?.tx ?? 99) <= 0.5, `末帧 tx=${last?.tx}`);

// 单调收敛：允许 ±0.02 的采样噪声；一旦出现"先增大后明显回落"，就是动画从头来过（弹两次）
let restarts = 0;
let peak = 0;
for (const f of frames) {
  if (f.sy < peak - 0.05) restarts += 1;
  peak = Math.max(peak, f.sy);
}
check('动效单调收敛、没有回跳（回跳即"弹两次"）', restarts === 0, `回跳 ${restarts} 次`);

if (errors.length) console.log('  页面错误:', errors.slice(0, 3).join(' | '));
await browser.close();
console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
