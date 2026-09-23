# Cloudflare CDN 挂载说明（多分课表）

站点是纯静态产物（`dist/`；GitHub Pages 由 CI 构建并发布到 `gh-pages` 分支）。挂 Cloudflare 的官方 CDN 有两种做法，
**推荐 A**：保留 GitHub Pages 作为源站，Cloudflare 负责 DNS、缓存、压缩与防护。

## A. 给现有站点套 Cloudflare（保留 GitHub Pages 源站）

1. **接入域名**：Cloudflare 控制台 → Add site → 填你的域名 → 选 Free 计划 →
   把域名注册商处的 NS 改成 Cloudflare 给的两条。
2. **DNS 记录**（Proxied，橙色云朵必须打开，否则不走 CDN）：
   | 类型 | 名称 | 内容 | 代理状态 |
   | --- | --- | --- | --- |
   | CNAME | `@`（或 `kebiao`） | `tequed232.github.io` | 🟠 Proxied |
3. **SSL/TLS**：模式选 **Full**（源站 Pages 有证书）；打开
   *Always Use HTTPS*、*Automatic HTTPS Rewrites*、*TLS 1.3*、*HSTS*。
4. **缓存规则**（Caching → Cache Rules），两条即可：
   - 规则 1：`URI Path` matches `/*/assets/*` → **Cache Eligible**, Edge TTL: *Ignore cache-control, use 1 year*,
     Browser TTL: *Override, 1 year*（文件名带内容哈希，可放心长缓存）
   - 规则 2：`URI Path` matches `/*/art/*` → Edge/Browser TTL 1 个月
   - HTML（`/index.html`）保持默认：*Standard*，这样发版后能立即更新
5. **速度 → 优化**：打开 Brotli、Early Hints、HTTP/3、Auto Minify（HTML/CSS/JS）、
   Rocket Loader **不要开**（本站是 SPA，Rocket Loader 会打乱模块加载顺序）。
6. **验证**：`curl -I https://你的域名/assets/index-*.js` 应看到
   `cf-cache-status: HIT`、`server: cloudflare`；`/index.html` 为 `MISS`/`DYNAMIC` 属正常。

> 注意：GitHub Pages 侧的自定义域名（CNAME 文件）与 Cloudflare 代理可以同时存在；
> 但**不要**在 Cloudflare 上再套一层 Anubis（`deploy/anubis/`），两者都做反爬会重复挑战——
> 二选一：要么 Cloudflare（Bot Fight Mode / WAF），要么自建 Anubis。

## B. 直接部署到 Cloudflare Pages（不需要 GitHub Pages）

```bash
npm install -g wrangler
npm run build                      # 产出 dist/
wrangler pages deploy dist --project-name duofen-kebiao
```

- Cloudflare Pages 会分配 `https://duofen-kebiao.pages.dev`，可再绑自定义域名；
- 仓库里的 `deploy/cloudflare/_headers` 会被 Pages 读取，用来给 `assets/*` 设置长缓存、
  给 HTML 设置 `no-cache`；
- 想走 CI：在 Cloudflare Pages 里连这个 GitHub 仓库，构建命令 `npm run build`，输出目录 `dist`。

## 前端一致性

`web/index.html` 里的资源路径都是相对路径（`./assets/...`），因此无论挂在
`tequed232.github.io/duofen-kebiao/`、自定义域名根路径，还是 Pages 的默认域名下都能直接工作。
