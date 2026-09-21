/**
 * 用作者提供的 CC0 插画生成 Android 启动图标。
 *
 * 要求：**突出角色头上的发卡**（红蝴蝶结 + 星星 + 爱心 + 珠子发针），
 * 因此裁剪窗口对准头顶发饰区域，而不是全脸。
 * 不再使用项目自绘的矢量图标。
 *
 * Usage: node scripts/make-icon-from-image.mjs
 */
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const SOURCE = 'web/public/art/cc0-header.jpg';
const RES = 'app/src/main/res';
const PRIMARY = '#4A63B8'; // 取自插画的蓝发，作为自适应图标底色

/** 发卡区域（相对坐标，便于源图换尺寸时复用）：图片左上角约 22%~58% 宽、12%~44% 高 */
const CROP = { x: 0.322, y: 0.174, size: 0.3 }; // 由红色发饰像素包围盒(x 316..530, y 266..512 / 896x1199)反推，居中并留边

const MASTER = 1024;
const source = (await readFile(SOURCE)).toString('base64');

/** 用 Chromium 渲染母图：object-fit 裁剪 + 轻微放大，让发卡占满画面 */
async function renderMaster(padding, out) {
  const browser = await chromium.launch({ channel: 'chromium' });
  const page = await browser.newPage({ viewport: { width: MASTER, height: MASTER }, deviceScaleFactor: 1 });
  const inner = MASTER - padding * 2;
  await page.setContent(
    `<!doctype html><meta charset="utf-8"><style>
      html,body{margin:0;width:${MASTER}px;height:${MASTER}px;background:transparent}
      .frame{width:${inner}px;height:${inner}px;margin:${padding}px;border-radius:${Math.round(inner * 0.22)}px;overflow:hidden;position:relative;background:${PRIMARY}}
      .glow{position:absolute;inset:0;background:radial-gradient(60% 60% at 50% 45%, rgba(120,160,255,0.35), transparent 70%);pointer-events:none}
      /* 精确裁剪：整图宽度放大到 scale 像素，使目标区域正好铺满 inner × inner */
      .crop{position:absolute;width:${Math.round(inner / CROP.size)}px;height:auto;
            left:${Math.round(-CROP.x * (inner / CROP.size))}px;
            top:${Math.round(-CROP.y * (inner / CROP.size))}px}
      img{width:100%;display:block}
    </style>
    <div class="frame"><div class="glow"></div><div class="crop"><img src="data:image/jpeg;base64,${source}"></div></div>`,
    { waitUntil: 'load' },
  );
  await page.waitForTimeout(250);
  await page.screenshot({ path: out, omitBackground: true });
  await browser.close();
}

await mkdir('build/icons', { recursive: true });
const masterFull = 'build/icons/icon-full.png';
const masterFg = 'build/icons/icon-fg.png';
await renderMaster(0, masterFull);
await renderMaster(Math.round(MASTER * 0.17), masterFg);

const DENSITIES = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
const FOREGROUND = { mdpi: 108, hdpi: 162, xhdpi: 216, xxhdpi: 324, xxxhdpi: 432 };

const ps = `
Add-Type -AssemblyName System.Drawing
function Resize([string]$src,[string]$dst,[int]$size,[bool]$round) {
  $img=[System.Drawing.Image]::FromFile($src)
  $bmp=New-Object System.Drawing.Bitmap($size,$size)
  $g=[System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode='HighQualityBicubic'; $g.SmoothingMode='HighQuality'; $g.PixelOffsetMode='HighQuality'
  $rect=New-Object System.Drawing.Rectangle(0,0,$size,$size)
  if ($round) { $p=New-Object System.Drawing.Drawing2D.GraphicsPath; $p.AddEllipse($rect); $g.SetClip($p) }
  $g.DrawImage($img,$rect); $g.Dispose(); $bmp.Save($dst,[System.Drawing.Imaging.ImageFormat]::Png); $bmp.Dispose(); $img.Dispose()
}
$map=@{ ${Object.entries(DENSITIES).map(([d, s]) => `'${d}'=${s}`).join('; ')} }
$fg=@{ ${Object.entries(FOREGROUND).map(([d, s]) => `'${d}'=${s}`).join('; ')} }
foreach ($d in $map.Keys) {
  $dir=Join-Path '${path.resolve(RES)}' "mipmap-$d"
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
  Resize '${path.resolve(masterFull)}' (Join-Path $dir 'ic_launcher.png') $map[$d] $false
  Resize '${path.resolve(masterFull)}' (Join-Path $dir 'ic_launcher_round.png') $map[$d] $true
  Resize '${path.resolve(masterFg)}' (Join-Path $dir 'ic_launcher_foreground.png') $fg[$d] $false
}
Write-Output resized
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
    <!-- 取自插画蓝发的底色（CC0 素材，见 docs/asset-permissions.md） -->
    <color name="ic_launcher_background">${PRIMARY}</color>
</resources>
`,
  'utf8',
);

console.log('已用 CC0 插画生成图标（裁剪聚焦发卡）：mdpi~xxxhdpi + 自适应前景');
