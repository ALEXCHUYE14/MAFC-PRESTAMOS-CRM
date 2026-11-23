export type Frequency = "diario" | "semanal" | "quincenal" | "mensual";

/** Fechas ISO `YYYY-MM-DD` manipuladas en UTC para evitar desfases por zona horaria. */
function parse(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function format(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  const d = parse(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return format(d);
}

/** Suma meses respetando fin de mes (31-ene + 1 mes = 28/29-feb), igual que PostgreSQL. */
export function addMonths(iso: string, months: number): string {
  const d = parse(iso);
  const day = d.getUTCDate();
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return format(target);
}

export function isSunday(iso: string): boolean {
  return parse(iso).getUTCDay() === 0;
}

export function diffDays(laterIso: string, earlierIso: string): number {
  return Math.round((parse(laterIso).getTime() - parse(earlierIso).getTime()) / 86_400_000);
}

export interface CalendarOptions {
  excludeSundays: boolean;
  holidays?: ReadonlySet<string> | readonly string[];
}

function holidaySet(h: CalendarOptions["holidays"]): ReadonlySet<string> {
  if (!h) return new Set();
  return h instanceof Set ? h : new Set(h as readonly string[]);
}

export function isNonWorkingDay(iso: string, opts: CalendarOptions): boolean {
  return (opts.excludeSundays && isSunday(iso)) || holidaySet(opts.holidays).has(iso);
}

/**
 * Genera las fechas de vencimiento a partir de la fecha de desembolso.
 * - diario: día siguiente hábil, saltando domingos/feriados si corresponde.
 * - semanal/quincenal/mensual: fecha base + N periodos; si cae en día no laborable se mueve al siguiente hábil.
 * Espejo exacto de `public.generate_due_dates` en schema.sql.
 */
export function generateDueDates(
  startDate: string,
  frequency: Frequency,
  count: number,
  opts: CalendarOptions,
): string[] {
  const holidays = holidaySet(opts.holidays);
  const o = { ...opts, holidays };
  const dates: string[] = [];
  let cursor = startDate;
  for (let i = 1; i <= count; i++) {
    let date: string;
    if (frequency === "diario") {
      cursor = addDays(cursor, 1);
      while (isNonWorkingDay(cursor, o)) cursor = addDays(cursor, 1);
      date = cursor;
    } else {
      date =
        frequency === "semanal"
          ? addDays(startDate, 7 * i)
          : frequency === "quincenal"
            ? addDays(startDate, 15 * i)
            : addMonths(startDate, i);
      while (isNonWorkingDay(date, o)) date = addDays(date, 1);
    }
    dates.push(date);
  }
  return dates;
}

export const FREQUENCY_LABEL: Record<Frequency, string> = {
  diario: "Diario",
  semanal: "Semanal",
  quincenal: "Quincenal",
  mensual: "Mensual",
};
