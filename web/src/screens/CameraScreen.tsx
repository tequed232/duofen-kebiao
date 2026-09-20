/**
 * 摄像 (Camera)
 *
 * Live camera preview (20dp rounded), a filled "返回" button drawn on top of the
 * preview, a "标签" outlined field with a search icon, and the shared nav bar.
 * Shutter captures a frame -> a new history record -> image-to-text API summary.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { AppNavBar, Chip } from '../components/layout';
import { MdIcon, MdIconButton, MdTextField } from '../components/md';
import { CompareSlider } from '../components/compare';
import { useAppState } from '../state/AppState';
import { useNav } from '../nav/navigation';
import { analyzeImage } from '../lib/api';
import { captureVideoFrame } from '../lib/imaging';
import { formatDateTime } from '../lib/utils';

export default function CameraScreen() {
  const nav = useNav();
  const { settings, records, createRecord, updateRecord, removeRecord, showSnackbar } = useAppState();

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [facing, setFacing] = useState<'environment' | 'user'>('environment');
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [tag, setTag] = useState('');
  const [lastShot, setLastShot] = useState<string | null>(null);
  /** 清晰度对比（ICAT 式：左边标准、右边当前设置） */
  const [compare, setCompare] = useState<{ before: string; after: string } | null>(null);

  const knownTags = useMemo(() => {
    const set = new Set<string>();
    records.forEach((record) => record.tags.forEach((value) => set.add(value)));
    return Array.from(set).slice(0, 8);
  }, [records]);

  const suggestions = useMemo(
    () => knownTags.filter((value) => !tag.trim() || value.includes(tag.trim())).slice(0, 6),
    [knownTags, tag],
  );

  useEffect(() => {
    let cancelled = false;
    const stop = () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };

    async function start() {
      stop();
      setReady(false);
      setError(null);
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('当前浏览器不支持摄像头采集，请改用支持摄像头权限的浏览器。');
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: facing, width: { ideal: 1440 }, height: { ideal: 1080 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          try {
            await video.play();
          } catch {
            /* autoplay may need a gesture; the preview still renders */
          }
        }
        setReady(true);
      } catch (caught) {
        const name = caught instanceof DOMException ? caught.name : '';
        const message =
          name === 'NotAllowedError'
            ? '未获得摄像头权限。请在浏览器地址栏允许摄像头访问后重试。'
            : name === 'NotFoundError'
              ? '没有找到可用的摄像头设备。'
              : `无法打开摄像头：${caught instanceof Error ? caught.message : '未知错误'}`;
        setError(message);
      }
    }

    void start();
    return () => {
      cancelled = true;
      stop();
    };
  }, [facing]);

  const capture = async () => {
    const video = videoRef.current;
    if (!video) return;
    const dataUrl = captureVideoFrame(video, settings.cameraSharpness);
    // ICAT 式对比：同一帧在「标准」与「当前清晰度」下的差异
    const standardFrame = captureVideoFrame(video, 0);
    if (standardFrame && dataUrl) setCompare({ before: standardFrame, after: dataUrl });
    if (!dataUrl) {
      showSnackbar({ message: '拍摄失败，请等待预览稳定后重试', duration: 4000 });
      return;
    }
    setCapturing(true);
    const trimmedTag = tag.trim();
    try {
      const record = await createRecord({
        title: trimmedTag || `照片记录 · ${formatDateTime(Date.now())}`,
        images: [dataUrl],
        tags: trimmedTag ? [trimmedTag] : [],
        note: '',
      });
      setLastShot(dataUrl);
      showSnackbar({
        message: '已保存到历史记录',
        actionLabel: '撤销',
        onAction: () => {
          void removeRecord(record.id);
          showSnackbar({ message: '已撤销这次拍摄' });
        },
      });
      if (settings.visionApiUrl.trim()) {
        try {
          const result = await analyzeImage(dataUrl, settings);
          await updateRecord(record.id, {
            imageSummary: result.summary,
            keyPoints: result.keyPoints,
            note: result.summary,
            tags: Array.from(new Set([...record.tags, ...result.tags])),
          });
          showSnackbar({ message: '图片已识别并生成总结' });
        } catch (caught) {
          showSnackbar({
            message: `识别失败：${caught instanceof Error ? caught.message : '未知错误'}`,
            duration: 6000,
          });
        }
      } else {
        showSnackbar({
          message: '照片已保存。配置“图片转文字API”后可自动识别与总结。',
          duration: 6000,
        });
      }
    } finally {
      setCapturing(false);
    }
  };

  const selectTab = (tab: 'home' | 'history' | 'schedule' | 'settings') => {
    // 课表是主页：点它回到栈底的课表页
    if (tab === 'schedule') {
      nav.popTo('schedule');
      return;
    }
    nav.push(tab, {}, 'slide');
  };

  return (
    <>
      <div className="screen-inner">
        <div className="screen-content" style={{ paddingTop: 12 }}>
          <div
            className={['camera-frame', facing === 'user' ? 'mirrored' : ''].join(' ').trim()}
            style={{ aspectRatio: '380 / 564', maxHeight: 520 }}
          >
            <video ref={videoRef} playsInline muted autoPlay aria-label="相机实时预览" />

            {/* controls drawn in front of the preview */}
            <div className="camera-overlay">
              <div style={{ position: 'absolute', top: 12, left: 12 }}>
                <md-filled-button onClick={() => nav.popTo('home')}>
                  <MdIcon slot="icon" name="arrow_back" />
                  返回
                </md-filled-button>
              </div>
              <div style={{ position: 'absolute', top: 16, right: 12 }}>
                <MdIconButton
                  icon="flip_camera_ios"
                  label="切换前后摄像头"
                  tonal
                  onClick={() => setFacing((value) => (value === 'environment' ? 'user' : 'environment'))}
                />
              </div>
              {capturing ? (
                <div
                  className="md-label-medium"
                  style={{
                    position: 'absolute',
                    top: 20,
                    right: 16,
                    color: 'var(--md-sys-color-inverse-on-surface)',
                    background: 'color-mix(in srgb, var(--md-sys-color-inverse-surface) 70%, transparent)',
                    padding: '6px 10px',
                    borderRadius: 999,
                  }}
                >
                  正在处理…
                </div>
              ) : null}
            </div>

            {error ? (
              <div className="camera-denied">
                <MdIcon name="no_photography" size={56} />
                <div className="md-title-medium-emphasized">摄像头不可用</div>
                <div className="md-body-medium" style={{ maxWidth: 280, opacity: 0.85 }}>
                  {error}
                </div>
                <md-filled-tonal-button onClick={() => setFacing((value) => value)}>重试</md-filled-tonal-button>
              </div>
            ) : null}
          </div>

          <div className="mt-16">
            <MdTextField
              label="标签"
              value={tag}
              onValueChange={setTag}
              placeholder="为这次拍摄添加标签"
              supportingText="标签会写入记录，用于历史记录搜索"
              leadingIcon={<MdIcon name="search" />}
            />
            {suggestions.length ? (
              <div className="chip-row mt-8">
                {suggestions.map((value) => (
                  <Chip key={value} icon="label" onClick={() => setTag(value)}>
                    {value}
                  </Chip>
                ))}
              </div>
            ) : null}
          </div>

          <div className="camera-shutter-row">
            <md-fab size="large" aria-label="拍照并保存" onClick={() => void capture()} disabled={!ready || capturing ? '' : undefined}>
              <MdIcon slot="icon" name="photo_camera" size={32} />
            </md-fab>
          </div>

          {compare ? (
            <div className="mt-16">
              <div className="md-title-small-emphasized mb-8">清晰度对比（拖动分界线 / 可放大）</div>
              <CompareSlider
                before={compare.before}
                after={compare.after}
                beforeLabel="标准"
                afterLabel={`当前 %`}
                height={180}
              />
            </div>
          ) : null}

          <div className="md-body-small hint" style={{ textAlign: 'center' }}>
            {lastShot ? '刚刚拍摄的照片已保存到历史记录。' : '快门会保存当前画面到历史记录，并交给图片转文字API识别。'}
          </div>
        </div>

        <AppNavBar active="home" onSelect={selectTab} />
      </div>
    </>
  );
}
