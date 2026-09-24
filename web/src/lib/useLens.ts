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
  /** backdrop 那份的模糊与位移节点（不做色散时它是唯一的位移） */
  backdropBlur: SVGFEGaussianBlurElement;
  backdropDisp: SVGFEDisplacementMapElement;
  /**
   * 色散的每一段光谱各一个位移节点（简洁档 3 个 = R/G/B，极致档 6 个 = 六段光谱）。
   * 不做色散时是空数组，走 [backdropDisp] 那条单位移链。
   */
  backdropDisps: SVGFEDisplacementMapElement[];
  key: string;
}

/**
 * 色散的分段色向量。每一段 = 一个色权重三元组，用它做 `feColorMatrix` 的对角缩放，
 * 位移之后再 screen 叠回去。
 *
 * 关键性质：**每一组的三元组之和都等于 (1,1,1)**（颜色空间里的分区单位）。
 * 于是位移为 0 的地方（玻璃中间）六份叠回来 ≈ 原画面，不会整块偏色 ——
 * 这正是当年 `c201278` 那版"整屏发紫"要修掉的东西。
 */
const RGB_BANDS: Array<[number, number, number]> = [
  [1, 0, 0], // R
  [0, 1, 0], // G
  [0, 0, 1], // B
];
const SPECTRUM_BANDS: Array<[number, number, number]> = [
  [0.25, 0.0, 0.35], // 紫
  [0.0, 0.05, 0.45], // 蓝
  [0.0, 0.25, 0.2], // 青
  [0.05, 0.55, 0.0], // 绿
  [0.35, 0.15, 0.0], // 黄
  [0.35, 0.0, 0.0], // 红
];
const bandColors = (bands: number) => (bands >= 6 ? SPECTRUM_BANDS : RGB_BANDS);
/** 对角缩放矩阵：R/G/B 各乘一个系数，alpha 原样透传 */
const bandMatrix = ([r, g, b]: [number, number, number]) =>
  `${r} 0 0 0 0  0 ${g} 0 0 0  0 0 ${b} 0 0  0 0 0 1 0`;

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
    const bands = Math.max(1, Math.round(params.bands ?? 3));
    let backdropDisp = displace('softened', 'refracted');
    let backdropDisps: SVGFEDisplacementMapElement[] = [];
    backdropFilter.append(backdropBlur, backdropImage);
    if (fringe > 0) {
      const colors = bandColors(bands);
      const outputs: string[] = [];
      backdropDisps = colors.map((color, index) => {
        const node = displace('softened', `band-d${index}`);
        const keep = document.createElementNS(SVG_NS, 'feColorMatrix');
        keep.setAttribute('in', `band-d${index}`);
        keep.setAttribute('type', 'matrix');
        keep.setAttribute('values', bandMatrix(color));
        keep.setAttribute('result', `band-c${index}`);
        backdropFilter.append(node, keep);
        outputs.push(`band-c${index}`);
        return node;
      });
      /* 合成：**加法**（feComposite arithmetic k2=k3=1）。
         为什么不用 screen：screen 是非线性的（1−(1−a)(1−b)），六段部分颜色相加时
         在亮处会饱和 —— 实测极致档的"中间带"因此从噪声底 0.42 涨到 2.98，
         看着就是"整面有一层淡淡偏色"（作者当初否掉的正是这个）。
         六段色向量之和恰好 = (1,1,1)，加法下位移为 0 的地方**精确还原**原画面，
         中间那层偏色就没了；backdrop 采到的真实背景是不透明的，加法也不会把 alpha 叠歪。 */
      let previous = outputs[0];
      for (let index = 1; index < outputs.length; index += 1) {
        const mix = document.createElementNS(SVG_NS, 'feComposite');
        mix.setAttribute('in', previous);
        mix.setAttribute('in2', outputs[index]);
        mix.setAttribute('operator', 'arithmetic');
        mix.setAttribute('k1', '0');
        mix.setAttribute('k2', '1');
        mix.setAttribute('k3', '1');
        mix.setAttribute('k4', '0');
        const result = index === outputs.length - 1 ? 'refracted' : `band-mix${index}`;
        mix.setAttribute('result', result);
        backdropFilter.append(mix);
        previous = result;
      }
      /* 只有一段时没有 feBlend，直接给它一个结果名，后面的引用才有效 */
      if (outputs.length === 1) backdropDisps[0].setAttribute('result', 'refracted');
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
      backdropDisps,
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
      /* 每一段光谱一个位移量，沿线均匀铺开：
         简洁档 3 段 → [+fringe/2, 0, −fringe/2]（与作者此刻看到的完全一致）；
         极致档 6 段 → 紫 … 红依次铺满 [−fringe/2, +fringe/2]。
         位移量之差 → 横向彩色分离，而位移为 0 的中间区自动无色差。 */
      const count = host.backdropDisps.length;
      host.backdropDisps.forEach((node, index) => {
        const offset = count > 1 ? fringe * (0.5 - index / (count - 1)) : 0;
        node.setAttribute('scale', Math.max(0, backdropScale + offset).toFixed(2));
      });
      element.style.setProperty('--lg-edge-url', `url("${map.edgeUrl}")`);
      element.dataset.lens = 'ready';
      element.dataset.lensDispersion = fringe > 0 ? `bands-${count}` : 'none';
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
