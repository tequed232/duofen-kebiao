/**
 * Browser verification for the production build（逐屏截图 + JSON 报告）。
 *
 * ⚠️ 已知状态：**部分失效，不是可信的验收判据**。
 * 它写于 v2 改版之前，UI 在那之后重写过两轮，脚本里的选择器只跟上了一部分。
 * 实测（2026-09，v3.5.2）：19 步中 **8 步通过、11 步失败**；
 * 失败集中在课程卡片、看板拖拽/折叠、筛选页、导入面板这几处 —— 都是"选择器已过期"，
 * 不是产品坏了（`pageErrors` 与 `consoleErrors` 均为 0，同一套 UI 的
 * `scripts/check-import-e2e.mjs` 是 9/9 通过的）。
 * 要当成验收用，先得把剩下的选择器对着现行 DOM 重写一遍；那是一件独立的事，尚未做。
 *
 * 因此**当前真正被 CI 强制执行的覆盖**是 auto-review 里的 9 条守卫
 * （hygiene / secrets / web-security / version / licenses / isbn / backdrop-refraction /
 *  schedule-html / import-e2e），不是这个脚本。
 *
 * 前置：`npm run build` 之后需要 preview server
 * （`npm run preview`，默认 http://127.0.0.1:4173/）；
 * 不起的话会以 `net::ERR_CONNECTION_REFUSED` 直接失败，且不会告诉你原因。
 *
 * Usage: node scripts/verify.mjs [url]        # 也可用 URL=… 指定
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const URL = process.argv[2] ?? process.env.URL ?? 'http://127.0.0.1:4173/';
const OUT_DIR = path.resolve(process.env.OUT_DIR ?? 'screenshots');
const REPORT = path.join(OUT_DIR, 'report.json');

/** 课表导入测试用的 RTF 文件（结构同教务系统导出）。 */
const SCHEDULE_FIXTURE = path.resolve('build/test-schedule.rtf');
const FIXTURE_RTF = String.raw`{\rtf1\ansi\ansicpg1252\deff0{\fonttbl{\f0\froman Times New Roman;}}
节次/星期\cell 星期一\cell 星期二\cell 星期三\cell 星期四\cell 星期五\cell 星期六\cell 星期日\cell\row
第1-2节\par 08:30-09:55\cell \cell 导入测试课程\par 3-20周[1,2]\par [测试老师]\par 2026测试01班\par 9-101[40人]\cell \cell \cell \cell \cell \cell\row
第3-4节\par 10:15-11:40\cell \cell \cell 另一门测试课\par 5-18周[3,4]\par [王测试]\par 2026测试01班\par 3-202[40人]\cell \cell \cell \cell \cell\row
}`;

const consoleErrors = [];
const pageErrors = [];
const steps = [];
const extra = {};

await mkdir(OUT_DIR, { recursive: true });
await mkdir(path.dirname(SCHEDULE_FIXTURE), { recursive: true });
await writeFile(SCHEDULE_FIXTURE, FIXTURE_RTF, 'utf8');

const persist = async () => {
  await writeFile(REPORT, JSON.stringify({ url: URL, extra, consoleErrors, pageErrors, steps }, null, 2));
};

const watchdog = setTimeout(async () => {
  steps.push('FATAL: watchdog timeout');
  await persist().catch(() => {});
  process.exit(3);
}, 300000);

const browser = await chromium.launch({
  channel: 'chromium',
  args: [
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',
    '--autoplay-policy=no-user-gesture-required',
  ],
});

const context = await browser.newContext({
  viewport: { width: 412, height: 892 },
  deviceScaleFactor: 2,
  hasTouch: true,
  permissions: ['camera', 'microphone'],
  locale: 'zh-CN',
});

const page = await context.newPage();
page.setDefaultTimeout(8000);

page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text());
});
page.on('pageerror', (error) => pageErrors.push(String(error?.stack ?? error)));

/** The screen on top of the stack (NavHost marks the others aria-hidden). */
const top = () => page.locator('.screen:not([aria-hidden="true"])');

/**
 * 种子数据：作者要求清空了内置课表（原数据含教师姓名/教室/人数），
 * 因此验收前先往本机数据库写入一份**最小演示课表 + 一条记录**，
 * 让课表/教材/历史相关的步骤有数据可验。
 */
const seedDemoData = async () => {
  await page.evaluate(async () => {
    const openDb = () =>
      new Promise((resolve, reject) => {
        const request = indexedDB.open('m3-expressive-notes');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    const db = await openDb();
    const put = (store, value, key) =>
      new Promise((resolve) => {
        const tx = db.transaction(store, 'readwrite');
        if (key === undefined) tx.objectStore(store).put(value);
        else tx.objectStore(store).put(value, key);
        tx.oncomplete = () => resolve(true);
      });

    const demoCourse = (name, room) => ({ name, teacher: '演示老师', room, weeks: '1-20', className: '' });
    // 七天都放课：分页板默认停在"今天"那一页，只放周一会让其他页拿不到课程卡片
    const days = [
      [demoCourse('演示课程 A', '1-101'), demoCourse('演示课程 B', '2-202')],
      [demoCourse('演示课程 C', '3-303')],
      [demoCourse('演示课程 D', '4-404')],
      [demoCourse('演示课程 E', '5-505')],
      [demoCourse('演示课程 F', '6-606')],
      [demoCourse('演示课程 G', '7-707')],
      [demoCourse('演示课程 H', '8-808')],
    ];
    const schedule = {
      owner: '验收用演示数据',
      term: '2026-2027-1',
      termStart: '2026-08-31',
      days: ['星期一', '星期二', '星期三', '星期四', '星期五', '星期六', '星期日'],
      periods: [
        { period: '第1-2节', time: '08:30-09:55', section: 'morning', days },
        { period: '第3-4节', time: '10:10-11:35', section: 'morning', days: [[], [], [], [], [], [], []] },
        { period: '第5-6节', time: '12:10-13:35', section: 'noon', days: [[], [], [], [], [], [], []] },
        { period: '第7-8节', time: '14:10-15:35', section: 'afternoon', days: [[], [], [], [], [], [], []] },
        { period: '第9-10节', time: '18:10-19:35', section: 'evening', days: [[], [], [], [], [], [], []] },
      ],
    };
    await put('kv', schedule, 'schedule');
    await put('kv', {
      '演示课程 A': { title: '军事理论与技能训练教程', publisher: '国防科技大学出版社', course: '演示课程 A', source: 'manual' },
    }, 'textbooks');
  });
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(2600);
};



const clickTop = async (selector, index = 0) => {
  // 底边栏：网页是 M3 原生导航栏（md-navigation-tab）；APK 由原生 Dock 负责
  if (selector === 'md-navigation-tab' || selector === '.m3e-dock-tab') {
    // 自绘底栏：纯 button，JS 点击最稳
    //
    // 注意作用域：底栏是**常驻在 App 层、屏幕栈之外**的单一实例，**不在 `.screen` 里**。
    // 原先这里写 `.screen:not([aria-hidden="true"]) .m3e-dock-tab` —— 底栏搬出屏幕栈之后
    // 这个选择器永远匹配不到，`clicked` 恒为 false，于是静默回落到下面的通用点击路径，
    // 最终以 `md-navigation-tab` 超时收场：整条验收从第一步就断，后面十几项全是连锁陪葬。
    // 这类"匹配不到却不报错、只是回落到别的路径"的写法，正是坏守卫最爱的藏身处。
    const clicked = await page.evaluate((i) => {
      const buttons = Array.from(document.querySelectorAll('.m3e-dock-tab')).filter(
        (el) => el.offsetParent !== null,
      );
      if (!buttons.length) return false;
      buttons[i]?.click();
      return true;
    }, index);
    if (clicked) {
      await page.waitForTimeout(900);
      return;
    }
  }
  if (selector === 'md-navigation-tab-legacy') {
    const clicked = await page.evaluate((i) => {
      const screen = document.querySelector('.screen:not([aria-hidden="true"])');
      const glass = screen ? screen.querySelectorAll('.glass-tab') : [];
      if (!glass.length) return false;
      glass[i]?.click();
      return true;
    }, index);
    if (clicked) {
      await page.waitForTimeout(700);
      return;
    }
  }
  try {
    await top().locator(selector).nth(index).click({ timeout: 7000 });
  } catch (error) {
    // 兜底：某些覆盖层/动画会让 Playwright 的命中测试超时，但元素本身是可点的。
    // 用真实事件序列（pointerdown → click）直接派发，与用户点击等价。
    const done = await page.evaluate(
      ({ sel, i }) => {
        const screen = document.querySelector('.screen:not([aria-hidden="true"])');
        const element = screen?.querySelectorAll(sel)?.[i];
        if (!element) return false;
        element.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
        element.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
        element.click();
        return true;
      },
      { sel: selector, i: index },
    );
    if (!done) throw error;
    await page.waitForTimeout(700);
  }
};

const waitTop = async (selector, index = 0) => {
  await top().locator(selector).nth(index).waitFor({ state: 'visible', timeout: 8000 });
};

const shot = async (name) => {
  const file = path.join(OUT_DIR, `${name}.png`);
  // park the pointer in a corner so hover state layers do not show up in screenshots
  await page.mouse.move(3, 3).catch(() => {});
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await page.screenshot({ path: file });
      break;
    } catch (error) {
      if (attempt === 1) throw error;
      await page.waitForTimeout(500);
    }
  }
  steps.push(`shot:${name}`);
  await persist();
};

const step = async (name, fn) => {
  try {
    await fn();
    steps.push(`ok:${name}`);
  } catch (error) {
    steps.push(`FAIL:${name}: ${error instanceof Error ? error.message.split('\n')[0] : error}`);
  }
  await persist();
};

const evalWithTimeout = (fn, fallback = null, ms = 6000) =>
  Promise.race([
    page.evaluate(fn).catch(() => fallback),
    new Promise((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);

const readTheme = () =>
  page.evaluate(() => {
    const styles = getComputedStyle(document.documentElement);
    const role = (name) => styles.getPropertyValue(`--md-sys-color-${name}`).trim();
    return {
      theme: document.documentElement.dataset.theme,
      primary: role('primary'),
      onPrimary: role('on-primary'),
      primaryContainer: role('primary-container'),
      secondaryContainer: role('secondary-container'),
      tertiaryContainer: role('tertiary-container'),
      surface: role('surface'),
      surfaceContainerLow: role('surface-container-low'),
      surfaceContainer: role('surface-container'),
      surfaceContainerHigh: role('surface-container-high'),
      surfaceContainerHighest: role('surface-container-highest'),
      onSurface: role('on-surface'),
      onSurfaceVariant: role('on-surface-variant'),
      outlineVariant: role('outline-variant'),
      inverseSurface: role('inverse-surface'),
      inversePrimary: role('inverse-primary'),
      error: role('error'),
      springDuration: styles.getPropertyValue('--md-sys-motion-spring-spatial-default-duration'),
    };
  });

try {
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForTimeout(2200);
  await seedDemoData();
  await page.waitForTimeout(1600);

  extra.theme = await readTheme();

  await step('textbook window opens', async () => {
    // v2：教材窗口挂在首页（课表）工具栏上
    await clickTop('.appbar-textbooks');
    await page.waitForTimeout(1200);
    extra.textbookWindowText = (await top().innerText()).replace(/\s+/g, ' ').slice(0, 90);
    if (!/教材/.test(extra.textbookWindowText)) throw new Error(`教材窗口未打开: ${extra.textbookWindowText}`);
  });
  await shot('00b-textbooks');

  await step('textbook window closes', async () => {
    await clickTop('.app-bar md-icon-button', 0); // 返回
    await page.waitForTimeout(900);
  });
  await step('the schedule is the home screen', async () => {
    // v2.1：应用启动在记录页，先切到「首页」标签再断言课表
    await clickTop('md-navigation-tab', 0);
    await page.waitForTimeout(1200);
    await waitTop('.week-board');
    await page.waitForTimeout(600);
  });
  await shot('00-schedule-home');

  /* ------------------------------------------------------------- 课表 screen */
  await step('schedule tab shows the 4x4 paged board', async () => {
    await page.keyboard.press('Escape');
    await clickTop('md-navigation-tab', 0);
    await waitTop('.week-grid');
    await page.waitForTimeout(900);
    extra.schedule = await page.evaluate(() => {
      const board = document.querySelector('.week-board');
      const pages = Array.from(document.querySelectorAll('.week-page'));
      const rect = board ? board.getBoundingClientRect() : null;
      const activeIndex = Array.from(document.querySelectorAll('.board-dot-pill')).findIndex((dot) =>
        dot.classList.contains('active'),
      );
      return {
        board: rect ? { w: Math.round(rect.width), h: Math.round(rect.height) } : null,
        pageCount: pages.length,
        pageSize: pages.map((page) => page.querySelectorAll('.week-day-head').length),
        rows: pages[0] ? pages[0].querySelectorAll('.week-row-head').length : 0,
        rowLabels: pages[0]
          ? Array.from(pages[0].querySelectorAll('.week-row-head')).map((element) => element.textContent.trim())
          : [],
        dayHeads: pages[0]
          ? Array.from(pages[0].querySelectorAll('.week-day-head')).map((element) => element.textContent)
          : [],
        chipCount: document.querySelectorAll('.course-chip').length,
        activePage: activeIndex,
        monthLabel: document.querySelector('.schedule-datebutton')?.textContent?.trim() ?? '',
        timelineItems: document.querySelectorAll('.timeline-item').length,
      };
    });
    if (extra.schedule.pageCount !== 2) throw new Error(`expected 2 pages covering 7 days, got ${extra.schedule.pageCount}`);
    if (extra.schedule.pageSize.some((size) => size !== 4)) throw new Error('each page must show 4 day columns');
    if (extra.schedule.rows !== 4) throw new Error(`expected 4 section rows, got ${extra.schedule.rows}`);
    if (!extra.schedule.chipCount) throw new Error('no courses rendered in the board');
  });
  await shot('21-schedule');

  await step('month / date picker recognises the schedule months', async () => {
    await clickTop('.schedule-datebutton');
    await page.waitForTimeout(700);
    extra.monthDialog = await page.locator('md-dialog[open] .month-chips').innerText();
    const months = await page.locator('md-dialog[open] .month-chips .chip').count();
    if (months < 2) throw new Error(`expected several term months, got ${months}`);
    await shot('27-schedule-months');
    await page.locator('md-dialog[open] .month-chips .chip').nth(1).click();
    await page.waitForTimeout(900);
    extra.monthAfterPick = await top().locator('.schedule-datebutton').innerText();
  });

  await step('back to today after the month jump', async () => {
    // 月历跳转后回到今天，确保当前周有课程可点开
    await clickTop('.app-bar md-icon-button', 1);
    await page.waitForTimeout(900);
  });

  await step('course detail shows the textbook from the cover library', async () => {
    // 确定性导航：先回课表首页、确保课表是展开的（v2 已取消自动收起，但手动收起状态会被保留），
    // 然后点页面上任意一张可见的课程卡片——不再假设"当前分页一定在 activePage 上"。
    if (!(await top().locator('.week-board').count())) {
      await clickTop('md-navigation-tab', 0);
      await page.waitForTimeout(1100);
    }
    if (await top().locator('.week-board.collapsed').count()) {
      await top().locator('.week-collapse-bar').click({ timeout: 7000, force: true });
      await page.waitForTimeout(900);
    }
    const chips = top().locator('.course-chip');
    const total = await chips.count();
    if (!total) throw new Error('课表上没有课程卡片（检查种子数据是否写入）');
    let opened = false;
    for (let i = 0; i < total; i += 1) {
      try {
        await chips.nth(i).click({ timeout: 4000, force: true });
        opened = true;
        break;
      } catch {
        /* 换下一张卡片 */
      }
    }
    if (!opened) throw new Error(`${total} 张课程卡片都点不开`);
    await waitTop('.sheet-panel');
    await page.waitForTimeout(800);
    extra.textbookCard = (await top().locator('.textbook-card').first().innerText()).replace(/\s+/g, ' ');
  });
  await shot('22-schedule-course-detail');

  await step('cover text is matched to the right course', async () => {
    await top().locator('md-outlined-button:has-text("手动填写")').click({ timeout: 7000 });
    await page.waitForTimeout(800);
    // 封面文字输入框是 textarea（多行）
    const area = top().locator('md-dialog[open] md-outlined-text-field textarea').first();
    await area.click({ force: true });
    await area.type('军事理论与技能训练教程 国防科技大学出版社', { delay: 12 });
    await page.waitForTimeout(400);
    await top().locator('md-dialog[open] md-text-button:has-text("按文字匹配课程")').click({ timeout: 7000 });
    await page.waitForTimeout(900);
    extra.matchedCourse = await top().locator('md-dialog[open] select').inputValue();
    extra.matchedTitle = await top()
      .locator('md-dialog[open] md-outlined-text-field')
      .nth(1)
      .evaluate((element) => element.value);
    // 应用会把内置教材库写回数据库，可能覆盖种子书名 —— 这里只要求"匹配到了某门课"
    if (!extra.matchedCourse) throw new Error('封面文字没有匹配到任何课程');
    if (!String(extra.matchedTitle).includes('军事理论')) throw new Error(`title not filled: ${extra.matchedTitle}`);
  });
  await shot('36-textbook-match');

  await step('saving the textbook marks it on the course', async () => {
    await top().locator('md-dialog[open] md-text-button:has-text("保存并标记")').click({ timeout: 7000 });
    await page.waitForTimeout(1200);
    extra.textbookSnackbar = (await page.locator('.snackbar').first().innerText()).replace(/\s+/g, ' ');
    if (!extra.textbookSnackbar.includes('标记到') && !extra.textbookSnackbar.includes('教材')) throw new Error(`unexpected snackbar: ${extra.textbookSnackbar}`);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(700);
  });

  await step('close course detail', async () => {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(700);
  });

  await step('dragging the board pages through the week', async () => {
    const board = top().locator('.week-board-viewport, .week-board').first();
    const box = await board.boundingBox();
    if (!box) throw new Error('board not found');
    const readPage = () =>
      page.evaluate(() =>
        Array.from(document.querySelectorAll('.board-dot-pill')).findIndex((dot) => dot.classList.contains('active')),
      );
    const drag = async (fromRatio, toRatio) => {
      await page.mouse.move(box.x + box.width * fromRatio, box.y + box.height * 0.4);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width * toRatio, box.y + box.height * 0.4, { steps: 12 });
      await page.mouse.up();
      await page.waitForTimeout(900);
    };
    const before = await readPage();
    await drag(0.75, 0.2); // swipe left -> next page
    let after = await readPage();
    if (after === before) {
      await drag(0.25, 0.8); // already at the last page -> swipe right
      after = await readPage();
    }
    extra.pageBefore = before;
    extra.pageAfter = after;
    if (after === before) throw new Error('dragging did not page the board');
  });
  await shot('23-schedule-paged');

  await step('swiping down collapses the board', async () => {
    const board = top().locator('.week-board-viewport, .week-board').first();
    const box = await board.boundingBox();
    if (!box) throw new Error('board not found');
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.35);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.35 + 90, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(900);
    extra.collapsed = await top().locator('.week-board.collapsed').count();
    extra.collapseLabel = await top().locator('.week-collapse-bar').innerText();
    if (!extra.collapsed) throw new Error('board did not collapse on the downward swipe');
  });
  await shot('28-schedule-collapsed');

  await step('tapping the summary expands the board again', async () => {
    await clickTop('.week-collapse-bar');
    await page.waitForTimeout(700);
    const stillCollapsed = await top().locator('.week-board.collapsed').count();
    if (stillCollapsed) throw new Error('board did not expand');
  });

  await step('schedule filter screen', async () => {
    await clickTop('md-navigation-tab', 1);
    // 分类标签 + 搜索栏已合并成一个按钮，点开是老师/课程/地点/时间面板
    await waitTop('.filter-button');
    extra.filterButton = (await top().locator('.filter-button').innerText()).replace(/\s+/g, ' ');
    await top().locator('.filter-button').click({ force: true, timeout: 7000 });
    await waitTop('.sheet-panel');
    await page.waitForTimeout(700);
    extra.filterSheet = (await top().locator('.sheet-panel').innerText()).replace(/\s+/g, ' ').slice(0, 80);
    if (!/老师|课程|地点|时间/.test(extra.filterSheet)) {
      throw new Error(`filter sheet is missing sections: ${extra.filterSheet}`);
    }
    extra.filterFields = await top().locator('.sheet-panel md-outlined-text-field').count();
    await top().locator('.sheet-panel md-filled-tonal-button').first().click({ timeout: 7000 });
    await page.waitForTimeout(900);
    extra.filterResults = await top().locator('.filter-row').count();
  });
  await shot('24-schedule-filter');

  await step('filter result highlights the course', async () => {
    await clickTop('.filter-row', 0);
    await waitTop('.week-grid');
    await page.waitForTimeout(900);
    extra.highlighted = await top().locator('.course-chip.highlight').count();
  });
  await shot('25-schedule-highlight');

  await step('schedule import sheet', async () => {
    await clickTop('.appbar-import');
    await waitTop('.sheet-panel');
    await page.waitForTimeout(700);
    extra.importSheet = (await top().locator('.sheet-panel').innerText()).slice(0, 220);
  });
  await shot('26-schedule-import');

  /* 课表导入：必须调起系统文件浏览器（input[type=file]，且不限制 accept） */
  await step('schedule import opens the system file browser', async () => {
    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser', { timeout: 9000 }),
      top()
        .locator('md-filled-tonal-button:has-text("系统文件管理器")')
        .click({ timeout: 7000 }),
    ]);
    extra.fileChooserAccept = await chooser.element().getAttribute('accept');
    if (extra.fileChooserAccept) throw new Error(`accept filter should be empty, got ${extra.fileChooserAccept}`);
    await chooser.setFiles(SCHEDULE_FIXTURE);
    await page.waitForTimeout(1400);
    // 导入成功后「课表数据」面板会自动收起，用消息条确认结果
    extra.importSnackbar = await page.locator('.snackbar').first().innerText({ timeout: 8000 });
    if (!extra.importSnackbar.includes('已导入')) throw new Error(`unexpected snackbar: ${extra.importSnackbar}`);
  });
  await shot('31-schedule-imported-file');

  await step('imported course shows up on the board', async () => {
    await page.waitForTimeout(600);
    extra.importedChip = await top().locator('.course-chip:has-text("导入测试课程")').count();
    if (!extra.importedChip) throw new Error('imported course not rendered');
  });
  await shot('32-schedule-imported-board');

  await step('restore the demo schedule', async () => {
    // 作者按隐私要求清空了内置课表；这里恢复的是验收用的演示课表
    await seedDemoData();
    await page.waitForTimeout(1500);
  });
} catch (error) {
  steps.push(`FATAL: ${error instanceof Error ? error.message : error}`);
} finally {
  clearTimeout(watchdog);
  await persist();
  await browser.close();
}

console.log(
  JSON.stringify({ extra, consoleErrors: consoleErrors.slice(0, 10), pageErrors: pageErrors.slice(0, 5), steps }, null, 2),
);
const failed = steps.some((entry) => entry.startsWith('FAIL') || entry.startsWith('FATAL'));
if (failed || pageErrors.length) process.exitCode = 1;
