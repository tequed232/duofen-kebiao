/**
 * v2 迁移脚本：底边栏改为三项（首页 / 搜索 / 设置），并让各屏幕的 selectTab 对齐。
 *
 * - 首页 → schedule（课表即首页，v2 canvas）
 * - 搜索 → scheduleFilter（筛选/搜索页，后续接入内嵌地图）
 * - 设置 → settings
 * 记录 / 历史 / 导入等页面保留为普通路由，不再出现在底边栏。
 *
 * Usage: node scripts/migrate-nav-v2.mjs
 */
import { readFile, writeFile } from 'node:fs/promises';

const FILES = [
  'web/src/screens/HomeScreen.tsx',
  'web/src/screens/CameraScreen.tsx',
  'web/src/screens/HistoryScreen.tsx',
  'web/src/screens/ScheduleScreen.tsx',
  'web/src/screens/SettingsScreen.tsx',
];

const HANDLER = `const selectTab = (tab: 'schedule' | 'search' | 'settings') => {
    // v2：底边栏三项 —— 首页=课表（栈底）、搜索=筛选页、设置
    if (tab === 'schedule') {
      nav.popTo('schedule');
      return;
    }
    nav.push(tab === 'search' ? 'scheduleFilter' : 'settings', {}, 'slide');
  };`;

for (const file of FILES) {
  const source = await readFile(file, 'utf8');
  const block = source.match(/const selectTab[\s\S]*?\n  \};/);
  if (!block) {
    console.log(`! ${file}: 未找到 selectTab`);
    continue;
  }
  let next = source.replace(block[0], HANDLER);

  // 底边栏的 active 取值同步：记录/历史等页面按「首页」高亮，筛选页按「搜索」高亮
  next = next.replace(/<AppNavBar active="home" onSelect=\{selectTab\} \/>/g, '<AppNavBar active="schedule" onSelect={selectTab} />');
  next = next.replace(/<AppNavBar active="history" onSelect=\{selectTab\} \/>/g, '<AppNavBar active="schedule" onSelect={selectTab} />');
  next = next.replace(/<AppNavBar active="camera" onSelect=\{selectTab\} \/>/g, '<AppNavBar active="schedule" onSelect={selectTab} />');

  await writeFile(file, next, 'utf8');
  console.log(`已更新 ${file}`);
}
