"use client";

import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/cn";
import { normalizeConcept, rankConcepts } from "@/domain/frequentConcepts";
import { useExpenses } from "@/lib/db-hooks";

/**
 * Atajos de "gastos frecuentes" para el alta de gasto: primero los conceptos
 * más usados en el grupo (según el historial), completados con una lista por
 * defecto hasta `LIMIT`. Al tocar un chip se precarga el concepto; la carga
 * manual sigue disponible (el campo de texto no se toca).
 *
 * No hay categorías en el modelo, así que sólo se precarga el texto.
 */

const LIMIT = 6;

/** Presets por defecto: clave i18n (namespace `expense`) + emoji + sinónimos. */
const PRESETS: { key: string; emoji: string; synonyms: string[] }[] = [
  { key: "quickSupermarket", emoji: "🛒", synonyms: ["super", "market", "grocer", "almacen", "verduler", "compra"] },
  { key: "quickFuel", emoji: "⛽", synonyms: ["nafta", "gas", "fuel", "combust", "ypf", "shell", "diesel", "gasoil"] },
  { key: "quickFood", emoji: "🍔", synonyms: ["comida", "food", "almuerzo", "lunch", "cena", "dinner", "resto", "restaurant", "delivery", "pedido", "vianda"] },
  { key: "quickCoffee", emoji: "☕", synonyms: ["cafe", "coffee", "starbucks", "merienda"] },
  { key: "quickDrink", emoji: "🥤", synonyms: ["bebida", "drink", "trago", "birra", "cerveza", "beer", "agua", "gaseosa", "vino", "bar"] },
  { key: "quickTransport", emoji: "🚕", synonyms: ["taxi", "uber", "cabify", "remis", "transporte", "transport", "bondi", "colectivo", "subte", "tren", "peaje", "estacion", "parking"] },
];

function emojiFor(label: string): string {
  const n = normalizeConcept(label);
  for (const p of PRESETS) {
    if (p.synonyms.some((s) => n.includes(s))) return p.emoji;
  }
  return "🧾";
}

interface Chip {
  label: string;
  emoji: string;
}

export function QuickExpensePicker({
  groupId,
  value,
  onPick,
}: {
  groupId: string;
  /** Descripción actual del formulario (para marcar el chip seleccionado). */
  value: string;
  onPick: (label: string) => void;
}) {
  const { t } = useTranslation("expense");
  const expenses = useExpenses(groupId);

  const chips = useMemo<Chip[]>(() => {
    const presetChips: Chip[] = PRESETS.map((p) => ({
      label: t(p.key),
      emoji: p.emoji,
    }));

    const ranked = rankConcepts(
      (expenses ?? []).map((e) => e.description),
      { minCount: 2, limit: LIMIT },
    );

    const out: Chip[] = ranked.map((r) => ({
      label: r.label,
      emoji: emojiFor(r.label),
    }));
    const seen = new Set(out.map((c) => normalizeConcept(c.label)));

    for (const c of presetChips) {
      if (out.length >= LIMIT) break;
      if (seen.has(normalizeConcept(c.label))) continue;
      out.push(c);
      seen.add(normalizeConcept(c.label));
    }
    return out.slice(0, LIMIT);
  }, [expenses, t]);

  if (chips.length === 0) return null;

  const activeKey = normalizeConcept(value);

  return (
    <div className="flex flex-col gap-2">
      <span className="label-caps">{t("quickTitle")}</span>
      <ul className="flex flex-wrap gap-2">
        {chips.map((c) => {
          const selected = activeKey !== "" && normalizeConcept(c.label) === activeKey;
          return (
            <li key={c.label}>
              <button
                type="button"
                aria-pressed={selected}
                onClick={() => onPick(selected ? "" : c.label)}
                className={cn(
                  "inline-flex min-h-touch items-center gap-1.5 border-2 px-3 py-1.5 text-[13px] font-semibold transition-colors",
                  selected
                    ? "border-accent bg-accent text-accent-fg"
                    : "border-border bg-surface text-text hover:border-border-strong",
                )}
              >
                <span aria-hidden="true" className="text-base leading-none">
                  {c.emoji}
                </span>
                {c.label}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
