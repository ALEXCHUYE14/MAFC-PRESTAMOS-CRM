"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ChevronsLeft, ChevronsRight, Landmark, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { initials } from "@/lib/formatters";
import type { UserRole } from "@/types/database";
import { NAV_ITEMS, isActive } from "./nav-items";

export function Sidebar({ role, userName, roleLabel, businessName, signOut }: {
  role: UserRole; userName: string; roleLabel: string; businessName: string; signOut: () => Promise<void>;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    try { setCollapsed(localStorage.getItem("sidebar:collapsed") === "1"); } catch { /* sin storage */ }
  }, []);
  const toggle = () => {
    setCollapsed((c) => {
      try { localStorage.setItem("sidebar:collapsed", c ? "0" : "1"); } catch { /* sin storage */ }
      return !c;
    });
  };
  const items = NAV_ITEMS.filter((i) => i.roles.includes(role));

  return (
    <aside className={cn("no-print sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-sand-border bg-surface transition-[width] lg:flex",
      collapsed ? "w-[68px]" : "w-60")}>
      <div className="flex h-14 items-center gap-2 border-b border-sand-border px-4">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-brand text-white">
          <Landmark strokeWidth={1.75} className="size-4" />
        </div>
        {!collapsed && <span className="truncate text-sm font-semibold">{businessName}</span>}
      </div>
      <nav className="flex-1 space-y-0.5 p-2">
        {items.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link key={item.href} href={item.href} title={collapsed ? item.label : undefined}
              className={cn("group flex h-10 items-center gap-3 rounded-md px-3 text-sm transition-colors",
                active ? "bg-brand-soft font-medium text-brand" : "text-ink-muted hover:bg-sand hover:text-ink")}>
              <item.icon strokeWidth={1.75} className="size-[18px] shrink-0" />
              {!collapsed && <span className="flex-1">{item.label}</span>}
              {!collapsed && item.shortcut && (
                <kbd className="hidden rounded border border-sand-border px-1 text-[10px] text-ink-faint group-hover:inline">Alt {item.shortcut}</kbd>
              )}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-sand-border p-2">
        <div className={cn("flex items-center gap-2 rounded-md px-2 py-2", collapsed && "justify-center")}>
          <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-sand text-xs font-semibold text-ink-muted">{initials(userName)}</div>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{userName}</p>
              <p className="text-xs text-ink-muted">{roleLabel}</p>
            </div>
          )}
          {!collapsed && (
            <form action={signOut}>
              <button className="rounded-md p-2 text-ink-muted hover:bg-sand" title="Cerrar sesión" aria-label="Cerrar sesión">
                <LogOut strokeWidth={1.75} className="size-4" />
              </button>
            </form>
          )}
        </div>
        <button onClick={toggle} className="flex h-9 w-full items-center justify-center gap-2 rounded-md text-xs text-ink-muted hover:bg-sand">
          {collapsed ? <ChevronsRight strokeWidth={1.75} className="size-4" /> : <><ChevronsLeft strokeWidth={1.75} className="size-4" /> Contraer</>}
        </button>
      </div>
    </aside>
  );
}
