"use client";

/** Resumen del grupo (secciones 10 y 11). */
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { LinkButton } from "@/components/Button";
import { Loading } from "@/components/EmptyState";
import { BalanceList, nameOf } from "@/components/BalanceList";
import { TransferList } from "@/components/TransferList";
import { MoneyText } from "@/components/MoneyText";
import { useGroupContext } from "@/components/GroupProvider";
import { ShareButton } from "@/components/ShareButton";
import { useGroupSummary } from "@/lib/db-hooks";
import { formatMoney } from "@/domain/money";
import { formatDate } from "@/lib/format";

export default function GroupSummaryPage() {
  const { group, participants } = useGroupContext();
  const summary = useGroupSummary(group.id);
  const cc = group.currency_code;

  return (
    <AppShell title={group.name} back="/">
      {summary === undefined ? (
        <Loading />
      ) : (
        <>
          <section className="rounded-2xl border border-black/10 p-4 dark:border-white/10">
            <p className="text-xs uppercase tracking-wide opacity-50">
              Total gastado · {cc}
            </p>
            <p className="mt-1 text-3xl font-semibold tabular-nums">
              {formatMoney(summary.total_spent_minor, cc)}
            </p>
          </section>

          <LinkButton href={`/g/${group.id}/gastos/nuevo`} full>
            Agregar gasto
          </LinkButton>

          {participants.length === 0 ? (
            <div className="rounded-xl bg-amber-500/10 px-4 py-3 text-sm">
              Agregá participantes en{" "}
              <Link
                href={`/g/${group.id}/config`}
                className="font-medium underline"
              >
                Configuración
              </Link>{" "}
              para poder cargar gastos.
            </div>
          ) : null}

          <section className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium opacity-60">Balances</h2>
              <Link
                href={`/g/${group.id}/balance`}
                className="text-xs opacity-60 underline"
              >
                Ver detalle
              </Link>
            </div>
            {summary.balances.length === 0 ? (
              <p className="text-sm opacity-50">Sin movimientos todavía.</p>
            ) : (
              <BalanceList
                balances={summary.balances}
                participants={participants}
                currency={cc}
              />
            )}
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-medium opacity-60">
              Cómo saldar las cuentas
            </h2>
            <TransferList
              transfers={summary.transfers}
              participants={participants}
              currency={cc}
              groupId={group.id}
            />
          </section>

          <section className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium opacity-60">
                Historial reciente
              </h2>
              <Link
                href={`/g/${group.id}/gastos`}
                className="text-xs opacity-60 underline"
              >
                Ver todo
              </Link>
            </div>
            {summary.recent.length === 0 ? (
              <p className="text-sm opacity-50">Nada registrado aún.</p>
            ) : (
              <ul className="divide-y divide-black/5 dark:divide-white/10">
                {summary.recent.map((item) => (
                  <li
                    key={item.data.id}
                    className="flex items-center justify-between gap-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-[15px]">
                        {item.type === "expense"
                          ? item.data.description
                          : `Pago · ${nameOf(participants, item.data.from_participant)} → ${nameOf(participants, item.data.to_participant)}`}
                      </p>
                      <p className="text-xs opacity-55">
                        {formatDate(item.date)}
                        {item.type === "expense"
                          ? ` · pagó ${nameOf(participants, item.data.paid_by)}`
                          : ""}
                      </p>
                    </div>
                    <MoneyText
                      minor={item.data.amount_minor_units}
                      currency={cc}
                      className="shrink-0 tabular-nums"
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>

          <div className="mt-2 flex flex-col gap-2">
            <ShareButton groupId={group.id} groupName={group.name} />
            <nav className="grid grid-cols-2 gap-2">
              <LinkButton
                href={`/g/${group.id}/pagos/nuevo`}
                variant="secondary"
              >
                Registrar pago
              </LinkButton>
              <LinkButton href={`/g/${group.id}/config`} variant="secondary">
                Configuración
              </LinkButton>
            </nav>
          </div>
        </>
      )}
    </AppShell>
  );
}
