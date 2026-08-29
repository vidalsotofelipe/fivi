"use client";

/** Agregar gasto (secciones 4 y 5). */
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";
import { LinkButton } from "@/components/Button";
import { ExpenseForm } from "@/components/ExpenseForm";
import { useGroupContext } from "@/components/GroupProvider";
import { db } from "@/data/db";
import { createExpense } from "@/data/repositories/expenseRepo";

export default function NewExpensePage() {
  const router = useRouter();
  const { group, participants } = useGroupContext();

  if (participants.length === 0) {
    return (
      <AppShell title="Agregar gasto" back={`/g/${group.id}`}>
        <EmptyState
          title="Primero agregá participantes"
          description="Un gasto se divide entre participantes del grupo."
          action={
            <LinkButton href={`/g/${group.id}/config`}>
              Ir a Configuración
            </LinkButton>
          }
        />
      </AppShell>
    );
  }

  return (
    <AppShell title="Agregar gasto" back={`/g/${group.id}`}>
      <ExpenseForm
        currency={group.currency_code}
        participants={participants}
        submitLabel="Guardar gasto"
        onSubmit={async (values) => {
          await createExpense({ group_id: group.id, ...values }, db);
          router.replace(`/g/${group.id}`);
        }}
      />
    </AppShell>
  );
}
