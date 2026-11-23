import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/misc";
import { ClientForm } from "@/components/clients/client-form";

export const metadata = { title: "Nuevo cliente" };

export default async function NuevoClientePage() {
  await requireProfile(["admin", "cajero"]);
  const supabase = await createClient();
  const { data: collectors } = await supabase.from("profiles").select("id, full_name").eq("role", "cobrador").eq("active", true).order("full_name");
  return (
    <>
      <PageHeader title="Nuevo cliente" description="Expediente crediticio: datos, aval y referencias. Los documentos se suben desde el expediente." />
      <ClientForm collectors={collectors ?? []} />
    </>
  );
}
