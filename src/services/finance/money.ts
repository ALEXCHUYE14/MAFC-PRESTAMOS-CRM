import Decimal from "decimal.js";

Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

/** Entero en céntimos. Toda la aritmética monetaria del motor se hace en céntimos. */
export type Cents = number;

export function toCents(value: number | string | Decimal): Cents {
  return new Decimal(value).times(100).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
}

export function fromCents(cents: Cents): number {
  return new Decimal(cents).dividedBy(100).toNumber();
}

/** Redondeo half-up a céntimos de un Decimal expresado en unidades monetarias. */
export function roundToCents(value: Decimal): Cents {
  return value.times(100).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
}

export function sumCents(values: Cents[]): Cents {
  return values.reduce((acc, v) => acc + v, 0);
}

export { Decimal };
