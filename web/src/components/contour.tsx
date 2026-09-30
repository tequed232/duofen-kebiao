/**
 * 单色等高线背景层（《终末地》那套工业风等高线）。
 *
 * 挂载位置：`.phone` 里的**第一个孩子**，绝对定位铺满、`z-index` 落到屏幕（`.screen`）之下。
 * 配合 `html[data-contour]` 时把 `.screen` 的背景让出来（见 base.css），
 * 于是整页都是"单色底 + 等高线"，而卡片/对话框仍是各自的不透明表面。
 *
 * 颜色用 `currentColor`：跟随 `--md-sys-color-on-surface`，
 * 浅色主题是深线路、深色主题是浅线路 —— 单一颜色，不引入第二种色相。
 * 路径只在档位/种子变化时重算（`useMemo`），不做逐帧动画（省电；要动效再说）。
 */
import { useMemo } from 'react';
import { CONTOUR_PRESETS, contourPaths, type ContourIntensity } from '../lib/contour';

export function ContourBackground({
  intensity = 'subtle',
  seed,
}: {
  intensity?: Exclude<ContourIntensity, never>;
  seed?: number;
}) {
  const preset = CONTOUR_PRESETS[intensity] ?? CONTOUR_PRESETS.subtle;
  const { d } = useMemo(
    () =>
      contourPaths({
        width: 1200,
        height: 1600,
        resolution: preset.resolution,
        levels: preset.levels,
        seed,
      }),
    [preset.resolution, preset.levels, seed],
  );

  return (
    <svg
      className="contour-layer"
      aria-hidden="true"
      viewBox="0 0 1200 1600"
      preserveAspectRatio="xMidYMid slice"
      style={{ opacity: preset.opacity }}
    >
      <path d={d} fill="none" stroke="currentColor" strokeWidth={1.1} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
