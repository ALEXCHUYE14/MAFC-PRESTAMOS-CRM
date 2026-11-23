"use client";
import { Badge, toneForStatus } from "@/components/ui/badge";
import { Table, TableWrap, Td, Th, Tr } from "@/components/ui/table";
import { useMoney } from "@/components/ui/money";
import { formatDate } from "@/lib/formatters";
import { INSTALLMENT_STATUS_LABEL } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { Installment } from "@/types/database";

export interface PreviewRow { number: number; dueDate: string; principal: number; interest: number; total: number; balance: number }

/** Vista previa del simulador (sin estados). */
export function SchedulePreviewTable({ rows }: { rows: PreviewRow[] }) {
  const { fmt } = useMoney();
  return (
    <TableWrap className="max-h-[420px] overflow-y-auto">
      <Table>
        <thead className="sticky top-0"><tr><Th>N°</Th><Th>Vence</Th><Th align="right">Capital</Th><Th align="right">Interés</Th><Th align="right">Cuota</Th><Th align="right">Saldo</Th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <Tr key={r.number}>
              <Td className="tabular-nums text-ink-muted">{r.number}</Td>
              <Td className="tabular-nums">{formatDate(r.dueDate)}</Td>
              <Td align="right">{fmt(r.principal)}</Td>
              <Td align="right">{fmt(r.interest)}</Td>
              <Td align="right" className="font-medium">{fmt(r.total)}</Td>
              <Td align="right" className="text-ink-muted">{fmt(r.balance)}</Td>
            </Tr>
          ))}
        </tbody>
      </Table>
    </TableWrap>
  );
}

/** Cronograma real con estados visuales. */
export function ScheduleTable({ installments, today }: { installments: Installment[]; today: string }) {
  const { fmt } = useMoney();
  return (
    <TableWrap>
      <Table>
        <thead>
          <tr>
            <Th className="sticky left-0 z-10">N°</Th><Th>Vence</Th><Th align="right">Capital</Th><Th align="right">Interés</Th>
            <Th align="right">Mora</Th><Th align="right">Pagado</Th><Th align="right">Pendiente</Th><Th>Estado</Th>
          </tr>
        </thead>
        <tbody>
          {installments.map((i) => {
            const pending = i.principal_due + i.interest_due + i.late_fee_due - i.principal_paid - i.interest_paid - i.late_fee_paid - i.late_fee_waived - i.interest_waived;
            const open = i.status === "pendiente" || i.status === "parcial";
            const overdue = open && i.due_date < today;
            const dueToday = open && i.due_date === today;
            return (
              <Tr key={i.id} className={cn(overdue && "bg-danger-bg/40", dueToday && "bg-warn-bg/50")}>
                <Td className="sticky left-0 bg-inherit tabular-nums text-ink-muted">{i.installment_number}</Td>
                <Td className="tabular-nums">{formatDate(i.due_date)}</Td>
                <Td align="right">{fmt(i.principal_due)}</Td>
                <Td align="right">{fmt(i.interest_due)}{i.interest_waived > 0 ? <span className="block text-[11px] text-ok">−{fmt(i.interest_waived)} cond.</span> : null}</Td>
                <Td align="right" className={cn(i.late_fee_due > 0 && "text-danger")}>{i.late_fee_due > 0 ? fmt(i.late_fee_due) : "—"}
                  {i.late_fee_waived > 0 ? <span className="block text-[11px] text-ok">−{fmt(i.late_fee_waived)} cond.</span> : null}</Td>
                <Td align="right">{i.paid_amount > 0 ? fmt(i.paid_amount) : "—"}</Td>
                <Td align="right" className="font-medium">{pending > 0.004 ? fmt(pending) : "—"}</Td>
                <Td>
                  <Badge tone={overdue ? "danger" : dueToday ? "warn" : toneForStatus(i.status)}>
                    {overdue ? "Vencida" : dueToday ? "Vence hoy" : INSTALLMENT_STATUS_LABEL[i.status]}
                  </Badge>
                </Td>
              </Tr>
            );
          })}
        </tbody>
      </Table>
    </TableWrap>
  );
}
