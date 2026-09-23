# 多分课表 · Anubis 反爬防火墙

[Anubis](https://github.com/TecharoHQ/anubis)（TecharoHQ）是一个用**工作量证明（PoW）**挡住 AI 抓取器与脚本爬虫的 Web 防火墙：真人访问时浏览器静默算完一道小题（几百毫秒），脚本与无头浏览器则被显著拖慢或直接拒绝。它需要一台**自己的服务器**，因为它要作为反向代理串在客户端与源站之间。

> GitHub Pages 本身不能运行 Anubis。本目录给出的是「自建 VPS + 域名」的部署方式：把你的域名解析到 VPS，由 Caddy 终止 TLS，再把流量交给 Anubis，Anubis 回源到 `https://tequed232.github.io/duofen-kebiao`（或你自己的源站）。这样既保留了 Pages 的托管，又获得了反爬能力。

## 目录内容

| 文件 | 作用 |
| --- | --- |
| `docker-compose.yml` | Anubis + Caddy 两个容器；Anubis 固定版本、暴露 8080 与 9090（指标） |
| `botPolicies.yaml` | 策略：放行搜索引擎、拒绝 AI 抓取器、按权重分档给不同难度的挑战 |
| `Caddyfile` | TLS 终止、限速、安全响应头，然后 `reverse_proxy` 到 Anubis |
| `VERSION` | 当前锁定的 Anubis 版本，供 `anubis-watch` 工作流比对上游新版本 |

## 部署步骤

```bash
# 1) 准备：一台有公网 IP 的 Linux 服务器（Docker + compose 插件），把域名 A 记录指过来
# 2) 拉取本仓库
git clone https://github.com/tequed232/duofen-kebiao.git && cd duofen-kebiao/deploy/anubis

# 3) 改两处配置
#    docker-compose.yml: PUBLIC_URL -> 你的域名；TARGET -> 你的源站（默认是 Pages 上的多分课表）
#    Caddyfile / compose: SITE_ADDRESS -> 你的域名；email 改成你的邮箱（Let's Encrypt 通知）

# 4) 起服务
docker compose up -d
docker compose logs -f anubis      # 看到 "listening on :8080" 即成功
curl -I https://你的域名/          # 未通过挑战时会返回 Anubis 的挑战页（含 .within.website 路径）
```

验证是否生效：浏览器首次访问会短暂显示 Anubis 的验证页，之后种下 `techaro.lol-anubis-auth` cookie；用 `curl`（无 JS）访问则不会拿到正常页面内容。

## 持续监控

监控分两条线，仓库里已经准备好了：

1. **上游版本监控（GitHub Actions）**：`.github/workflows/anubis-watch.yml`
   - 每天定时抓取 TecharoHQ/anubis 的最新 release 与 tags；
   - 与 `deploy/anubis/VERSION` 比对，有新版本就自动开一个 issue（同标题的 issue 不会重复开，追加评论）；
   - 同时校验本目录的 `botPolicies.yaml` 是否能被解析（YAML 语法 + 必需字段）。
2. **运行状态监控（Prometheus 抓取 `/metrics`）**：Anubis 在 `METRICS_BIND`（默认 `:9090`）上暴露 Prometheus 指标。最小抓取配置：

```yaml
# prometheus.yml
scrape_configs:
  - job_name: anubis
    metrics_path: /metrics
    static_configs:
      - targets: ["127.0.0.1:9090"]
```

建议关注的信号（配合告警规则）：

| 指标 | 含义 | 建议告警 |
| --- | --- | --- |
| `anubis_requests_total` | 总请求数与结果分布 | 短时间突增 → 可能被刷 |
| `anubis_challenges_issued_total` | 发出的挑战数 | 挑战率长期 > 60% → 抓取器变多或难度过高 |
| `anubis_challenges_solved_total` | 通过的挑战数 | 通过率骤降 → 难度设置或前端 JS 有问题 |
| `anubis_denied_total` | 被拒绝的请求 | 持续 > 0 且带上你的 UA → 误伤，需要调 `botPolicies.yaml` |

## 调参建议（针对这个静态站点）

- 本站是纯静态 SPA：`DIFFICULTY` 建议 3~4，再高只会拖慢真人首访。
- 若你希望**完全不挑战真人**，可以把 `thresholds` 里 `mild-suspicion` 的 `action` 改成 `ALLOW`，只保留 `moderate-suspicion` / `extreme-suspicion` 的挑战 —— 这样 AI 抓取器仍然被挡。
- 新增/调整规则后必须重启容器：`docker compose restart anubis`，然后用 `docker compose logs -f anubis` 观察是否出现误伤（`denied`）。
- 需要横向扩容时，Anubis 需要共享存储（Valkey/Redis 之类的 store backend），以及保证 `X-Forwarded-For` 正确透传，详见上游 `docs/docs/admin/environments/`。
