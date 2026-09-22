/** Image picking, downscaling and camera frame capture. */

/**
 * 调起系统文件浏览器选择单个文件。
 *
 * accept 为空时**不设置 accept 属性**：Android 的文件管理器 / iOS 文件 App 会按
 * accept 里声明的类型把不匹配的文件置灰，导致"选不了文件"。课表这类来源多样的
 * 文件一律先让用户在系统文件浏览器里自由选择，选完再按内容识别格式。
 */
export function pickFile(_label: string, accept?: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    if (accept) input.accept = accept;
    input.multiple = false;
    // 保留在布局里（部分浏览器会忽略 display:none 的输入框）
    input.style.position = 'fixed';
    input.style.left = '-1000px';
    input.style.opacity = '0';
    document.body.appendChild(input);

    let settled = false;
    const finish = (file: File | null) => {
      if (settled) return;
      settled = true;
      input.remove();
      window.removeEventListener('focus', onFocus);
      resolve(file);
    };
    // 桌面浏览器取消选择时不一定触发 cancel 事件，用窗口重新获得焦点兜底
    const onFocus = () => {
      window.setTimeout(() => {
        if (!input.files || !input.files.length) finish(null);
      }, 800);
    };

    input.addEventListener('change', () => finish(input.files?.[0] ?? null));
    input.addEventListener('cancel', () => finish(null));
    window.addEventListener('focus', onFocus, { once: true });
    input.click();
  });
}

/** Natural image picker: one image at a time, via the platform file chooser. */
export function pickImageFile(): Promise<File | null> {
  return pickFile('图片', 'image/*');
}

export function fileToDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('读取图片失败'));
    reader.readAsDataURL(file);
  });
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('图片解码失败'));
    image.src = dataUrl;
  });
}

/**
 * "相机清晰度调整" -> capture resolution and JPEG quality.
 * sharpness 0..100 maps to a 720..2160px long edge and 0.55..0.95 quality.
 */
export function sharpnessToQuality(sharpness: number): { maxEdge: number; quality: number } {
  const t = Math.min(100, Math.max(0, sharpness)) / 100;
  return { maxEdge: Math.round(720 + t * 1440), quality: Number((0.55 + t * 0.4).toFixed(2)) };
}

export async function downscaleDataUrl(dataUrl: string, sharpness: number): Promise<string> {
  const { maxEdge, quality } = sharpnessToQuality(sharpness);
  try {
    const image = await loadImage(dataUrl);
    const longest = Math.max(image.naturalWidth, image.naturalHeight);
    if (!longest) return dataUrl;
    const scale = Math.min(1, maxEdge / longest);
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) return dataUrl;
    context.drawImage(image, 0, 0, width, height);
    return canvas.toDataURL('image/jpeg', quality);
  } catch {
    return dataUrl;
  }
}

/**
 * 选图 → 缩放 → JPEG dataURL。
 *
 * **优先走 createImageBitmap**：解码在后台线程完成，主线程只做一次缩放的 drawImage。
 * 老路径（FileReader 读成 base64 → `img.src` 再解一遍 base64 → 解码 JPEG）在手机上
 * 处理一张 12MP 照片会把主线程顶住几百毫秒甚至几秒 —— 表现就是「点一下卡死」。
 */
export async function prepareImageFile(file: File, sharpness: number): Promise<string> {
  const { maxEdge, quality } = sharpnessToQuality(sharpness);
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      const longest = Math.max(bitmap.width, bitmap.height) || 1;
      const scale = Math.min(1, maxEdge / longest);
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('画布不可用');
      context.drawImage(bitmap, 0, 0, width, height);
      bitmap.close?.();
      return canvas.toDataURL('image/jpeg', quality);
    } catch {
      /* 落到下面的兼容路径 */
    }
  }
  const dataUrl = await fileToDataUrl(file);
  return downscaleDataUrl(dataUrl, sharpness);
}

/** Grab the current video frame as a JPEG data URL. */
export function captureVideoFrame(video: HTMLVideoElement, sharpness: number): string | null {
  const width = video.videoWidth;
  const height = video.videoHeight;
  if (!width || !height) return null;
  const { maxEdge, quality } = sharpnessToQuality(sharpness);
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext('2d');
  if (!context) return null;
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  try {
    return canvas.toDataURL('image/jpeg', quality);
  } catch {
    return null;
  }
}

export function dataUrlSizeKb(dataUrl: string): number {
  const index = dataUrl.indexOf(',');
  const payload = index >= 0 ? dataUrl.slice(index + 1) : dataUrl;
  return Math.round((payload.length * 0.75) / 1024);
}
