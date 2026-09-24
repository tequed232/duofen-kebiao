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
  /** backdrop 那份的模糊与位移节点（G 通道；不做色散时它是唯一的位移） */
  backdropBlur: SVGFEGaussianBlurElement;
  backdropDisp: SVGFEDisplacementMapElement;
  /** 色散的两个额外通道：R 位移比 G 大一点、B 小一点。不做色散时为 null */
  backdropDispR: SVGFEDisplacementMapElement | null;
  backdropDispB: SVGFEDisplacementMapElement | null;
  key: string;
}

/** 只留一个通道的矩阵（R / G / B），alpha 原样透传 —— 色散就是把三份单通道合回去 */
const CHANNEL_MATRIX = [
  '1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0',
  '0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0',
  '0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0',
];

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

    /* 第二份滤镜：给 backdrop-filter 用，直接作用在**真实背景**上
       （内容在玻璃边缘被掰弯，也就是 Apple 那套透镜）。位移量必须比浮层那份小：
       浮层是自己的渐变，弯一点无妨；真实内容弯过头会撕裂。

       色散在这里、也只在这里做（fringe > 0 时）：把同一张位移图用三个略有差异的
       位移量采样三次，每次只留一个通道（feColorMatrix），再用 screen 叠回去 ——
       screen 对互不相交的通道就是相加，于是 R/G/B 各自被掰了不同的角度，
       边缘就出现真实玻璃那种彩边。**色差正比于位移量**，所以中心区自动没有色散，
       彩色只出现在被掰弯的那圈窄带上（作者最初反馈的「上下色散太多太突兀」
       是给整张贴图配固定偏移造成的，不是色散本身的错）。
       浮层那条链**不做色散**：它是半透明渐变（alpha < 1），三份相加会把 alpha
       也叠成三倍、整条光带变实；backdrop 采到的真实背景是不透明的，没有这个问题。 */
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
    const backdropBlur = document.createElementNS(SVG_NS, 'feGaussianBlur');
    backdropBlur.setAttribute('in', 'SourceGraphic');
    backdropBlur.setAttribute('result', 'softened');
    backdropBlur.setAttribute('edgeMode', 'duplicate');
    const displace = (source: string, result: string) => {
      const node = document.createElementNS(SVG_NS, 'feDisplacementMap');
      node.setAttribute('in', source);
      node.setAttribute('in2', 'map');
      node.setAttribute('xChannelSelector', 'R');
      node.setAttribute('yChannelSelector', 'G');
      node.setAttribute('result', result);
      return node;
    };
    const fringe = params.fringe ?? 0;
    let backdropDisp = displace('softened', 'refracted');
    let backdropDispR: SVGFEDisplacementMapElement | null = null;
    let backdropDispB: SVGFEDisplacementMapElement | null = null;
    backdropFilter.append(backdropBlur, backdropImage);
    if (fringe > 0) {
      const channels: string[] = [];
      [0, 1, 2].forEach((index) => {
        const disp = displace('softened', `split-d${index}`);
        const keep = document.createElementNS(SVG_NS, 'feColorMatrix');
        keep.setAttribute('in', `split-d${index}`);
        keep.setAttribute('type', 'matrix');
        keep.setAttribute('values', CHANNEL_MATRIX[index]);
        keep.setAttribute('result', `split-c${index}`);
        backdropFilter.append(disp, keep);
        channels.push(`split-c${index}`);
        if (index === 0) backdropDispR = disp;
        else if (index === 1) backdropDisp = disp;
        else backdropDispB = disp;
      });
      /* screen：通道互不相交，等价于相加；再叠一次就凑回完整的 RGB */
      const mixRG = document.createElementNS(SVG_NS, 'feBlend');
      mixRG.setAttribute('in', channels[0]);
      mixRG.setAttribute('in2', channels[1]);
      mixRG.setAttribute('mode', 'screen');
      mixRG.setAttribute('result', 'split-rg');
      const mixRGB = document.createElementNS(SVG_NS, 'feBlend');
      mixRGB.setAttribute('in', 'split-rg');
      mixRGB.setAttribute('in2', channels[2]);
      mixRGB.setAttribute('mode', 'screen');
      backdropFilter.append(mixRG, mixRGB);
    } else {
      backdropFilter.append(backdropDisp);
    }
    svg.appendChild(backdropFilter);
    document.body.appendChild(svg);

    const host: LensHost = {
      filter,
      blur,
      image,
      disp,
      backdropFilter,
      backdropBlur,
      backdropDisp,
      backdropDispR,
      backdropDispB,
      key: '',
    };
    hostRef.current = host;
    element.style.setProperty('--lg-map-url', `url(#${id})`);
    /* --lg-backdrop 是给 CSS 的「玻璃链」：透镜 + 轻磨砂，直接贴到 backdrop-filter 上。
       磨砂要**轻**（2px）：折射只在边缘发生，模糊一大就把掰弯的观感抹平了。
       注意 blur 在函数链里排在 url() 之后 —— 色散发生在滤镜图内部，
       后面再叠一层 2px 模糊会把刚分开的 R/B 又糊回去，所以做色散时把模糊
       **挪进滤镜图**（在位移之前，见 update()），CSS 这边就不再叠 blur。 */
    element.style.setProperty(
      '--lg-backdrop',
      fringe > 0 ? `url(#${backdropId}) saturate(1.6)` : `url(#${backdropId}) blur(2px) saturate(1.6)`,
    );

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
      /* backdrop 那份：贴图相同，但**位移大幅收窄**（作者反馈：边缘扭曲区域太大、显得夸张；
         苹果的扭曲收在选中框周围一小块、衰减很快）。
         封顶与系数由参数覆盖 —— 底栏取 7px / 0.16，真实背景只被掰弯一点点；
         浮层沿用默认的 10px / 0.22。 */
      const backdropScale = Math.min(params.backdropMax ?? 10, map.scale * (params.backdropFactor ?? 0.22));
      backdropFilter.setAttribute('width', String(width));
      backdropFilter.setAttribute('height', String(height));
      backdropImage.setAttribute('width', String(width));
      backdropImage.setAttribute('height', String(height));
      backdropImage.setAttribute('href', map.mapUrl);
      /* 做色散时，那 2px 磨砂挪到滤镜图内部（位移**之前**）：模糊是卷积，
         放在位移前还是后视觉上几乎没差，但放在后面会把刚分开的 R/B 糊回去。 */
      backdropBlur.setAttribute('stdDeviation', String(Math.max(0.4, params.edge * 2) + (fringe > 0 ? 2 : 0)));
      host.backdropDisp.setAttribute('scale', backdropScale.toFixed(2));
      if (host.backdropDispR && host.backdropDispB) {
        host.backdropDispR.setAttribute('scale', (backdropScale + fringe / 2).toFixed(2));
        host.backdropDispB.setAttribute('scale', Math.max(0, backdropScale - fringe / 2).toFixed(2));
      }
      element.style.setProperty('--lg-edge-url', `url("${map.edgeUrl}")`);
      element.dataset.lens = 'ready';
      element.dataset.lensDispersion = fringe > 0 ? 'rgb' : 'none';
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
      delete element.dataset.lensDispersion;
    };
  }, [ref, params]);
}
