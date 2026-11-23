"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Home, Route, HandCoins, Users, Menu } from "lucide-react";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/", label: "Inicio", icon: Home, match: (p: string) => p === "/" },
  { href: "/cobranzas?tab=hoy", label: "Ruta hoy", icon: Route, match: (p: string, t: string | null) => p === "/cobranzas" && t !== "buscar" },
  { href: "/cobranzas?tab=buscar", label: "Cobrar", icon: HandCoins, match: (p: string, t: string | null) => p === "/cobranzas" && t === "buscar", primary: true },
  { href: "/clientes", label: "Clientes", icon: Users, match: (p: string) => p.startsWith("/clientes") },
  { href: "/mas", label: "Más", icon: Menu, match: (p: string) => ["/mas", "/caja", "/prestamos", "/reportes", "/ajustes", "/auditoria"].some((x) => p.startsWith(x)) },
];

/**
 * Navegación inferior para cobradores en ruta (solo móvil).
 * Alto similar a la barra de pestañas nativa de iOS: 52 px de botones + la zona del indicador
 * de inicio (safe-area) en iPhone; en Android sin gestos la safe-area es 0.
 */
export function BottomNav() {
  const pathname = usePathname();
  const tab = useSearchParams().get("tab");
  return (
    <nav aria-label="Navegación principal"
      className="no-print fixed inset-x-0 bottom-0 z-40 w-full border-t border-sand-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur supports-[backdrop-filter]:bg-surface/85 lg:hidden">
      <ul className="mx-auto grid h-[52px] max-w-lg grid-cols-5">
        {ITEMS.map((item) => {
          const active = item.match(pathname, tab);
          return (
            <li key={item.label} className="min-w-0">
              <Link href={item.href} aria-label={item.label} aria-current={active ? "page" : undefined}
                className={cn("flex h-full flex-col items-center justify-center gap-0.5 text-[11px] font-medium leading-none",
                  active ? "text-brand" : "text-ink-muted")}>
                <span className={cn("flex shrink-0 items-center justify-center rounded-full",
                  item.primary ? "size-10 bg-brand text-white shadow-sm" : "size-6")}>
                  <item.icon strokeWidth={1.75} className={item.primary ? "size-5" : "size-[22px]"} aria-hidden />
                </span>
                {!item.primary && <span className="max-w-full truncate px-0.5">{item.label}</span>}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
