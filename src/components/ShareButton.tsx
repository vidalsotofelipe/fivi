"use client";

import { useState } from "react";
import { Button } from "./Button";

/**
 * Comparte el enlace del grupo (sección 31: "un grupo se comparte mediante un
 * enlace"). Usa `navigator.share` en móvil y cae en copiar al portapapeles.
 *
 * Quien abra ese enlace en otro dispositivo trae el grupo del servidor
 * automáticamente (ver `GroupLayout` → `requestGroup`).
 */
export function ShareButton({
  groupId,
  groupName,
}: {
  groupId: string;
  groupName: string;
}) {
  const [copied, setCopied] = useState(false);

  async function share() {
    const url =
      typeof window !== "undefined"
        ? `${window.location.origin}/g/${groupId}`
        : `/g/${groupId}`;

    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({
          title: groupName,
          text: `Sumate al grupo "${groupName}" en fivi`,
          url,
        });
        return;
      } catch {
        // usuario canceló o no soportado: seguimos con el portapapeles
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copiá el enlace para compartir el grupo:", url);
    }
  }

  return (
    <Button variant="secondary" full onClick={share}>
      {copied ? "Enlace copiado ✓" : "Compartir grupo"}
    </Button>
  );
}
