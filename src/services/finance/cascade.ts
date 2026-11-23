import type { Cents } from "./money";

export type PaymentComponent = "late_fee" | "interest" | "principal";
export const DEFAULT_PAYMENT_ORDER: PaymentComponent[] = ["late_fee", "interest", "principal"];

export const COMPONENT_LABEL: Record<PaymentComponent, string> = {
  late_fee: "Mora",
  interest: "Interés",
  principal: "Capital",
};

export interface InstallmentBalance {
  id: string;
  number: number;
  dueDate: string;
  principalDue: Cents;
  interestDue: Cents;
  lateFeeDue: Cents;
  principalPaid: Cents;
  interestPaid: Cents;
  lateFeePaid: Cents;
  lateFeeWaived?: Cents;
  interestWaived?: Cents;
}

export interface Allocation {
  installmentId: string;
  number: number;
  late_fee: Cents;
  interest: Cents;
  principal: Cents;
}

export interface CascadeResult {
  allocations: Allocation[];
  applied: Record<PaymentComponent, Cents>;
  remainder: Cents;
}

export function outstandingOf(i: InstallmentBalance, c: PaymentComponent): Cents {
  switch (c) {
    case "late_fee":
      return Math.max(0, i.lateFeeDue - i.lateFeePaid - (i.lateFeeWaived ?? 0));
    case "interest":
      return Math.max(0, i.interestDue - i.interestPaid - (i.interestWaived ?? 0));
    case "principal":
      return Math.max(0, i.principalDue - i.principalPaid);
  }
}

export function totalOutstanding(installments: InstallmentBalance[]): Cents {
  return installments.reduce(
    (a, i) => a + outstandingOf(i, "late_fee") + outstandingOf(i, "interest") + outstandingOf(i, "principal"),
    0,
  );
}

/**
 * Imputación en cascada (espejo de `public.apply_cascade`):
 *  Fase 1 — cuotas vencidas (vencimiento < hoy): se cubre cada componente en el orden configurado
 *           a través de TODAS las cuotas vencidas (1° toda la mora, 2° todo el interés vencido, 3° todo el capital vencido).
 *  Fase 2 — siguientes cuotas por orden de vencimiento, cada una componente por componente.
 * No muta la entrada.
 */
export function allocatePayment(
  amountCents: Cents,
  installments: InstallmentBalance[],
  today: string,
  order: PaymentComponent[] = DEFAULT_PAYMENT_ORDER,
): CascadeResult {
  if (!Number.isInteger(amountCents) || amountCents <= 0) throw new Error("Monto inválido");
  const sorted = [...installments]
    .map((i) => ({ ...i }))
    .sort((a, b) => (a.dueDate === b.dueDate ? a.number - b.number : a.dueDate < b.dueDate ? -1 : 1));
  const allocs = new Map<string, Allocation>();
  const applied: Record<PaymentComponent, Cents> = { late_fee: 0, interest: 0, principal: 0 };
  let left = amountCents;

  const take = (inst: InstallmentBalance, comp: PaymentComponent) => {
    if (left <= 0) return;
    const amt = Math.min(left, outstandingOf(inst, comp));
    if (amt <= 0) return;
    const a = allocs.get(inst.id) ?? { installmentId: inst.id, number: inst.number, late_fee: 0, interest: 0, principal: 0 };
    a[comp] += amt;
    allocs.set(inst.id, a);
    if (comp === "late_fee") inst.lateFeePaid += amt;
    else if (comp === "interest") inst.interestPaid += amt;
    else inst.principalPaid += amt;
    applied[comp] += amt;
    left -= amt;
  };

  const overdue = sorted.filter((i) => i.dueDate < today);
  const upcoming = sorted.filter((i) => i.dueDate >= today);
  for (const comp of order) for (const inst of overdue) take(inst, comp);
  for (const inst of upcoming) for (const comp of order) take(inst, comp);

  return {
    allocations: [...allocs.values()].sort((a, b) => a.number - b.number),
    applied,
    remainder: left,
  };
}
