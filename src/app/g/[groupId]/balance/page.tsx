"use client";

/** Balance por persona (sección 7). */
import { AppShell } from "@/components/AppShell";
import { LinkButton } from "@/components/Button";
import { Loading } from "@/components/EmptyState";
import { BalanceList } from "@/components/BalanceList";
import { TransferList } from "@/components/TransferList";
import { useGroupContext } from "@/components/GroupProvider";
import { useGroupSummary } from "@/lib/db-hooks";

export default function BalancePage() {
  const { group, participants } = useGroupContext();
  const summary = useGroupSummary(group.id);

  return (
    <AppShell title="Balance" back={`/g/${group.id}`}>
      {summary === undefined ? (
        <Loading />
      ) : (
        <>
          <p className="text-sm opacity-60">
            Saldo = lo que puso cada persona − lo que le correspondía. Positivo:
            debe recibir. Negativo: debe pagar.
          </p>

          {summary.balances.length === 0 ? (
            <p className="text-sm opacity-50">Sin movimientos todavía.</p>
          ) : (
            <BalanceList
              balances={summary.balances}
              participants={participants}
              currency={group.currency_code}
              detailed
            />
          )}

          <section className="mt-2 flex flex-col gap-2">
            <h2 className="text-sm font-medium opacity-60">
              Cómo saldar las cuentas
            </h2>
            <TransferList
              transfers={summary.transfers}
              participants={participants}
              currency={group.currency_code}
              groupId={group.id}
            />
          </section>

          <LinkButton
            href={`/g/${group.id}/pagos/nuevo`}
            full
            variant="secondary"
            className="mt-2"
          >
            Registrar pago
          </LinkButton>
        </>
      )}
    </AppShell>
  );
}
