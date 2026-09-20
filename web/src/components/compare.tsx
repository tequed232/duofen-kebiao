/**
 * ICAT 式画质对比（参考 NVIDIA ICAT 的对比方式：同一位置左右分割 + 可拖动分界线 + 放大）。
 *
 * 这里用于「图像识别清晰度对比」：把同一张原图按当前清晰度设置处理前后的效果并排比较，
 * 拖动中间分界线即可看到细节差异。
 */
import { useCallback, useRef, useState } from 'react';
import { MdIcon } from './md';

export function CompareSlider({
  before,
  after,
  beforeLabel = '标准',
  afterLabel = '当前清晰度',
  height = 200,
}: {
  before: string;
  after: string;
  beforeLabel?: string;
  afterLabel?: string;
  height?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState(50);
  const [zoom, setZoom] = useState(1);
  const dragging = useRef(false);

  const move = useCallback((clientX: number) => {
    const element = ref.current;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    const next = ((clientX - rect.left) / rect.width) * 100;
    setPosition(Math.min(98, Math.max(2, next)));
  }, []);

  return (
    <div className="compare">
      <div
        className="compare-stage"
        ref={ref}
        style={{ height }}
        onPointerDown={(event) => {
          dragging.current = true;
          move(event.clientX);
        }}
        onPointerMove={(event) => {
          if (dragging.current) move(event.clientX);
        }}
        onPointerUp={() => {
          dragging.current = false;
        }}
        onPointerLeave={() => {
          dragging.current = false;
        }}
      >
        <img className="compare-image" src={after} alt={afterLabel} style={{ transform: `scale(${zoom})` }} />
        <div className="compare-clip" style={{ width: `${position}%` }}>
          <img
            className="compare-image"
            src={before}
            alt={beforeLabel}
            style={{ transform: `scale(${zoom})`, width: ref.current?.clientWidth ?? '100%' }}
          />
        </div>
        <span className="compare-divider" style={{ left: `${position}%` }}>
          <span className="compare-handle">
            <MdIcon name="compare_arrows" size={18} />
          </span>
        </span>
        <span className="compare-tag left">{beforeLabel}</span>
        <span className="compare-tag right">{afterLabel}</span>
      </div>

      <div className="compare-controls">
        <MdIcon name="zoom_in" size={18} />
        <input
          type="range"
          min={100}
          max={260}
          value={Math.round(zoom * 100)}
          onChange={(event) => setZoom(Number(event.target.value) / 100)}
          aria-label="放大倍数"
          className="compare-zoom"
        />
        <span className="md-label-medium">{Math.round(zoom * 100)}%</span>
      </div>
    </div>
  );
}
