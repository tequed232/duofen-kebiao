/**
 * 把本地识别所需的「大件」放到 web/public/ocr/。
 *
 * 为什么单独一步：OpenCV 的 opencv.js 约 13 MB、Tesseract 引擎 wasm 数 MB、
 * 中文语言包约 21 MB —— 全都远超本仓库「入库文件不超过 2 MB」的红线
 * （scripts/check-repo-hygiene.mjs），也远大于 APK 本身（3.4 MB）。
 * 所以它们**不入库**，由这个脚本落到 web/public/ocr/（已在 .gitignore 中忽略），
 * 运行时全部从 localhost 读取，不依赖公网。
 *
 * 用法：
 *   npm run setup:ocr              # 缺什么补什么
 *   npm run setup:ocr -- --force   # 全部重新拉取
 *
 * 来源：opencv.js 与 Tesseract 引擎从 node_modules 复制（装好依赖即离线可用）；
 *      中文语言包 npm 上没有稳定直链，从 tesseract.js 官方的 jsDelivr 镜像取一次。
 */
import { copyFile, mkdir, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createGunzip } from 'node:zlib';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createWriteStream } from 'node:fs';

const force = process.argv.includes('--force');
const OUT = path.resolve('web/public/ocr');
const CV_DIR = path.join(OUT, 'opencv');
const TESS_DIR = path.join(OUT, 'tesseract');
const LANG_DIR = path.join(TESS_DIR, 'lang');

const LANG_URLS = [
  'https://cdn.jsdelivr.net/npm/@tesseract.js-data/chi_sim@1.0.0/4.0.0_best_int/chi_sim.traineddata.gz',
  'https://cdn.jsdelivr.net/npm/@tesseract.js-data/chi_sim/4.0.0_best_int/chi_sim.traineddata.gz',
];

const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

async function exists(file) {
  try {
    await stat(file);
    return true;
  } catch {
    return false;
  }
}

/** 复制 node_modules 里的包文件；已存在且非 force 时跳过 */
async function copyFrom(from, to, label) {
  if (!force && (await exists(to))) {
    console.log(`  = ${label} 已存在`);
    return true;
  }
  if (!(await exists(from))) {
    console.error(`  ✗ ${label}：找不到 ${path.relative(process.cwd(), from)}（先跑 npm install）`);
    return false;
  }
  await mkdir(path.dirname(to), { recursive: true });
  await copyFile(from, to);
  console.log(`  ✓ ${label}（${mb((await stat(to)).size)}）`);
  return true;
}

/** 下载语言包并解压为标准 traineddata（Tesseract 直接吃未压缩文件） */
async function fetchLang() {
  const target = path.join(LANG_DIR, 'chi_sim.traineddata');
  if (!force && (await exists(target))) {
    console.log(`  = 中文语言包已存在（${mb((await stat(target)).size)}）`);
    return true;
  }
  await mkdir(LANG_DIR, { recursive: true });
  for (const url of LANG_URLS) {
    try {
      console.log(`  正在下载中文模型：${url}`);
      const response = await fetch(url);
      if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);
      const gz = Readable.fromWeb(response.body);
      await pipeline(gz, createGunzip(), createWriteStream(target));
      console.log(`  ✓ 中文语言包（${mb((await stat(target)).size)}）`);
      return true;
    } catch (error) {
      console.error(`  ✗ 该镜像失败：${error instanceof Error ? error.message : error}`);
    }
  }
  console.error('  ✗ 中文语言包下载失败：本地识别将不可用（可稍后重跑本脚本）');
  return false;
}

async function main() {
  console.log('多分课表 · 本地识别资源准备\n');
  await mkdir(CV_DIR, { recursive: true });
  await mkdir(TESS_DIR, { recursive: true });

  console.log('1) OpenCV（图像预处理）');
  const cvOk = await copyFrom(
    path.resolve('node_modules/@techstark/opencv-js/dist/opencv.js'),
    path.join(CV_DIR, 'opencv.js'),
    'opencv.js',
  );

  console.log('\n2) Tesseract 引擎（OCR）');
  const workerOk = await copyFrom(
    path.resolve('node_modules/tesseract.js/dist/worker.min.js'),
    path.join(TESS_DIR, 'worker.min.js'),
    'worker.min.js',
  );
  /*
   * 核心**整包拷**，不做变体裁剪。
   *
   * 走过两次弯路：先只拷 `tesseract-core-simd.*`，运行时要的是 `-lstm`（中文用 LSTM 专用
   * 数据）；补了 `-lstm` 之后它又要 `relaxedsimd-lstm` —— 变体选择是 tesseract.js 内部
   * 按 SIMD 支持情况决定的，外部猜不准。
   * 这些文件只在本机由 setup:ocr 生成（web/public/ocr/ 已 gitignore，构建时也从 dist 剔除），
   * 多占几十 MB 磁盘换来「一次就对」，比继续猜值得。
   */
  const coreDir = path.resolve('node_modules/tesseract.js-core');
  const coreFiles = (await readdir(coreDir)).filter(
    (name) => /^tesseract-core.*\.(js|wasm)$/.test(name),
  );
  let coreOk = coreFiles.length > 0;
  for (const name of coreFiles) {
    const copied = await copyFrom(path.join(coreDir, name), path.join(TESS_DIR, name), name);
    coreOk = coreOk && copied;
  }
  const wasmOk = coreOk;

  console.log('\n3) 中文语言包（chi_sim）');
  const langOk = await fetchLang();

  const ok = cvOk && workerOk && coreOk && wasmOk && langOk;
  await writeFile(
    path.join(OUT, 'README.md'),
    [
      '# 本地识别资源（运行时生成，不入库）',
      '',
      '这些文件由 `npm run setup:ocr` 生成，体积远超本仓库 2 MB 的单文件上限，',
      '因此被 `.gitignore` 忽略。运行时全部从 localhost 读取，不上传任何图片。',
      '',
      '| 文件 | 作用 | 来源 |',
      '| --- | --- | --- |',
      '| `opencv/opencv.js` | 封面预处理（裁切 / 聚焦 / 二值化） | `@techstark/opencv-js` |',
      '| `tesseract/worker.min.js` | OCR worker | `tesseract.js` |',
      '| `tesseract/tesseract-core-simd-lstm.*` | OCR 引擎 wasm（中文走 LSTM 数据，必须用 lstm 核心） | `tesseract.js-core` |',
      '| `tesseract/lang/chi_sim.traineddata` | 中文识别模型 | `@tesseract.js-data/chi_sim` |',
      '',
      `生成时间：${new Date().toISOString()}`,
      '',
    ].join('\n'),
    'utf8',
  );

  console.log(
    ok
      ? '\n✅ 本地识别资源就绪。识别时不会联网。'
      : '\n⚠️ 部分资源缺失，本地识别会降级为「按 API 识别」或提示先补资源。',
  );
  process.exit(ok ? 0 : 1);
}

main().catch((error) => {
  console.error('准备失败：', error);
  process.exit(1);
});
