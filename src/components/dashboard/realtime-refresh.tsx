"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/** Intervalo mínimo entre recargas: varios cobros seguidos producen una sola recarga. */
const MIN_INTERVAL_MS = 15_000;

/**
 * Refresca el dashboard cuando entra un pago o movimiento de caja (Supabase Realtime).
 * Cada recarga vuelve a consultar todos los indicadores, así que:
 *  - se agrupan los eventos (como máximo una recarga cada 15 s);
 *  - con la pestaña oculta no se recarga: se hace una sola vez al volver a ella.
 */
export function RealtimeRefresh() {
  const router = useRouter();
  useEffect(() => {
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let pending = false;
    let last = 0;

    const run = () => {
      timer = undefined;
      if (document.visibilityState !== "visible") { pending = true; return; }
      pending = false;
      last = Date.now();
      router.refresh();
    };
    const schedule = () => {
      pending = true;
      if (timer) return;
      timer = setTimeout(run, Math.max(800, last + MIN_INTERVAL_MS - Date.now()));
    };
    const onVisible = () => { if (document.visibilityState === "visible" && pending && !timer) schedule(); };

    const ch = supabase
      .channel("dashboard")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "payments" }, schedule)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "payments" }, schedule)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "cash_movements" }, schedule)
      .subscribe();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      supabase.removeChannel(ch);
    };
  }, [router]);
  return null;
}
