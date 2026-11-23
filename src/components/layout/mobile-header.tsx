import Link from "next/link";
import { Landmark, Wallet } from "lucide-react";

/** Encabezado móvil. El nombre se recorta con "…" para que el estado de caja nunca se salga de la pantalla. */
export function MobileHeader({ businessName, cashOpen }: { businessName: string; cashOpen: boolean }) {
  return (
    <header className="no-print sticky top-0 z-30 border-b border-sand-border bg-canvas/95 pt-[env(safe-area-inset-top)] backdrop-blur lg:hidden">
      <div className="flex h-14 items-center justify-between gap-3 px-4">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-brand text-white"><Landmark strokeWidth={1.75} className="size-4" /></div>
          <span className="truncate text-sm font-semibold">{businessName}</span>
        </div>
        <Link href="/caja" className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border border-sand-border bg-surface px-2.5 py-1.5 text-xs font-medium">
          <span className={`size-2 rounded-full ${cashOpen ? "bg-ok" : "bg-danger"}`} />
          <Wallet strokeWidth={1.75} className="size-3.5" /> {cashOpen ? "Caja abierta" : "Caja cerrada"}
        </Link>
      </div>
    </header>
  );
}
