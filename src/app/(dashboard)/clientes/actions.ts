"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { errorMessage, str, type ActionResult } from "@/lib/utils";
import type { ContactResult, ClientReference } from "@/types/database";

const clientSchema = z.object({
  document_type: z.enum(["DNI", "RUC", "CE", "CEDULA", "PASAPORTE", "OTRO"]),
  document_number: z.string().trim().min(6, "Documento inválido").max(20),
  first_name: z.string().trim().min(2, "Ingrese nombres"),
  last_name: z.string().trim().min(2, "Ingrese apellidos"),
  phone: z.string().trim().regex(/^[0-9+\s-]{7,16}$/, "Teléfono inválido"),
  address: z.string().trim().min(4, "Ingrese la dirección"),
});

function readClient(fd: FormData) {
  const refs: ClientReference[] = [];
  for (let i = 0; i < 3; i++) {
    const name = str(fd.get(`ref_name_${i}`));
    const phone = str(fd.get(`ref_phone_${i}`));
    if (name && phone) refs.push({ name, phone, relationship: str(fd.get(`ref_rel_${i}`)) ?? undefined });
  }
  const income = str(fd.get("monthly_income"));
  return {
    document_type: String(fd.get("document_type") ?? "DNI"),
    document_number: String(fd.get("document_number") ?? ""),
    first_name: String(fd.get("first_name") ?? ""),
    last_name: String(fd.get("last_name") ?? ""),
    phone: String(fd.get("phone") ?? ""),
    phone_secondary: str(fd.get("phone_secondary")),
    email: str(fd.get("email")),
    address: String(fd.get("address") ?? ""),
    address_reference: str(fd.get("address_reference")),
    zone: str(fd.get("zone")),
    occupation: str(fd.get("occupation")),
    business_name: str(fd.get("business_name")),
    monthly_income: income ? Number(income) : null,
    guarantor_name: str(fd.get("guarantor_name")),
    guarantor_document: str(fd.get("guarantor_document")),
    guarantor_phone: str(fd.get("guarantor_phone")),
    guarantor_address: str(fd.get("guarantor_address")),
    guarantor_relationship: str(fd.get("guarantor_relationship")),
    references_json: refs,
    assigned_collector_id: str(fd.get("assigned_collector_id")),
    notes: str(fd.get("notes")),
  };
}

export async function saveClient(_: ActionResult<{ id: string }> | null, fd: FormData): Promise<ActionResult<{ id: string }>> {
  await requireProfile(["admin", "cajero"]);
  const data = readClient(fd);
  const parsed = clientSchema.safeParse(data);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  const supabase = await createClient();
  const id = str(fd.get("id"));
  const payload = { ...data, document_type: parsed.data.document_type };
  const res = id
    ? await supabase.from("clients").update(payload).eq("id", id).select("id").single()
    : await supabase.from("clients").insert(payload).select("id").single();
  if (res.error) {
    if (res.error.code === "23505") return { ok: false, error: "Ya existe un cliente con ese documento." };
    return { ok: false, error: errorMessage(res.error) };
  }
  revalidatePath("/clientes");
  return { ok: true, data: { id: res.data.id }, message: "Cliente guardado" };
}

export async function setClientStatus(clientId: string, status: "activo" | "inactivo" | "bloqueado"): Promise<ActionResult> {
  await requireProfile(["admin", "cajero"]);
  const supabase = await createClient();
  const { error } = await supabase.from("clients").update({ status }).eq("id", clientId);
  if (error) return { ok: false, error: errorMessage(error) };
  revalidatePath(`/clientes/${clientId}`);
  return { ok: true, data: undefined };
}

export async function registerDocument(clientId: string, kind: string, storagePath: string): Promise<ActionResult> {
  await requireProfile();
  const supabase = await createClient();
  const { error } = await supabase.from("client_documents").insert({
    client_id: clientId, kind: kind as never, storage_path: storagePath,
  });
  if (error) return { ok: false, error: errorMessage(error) };
  revalidatePath(`/clientes/${clientId}`);
  return { ok: true, data: undefined };
}

export async function addCollectionNote(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const profile = await requireProfile();
  const supabase = await createClient();
  const clientId = String(fd.get("client_id") ?? "");
  const amount = str(fd.get("promise_amount"));
  const { error } = await supabase.from("collection_notes").insert({
    client_id: clientId,
    loan_id: str(fd.get("loan_id")),
    contact_result: String(fd.get("contact_result")) as ContactResult,
    promise_date: str(fd.get("promise_date")),
    promise_amount: amount ? Number(amount) : null,
    notes: str(fd.get("notes")),
    created_by: profile.id,
  });
  if (error) return { ok: false, error: errorMessage(error) };
  revalidatePath("/cobranzas");
  revalidatePath(`/clientes/${clientId}`);
  const loanId = str(fd.get("loan_id"));
  if (loanId) revalidatePath(`/prestamos/${loanId}`);
  return { ok: true, data: undefined, message: "Gestión registrada" };
}

export async function recomputeScore(clientId: string): Promise<ActionResult<number>> {
  await requireProfile();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("recompute_client_score", { p_client_id: clientId });
  if (error) return { ok: false, error: errorMessage(error) };
  revalidatePath(`/clientes/${clientId}`);
  return { ok: true, data: data ?? 0 };
}

export interface ClientOption {
  id: string; name: string; document: string; status: string; hasGuarantor: boolean;
  collectorId: string | null; score: number;
}

export async function searchClients(q: string): Promise<ClientOption[]> {
  await requireProfile();
  const supabase = await createClient();
  const term = q.replace(/[%,()]/g, " ").trim();
  let query = supabase.from("clients").select("id, first_name, last_name, document_number, status, guarantor_name, assigned_collector_id, credit_score")
    .order("first_name").limit(12);
  if (term) query = query.or(`first_name.ilike.%${term}%,last_name.ilike.%${term}%,document_number.ilike.%${term}%`);
  const { data } = await query;
  return (data ?? []).map((c) => ({
    id: c.id, name: `${c.first_name} ${c.last_name}`, document: c.document_number, status: c.status,
    hasGuarantor: Boolean(c.guarantor_name), collectorId: c.assigned_collector_id, score: c.credit_score,
  }));
}
