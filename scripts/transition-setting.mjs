/**
 * 新增设置项「过渡效果」：让用户自己选择切换模式（不必二选一被写死）。
 *
 *   m3    —— Material 3 规范：标签用 Fade through、前进/返回用 Shared axis X（默认）
 *   fade  —— 只淡入淡出（最柔和）
 *   slide —— 一律横向滑移
 *   none  —— 不做动画，瞬时切换（设备吃不消时最稳）
 *
 * Usage: node scripts/transition-setting.mjs
 */
import { readFile, writeFile } from 'node:fs/promises';

/* 1) 类型与默认值 */
const TYPES = 'web/src/lib/types.ts';
let types = await readFile(TYPES, 'utf8');
if (!types.includes('transition:')) {
  types = types.replace(
    /(\s*\/\*\* 录音时发送实时通知[\s\S]*?\n\s*liveNotify: boolean;)/,
    `$1\n  /** 页面切换的过渡模式：M3 规范 / 仅淡入淡出 / 横向滑移 / 无动画 */\n  transition: 'm3' | 'fade' | 'slide' | 'none';`,
  );
  types = types.replace(/(\n\s*liveNotify: true,)/, `$1\n  transition: 'm3',`);
}
await writeFile(TYPES, types, 'utf8');

/* 2) 把选择写到 html[data-transition]，由 CSS 分流 */
const APP = 'web/src/App.tsx';
let app = await readFile(APP, 'utf8');
if (!app.includes('data-transition')) {
  app = app.replace(
    "  const { ready } = useAppState();",
    `  const { ready, settings } = useAppState();`,
  );
  app = app.replace(
    "  useEffect(() => {\n    if (splash) return undefined;",
    `  // 过渡模式：写到 <html data-transition> 上，由 CSS 决定动画（none = 瞬时切换）
  useEffect(() => {
    document.documentElement.dataset.transition = settings.transition;
  }, [settings.transition]);

  useEffect(() => {
    if (splash) return undefined;`,
  );
}
await writeFile(APP, app, 'utf8');

/* 3) 设置项 + 选择对话框 */
const SETTINGS = 'web/src/screens/SettingsScreen.tsx';
let s = await readFile(SETTINGS, 'utf8');
if (!s.includes('过渡效果')) {
  s = s.replace(
    '  const [styleDialogOpen, setStyleDialogOpen] = useState(false);',
    `  const [styleDialogOpen, setStyleDialogOpen] = useState(false);
  const [transitionDialogOpen, setTransitionDialogOpen] = useState(false);`,
  );
  // 在「液态玻璃底边栏」那行之后插入
  s = s.replace(
    /(\s*<\/md-list-item>\n\n\s*\{\/\* -+ 5 API编辑)/,
    `
            </md-list-item>

            {/* -------------------------------------- 过渡效果（切换模式可选） */}
            <md-list-item type="button" className="rounded-middle" onClick={() => setTransitionDialogOpen(true)}>
              <div slot="start" className="list-icon-badge">
                <MdIcon name="animation" />
              </div>
              <div slot="headline">过渡效果</div>
              <div slot="supporting-text">
                {settings.transition === 'm3'
                  ? 'Material 3：标签淡入淡出、前进/返回横向滑移'
                  : settings.transition === 'fade'
                    ? '仅淡入淡出（最柔和）'
                    : settings.transition === 'slide'
                      ? '一律横向滑移'
                      : '无动画：瞬时切换（最稳）'}
              </div>
              <MdIcon slot="end" name="chevron_right" />
            </md-list-item>

            {/* ------------------------------------------------ 5 API编辑`,
  );
  // 对话框
  s = s.replace(
    '      <MdDialog\n        open={schoolDialogOpen}',
    `      <MdDialog
        open={transitionDialogOpen}
        headline="过渡效果"
        onClosed={() => setTransitionDialogOpen(false)}
        actions={<md-text-button onClick={() => setTransitionDialogOpen(false)}>取消</md-text-button>}
      >
        选择页面切换的动画方式（立即生效并保存）：
        <div className="col gap-8 mt-12">
          {([
            ['m3', 'Material 3 规范（推荐）：标签淡入淡出，前进/返回横向滑移'],
            ['fade', '仅淡入淡出：最柔和，无位移'],
            ['slide', '一律横向滑移'],
            ['none', '无动画：瞬时切换（设备吃力时最稳）'],
          ] as const).map(([value, label]) => (
            <md-outlined-button
              key={value}
              onClick={() => {
                setTransitionDialogOpen(false);
                updateSettings(
                  { transition: value },
                  { message: \`已切换过渡效果：\${label.split('：')[0]}\` },
                );
              }}
            >
              {settings.transition === value ? '✓ ' : ''}
              {label}
            </md-outlined-button>
          ))}
        </div>
      </MdDialog>

      <MdDialog
        open={schoolDialogOpen}`,
  );
}
await writeFile(SETTINGS, s, 'utf8');

/* 4) CSS：按 data-transition 分流 */
const CSS = 'web/src/theme/schedule.css';
let css = await readFile(CSS, 'utf8');
if (!css.includes("data-transition='none'")) {
  css += `

/* ================ 过渡效果：按设置分流（html[data-transition]） ============== */
/* none：瞬时切换，不做任何动画（"最稳"的切换模式） */
html[data-transition='none'] .screen.enter-fade,
html[data-transition='none'] .screen.exit-fade,
html[data-transition='none'] .screen.enter-zoom,
html[data-transition='none'] .screen.exit-zoom,
html[data-transition='none'] .screen.enter-slide,
html[data-transition='none'] .screen.exit-slide {
  animation: none !important;
}

/* fade：一律淡入淡出（无位移） */
html[data-transition='fade'] .screen.enter-slide,
html[data-transition='fade'] .screen.enter-zoom {
  animation: m3-fade-through-in 210ms cubic-bezier(0.05, 0.7, 0.1, 1) both;
}

html[data-transition='fade'] .screen.exit-slide,
html[data-transition='fade'] .screen.exit-zoom {
  animation: m3-fade-through-out 90ms cubic-bezier(0.3, 0, 0.8, 0.15) both;
}

/* slide：一律横向滑移 */
html[data-transition='slide'] .screen.enter-fade,
html[data-transition='slide'] .screen.enter-zoom {
  animation: m3-shared-axis-in 300ms cubic-bezier(0.05, 0.7, 0.1, 1) both;
}

html[data-transition='slide'] .screen.exit-fade,
html[data-transition='slide'] .screen.exit-zoom {
  animation: m3-shared-axis-out 300ms cubic-bezier(0.3, 0, 0.8, 0.15) both;
}
`;
}
await writeFile(CSS, css, 'utf8');

console.log({
  类型: types.includes('transition:'),
  写入html: app.includes('data-transition'),
  设置项: s.includes('过渡效果'),
  对话框: s.includes('transitionDialogOpen'),
  分流CSS: css.includes("data-transition='none'"),
});
