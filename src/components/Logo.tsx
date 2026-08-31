/**
 * Marca de fivi como SVG inline. `AppMark` es el app icon (baldosa de marca +
 * cuadrado + círculo): se ve igual en tema claro y oscuro porque trae su propio
 * fondo. Ver `brand/` para el set completo de logotipos.
 */

/** App icon: baldosa oscura con el cuadrado blanco y el círculo naranja. */
export function AppMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      role="img"
      aria-label="fivi"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="100" height="100" rx="24" fill="#17161a" />
      <g transform="translate(22.5 22.5) scale(0.55)">
        <rect width="76" height="76" rx="21" fill="#ffffff" />
        <circle cx="78" cy="78" r="22" fill="#e2662f" />
      </g>
    </svg>
  );
}
