/**
 * 视觉验收：把 **APK 内嵌的 Web 资源**（app/src/main/assets/www）与**线上网页**
 * 在同一台虚拟设备上分别截图，逐屏对照，确认「APK 与网页一致」。
 *
 * Usage: node scripts/visual-parity.mjs [liveUrl]
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const LIVE = process.argv[2] ?? 'https://tequed232.github.io/duofen-kebiao/';
const APK_WWW = 'app/src/main/assets/www';
const OUT = 'screenshots-parity';
const PORT = 4180;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml',
};

/** 用本地静态服务模拟 APK：内容就是 assets/www 里打进 APK 的那份 */
const server = createServer(async (request, response) => {
  const url = new URL(request.url, `http://127.0.0.1:${PORT}`);
  const rel = url.pathname === '/' ? '/index.html' : url.pathname;
  try {
    const file = await readFile(path.join(APK_WWW, decodeURIComponent(rel)));
    response.writeHead(200, { 'Content-Type': MIME[path.extname(rel)] ?? 'application/octet-stream' });
    response.end(file);
  } catch {
    response.writeHead(404).end('not found');
  }
});
await new Promise((resolve) => server.listen(PORT, '127.0.0.1', resolve));

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch({ channel: 'chromium' });

async function shoot(label, base) {
  const page = await browser.newPage({
    viewport: { width: 412, height: 892 },
    hasTouch: true,
    deviceScaleFactor: 2,
  });
  page.setDefaultTimeout(9000);
  await page.goto(base, { waitUntil: 'load' });
  await page.waitForTimeout(3400); // 等开屏动画走完
  const top = () => page.locator('.screen:not([aria-hidden="true"])');

  const steps = [
    ['01-schedule', async () => {}],
    ['02-record', async () => {
      await top().locator('md-navigation-tab').nth(1).click();
      await page.waitForTimeout(1200);
    }],
    ['03-settings', async () => {
      await top().locator('md-navigation-tab').nth(3).click();
      await page.waitForTimeout(1200);
    }],
    ['04-about', async () => {
      await top().locator('md-list-item').nth(7).click();
      await page.waitForTimeout(1400);
    }],
  ];

  for (const [name, action] of steps) {
    await action();
    await page.screenshot({ path: `${OUT}/${label}-${name}.png` });
  }
  await page.close();
}

await shoot('apk', `http://127.0.0.1:${PORT}/`);
await shoot('web', LIVE);

await browser.close();
server.close();
console.log(`截图完成：${OUT}/apk-*.png（APK 内嵌资源） 与 ${OUT}/web-*.png（线上网页）`);
