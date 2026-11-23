"use client";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, HandCoins, Loader2, MessageCircle, Printer } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button, buttonVariants, type ButtonProps } from "@/components/ui/button";
import { Field, Input, Select, Switch, Textarea } from "@/components/ui/form";
import { Alert } from "@/components/ui/misc";
import { useMoney } from "@/components/ui/money";
import { allocatePayment, COMPONENT_LABEL, fromCents, toCents, totalOutstanding, type InstallmentBalance, type PaymentComponent } from "@/services/finance";
import { PAYMENT_METHOD_LABEL } from "@/lib/constants";
import { renderTemplate, whatsappLink } from "@/lib/formatters";
import { getPendingInstallments, registerPayment } from "@/app/(dashboard)/prestamos/actions";
import { cn } from "@/lib/utils";
import type { Installment, PaymentMethod, RegisterPaymentResult } from "@/types/database";

export interface PaymentContext {
  loanId: string;
  loanCode: string;
  clientName: string;
  clientPhone: string;
  /** Si se omite, las cuotas se cargan al abrir el panel (la ruta de cobranza no las descarga todas). */
  installments?: Installment[];
  today: string;
  paymentOrder: PaymentComponent[];
  allowPartial: boolean;
  canWaive: boolean;
  businessName: string;
  countryCode: string;
  receiptTemplate: string;
  appUrl: string;
  /** Préstamo castigado: el cobro se registra como recuperación de cartera */
  recovery?: boolean;
}

export function toBalances(rows: Installment[]): InstallmentBalance[] {
  return rows
    .filter((i) => i.status === "pendiente" || i.status === "parcial")
    .map((i) => ({
      id: i.id, number: i.installment_number, dueDate: i.due_date,
      principalDue: toCents(i.principal_due), interestDue: toCents(i.interest_due), lateFeeDue: toCents(i.late_fee_due),
      principalPaid: toCents(i.principal_paid), interestPaid: toCents(i.interest_paid), lateFeePaid: toCents(i.late_fee_paid),
      lateFeeWaived: toCents(i.late_fee_waived), interestWaived: toCents(i.interest_waived),
    }));
}

/** Drawer rápido de cobro: sugiere montos, muestra la imputación en cascada y emite el comprobante. */
export function PaymentSheet({ ctx, trigger, triggerProps }: { ctx: PaymentContext; trigger?: React.ReactNode; triggerProps?: ButtonProps }) {
  const router = useRouter();
  const { fmt } = useMoney();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("efectivo");
  const [notes, setNotes] = useState("");
  const [waive, setWaive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<(RegisterPaymentResult & { receipt_url: string }) | null>(null);
  const [pending, start] = useTransition();
  const [fetched, setFetched] = useState<Installment[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const source = ctx.installments ?? fetched;

  // Carga diferida: solo al abrir, y solo las cuotas de este préstamo
  useEffect(() => {
    if (!open || ctx.installments || fetched) return;
    let cancelled = false;
    setLoadError(null);
    getPendingInstallments(ctx.loanId).then((r) => {
      if (cancelled) return;
      if (r.ok) setFetched(r.data); else setLoadError(r.error);
    }).catch(() => { if (!cancelled) setLoadError("No se pudieron cargar las cuotas. Revise su conexión e intente de nuevo."); });
    return () => { cancelled = true; };
  }, [open, ctx.installments, ctx.loanId, fetched]);

  const balances = useMemo(() => {
    const b = toBalances(source ?? []);
    return waive ? b.map((i) => ({ ...i, lateFeeWaived: i.lateFeeDue - i.lateFeePaid })) : b;
  }, [source, waive]);

  const overdueC = balances.filter((i) => i.dueDate < ctx.today).reduce((a, i) => a + totalOutstanding([i]), 0);
  const next = balances.find((i) => i.dueDate >= ctx.today);
  const todayC = overdueC + (next && next.dueDate === ctx.today ? totalOutstanding([next]) : 0);
  const nextC = next ? totalOutstanding([next]) : 0;
  const totalC = totalOutstanding(balances);

  const suggestions = [
    todayC > 0 ? { label: overdueC > 0 ? "Vencido + hoy" : "Cuota de hoy", cents: todayC } : null,
    todayC === 0 && nextC > 0 ? { label: "Próxima cuota", cents: nextC } : null,
    overdueC > 0 && overdueC !== todayC ? { label: "Solo vencido", cents: overdueC } : null,
    { label: "Saldo total", cents: totalC },
  ].filter(Boolean) as { label: string; cents: number }[];

  const amountC = toCents(Number(amount) || 0);
  const preview = useMemo(() => {
    if (amountC <= 0 || amountC > totalC) return null;
    try { return allocatePayment(amountC, balances, ctx.today, ctx.paymentOrder); } catch { return null; }
  }, [amountC, totalC, balances, ctx.today, ctx.paymentOrder]);

  const minC = ctx.allowPartial ? 1 : Math.min(todayC || nextC, totalC);
  const invalid = amountC <= 0 ? "Ingrese un monto" : amountC > totalC ? `Excede la deuda total (${fmt(fromCents(totalC))})`
    : amountC < minC ? `No se permiten abonos parciales. Mínimo ${fmt(fromCents(minC))}` : null;

  const submit = () => start(async () => {
    setError(null);
    const res = await registerPayment({ loanId: ctx.loanId, amount: fromCents(amountC), method, notes, waiveLateFee: waive });
    if (!res.ok) { setError(res.error); return; }
    setDone(res.data);
    router.refresh();
  });

  const reset = (o: boolean) => {
    setOpen(o);
    // Al cerrar se descartan las cuotas cargadas: al reabrir se ven los saldos actualizados
    if (!o) { setDone(null); setAmount(""); setNotes(""); setWaive(false); setError(null); setFetched(null); setLoadError(null); }
  };

  // Enlace público firmado generado en el servidor (el cliente lo abre sin cuenta)
  const receiptUrl = done?.receipt_url ?? "";
  const waMessage = done ? renderTemplate(ctx.receiptTemplate, {
    cliente: ctx.clientName.split(" ")[0], negocio: ctx.businessName, saldo_total: fmt(done.balance_due), link_recibo: receiptUrl,
  }) : "";

  return (
    <Sheet open={open} onOpenChange={reset}>
      <SheetTrigger asChild>
        {trigger ?? <Button {...triggerProps}><HandCoins strokeWidth={1.75} />Registrar abono</Button>}
      </SheetTrigger>
      <SheetContent title={done ? "Pago registrado" : ctx.recovery ? "Registrar recuperación" : "Registrar abono"} description={`${ctx.clientName} · ${ctx.loanCode}`}>
        {done ? (
          <div className="space-y-4">
            <div className="flex flex-col items-center py-4 text-center">
              <CheckCircle2 strokeWidth={1.75} className="size-10 text-ok" />
              <p className="mt-2 text-lg font-semibold tabular-nums">{fmt(fromCents(amountC))}</p>
              <p className="text-sm text-ink-muted">Recibo {done.code}</p>
            </div>
            <dl className="space-y-1.5 rounded-md bg-canvas p-3 text-sm">
              {(["late_fee", "interest", "principal"] as const).map((k) => (
                <div key={k} className="flex justify-between"><dt className="text-ink-muted">{COMPONENT_LABEL[k]}</dt><dd className="tabular-nums">{fmt(done.applied[k])}</dd></div>
              ))}
              {done.late_fee_waived > 0 && <div className="flex justify-between text-ok"><dt>Mora condonada</dt><dd className="tabular-nums">{fmt(done.late_fee_waived)}</dd></div>}
              <div className="flex justify-between border-t border-sand-border pt-1.5 font-semibold"><dt>Saldo pendiente</dt><dd className="tabular-nums">{fmt(done.balance_due)}</dd></div>
            </dl>
            {done.loan_status === "pagado" && <Alert tone="ok">El préstamo quedó cancelado en su totalidad.</Alert>}
            <div className="grid grid-cols-2 gap-2">
              <a href={`/recibo/${done.payment_id}?print=1`} target="_blank" rel="noreferrer" className={buttonVariants({ variant: "secondary", size: "lg" })}>
                <Printer strokeWidth={1.75} />Imprimir ticket</a>
              <a href={whatsappLink(ctx.clientPhone, waMessage, ctx.countryCode)} target="_blank" rel="noreferrer" className={buttonVariants({ size: "lg" })}>
                <MessageCircle strokeWidth={1.75} />WhatsApp</a>
            </div>
            <Button variant="ghost" className="w-full" onClick={() => reset(false)}>Cerrar</Button>
          </div>
        ) : !source ? (
          loadError ? (
            <div className="space-y-3">
              <Alert tone="danger">{loadError}</Alert>
              <Button variant="secondary" className="w-full" onClick={() => { setLoadError(null); setFetched(null); reset(false); }}>Cerrar</Button>
            </div>
          ) : (
            <div className="flex justify-center py-12" role="status" aria-label="Cargando cuotas">
              <Loader2 strokeWidth={1.75} className="size-5 animate-spin text-ink-muted" />
            </div>
          )
        ) : (
          <div className="space-y-4">
            {ctx.recovery && (
              <Alert tone="warn">Préstamo <strong>castigado</strong>: este cobro se registrará como recuperación de cartera. La mora quedó congelada en la fecha del castigo.</Alert>
            )}
            <div className="grid grid-cols-2 gap-2">
              {suggestions.map((s) => (
                <button key={s.label} type="button" onClick={() => setAmount(fromCents(s.cents).toFixed(2))}
                  className={cn("rounded-md border px-3 py-2.5 text-left transition-colors",
                    amountC === s.cents ? "border-brand bg-brand-soft" : "border-sand-border hover:bg-canvas")}>
                  <span className="block text-xs text-ink-muted">{s.label}</span>
                  <span className="block text-sm font-semibold tabular-nums">{fmt(fromCents(s.cents))}</span>
                </button>
              ))}
            </div>
            <Field label="Monto recibido">
              <Input autoFocus type="number" inputMode="decimal" step="0.01" min="0" value={amount}
                onChange={(e) => setAmount(e.target.value)} className="h-14 text-2xl font-semibold tabular-nums" placeholder="0.00" />
            </Field>
            <Field label="Método de pago">
              <Select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
                {(Object.keys(PAYMENT_METHOD_LABEL) as PaymentMethod[]).filter((k) => k !== "refinanciamiento").map((k) =>
                  <option key={k} value={k}>{PAYMENT_METHOD_LABEL[k]}</option>)}
              </Select>
            </Field>
            {ctx.canWaive && balances.some((b) => b.lateFeeDue - b.lateFeePaid > 0) && (
              <Switch label="Condonar mora acumulada" description="Requiere permiso. Queda registrado en auditoría." checked={waive} onChange={setWaive} />
            )}
            {preview && (
              <div className="rounded-md border border-sand-border">
                <p className="border-b border-sand-border px-3 py-2 text-xs font-medium text-ink-muted">Imputación en cascada</p>
                <dl className="space-y-1 px-3 py-2 text-sm">
                  {ctx.paymentOrder.map((k) => (
                    <div key={k} className="flex justify-between"><dt className="text-ink-muted">{COMPONENT_LABEL[k]}</dt><dd className="tabular-nums">{fmt(fromCents(preview.applied[k]))}</dd></div>
                  ))}
                  <div className="flex justify-between border-t border-sand-border pt-1 text-xs text-ink-muted">
                    <dt>Cuotas afectadas</dt><dd className="tabular-nums">{preview.allocations.map((a) => a.number).join(", ")}</dd>
                  </div>
                </dl>
              </div>
            )}
            <Field label="Nota (opcional)"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="min-h-[60px]" /></Field>
            {error && <Alert tone="danger">{error}</Alert>}
            {amount && invalid && <p className="text-xs text-danger">{invalid}</p>}
            <Button size="lg" className="w-full" disabled={Boolean(invalid) || pending} onClick={submit}>
              {pending ? <Loader2 strokeWidth={1.75} className="animate-spin" /> : <HandCoins strokeWidth={1.75} />}
              Confirmar cobro {amountC > 0 ? fmt(fromCents(amountC)) : ""}
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
