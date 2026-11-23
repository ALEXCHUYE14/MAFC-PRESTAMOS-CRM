import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { toCSV } from "@/lib/csv";

const BACKUP_TABLES = [
  "system_settings", "profiles", "clients", "client_documents", "loans", "installments", "payments",
  "payment_allocations", "collection_notes", "cash_sessions", "cash_movements", "holidays", "audit_logs",
] as const;

export async function GET(req: NextRequest, { params }: { params: Promise<{ report: string }> }) {
  const { report } = await params;
  const profile = await getCurrentProfile();
  if (!profile || profile.role === "cobrador") return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  const supabase = await createClient();
  const sp = req.nextUrl.searchParams;
  const from = sp.get("from") ?? new Date().toISOString().slice(0, 10);
  const to = sp.get("to") ?? from;
  let rows: Record<string, unknown>[] = [];

  switch (report) {
    case "recaudacion": {
      const { data } = await supabase.rpc("report_collections", { p_from: from, p_to: to });
      rows = (data ?? []).map((r) => ({ fecha: r.fecha, cobrador: r.collector_name, pagos: r.pagos, total: r.total, capital: r.capital, interes: r.interes, mora: r.mora }));
      break;
    }
    case "pagos": {
      const { data } = await supabase.from("v_payments_detail").select("*").gte("paid_at", `${from}T00:00:00`).lte("paid_at", `${to}T23:59:59`).order("paid_at");
      rows = (data ?? []).map((p) => ({ recibo: p.code, fecha: p.paid_at, prestamo: p.loan_code, cliente: p.client_name, documento: p.document_number,
        monto: p.amount, mora: p.applied_to_late_fee, interes: p.applied_to_interest, capital: p.applied_to_principal, metodo: p.payment_method,
        cobrador: p.collector_name, anulado: p.voided ? "SI" : "NO" }));
      break;
    }
    case "cartera": {
      const { data } = await supabase.from("v_loan_portfolio").select("*").eq("status", "activo").order("days_overdue", { ascending: false });
      rows = (data ?? []).map((l) => ({ prestamo: l.code, cliente: l.client_name, documento: l.document_number, telefono: l.phone, zona: l.zone,
        cobrador: l.collector_name, capital: l.principal_amount, saldo: l.balance_due, vencido: l.overdue_amount, mora: l.late_fee_pending,
        dias_atraso: l.days_overdue, tramo: l.days_overdue === 0 ? "Al día" : l.days_overdue <= 7 ? "1-7" : l.days_overdue <= 15 ? "8-15" : l.days_overdue <= 30 ? "16-30" : "+30",
        proximo_vencimiento: l.next_due_date }));
      break;
    }
    case "flujo": {
      const { data } = await supabase.rpc("report_cash_flow", { p_from: from, p_to: to });
      rows = (data ?? []).map((r) => ({ tipo: r.movement_type, categoria: r.category, movimientos: r.movimientos, total: r.total }));
      break;
    }
    case "backup": {
      if (profile.role !== "admin") return NextResponse.json({ error: "Solo admin" }, { status: 403 });
      const table = sp.get("table");
      if (sp.get("format") === "csv" && table && (BACKUP_TABLES as readonly string[]).includes(table)) {
        const { data } = await supabase.from(table as (typeof BACKUP_TABLES)[number]).select("*").limit(100000);
        return new NextResponse(toCSV((data ?? []) as Record<string, unknown>[]), {
          headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${table}.csv"` },
        });
      }
      const dump: Record<string, unknown> = { exported_at: new Date().toISOString(), exported_by: profile.id };
      for (const t of BACKUP_TABLES) dump[t] = (await supabase.from(t).select("*").limit(100000)).data ?? [];
      return new NextResponse(JSON.stringify(dump, null, 2), {
        headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="respaldo-${from}.json"` },
      });
    }
    default:
      return NextResponse.json({ error: "Reporte desconocido" }, { status: 404 });
  }
  return new NextResponse(toCSV(rows), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${report}-${from}_${to}.csv"` },
  });
}
