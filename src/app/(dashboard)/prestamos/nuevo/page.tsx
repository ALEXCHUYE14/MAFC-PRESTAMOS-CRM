import { requireProfile, getSettings } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { todayISO } from "@/lib/formatters";
import { PageHeader } from "@/components/ui/misc";
import { LoanSimulator } from "@/components/loans/loan-simulator";
import type { ClientOption } from "../../clientes/actions";

export const metadata = { title: "Nuevo préstamo" };

export default async function NuevoPrestamoPage({ searchParams }: { searchParams: Promise<{ cliente?: string; refinanciar?: string }> }) {
  const sp = await searchParams;
  await requireProfile(["admin", "cajero"]);
  const settings = await getSettings();
  const supabase = await createClient();
  const [{ data: holidays }, { data: collectors }, { data: c }] = await Promise.all([
    supabase.from("holidays").select("holiday_date"),
    supabase.from("profiles").select("id, full_name").eq("role", "cobrador").eq("active", true).order("full_name"),
    sp.cliente ? supabase.from("clients").select("*").eq("id", sp.cliente).single() : Promise.resolve({ data: null }),
  ]);
  const initialClient: ClientOption | null = c ? {
    id: c.id, name: `${c.first_name} ${c.last_name}`, document: c.document_number, status: c.status,
    hasGuarantor: Boolean(c.guarantor_name), collectorId: c.assigned_collector_id, score: c.credit_score,
  } : null;

  return (
    <>
      <PageHeader title={sp.refinanciar ? "Refinanciar préstamo" : "Nuevo préstamo"}
        description="El cronograma se calcula en vivo y se guarda de forma atómica junto con el egreso de caja." />
      <LoanSimulator settings={settings} today={todayISO(settings.timezone)} holidays={(holidays ?? []).map((h) => h.holiday_date)}
        collectors={collectors ?? []} initialClient={initialClient} initialRefinanceId={sp.refinanciar ?? null} />
    </>
  );
}
