"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireProfile } from "@/lib/auth";
import { errorMessage, str, toNumber, type ActionResult } from "@/lib/utils";
import type { FlatRateMode, InterestType, LateFeeType, LoanFrequency, PaymentComponentKey, SystemSettings, UserRole } from "@/types/database";

async function updateSettings(patch: Partial<SystemSettings>): Promise<ActionResult> {
  await requireProfile(["admin"]);
  const supabase = await createClient();
  const { error } = await supabase.from("system_settings").update(patch).eq("id", 1);
  if (error) return { ok: false, error: errorMessage(error) };
  revalidatePath("/", "layout");
  return { ok: true, data: undefined, message: "Ajustes guardados" };
}

export async function saveBusiness(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const width = Number(fd.get("receipt_width"));
  return updateSettings({
    business_name: str(fd.get("business_name")) ?? "Mi Financiera",
    legal_name: str(fd.get("legal_name")), tax_id: str(fd.get("tax_id")), address: str(fd.get("address")),
    phone: str(fd.get("phone")), receipt_footer: str(fd.get("receipt_footer")),
    receipt_width: width === 58 ? 58 : 80, logo_url: str(fd.get("logo_url")),
  });
}

export async function saveFinancial(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const order = [fd.get("order_1"), fd.get("order_2"), fd.get("order_3")].map(String) as PaymentComponentKey[];
  if (new Set(order).size !== 3) return { ok: false, error: "El orden de imputación no puede repetir componentes." };
  const decimals = toNumber(fd.get("currency_decimals"), 2);
  const guarantor = str(fd.get("require_guarantor_from"));
  const cap = str(fd.get("default_late_fee_cap"));
  return updateSettings({
    currency_code: (str(fd.get("currency_code")) ?? "PEN").toUpperCase(),
    currency_symbol: str(fd.get("currency_symbol")) ?? "S/",
    currency_position: fd.get("currency_position") === "after" ? "after" : "before",
    currency_decimals: Math.min(2, Math.max(0, decimals)),
    phone_country_code: (str(fd.get("phone_country_code")) ?? "51").replace(/\D/g, ""),
    timezone: str(fd.get("timezone")) ?? "America/Lima",
    default_interest_rate: toNumber(fd.get("default_interest_rate")),
    default_interest_type: String(fd.get("default_interest_type")) as InterestType,
    default_flat_rate_mode: String(fd.get("default_flat_rate_mode")) as FlatRateMode,
    default_frequency: String(fd.get("default_frequency")) as LoanFrequency,
    default_term_count: Math.max(1, Math.round(toNumber(fd.get("default_term_count"), 24))),
    default_grace_days: Math.max(0, Math.round(toNumber(fd.get("default_grace_days")))),
    default_late_fee_type: String(fd.get("default_late_fee_type")) as LateFeeType,
    default_late_fee_value: toNumber(fd.get("default_late_fee_value")),
    default_late_fee_cap: cap ? Number(cap) : null,
    exclude_sundays_daily: fd.get("exclude_sundays_daily") === "on",
    allow_partial_payments: fd.get("allow_partial_payments") === "on",
    allow_late_fee_waiver: fd.get("allow_late_fee_waiver") === "on",
    require_open_cash: fd.get("require_open_cash") === "on",
    require_guarantor_from: guarantor ? Number(guarantor) : null,
    payment_order: order,
  });
}

export async function saveTemplates(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return updateSettings({
    templates: {
      bienvenida: String(fd.get("bienvenida") ?? ""), recordatorio: String(fd.get("recordatorio") ?? ""),
      mora: String(fd.get("mora") ?? ""), recibo: String(fd.get("recibo") ?? ""),
    },
  });
}

export async function addHoliday(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  await requireProfile(["admin"]);
  const supabase = await createClient();
  const { error } = await supabase.from("holidays").upsert({
    holiday_date: String(fd.get("holiday_date")), description: str(fd.get("description")) ?? "Feriado",
  });
  if (error) return { ok: false, error: errorMessage(error) };
  revalidatePath("/ajustes");
  return { ok: true, data: undefined };
}

export async function removeHoliday(date: string): Promise<void> {
  await requireProfile(["admin"]);
  const supabase = await createClient();
  await supabase.from("holidays").delete().eq("holiday_date", date);
  revalidatePath("/ajustes");
}

const userSchema = z.object({
  email: z.string().email("Correo inválido"),
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres"),
  full_name: z.string().min(3, "Ingrese el nombre"),
  role: z.enum(["admin", "cajero", "cobrador"]),
});

export async function createUser(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  await requireProfile(["admin"]);
  const parsed = userSchema.safeParse({
    email: fd.get("email"), password: fd.get("password"), full_name: fd.get("full_name"), role: fd.get("role"),
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.auth.admin.createUser({
      email: parsed.data.email, password: parsed.data.password, email_confirm: true,
      user_metadata: { full_name: parsed.data.full_name, role: parsed.data.role, phone: str(fd.get("phone")) },
    });
    if (error || !data.user) return { ok: false, error: errorMessage(error) };
    // El trigger crea el perfil como cobrador inactivo; aquí el admin fija rol y lo activa.
    const { error: profileError } = await admin.from("profiles").upsert({
      id: data.user.id, role: parsed.data.role as UserRole, full_name: parsed.data.full_name,
      phone: str(fd.get("phone")), zone: str(fd.get("zone")), active: true,
    });
    if (profileError) {
      // Sin perfil activo el usuario no podría entrar: se revierte la creación.
      await admin.auth.admin.deleteUser(data.user.id);
      return { ok: false, error: errorMessage(profileError) };
    }
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
  revalidatePath("/ajustes");
  return { ok: true, data: undefined, message: "Usuario creado" };
}

export async function updateUser(id: string, patch: { role?: UserRole; active?: boolean; zone?: string | null }): Promise<ActionResult> {
  const me = await requireProfile(["admin"]);
  if (id === me.id && (patch.active === false || (patch.role && patch.role !== "admin")))
    return { ok: false, error: "No puede quitarse a sí mismo el rol de administrador ni desactivarse." };
  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update(patch).eq("id", id);
  if (error) return { ok: false, error: errorMessage(error) };
  if (patch.active === false) {
    try { await createAdminClient().auth.admin.updateUserById(id, { ban_duration: "876000h" }); } catch { /* sin service role */ }
  } else if (patch.active === true) {
    try { await createAdminClient().auth.admin.updateUserById(id, { ban_duration: "none" }); } catch { /* sin service role */ }
  }
  revalidatePath("/ajustes");
  return { ok: true, data: undefined };
}
