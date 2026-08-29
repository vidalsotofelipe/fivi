import type { ReactNode } from "react";

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-black/15 px-6 py-10 text-center dark:border-white/15">
      <p className="font-medium">{title}</p>
      {description ? (
        <p className="text-sm opacity-60">{description}</p>
      ) : null}
      {action}
    </div>
  );
}

export function Loading() {
  return (
    <div className="flex flex-1 items-center justify-center py-16 text-sm opacity-50">
      Cargando…
    </div>
  );
}
