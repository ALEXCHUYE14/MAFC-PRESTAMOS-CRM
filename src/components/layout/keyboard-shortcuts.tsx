"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { NAV_ITEMS } from "./nav-items";

/**
 * Atajos para cajeros:
 *  Alt+D/C/P/L/K/R navegan · Alt+N nuevo préstamo · Alt+U nuevo cliente · "/" enfoca la búsqueda.
 */
export function KeyboardShortcuts() {
  const router = useRouter();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable;
      if (e.key === "/" && !typing) {
        const el = document.querySelector<HTMLInputElement>("[data-search]");
        if (el) { e.preventDefault(); el.focus(); }
        return;
      }
      if (!e.altKey) return;
      const k = e.key.toUpperCase();
      if (k === "N") { e.preventDefault(); router.push("/prestamos/nuevo"); return; }
      if (k === "U") { e.preventDefault(); router.push("/clientes/nuevo"); return; }
      const item = NAV_ITEMS.find((i) => i.shortcut === k);
      if (item) { e.preventDefault(); router.push(item.href); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);
  return null;
}
