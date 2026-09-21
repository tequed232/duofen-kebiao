/**
 * 修三个问题：
 *  ① 双击底边栏「设置」会重复入栈 → 在 push 里做**同路由去重**（点第二下不再压栈）
 *  ② 液态玻璃太丑 → 底边栏材质改成三选一：液态玻璃 / Material 3 实心（默认）/ 半透明
 *  ③ 顺带把材质选择写进 settings（与原有 liquidGlass 开关兼容：旧值为 true → 玻璃）
 *
 * Usage: node scripts/fix-nav-and-material.mjs
 */
import { readFile, writeFile } from 'node:fs/promises';

/* --------------------------------------------------- ① push 同路由去重 */
const NAV = 'web/src/nav/navigation.tsx';
let nav = await readFile(NAV, 'utf8');
if (!nav.includes('同路由去重')) {
  nav = nav.replace(
    /(\n\s*const push = useCallback<NavValue\['push'\]>\(\n\s*\(route, params = \{\}, transition = 'slide'\) => \{)/,
    `$1
      // 同路由去重：重复点击底边栏标签不再重复入栈（此前"点两下跳到不知道哪里"）
      const top = stackRef.current[stackRef.current.length - 1];
      if (top && top.route === route) return;`,
  );
  await writeFile(NAV, nav, 'utf8');
}

/* --------------------------------------------- ② 材质：三选一 + 默认实心 */
const TYPES = 'web/src/lib/types.ts';
let types = await readFile(TYPES, 'utf8');
if (!types.includes('barMaterial')) {
  types = types.replace(
    /(\s*\/\*\* 底边栏使用液态玻璃（liquid glass）效果 \*\/\n\s*liquidGlass: boolean;)/,
    `$1
  /** 底边栏材质：液态玻璃 / Material 3 实心（默认）/ 半透明 */
  barMaterial: 'glass' | 'solid' | 'translucent';`,
  );
  types = types.replace(/(\n\s*liquidGlass: true,)/, `$1\n  barMaterial: 'solid',`);
  await writeFile(TYPES, types, 'utf8');
}

/* 状态：把材质写到 html[data-glass-material]，由 CSS 决定外观 */
const APP = 'web/src/App.tsx';
let app = await readFile(APP, 'utf8');
if (!app.includes('data-glass-material')) {
  app = app.replace(
    /  \/\/ 过渡模式：写到 <html data-transition> 上，由 CSS 决定动画（none = 瞬时切换）/,
    `  // 底边栏材质：写到 <html data-glass-material>，由 CSS 决定用玻璃 / 实心 / 半透明
  useEffect(() => {
    document.documentElement.dataset.glassMaterial = settings.barMaterial ?? 'solid';
  }, [settings.barMaterial]);

  // 过渡模式：写到 <html data-transition> 上，由 CSS 决定动画（none = 瞬时切换）`,
  );
  await writeFile(APP, app, 'utf8');
}

/* --------------------------------------- ③ 设置页：材质三选一（替换原开关行） */
const S = 'web/src/screens/SettingsScreen.tsx';
let s = await readFile(S, 'utf8');
if (!s.includes('底边栏材质')) {
  const rowStart = s.indexOf('{/* -------------------------------------- 4 液态玻璃底边栏 */}');
  if (rowStart >= 0) {
    const itemStart = s.indexOf('<md-list-item', rowStart);
    const itemEnd = s.indexOf('</md-list-item>', itemStart) + '</md-list-item>'.length;
    const row = `{/* -------------------------------------- 4 底边栏材质（三选一） */}
            <md-list-item type="button" className="rounded-middle" onClick={() => setMaterialDialogOpen(true)}>
              <div slot="start" class="list-icon-badge">
                <MdIcon name="layers" />
              </div>
              <div slot="headline">底边栏材质</div>
              <div slot="supporting-text">
                {settings.barMaterial === 'glass'
                  ? '液态玻璃：模糊 + 折射层（较重，观感偏花）'
                  : settings.barMaterial === 'translucent'
                    ? '半透明：surfaceContainer 70%，无模糊'
                    : 'Material 3 实心：surfaceContainer + 阴影（默认，最干净）'}
              </div>
              <MdIcon slot="end" name="chevron_right" />
            </md-list-item>`;
    s = s.slice(0, itemStart) + row + s.slice(itemEnd);
  }
  s = s.replace(
    '  const [transitionDialogOpen, setTransitionDialogOpen] = useState(false);',
    `  const [transitionDialogOpen, setTransitionDialogOpen] = useState(false);
  const [materialDialogOpen, setMaterialDialogOpen] = useState(false);`,
  );
  // 材质选择对话框
  s = s.replace(
    '      <MdDialog\n        open={transitionDialogOpen}',
    `      <MdDialog
        open={materialDialogOpen}
        headline="底边栏材质"
        onClosed={() => setMaterialDialogOpen(false)}
        actions={<md-text-button onClick={() => setMaterialDialogOpen(false)}>取消</md-text-button>}
      >
        选择底边栏的外观材质（立即生效并保存）：
        <div className="col gap-8 mt-12">
          {([
            ['solid', 'Material 3 实心（推荐）：surfaceContainer + 阴影，最干净'],
            ['translucent', '半透明：surfaceContainer 70%，不做模糊'],
            ['glass', '液态玻璃：模糊 + 折射层（当前观感较花，可后续调参）'],
          ] as const).map(([value, label]) => (
            <md-outlined-button
              key={value}
              onClick={() => {
                setMaterialDialogOpen(false);
                updateSettings(
                  { barMaterial: value, liquidGlass: value === 'glass' },
                  { message: '已切换底边栏材质' },
                );
              }}
            >
              {settings.barMaterial === value ? '✓ ' : ''}
              {label}
            </md-outlined-button>
          ))}
        </div>
      </MdDialog>

      <MdDialog
        open={transitionDialogOpen}`,
  );
  await writeFile(S, s, 'utf8');
}

/* ------------------------------------------------------------- ④ 材质样式 */
const CSS = 'web/src/theme/schedule.css';
let css = await readFile(CSS, 'utf8');
if (!css.includes("data-glass-material='solid'")) {
  css += `

/* ================= 底边栏材质（html[data-glass-material]） ================= */
/* 实心（默认）：Material 3 标准表面 —— 干净、不会"花" */
html[data-glass-material='solid'] .glass-nav-inner {
  background: var(--md-sys-color-surface-container) !important;
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
  border: none !important;
  box-shadow: 0 3px 8px color-mix(in srgb, #000 22%, transparent) !important;
}

html[data-glass-material='solid'] .glass-tab-indicator {
  background: var(--md-sys-color-secondary-container) !important;
  border: none !important;
  box-shadow: none !important;
}

/* 半透明：不做模糊，只降低不透明度 */
html[data-glass-material='translucent'] .glass-nav-inner {
  background: color-mix(in srgb, var(--md-sys-color-surface-container) 72%, transparent) !important;
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
  border: 1px solid color-mix(in srgb, var(--md-sys-color-outline-variant) 45%, transparent) !important;
}

/* 液态玻璃：保留现有的模糊 + 折射层 */
html[data-glass-material='glass'] .glass-nav-refraction {
  display: block !important;
  opacity: 0.22 !important;
}
`;
}
await writeFile(CSS, css, 'utf8');

console.log({
  去重: (await readFile(NAV, 'utf8')).includes('同路由去重'),
  材质类型: types.includes('barMaterial'),
  写入html: app.includes('data-glass-material'),
  设置入口: (await readFile(S, 'utf8')).includes('底边栏材质'),
  材质CSS: css.includes("data-glass-material='solid'"),
});
