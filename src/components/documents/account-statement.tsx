import { formatDate, formatDateTime, formatMoney, maskDocument } from "@/lib/formatters";
import { INSTALLMENT_STATUS_LABEL, LOAN_STATUS_LABEL, PAYMENT_METHOD_LABEL } from "@/lib/constants";
import { FREQUENCY_LABEL } from "@/services/finance";
import type { StatementData } from "@/lib/documents";
import type { SystemSettings } from "@/types/database";

/**
 * Estado de cuenta A4 imprimible / Guardar como PDF.
 * `publicView` (enlace enviado al cliente) oculta teléfono, dirección y el documento completo.
 */
export function AccountStatement({ s, data, today, publicView = false }: {
  s: SystemSettings; data: StatementData; today: string; publicView?: boolean;
}) {
  const { loan: l, installments, payments } = data;
  const m = (v: number) => formatMoney(v, s);
  const th = "border-b border-black/20 px-2 py-1 text-left font-semibold";
  const td = "border-b border-black/10 px-2 py-1 tabular-nums";

  return (
    <>
      <style>{`@page { size: A4; margin: 14mm; }`}</style>
      <article className="mx-auto max-w-[800px] bg-white p-4 text-[12px] text-ink shadow-card sm:p-8 print:max-w-none print:p-0 print:shadow-none">
        <header className="flex flex-wrap items-start justify-between gap-3 border-b-2 border-brand pb-4">
          <div>
            <p className="font-serif text-xl font-semibold">{s.business_name}</p>
            <p className="text-ink-muted">{[s.legal_name, s.tax_id && `RUC/NIT ${s.tax_id}`, s.address, s.phone].filter(Boolean).join(" · ")}</p>
          </div>
          <div className="text-right">
            <p className="font-serif text-lg font-semibold">Estado de cuenta</p>
            <p className="text-ink-muted">Emitido {formatDate(today)}</p>
          </div>
        </header>
        <section className="mt-4 grid gap-6 sm:grid-cols-2">
          <div>
            <p className="text-ink-muted">Cliente</p>
            <p className="font-semibold">{l.client_name}</p>
            {publicView ? <p>{maskDocument(l.document_number)}</p> : <><p>{l.document_number} · {l.phone}</p><p>{l.address}</p></>}
          </div>
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
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead><tr><th className={th}>N°</th><th className={th}>Vence</th><th className={`${th} text-right`}>Cuota</th><th className={`${th} text-right`}>Mora</th><th className={`${th} text-right`}>Pagado</th><th className={th}>Estado</th></tr></thead>
            <tbody>{installments.map((i) => (
              <tr key={i.id}>
                <td className={td}>{i.installment_number}</td><td className={td}>{formatDate(i.due_date)}</td>
                <td className={`${td} text-right`}>{m(i.principal_due + i.interest_due)}</td>
                <td className={`${td} text-right`}>{i.late_fee_due > 0 ? m(i.late_fee_due) : "—"}</td>
                <td className={`${td} text-right`}>{i.paid_amount > 0 ? m(i.paid_amount) : "—"}</td>
                <td className={td}>{(i.status === "pendiente" || i.status === "parcial") && i.due_date < today && l.status === "activo" ? "Vencida" : INSTALLMENT_STATUS_LABEL[i.status]}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
        <h2 className="mb-1 mt-6 font-semibold">Pagos registrados</h2>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead><tr><th className={th}>Recibo</th><th className={th}>Fecha</th><th className={th}>Método</th><th className={`${th} text-right`}>Monto</th></tr></thead>
            <tbody>{payments.map((p) => (
              <tr key={p.id}><td className={td}>{p.code}</td><td className={td}>{formatDateTime(p.paid_at, s.timezone)}</td><td className={td}>{PAYMENT_METHOD_LABEL[p.payment_method]}</td><td className={`${td} text-right`}>{m(p.amount)}</td></tr>
            ))}</tbody>
          </table>
        </div>
        <footer className="mt-8 text-center text-[10px] text-ink-muted">{s.receipt_footer}</footer>
      </article>
    </>
  );
}
