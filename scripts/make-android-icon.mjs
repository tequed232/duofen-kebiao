/**
 * 生成 Android 启动图标：**全部使用 Material 资源**，不含任何第三方插画。
 *
 * 背景 = M3 主色（primary）；前景 = Material Symbols Rounded 的 calendar_month 字形。
 * 环境里 GDI+ 读不了 woff2，所以用 Playwright 的 Chromium 渲染（与应用同一份字体管线），
 * 再缩放到各密度。
 *
 * Usage: node scripts/make-android-icon.mjs
 */
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const RES = 'app/src/main/res';
const FONT = 'node_modules/material-symbols/material-symbols-rounded.woff2';
const CODEPOINTS = 'web/src/theme/icon-codepoints.ts';

/** M3 主色，与 web/src/theme/palette.ts 的 Green 备用方案一致 */
const PRIMARY = '#12512E';
const ON_PRIMARY = '#FFFFFF';

const codepoints = await readFile(CODEPOINTS, 'utf8');
const match = /"calendar_month":\s*0x([0-9a-fA-F]+)/.exec(codepoints);
if (!match) throw new Error('找不到 calendar_month 码点');
const glyph = String.fromCodePoint(Number.parseInt(match[1], 16));

const fontBase64 = (await readFile(FONT)).toString('base64');
const MASTER = 512;

/** Liquid Glass 应用标识（与 web/src/components/glass.tsx 同一套矢量设计） */
const GLASS_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="100%" height="100%">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#DCE6F7"/><stop offset="45%" stop-color="#E7E3F3"/><stop offset="100%" stop-color="#F6E3D2"/>
    </linearGradient>
    <linearGradient id="g1" x1="0" y1="0" x2="0.4" y2="1"><stop offset="0%" stop-color="#7ED957" stop-opacity="0.95"/><stop offset="100%" stop-color="#2E7D32" stop-opacity="0.85"/></linearGradient>
    <linearGradient id="g2" x1="0" y1="0" x2="0.4" y2="1"><stop offset="0%" stop-color="#A98BF0" stop-opacity="0.9"/><stop offset="100%" stop-color="#6A4FBF" stop-opacity="0.8"/></linearGradient>
    <linearGradient id="g3" x1="0" y1="0" x2="0.4" y2="1"><stop offset="0%" stop-color="#F0736A" stop-opacity="0.9"/><stop offset="100%" stop-color="#C1362C" stop-opacity="0.8"/></linearGradient>
    <linearGradient id="sheen" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.85"/><stop offset="55%" stop-color="#FFFFFF" stop-opacity="0.06"/><stop offset="100%" stop-color="#FFFFFF" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect x="4" y="4" width="192" height="192" rx="48" fill="url(#bg)"/>
  <rect x="4" y="4" width="192" height="192" rx="48" fill="none" stroke="#FFFFFF" stroke-opacity="0.65" stroke-width="2"/>
  <g transform="rotate(38 100 100)">
    <rect x="46" y="34" width="108" height="44" rx="22" fill="url(#g2)"/>
    <rect x="46" y="34" width="108" height="22" rx="11" fill="url(#sheen)"/>
  </g>
  <g transform="rotate(38 100 100) translate(14 40)">
    <rect x="46" y="34" width="108" height="44" rx="22" fill="url(#g3)"/>
    <rect x="46" y="34" width="108" height="22" rx="11" fill="url(#sheen)"/>
  </g>
  <g transform="rotate(38 100 100) translate(-28 -8)">
    <rect x="46" y="34" width="108" height="44" rx="22" fill="url(#g1)"/>
    <rect x="46" y="34" width="108" height="22" rx="11" fill="url(#sheen)"/>
    <circle cx="64" cy="52" r="5" fill="#FFFFFF" fill-opacity="0.75"/>
  </g>
</svg>`;

/** 用 Chromium 渲染一张 512×512 母图（padding 决定玻璃方块占画布的比例） */
async function renderMaster(padding, out, bg) {
  const browser = await chromium.launch({ channel: 'chromium' });
  const page = await browser.newPage({ viewport: { width: MASTER, height: MASTER }, deviceScaleFactor: 1 });
  await page.setContent(
    `<!doctype html><meta charset="utf-8"><style>
      html, body { margin: 0; width: ${MASTER}px; height: ${MASTER}px; background: ${bg}; }
      .wrap { width: ${MASTER}px; height: ${MASTER}px; padding: ${padding}px; box-sizing: border-box; }
      svg { display: block; width: 100%; height: 100%; }
    </style><div class="wrap">${GLASS_SVG}</div>`,
    { waitUntil: 'load' },
  );
  await page.waitForTimeout(200);
  await page.screenshot({ path: out, omitBackground: bg === 'transparent' });
  await browser.close();
}
await mkdir('build/icons', { recursive: true });
const masterFull = 'build/icons/master-full.png'; // 传统图标：字形更大
const masterFg = 'build/icons/master-fg.png'; // 自适应前景：留安全区
await renderMaster(6, masterFull, 'transparent');
await renderMaster(34, masterFg, 'transparent');

const DENSITIES = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
const FOREGROUND = { mdpi: 108, hdpi: 162, xhdpi: 216, xxhdpi: 324, xxxhdpi: 432 };

/** 缩放到各密度并写进 res/（顺带做圆形裁切） */
const ps = `
Add-Type -AssemblyName System.Drawing
function Resize-Png([string]$src, [string]$dst, [int]$size, [bool]$round) {
  $img = [System.Drawing.Image]::FromFile($src)
  $bmp = New-Object System.Drawing.Bitmap($size, $size)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = 'HighQualityBicubic'
  $g.SmoothingMode = 'HighQuality'
  $g.PixelOffsetMode = 'HighQuality'
  $rect = New-Object System.Drawing.Rectangle(0, 0, $size, $size)
  if ($round) {
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $path.AddEllipse($rect)
    $g.SetClip($path)
  }
  $g.DrawImage($img, $rect)
  $g.Dispose()
  $bmp.Save($dst, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  $img.Dispose()
}
$map = @{ ${Object.entries(DENSITIES).map(([d, s]) => `'${d}' = ${s}`).join('; ')} }
$fg = @{ ${Object.entries(FOREGROUND).map(([d, s]) => `'${d}' = ${s}`).join('; ')} }
foreach ($d in $map.Keys) {
  $dir = Join-Path '${path.resolve(RES)}' "mipmap-$d"
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
  Resize-Png '${path.resolve(masterFull)}' (Join-Path $dir 'ic_launcher.png') $map[$d] $false
  Resize-Png '${path.resolve(masterFull)}' (Join-Path $dir 'ic_launcher_round.png') $map[$d] $true
  Resize-Png '${path.resolve(masterFg)}' (Join-Path $dir 'ic_launcher_foreground.png') $fg[$d] $false
}
Write-Output 'resized'
`;
execFileSync('powershell', ['-NoProfile', '-Command', ps], { stdio: 'inherit' });

const anydpi = path.join(RES, 'mipmap-anydpi-v26');
await mkdir(anydpi, { recursive: true });
const adaptive = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background" />
    <foreground android:drawable="@mipmap/ic_launcher_foreground" />
</adaptive-icon>
`;
await writeFile(path.join(anydpi, 'ic_launcher.xml'), adaptive, 'utf8');
await writeFile(path.join(anydpi, 'ic_launcher_round.xml'), adaptive, 'utf8');
await mkdir(path.join(RES, 'values'), { recursive: true });
await writeFile(
  path.join(RES, 'values', 'colors.xml'),
  `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <!-- Material 3 主色：图标背景层（不含任何第三方素材） -->
    <color name="ic_launcher_background">${PRIMARY}</color>
</resources>
`,
  'utf8',
);

console.log(`已生成 Material 图标：${Object.keys(DENSITIES).join(' / ')} + anydpi-v26`);
