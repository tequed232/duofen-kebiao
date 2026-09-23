import { cp, mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * web/public/ 里有一样东西**不该进发布物**：`ocr/`。
 *
 * 它是 npm run setup:ocr 生成的本地识别资源（OpenCV 13 MB + Tesseract 引擎与中文模型，
 * 合计约 23 MB），只服务于「本机开发时识别教材封面」。默认的 publicDir 拷贝会把它
 * 整个塞进 dist/ —— 产物从 2 MB 涨到 25 MB，Pages 每次发版都拖着它，APK 也装不下。
 *
 * 所以这里不用 publicDir，改为显式拷贝：**除了 ocr/ 之外**的 public 内容照旧进 dist
 * （_headers、图标、manifest、授权截图一个都不能少）。
 * 需要它的时候，把 OCR_DIR 指向别处或本地起服务即可；模型本来就该留在本机。
 */
const OCR_DIR = 'ocr';

function copyPublicExceptOcr(): Plugin {
  return {
    name: 'duofen-copy-public-except-ocr',
    apply: 'build',
    async writeBundle(options) {
      const source = path.resolve('web/public');
      const target = path.resolve(options.dir ?? 'dist');
      await mkdir(target, { recursive: true });
      for (const entry of await readdir(source, { withFileTypes: true })) {
        if (entry.name === OCR_DIR) continue;
        await cp(path.join(source, entry.name), path.join(target, entry.name), { recursive: true });
      }
    },
  };
}

// The web application lives in ./web (Vite root) so the repository root keeps
// the legacy single-file page and the Android project untouched.
// The production build is emitted to ./dist at the repository root.
export default defineConfig({
  root: 'web',
  base: './',
  // 关掉自动拷贝，改由插件排除 ocr/（见上）
  publicDir: false,
  plugins: [react(), copyPublicExceptOcr()],
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    target: 'es2020',
    cssTarget: 'chrome100',
    chunkSizeWarningLimit: 2000,
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
  },
});
