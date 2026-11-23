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
  { href: "/mas", label: "Más", icon: Menu, match: (p: string) => ["/mas", "/caja", "/prestamos", "/reportes", "/ajustes"].some((x) => p.startsWith(x)) },
];

/** Navegación inferior para cobradores en ruta (solo móvil). */
export function BottomNav() {
  const pathname = usePathname();
  const tab = useSearchParams().get("tab");
  return (
    <nav className="no-print fixed inset-x-0 bottom-0 z-40 border-t border-sand-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
      <ul className="mx-auto grid max-w-lg grid-cols-5">
        {ITEMS.map((item) => {
          const active = item.match(pathname, tab);
          return (
            <li key={item.label}>
              <Link href={item.href}
                className={cn("flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium",
                  active ? "text-brand" : "text-ink-muted")}>
                <span className={cn("flex items-center justify-center rounded-full",
                  item.primary ? "size-10 bg-brand text-white" : "size-6")}>
                  <item.icon strokeWidth={1.75} className="size-5" />
                </span>
                {!item.primary && item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
