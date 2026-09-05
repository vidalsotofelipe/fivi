"use client";

/**
 * Ajustes generales de la app: idioma, apariencia y apoyo al proyecto. Son
 * todas preferencias/contenido de nivel app, no de un grupo — Idioma y
 * Apariencia hasta acá sólo se podían cambiar entrando a un grupo y abriendo
 * su Configuración. "¿Cómo te llamás?" y "Moneda principal" siguen en el
 * inicio: ya eran accesibles sin entrar a un grupo.
 */
import { useTranslation } from "react-i18next";
import { AppShell } from "@/components/AppShell";
import { CafecitoSupport } from "@/components/CafecitoSupport";
import { FeedbackSupport } from "@/components/FeedbackSupport";
import { useLocale } from "@/components/LocaleProvider";
import { useTheme } from "@/components/ThemeProvider";
import { SegmentedControl } from "@/components/ui/primitives";
import { SUPPORTED_LANGS } from "@/i18n/config";

export default function GeneralSettingsPage() {
  const { t } = useTranslation(["settings"]);
  const { lang, setLang } = useLocale();
  const { theme, setTheme } = useTheme();

  const langOptions = SUPPORTED_LANGS.map((l) => ({
    value: l,
    label:
      l === "es" ? t("settings:languageSpanish") : t("settings:languageEnglish"),
  }));

  return (
    // `back={true}` (no un href fijo): /ajustes es alcanzable desde CUALQUIER
    // pantalla (ícono global en AppBar), así que "volver" tiene que devolver a
    // donde el usuario estaba de verdad —un grupo, un gasto, el inicio—, no
    // saltar siempre a home. La marca de la app (siempre presente en AppBar)
    // sigue siendo el camino directo al inicio.
    <AppShell title={t("settings:generalTitle")} back={true}>
      <section className="flex flex-col gap-2">
        <h2 className="label-caps">{t("settings:sectionLanguage")}</h2>
        <SegmentedControl
          label={t("settings:languageLabel")}
          options={langOptions}
          value={lang}
          onChange={setLang}
        />
        <p className="text-xs text-muted">{t("settings:languageHint")}</p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="label-caps">{t("settings:sectionAppearance")}</h2>
        <SegmentedControl
          label={t("settings:sectionAppearance")}
          options={[
            { value: "system", label: t("settings:appearanceSystem") },
            { value: "light", label: t("settings:appearanceLight") },
            { value: "dark", label: t("settings:appearanceDark") },
          ]}
          value={theme}
          onChange={setTheme}
        />
        <p className="text-xs text-muted">{t("settings:appearanceHint")}</p>
      </section>

      <FeedbackSupport />

      <CafecitoSupport />
    </AppShell>
  );
}
