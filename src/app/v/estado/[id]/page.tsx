import { notFound } from "next/navigation";
import { verifySignedLink } from "@/lib/signed-links";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadSettings, loadStatement } from "@/lib/documents";
import { todayISO } from "@/lib/formatters";
import { PrintControls } from "@/components/loans/print-controls";
import { AccountStatement } from "@/components/documents/account-statement";
import { LinkStatus, PUBLIC_DOC_METADATA } from "../../link-status";

export const dynamic = "force-dynamic";
export const metadata = { title: "Estado de cuenta", ...PUBLIC_DOC_METADATA };

/** Estado de cuenta público para el cliente. Solo accesible con un enlace firmado vigente. */
export default async function PublicStatementPage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ e?: string; t?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const check = verifySignedLink("estado", id, sp.e, sp.t);
  if (check !== "ok") return <LinkStatus expired={check === "expired"} />;

  // Firma válida: recién aquí se usa service role (el visitante no tiene sesión)
  let db;
  try { db = createAdminClient(); } catch (e) {
    console.error("[enlace público] servicio no configurado:", e instanceof Error ? e.message : e);
    return <LinkStatus expired={false} unavailable />;
  }
  const [s, data] = await Promise.all([loadSettings(db), loadStatement(db, id)]);
  if (!s || !data) notFound();

  return (
    <div className="min-h-dvh bg-canvas py-6 print:bg-white print:py-0">
      <PrintControls />
      <AccountStatement s={s} data={data} today={todayISO(s.timezone)} publicView />
    </div>
  );
}
