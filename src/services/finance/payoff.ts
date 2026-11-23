import type { Cents } from "./money";
import { outstandingOf, type InstallmentBalance } from "./cascade";

export interface PayoffQuote {
  principal: Cents;
  interest: Cents;
  futureInterest: Cents;
  lateFee: Cents;
  total: Cents;
}

/** Espejo de `public.get_payoff_quote`. */
export function computePayoff(
  installments: InstallmentBalance[],
  today: string,
  opts: { waiveLateFee?: boolean; waiveFutureInterest?: boolean } = {},
): PayoffQuote {
  let principal = 0, interest = 0, futureInterest = 0, lateFee = 0;
  for (const i of installments) {
    principal += outstandingOf(i, "principal");
    const it = outstandingOf(i, "interest");
    interest += it;
    if (i.dueDate > today) futureInterest += it;
    lateFee += outstandingOf(i, "late_fee");
  }
  const total =
    principal + interest - (opts.waiveFutureInterest ? futureInterest : 0) + (opts.waiveLateFee ? 0 : lateFee);
  return { principal, interest, futureInterest, lateFee, total };
}
