import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * 2026-09-27：原本这里有个 `stripLocalOcrFromDist` 插件，负责在构建收尾把 `dist/ocr` 删掉 ——
 * 那是为「本地识别资源」（OpenCV 13 MB + Tesseract 引擎与中文模型，约 23 MB）打的补丁：
 * 开发时要能服务、发布时绝不能进产物。本地识别整套下线后（改走多模态接口），
 * public 下不再有 ocr/，这个补丁连同它的那堆边界情况一起删掉了。
 */

// The web application lives in ./web (Vite root) so the repository root keeps
// the legacy single-file page and the Android project untouched.
// The production build is emitted to ./dist at the repository root.
export default defineConfig({
  root: 'web',
  base: './',
  plugins: [react()],
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
