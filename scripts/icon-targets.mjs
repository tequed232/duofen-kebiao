/**
 * 应用图标的**唯一口径**：目标清单 + 渲染配方。
 * `scripts/make-icons.mjs`（生成）与 `scripts/check-app-icons.mjs`（守卫）都从这里取，
 * 于是"生成出来的"和"守卫认的"不可能各写一套 —— 那正是这类守卫最容易烂掉的地方。
 *
 * 几何口径（与 docs/asset-permissions.md 的登记一致，改口径要同时改那份文档）：
 *   · 整幅等比、**不裁切、不调色**；
 *   · `ic_launcher.png` / 网页图标 = 整幅铺满；
 *   · `ic_launcher_foreground.png` = 整幅缩到 **2/3**（安卓自适应的 72/108 安全区）居中，四周透明；
 *   · `ic_launcher_round.png`    = 先铺底色再按内切圆裁切。
 */

/** 与 app/src/main/res/values/colors.xml 的 ic_launcher_background 同一个值（取自画面左上角） */
export const BG = '#13161F';
export const SOURCE = 'docs/icon-source.jpg';

/** 安卓 5 档密度：目录 → 边长（48/72/96/144/192 = 1x/1.5x/2x/3x/4x） */
export const MIPMAPS = [
  ['mdpi', 48],
  ['hdpi', 72],
  ['xhdpi', 96],
  ['xxhdpi', 144],
  ['xxxhdpi', 192],
];

/** 全部目标：文件路径 / 边长 / 模式 */
export const TARGETS = [
  ...MIPMAPS.flatMap(([density, size]) => {
    const dir = `app/src/main/res/mipmap-${density}`;
    return [
      { file: `${dir}/ic_launcher.png`, size, mode: 'square' },
      { file: `${dir}/ic_launcher_round.png`, size, mode: 'round' },
      { file: `${dir}/ic_launcher_foreground.png`, size, mode: 'foreground' },
    ];
  }),
  { file: 'web/public/icon-192.png', size: 192, mode: 'square' },
  { file: 'web/public/icon-512.png', size: 512, mode: 'square' },
  { file: 'web/public/apple-touch-icon.png', size: 180, mode: 'square' },
];

/**
 * 浏览器侧渲染配方（在页面里 eval 成函数用）。
 * 逐级减半再落到目标尺寸：2048 → 48 是一次 42 倍缩放，一次性画完会采样不足而发糊。
 */
export const RENDER_JS = `async (img, size, mode, bg) => {
  const shrink = (from, target) => {
    let cur = from;
    while (Math.floor(cur.width / 2) >= target) {
      const half = document.createElement('canvas');
      half.width = Math.max(target, Math.floor(cur.width / 2));
      half.height = half.width;
      const hctx = half.getContext('2d');
      hctx.imageSmoothingEnabled = true;
      hctx.imageSmoothingQuality = 'high';
      hctx.drawImage(cur, 0, 0, half.width, half.height);
      cur = half;
    }
    return cur;
  };
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  if (mode === 'round') {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, size, size);
    ctx.save();
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    ctx.clip();
  }
  const inner = mode === 'foreground' ? Math.round((size * 2) / 3) : size;
  const offset = (size - inner) / 2;
  ctx.drawImage(shrink(img, inner), offset, offset, inner, inner);
  if (mode === 'round') ctx.restore();
  return canvas.toDataURL('image/png');
}`;

/** 在页面里按配方渲染一张图标，返回 base64（不含 data: 前缀） */
export const renderIcon = async (page, dataUrl, size, mode) => {
  const png = await page.evaluate(
    async ({ src, size, mode, bg, recipe }) => {
      const img = new Image();
      img.src = src;
      await img.decode();
      // eslint-disable-next-line no-eval
      const render = eval(`(${recipe})`);
      return render(img, size, mode, bg);
    },
    { src: dataUrl, size, mode, bg: BG, recipe: RENDER_JS },
  );
  return png.slice(png.indexOf(',') + 1);
};

/** 源图读成 data URL */
export const sourceDataUrl = (bytes) => `data:image/jpeg;base64,${bytes.toString('base64')}`;
