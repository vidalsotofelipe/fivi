"use client";

/**
 * "Guardá mi FIVI" (R1 de `docs/ACCOUNT_RECOVERY.md`): vincula un email a la
 * sesión anónima actual, sin cambiar de `uid` ni migrar nada — sólo agrega
 * una credencial de reingreso al mismo dispositivo/uid. Reingresar en OTRO
 * dispositivo (`signInWithOtp` + recuperar grupos huérfanos) es una etapa
 * aparte (R2-R4), todavía no implementada.
 *
 * Sólo tiene sentido en modo cloud (Supabase configurado); en modo local no
 * hay sesión que vincular.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "./Button";
import { TextField } from "./ui/TextField";
import { useSyncActions, useSyncState } from "./SyncProvider";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function AccountSection() {
  const { t } = useTranslation(["settings", "errors"]);
  const { backend } = useSyncState();
  const { userEmail, linkEmail } = useSyncActions();

  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (backend !== "cloud") return null;

  async function submit() {
    setError(null);
    const trimmed = email.trim();
    if (!EMAIL_RE.test(trimmed)) {
      setError(t("settings:accountInvalidEmail"));
      return;
    }
    setBusy(true);
    try {
      await linkEmail(trimmed);
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errors:generic"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-2">
      <h2 className="label-caps">{t("settings:sectionAccount")}</h2>

      {userEmail ? (
        <p className="text-sm text-text">
          {t("settings:accountLinkedAs", { email: userEmail })}
        </p>
      ) : sent ? (
        <p className="text-sm text-text">
          {t("settings:accountLinkSent", { email: email.trim() })}
        </p>
      ) : (
        <>
          <p className="text-xs text-muted">{t("settings:accountHint")}</p>
          <TextField
            label={t("settings:accountEmailLabel")}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
          {error ? <p className="text-xs text-danger">{error}</p> : null}
          <Button
            variant="secondary"
            onClick={submit}
            loading={busy}
            disabled={email.trim() === ""}
          >
            {t("settings:accountLinkCta")}
          </Button>
        </>
      )}
    </section>
  );
}
