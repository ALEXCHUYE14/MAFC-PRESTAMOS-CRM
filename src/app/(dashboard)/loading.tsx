/**
 * Esqueleto que Next muestra al instante al cambiar de sección, mientras llegan los datos.
 * El menú lateral se mantiene; solo el contenido muestra este estado de carga.
 */
export default function Loading() {
  const bar = "rounded-md bg-sand motion-safe:animate-pulse";
  return (
    <div role="status" aria-live="polite" aria-label="Cargando">
      <span className="sr-only">Cargando…</span>
      <div className="mb-6 space-y-2">
        <div className={`${bar} h-8 w-56`} />
        <div className={`${bar} h-4 w-80 max-w-full`} />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="rounded-lg border border-sand-border bg-surface p-4 shadow-card">
            <div className={`${bar} h-3 w-24`} />
            <div className={`${bar} mt-3 h-6 w-32`} />
          </div>
        ))}
      </div>
      <div className="mt-4 rounded-lg border border-sand-border bg-surface shadow-card">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex items-center gap-4 border-b border-sand-border px-5 py-4 last:border-b-0">
            <div className={`${bar} h-4 flex-1`} />
            <div className={`${bar} h-4 w-24`} />
          </div>
        ))}
      </div>
    </div>
  );
}
