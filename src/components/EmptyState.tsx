"use client";

import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Skeleton } from "@/components/ui/primitives";

export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-md border border-dashed border-border px-6 py-10 text-center">
      {icon ? (
        <span aria-hidden="true" className="text-2xl text-muted">
          {icon}
        </span>
      ) : null}
      <p className="font-medium text-text">{title}</p>
      {description ? (
        <p className="text-sm text-muted">{description}</p>
      ) : null}
      {action}
    </div>
  );
}

/** Skeleton de estructura genérico para la carga inicial de una pantalla. */
export function Loading() {
  const { t } = useTranslation();
  return (
    <div
      className="flex flex-col gap-4 py-2"
      role="status"
      aria-label={t("loading")}
    >
      <Skeleton className="h-28 w-full rounded-md" />
      <Skeleton className="h-11 w-full" />
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-16 w-full rounded-md" />
        <Skeleton className="h-16 w-full rounded-md" />
      </div>
    </div>
  );
}
