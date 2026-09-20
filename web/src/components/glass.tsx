/**
 * Liquid Glass 视觉元素（自行绘制的矢量实现，不嵌入任何外部图片素材）。
 *
 * 设计取自「冰彩渐变圆角方块 + 三枚半透明玻璃药丸」的玻璃质感：
 *   - 背景：多色柔和渐变 + 内高光外阴影
 *   - 药丸：半透明填充 + 顶部高光条 + 描边 + 落地投影
 * 颜色仍取自 M3 角色（primary / tertiary / error 等），因此与 M3 配色一致。
 */

export function GlassMark({ size = 72, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 200 200"
      className={['glass-mark', className].join(' ').trim()}
      role="img"
      aria-label="多分课表 · Liquid Glass 图标"
    >
      <defs>
        <linearGradient id="glass-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#DCE6F7" />
          <stop offset="45%" stopColor="#E7E3F3" />
          <stop offset="100%" stopColor="#F6E3D2" />
        </linearGradient>
        <linearGradient id="glass-pill-green" x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0%" stopColor="#7ED957" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#2E7D32" stopOpacity="0.85" />
        </linearGradient>
        <linearGradient id="glass-pill-violet" x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0%" stopColor="#A98BF0" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#6A4FBF" stopOpacity="0.8" />
        </linearGradient>
        <linearGradient id="glass-pill-red" x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0%" stopColor="#F0736A" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#C1362C" stopOpacity="0.8" />
        </linearGradient>
        <linearGradient id="glass-sheen" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.85" />
          <stop offset="55%" stopColor="#FFFFFF" stopOpacity="0.06" />
          <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* 圆角方块底：冰彩渐变 + 柔和描边 */}
      <rect x="8" y="8" width="184" height="184" rx="46" fill="url(#glass-bg)" />
      <rect
        x="8"
        y="8"
        width="184"
        height="184"
        rx="46"
        fill="none"
        stroke="#FFFFFF"
        strokeOpacity="0.65"
        strokeWidth="2"
      />

      {/* 三枚玻璃药丸（错落堆叠，颜色对应 M3 primary / 紫 / error） */}
      <g transform="rotate(38 100 100)">
        <rect x="46" y="34" width="108" height="44" rx="22" fill="url(#glass-pill-violet)" />
        <rect x="46" y="34" width="108" height="22" rx="11" fill="url(#glass-sheen)" />
        <rect
          x="46"
          y="34"
          width="108"
          height="44"
          rx="22"
          fill="none"
          stroke="#FFFFFF"
          strokeOpacity="0.5"
        />
      </g>
      <g transform="rotate(38 100 100) translate(14 40)">
        <rect x="46" y="34" width="108" height="44" rx="22" fill="url(#glass-pill-red)" />
        <rect x="46" y="34" width="108" height="22" rx="11" fill="url(#glass-sheen)" />
        <rect
          x="46"
          y="34"
          width="108"
          height="44"
          rx="22"
          fill="none"
          stroke="#FFFFFF"
          strokeOpacity="0.5"
        />
      </g>
      <g transform="rotate(38 100 100) translate(-28 -8)">
        <rect x="46" y="34" width="108" height="44" rx="22" fill="url(#glass-pill-green)" />
        <rect x="46" y="34" width="108" height="22" rx="11" fill="url(#glass-sheen)" />
        <rect
          x="46"
          y="34"
          width="108"
          height="44"
          rx="22"
          fill="none"
          stroke="#FFFFFF"
          strokeOpacity="0.55"
        />
        <circle cx="64" cy="52" r="5" fill="#FFFFFF" fillOpacity="0.75" />
      </g>
    </svg>
  );
}
