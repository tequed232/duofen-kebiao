## 多分课表 v3.0.2 —— 安全审查整改 + 致谢口径

### 下载
- 安装包：`enhance-3.0.2.apk`（覆盖安装保留数据）
- 短链（始终最新）：https://github.com/tequed232/duofen-kebiao/releases/latest/download/enhance.apk
- 网页版：https://tequed232.github.io/duofen-kebiao/

### 安全（详见 `docs/security-review.md`）
- **接口密钥不再可能明文外发**：新增端点准入 —— 非 https 只放行本机 / 局域网地址
  （自建 Ollama 这类服务照常可用），公网 http 直接拦下并提示改用 https
- **报错不再回显密钥**：网关常把请求头塞进错误体，现在密钥在抛出前先抹成 `***`
- **去掉唯一注入面**：HTML 课表导入不再用 `innerHTML`，改 DOM 遍历（语义等价）
- **SQL 注入不适用**（附证据）：全仓库无 SQL、无 sqlite/Room、无服务端，数据只在本机 IndexedDB
- 新增守卫 `npm run check:web-security`（注入面 / 密钥进 URL / 明文端点），与密钥扫描
  `npm run check:secrets` 一起接入 CI；密钥扫描的历史段修复了"匹配到自己"的假阳性

### 其他
- 「致谢 · 名片墙」中 **饼干** 角色补充为「翻译 · **3D 设计** · 同学」（README / CONTRIBUTORS 同步）
- 修复：粘贴 HTML 课表必报「没有解析到课表节次」——HTML 路由此前只写在「选文件」那条路上

---

## 多分课表 v3.0.1 —— 内容安全区修复

### 下载
- 安装包：`enhance-3.0.1.apk`（覆盖安装保留数据）
- 短链（始终最新）：https://github.com/tequed232/duofen-kebiao/releases/latest/download/enhance.apk
  （安装包只作为 Release 附件，已从仓库与 Pages 剔除）
- 网页版：https://tequed232.github.io/duofen-kebiao/

### 本版修复：内容安全区（首页 / 搜索 / 设置 / 关于 / 教材）
- **症状**：逐页滚到底时，最后一屏内容被底栏压住、在首页还会被「回到今天」FAB 压住，看起来就是"内容显示不全"。
- **根因**：让位规则写的是 `.phone > .screen-inner > .screen-content`，而真实 DOM 是
  `.phone > .screen > .screen-inner > .screen-content`（中间还有一层 `.screen`）——
  选择器从未命中，计算出来的下内边距一直是基础规则的 12px。
- **修复**：改成后代选择器 `.phone .screen-content`；首页当天列表只额外让开 FAB，
  与全局的底栏让位分工，避免重复留白。
- **实测**（浏览器逐页 + 真机复核）：滚到底时最后一块内容与底栏的余量
  课表 +16 / 搜索 +16 / 设置 +16 / 关于 +32 px；首页最后一张课程卡片落在 726，FAB 从 744 起。
- 版本号同步 v3.0.1（`APP_VERSION` 单一来源 → APK `versionName 3.0.1` / `versionCode 30001`）。

---

## 多分课表 v3.0.0 —— 液态玻璃重构（透镜折射 / 边缘色散 / 散射 dock）

### 下载
- 安装包：`enhance-3.0.apk`（3.23 MB，覆盖安装保留数据）
- 短链（始终最新）：https://github.com/tequed232/duofen-kebiao/releases/latest/download/enhance.apk
  （安装包只作为 Release 附件，已从仓库与 Pages 剔除）
- 网页版：https://tequed232.github.io/duofen-kebiao/

### 应用图标（新）
- 图标换成作者提供的插画：安卓自适应图标（前景 = 整幅画等比缩到 72/108 安全区，**不裁切**；
  底色 `#13161F` 取自画面左上角）、5 档密度 + 圆形版；网页侧 favicon / PWA 图标同步
- **启动页**与**关于页**的标识也换成同一张插画；旧的装饰图形（药丸图）已删除
- 原图留档 `docs/icon-source.jpg`，生成脚本 `build/make-app-icon.ps1`

### 液态玻璃：这次是**真的**透镜，不只是模糊
| 能力 | 实现 | 说明 |
| --- | --- | --- |
| 透镜折射 | 圆角矩形 SDF 生成位移贴图 → `feDisplacementMap` | 参数照 Apple-Music-Web-Liquid-Glass 的口径：`BEZEL`（透镜带厚度，随圆角半径）/ `STRENGTH` / `ZOOM`（背景放大），全部是 CSS 变量，可逐格调 |
| **作用在真实内容上** | `backdrop-filter: url(#滤镜)` | 实测确认 WebView/Chromium 支持它（仓库里原先的判断是错的），内容在玻璃边缘被**掰弯**，而不是只弯我们自己的渐变层 |
| 边缘色散 | 三通道各用不同位移量采样同一张贴图（差 ±1.0px） | 只有被掰弯的边缘出现色边；中心位移为 0，完全干净（早期用 `feOffset` 整体平移的写法会让整屏发紫，已废弃） |
| 散射（边界反馈） | 边界带 11px 背景模糊 + 纵向渐变遮罩 | 内容"穿进玻璃"的过程有反馈，中间留清晰区，透过底栏照样读得清列表 |
| 边缘高光 / 描边 | 内阴影 + rim 光带 | 与透镜、散射共同构成玻璃边界 |

> 性能：贴图按半分辨率生成（像素少 4 倍）、`ResizeObserver` 合帧限流、页面隐藏不重建；
> 低性能档完全跳过透镜与散射，只留底色与描边。

### 底栏（Dock）交互
- **一个圆**：去掉触摸小球（和色块重复且更费帧），触摸反馈全部收敛到常驻色块上
- **撞墙物理**：色块顶到边界时横向压窄、纵向鼓起，松手弹回；撞墙判定是「被夹住 **且** 手指还在往里推」（轻点不误触发）
- **加速度形变**：`a = dv/dt` 映射成沿运动方向的拉伸 + 纵向压扁 + 轻微切变，取平滑峰值逐帧衰减，手指停下自动回圆
- **流体拉伸**修好：JS 与 CSS 的变量协议原本错位（写的是比例、当成宽度用），现在统一为 `--pill-x` / `--pill-stretch`
- **跟手高光**：指针位置驱动，拖动时更亮

### 系统触感（震动）
- 走原生 `View.performHapticFeedback` + 系统常量，**自动遵守用户的触感开关**，不需要 VIBRATE 权限
- 四档：`wall`（撞墙，SEGMENT_TICK）/ `select`（控件生效，CONFIRM）/ `heavy`（回到今天，LONG_PRESS）/ `tick`（刻度）
- 覆盖：底栏撞墙与切页、点击课表课程、周数步进、收起展开课表、滑动找日期、筛选屏全部条件、所有滑块、「回到今天」

### 屏幕切换与返回
- 所有切页统一为**中间弹出**（新页从正中放大、旧页放大淡出），不再做整屏横移
- Android 14+ **可预测式返回**：手势的开始/进度/取消/触发四相转给网页，上一屏按手势进度从中间放大弹出

### 首页与列表
- 列表可以**穿过底栏**（让位从滚动容器改到内容自身），滚到底时最后一项也能完整露出
- 只有一节课的日子，当天课程区留出「回到今天 FAB + 底栏」两个控件的高度，不再被压住

### 修复
- 教材封面选图原本走 `FileReader → base64 → img.src` 再解码，手机上 12MP 照片会把主线程顶住几百毫秒到几秒（"点一下就卡死"）；改走 `createImageBitmap` 后台解码
- 三处失效代码：`--dock-drag` / `--dock-velocity` 变量从来没人写；`filter: url(#m3e-dock-scatter)` 引用了不存在的滤镜（会让元素整个不渲染）
- 宿主 insets 注入加了空值保护（真机 logcat 里出现过 `Uncaught TypeError`）
- HTML 课表导入器此前**从未生效**（`parseScheduleHtml` 漏导入）；上课提醒此前**从未触发**（设置对象传错，`enabled` 恒为 undefined）

### 真机可观测（面向后续排障）
- 网页的长任务（>120ms）与慢同步操作（>200ms）报到 console，宿主再转发进 logcat：`adb logcat -s DuofenWeb`
- 触感下发确认：`adb logcat -s DuofenHaptic`
- 帧率核对：`adb shell dumpsys gfxinfo com.app.m3expressive`

> 已知未做：玻璃下的「对比压缩」（Apple 的 readability mapping）—— 因为作者要求保持完全透明、能直接看清列表，这一项有意不做。

Tequed232 拥有本项目的最终解释权。
