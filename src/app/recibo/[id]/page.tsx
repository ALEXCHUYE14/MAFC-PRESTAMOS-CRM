import { notFound } from "next/navigation";
import { getSettings, requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatDateTime, formatMoney, renderTemplate, whatsappLink } from "@/lib/formatters";
import { PAYMENT_METHOD_LABEL } from "@/lib/constants";
import { PrintControls } from "@/components/loans/print-controls";

export const metadata = { title: "Recibo" };

/** Ticket para impresora térmica 58/80 mm. */
export default async function ReciboPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ print?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  await requireProfile();
  const s = await getSettings();
  const supabase = await createClient();
  const { data: p } = await supabase.from("v_payments_detail").select("*").eq("id", id).single();
  if (!p) notFound();
  const [{ data: loan }, { data: next }] = await Promise.all([
    supabase.from("loans").select("*").eq("id", p.loan_id).single(),
    supabase.from("installments").select("due_date, principal_due, interest_due, principal_paid, interest_paid").eq("loan_id", p.loan_id)
      .in("status", ["pendiente", "parcial"]).order("installment_number").limit(1).maybeSingle(),
  ]);
  const m = (v: number) => formatMoney(v, s);
  const width = s.receipt_width === 58 ? "58mm" : "80mm";
  const url = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/recibo/${p.id}`;
  const msg = renderTemplate(s.templates.recibo, { cliente: p.client_name.split(" ")[0], negocio: s.business_name, saldo_total: m(loan?.balance_due ?? 0), link_recibo: url });
  const Row = ({ l, v, b }: { l: string; v: string; b?: boolean }) => (
    <div className={`flex justify-between gap-2 ${b ? "font-bold" : ""}`}><span>{l}</span><span className="tabular-nums">{v}</span></div>
  );

  return (
    <div className="min-h-dvh bg-canvas py-6 print:bg-white print:py-0">
      <style>{`@page { size: ${width} auto; margin: 0; } @media print { .ticket { box-shadow: none !important; border: 0 !important; } }`}</style>
      <PrintControls auto={sp.print === "1"} shareUrl={whatsappLink(p.phone, msg, s.phone_country_code)} shareText="Enviar por WhatsApp" />
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
        <Row l="Documento" v={p.document_number} />
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
        <Row l="Saldo pendiente" v={m(loan?.balance_due ?? 0)} b />
        {next && <Row l="Próx. vencimiento" v={formatDate(next.due_date)} />}
        {next && <Row l="Próx. cuota" v={m(next.principal_due + next.interest_due - next.principal_paid - next.interest_paid)} />}
        {p.is_payoff && <p className="mt-1 text-center font-bold">PRÉSTAMO CANCELADO</p>}
        <p className="mt-2">Atendido por: {p.collector_name ?? "—"}</p>
        {s.receipt_footer && <p className="mt-2 whitespace-pre-wrap text-center">{s.receipt_footer}</p>}
        <p className="mt-2 text-center text-[9px]">Conserve este comprobante</p>
      </div>
    </div>
  );
}
