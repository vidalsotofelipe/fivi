"use client";

import { useTranslation } from "react-i18next";
import type { Participant } from "@/domain/types";
import { setMe } from "@/data/settings";
import { BottomSheet } from "./ui/overlays";
import { cn } from "@/lib/cn";

/**
 * Elegir "quién sos vos" en un grupo (no hay identidad real: son nombres).
 * La preferencia es por dispositivo (`settings`), no se sincroniza.
 */
export function MePicker({
  open,
  onClose,
  groupId,
  participants,
  currentId,
}: {
  open: boolean;
  onClose: () => void;
  groupId: string;
  participants: Participant[];
  currentId: string | null;
}) {
  const { t } = useTranslation(["group", "common"]);

  return (
    <BottomSheet open={open} onClose={onClose} title={t("group:whoAreYou")}>
      <p className="text-sm text-muted">{t("group:whoAreYouHint")}</p>
      <ul className="mt-3 flex flex-col divide-y divide-border rounded-md border border-border">
        {participants.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              onClick={async () => {
                await setMe(groupId, p.id);
                onClose();
              }}
              className={cn(
                "flex min-h-touch w-full items-center justify-between px-4 py-2.5 text-left text-[15px] hover:bg-text/[0.06]",
                currentId === p.id && "bg-accent-weak",
              )}
            >
              <span className="truncate text-text">{p.name}</span>
              {currentId === p.id ? (
                <span aria-hidden="true" className="text-accent">
                  ✓
                </span>
              ) : null}
            </button>
          </li>
        ))}
      </ul>
    </BottomSheet>
  );
}
