"use client";

/**
 * Pantalla inicial (secciones 28 y 11): lista de grupos recientes + crear grupo.
 */
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { AppVersion } from "@/components/AppVersion";
import { LinkButton } from "@/components/Button";
import { EmptyState, Loading } from "@/components/EmptyState";
import { MoneyText } from "@/components/MoneyText";
import { useGroups } from "@/lib/db-hooks";
import { useHydrated } from "@/lib/useHydrated";

export default function HomePage() {
  const hydrated = useHydrated();
  const groups = useGroups();

  return (
    <AppShell title="fivi">
      {!hydrated || groups === undefined ? (
        <Loading />
      ) : groups.length === 0 ? (
        <EmptyState
          title="Todavía no tenés grupos"
          description="Creá un grupo para empezar a cargar gastos compartidos."
          action={
            <LinkButton href="/nuevo" className="mt-1">
              Crear grupo
            </LinkButton>
          }
        />
      ) : (
        <>
          <h2 className="text-sm font-medium opacity-60">Mis grupos</h2>
          <ul className="flex flex-col gap-2">
            {groups.map(({ group, total_spent_minor, participant_count }) => (
              <li key={group.id}>
                <Link
                  href={`/g/${group.id}`}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-black/10 px-4 py-4 hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">
                      {group.name}
                    </span>
                    <span className="block text-xs opacity-55">
                      {group.currency_code} ·{" "}
                      {participant_count === 0
                        ? "sin participantes"
                        : `${participant_count} participante${participant_count === 1 ? "" : "s"}`}
                    </span>
                  </span>
                  <MoneyText
                    minor={total_spent_minor}
                    currency={group.currency_code}
                    className="shrink-0 font-medium tabular-nums"
                  />
                </Link>
              </li>
            ))}
          </ul>
          <LinkButton href="/nuevo" full variant="secondary" className="mt-2">
            Crear grupo
          </LinkButton>
        </>
      )}
      <AppVersion />
    </AppShell>
  );
}
