import Link from "next/link";
import { Landmark, Wallet } from "lucide-react";

export function MobileHeader({ businessName, cashOpen }: { businessName: string; cashOpen: boolean }) {
  return (
    <header className="no-print sticky top-0 z-30 flex h-14 items-center justify-between border-b border-sand-border bg-canvas/95 px-4 backdrop-blur lg:hidden">
      <div className="flex items-center gap-2">
        <div className="flex size-8 items-center justify-center rounded-md bg-brand text-white"><Landmark strokeWidth={1.75} className="size-4" /></div>
        <span className="text-sm font-semibold">{businessName}</span>
      </div>
      <Link href="/caja" className="flex items-center gap-1.5 rounded-md border border-sand-border bg-surface px-2.5 py-1.5 text-xs font-medium">
        <span className={`size-2 rounded-full ${cashOpen ? "bg-ok" : "bg-danger"}`} />
        <Wallet strokeWidth={1.75} className="size-3.5" /> {cashOpen ? "Caja abierta" : "Caja cerrada"}
      </Link>
    </header>
  );
}
