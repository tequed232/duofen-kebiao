/**
 * Thin React wrappers around the Material Web (`@material/web`) custom elements.
 *
 * Material Web components expose imperative properties (`selected`, `value`,
 * `activeTabIndex`, `open`) and fire native events; React does not map those
 * reliably, so each wrapper sets the property through a ref and subscribes with
 * `addEventListener`. Everything visible is still rendered by the library
 * component - we never re-implement a component the library already ships.
 */
import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { iconChar } from '../theme/icon-codepoints';
import { haptic } from '../lib/native';

type ElementRef<T> = { current: T | null };

export function MdIcon({
  name,
  filled = false,
  className,
  style,
  size,
  slot,
}: {
  name: string;
  filled?: boolean;
  className?: string;
  style?: CSSProperties;
  size?: number;
  slot?: string;
}) {
  return (
    <md-icon
      slot={slot}
      className={[filled ? 'icon-filled' : '', className ?? ''].join(' ').trim()}
      style={{ fontSize: size ? `${size}px` : undefined, ...style }}
      aria-hidden="true"
    >
      {iconChar(name) || name}
    </md-icon>
  );
}

export function MdSwitch({
  selected,
  onSelectedChange,
  ariaLabel,
  className,
  style,
  id,
}: {
  selected: boolean;
  onSelectedChange: (value: boolean) => void;
  ariaLabel?: string;
  className?: string;
  style?: CSSProperties;
  id?: string;
}) {
  const ref = useRef<HTMLElement & { selected: boolean }>(null);
  const handler = useRef(onSelectedChange);
  handler.current = onSelectedChange;

  useEffect(() => {
    const element = ref.current;
    if (element && element.selected !== selected) element.selected = selected;
  }, [selected]);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const onChange = () => handler.current(Boolean(element.selected));
    element.addEventListener('change', onChange);
    return () => element.removeEventListener('change', onChange);
  }, []);

  return <md-switch ref={ref} id={id} className={className} style={style} aria-label={ariaLabel} />;
}

export function MdSlider({
  value,
  min = 0,
  max = 100,
  step = 1,
  onInput,
  onChange,
  ariaLabel,
  className,
  style,
  labeled = false,
  ticks = false,
}: {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onInput?: (value: number) => void;
  onChange?: (value: number) => void;
  ariaLabel?: string;
  className?: string;
  style?: CSSProperties;
  labeled?: boolean;
  ticks?: boolean;
}) {
  const ref = useRef<HTMLElement & { value: number; min: number; max: number; step: number }>(null);
  const inputHandler = useRef(onInput);
  const changeHandler = useRef(onChange);
  inputHandler.current = onInput;
  changeHandler.current = onChange;

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    element.min = min;
    element.max = max;
    element.step = step;
    // Do not fight the user while dragging.
    if (Math.abs(Number(element.value) - value) > 1e-6) element.value = value;
  }, [value, min, max, step]);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    // 滑动控件：每动一步给一次轻刻度（haptic() 内部自带 40ms 去重，不会连成嗡嗡声）
    const onInputEvent = () => {
      haptic('tick');
      inputHandler.current?.(Number(element.value));
    };
    const onChangeEvent = () => changeHandler.current?.(Number(element.value));
    element.addEventListener('input', onInputEvent);
    element.addEventListener('change', onChangeEvent);
    return () => {
      element.removeEventListener('input', onInputEvent);
      element.removeEventListener('change', onChangeEvent);
    };
  }, []);

  return (
    <md-slider
      ref={ref}
      className={className}
      style={style}
      aria-label={ariaLabel}
      labeled={labeled ? '' : undefined}
      ticks={ticks ? '' : undefined}
    />
  );
}

export function MdTextField({
  label,
  value,
  onValueChange,
  onEnter,
  placeholder,
  supportingText,
  error = false,
  type = 'text',
  leadingIcon,
  trailingIcon,
  className,
  style,
  disabled = false,
  id,
  autofocus = false,
  rows,
}: {
  label?: string;
  value: string;
  onValueChange?: (value: string) => void;
  onEnter?: () => void;
  placeholder?: string;
  supportingText?: string;
  error?: boolean;
  type?: string;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
  className?: string;
  style?: CSSProperties;
  disabled?: boolean;
  id?: string;
  autofocus?: boolean;
  rows?: number;
}) {
  const ref = useRef<HTMLElement & { value: string }>(null);
  const valueHandler = useRef(onValueChange);
  const enterHandler = useRef(onEnter);
  valueHandler.current = onValueChange;
  enterHandler.current = onEnter;

  useEffect(() => {
    const element = ref.current;
    if (element && element.value !== value) element.value = value;
  }, [value]);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const onInput = () => valueHandler.current?.(String(element.value));
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Enter' && !event.shiftKey && (event.target as HTMLElement)?.tagName !== 'TEXTAREA') {
        enterHandler.current?.();
      }
    };
    element.addEventListener('input', onInput);
    element.addEventListener('keydown', onKeyDown);
    return () => {
      element.removeEventListener('input', onInput);
      element.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  useEffect(() => {
    if (!autofocus) return;
    const element = ref.current as (HTMLElement & { focus?: () => void }) | null;
    const timer = window.setTimeout(() => element?.focus?.(), 60);
    return () => window.clearTimeout(timer);
  }, [autofocus]);

  return (
    <md-outlined-text-field
      ref={ref}
      id={id}
      className={className}
      style={style}
      label={label}
      placeholder={placeholder}
      supporting-text={supportingText}
      type={type}
      rows={rows}
      error={error ? '' : undefined}
      disabled={disabled ? '' : undefined}
    >
      {leadingIcon ? <div slot="leading-icon">{leadingIcon}</div> : null}
      {trailingIcon ? <div slot="trailing-icon">{trailingIcon}</div> : null}
    </md-outlined-text-field>
  );
}

export function MdIconButton({
  icon,
  onClick,
  label,
  className,
  style,
  filled = false,
  tonal = false,
  selected,
  disabled = false,
}: {
  icon: string;
  onClick?: (event: React.MouseEvent<HTMLElement>) => void;
  label: string;
  className?: string;
  style?: CSSProperties;
  filled?: boolean;
  tonal?: boolean;
  selected?: boolean;
  disabled?: boolean;
}) {
  const ref = useRef<HTMLElement & { selected?: boolean }>(null);
  const Tag = filled ? 'md-filled-icon-button' : tonal ? 'md-filled-tonal-icon-button' : 'md-icon-button';

  useEffect(() => {
    if (selected === undefined) return;
    const element = ref.current;
    if (element) element.selected = selected;
  }, [selected]);

  return (
    <Tag ref={ref} className={className} style={style} aria-label={label} disabled={disabled ? '' : undefined} onClick={onClick}>
      <MdIcon name={icon} filled={Boolean(selected)} />
    </Tag>
  );
}

export interface MenuAction {
  label: string;
  icon?: string;
  onSelect: () => void;
  disabled?: boolean;
}

export function MdMenu({
  anchor,
  open,
  actions,
  onClose,
}: {
  anchor: HTMLElement | null;
  open: boolean;
  actions: MenuAction[];
  onClose: () => void;
}) {
  const ref = useRef<HTMLElement & { show: () => void; close: () => void; anchorElement: HTMLElement | null }>(null);
  const closeHandler = useRef(onClose);
  closeHandler.current = onClose;

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (open) {
      if (anchor) element.anchorElement = anchor;
      try {
        element.show();
      } catch {
        /* menu not upgraded yet */
      }
    } else {
      try {
        element.close();
      } catch {
        /* ignore */
      }
    }
  }, [open, anchor]);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const onClosed = () => closeHandler.current();
    element.addEventListener('closed', onClosed);
    return () => element.removeEventListener('closed', onClosed);
  }, []);

  return (
    <md-menu ref={ref} className="app-menu">
      {actions.map((action) => (
        <md-menu-item key={action.label} disabled={action.disabled ? '' : undefined} onClick={action.onSelect}>
          {action.icon ? <MdIcon slot="start" name={action.icon} /> : null}
          <div slot="headline">{action.label}</div>
        </md-menu-item>
      ))}
    </md-menu>
  );
}

/**
 * Open/close a Material Web `md-dialog` imperatively.
 *
 * React 19 assigns custom element props as *properties* when they exist, so passing
 * `open=""` would set `dialog.open = ''` (falsy) and the dialog would never open.
 * Always drive md-dialog through show()/close() instead.
 *
 * 另外：md-dialog 关闭动画结束后会派发 `closed`。如果此时上层状态仍是「打开」
 * （例如又一次点击了编辑按钮），对话框会被这次迟到的 closed 关掉，表现为
 * “点击编辑没反应”。这里在 closed 时如果期望仍是打开状态就重新 show()。
 */
export function useMdDialog(open: boolean) {
  const ref = useRef<HTMLElement & { show: () => void; close: () => void; open: boolean }>(null);
  const wantOpen = useRef(open);
  wantOpen.current = open;

  useEffect(() => {
    const element = ref.current;
    if (!element) return undefined;
    const onClosed = () => {
      if (!wantOpen.current) return;
      // 迟到的 closed：重新打开，避免“第二次点编辑没反应”
      window.setTimeout(() => {
        if (wantOpen.current && !element.open) {
          try {
            element.show();
          } catch {
            /* ignore */
          }
        }
      }, 0);
    };
    element.addEventListener('closed', onClosed);
    return () => element.removeEventListener('closed', onClosed);
  }, []);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (open && !element.open) {
      try {
        element.show();
      } catch {
        element.setAttribute('open', '');
      }
    } else if (!open && element.open) {
      try {
        element.close();
      } catch {
        element.removeAttribute('open');
      }
    }
  }, [open]);

  return ref;
}

export function MdDialog({
  open,
  headline,
  children,
  actions,
  onClosed,
}: {
  open: boolean;
  headline: string;
  children?: ReactNode;
  actions: ReactNode;
  onClosed?: () => void;
}) {
  const ref = useRef<HTMLElement & { show: () => void; close: () => void; open: boolean }>(null);
  const closedHandler = useRef(onClosed);
  closedHandler.current = onClosed;
  const wantOpen = useRef(open);
  wantOpen.current = open;

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (open && !element.open) {
      try {
        element.show();
      } catch {
        element.setAttribute('open', '');
      }
    } else if (!open && element.open) {
      try {
        element.close();
      } catch {
        element.removeAttribute('open');
      }
    }
  }, [open]);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const onClosedEvent = () => {
      // 迟到的 closed（上层仍希望打开）时重新弹出，保证「编辑」可重复进入
      if (wantOpen.current && !element.open) {
        window.setTimeout(() => {
          if (wantOpen.current && !element.open) {
            try {
              element.show();
            } catch {
              /* ignore */
            }
          }
        }, 0);
        return;
      }
      closedHandler.current?.();
    };
    element.addEventListener('closed', onClosedEvent);
    return () => element.removeEventListener('closed', onClosedEvent);
  }, []);

  return (
    <md-dialog ref={ref} className="app-dialog">
      <div slot="headline">{headline}</div>
      <div slot="content" className="md-body-medium">
        {children}
      </div>
      <div slot="actions">{actions}</div>
    </md-dialog>
  );
}

export function MdCircularProgress({ size = 20 }: { size?: number }) {
  return (
    <md-circular-progress
      indeterminate
      style={{ '--md-circular-progress-size': `${size}px`, width: `${size}px`, height: `${size}px` } as CSSProperties}
    />
  );
}

/** React helper: run a callback when a pointer/focus event happens outside `ref`. */
export function useDismissable<T extends HTMLElement>(
  ref: ElementRef<T>,
  active: boolean,
  onDismiss: () => void,
): void {
  const dismiss = useRef(onDismiss);
  dismiss.current = onDismiss;
  useEffect(() => {
    if (!active) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') dismiss.current();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [active]);
}

/** Material Web tabs (`md-tabs` + `md-primary-tab`). */
export function MdTabs({
  tabs,
  activeIndex,
  onChange,
  className,
}: {
  tabs: string[];
  activeIndex: number;
  onChange: (index: number) => void;
  className?: string;
}) {
  const ref = useRef<HTMLElement & { activeTabIndex: number }>(null);
  const changeHandler = useRef(onChange);
  changeHandler.current = onChange;

  useEffect(() => {
    const element = ref.current;
    if (element && element.activeTabIndex !== activeIndex) element.activeTabIndex = activeIndex;
  }, [activeIndex]);

  useEffect(() => {
    const element = ref.current;
    if (!element) return undefined;
    const onChanged = () => changeHandler.current(Number(element.activeTabIndex));
    element.addEventListener('change', onChanged);
    return () => element.removeEventListener('change', onChanged);
  }, []);

  return (
    <md-tabs ref={ref} className={className}>
      {tabs.map((tab) => (
        <md-primary-tab key={tab}>{tab}</md-primary-tab>
      ))}
    </md-tabs>
  );
}
