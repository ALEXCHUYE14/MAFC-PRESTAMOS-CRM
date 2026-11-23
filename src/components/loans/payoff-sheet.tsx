"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BadgeCheck, Loader2 } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button, buttonVariants } from "@/components/ui/button";
import { Field, Select, Switch } from "@/components/ui/form";
import { Alert } from "@/components/ui/misc";
import { useMoney } from "@/components/ui/money";
import { PAYMENT_METHOD_LABEL } from "@/lib/constants";
import { getPayoffQuote, liquidateLoan } from "@/app/(dashboard)/prestamos/actions";
import type { PaymentMethod, PayoffQuoteResult } from "@/types/database";

/** Liquidación anticipada: saldo + mora al día, con condonaciones si el rol lo permite. */
export function PayoffSheet({ loanId, loanCode, canWaive }: { loanId: string; loanCode: string; canWaive: boolean }) {
  const router = useRouter();
  const { fmt } = useMoney();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState<PayoffQuoteResult | null>(null);
  const [waiveFee, setWaiveFee] = useState(false);
  const [waiveInt, setWaiveInt] = useState(false);
  const [method, setMethod] = useState<PaymentMethod>("efectivo");
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!open) return;
    getPayoffQuote(loanId).then((r) => (r.ok ? setQ(r.data) : setError(r.error)));
  }, [open, loanId]);

  const total = q ? q.total - (waiveFee ? q.late_fee : 0) - (waiveInt ? q.future_interest : 0) : 0;

  return (
    <Sheet open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setReceipt(null); setError(null); } }}>
      <SheetTrigger asChild><Button variant="secondary"><BadgeCheck strokeWidth={1.75} />Liquidar</Button></SheetTrigger>
      <SheetContent title="Liquidación anticipada" description={loanCode}>
        {receipt ? (
          <div className="space-y-3">
            <Alert tone="ok">Préstamo cancelado. Se emitió el recibo correspondiente.</Alert>
            <a href={`/recibo/${receipt}?print=1`} target="_blank" rel="noreferrer" className={buttonVariants({ size: "lg", className: "w-full" })}>Imprimir recibo</a>
          </div>
        ) : !q ? (
          <div className="flex justify-center py-10"><Loader2 strokeWidth={1.75} className="size-5 animate-spin text-ink-muted" /></div>
        ) : (
          <div className="space-y-4">
            <dl className="space-y-1.5 rounded-md bg-canvas p-3 text-sm">
              <div className="flex justify-between"><dt className="text-ink-muted">Capital pendiente</dt><dd className="tabular-nums">{fmt(q.principal)}</dd></div>
              <div className="flex justify-between"><dt className="text-ink-muted">Interés pendiente</dt><dd className="tabular-nums">{fmt(q.interest)}</dd></div>
              <div className="flex justify-between pl-3 text-xs"><dt className="text-ink-faint">del cual interés futuro</dt><dd className="tabular-nums text-ink-faint">{fmt(q.future_interest)}</dd></div>
              <div className="flex justify-between"><dt className="text-ink-muted">Mora al día</dt><dd className="tabular-nums text-danger">{fmt(q.late_fee)}</dd></div>
              <div className="flex justify-between border-t border-sand-border pt-1.5 text-base font-semibold"><dt>Total a cobrar</dt><dd className="tabular-nums">{fmt(total)}</dd></div>
            </dl>
            {canWaive ? (
              <div className="divide-y divide-sand-border rounded-md border border-sand-border px-3">
                <Switch label="Condonar mora" description={fmt(q.late_fee)} checked={waiveFee} onChange={setWaiveFee} />
                <Switch label="Condonar interés futuro" description={`${fmt(q.future_interest)} de cuotas aún no vencidas`} checked={waiveInt} onChange={setWaiveInt} />
              </div>
            ) : <p className="text-xs text-ink-muted">Su rol no permite condonaciones.</p>}
            <Field label="Método de pago">
              <Select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
                {(Object.keys(PAYMENT_METHOD_LABEL) as PaymentMethod[]).filter((k) => k !== "refinanciamiento").map((k) => <option key={k} value={k}>{PAYMENT_METHOD_LABEL[k]}</option>)}
              </Select>
            </Field>
            {error && <Alert tone="danger">{error}</Alert>}
            <Button size="lg" className="w-full" disabled={pending}
              onClick={() => start(async () => {
                const r = await liquidateLoan({ loanId, method, waiveLateFee: waiveFee, waiveFutureInterest: waiveInt });
                if (!r.ok) { setError(r.error); return; }
                setReceipt(r.data.payment_id);
                router.refresh();
              })}>
              {pending && <Loader2 strokeWidth={1.75} className="animate-spin" />}Cobrar {fmt(total)} y cerrar préstamo
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
