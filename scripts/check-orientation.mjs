/**
 * 守卫：**锁定竖屏**（作者 2026-09-25：「锁定屏幕朝向！我暂时没有横屏使用的需求」）。
 *
 * 两个层面都要钉住，少一个都会在某条路径上转屏：
 *   ① 原生：MainActivity 必须 `android:screenOrientation="portrait"`；
 *      并且 `configChanges` 要覆盖 orientation/screenSize —— 否则真机上转一下就把 Activity
 *      重建一次（WebView 重新加载、状态全丢），表现是"旋转闪一下回到首页"。
 *   ② 网页层：`@media (orientation: landscape)` 下不能出现"横屏专属布局把页面搞乱"，
 *      这里只断言页面声明了竖屏取向（manifest.webmanifest 的 orientation）与没有横屏专属宽屏分支。
 *
 * 用法：node scripts/check-orientation.mjs
 */
import { readFile } from 'node:fs/promises';

let pass = 0;
let fail = 0;
const check = (label, ok, detail = '') => {
  if (ok) pass += 1;
  else fail += 1;
  console.log(`  ${ok ? '✓' : '✗'} ${label}${ok || !detail ? '' : ` —— ${detail}`}`);
};

const manifest = await readFile('app/src/main/AndroidManifest.xml', 'utf8');
const activity = /<activity[\s\S]*?android:name="\.MainActivity"[\s\S]*?<\/activity>/.exec(manifest)?.[0] ?? '';
check('MainActivity 声明了 screenOrientation="portrait"', /android:screenOrientation="portrait"/.test(activity), '没锁竖屏');
check(
  'configChanges 覆盖 orientation / screenSize（转屏不重建 Activity）',
  /android:configChanges="[^"]*orientation/.test(activity) && /android:configChanges="[^"]*screenSize/.test(activity),
  'configChanges 缺项 —— 真机转屏会重建 Activity',
);

const webmanifest = await readFile('web/public/manifest.webmanifest', 'utf8');
check('PWA manifest 也声明竖屏（安装到桌面时同样锁）', /"orientation"\s*:\s*"portrait/.test(webmanifest), 'webmanifest 没有 orientation');

const base = await readFile('web/src/theme/base.css', 'utf8');
check('网页层没有横屏专属的宽屏布局分支', !/@media[^{]*orientation:\s*landscape/.test(base), 'base.css 里有 landscape 分支');

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
