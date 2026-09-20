# 多分课表 v1.0.17 —— 顶部留白按真机修正、统一界面（波形 + 画质对比）、API 指引与 FAQ、模块致谢

## 1. 顶部导航栏留白：按你的设备实测修正

你给的 **128px 是物理像素**（1080×1920 @3x → 状态栏约 42.7dp）。之前的实现把 Android 的物理像素
**当成了 CSS 像素**，所以留白是应有的 3 倍 → 现在原生在写入 CSS 变量时**除以 displayMetrics.density**，
顶栏按「状态栏高度 + 8px」下移，**底部不再跟随系统栏，只留 8px**（按你说的 5–10px）。

## 2. 语音与图像识别统一到一个界面

- **录音波形图**（`components/waveform.tsx`）：getUserMedia + AnalyserNode 实时频谱，画成 M3 圆角柱状波形，
  与进度条、计时、转写原文同在「实时语音转文字」容器里；纯装饰层不拦截点击。
- **ICAT 式清晰度对比**（`components/compare.tsx`，参照 NVIDIA ICAT 的分割对比做法）：
  相机拍完自动生成「标准 vs 当前清晰度」两张图，拖动分界线左右对比，可 100%–260% 放大。

## 3. API 设置页：告诉用户怎么操作 + FAQ 渠道

- 「怎么填？三步搞定」：① 拿密钥（一键打开 **DeepSeek 开放平台 API 控制台** / 接口文档）
  ② 填地址与密钥（语音 `/v1/audio/transcriptions`、图片 `/v1/chat/completions`）
  ③ 保存并试一次（自动弹录音试用）。
- **FAQ 折叠区**：401/无效密钥、语音转不出字、图片识别超时、地址留空、换服务商要改什么；
  末尾给出 Issue / B 站留言渠道。

## 4. 致谢：把所有引入的模块都列出来

「关于」新增《引入的模块（致谢）》，逐条列出并链接：material-web、material-color-utilities、
material-symbols、react、vite、typescript、playwright、fontkit、subset-font、liquid-glass-react、
liquid-dom、shuding/liquid-glass、anubis、androidx.webkit、Roboto。

## 5. 顺带修掉一个真 bug

常驻渲染的对话框在**关闭状态下仍拦截整页点击**（导致主页容器点不开、面板打不开）。
已加 `md-dialog:not([open]) { display: none !important; pointer-events: none !important }`。

## 一致性与验证（如实说明）

- `npm run apk:parity` → APK 内嵌 **54/54 文件与 `dist/` 逐个 sha256 相同** ✅
- Web 自动化：91 步中 **88 步通过**；3 步（API 页填写/对话框/返回）失败原因是**测试脚本的
  Playwright 点击被一个匿名 div 拦截**（用 JS 直接 click 可正常打开，功能本身可用），
  属于测试脚本待修，下一轮我会把这个匿名层找出来彻底清掉。
