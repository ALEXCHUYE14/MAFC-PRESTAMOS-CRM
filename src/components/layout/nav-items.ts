import {
  LayoutDashboard, Users, HandCoins, Route, Wallet, BarChart3, Settings, type LucideIcon,
} from "lucide-react";
import type { UserRole } from "@/types/database";

export interface NavItem { href: string; label: string; icon: LucideIcon; roles: UserRole[]; shortcut?: string }

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, roles: ["admin", "cajero", "cobrador"], shortcut: "D" },
  { href: "/cobranzas", label: "Cobranzas", icon: Route, roles: ["admin", "cajero", "cobrador"], shortcut: "C" },
  { href: "/prestamos", label: "Préstamos", icon: HandCoins, roles: ["admin", "cajero", "cobrador"], shortcut: "P" },
  { href: "/clientes", label: "Clientes", icon: Users, roles: ["admin", "cajero", "cobrador"], shortcut: "L" },
  { href: "/caja", label: "Caja", icon: Wallet, roles: ["admin", "cajero", "cobrador"], shortcut: "K" },
  { href: "/reportes", label: "Reportes", icon: BarChart3, roles: ["admin", "cajero"], shortcut: "R" },
  { href: "/ajustes", label: "Ajustes", icon: Settings, roles: ["admin"] },
];

export function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}
