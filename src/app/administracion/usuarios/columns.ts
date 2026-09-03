/**
 * Definición de columnas de la tabla de Usuarios. Metadatos SIN JSX (para poder
 * testear el orden sin montar React). El renderizado de cada celda vive en
 * `page.tsx`, que arma sus columnas a partir de este orden.
 *
 * Bug de QA que esto evita: los `th` decían "Alta · Último acceso · Email" y las
 * celdas iban email, alta, último acceso. Ahora encabezados y celdas iteran el
 * MISMO orden.
 *
 * Orden pedido: Email · Alta · Último acceso · Estado · Grupos · ID.
 */
export type UserColumnKey =
  | "email"
  | "created_at"
  | "last_sign_in_at"
  | "status"
  | "groups"
  | "id";

export interface UserColumnMeta {
  key: UserColumnKey;
  label: string;
  /** Columna de orden en el backend (`SORTS` de /api/admin/users), si es ordenable. */
  sort?: "email" | "created_at" | "last_sign_in_at";
  className?: string;
}

export const USER_COLUMNS_META: UserColumnMeta[] = [
  { key: "email", label: "Email", sort: "email" },
  {
    key: "created_at",
    label: "Alta",
    sort: "created_at",
    className: "whitespace-nowrap text-muted",
  },
  {
    key: "last_sign_in_at",
    label: "Último acceso",
    sort: "last_sign_in_at",
    className: "whitespace-nowrap text-muted",
  },
  { key: "status", label: "Estado" },
  { key: "groups", label: "Grupos", className: "whitespace-nowrap text-muted" },
  { key: "id", label: "ID", className: "font-mono text-xs text-faint" },
];
