import { notFound } from "next/navigation";
import { getSettings, requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { loadStatement } from "@/lib/documents";
import { todayISO } from "@/lib/formatters";
import { PrintControls } from "@/components/loans/print-controls";
import { AccountStatement } from "@/components/documents/account-statement";

export const metadata = { title: "Estado de cuenta" };

/** Estado de cuenta A4 imprimible / Guardar como PDF (vista interna, requiere sesión). */
export default async function EstadoCuentaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireProfile();
  const s = await getSettings();
  const supabase = await createClient();
  const data = await loadStatement(supabase, id);
  if (!data) notFound();

  return (
    <div className="min-h-dvh bg-canvas py-6 print:bg-white print:py-0">
      <PrintControls />
      <AccountStatement s={s} data={data} today={todayISO(s.timezone)} />
    </div>
  );
}
