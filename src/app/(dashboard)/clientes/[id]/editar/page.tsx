import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/misc";
import { ClientForm } from "@/components/clients/client-form";

export default async function EditarClientePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireProfile(["admin", "cajero"]);
  const supabase = await createClient();
  const [{ data: client }, { data: collectors }] = await Promise.all([
    supabase.from("clients").select("*").eq("id", id).single(),
    supabase.from("profiles").select("id, full_name").eq("role", "cobrador").eq("active", true).order("full_name"),
  ]);
  if (!client) notFound();
  return (
    <>
      <PageHeader title={`Editar · ${client.first_name} ${client.last_name}`} />
      <ClientForm client={client} collectors={collectors ?? []} />
    </>
  );
}
