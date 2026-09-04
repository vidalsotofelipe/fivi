"use client";

import { useTranslation } from "react-i18next";

/**
 * Sección de apoyo voluntario (Cafecito). Es un aporte opcional para sostener
 * el desarrollo de fivi — no una función paga ni algo necesario para usar la
 * app —, así que vive tanto en el menú de cada grupo ("Más") como en los
 * ajustes generales de la app: es contenido de nivel app, no de un grupo en
 * particular. Un solo componente para no duplicar el markup en los dos lugares.
 */
export function CafecitoSupport() {
  const { t } = useTranslation(["settings"]);

  return (
    <section className="flex flex-col gap-2">
      <h2 className="label-caps">{t("settings:sectionSupport")}</h2>
      <p className="text-sm text-muted">{t("settings:supportBody")}</p>
      <a
        href="https://cafecito.app/vidalsotofelipe"
        target="_blank"
        rel="noopener noreferrer"
      >
        {/* Badge SVG de terceros (Cafecito): nada que next/image optimice. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="https://cdn.cafecito.app/imgs/buttons/button_1.svg"
          alt={t("settings:supportButtonAlt")}
          className="h-auto max-w-full"
        />
      </a>
    </section>
  );
}
