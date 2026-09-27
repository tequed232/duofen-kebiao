/**
 * 守卫：原生边缘拖拽返回这条链必须完整接上（作者 2026-09-29 要求参考 Telegram 的实现）。
 *
 * 为什么要有它：这条链横跨 Kotlin 与 TypeScript 四个点，任何一处断了都不会报错，
 * 只会表现为"手势没反应/预览不动"——只能靠真机发现。这里把它们钉住：
 *   ① Kotlin 侧存在 SwipeBackLayout，且用系统手势排除 + 速度决断；
 *   ② MainActivity 真的把它套在 WebView 外面，并把三相接到网页桥 / 统一的 performBack；
 *   ③ 网页侧把"还能不能退"同步回去（决定左边缘要不要排除）；
 *   ④ 网页侧仍然提供 window.DuofenBack 三相 API（原生与系统两条路共用）。
 *
 * 用法：node scripts/check-native-swipe-back.mjs
 */
import { readFileSync, existsSync } from 'node:fs';

let pass = 0;
let fail = 0;
const check = (label, ok, detail = '') => {
  if (ok) pass += 1;
  else fail += 1;
  console.log(`  ${ok ? '✓' : '✗'} ${label}${ok || !detail ? '' : ` —— ${detail}`}`);
};

const layoutPath = 'app/src/main/java/com/app/m3expressive/SwipeBackLayout.kt';
const activityPath = 'app/src/main/java/com/app/m3expressive/MainActivity.kt';
const navPath = 'web/src/nav/navigation.tsx';

check('SwipeBackLayout.kt 存在', existsSync(layoutPath), '文件不在');
const layout = existsSync(layoutPath) ? readFileSync(layoutPath, 'utf8') : '';
const activity = readFileSync(activityPath, 'utf8');
const nav = readFileSync(navPath, 'utf8');

console.log('[1] 原生手势接管');
check('排除左边缘的系统手势（否则触摸根本到不了我们）', layout.includes('setSystemGestureExclusionRects'), '没有调用');
check('只在可退时排除（根屏还给系统做"离开应用"）', layout.includes('setEdgeExcluded') && layout.includes('emptyList()'), '缺 setEdgeExcluded 分支');
check('用 VelocityTracker 做甩动决断', layout.includes('VelocityTracker') && layout.includes('FLING_VELOCITY'), '没有速度决断');
check('拖拽阈值与提交阈值都有常量', layout.includes('COMMIT_FRACTION') && layout.includes('EDGE_DP'), '阈值常量缺失');
check('初始方向判定：横向为主才接管（不吃掉纵向滚动）', layout.includes('dx > abs(dy)') || layout.includes('abs(dy)'), '没有方向判定');

console.log('[2] MainActivity 接线');
check('真的把 WebView 套进 SwipeBackLayout', /SwipeBackLayout\(this\)/.test(activity) && /swipeBack\.addView\(\s*webView/.test(activity), '没有套壳');
check('可退判断接的是网页历史栈', /canDragBack\s*=\s*\{\s*webView\.canGoBack\(\)/.test(activity), 'canDragBack 没接 canGoBack');
check('三相接进网页桥', /onStart\s*=\s*\{\s*notifyWebBack\("start"/.test(activity) && /onProgress\s*=\s*\{[^}]*notifyWebBack\("progress"/.test(activity) && /onCancel\s*=\s*\{\s*notifyWebBack\("cancel"/.test(activity), '三相没接全');
check('提交走宿主统一的 performBack（网页栈优先）', /onCommit\s*=\s*\{\s*performBack\(\)/.test(activity), 'onCommit 没接 performBack');
check('退栈后重新评估边缘排除', activity.includes('swipeBackRef?.setEdgeExcluded'), '缺少重新评估');

console.log('[3] 网页侧');
check('网页把"还能不能退"同步给原生', /setCanGoBack/.test(nav) && /stack\.length > 1/.test(nav), '没有同步');
check('网页仍然提供 DuofenBack 三相 API（两条路共用）', /DuofenBack/.test(nav) && /progress:/.test(nav) && /cancel:/.test(nav), 'DuofenBack 不完整');

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
