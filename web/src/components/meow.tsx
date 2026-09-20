/**
 * 可点的 M3E 形状按钮。
 *
 * 原先这里放的是第三方美术资源（B 站作者插画 / 学校海报），未经授权，现已全部下架，
 * 改为 Material 3 Expressive 自带的形状母题（cookie / clover / burst / sunny / pill）。
 * 点一下：形状弹一下 + 喵一声 —— 音效是本项目用 WebAudio 自己合成的，不含任何外部素材。
 */
import { useState } from 'react';
import { playMeow } from '../lib/meow';
import { M3EShapeIcon, type M3EShape } from './m3shape';

export function MeowArt({
  className = 'meow-art',
  onMeow,
  shape = 'cookie',
}: {
  className?: string;
  onMeow?: () => void;
  shape?: M3EShape;
}) {
  const [pop, setPop] = useState(false);

  return (
    <button
      type="button"
      className={[className, pop ? 'pop' : ''].join(' ').trim()}
      aria-label="Material 3 Expressive 形状，戳一下喵～"
      title="戳一下，喵～"
      onClick={() => {
        setPop(true);
        window.setTimeout(() => setPop(false), 420);
        playMeow();
        onMeow?.();
      }}
    >
      <M3EShapeIcon shape={shape} size={36} />
    </button>
  );
}
