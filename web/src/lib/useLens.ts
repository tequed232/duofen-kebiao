/**
 * 把「透镜位移贴图」挂到一个玻璃表面上的 React hook。
 *
 * 用法：`const ref = useLens(elementRef, LENS_PLAYER)` —— 挂上之后元素（以及它的
 * 伪元素）可以用 `filter: var(--lg-map-url)` 取到这次生成的折射滤镜，
 * 用 `mask-image: var(--lg-edge-url)` 取到边缘遮罩。
 *
 * 性能约定（与底栏一致）：
 *   · 贴图只在**尺寸或参数变化**时重建（ResizeObserver + key 去重），不做逐帧计算；
 *   · 低性能档（html[data-perf='low']）直接不挂滤镜，只留底色与内高光。
 */
import { useEffect, useRef, type RefObject } from 'react';
import { buildLensMap, type LensParams } from './lens';
import { timeSync } from './perf-telemetry';

const SVG_NS = 'http://www.w3.org/2000/svg';

interface LensHost {
  filter: SVGFilterElement;
  blur: SVGFEGaussianBlurElement;
  image: SVGFEImageElement;
  disp: SVGFEDisplacementMapElement;
  /** 同一张贴图、更小的位移量：给 backdrop-filter 用（对真实内容做透镜） */
  backdropFilter: SVGFilterElement;
  backdropDisp: SVGFEDisplacementMapElement;
  key: string;
}

export function useLens(ref: RefObject<HTMLElement | null>, params: LensParams): void {
  const hostRef = useRef<LensHost | null>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return undefined;

    const lowPerf = () => document.documentElement.dataset.perf === 'low';
    if (lowPerf()) return undefined;

    /* 一个 surface 一个滤镜，挂在隐藏的 <svg> 里 */
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('width', '0');
    svg.setAttribute('height', '0');
    svg.setAttribute('aria-hidden', 'true');
    svg.style.cssText = 'position:absolute;width:0;height:0';
    const filter = document.createElementNS(SVG_NS, 'filter');
    filter.setAttribute('filterUnits', 'userSpaceOnUse');
    filter.setAttribute('color-interpolation-filters', 'sRGB');
    filter.setAttribute('x', '0');
    filter.setAttribute('y', '0');
    const id = `lg-lens-${Math.random().toString(36).slice(2, 9)}`;
    filter.setAttribute('id', id);
    const blur = document.createElementNS(SVG_NS, 'feGaussianBlur');
    blur.setAttribute('in', 'SourceGraphic');
    blur.setAttribute('result', 'softened');
    blur.setAttribute('edgeMode', 'duplicate');
    const image = document.createElementNS(SVG_NS, 'feImage');
    image.setAttribute('result', 'map');
    image.setAttribute('preserveAspectRatio', 'none');
    const disp = document.createElementNS(SVG_NS, 'feDisplacementMap');
    disp.setAttribute('in', 'softened');
    disp.setAttribute('in2', 'map');
    disp.setAttribute('xChannelSelector', 'R');
    disp.setAttribute('yChannelSelector', 'G');
    filter.append(blur, image, disp);
    svg.appendChild(filter);

    /* 第二份滤镜：吃同一张贴图，但位移小得多 —— 这份给 backdrop-filter 用，
       直接作用在**真实背景**上（内容在玻璃边缘被掰弯，也就是 Apple 那套透镜）。
       位移量必须比浮层那份小：浮层是自己的渐变，弯一点无妨；真实内容弯过头会撕裂。 */
    const backdropFilter = document.createElementNS(SVG_NS, 'filter');
    backdropFilter.setAttribute('filterUnits', 'userSpaceOnUse');
    backdropFilter.setAttribute('color-interpolation-filters', 'sRGB');
    backdropFilter.setAttribute('x', '0');
    backdropFilter.setAttribute('y', '0');
    const backdropId = `${id}-bd`;
    backdropFilter.setAttribute('id', backdropId);
    const backdropImage = document.createElementNS(SVG_NS, 'feImage');
    backdropImage.setAttribute('result', 'map');
    backdropImage.setAttribute('preserveAspectRatio', 'none');
    const backdropDisp = document.createElementNS(SVG_NS, 'feDisplacementMap');
    backdropDisp.setAttribute('in', 'SourceGraphic');
    backdropDisp.setAttribute('in2', 'map');
    backdropDisp.setAttribute('xChannelSelector', 'R');
    backdropDisp.setAttribute('yChannelSelector', 'G');
    backdropFilter.append(backdropImage, backdropDisp);
    svg.appendChild(backdropFilter);
    document.body.appendChild(svg);

    const host: LensHost = { filter, blur, image, disp, backdropFilter, backdropDisp, key: '' };
    hostRef.current = host;
    element.style.setProperty('--lg-map-url', `url(#${id})`);
    /* --lg-backdrop 是给 CSS 的「玻璃链」：透镜 + 轻磨砂，直接贴到 backdrop-filter 上 */
    element.style.setProperty('--lg-backdrop', `url(#${backdropId}) blur(4px) saturate(1.6)`);

    const update = () => {
      if (lowPerf() || !element.isConnected) return;
      const width = Math.round(element.offsetWidth);
      const height = Math.round(element.offsetHeight);
      if (!width || !height) return;
      const radius = Math.min(parseFloat(getComputedStyle(element).borderRadius) || 0, width / 2, height / 2);
      // 重建贴图是纯主线程活（逐像素 + 两次 base64 编码）：用 timeSync 报到 console，
      // 真机上超过 200ms 就会出现在 `adb logcat -s DuofenWeb` 里。
      const map = timeSync(`lens.build ${width}x${height}`, () => buildLensMap(width, height, radius, params));
      if (map.key === host.key) return;
      host.key = map.key;
      filter.setAttribute('width', String(width));
      filter.setAttribute('height', String(height));
      image.setAttribute('width', String(width));
      image.setAttribute('height', String(height));
      image.setAttribute('href', map.mapUrl);
      disp.setAttribute('scale', map.scale.toFixed(2));
      blur.setAttribute('stdDeviation', String(Math.max(0.6, params.strength)));
      /* backdrop 那份：贴图相同、位移收窄到 30% 且封顶 14px ——
         这是「内容被玻璃边缘掰弯」的可见量级；再大就会出现撕裂感而不是透镜感。 */
      backdropFilter.setAttribute('width', String(width));
      backdropFilter.setAttribute('height', String(height));
      backdropImage.setAttribute('width', String(width));
      backdropImage.setAttribute('height', String(height));
      backdropImage.setAttribute('href', map.mapUrl);
      backdropDisp.setAttribute('scale', Math.min(14, map.scale * 0.3).toFixed(2));
      element.style.setProperty('--lg-edge-url', `url("${map.edgeUrl}")`);
      element.dataset.lens = 'ready';
    };

    update();
    /* ResizeObserver 可能在一帧里连发多次（弹层展开/收起、安全区变化），
       每次都重算贴图 + 两次 toDataURL 在主线程上就是几十毫秒 —— 合帧 + 限流。
       页面不可见时也不重建（后台没人看）。 */
    let pending: number | undefined;
    const scheduleUpdate = () => {
      if (document.hidden) return;
      if (pending !== undefined) return;
      pending = window.setTimeout(() => {
        pending = undefined;
        update();
      }, 120);
    };
    const observer = new ResizeObserver(scheduleUpdate);
    observer.observe(element);

    return () => {
      observer.disconnect();
      if (pending !== undefined) window.clearTimeout(pending);
      svg.remove();
      hostRef.current = null;
      element.style.removeProperty('--lg-map-url');
      element.style.removeProperty('--lg-edge-url');
      delete element.dataset.lens;
    };
  }, [ref, params]);
}
