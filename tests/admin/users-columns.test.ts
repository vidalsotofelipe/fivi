import { describe, expect, it } from "vitest";
import { USER_COLUMNS_META } from "@/app/administracion/usuarios/columns";

/**
 * Bug de QA: los encabezados decían "Alta · Último acceso · Email" pero debajo
 * iban email, alta, último acceso. Ahora encabezados y celdas recorren ESTE
 * mismo array (metadatos), así que basta con fijar su orden y sus etiquetas.
 */
describe("columnas de Usuarios", () => {
  it("van en el orden pedido: Email · Alta · Último acceso · Estado · Grupos · ID", () => {
    expect(USER_COLUMNS_META.map((c) => c.key)).toEqual([
      "email",
      "created_at",
      "last_sign_in_at",
      "status",
      "groups",
      "id",
    ]);
  });

  it("las etiquetas están en castellano y en el mismo orden", () => {
    expect(USER_COLUMNS_META.map((c) => c.label)).toEqual([
      "Email",
      "Alta",
      "Último acceso",
      "Estado",
      "Grupos",
      "ID",
    ]);
  });

  it("las columnas ordenables usan las claves de orden del backend (SORTS)", () => {
    const sortable = USER_COLUMNS_META.filter((c) => c.sort).map((c) => c.sort);
    expect(sortable).toEqual(["email", "created_at", "last_sign_in_at"]);
  });
});
