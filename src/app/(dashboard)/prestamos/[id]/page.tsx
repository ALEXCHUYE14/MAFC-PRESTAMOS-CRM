import Link from "next/link";
import { notFound } from "next/navigation";
import { FileText, MessageCircle, Printer, RefreshCcw, Send, UserRound } from "lucide-react";
import { requireProfile, getSettings, can } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatDateTime, formatMoney, renderTemplate, todayISO, whatsappLink } from "@/lib/formatters";
import { LOAN_STATUS_LABEL, PAYMENT_METHOD_LABEL } from "@/lib/constants";
import { FREQUENCY_LABEL, LATE_FEE_LABEL } from "@/services/finance";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge, toneForStatus } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Alert, PageHeader, Progress, Stat } from "@/components/ui/misc";
import { Table, TableWrap, Td, Th, Tr } from "@/components/ui/table";
import { ScheduleTable } from "@/components/loans/schedule-table";
import { PayoffSheet } from "@/components/loans/payoff-sheet";
import { PaymentSheet } from "@/components/payments/payment-sheet";
import { VoidPaymentButton } from "@/components/payments/void-payment-button";
import { CollectionNoteForm } from "@/components/payments/collection-note-form";
import { NotesTimeline } from "@/components/payments/notes-timeline";
import { LoanAdminActions } from "@/components/loans/loan-admin-actions";
import { signedUrl } from "@/lib/signed-links";
import { cn } from "@/lib/utils";

export default async function PrestamoPage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ nuevo?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const profile = await requireProfile();
  const settings = await getSettings();
  const supabase = await createClient();
  await supabase.rpc("refresh_late_fees", { p_loan_id: id });

  const [{ data: loan }, { data: view }, { data: installments }, { data: payments }, { data: notes }, { data: people }] = await Promise.all([
    supabase.from("loans").select("*").eq("id", id).single(),
    supabase.from("v_loan_portfolio").select("*").eq("id", id).single(),
    supabase.from("installments").select("*").eq("loan_id", id).order("installment_number"),
    supabase.from("payments").select("*").eq("loan_id", id).order("paid_at", { ascending: false }),
    supabase.from("collection_notes").select("*").eq("loan_id", id).order("created_at", { ascending: false }),
    supabase.from("profiles").select("id, full_name"),
  ]);
  if (!loan || !view) notFound();

  const today = todayISO(settings.timezone);
  const m = (v: number) => formatMoney(v, settings);
  const authors = Object.fromEntries((people ?? []).map((p) => [p.id, p.full_name]));
  const paidPct = loan.total_amount > 0 ? (loan.paid_amount / loan.total_amount) * 100 : 0;
  const active = loan.status === "activo";
  const firstName = view.client_name.split(" ")[0];
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const isAdmin = can(profile.role, "void_payment");
  const hasPayments = (payments ?? []).some((p) => !p.voided);
  const isRefinancing = Boolean(loan.previous_loan_id) && loan.refinanced_balance > 0;
  const { data: previous } = loan.previous_loan_id
    ? await supabase.from("loans").select("code").eq("id", loan.previous_loan_id).maybeSingle()
    : { data: null };
  // Enlace público firmado al estado de cuenta (el cliente lo abre sin cuenta). Si no se puede
  // firmar (falta el secreto en el servidor), simplemente no se muestra el botón.
  const statementUrl = await signedUrl("estado", loan.id).catch(() => "");
  const statementMsg = `Hola ${firstName}, le compartimos el estado de cuenta de su préstamo ${loan.code}: ${statementUrl}
${settings.business_name}`;

  const welcome = renderTemplate(settings.templates.bienvenida, {
    cliente: firstName, negocio: settings.business_name, monto_cuota: m(loan.installment_amount),
    fecha_vencimiento: formatDate(loan.first_due_date), saldo_total: m(loan.balance_due),
  });
  const reminder = view.days_overdue > 0
    ? renderTemplate(settings.templates.mora, {
        cliente: firstName, negocio: settings.business_name, dias_mora: view.days_overdue,
        saldo_total: m(view.overdue_amount), monto_cuota: m(view.next_due_amount ?? 0), fecha_vencimiento: formatDate(view.next_due_date),
      })
    : renderTemplate(settings.templates.recordatorio, {
        cliente: firstName, negocio: settings.business_name, monto_cuota: m(view.next_due_amount ?? 0),
        fecha_vencimiento: formatDate(view.next_due_date), saldo_total: m(loan.balance_due),
      });

  return (
    <>
      <PageHeader
        title={loan.code}
        description={`${view.client_name} · ${FREQUENCY_LABEL[loan.frequency]} · ${loan.term_count} cuotas`}
        actions={
          <>
            <a href={whatsappLink(view.phone, sp.nuevo ? welcome : reminder, settings.phone_country_code)} target="_blank" rel="noreferrer"
              className={buttonVariants({ variant: "secondary" })}><MessageCircle strokeWidth={1.75} />{sp.nuevo ? "Enviar bienvenida" : view.days_overdue > 0 ? "Aviso de mora" : "Recordatorio"}</a>
            <Link href={`/estado-cuenta/${loan.id}`} target="_blank" className={buttonVariants({ variant: "secondary" })}><FileText strokeWidth={1.75} />Estado de cuenta</Link>
            {statementUrl && (
              <a href={whatsappLink(view.phone, statementMsg, settings.phone_country_code)} target="_blank" rel="noreferrer"
                className={buttonVariants({ variant: "secondary" })} title="Envía al cliente un enlace seguro (vigencia 30 días)">
                <Send strokeWidth={1.75} />Enviar estado</a>
            )}
            {active && can(profile.role, "disburse") && (
              <Link href={`/prestamos/nuevo?cliente=${loan.client_id}&refinanciar=${loan.id}`} className={buttonVariants({ variant: "secondary" })}>
                <RefreshCcw strokeWidth={1.75} />Refinanciar</Link>
            )}
            {active && <PayoffSheet loanId={loan.id} loanCode={loan.code} canWaive={can(profile.role, "waive") && settings.allow_late_fee_waiver} />}
            {active && (
              <PaymentSheet ctx={{
                loanId: loan.id, loanCode: loan.code, clientName: view.client_name, clientPhone: view.phone,
                installments: installments ?? [], today, paymentOrder: settings.payment_order,
                allowPartial: settings.allow_partial_payments, canWaive: can(profile.role, "waive") && settings.allow_late_fee_waiver,
                businessName: settings.business_name, countryCode: settings.phone_country_code,
                receiptTemplate: settings.templates.recibo, appUrl,
              }} />
            )}
            {active && isAdmin && (
              <LoanAdminActions loanId={loan.id} loanCode={loan.code} netDisbursed={loan.net_disbursed} balanceDue={loan.balance_due}
                hasPayments={hasPayments} isRefinancing={isRefinancing} previousCode={previous?.code ?? null} />
            )}
          </>
        }
      />
      {loan.status === "anulado" && (
        <div className="mb-4"><Alert tone="danger">
          Préstamo <strong>anulado</strong>{loan.voided_at ? ` el ${formatDateTime(loan.voided_at, settings.timezone)}` : ""}
          {loan.voided_by ? ` por ${authors[loan.voided_by] ?? "—"}` : ""}. Motivo: {loan.void_reason ?? "—"}
        </Alert></div>
      )}
      {loan.status === "castigado" && (
        <div className="mb-4"><Alert tone="danger">
          Préstamo <strong>castigado</strong> por <strong className="tabular-nums">{m(loan.written_off_amount ?? 0)}</strong>
          {loan.written_off_at ? ` el ${formatDateTime(loan.written_off_at, settings.timezone)}` : ""}
          {loan.written_off_by ? ` por ${authors[loan.written_off_by] ?? "—"}` : ""}. Motivo: {loan.write_off_reason ?? "—"}
        </Alert></div>
      )}
      {sp.nuevo && (
        <div className="mb-4"><Alert tone="ok">
          Préstamo desembolsado. Neto entregado: <strong className="tabular-nums">{m(loan.net_disbursed)}</strong>
          {loan.refinanced_balance > 0 ? ` (se descontó ${m(loan.refinanced_balance)} del préstamo anterior)` : ""}.
        </Alert></div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardContent>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={toneForStatus(loan.status)}>{LOAN_STATUS_LABEL[loan.status]}</Badge>
              {view.days_overdue > 0 && active && <Badge tone="danger">{view.days_overdue} días de atraso · {view.overdue_count} cuotas</Badge>}
              {loan.previous_loan_id && <Link href={`/prestamos/${loan.previous_loan_id}`}><Badge tone="neutral">Refinancia préstamo anterior</Badge></Link>}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Stat label="Capital" value={m(loan.principal_amount)} hint={`${loan.interest_rate}% ${loan.interest_type === "frances" ? "mensual · francés" : loan.flat_rate_mode === "total" ? "total · simple" : "por periodo · simple"}`} />
              <Stat label="Total a pagar" value={m(loan.total_amount)} hint={`Interés ${m(loan.total_interest)}`} />
              <Stat label="Pagado" value={m(loan.paid_amount)} hint={loan.late_fee_paid > 0 ? `+ ${m(loan.late_fee_paid)} de mora` : undefined} tone="ok" />
              <Stat label="Saldo pendiente" value={m(loan.balance_due)} hint={view.late_fee_pending > 0 ? `+ ${m(view.late_fee_pending)} de mora` : undefined}
                tone={view.days_overdue > 0 ? "danger" : undefined} />
            </div>
            <div className="mt-5">
              <div className="mb-1.5 flex justify-between text-xs text-ink-muted">
                <span>{view.paid_count} de {loan.term_count} cuotas pagadas</span><span className="tabular-nums">{Math.round(paidPct)}%</span>
              </div>
              <Progress value={paidPct} tone={view.days_overdue > 7 ? "danger" : view.days_overdue > 0 ? "warn" : "ok"} />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><UserRound strokeWidth={1.75} className="size-4" />Cliente</CardTitle></CardHeader>
          <CardContent className="space-y-1.5 text-sm">
            <Link href={`/clientes/${loan.client_id}`} className="font-medium hover:text-brand">{view.client_name}</Link>
            <p className="tabular-nums text-ink-muted">{view.document_number} · {view.phone}</p>
            <p className="text-ink-muted">{view.address}</p>
            <dl className="mt-3 grid grid-cols-2 gap-2 border-t border-sand-border pt-3 text-xs">
              <dt className="text-ink-muted">Cuota</dt><dd className="text-right font-medium tabular-nums">{m(loan.installment_amount)}</dd>
              <dt className="text-ink-muted">Próximo venc.</dt><dd className="text-right tabular-nums">{formatDate(view.next_due_date)}</dd>
              <dt className="text-ink-muted">Desembolso</dt><dd className="text-right tabular-nums">{formatDate(loan.disbursed_at)}</dd>
              <dt className="text-ink-muted">Vence</dt><dd className="text-right tabular-nums">{formatDate(loan.maturity_date)}</dd>
              <dt className="text-ink-muted">Mora</dt><dd className="text-right">{LATE_FEE_LABEL[loan.late_fee_type]} ({loan.late_fee_rate})</dd>
              <dt className="text-ink-muted">Gracia</dt><dd className="text-right tabular-nums">{loan.grace_days} días</dd>
              <dt className="text-ink-muted">Cobrador</dt><dd className="text-right">{view.collector_name ?? "—"}</dd>
            </dl>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader><CardTitle>Cronograma</CardTitle></CardHeader>
        <ScheduleTable installments={installments ?? []} today={today} />
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Recibos emitidos</CardTitle></CardHeader>
          {payments?.length ? (
            <TableWrap>
              <Table>
                <thead><tr><Th>Recibo</Th><Th>Fecha</Th><Th>Método</Th><Th align="right">Monto</Th><Th align="right">Mora</Th><Th align="right">Interés</Th><Th align="right">Capital</Th><Th>Cobró</Th><Th /></tr></thead>
                <tbody>
                  {payments.map((p) => (
                    <Tr key={p.id} className={cn(p.voided && "opacity-50")}>
                      <Td className="tabular-nums font-medium">{p.code}{p.voided && <Badge tone="danger" className="ml-2">Anulado</Badge>}</Td>
                      <Td className="tabular-nums text-ink-muted">{formatDateTime(p.paid_at, settings.timezone)}</Td>
                      <Td>{PAYMENT_METHOD_LABEL[p.payment_method]}{p.is_payoff ? <Badge tone="brand" className="ml-1">Liquidación</Badge> : null}</Td>
                      <Td align="right" className={cn("font-medium", p.voided && "line-through")}>{m(p.amount)}</Td>
                      <Td align="right">{m(p.applied_to_late_fee)}</Td>
                      <Td align="right">{m(p.applied_to_interest)}</Td>
                      <Td align="right">{m(p.applied_to_principal)}</Td>
                      <Td className="text-ink-muted">{authors[p.collected_by ?? ""] ?? "—"}</Td>
                      <Td>
                        <div className="flex justify-end gap-1">
                          <a href={`/recibo/${p.id}?print=1`} target="_blank" rel="noreferrer" className="rounded-md p-1.5 text-ink-muted hover:bg-sand" aria-label="Imprimir">
                            <Printer strokeWidth={1.75} className="size-4" /></a>
                          {!p.voided && can(profile.role, "void_payment") && p.payment_method !== "refinanciamiento" && (
                            <VoidPaymentButton paymentId={p.id} loanId={loan.id} code={p.code} />
                          )}
                        </div>
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
          ) : <CardContent><p className="text-sm text-ink-muted">Aún no hay pagos.</p></CardContent>}
        </Card>
        <Card>
          <CardHeader><CardTitle>Gestiones de cobranza</CardTitle></CardHeader>
          <CardContent className="space-y-6">
            {active && <CollectionNoteForm clientId={loan.client_id} loanId={loan.id} />}
            <NotesTimeline notes={notes ?? []} authors={authors} />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
