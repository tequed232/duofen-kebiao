/** Overlays: snackbar, confirm dialog, the expandable fullscreen panel and the image viewer. */
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { MdDialog, MdIcon, MdIconButton } from './md';
import { useAppState } from '../state/AppState';
import { MOTION } from '../theme/motion';

/* ------------------------------------------------------------- snackbar --- */

export function SnackbarLayer({ bottom = 16 }: { bottom?: number }) {
  const { snackbar, hideSnackbar } = useAppState();

  return (
    <div className="snackbar-layer" style={{ '--snackbar-bottom': `${bottom}px` } as React.CSSProperties} aria-live="polite">
      {snackbar ? (
        <div key={snackbar.id} className="snackbar entering" role="status">
          <span className="md-body-medium flex-1">{snackbar.message}</span>
          {snackbar.actionLabel ? (
            <md-text-button
              onClick={() => {
                snackbar.onAction?.();
                hideSnackbar();
              }}
            >
              {snackbar.actionLabel}
            </md-text-button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------- confirm dialog -- */

export function ConfirmDialog({
  open,
  headline,
  body,
  confirmLabel = '删除',
  cancelLabel = '取消',
  destructive = true,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  headline: string;
  body: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <MdDialog
      open={open}
      headline={headline}
      onClosed={onCancel}
      actions={
        <>
          <md-text-button onClick={onCancel}>{cancelLabel}</md-text-button>
          <md-text-button
            onClick={onConfirm}
            style={
              destructive
                ? ({ '--md-text-button-label-text-color': 'var(--md-sys-color-error)' } as React.CSSProperties)
                : undefined
            }
          >
            {confirmLabel}
          </md-text-button>
        </>
      }
    >
      {body}
    </MdDialog>
  );
}

/* ------------------------------------------------------ expandable sheet -- */
/**
 * The container-box behaviour from the spec: tapping a container animates it into a
 * full screen `surfaceContainerHigh` panel (FLIP from the container's own rect with an
 * Expressive spring), while the rest of the screen sinks underneath. Tapping outside
 * (or pressing Escape / the system back gesture) collapses it back into place.
 */
export function ExpandableSheet({
  open,
  onClose,
  sourceRef,
  title,
  icon,
  children,
  headerActions,
  scrollable = true,
  variant = 'full',
  actions,
}: {
  open: boolean;
  onClose: () => void;
  sourceRef: RefObject<HTMLElement | null>;
  title: ReactNode;
  icon?: string;
  children: ReactNode;
  headerActions?: ReactNode;
  scrollable?: boolean;
  /**
   * `half` = 抖音评论区那种**半遮蔽**底部弹层：贴底、只占屏幕下半部分，上方留半屏可见。
   * 课程详情与"导航到某地"用这一档；导入课表那种长表单仍走默认的 `full`（整屏）。
   */
  variant?: 'full' | 'half';
  /** 贴底主操作条（半屏弹层常用：课程详情那里放「导航至 <地点>」） */
  actions?: ReactNode;
}) {
  const [rendered, setRendered] = useState(open);
  const [phase, setPhase] = useState<'closed' | 'opening' | 'open' | 'closing'>(open ? 'open' : 'closed');
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && phase === 'closed') {
      setRendered(true);
      setPhase('opening');
    } else if (!open && (phase === 'open' || phase === 'opening')) {
      setPhase('closing');
    }
  }, [open, phase]);

  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!panel) return undefined;

    if (phase === 'opening') {
      const target = panel.getBoundingClientRect();
      const source = sourceRef.current?.getBoundingClientRect();
      const from = source && source.width > 0 ? source : target;
      const scaleX = Math.max(0.02, from.width / target.width);
      const scaleY = Math.max(0.02, from.height / target.height);
      const dx = from.left - target.left;
      const dy = from.top - target.top;
      panel.style.transition = 'none';
      panel.style.transformOrigin = 'top left';
      panel.style.transform = `translate(${dx}px, ${dy}px) scale(${scaleX}, ${scaleY})`;
      // force a reflow so the next frame animates from the container's rect
      void panel.getBoundingClientRect();
      const frame = window.requestAnimationFrame(() => {
        panel.style.transition = `transform ${MOTION.spatial.default.duration}s ${MOTION.spatial.default.css}`;
        panel.style.transform = 'translate(0px, 0px) scale(1, 1)';
        window.setTimeout(() => setPhase('open'), MOTION.spatial.default.duration * 1000);
      });
      return () => window.cancelAnimationFrame(frame);
    }

    if (phase === 'closing') {
      const target = panel.getBoundingClientRect();
      const source = sourceRef.current?.getBoundingClientRect();
      const scaleX = source && source.width > 0 ? Math.max(0.02, source.width / target.width) : 0.9;
      const scaleY = source && source.height > 0 ? Math.max(0.02, source.height / target.height) : 0.4;
      const dx = source && source.width > 0 ? source.left - target.left : 0;
      const dy = source && source.height > 0 ? source.top - target.top : 40;
      panel.style.transition = `transform ${MOTION.spatial.fast.duration}s ${MOTION.spatial.fast.css}`;
      panel.style.transform = `translate(${dx}px, ${dy}px) scale(${scaleX}, ${scaleY})`;
      const timer = window.setTimeout(() => {
        setRendered(false);
        setPhase('closed');
      }, MOTION.spatial.fast.duration * 1000 + 40);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [phase, sourceRef]);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!rendered) return null;

  return (
    <div className={['sheet-layer', open ? 'open' : ''].join(' ').trim()}>
      <div className="sheet-scrim" onClick={onClose} aria-hidden="true" />
      <section className={variant === 'half' ? 'sheet-panel half' : 'sheet-panel'} ref={panelRef} role="dialog" aria-modal="true">
        <div className="sheet-header">
          {icon ? <MdIcon name={icon} size={24} /> : null}
          <div className="sheet-title md-title-large-emphasized">{title}</div>
          {headerActions}
          <MdIconButton icon="close" label="收起面板" onClick={onClose} />
        </div>
        <div className={['sheet-body', scrollable ? 'scroll-y' : ''].join(' ').trim()}>{children}</div>
        {actions ? <div className="sheet-action">{actions}</div> : null}
      </section>
    </div>
  );
}

/* ---------------------------------------------------------- image viewer -- */

export function ImageViewer({
  images,
  startIndex = 0,
  title,
  onClose,
}: {
  images: string[];
  startIndex?: number;
  title?: string;
  onClose: () => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(startIndex);
  const [dragY, setDragY] = useState(0);
  const dragStart = useRef<number | null>(null);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    track.scrollTo({ left: track.clientWidth * startIndex, behavior: 'auto' });
  }, [startIndex]);

  const close = () => {
    setClosing(true);
    window.setTimeout(onClose, MOTION.effects.default.duration * 1000);
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const track = trackRef.current;
      if (event.key === 'Escape') close();
      if (!track) return;
      if (event.key === 'ArrowRight') track.scrollBy({ left: track.clientWidth, behavior: 'smooth' });
      if (event.key === 'ArrowLeft') track.scrollBy({ left: -track.clientWidth, behavior: 'smooth' });
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className={['viewer', closing ? 'leaving' : 'entering'].join(' ')}
      style={{ transform: dragY ? `translateY(${dragY}px)` : undefined, transition: dragStart.current === null ? 'transform 200ms ease-out' : 'none' }}
      onPointerDown={(event) => {
        if (event.pointerType === 'mouse') return;
        dragStart.current = event.clientY;
      }}
      onPointerMove={(event) => {
        if (dragStart.current === null) return;
        const delta = event.clientY - dragStart.current;
        if (delta > 0) setDragY(delta);
      }}
      onPointerUp={() => {
        if (dragStart.current === null) return;
        const delta = dragY;
        dragStart.current = null;
        if (delta > 120) close();
        else setDragY(0);
      }}
      onPointerCancel={() => {
        dragStart.current = null;
        setDragY(0);
      }}
    >
      <div className="viewer-bar">
        <MdIconButton icon="close" label="关闭图片" onClick={close} />
        <span className="md-title-medium flex-1" style={{ marginLeft: 8 }}>
          {title ?? '图片'}
        </span>
        <span className="md-label-large mono">
          {index + 1} / {images.length}
        </span>
      </div>
      <div
        className="viewer-track"
        ref={trackRef}
        onScroll={(event) => {
          const element = event.currentTarget;
          if (!element.clientWidth) return;
          setIndex(Math.round(element.scrollLeft / element.clientWidth));
        }}
      >
        {images.map((src, itemIndex) => (
          <div className="viewer-item" key={`${itemIndex}-${src.slice(-16)}`}>
            <img src={src} alt={`图片 ${itemIndex + 1}`} />
          </div>
        ))}
      </div>
      <div className="md-body-small" style={{ textAlign: 'center', padding: '0 16px 16px', opacity: 0.75 }}>
        左右滑动切换图片 · 下滑或点击关闭图标返回
      </div>
    </div>
  );
}
