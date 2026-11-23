import { Link2Off } from "lucide-react";
import type { Metadata } from "next";

/** Metadatos de toda página pública: no indexar y no filtrar el enlace firmado por Referer. */
export const PUBLIC_DOC_METADATA: Metadata = {
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
};

/** Mensaje para enlaces vencidos, inválidos o servicio no configurado (no revela si el documento existe). */
export function LinkStatus({ expired, unavailable = false }: { expired: boolean; unavailable?: boolean }) {
  return (
    <main className="grid min-h-dvh place-items-center bg-canvas p-6">
      <div className="max-w-sm text-center">
        <Link2Off strokeWidth={1.75} className="mx-auto size-10 text-ink-muted" />
        <h1 className="mt-4 font-serif text-xl font-semibold">{unavailable ? "Documento no disponible" : expired ? "Este enlace venció" : "Enlace no válido"}</h1>
        <p className="mt-2 text-sm text-ink-muted">
          {unavailable
            ? "No pudimos mostrar el documento en este momento. Intente más tarde o solicítelo a su asesor."
            : expired
            ? "Por seguridad, los enlaces tienen una vigencia limitada. Solicite uno nuevo a su asesor."
            : "Verifique que copió el enlace completo o solicite uno nuevo a su asesor."}
        </p>
      </div>
    </main>
  );
}
