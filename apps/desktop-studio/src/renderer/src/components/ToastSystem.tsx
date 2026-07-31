/**
 * ToastSystem.tsx — Zero-dependency Toast UI System
 *
 * 외부 라이브러리 없이 구현한 전역 Toast 알림 시스템.
 * useEngineErrorBridge에서 에러 타입별로 toast()를 직접 호출합니다.
 *
 * 사용법:
 *   1. <ToastProvider> 를 App 최상단에 래핑.
 *   2. 어디서든 import { toast } from './ToastSystem' 후 toast.error(...) 호출.
 */

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useLocale } from '../i18n/locale';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ToastVariant = 'error' | 'warning' | 'info' | 'success';

export interface ToastItem {
  id: string;
  variant: ToastVariant;
  title: string;
  message?: string;
  /** Duration in ms. Infinity = never auto-dismiss. */
  duration: number;
  /** Whether the toast is in the dismiss animation phase. */
  exiting: boolean;
}

interface ToastOptions {
  message?: string;
  /** Duration in ms. Default depends on variant. Pass Infinity to persist. */
  duration?: number;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface ToastContextValue {
  add: (variant: ToastVariant, title: string, options?: ToastOptions) => void;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function ToastProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: string) => {
    // Trigger exit animation first
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, exiting: true } : t)));
    // Remove after animation completes
    const removeTimer = setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 350);
    timersRef.current.set(`${id}-remove`, removeTimer);
  }, []);

  const add = useCallback(
    (variant: ToastVariant, title: string, options?: ToastOptions) => {
      const id = crypto.randomUUID();
      const duration = options?.duration ?? defaultDuration(variant);

      setToasts((prev) => [
        ...prev.slice(-4), // max 5 toasts visible
        { id, variant, title, message: options?.message, duration, exiting: false },
      ]);

      if (duration !== Number.POSITIVE_INFINITY) {
        const timer = setTimeout(() => dismiss(id), duration);
        timersRef.current.set(id, timer);
      }
    },
    [dismiss],
  );

  // Cleanup all timers on unmount
  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const timer of timers.values()) clearTimeout(timer);
    };
  }, []);

  return (
    <ToastContext.Provider value={{ add, dismiss }}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Module-level imperative API (works without hook context)
// ---------------------------------------------------------------------------

/** Cached reference to the context's `add` function, set by ToastProvider. */
let _imperativeAdd: ToastContextValue['add'] | null = null;

/**
 * Hook to access the toast context. Also registers the imperative API.
 * @internal used by ToastProvider and useEngineErrorBridge.
 */
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');

  // Register imperative handle on every render (stable ref)
  _imperativeAdd = ctx.add;
  return ctx;
}

/** Imperative toast API — usable outside React components. */
export const toast = {
  error(title: string, options?: ToastOptions): void {
    _imperativeAdd?.('error', title, options);
  },
  warning(title: string, options?: ToastOptions): void {
    _imperativeAdd?.('warning', title, options);
  },
  info(title: string, options?: ToastOptions): void {
    _imperativeAdd?.('info', title, options);
  },
  success(title: string, options?: ToastOptions): void {
    _imperativeAdd?.('success', title, options);
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function defaultDuration(variant: ToastVariant): number {
  switch (variant) {
    case 'error':
      return 6000;
    case 'warning':
      return 4500;
    case 'info':
    case 'success':
      return 3000;
  }
}

const VARIANT_STYLES: Record<
  ToastVariant,
  { accent: string; bg: string; icon: string; iconColor: string }
> = {
  error: {
    accent: '#ff4d4d',
    bg: 'rgba(30, 10, 10, 0.95)',
    icon: '✕',
    iconColor: '#ff4d4d',
  },
  warning: {
    accent: '#f5a623',
    bg: 'rgba(28, 20, 8, 0.95)',
    icon: '⚠',
    iconColor: '#f5a623',
  },
  info: {
    accent: '#00BFFF',
    bg: 'rgba(8, 20, 30, 0.95)',
    icon: 'ℹ',
    iconColor: '#00BFFF',
  },
  success: {
    accent: '#4caf50',
    bg: 'rgba(8, 22, 10, 0.95)',
    icon: '✓',
    iconColor: '#4caf50',
  },
};

// ---------------------------------------------------------------------------
// Container & Item components
// ---------------------------------------------------------------------------

function ToastContainer({
  toasts,
  onDismiss,
}: {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}): React.JSX.Element | null {
  const { t } = useLocale();
  if (toasts.length === 0) return null;

  return (
    <>
      <style>{TOAST_CSS}</style>
      <div
        style={{
          position: 'fixed',
          top: '24px',
          right: '24px',
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
          alignItems: 'flex-end',
          pointerEvents: 'none',
        }}
        aria-live="polite"
        aria-label={t('toast.notifications')}
      >
        {toasts.map((t) => (
          <ToastItemView key={t.id} item={t} onDismiss={onDismiss} />
        ))}
      </div>
    </>
  );
}

function ToastItemView({
  item,
  onDismiss,
}: {
  item: ToastItem;
  onDismiss: (id: string) => void;
}): React.JSX.Element {
  const { t } = useLocale();
  const s = VARIANT_STYLES[item.variant];

  return (
    <div
      role="alert"
      className={`rendium-toast ${item.exiting ? 'rendium-toast--exit' : 'rendium-toast--enter'}`}
      style={{
        background: s.bg,
        border: `1px solid ${s.accent}40`,
        borderLeft: `3px solid ${s.accent}`,
        borderRadius: '8px',
        padding: '12px 14px 12px 12px',
        minWidth: '300px',
        maxWidth: '400px',
        display: 'flex',
        alignItems: 'flex-start',
        gap: '10px',
        boxShadow: '0 4px 24px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.04)',
        backdropFilter: 'blur(12px)',
        pointerEvents: 'auto',
        cursor: 'default',
        fontFamily: 'inherit',
      }}
    >
      {/* Icon */}
      <span
        style={{
          color: s.iconColor,
          fontSize: '14px',
          fontWeight: 700,
          lineHeight: '20px',
          flexShrink: 0,
          width: '18px',
          textAlign: 'center',
        }}
      >
        {s.icon}
      </span>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            color: '#f0f0f0',
            fontSize: '13px',
            fontWeight: 600,
            lineHeight: '1.4',
            wordBreak: 'break-word',
          }}
        >
          {item.title}
        </div>
        {item.message && (
          <div
            style={{
              color: 'rgba(255,255,255,0.55)',
              fontSize: '12px',
              marginTop: '3px',
              lineHeight: '1.5',
              wordBreak: 'break-word',
            }}
          >
            {item.message}
          </div>
        )}
      </div>

      {/* Dismiss button */}
      <button
        type="button"
        onClick={() => onDismiss(item.id)}
        aria-label={t('toast.dismiss')}
        style={{
          background: 'none',
          border: 'none',
          color: 'rgba(255,255,255,0.3)',
          cursor: 'pointer',
          fontSize: '14px',
          lineHeight: 1,
          padding: '2px 4px',
          flexShrink: 0,
          borderRadius: '4px',
          transition: 'color 0.15s',
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.8)';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.3)';
        }}
      >
        ×
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CSS animations
// ---------------------------------------------------------------------------

const TOAST_CSS = `
@keyframes rendium-toast-in {
  from {
    opacity: 0;
    transform: translateX(48px) scale(0.95);
  }
  to {
    opacity: 1;
    transform: translateX(0) scale(1);
  }
}

@keyframes rendium-toast-out {
  from {
    opacity: 1;
    transform: translateX(0) scale(1);
    max-height: 120px;
    margin-bottom: 0;
  }
  to {
    opacity: 0;
    transform: translateX(48px) scale(0.95);
    max-height: 0;
    margin-bottom: -10px;
  }
}

.rendium-toast--enter {
  animation: rendium-toast-in 0.28s cubic-bezier(0.21, 1.02, 0.73, 1) forwards;
}

.rendium-toast--exit {
  animation: rendium-toast-out 0.32s ease forwards;
}
`;
