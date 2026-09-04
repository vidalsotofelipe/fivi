"use client";

/**
 * Ajustes generales de la app: idioma y apariencia. Son preferencias del
 * dispositivo (`LocaleProvider` / `ThemeProvider`), no de un grupo — hasta acá
 * sólo se podían cambiar entrando a un grupo y abriendo su Configuración.
 * "¿Cómo te llamás?" y "Moneda principal" siguen en el inicio: ya eran
 * accesibles sin entrar a un grupo.
 */
import { useTranslation } from "react-i18next";
import { AppShell } from "@/components/AppShell";
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
    <AppShell title={t("settings:generalTitle")} back="/">
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
    </AppShell>
  );
}
