"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/** Refresca el dashboard cuando entra un pago o movimiento de caja (Supabase Realtime). */
export function RealtimeRefresh() {
  const router = useRouter();
  useEffect(() => {
    const supabase = createClient();
    let t: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => { clearTimeout(t); t = setTimeout(() => router.refresh(), 800); };
    const ch = supabase
      .channel("dashboard")
      .on("postgres_changes", { event: "*", schema: "public", table: "payments" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "cash_movements" }, refresh)
      .subscribe();
    return () => { clearTimeout(t); supabase.removeChannel(ch); };
  }, [router]);
  return null;
}
