import { formatDate, formatDateTime, formatMoney, maskDocument } from "@/lib/formatters";
import { PAYMENT_METHOD_LABEL } from "@/lib/constants";
import type { ReceiptData } from "@/lib/documents";
import type { SystemSettings } from "@/types/database";

/** Ticket de pago para impresora térmica 58/80 mm. `publicView` oculta el documento completo. */
export function ReceiptTicket({ s, data, publicView = false }: { s: SystemSettings; data: ReceiptData; publicView?: boolean }) {
  const { payment: p, balanceDue, next } = data;
  const m = (v: number) => formatMoney(v, s);
  const width = s.receipt_width === 58 ? "58mm" : "80mm";
  const Row = ({ l, v, b }: { l: string; v: string; b?: boolean }) => (
    <div className={`flex justify-between gap-2 ${b ? "font-bold" : ""}`}><span>{l}</span><span className="tabular-nums">{v}</span></div>
  );

  return (
    <>
      <style>{`@page { size: ${width} auto; margin: 0; } @media print { .ticket { box-shadow: none !important; border: 0 !important; } }`}</style>
      <div className="ticket mx-auto bg-white p-3 font-mono text-[11px] leading-snug text-black shadow-card" style={{ width }}>
        <div className="text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {s.logo_url ? <img src={s.logo_url} alt="" className="mx-auto mb-1 max-h-12 grayscale" /> : null}
          <p className="text-[13px] font-bold">{s.business_name}</p>
          {s.legal_name && <p>{s.legal_name}</p>}
          {s.tax_id && <p>RUC/NIT: {s.tax_id}</p>}
          {s.address && <p>{s.address}</p>}
          {s.phone && <p>Tel: {s.phone}</p>}
        </div>
        <p className="my-2 border-y border-dashed border-black py-1 text-center font-bold">RECIBO DE PAGO {p.code}{p.voided ? " — ANULADO" : ""}</p>
        <Row l="Fecha" v={formatDateTime(p.paid_at, s.timezone)} />
        <Row l="Cliente" v={p.client_name} />
        <Row l="Documento" v={publicView ? maskDocument(p.document_number) : p.document_number} />
        <Row l="Préstamo" v={p.loan_code} />
        <Row l="Método" v={PAYMENT_METHOD_LABEL[p.payment_method]} />
        <div className="my-2 border-t border-dashed border-black" />
        {p.applied_to_late_fee > 0 && <Row l="Mora" v={m(p.applied_to_late_fee)} />}
        {p.applied_to_interest > 0 && <Row l="Interés" v={m(p.applied_to_interest)} />}
        {p.applied_to_principal > 0 && <Row l="Capital" v={m(p.applied_to_principal)} />}
        {p.late_fee_waived > 0 && <Row l="Mora condonada" v={m(p.late_fee_waived)} />}
        {p.interest_waived > 0 && <Row l="Interés condonado" v={m(p.interest_waived)} />}
        <div className="my-1 border-t border-black" />
        <div className="text-[13px]"><Row l="TOTAL PAGADO" v={m(p.amount)} b /></div>
        <div className="my-2 border-t border-dashed border-black" />
        {/* Saldo y próxima cuota son del momento actual: no tienen sentido en un recibo anulado */}
        {!p.voided && <Row l="Saldo pendiente" v={m(balanceDue)} b />}
        {!p.voided && next && <Row l="Próx. vencimiento" v={formatDate(next.due_date)} />}
        {!p.voided && next && <Row l="Próx. cuota" v={m(next.principal_due + next.interest_due - next.principal_paid - next.interest_paid)} />}
        {p.is_payoff && !p.voided && <p className="mt-1 text-center font-bold">PRÉSTAMO CANCELADO</p>}
        <p className="mt-2">Atendido por: {p.collector_name ?? "—"}</p>
        {s.receipt_footer && <p className="mt-2 whitespace-pre-wrap text-center">{s.receipt_footer}</p>}
        <p className="mt-2 text-center text-[9px]">Conserve este comprobante</p>
      </div>
    </>
  );
}
