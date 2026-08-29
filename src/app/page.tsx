/**
 * Home placeholder (sección 28: pantalla inicial con grupos recientes).
 *
 * Las pantallas del producto se implementan en la siguiente etapa. Por ahora
 * esta página sólo confirma que el scaffold, Tailwind y la PWA funcionan.
 */
export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 px-5 py-10">
      <header className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold tracking-tight">fivi</h1>
        <p className="text-sm opacity-70">
          Dividí gastos entre un grupo. Rápida, mobile-first y funciona sin
          conexión.
        </p>
      </header>

      <section className="rounded-2xl border border-black/10 p-5 dark:border-white/10">
        <h2 className="text-sm font-medium opacity-60">Estado del proyecto</h2>
        <ul className="mt-3 space-y-2 text-sm">
          <li>✓ Dominio: dinero, división, balances y simplificación de deudas</li>
          <li>✓ Datos locales: IndexedDB (Dexie) + cola de sincronización</li>
          <li>✓ Sincronización: motor desacoplado detrás de un puerto</li>
          <li>◻ Pantallas del producto — próxima etapa</li>
        </ul>
      </section>

      <p className="text-xs opacity-50">
        Ver <code>docs/ARCHITECTURE.md</code> para el diseño completo.
      </p>
    </main>
  );
}
