"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "./Button";
import { TextField } from "./ui/TextField";

/**
 * A dónde navegar a partir de lo que alguien pegó: un link completo
 * (`.../join/<token>` o, en modo local, `.../g/<id>`), o el token/id suelto.
 * Sólo interpreta texto; el canje real y sus errores los maneja `/join/[token]`
 * (un UUID de grupo por sí solo no da acceso — ver `redeem_group_invite`).
 */
export function resolveInviteHref(raw: string): string | null {
  const input = raw.trim();
  if (!input) return null;

  let path = input;
  try {
    path = new URL(input, "http://localhost").pathname;
  } catch {
    // no era una URL completa: se interpreta el texto tal cual
  }
  const parts = path.split("/").filter(Boolean);

  const joinIdx = parts.indexOf("join");
  if (joinIdx >= 0 && parts[joinIdx + 1]) {
    return `/join/${encodeURIComponent(parts[joinIdx + 1]!)}`;
  }
  const groupIdx = parts.indexOf("g");
  if (groupIdx >= 0 && parts[groupIdx + 1]) {
    return `/g/${encodeURIComponent(parts[groupIdx + 1]!)}`;
  }
  // texto suelto (sin "/"): se asume que es el código de invitación
  return `/join/${encodeURIComponent(input)}`;
}

/** Disclosure "¿Tenés una invitación?" con el campo para pegar el enlace/código. */
export function JoinInviteDisclosure() {
  const { t } = useTranslation(["onboarding"]);
  const router = useRouter();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit(e: FormEvent) {
    e.preventDefault();
    const href = resolveInviteHref(value);
    if (!href) {
      setError(t("inviteRequired"));
      return;
    }
    setError(null);
    router.push(href);
  }

  return (
    <details className="border-2 border-border">
      <summary className="flex min-h-touch cursor-pointer list-none items-center justify-center px-4 text-[15px] font-bold text-text marker:hidden hover:bg-accent-weak">
        {t("haveInvite")}
      </summary>
      <form
        onSubmit={submit}
        className="flex flex-col gap-3 border-t-2 border-border p-4"
      >
        <TextField
          label={t("inviteLabel")}
          placeholder={t("invitePlaceholder")}
          hint={t("inviteHint")}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            if (error) setError(null);
          }}
          error={error}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
        />
        <Button type="submit" variant="secondary" full disabled={!value.trim()}>
          {t("inviteSubmit")}
        </Button>
      </form>
    </details>
  );
}
