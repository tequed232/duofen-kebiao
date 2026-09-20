/**
 * M3E 形状（Material 3 Expressive shape library 的官方母题）。
 *
 * 为什么存在：项目原先在界面里使用了第三方美术资源（B 站作者插画 / 学校海报），
 * 未经授权，现已全部下架。这里改用 Material 3 Expressive 自带的形状语汇
 * （cookie 12 瓣、clover 4 瓣、burst 8 角、pill 胶囊、sunny 8 瓣）作为视觉元素，
 * 颜色一律取 --md-sys-color-* 角色，不引入任何外部素材。
 */
export type M3EShape = 'cookie' | 'clover' | 'burst' | 'pill' | 'sunny';

/** 生成 M3E 形状的 SVG path（中心 50,50，半径 46）。 */
export function m3eShapePath(shape: M3EShape, radius = 46, center = 50): string {
  const points: [number, number][] = [];

  const scallop = (lobes: number, inner: number, outer: number) => {
    const steps = lobes * 8;
    for (let i = 0; i < steps; i += 1) {
      const angle = (i / steps) * Math.PI * 2 - Math.PI / 2;
      // 用余弦在内外半径之间平滑起伏，得到 M3E 的圆瓣轮廓
      const wobble = (Math.cos(angle * lobes) + 1) / 2;
      const r = inner + (outer - inner) * wobble;
      points.push([center + Math.cos(angle) * r, center + Math.sin(angle) * r]);
    }
  };

  switch (shape) {
    case 'cookie':
      scallop(12, radius * 0.86, radius);
      break;
    case 'sunny':
      scallop(8, radius * 0.82, radius);
      break;
    case 'clover':
      scallop(4, radius * 0.62, radius);
      break;
    case 'burst':
      scallop(8, radius * 0.55, radius);
      break;
    case 'pill':
    default: {
      const r = radius;
      return [
        `M ${center - r} ${center - r * 0.55}`,
        `a ${r} ${r} 0 0 1 ${r * 2} 0`,
        `a ${r} ${r * 0.55} 0 0 1 0 ${r * 1.1}`,
        `a ${r} ${r} 0 0 1 ${-r * 2} 0`,
        `a ${r} ${r * 0.55} 0 0 1 0 ${-r * 1.1}`,
        'Z',
      ].join(' ');
    }
  }

  return `${points.map(([x, y], index) => `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`).join(' ')} Z`;
}

/** M3E 形状图标：可直接用作按钮内容 / 插画占位，颜色跟随 M3 角色。 */
export function M3EShapeIcon({
  shape = 'cookie',
  size = 64,
  rotation = 0,
}: {
  shape?: M3EShape;
  size?: number;
  rotation?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role="img"
      aria-label={`Material 3 Expressive ${shape} 形状`}
      style={{ display: 'block', transform: rotation ? `rotate(${rotation}deg)` : undefined }}
    >
      <path d={m3eShapePath(shape)} fill="currentColor" />
    </svg>
  );
}
