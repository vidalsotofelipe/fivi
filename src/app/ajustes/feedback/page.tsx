"use client";

/**
 * Formulario de feedback (reportar un problema, proponer una mejora, hacer una
 * consulta u otro comentario). Página dedicada (no un modal/BottomSheet): con
 * varios campos + adjuntar una imagen, un sheet corre riesgo de quedar más
 * alto que el viewport o de que el teclado tape inputs — una pantalla normal
 * se comporta mejor en mobile (scroll de documento, sin recortes de altura).
 *
 * Dos pasos, mismo patrón que `ExpenseWizard`: elegir categoría → completar
 * y enviar. No pide cuenta ni email (el de contacto es opcional).
 */
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/Button";
import { useLocale } from "@/components/LocaleProvider";
import { useTheme } from "@/components/ThemeProvider";
import { useToast } from "@/components/ui/toast";
import { FormError } from "@/components/fields";
import { TextField, TextAreaField } from "@/components/ui/TextField";
import { StepIndicator, StickyActionBar } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";
import { getOrCreateFeedbackDeviceId } from "@/lib/feedbackDeviceId";
import {
  isValidEmail,
  DESCRIPTION_MAX,
  EMAIL_MAX,
  FEEDBACK_TYPES,
  SCREENSHOT_ACCEPT,
  SCREENSHOT_MAX_BYTES,
  TITLE_MAX,
  BUG_FIELD_MAX,
  type FeedbackType,
} from "@/lib/feedbackShared";

const TYPE_KEYS: Record<FeedbackType, string> = {
  bug: "feedback:typeBug",
  suggestion: "feedback:typeSuggestion",
  question: "feedback:typeQuestion",
  other: "feedback:typeOther",
};

/** Referrer same-origin si existe; si no, la propia página del formulario. */
function bestEffortPagePath(): string {
  try {
    const ref = document.referrer;
    if (ref) {
      const u = new URL(ref);
      if (u.origin === location.origin) return u.pathname;
    }
  } catch {
    /* referrer ausente o no parseable */
  }
  return location.pathname;
}

export default function FeedbackFormPage() {
  const router = useRouter();
  const { t } = useTranslation(["feedback", "common", "settings"]);
  const { lang } = useLocale();
  const { theme } = useTheme();
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<0 | 1>(0);
  const [type, setType] = useState<FeedbackType | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [stepsToReproduce, setStepsToReproduce] = useState("");
  const [expectedBehavior, setExpectedBehavior] = useState("");
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null);
  const [screenshotError, setScreenshotError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function pickType(v: FeedbackType) {
    setType(v);
    setStep(1);
  }

  function pickScreenshot(file: File | null) {
    setScreenshotError(null);
    if (!file) {
      setScreenshot(null);
      setScreenshotPreview((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      return;
    }
    if (file.size > SCREENSHOT_MAX_BYTES) {
      setScreenshotError(t("feedback:errorTooBig"));
      return;
    }
    // Chequeo rápido en el cliente (UX); la validación real —por bytes, no por
    // este `type` fácil de falsificar— la hace el servidor.
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setScreenshotError(t("feedback:errorBadFormat"));
      return;
    }
    setScreenshot(file);
    setScreenshotPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
  }

  function clearScreenshot() {
    pickScreenshot(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function validate(): boolean {
    const errs: Record<string, string> = {};
    const cleanTitle = title.trim();
    const cleanDescription = description.trim();
    if (!cleanTitle) errs.title = t("feedback:fieldTitleRequired");
    if (!cleanDescription) errs.description = t("feedback:fieldDescriptionRequired");
    if (contactEmail.trim() && !isValidEmail(contactEmail.trim())) {
      errs.contactEmail = t("feedback:fieldEmailInvalid");
    }
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function submit() {
    if (!type || busy) return;
    if (!validate()) return;

    setBusy(true);
    setSubmitError(null);
    try {
      const form = new FormData();
      form.set("type", type);
      form.set("title", title.trim());
      form.set("description", description.trim());
      if (contactEmail.trim()) form.set("contactEmail", contactEmail.trim());
      if (stepsToReproduce.trim()) form.set("stepsToReproduce", stepsToReproduce.trim());
      if (expectedBehavior.trim()) form.set("expectedBehavior", expectedBehavior.trim());
      form.set("language", lang);
      form.set("theme", theme);
      form.set("viewport", `${window.innerWidth}x${window.innerHeight}`);
      form.set("pagePath", bestEffortPagePath());
      const deviceId = getOrCreateFeedbackDeviceId();
      if (deviceId) form.set("deviceId", deviceId);
      if (screenshot) form.set("screenshot", screenshot);

      const res = await fetch("/api/feedback", { method: "POST", body: form });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error || t("feedback:errorGeneric"));
      }

      router.replace("/ajustes");
      toast({ message: t("feedback:successToast") });
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : t("feedback:errorGeneric"));
      setBusy(false);
    }
  }

  const stepLabels = [t("feedback:stepCategory"), t("feedback:stepDetail")];

  return (
    <AppShell title={t("feedback:pageTitle")} back={true} showSync={false}>
      <StepIndicator steps={stepLabels} current={step} />

      {step === 0 ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm font-medium text-text">{t("feedback:questionPrompt")}</p>
          <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
            {FEEDBACK_TYPES.map((v) => (
              <li key={v}>
                <button
                  type="button"
                  onClick={() => pickType(v)}
                  className="flex min-h-touch w-full items-center justify-between px-4 py-3 text-left text-[15px] hover:bg-accent-weak"
                >
                  <span className="text-text">{t(TYPE_KEYS[v])}</span>
                  <span aria-hidden="true" className="text-muted">
                    →
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {step === 1 && type ? (
        <div className="flex flex-col gap-4">
          {submitError ? <FormError messages={[submitError]} /> : null}

          <TextField
            label={t("feedback:titleLabel")}
            placeholder={t("feedback:titlePlaceholder")}
            value={title}
            maxLength={TITLE_MAX}
            onChange={(e) => {
              setTitle(e.target.value);
              if (fieldErrors.title) setFieldErrors((f) => ({ ...f, title: "" }));
            }}
            error={fieldErrors.title || null}
          />

          <TextAreaField
            label={
              type === "bug" ? t("feedback:descriptionLabelBug") : t("feedback:descriptionLabel")
            }
            placeholder={t("feedback:descriptionPlaceholder")}
            value={description}
            maxLength={DESCRIPTION_MAX}
            onChange={(e) => {
              setDescription(e.target.value);
              if (fieldErrors.description) setFieldErrors((f) => ({ ...f, description: "" }));
            }}
            error={fieldErrors.description || null}
          />

          {type === "bug" ? (
            <>
              <TextAreaField
                label={t("feedback:stepsToReproduceLabel")}
                placeholder={t("feedback:stepsToReproducePlaceholder")}
                value={stepsToReproduce}
                maxLength={BUG_FIELD_MAX}
                onChange={(e) => setStepsToReproduce(e.target.value)}
              />
              <TextAreaField
                label={t("feedback:expectedBehaviorLabel")}
                placeholder={t("feedback:expectedBehaviorPlaceholder")}
                value={expectedBehavior}
                maxLength={BUG_FIELD_MAX}
                onChange={(e) => setExpectedBehavior(e.target.value)}
              />
            </>
          ) : null}

          <TextField
            label={t("feedback:emailLabel")}
            placeholder={t("feedback:emailPlaceholder")}
            type="email"
            inputMode="email"
            autoComplete="email"
            value={contactEmail}
            maxLength={EMAIL_MAX}
            onChange={(e) => {
              setContactEmail(e.target.value);
              if (fieldErrors.contactEmail) setFieldErrors((f) => ({ ...f, contactEmail: "" }));
            }}
            error={fieldErrors.contactEmail || null}
            hint={fieldErrors.contactEmail ? undefined : t("feedback:emailHint")}
          />

          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold text-text">
              {t("feedback:screenshotLabel")}
            </span>
            {screenshotPreview ? (
              <div className="flex flex-col items-start gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element -- vista previa local (object URL), no un recurso remoto que next/image pueda optimizar */}
                <img
                  src={screenshotPreview}
                  alt={t("feedback:screenshotPreviewAlt")}
                  className="max-h-40 w-auto border border-border"
                />
                <button
                  type="button"
                  onClick={clearScreenshot}
                  className="min-h-touch text-sm font-medium text-danger"
                >
                  {t("feedback:screenshotRemove")}
                </button>
              </div>
            ) : (
              <Button
                type="button"
                variant="secondary"
                onClick={() => fileInputRef.current?.click()}
              >
                {t("feedback:screenshotLabel")}
              </Button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept={SCREENSHOT_ACCEPT}
              hidden
              onChange={(e) => pickScreenshot(e.target.files?.[0] ?? null)}
            />
            <span
              className={cn("text-xs", screenshotError ? "text-danger" : "text-muted")}
              role={screenshotError ? "alert" : undefined}
            >
              {screenshotError ?? t("feedback:screenshotHint")}
            </span>
          </div>

          <StickyActionBar>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setStep(0)} disabled={busy}>
                {t("common:back")}
              </Button>
              <Button full loading={busy} onClick={submit}>
                {busy ? t("feedback:sending") : t("feedback:send")}
              </Button>
            </div>
          </StickyActionBar>
        </div>
      ) : null}
    </AppShell>
  );
}
