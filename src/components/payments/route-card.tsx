import Link from "next/link";
import { CalendarDays, HandCoins, MapPin, MessageCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatMoney, renderTemplate, whatsappLink, type MoneySettings } from "@/lib/formatters";
import { PaymentSheet, type PaymentContext } from "./payment-sheet";
import { NoteSheet } from "./note-sheet";
import type { LoanPortfolioView, WhatsappTemplates } from "@/types/database";

/** Tarjeta operativa para usar con una mano en la calle. */
export function RouteCard({ loan, ctx, money, templates, today }: {
  loan: LoanPortfolioView; ctx: PaymentContext; money: MoneySettings; templates: WhatsappTemplates; today: string;
}) {
  const m = (v: number) => formatMoney(v, money);
  const due = loan.overdue_amount > 0 ? loan.overdue_amount : loan.next_due_amount ?? 0;
  const msg = renderTemplate(loan.days_overdue > 0 ? templates.mora : templates.recordatorio, {
    cliente: loan.client_name.split(" ")[0], negocio: ctx.businessName, monto_cuota: m(loan.next_due_amount ?? 0),
    saldo_total: m(loan.days_overdue > 0 ? loan.overdue_amount : loan.balance_due), fecha_vencimiento: formatDate(loan.next_due_date),
    dias_mora: loan.days_overdue,
  });
  return (
    <li className="rounded-lg border border-sand-border bg-surface shadow-card">
      <div className="flex items-start gap-3 p-4">
        <div className="min-w-0 flex-1">
          <Link href={`/prestamos/${loan.id}`} className="block truncate text-base font-semibold">{loan.client_name}</Link>
          <p className="mt-0.5 flex items-start gap-1 text-sm text-ink-muted">
            <MapPin strokeWidth={1.75} className="mt-0.5 size-3.5 shrink-0" />
            <span className="line-clamp-2">{loan.address}{loan.address_reference ? ` · ${loan.address_reference}` : ""}</span>
          </p>
          <p className="mt-1 text-xs tabular-nums text-ink-faint">{loan.code} · cuota {m(loan.installment_amount)} · {loan.paid_count}/{loan.term_count}</p>
        </div>
        <div className="text-right">
          <p className="text-lg font-semibold tabular-nums">{m(due)}</p>
          {loan.days_overdue > 0
            ? <Badge tone="danger">{loan.days_overdue} d atraso</Badge>
            : loan.next_due_date === today ? <Badge tone="warn">Vence hoy</Badge> : <Badge tone="ok">{formatDate(loan.next_due_date)}</Badge>}
        </div>
      </div>
      <div className="grid grid-cols-[1.6fr_1fr_1fr_1fr] gap-1 border-t border-sand-border p-1.5">
        <PaymentSheet ctx={ctx} trigger={
          <button className="flex min-h-11 items-center justify-center gap-2 rounded-md bg-brand text-sm font-medium text-white hover:bg-brand-hover">
            <HandCoins strokeWidth={1.75} className="size-4" />Registrar abono
          </button>} />
        <Link href={`/prestamos/${loan.id}`} className="flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-md text-[11px] font-medium text-ink-muted hover:bg-sand">
          <CalendarDays strokeWidth={1.75} className="size-4" />Cronograma
        </Link>
        <a href={whatsappLink(loan.phone, msg, ctx.countryCode)} target="_blank" rel="noreferrer"
          className="flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-md text-[11px] font-medium text-ink-muted hover:bg-sand">
          <MessageCircle strokeWidth={1.75} className="size-4" />WhatsApp
        </a>
        <NoteSheet clientId={loan.client_id} loanId={loan.id} clientName={loan.client_name} />
      </div>
    </li>
  );
}
