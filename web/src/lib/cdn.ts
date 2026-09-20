/**
 * CDN 资源加载（图库 / 插画等静态资源）。
 *
 * 用途：把较大的图片资源放到 GitHub 仓库里，用 jsDelivr 之类的公共 CDN 分发，
 * 带**版本锁定 + 长缓存 + 多级回退**，比直接读 raw.githubusercontent 快很多（尤其在国内）。
 *
 * 用法：
 *   const url = cdnAssetUrl({ repo: 'tequed232/duofen-kebiao', tag: 'v1.0.17', path: 'art/gallery/01.webp' });
 *
 * 设计要点：
 *   1) 通过 tag 锁版本 → URL 不可变，可以放心用 `immutable` 长缓存；
 *   2) 依次尝试 jsDelivr → Statically → raw GitHub，任一成功即用；
 *   3) 全部失败时回退到本地打包资源（`./art/...`），保证离线/内网也能显示。
 *
 * ⚠️ 授权前提：只有**已登记授权**的资源才允许放进 `art/` 或 `web/public/`。
 * 见 docs/asset-permissions.md —— 未经作者许可，不得把他人作品上传到本仓库（fork 他人合集同样不算授权）。
 */

export interface CdnAsset {
  /** 形如 `owner/repo` */
  repo: string;
  /** 版本锁：tag / commit / 分支（强烈建议用 tag） */
  tag: string;
  /** 仓库内路径，例如 `art/gallery/cover.webp` */
  path: string;
  /** 本地打包时的相对路径，默认 `./<path>` */
  local?: string;
}

/** 生成各级 CDN 候选地址（顺序即优先级） */
export function cdnCandidates(asset: CdnAsset): string[] {
  const { repo, tag, path } = asset;
  return [
    `https://cdn.jsdelivr.net/gh/${repo}@${tag}/${path}`,
    `https://cdn.statically.io/gh/${repo}/${tag}/${path}`,
    `https://raw.githack.com/${repo}/${tag}/${path}`,
    `https://raw.githubusercontent.com/${repo}/${tag}/${path}`,
  ];
}

/** 只生成 jsDelivr 地址（用于 <img src> 直接引用） */
export function cdnAssetUrl(asset: CdnAsset): string {
  return cdnCandidates(asset)[0];
}

const resolved = new Map<string, string>();

/** 探测可用地址并缓存结果（同一资源只探测一次） */
export async function resolveAsset(asset: CdnAsset, timeoutMs = 4000): Promise<string> {
  const key = `${asset.repo}@${asset.tag}/${asset.path}`;
  const cached = resolved.get(key);
  if (cached) return cached;

  for (const url of cdnCandidates(asset)) {
    try {
      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), timeoutMs);
      const response = await fetch(url, { method: 'HEAD', signal: controller.signal, cache: 'force-cache' });
      window.clearTimeout(timer);
      if (response.ok) {
        resolved.set(key, url);
        return url;
      }
    } catch {
      /* 换下一个 CDN */
    }
  }

  const local = asset.local ?? `./${asset.path}`;
  resolved.set(key, local);
  return local;
}

/** React 之外的简单加载器：拿到图就直接替换 <img> 的 src */
export async function loadIntoImage(element: HTMLImageElement, asset: CdnAsset): Promise<void> {
  element.src = await resolveAsset(asset);
}
