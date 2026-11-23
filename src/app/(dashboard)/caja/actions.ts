"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { errorMessage, str, toNumber, type ActionResult } from "@/lib/utils";
import type { CashMovementCategory, CashMovementType } from "@/types/database";

export async function openCash(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  await requireProfile();
  const supabase = await createClient();
  const { error } = await supabase.rpc("open_cash_session", {
    p_opening_amount: toNumber(fd.get("opening_amount")), p_branch: str(fd.get("branch")) ?? "Principal",
  });
  if (error) return { ok: false, error: errorMessage(error) };
  revalidatePath("/caja"); revalidatePath("/", "layout");
  return { ok: true, data: undefined };
}

export async function addMovement(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  await requireProfile(["admin", "cajero"]);
  const supabase = await createClient();
  const amount = toNumber(fd.get("amount"));
  if (amount <= 0) return { ok: false, error: "Monto inválido" };
  const { error } = await supabase.rpc("add_cash_movement", {
    p_type: String(fd.get("movement_type")) as CashMovementType,
    p_category: String(fd.get("category")) as CashMovementCategory,
    p_amount: amount,
    p_description: str(fd.get("description")) ?? "",
  });
  if (error) return { ok: false, error: errorMessage(error) };
  revalidatePath("/caja");
  return { ok: true, data: undefined, message: "Movimiento registrado" };
}

export async function closeCash(_: ActionResult<{ expected: number; counted: number; difference: number }> | null, fd: FormData)
  : Promise<ActionResult<{ expected: number; counted: number; difference: number }>> {
  await requireProfile();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("close_cash_session", {
    p_counted_amount: toNumber(fd.get("counted_amount")), p_notes: str(fd.get("notes")),
  });
  if (error || !data) return { ok: false, error: errorMessage(error) };
  revalidatePath("/caja"); revalidatePath("/", "layout");
  return { ok: true, data };
}

export async function forceClose(sessionId: string, counted: number): Promise<ActionResult> {
  await requireProfile(["admin"]);
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_close_cash_session", { p_session_id: sessionId, p_counted_amount: counted });
  if (error) return { ok: false, error: errorMessage(error) };
  revalidatePath("/caja");
  return { ok: true, data: undefined };
}
