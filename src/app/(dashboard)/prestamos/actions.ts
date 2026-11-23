"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { errorMessage, type ActionResult } from "@/lib/utils";
import type {
  CreateLoanResult, FlatRateMode, Installment, InterestType, LateFeeType, LoanFrequency, LoanPortfolioView,
  PaymentMethod, PayoffQuoteResult, RegisterPaymentResult,
} from "@/types/database";

const loanSchema = z.object({
  client_id: z.guid("Seleccione un cliente"),
  principal: z.number().positive("El monto debe ser mayor a cero"),
  interest_rate: z.number().min(0).max(1000),
  interest_type: z.enum(["simple", "frances"]),
  flat_rate_mode: z.enum(["total", "por_periodo"]),
  frequency: z.enum(["diario", "semanal", "quincenal", "mensual"]),
  term_count: z.number().int().min(1).max(720),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  grace_days: z.number().int().min(0).max(60),
  late_fee_type: z.enum(["fijo_diario", "porcentaje_diario", "fijo_por_cuota"]),
  late_fee_value: z.number().min(0),
  late_fee_cap: z.number().min(0).nullable(),
  exclude_sundays: z.boolean(),
  previous_loan_id: z.guid().nullable(),
  collector_id: z.guid().nullable(),
  notes: z.string().nullable(),
});
export type CreateLoanInput = z.infer<typeof loanSchema>;

export async function createLoan(input: CreateLoanInput): Promise<ActionResult<CreateLoanResult>> {
  await requireProfile(["admin", "cajero"]);
  const parsed = loanSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  const v = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_loan_with_schedule", {
    p_client_id: v.client_id,
    p_principal: v.principal,
    p_interest_rate: v.interest_rate,
    p_interest_type: v.interest_type as InterestType,
    p_frequency: v.frequency as LoanFrequency,
    p_term_count: v.term_count,
    p_start_date: v.start_date,
    p_flat_rate_mode: v.flat_rate_mode as FlatRateMode,
    p_grace_days: v.grace_days,
    p_late_fee_type: v.late_fee_type as LateFeeType,
    p_late_fee_value: v.late_fee_value,
    p_late_fee_cap: v.late_fee_cap,
    p_exclude_sundays: v.exclude_sundays,
    p_previous_loan_id: v.previous_loan_id,
    p_collector_id: v.collector_id,
    p_notes: v.notes,
  });
  if (error || !data) return { ok: false, error: errorMessage(error) };
  revalidatePath("/prestamos");
  revalidatePath("/caja");
  revalidatePath("/");
  return { ok: true, data };
}

export async function registerPayment(input: {
  loanId: string; amount: number; method: PaymentMethod; notes?: string; waiveLateFee?: boolean;
}): Promise<ActionResult<RegisterPaymentResult>> {
  await requireProfile();
  if (!(input.amount > 0)) return { ok: false, error: "Ingrese un monto válido" };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("register_loan_payment", {
    p_loan_id: input.loanId,
    p_amount: Math.round(input.amount * 100) / 100,
    p_method: input.method,
    p_notes: input.notes || null,
    p_waive_late_fee: Boolean(input.waiveLateFee),
  });
  if (error || !data) return { ok: false, error: errorMessage(error) };
  revalidatePath(`/prestamos/${input.loanId}`);
  revalidatePath("/cobranzas");
  revalidatePath("/caja");
  return { ok: true, data };
}

export async function getPayoffQuote(loanId: string): Promise<ActionResult<PayoffQuoteResult>> {
  await requireProfile();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_payoff_quote", { p_loan_id: loanId });
  if (error || !data) return { ok: false, error: errorMessage(error) };
  return { ok: true, data };
}

export async function liquidateLoan(input: {
  loanId: string; method: PaymentMethod; waiveLateFee: boolean; waiveFutureInterest: boolean; notes?: string;
}): Promise<ActionResult<RegisterPaymentResult & { total: number }>> {
  await requireProfile();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("liquidate_loan", {
    p_loan_id: input.loanId,
    p_method: input.method,
    p_waive_late_fee: input.waiveLateFee,
    p_waive_future_interest: input.waiveFutureInterest,
    p_notes: input.notes || null,
  });
  if (error || !data) return { ok: false, error: errorMessage(error) };
  revalidatePath(`/prestamos/${input.loanId}`);
  revalidatePath("/caja");
  return { ok: true, data };
}

export async function voidPayment(paymentId: string, reason: string, loanId: string): Promise<ActionResult> {
  await requireProfile(["admin"]);
  const supabase = await createClient();
  const { error } = await supabase.rpc("void_payment", { p_payment_id: paymentId, p_reason: reason });
  if (error) return { ok: false, error: errorMessage(error) };
  revalidatePath(`/prestamos/${loanId}`);
  revalidatePath("/caja");
  return { ok: true, data: undefined };
}

export interface LoanPeek { loan: LoanPortfolioView; installments: Installment[] }

/** Datos ligeros para el panel deslizable (slide-over) del listado. */
export async function getLoanPeek(loanId: string): Promise<ActionResult<LoanPeek>> {
  await requireProfile();
  const supabase = await createClient();
  await supabase.rpc("refresh_late_fees", { p_loan_id: loanId });
  const [{ data: loan, error }, { data: installments }] = await Promise.all([
    supabase.from("v_loan_portfolio").select("*").eq("id", loanId).single(),
    supabase.from("installments").select("*").eq("loan_id", loanId).order("installment_number"),
  ]);
  if (error || !loan) return { ok: false, error: errorMessage(error) };
  return { ok: true, data: { loan, installments: installments ?? [] } };
}

export interface RefinanceOption { id: string; code: string; payoff: number; balance: number }

export async function getRefinanceOptions(clientId: string): Promise<RefinanceOption[]> {
  await requireProfile(["admin", "cajero"]);
  const supabase = await createClient();
  const { data: loans } = await supabase.from("loans").select("id, code, balance_due").eq("client_id", clientId).eq("status", "activo");
  const out: RefinanceOption[] = [];
  for (const l of loans ?? []) {
    const { data: q } = await supabase.rpc("get_payoff_quote", { p_loan_id: l.id });
    out.push({ id: l.id, code: l.code, balance: l.balance_due, payoff: q?.total ?? l.balance_due });
  }
  return out;
}
