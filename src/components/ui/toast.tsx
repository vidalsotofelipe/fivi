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
import { useTranslation } from "react-i18next";

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
  const { t } = useTranslation("common");
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
              className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex items-end justify-center px-4"
              // Se levanta SIEMPRE por encima del menú inferior. El menú publica
              // su alto real (borde + safe-area incluidos) en `--fivi-bottomnav`;
              // hasta que ese valor exista se usa un fallback de 4rem (alto
              // típico del menú) para que el toast nunca aparezca tapándolo ni
              // intercepte sus botones. Sin menú, respeta 16px + safe-area.
              // `pointer-events-none` en el contenedor + `pointer-events-auto`
              // sólo en la tarjeta: el área sobre el menú nunca bloquea el tap.
              style={{
                // El +16px de holgura absorbe el desplazamiento de entrada de
                // `toast-in` (translateY 16px→0): ni durante la animación el
                // toast toca el menú.
                paddingBottom:
                  "calc(var(--fivi-bottomnav, 4rem) + max(16px, env(safe-area-inset-bottom)))",
              }}
              role="status"
              aria-live="polite"
              aria-atomic="true"
            >
              {toast ? (
                <div
                  key={toast.id}
                  className="pointer-events-auto flex w-full max-w-app items-center gap-1 border-2 border-border-strong bg-surface-raised py-1.5 pl-4 pr-1.5 text-sm shadow-lg motion-safe:animate-[toast-in_0.18s_ease-out]"
                >
                  <span className="min-w-0 flex-1 py-1">{toast.message}</span>
                  {toast.undoLabel && toast.onUndo ? (
                    <button
                      className="min-h-touch shrink-0 px-1 font-bold uppercase tracking-caps text-accent-strong hover:underline"
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
                      className="min-h-touch shrink-0 px-1 font-bold uppercase tracking-caps text-accent-strong hover:underline"
                      onClick={() => {
                        toast.onAction?.();
                        dismiss();
                      }}
                    >
                      {toast.actionLabel}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    aria-label={t("close")}
                    onClick={dismiss}
                    className="flex h-11 w-11 shrink-0 items-center justify-center text-base leading-none text-muted transition-colors hover:text-text"
                  >
                    <span aria-hidden="true">✕</span>
                  </button>
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
