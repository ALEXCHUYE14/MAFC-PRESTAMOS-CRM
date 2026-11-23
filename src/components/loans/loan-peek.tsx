"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { Eye, Loader2 } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { buttonVariants } from "@/components/ui/button";
import { Progress, Stat, Alert } from "@/components/ui/misc";
import { useMoney } from "@/components/ui/money";
import { ScheduleTable } from "./schedule-table";
import { getLoanPeek, type LoanPeek as Peek } from "@/app/(dashboard)/prestamos/actions";

/** Panel deslizable con el detalle del préstamo sin salir del listado. */
export function LoanPeek({ loanId, code, today }: { loanId: string; code: string; today: string }) {
  const { fmt } = useMoney();
  const [data, setData] = useState<Peek | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <Sheet onOpenChange={(o) => { if (o && !data) start(async () => { const r = await getLoanPeek(loanId); r.ok ? setData(r.data) : setError(r.error); }); }}>
      <SheetTrigger asChild>
        <button className="rounded-md p-1.5 text-ink-muted hover:bg-sand hover:text-ink" aria-label={`Vista rápida ${code}`}><Eye strokeWidth={1.75} className="size-4" /></button>
      </SheetTrigger>
      <SheetContent title={code} description={data?.loan.client_name}>
        {pending || (!data && !error) ? (
          <div className="flex justify-center py-12"><Loader2 strokeWidth={1.75} className="size-5 animate-spin text-ink-muted" /></div>
        ) : error ? <Alert tone="danger">{error}</Alert> : data ? (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <Stat label="Saldo" value={fmt(data.loan.balance_due)} />
              <Stat label="Vencido" value={fmt(data.loan.overdue_amount)} tone={data.loan.overdue_amount > 0 ? "danger" : undefined}
                hint={data.loan.days_overdue > 0 ? `${data.loan.days_overdue} días` : "Al día"} />
              <Stat label="Cuota" value={fmt(data.loan.installment_amount)} />
              <Stat label="Próximo vencimiento" value={data.loan.next_due_date?.split("-").reverse().join("/") ?? "—"} />
            </div>
            <div>
              <p className="mb-1 text-xs text-ink-muted tabular-nums">{data.loan.paid_count}/{data.loan.term_count} cuotas</p>
              <Progress value={(data.loan.paid_count / data.loan.term_count) * 100} />
            </div>
            <div className="-mx-5 border-y border-sand-border"><ScheduleTable installments={data.installments} today={today} /></div>
            <Link href={`/prestamos/${loanId}`} className={buttonVariants({ className: "w-full" })}>Abrir expediente completo</Link>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
