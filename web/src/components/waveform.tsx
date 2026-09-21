/**
 * 实时波形图（录音可视化）。
 *
 * 用 getUserMedia + AnalyserNode 取实时频谱，画成 M3 风格的圆角柱状波形；
 * 不依赖任何外部库，录音结束自动释放麦克风。
 */
import { useEffect, useRef } from 'react';

export function Waveform({
  active,
  bars = 28,
  height = 44,
  label = '录音波形',
}: {
  active: boolean;
  bars?: number;
  height?: number;
  label?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!active) return undefined;
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;

    let stream: MediaStream | undefined;
    let audio: AudioContext | undefined;
    let analyser: AnalyserNode | undefined;
    let raf = 0;
    let stopped = false;
    const data = new Uint8Array(128);

    const draw = () => {
      if (stopped || !ctx) return;
      const ratio = window.devicePixelRatio || 1;
      const width = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== width * ratio || canvas.height !== h * ratio) {
        canvas.width = width * ratio;
        canvas.height = h * ratio;
      }
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.clearRect(0, 0, width, h);

      if (analyser) analyser.getByteFrequencyData(data);
      const style = getComputedStyle(canvas);
      const accent = style.getPropertyValue('--wave-accent').trim() || '#12512E';
      const idle = style.getPropertyValue('--wave-idle').trim() || 'rgba(0,0,0,0.14)';

      const gap = 3;
      const barWidth = Math.max(2, (width - gap * (bars - 1)) / bars);
      for (let i = 0; i < bars; i += 1) {
        // 取对数分布的频段，低频更敏感，符合语音的听感
        const index = Math.floor(Math.pow(i / bars, 1.6) * (data.length * 0.6));
        const value = analyser ? data[index] / 255 : 0;
        const barHeight = Math.max(3, value * h * 0.92);
        const x = i * (barWidth + gap);
        const y = (h - barHeight) / 2;
        ctx.fillStyle = value > 0.06 ? accent : idle;
        ctx.beginPath();
        const radius = Math.min(barWidth / 2, barHeight / 2);
        ctx.roundRect(x, y, barWidth, barHeight, radius);
        ctx.fill();
      }
      raf = window.requestAnimationFrame(draw);
    };

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audio = new AudioContext();
        const source = audio.createMediaStreamSource(stream);
        analyser = audio.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.75;
        source.connect(analyser);
      } catch {
        /* 拿不到麦克风就画一根静止的细线，不打断录音流程 */
      }
      raf = window.requestAnimationFrame(draw);
    })();

    return () => {
      stopped = true;
      window.cancelAnimationFrame(raf);
      stream?.getTracks().forEach((track) => track.stop());
      void audio?.close().catch(() => undefined);
    };
  }, [active, bars]);

  return (
    <canvas
      ref={canvasRef}
      className="waveform"
      style={{ height }}
      role="img"
      aria-label={label}
      data-active={active ? 'true' : 'false'}
    />
  );
}
