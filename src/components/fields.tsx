"use client";

import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Clase base de los controles de formulario (estilo flat: recto, borde 2 px).
 *
 * `text-base` (16px) es deliberado: por debajo de 16px iOS Safari hace zoom
 * automático al enfocar el campo y no lo revierte al navegar (SPA). 16px lo
 * evita sin bloquear el zoom manual del usuario.
 */
export const controlClass =
  "w-full min-h-touch border-2 border-border bg-surface px-3.5 py-3 text-base text-text " +
  "placeholder:text-faint outline-none focus:border-accent";

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-text">{label}</span>
      {children}
      {error ? (
        <span className="text-xs text-danger" role="alert">
          {error}
        </span>
      ) : hint ? (
        <span className="text-xs text-muted">{hint}</span>
      ) : null}
    </label>
  );
}

export function TextInput({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(controlClass, className)} {...props} />;
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return (
    <select
      className={cn(controlClass, "appearance-none", className)}
      {...props}
    />
  );
}

export function TextArea({ className, ...props }: ComponentProps<"textarea">) {
  return (
    <textarea className={cn(controlClass, className)} rows={2} {...props} />
  );
}

/** Texto de ayuda debajo de un campo. */
export function FieldHelper({ children }: { children: ReactNode }) {
  return <span className="text-xs text-muted">{children}</span>;
}

/** Resumen de errores al enviar un formulario con varios campos. */
export function FormError({ messages }: { messages: string[] }) {
  if (messages.length === 0) return null;
  return (
    <div
      role="alert"
      className="border-2 border-danger bg-danger/10 px-3 py-2 text-sm font-medium text-danger"
    >
      {messages.length === 1 ? (
        messages[0]
      ) : (
        <ul className="list-disc pl-4">
          {messages.map((m, i) => (
            <li key={i}>{m}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
