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

/** 用 Chromium 渲染一张 512×512 母图（icon ratio 决定字形占画布比例） */
async function renderMaster(ratio, out) {
  const browser = await chromium.launch({ channel: 'chromium' });
  const page = await browser.newPage({ viewport: { width: MASTER, height: MASTER }, deviceScaleFactor: 1 });
  const html = `<!doctype html><meta charset="utf-8"><style>
    @font-face {
      font-family: 'Material Symbols Rounded';
      src: url(data:font/woff2;base64,${fontBase64}) format('woff2');
      font-weight: 400;
    }
    html, body { margin: 0; width: ${MASTER}px; height: ${MASTER}px; background: ${PRIMARY}; }
    .glyph {
      width: ${MASTER}px; height: ${MASTER}px;
      display: flex; align-items: center; justify-content: center;
      font-family: 'Material Symbols Rounded';
      font-size: ${Math.round(MASTER * ratio)}px;
      color: ${ON_PRIMARY};
      font-variation-settings: 'FILL' 1, 'wght' 500, 'GRAD' 0, 'opsz' 48;
      line-height: 1;
    }
  </style><div class="glyph">${glyph}</div>`;
  await page.setContent(html, { waitUntil: 'load' });
  await page.waitForTimeout(350); // 等字体解码
  await page.screenshot({ path: out });
  await browser.close();
}

await mkdir('build/icons', { recursive: true });
const masterFull = 'build/icons/master-full.png'; // 传统图标：字形更大
const masterFg = 'build/icons/master-fg.png'; // 自适应前景：留安全区
await renderMaster(0.62, masterFull);
await renderMaster(0.46, masterFg);

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
