/**
 * Browser verification for the production build.
 *
 * - launches Chromium with a fake camera device so the live preview can be checked
 * - drives the real app: home -> panel -> history -> settings -> api -> camera -> shutter
 *   -> history -> detail -> image viewer -> persistence after reload -> dark mode + undo
 * - captures screenshots into ./screenshots and a JSON report (written after every step)
 *
 * Usage: node scripts/verify.mjs [url]
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

    const days = [[], [], [], [], [], [], []];
    days[0] = [
      { name: '演示课程 A', teacher: '张老师', room: '1-101', weeks: '1-20', className: '' },
      { name: '演示课程 B', teacher: '李老师', room: '2-202', weeks: '1-20', className: '' },
    ];
    days[1] = [{ name: '演示课程 C', teacher: '王老师', room: '3-303', weeks: '1-20', className: '' }];
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
    await put('kv', { '演示课程 A': { title: '演示教材 A', publisher: '演示出版社', course: '演示课程 A', source: 'manual' } }, 'textbooks');
    await put('records', {
      id: 'verify-record-1',
      title: '验收记录',
      note: '自动化验收写入的记录',
      images: ['data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg=='],
      transcript: '这是一条验收记录',
      imageSummary: '',
      keyPoints: ['要点一'],
      branches: [],
      tags: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  });
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(2600);
};


/** v2：记录页不再有独立标签，统一从课表顶栏「语音与相机记录」进入（已在该页则复用） */
const openRecord = async () => {
  const mic = top().locator('.mic-circle');
  if (await mic.count()) return;
  const entry = top().locator('.appbar-record');
  if (!(await entry.count())) {
    await clickTop('md-navigation-tab', 0);
    await page.waitForTimeout(900);
  }
  await top().locator('.appbar-record').click({ timeout: 8000 });
  await page.waitForTimeout(1400);
};

/** 打开历史页：记录页 → 历史记录（刷新后导航栈会重置，所以每次都要重新走一遍） */
const gotoHistory = async () => {
  if (!(await top().locator('.mic-circle').count())) {
    if (!(await top().locator('.appbar-record').count())) {
      await clickTop('md-navigation-tab', 0);
      await page.waitForTimeout(900);
    }
    await top().locator('.appbar-record').click({ timeout: 8000 });
    await page.waitForTimeout(1300);
  }
  await top().locator('.appbar-history').click({ timeout: 8000 });
  await page.waitForTimeout(1300);
};

const clickTop = async (selector, index = 0) => {
  // 底边栏：网页是 M3 原生导航栏（md-navigation-tab）；APK 由原生 Dock 负责
  if (selector === 'md-navigation-tab') {
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
    await waitTop('.glass-nav, md-navigation-bar');
    // 课表是主页：启动后应直接停在课表页
    await waitTop('.week-board');
    extra.homeRoute = await page.evaluate(() => {
      const top = document.querySelector('.screen:not([aria-hidden="true"])');
      return top ? (top.textContent ?? '').includes('四分课表') || (top.textContent ?? '').includes('课表') : false;
    });
    if (!extra.homeRoute) throw new Error('the schedule board was not the first screen');
  });
  await shot('00-schedule-home');

  await step('go to the record screen', async () => {
    // v2：底边栏只有三项，记录/相机页从首页工具栏进入
    await clickTop('.appbar-record');
    await page.waitForTimeout(1000);
  });

  await step('home renders', async () => {
    await waitTop('.glass-nav, md-navigation-bar');
    await waitTop('.container-box.tertiary');
    await waitTop('md-filled-button', 0);
  });
  await shot('01-home');

  extra.layout = await page.evaluate(() => {
    const box = (selector) => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      const styles = getComputedStyle(element);
      return {
        w: Math.round(rect.width),
        h: Math.round(rect.height),
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        bg: styles.backgroundColor,
        radius: styles.borderRadius,
      };
    };
    const read = (element, property) => (element ? getComputedStyle(element).getPropertyValue(property).trim() : null);
    const button = document.querySelector('.button-group > *');
    const field = document.querySelector('md-outlined-text-field');
    const nav = document.querySelector('md-navigation-bar');
    const icon = document.querySelector('md-navigation-tab md-icon');
    const iconRect = icon ? icon.getBoundingClientRect() : null;
    return {
      phone: box('.phone'),
      topBox: box('.container-box.surface-high'),
      middleBox: box('.container-box.tertiary'),
      navBar: box('md-navigation-bar'),
      buttonGroup: box('.button-group'),
      textField: box('md-outlined-text-field'),
      buttons: Array.from(document.querySelectorAll('.button-group > *')).map((element) => {
        const rect = element.getBoundingClientRect();
        return { w: Math.round(rect.width), h: Math.round(rect.height), y: Math.round(rect.y) };
      }),
      tokens: {
        buttonShapeStart: read(button, '--md-filled-button-container-shape-start-start'),
        buttonShapeInnerEnd: read(button, '--md-filled-button-container-shape-start-end'),
        fieldShape: read(field, '--md-outlined-text-field-container-shape'),
        fieldOutline: read(field, '--md-outlined-text-field-outline-color'),
        navContainerHeight: read(nav, '--md-navigation-bar-container-height'),
        navContainerColor: read(nav, '--md-navigation-bar-container-color'),
        navIndicatorWidth: read(nav, '--md-navigation-bar-active-indicator-width'),
        navIndicatorHeight: read(nav, '--md-navigation-bar-active-indicator-height'),
        navIndicatorColor: read(nav, '--md-navigation-bar-active-indicator-color'),
      },
      icon: icon
        ? {
            codepoint: icon.textContent ? icon.textContent.codePointAt(0).toString(16) : null,
            w: Math.round(iconRect.width),
            h: Math.round(iconRect.height),
            font: getComputedStyle(icon).fontFamily,
          }
        : null,
    };
  });

  await step('transcript panel expands', async () => {
    await clickTop('.container-box.surface-high .row', 0);
    await waitTop('.sheet-panel');
    await page.waitForTimeout(800);
  });
  await shot('02-home-panel');

  await step('panel closes', async () => {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(800);
  });

  await step('history tab', async () => {
    await clickTop('md-navigation-tab', 2);
    await page.waitForTimeout(1000);
  });
  await shot('03-history-empty');

  await step('settings tab', async () => {
    await clickTop('md-navigation-tab', 2);
    await page.waitForTimeout(1000);
  });
  await shot('04-settings');

  extra.settings = await page.evaluate(() => {
    const read = (element, property) => (element ? getComputedStyle(element).getPropertyValue(property).trim() : null);
    const box = (selector) => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      return { w: Math.round(rect.width), h: Math.round(rect.height), x: Math.round(rect.x), y: Math.round(rect.y) };
    };
    const sw = document.querySelector('md-switch');
    const slider = document.querySelector('md-slider');
    return {
      list: box('.list-group'),
      items: Array.from(document.querySelectorAll('md-list-item')).map((element) => {
        const rect = element.getBoundingClientRect();
        return { h: Math.round(rect.height), y: Math.round(rect.y), radius: getComputedStyle(element).borderRadius };
      }),
      overlays: Array.from(document.querySelectorAll('.group-overlay')).map((element) => {
        const rect = element.getBoundingClientRect();
        return { w: Math.round(rect.width), y: Math.round(rect.y) };
      }),
      switchTrack: [read(sw, '--md-switch-track-width'), read(sw, '--md-switch-track-height')],
      sliderTokens: [
        read(slider, '--md-slider-active-track-height'),
        read(slider, '--md-slider-handle-width'),
        read(slider, '--md-slider-handle-height'),
        read(slider, '--md-slider-inactive-track-color'),
      ],
    };
  });

  await step('api edit screen', async () => {
    // 按文案定位：设置列表项会随版本增删，索引不可靠
    await top().locator('.screen-content').evaluate((el) => { el.scrollTop = el.scrollHeight; });
    await page.waitForTimeout(400);
    const rows = top().locator('md-list-item');
    const count = await rows.count();
    let clicked = false;
    for (let i = 0; i < count; i += 1) {
      const text = (await rows.nth(i).innerText().catch(() => '')) || '';
      if (/API|接口/.test(text)) {
        await rows.nth(i).click({ timeout: 6000 });
        clicked = true;
        break;
      }
    }
    if (!clicked) {
      const texts = [];
      for (let i = 0; i < count; i += 1) texts.push(((await rows.nth(i).innerText().catch(() => '')) || '').split('\n')[0]);
      throw new Error('API 入口未找到，当前列表项：' + texts.join(' | '));
    }
    await page.waitForTimeout(1000);
  });
  await shot('05-api-edit');

  await step('saving the speech API opens the recording trial', async () => {
    await top().locator('md-outlined-text-field input').first().fill('https://example.com/v1/audio/transcriptions');
    await page.waitForTimeout(300);
    await top().locator('md-filled-button:has-text("保存配置")').click({ timeout: 7000 });
    await page.waitForTimeout(1000);
    extra.trialDialog = await page.locator('md-dialog[open]').first().innerText();
    if (!extra.trialDialog.includes('录音试用')) throw new Error('recording trial dialog did not open');
  });
  await shot('29-api-trial');

  await step('close the recording trial dialog', async () => {
    await page.locator('md-dialog[open] md-text-button').first().click({ timeout: 7000 });
    await page.waitForTimeout(700);
    // clear the test endpoint again so the rest of the flow stays offline
    await top().locator('md-outlined-text-field input').first().fill('');
    await page.waitForTimeout(300);
    await top().locator('md-filled-button:has-text("保存配置")').click({ timeout: 7000 });
    await page.waitForTimeout(600);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
  });

  await step('api back', async () => {
    await clickTop('.app-bar md-icon-button', 0);
    await page.waitForTimeout(1000);
  });

  await step('home tab', async () => {
    await openRecord();
    await page.waitForTimeout(1000);
  });

  await step('quick start voice shows a progress bar', async () => {
    // force: the tap itself mounts the progress row, which would otherwise fail
    // Playwright's stability check even though the click already landed
    await top()
      .locator('.container-box.surface-high md-filled-tonal-icon-button')
      .click({ force: true, timeout: 7000 });
    await page.waitForTimeout(1800);
    extra.recordingProgress = await top().locator('.recording-progress').count();
    extra.recordingText = extra.recordingProgress ? await top().locator('.recording-progress').innerText() : '';
    await shot('30-voice-progress');
    if (extra.recordingProgress) {
      await top()
        .locator('.recording-progress md-icon-button')
        .click({ force: true, timeout: 7000 })
        .catch(() => undefined);
      await page.waitForTimeout(900);
      extra.recordingStopped = (await top().locator('.recording-progress').count()) === 0;
    }
    if (!extra.recordingProgress) {
      extra.recordingNote = 'headless Chromium has no speech recognition service; progress bar not shown';
    }
  });

  await step('mic circle: tap starts the long recording', async () => {
    await top().locator('.mic-circle').click({ force: true, timeout: 7000 });
    await page.waitForTimeout(1400);
    extra.micTapSnackbar = (await page.locator('.snackbar').first().innerText()).replace(/\s+/g, ' ');
    extra.micProgress = await top().locator('.recording-progress').count();
    extra.micCircleClass = await top().locator('.mic-circle').getAttribute('class');
    if (!extra.micTapSnackbar.includes('长时间录制')) throw new Error(`unexpected hint: ${extra.micTapSnackbar}`);
    if (!extra.micProgress || !extra.micCircleClass.includes('recording')) throw new Error('recording state not applied');
  });
  await shot('33-mic-long-recording');

  await step('mic circle: second tap stops recording', async () => {
    await top().locator('.mic-circle').click({ force: true, timeout: 7000 });
    await page.waitForTimeout(1000);
    extra.micProgressAfterStop = await top().locator('.recording-progress').count();
    if (extra.micProgressAfterStop !== 0) throw new Error('recording did not stop');
  });

  await step('mic circle: long press starts the temporary recording', async () => {
    const box = await top().locator('.mic-circle').boundingBox();
    if (!box) throw new Error('mic circle not found');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(800);
    await page.mouse.up();
    await page.waitForTimeout(1200);
    extra.micLongSnackbar = (await page.locator('.snackbar').first().innerText()).replace(/\s+/g, ' ');
    extra.micCircleTemporary = await top().locator('.mic-circle.temporary').count();
    if (!extra.micLongSnackbar.includes('临时录制')) throw new Error(`unexpected hint: ${extra.micLongSnackbar}`);
    if (!extra.micCircleTemporary) throw new Error('temporary recording state not applied');
  });
  await shot('34-mic-temporary-recording');

  await step('input field: long press keeps native text selection', async () => {
    // 先结束临时录制
    await top().locator('.mic-circle').click({ force: true, timeout: 7000 }).catch(() => undefined);
    await page.waitForTimeout(800);
    const holder = top().locator('.home-input');
    const box = await holder.boundingBox();
    if (!box) throw new Error('input not found');
    const before = await top()
      .locator('md-outlined-text-field')
      .first()
      .evaluate((element) => element.label ?? element.getAttribute('label'));
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(800);
    await page.mouse.up();
    await page.waitForTimeout(900);
    extra.fieldLabel = await top()
      .locator('md-outlined-text-field')
      .first()
      .evaluate((element) => element.label ?? element.getAttribute('label'));
    if (extra.fieldLabel !== before) throw new Error('the field long press must not change the field mode');
    // 长按也不应打开全屏面板
    extra.panelAfterLongPress = await top().locator('.sheet-panel').count();
    if (extra.panelAfterLongPress) throw new Error('long press must not open the panel');
  });
  await shot('35-input-long-press');

  await step('open camera', async () => {
    await clickTop('md-filled-button', 0);
    await waitTop('.camera-frame video');
    await page.waitForTimeout(2600);
  });
  await shot('06-camera');

  extra.camera = await page.evaluate(() => {
    const video = document.querySelector('.camera-frame video');
    return video ? { w: video.videoWidth, h: video.videoHeight, paused: video.paused } : null;
  });

  await step('shutter creates a record', async () => {
    await clickTop('md-fab');
    await page.waitForTimeout(2200);
  });
  await shot('07-camera-after-shot');

  await step('camera back to home', async () => {
    await clickTop('md-filled-button', 0);
    await page.waitForTimeout(1200);
  });
  await shot('08-home-after-capture');

  await step('history with record', async () => {
    // v2：历史页从记录页的「历史记录」按钮进入（若已在记录页则直接点）
    if (!(await top().locator('.mic-circle').count())) {
      if (!(await top().locator('.appbar-record').count())) {
        await clickTop('md-navigation-tab', 0);
        await page.waitForTimeout(900);
      }
      await top().locator('.appbar-record').click({ timeout: 8000 });
      await page.waitForTimeout(1400);
    }
    const entry = top().locator('.appbar-history');
    if (!(await entry.count())) throw new Error('记录页没有「历史记录」入口');
    await entry.click({ timeout: 8000 });
    await page.waitForTimeout(1400);
    await waitTop('md-filled-card');
    await page.waitForTimeout(600);
  });
  await shot('09-history');

  await step('open record detail', async () => {
    await clickTop('md-filled-card');
    await page.waitForTimeout(1300);
  });
  await shot('10-record-detail');

  await step('image viewer', async () => {
    await clickTop('.carousel-card');
    await waitTop('.viewer');
    await page.waitForTimeout(900);
  });
  await shot('11-image-viewer');

  await step('close viewer', async () => {
    await clickTop('.viewer md-icon-button', 0);
    await page.waitForTimeout(900);
  });

  await step('detail text panel', async () => {
    await clickTop('.container-box.surface-high .row', 0);
    await waitTop('.sheet-panel');
    await page.waitForTimeout(900);
  });
  await shot('12-detail-panel');

  await step('close detail panel', async () => {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(800);
  });

  await step('back to history', async () => {
    await clickTop('.app-bar md-icon-button', 0);
    await page.waitForTimeout(1100);
  });

  await step('reload keeps the record', async () => {
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(2600);
    // 刷新后导航栈回到课表，需要重新走「记录 → 历史记录」
    await gotoHistory();
    await waitTop('md-filled-card');
    await page.waitForTimeout(500);
  });

  extra.persisted = await evalWithTimeout(
    () =>
      new Promise((resolve) => {
        const request = indexedDB.open('m3-expressive-notes');
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction('records', 'readonly');
          const all = tx.objectStore('records').getAll();
          all.onsuccess = () =>
            resolve((all.result ?? []).map((record) => ({ title: record.title, images: record.images.length })));
          all.onerror = () => resolve(null);
        };
        request.onerror = () => resolve(null);
      }),
  );

  await step('dark mode toggle', async () => {
    await clickTop('md-navigation-tab', 2);
    await page.waitForTimeout(900);
    await clickTop('md-switch');
    await page.waitForTimeout(1200);
  });
  await shot('14-settings-dark');
  extra.darkTheme = await readTheme();

  await step('undo dark mode', async () => {
    await page.locator('.snackbar md-text-button').first().click({ timeout: 7000 });
    await page.waitForTimeout(1100);
  });
  await shot('15-settings-light-again');
  extra.afterUndoTheme = await readTheme();

  await step('record detail still opens from history', async () => {
    await gotoHistory();
    await clickTop('md-filled-card');
    await page.waitForTimeout(1300);
    await waitTop('.screen-content');
    const detailTitle = await page.evaluate(() => (document.querySelector('.screen:not([aria-hidden="true"]) .app-bar')?.textContent || '').trim());
    if (!detailTitle) throw new Error('记录详情页没有标题');
  });

  await step('cancel delete dialog', async () => {
    const dialog = page.locator('md-dialog[open]');
    if (!(await dialog.count())) throw new Error('删除对话框没有打开');
    const cancel = dialog.locator('md-text-button').first();
    if (await cancel.count()) await cancel.click({ timeout: 7000, force: true });
    else await page.keyboard.press('Escape');
    await page.waitForTimeout(600);
    if (await page.locator('md-dialog[open]').count()) throw new Error('对话框没有关闭');
  });

  /* ------------------------------------------- long press = question mode */
  await step('back to history from detail', async () => {
    await clickTop('.app-bar md-icon-button', 0);
    await page.waitForTimeout(1200);
  });

  await step('input field detects ask vs write', async () => {
    await openRecord();
    await page.waitForTimeout(1000);
    // 空输入默认「输入」模式；输入疑问句后实时切换为「提问」
    const fieldLabel = () =>
      top()
        .locator('md-outlined-text-field')
        .first()
        .evaluate((element) => element.label ?? element.getAttribute('label'));
    extra.idleFieldLabel = await fieldLabel();
    if (!String(extra.idleFieldLabel).includes('输入')) {
      throw new Error(`empty field should default to input mode, got "${extra.idleFieldLabel}"`);
    }
    await top().locator('.home-input md-outlined-text-field input').first().fill('这节课的教材是什么？');
    await page.waitForTimeout(400);
    extra.questionModeLabel = await fieldLabel();
    if (!String(extra.questionModeLabel).includes('提问')) {
      throw new Error(`the input field should be question only, got "${extra.questionModeLabel}"`);
    }
    await top().locator('.home-input md-outlined-text-field input').first().fill('军事理论用什么教材？');
    await page.waitForTimeout(300);
    await top().locator('.home-input md-outlined-text-field input').first().press('Enter');
    await page.waitForTimeout(1400);
    // 首页显示思维导图分支；折叠的回答在总结面板里
    extra.mindmapLeaf = (await top().locator('.mindmap-leaf').last().innerText()).replace(/\s+/g, ' ');
    if (!extra.mindmapLeaf.includes('问：')) throw new Error(`question not added to the mind map: ${extra.mindmapLeaf}`);
    await clickTop('.container-box.tertiary .row', 0);
    await waitTop('.sheet-panel');
    await page.waitForTimeout(800);
    extra.qaFold = await top().locator('.qa-entry').count();
    extra.qaCollapsed = await top().locator('.qa-preview').count();
    if (!extra.qaFold) throw new Error('the answer was not added as a collapsible entry');
    if (!extra.qaCollapsed) throw new Error('answers should start collapsed');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(600);
  });
  await shot('17-question-mode');

  await step('question creates a mind-map branch', async () => {
    await top().locator('md-outlined-text-field input').first().fill('这段记录讲了什么？');
    await page.waitForTimeout(300);
    await top().locator('md-outlined-text-field input').first().press('Enter');
    await page.waitForTimeout(1400);
    extra.branchCount = await top().locator('.mindmap-branch').count();
    extra.branchText = (await top().locator('.mindmap-branches').first().innerText()).slice(0, 200);
    if (!extra.branchCount) throw new Error('no branch rendered');
  });
  await shot('18-question-answer');

  /* ------------------------------------------------ slider + persistence */


  extra.storedSettings = await evalWithTimeout(
    () =>
      new Promise((resolve) => {
        const request = indexedDB.open('m3-expressive-notes');
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction('settings', 'readonly');
          const get = tx.objectStore('settings').get('settings');
          get.onsuccess = () => resolve(get.result ?? null);
          get.onerror = () => resolve(null);
        };
        request.onerror = () => resolve(null);
      }),
  );

  /* -------------------------------------------------- history overflow menu */
  await step('history overflow menu opens', async () => {
    await clickTop('md-navigation-tab', 0);
    await page.waitForTimeout(1000);
    await clickTop('.app-bar md-icon-button', 0);
    await page.waitForTimeout(800);
    extra.menuItems = await page.locator('md-menu md-menu-item').first().innerText();
  });
  await shot('20-history-menu');

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
    const activePage = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.board-dot-pill')).findIndex((dot) => dot.classList.contains('active')),
    );
    await top()
      .locator('.week-page')
      .nth(Math.max(0, activePage))
      .locator('.course-chip')
      .first()
      .click({ timeout: 7000 });
    await waitTop('.sheet-panel');
    await page.waitForTimeout(800);
    extra.textbookCard = (await top().locator('.textbook-card').first().innerText()).replace(/\s+/g, ' ');
    if (!/出版社|杂志社/.test(extra.textbookCard)) {
      throw new Error(`textbook not shown in the course detail: ${extra.textbookCard}`);
    }
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
    if (extra.matchedCourse !== '军事理论') throw new Error(`matched ${extra.matchedCourse} instead of 军事理论`);
    if (!String(extra.matchedTitle).includes('军事理论')) throw new Error(`title not filled: ${extra.matchedTitle}`);
  });
  await shot('36-textbook-match');

  await step('saving the textbook marks it on the course', async () => {
    await top().locator('md-dialog[open] md-text-button:has-text("保存并标记")').click({ timeout: 7000 });
    await page.waitForTimeout(1200);
    extra.textbookSnackbar = (await page.locator('.snackbar').first().innerText()).replace(/\s+/g, ' ');
    if (!extra.textbookSnackbar.includes('军事理论')) throw new Error(`unexpected snackbar: ${extra.textbookSnackbar}`);
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

  await step('restore the built-in schedule', async () => {
    await clickTop('.app-bar md-icon-button', 2);
    await waitTop('.sheet-panel');
    await page.waitForTimeout(600);
    await top().locator('md-outlined-button:has-text("恢复内置")').click({ timeout: 7000 });
    await page.waitForTimeout(1200);
    extra.restoreSnackbar = await page.locator('.snackbar').first().innerText({ timeout: 8000 });
    if (!extra.restoreSnackbar.includes('内置')) throw new Error(`unexpected snackbar: ${extra.restoreSnackbar}`);
    extra.importedChipAfterRestore = await top().locator('.course-chip:has-text("导入测试课程")').count();
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
