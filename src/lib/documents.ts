import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Installment, LoanPortfolioView, Payment, PaymentDetailView, SystemSettings } from "@/types/database";

/**
 * Carga de datos del recibo y del estado de cuenta. Funciona con el cliente del usuario
 * (páginas internas, filtrado por RLS) o con el cliente service role (páginas públicas,
 * SOLO después de verificar un enlace firmado).
 */
type Db = SupabaseClient<Database>;

export type NextInstallment = Pick<Installment, "due_date" | "principal_due" | "interest_due" | "principal_paid" | "interest_paid">;

export interface ReceiptData { payment: PaymentDetailView; balanceDue: number; next: NextInstallment | null }

export async function loadReceipt(db: Db, paymentId: string): Promise<ReceiptData | null> {
  const { data: payment } = await db.from("v_payments_detail").select("*").eq("id", paymentId).maybeSingle();
  if (!payment) return null;
  const [{ data: loan }, { data: next }] = await Promise.all([
    db.from("loans").select("balance_due").eq("id", payment.loan_id).maybeSingle(),
    db.from("installments").select("due_date, principal_due, interest_due, principal_paid, interest_paid").eq("loan_id", payment.loan_id)
      .in("status", ["pendiente", "parcial"]).order("installment_number").limit(1).maybeSingle(),
  ]);
  return { payment, balanceDue: loan?.balance_due ?? 0, next: next ?? null };
}

export interface StatementData { loan: LoanPortfolioView; installments: Installment[]; payments: Payment[] }

export async function loadStatement(db: Db, loanId: string): Promise<StatementData | null> {
  // Mora al día (si falla, p. ej. por permisos, se muestra la última calculada)
  await db.rpc("refresh_late_fees", { p_loan_id: loanId });
  const [{ data: loan }, { data: installments }, { data: payments }] = await Promise.all([
    db.from("v_loan_portfolio").select("*").eq("id", loanId).maybeSingle(),
    db.from("installments").select("*").eq("loan_id", loanId).order("installment_number"),
    db.from("payments").select("*").eq("loan_id", loanId).eq("voided", false).order("paid_at"),
  ]);
  if (!loan) return null;
  return { loan, installments: installments ?? [], payments: payments ?? [] };
}

export async function loadSettings(db: Db): Promise<SystemSettings | null> {
  const { data } = await db.from("system_settings").select("*").eq("id", 1).maybeSingle();
  return data;
}
