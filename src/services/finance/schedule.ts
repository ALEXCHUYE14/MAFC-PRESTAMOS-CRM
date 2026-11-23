import { Decimal, roundToCents, toCents, fromCents, type Cents } from "./money";
import { generateDueDates, type Frequency } from "./calendar";

export type InterestType = "simple" | "frances";
export type FlatRateMode = "total" | "por_periodo";

export interface ScheduleInput {
  principal: number;
  /** Simple: % sobre el capital (total o por periodo). Francés: % MENSUAL. */
  ratePct: number;
  interestType: InterestType;
  flatRateMode?: FlatRateMode;
  frequency: Frequency;
  termCount: number;
  /** Fecha de desembolso ISO. La primera cuota vence un periodo después. */
  startDate: string;
  excludeSundays: boolean;
  holidays?: readonly string[];
}

export interface ScheduleRow {
  number: number;
  dueDate: string;
  principalCents: Cents;
  interestCents: Cents;
  totalCents: Cents;
  balanceAfterCents: Cents;
}

export interface ScheduleResult {
  rows: ScheduleRow[];
  principalCents: Cents;
  interestCents: Cents;
  totalCents: Cents;
  installmentCents: Cents;
  /** Interés total / capital × 100 */
  effectiveRatePct: number;
  /** Tasa equivalente mensual aproximada (solo informativa). */
  monthlyEquivalentPct: number;
  firstDueDate: string;
  maturityDate: string;
}

const PERIOD_FACTOR: Record<Frequency, Decimal> = {
  mensual: new Decimal(1),
  quincenal: new Decimal("0.5"),
  semanal: new Decimal(7).dividedBy(30),
  diario: new Decimal(1).dividedBy(30),
};

const PERIODS_PER_MONTH: Record<Frequency, number> = { mensual: 1, quincenal: 2, semanal: 30 / 7, diario: 30 };

/** Tasa por periodo (fracción) a partir de una tasa mensual %. Espejo de `public.period_rate`. */
export function periodRate(monthlyRatePct: number, frequency: Frequency): Decimal {
  return new Decimal(monthlyRatePct).dividedBy(100).times(PERIOD_FACTOR[frequency]);
}

export function validateScheduleInput(input: ScheduleInput): string | null {
  if (!(input.principal > 0)) return "El capital debe ser mayor a cero";
  if (!(input.ratePct >= 0)) return "La tasa no puede ser negativa";
  if (!Number.isInteger(input.termCount) || input.termCount < 1 || input.termCount > 720)
    return "El número de cuotas debe estar entre 1 y 720";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.startDate)) return "Fecha de inicio inválida";
  return null;
}

export function buildSchedule(input: ScheduleInput): ScheduleResult {
  const err = validateScheduleInput(input);
  if (err) throw new Error(err);

  const n = input.termCount;
  const dates = generateDueDates(input.startDate, input.frequency, n, {
    excludeSundays: input.excludeSundays,
    holidays: input.holidays,
  });
  const principalC = toCents(input.principal);
  const rows: ScheduleRow[] = [];

  if (input.interestType === "simple") {
    const periods = input.flatRateMode === "por_periodo" ? n : 1;
    const interestC = roundToCents(
      new Decimal(principalC).dividedBy(100).times(input.ratePct).dividedBy(100).times(periods),
    );
    // Cuota redondeada al céntimo; la última absorbe la diferencia (igual que SQL).
    const cuotaC = new Decimal(principalC + interestC).dividedBy(n).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
    const baseI = new Decimal(interestC).dividedBy(n).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
    const baseP = cuotaC - baseI;
    let balance = principalC + interestC;
    for (let i = 1; i <= n; i++) {
      const p = i < n ? baseP : principalC - baseP * (n - 1);
      const it = i < n ? baseI : interestC - baseI * (n - 1);
      balance -= p + it;
      rows.push({ number: i, dueDate: dates[i - 1], principalCents: p, interestCents: it, totalCents: p + it, balanceAfterCents: balance });
    }
  } else {
    const r = periodRate(input.ratePct, input.frequency);
    const P = new Decimal(principalC).dividedBy(100);
    const cuotaC = r.isZero()
      ? roundToCents(P.dividedBy(n))
      : roundToCents(P.times(r).dividedBy(new Decimal(1).minus(r.plus(1).pow(-n))));
    let balanceC = principalC;
    for (let i = 1; i <= n; i++) {
      const it = roundToCents(new Decimal(balanceC).dividedBy(100).times(r));
      const p = i < n ? cuotaC - it : balanceC;
      balanceC -= p;
      rows.push({ number: i, dueDate: dates[i - 1], principalCents: p, interestCents: it, totalCents: p + it, balanceAfterCents: balanceC });
    }
  }

  const interestCents = rows.reduce((a, r) => a + r.interestCents, 0);
  const totalCents = rows.reduce((a, r) => a + r.totalCents, 0);
  const effective = principalC > 0 ? new Decimal(interestCents).dividedBy(principalC).times(100) : new Decimal(0);
  const months = n / PERIODS_PER_MONTH[input.frequency];

  return {
    rows,
    principalCents: principalC,
    interestCents,
    totalCents,
    installmentCents: rows[0]?.totalCents ?? 0,
    effectiveRatePct: effective.toDecimalPlaces(2).toNumber(),
    monthlyEquivalentPct: months > 0 ? effective.dividedBy(months).toDecimalPlaces(2).toNumber() : 0,
    firstDueDate: rows[0]?.dueDate ?? input.startDate,
    maturityDate: rows[rows.length - 1]?.dueDate ?? input.startDate,
  };
}

export function scheduleSummary(result: ScheduleResult) {
  return {
    principal: fromCents(result.principalCents),
    interest: fromCents(result.interestCents),
    total: fromCents(result.totalCents),
    installment: fromCents(result.installmentCents),
    effectiveRatePct: result.effectiveRatePct,
  };
}
