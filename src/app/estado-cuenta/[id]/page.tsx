import { notFound } from "next/navigation";
import { getSettings, requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatDateTime, formatMoney, todayISO } from "@/lib/formatters";
import { INSTALLMENT_STATUS_LABEL, LOAN_STATUS_LABEL, PAYMENT_METHOD_LABEL } from "@/lib/constants";
import { FREQUENCY_LABEL } from "@/services/finance";
import { PrintControls } from "@/components/loans/print-controls";

export const metadata = { title: "Estado de cuenta" };

/** Estado de cuenta A4 imprimible / Guardar como PDF. */
export default async function EstadoCuentaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireProfile();
  const s = await getSettings();
  const supabase = await createClient();
  await supabase.rpc("refresh_late_fees", { p_loan_id: id });
  const [{ data: l }, { data: inst }, { data: pays }] = await Promise.all([
    supabase.from("v_loan_portfolio").select("*").eq("id", id).single(),
    supabase.from("installments").select("*").eq("loan_id", id).order("installment_number"),
    supabase.from("payments").select("*").eq("loan_id", id).eq("voided", false).order("paid_at"),
  ]);
  if (!l) notFound();
  const m = (v: number) => formatMoney(v, s);
  const today = todayISO(s.timezone);
  const th = "border-b border-black/20 px-2 py-1 text-left font-semibold";
  const td = "border-b border-black/10 px-2 py-1 tabular-nums";

  return (
    <div className="min-h-dvh bg-canvas py-6 print:bg-white print:py-0">
      <style>{`@page { size: A4; margin: 14mm; }`}</style>
      <PrintControls />
      <article className="mx-auto max-w-[800px] bg-white p-8 text-[12px] text-ink shadow-card print:max-w-none print:p-0 print:shadow-none">
        <header className="flex items-start justify-between border-b-2 border-brand pb-4">
          <div>
            <p className="font-serif text-xl font-semibold">{s.business_name}</p>
            <p className="text-ink-muted">{[s.legal_name, s.tax_id && `RUC/NIT ${s.tax_id}`, s.address, s.phone].filter(Boolean).join(" · ")}</p>
          </div>
          <div className="text-right">
            <p className="font-serif text-lg font-semibold">Estado de cuenta</p>
            <p className="text-ink-muted">Emitido {formatDate(today)}</p>
          </div>
        </header>
        <section className="mt-4 grid grid-cols-2 gap-6">
          <div><p className="text-ink-muted">Cliente</p><p className="font-semibold">{l.client_name}</p><p>{l.document_number} · {l.phone}</p><p>{l.address}</p></div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
            <span className="text-ink-muted">Préstamo</span><span className="text-right font-semibold">{l.code}</span>
            <span className="text-ink-muted">Estado</span><span className="text-right">{LOAN_STATUS_LABEL[l.status]}</span>
            <span className="text-ink-muted">Capital</span><span className="text-right tabular-nums">{m(l.principal_amount)}</span>
            <span className="text-ink-muted">Total a pagar</span><span className="text-right tabular-nums">{m(l.total_amount)}</span>
            <span className="text-ink-muted">Frecuencia</span><span className="text-right">{FREQUENCY_LABEL[l.frequency]} · {l.term_count} cuotas</span>
            <span className="text-ink-muted">Pagado</span><span className="text-right tabular-nums">{m(l.paid_amount)}</span>
            <span className="font-semibold">Saldo</span><span className="text-right font-semibold tabular-nums">{m(l.balance_due)}</span>
            {l.late_fee_pending > 0 && <><span className="text-danger">Mora al día</span><span className="text-right tabular-nums text-danger">{m(l.late_fee_pending)}</span></>}
          </div>
        </section>
        <h2 className="mb-1 mt-6 font-semibold">Cronograma</h2>
        <table className="w-full border-collapse">
          <thead><tr><th className={th}>N°</th><th className={th}>Vence</th><th className={`${th} text-right`}>Cuota</th><th className={`${th} text-right`}>Mora</th><th className={`${th} text-right`}>Pagado</th><th className={th}>Estado</th></tr></thead>
          <tbody>{(inst ?? []).map((i) => (
            <tr key={i.id}>
              <td className={td}>{i.installment_number}</td><td className={td}>{formatDate(i.due_date)}</td>
              <td className={`${td} text-right`}>{m(i.principal_due + i.interest_due)}</td>
              <td className={`${td} text-right`}>{i.late_fee_due > 0 ? m(i.late_fee_due) : "—"}</td>
              <td className={`${td} text-right`}>{i.paid_amount > 0 ? m(i.paid_amount) : "—"}</td>
              <td className={td}>{(i.status === "pendiente" || i.status === "parcial") && i.due_date < today ? "Vencida" : INSTALLMENT_STATUS_LABEL[i.status]}</td>
            </tr>
          ))}</tbody>
        </table>
        <h2 className="mb-1 mt-6 font-semibold">Pagos registrados</h2>
        <table className="w-full border-collapse">
          <thead><tr><th className={th}>Recibo</th><th className={th}>Fecha</th><th className={th}>Método</th><th className={`${th} text-right`}>Monto</th></tr></thead>
          <tbody>{(pays ?? []).map((p) => (
            <tr key={p.id}><td className={td}>{p.code}</td><td className={td}>{formatDateTime(p.paid_at, s.timezone)}</td><td className={td}>{PAYMENT_METHOD_LABEL[p.payment_method]}</td><td className={`${td} text-right`}>{m(p.amount)}</td></tr>
          ))}</tbody>
        </table>
        <footer className="mt-8 text-center text-[10px] text-ink-muted">{s.receipt_footer}</footer>
      </article>
    </div>
  );
}
