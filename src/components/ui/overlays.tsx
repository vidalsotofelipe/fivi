"use client";

import {
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/cn";
import { Button } from "@/components/Button";

function useLockScroll(open: boolean) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);
}

/**
 * Panel inferior modal. Foco al abrir, Esc y click en el fondo cierran, foco
 * devuelto al disparador. Sin dependencias.
 */
export function BottomSheet({
  open,
  onClose,
  title,
  children,
  labelledBy,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  labelledBy?: string;
}) {
  const { t } = useTranslation(["a11y"]);
  const panelRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useLockScroll(open);

  useEffect(() => {
    if (!open) return;
    returnFocusRef.current = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const first = panel?.querySelector<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    (first ?? panel)?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      returnFocusRef.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div aria-hidden="true" className="absolute inset-0 bg-black/50" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={labelledBy ? undefined : title}
        aria-labelledby={labelledBy}
        tabIndex={-1}
        className={cn(
          "relative w-full max-w-app rounded-t-lg border border-border bg-surface",
          "pb-[calc(16px+env(safe-area-inset-bottom))] pt-2 outline-none",
          "motion-safe:animate-[sheet-in_0.18s_ease-out]",
        )}
      >
        <span
          aria-hidden="true"
          className="mx-auto mt-1 mb-2 block h-1 w-9 rounded-full bg-text/20"
        />
        {title ? (
          // `pr-12` deja libre la esquina donde va la ✕.
          <h2 className="px-4 pr-12 pb-2 text-base font-semibold">{title}</h2>
        ) : null}
        <div className="px-4">{children}</div>
        {/*
          Va DESPUÉS de los hijos en el DOM aunque se vea arriba a la derecha
          (posición absoluta): el efecto de apertura enfoca el primer elemento
          focuseable del panel, y si la ✕ fuera primera se llevaría el foco en
          vez del primer control real de cada hoja. Además, último en el orden
          de tabulación es lo esperable para "cerrar".

          El nombre accesible es "Cerrar panel", no "Cerrar": hay hojas que ya
          traen su propio botón "Cerrar" adentro (`AddToPastExpenses` dentro de
          `MePicker`), y dos controles con el mismo nombre en el mismo diálogo
          son ambiguos tanto para un lector de pantalla como para los tests.
        */}
        <button
          type="button"
          onClick={onClose}
          aria-label={t("a11y:closeSheet")}
          className={cn(
            "absolute right-1 top-1 flex h-11 w-11 items-center justify-center",
            "text-lg text-muted hover:text-text",
          )}
        >
          <span aria-hidden="true">✕</span>
        </button>
      </div>
    </div>,
    document.body,
  );
}

/** Confirmación destructiva: nombre del elemento + consecuencia + acciones. */
export function ConfirmDialog({
  open,
  onCancel,
  onConfirm,
  title,
  body,
  confirmLabel,
  cancelLabel,
  danger = true,
  busy = false,
}: {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel: string;
  danger?: boolean;
  busy?: boolean;
}) {
  const handleConfirm = useCallback(() => {
    if (!busy) onConfirm();
  }, [busy, onConfirm]);

  return (
    <BottomSheet open={open} onClose={onCancel} title={title}>
      <p className="text-sm text-muted">{body}</p>
      <div className="mt-4 flex flex-col gap-2">
        <Button
          variant={danger ? "danger" : "primary"}
          full
          onClick={handleConfirm}
          loading={busy}
        >
          {confirmLabel}
        </Button>
        <Button variant="ghost" full onClick={onCancel} disabled={busy}>
          {cancelLabel}
        </Button>
      </div>
    </BottomSheet>
  );
}
