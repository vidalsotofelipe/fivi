"use client";

import { useTranslation } from "react-i18next";
import { LinkButton } from "./Button";

/**
 * "Ayudanos a mejorar": entrada al formulario de feedback (reportar un
 * problema, proponer una mejora, consultar u otro comentario). Vive en
 * Ajustes generales, entre Apariencia y Apoyar el proyecto — deliberadamente
 * SIN el formulario acá: sólo el texto corto + un botón a `/ajustes/feedback`,
 * para que esta pantalla siga viéndose limpia.
 */
export function FeedbackSupport() {
  const { t } = useTranslation(["settings"]);

  return (
    <section className="flex flex-col gap-2">
      <h2 className="label-caps">{t("settings:sectionFeedback")}</h2>
      <p className="text-sm text-muted">{t("settings:feedbackBody")}</p>
      <LinkButton href="/ajustes/feedback" full>
        {t("settings:feedbackButton")}
      </LinkButton>
    </section>
  );
}
