"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

export interface ToastOptions {
  message: string;
  /** Etiqueta de la acción principal (p. ej. "Ver gasto"). */
  actionLabel?: string;
  onAction?: () => void;
  /** Etiqueta de una acción secundaria de deshacer. */
  undoLabel?: string;
  onUndo?: () => void;
  /** ms antes de auto-cerrar. Default 4000; usar 10000 para "deshacer". */
  durationMs?: number;
}

interface ToastState extends ToastOptions {
  id: number;
}

const ToastContext = createContext<(opts: ToastOptions) => void>(() => {});

let counter = 0;

/** Envuelve la app: expone `useToast()` y renderiza la región `aria-live`. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const [mounted, setMounted] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => setMounted(true), []);

  const dismiss = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setToast(null);
  }, []);

  const show = useCallback(
    (opts: ToastOptions) => {
      if (timer.current) clearTimeout(timer.current);
      const id = ++counter;
      setToast({ ...opts, id });
      timer.current = setTimeout(dismiss, opts.durationMs ?? 4000);
    },
    [dismiss],
  );

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      {mounted && typeof document !== "undefined"
        ? createPortal(
            <div
              className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex justify-center px-4 pb-[calc(16px+env(safe-area-inset-bottom))]"
              role="status"
              aria-live="polite"
              aria-atomic="true"
            >
              {toast ? (
                <div
                  key={toast.id}
                  className="pointer-events-auto flex w-full max-w-app items-center gap-3 rounded-md border border-border bg-surface-raised px-4 py-3 text-sm shadow-lg motion-safe:animate-[toast-in_0.18s_ease-out]"
                >
                  <span className="min-w-0 flex-1">{toast.message}</span>
                  {toast.undoLabel && toast.onUndo ? (
                    <button
                      className="shrink-0 font-medium text-accent underline-offset-2 hover:underline"
                      onClick={() => {
                        toast.onUndo?.();
                        dismiss();
                      }}
                    >
                      {toast.undoLabel}
                    </button>
                  ) : null}
                  {toast.actionLabel && toast.onAction ? (
                    <button
                      className="shrink-0 font-medium text-accent underline-offset-2 hover:underline"
                      onClick={() => {
                        toast.onAction?.();
                        dismiss();
                      }}
                    >
                      {toast.actionLabel}
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>,
            document.body,
          )
        : null}
    </ToastContext.Provider>
  );
}

export function useToast(): (opts: ToastOptions) => void {
  return useContext(ToastContext);
}
