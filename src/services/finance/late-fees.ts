import { Decimal, roundToCents, toCents, type Cents } from "./money";
import { diffDays } from "./calendar";

export type LateFeeType = "fijo_diario" | "porcentaje_diario" | "fijo_por_cuota";

export const LATE_FEE_LABEL: Record<LateFeeType, string> = {
  fijo_diario: "Monto fijo por día",
  porcentaje_diario: "% diario sobre cuota vencida",
  fijo_por_cuota: "Monto fijo por cuota vencida",
};

/** Días calendario transcurridos desde el vencimiento (para mostrar). */
export function daysOverdue(dueDate: string, today: string): number {
  return Math.max(0, diffDays(today, dueDate));
}

/** Días que generan mora: hoy − vencimiento − días de gracia. */
export function chargeableLateDays(dueDate: string, today: string, graceDays: number): number {
  return Math.max(0, diffDays(today, dueDate) - graceDays);
}

export interface LateFeeInput {
  dueDate: string;
  today: string;
  graceDays: number;
  type: LateFeeType;
  /** Monto (fijo) o porcentaje (porcentaje_diario). */
  value: number;
  /** Tope máximo de mora por cuota (en unidades monetarias). */
  cap?: number | null;
  /** Saldo pendiente de capital+interés de la cuota, en céntimos. */
  outstandingCents: Cents;
}

/** Espejo de `public.compute_late_fee`. Devuelve céntimos. */
export function computeLateFee(input: LateFeeInput): Cents {
  const days = chargeableLateDays(input.dueDate, input.today, input.graceDays);
  if (days <= 0 || input.value <= 0) return 0;
  let fee: Decimal;
  switch (input.type) {
    case "fijo_diario":
      fee = new Decimal(input.value).times(days);
      break;
    case "porcentaje_diario":
      fee = new Decimal(input.outstandingCents).dividedBy(100).times(input.value).dividedBy(100).times(days);
      break;
    case "fijo_por_cuota":
      fee = new Decimal(input.value);
      break;
  }
  let cents = roundToCents(fee);
  if (input.cap != null) cents = Math.min(cents, toCents(input.cap));
  return cents;
}
