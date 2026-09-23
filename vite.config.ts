import { rm } from 'node:fs/promises';
import path from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * web/public/ocr/ 是「本地识别资源」（OpenCV 13 MB + Tesseract 引擎与中文模型，
 * 合计约 23 MB），由 npm run setup:ocr 生成、已在 .gitignore 中忽略。
 *
 * 它有一个矛盾要处理：
 *   · 开发时要能被服务（`/ocr/...` 直接取），否则识别功能根本跑不起来；
 *   · 发布时**绝不能进 dist/**（产物会从 2.1 MB 涨到 25 MB，Pages 每次发版都拖着）。
 *
 * 走过一次弯路：曾用 `publicDir: false` 想一劳永逸，但它把 dev 的 public 服务也一起关了，
 * `/ocr/...` 会落到 SPA fallback 返回**首页 HTML**，浏览器把 HTML 当 JS 加载而报错
 * （表现是「本地没有 OpenCV」+ importScripts 404）。
 * 现在的做法：publicDir 保持默认（dev 正常），构建结束后把 dist/ocr 删掉。
 */
function stripLocalOcrFromDist(): Plugin {
  return {
    name: 'duofen-strip-local-ocr-from-dist',
    apply: 'build',
    async closeBundle() {
      await rm(path.resolve('dist/ocr'), { recursive: true, force: true });
    },
  };
}

// The web application lives in ./web (Vite root) so the repository root keeps
// the legacy single-file page and the Android project untouched.
// The production build is emitted to ./dist at the repository root.
export default defineConfig({
  root: 'web',
  base: './',
  plugins: [react(), stripLocalOcrFromDist()],
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
