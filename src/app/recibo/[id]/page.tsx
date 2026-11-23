import { notFound } from "next/navigation";
import { getSettings, requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { loadReceipt } from "@/lib/documents";
import { signedUrl } from "@/lib/signed-links";
import { formatMoney, renderTemplate, whatsappLink } from "@/lib/formatters";
import { PrintControls } from "@/components/loans/print-controls";
import { ReceiptTicket } from "@/components/documents/receipt-ticket";

export const metadata = { title: "Recibo" };

/** Ticket para impresora térmica 58/80 mm (vista interna, requiere sesión). */
export default async function ReciboPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ print?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  await requireProfile();
  const s = await getSettings();
  const supabase = await createClient();
  const data = await loadReceipt(supabase, id);
  if (!data) notFound();
  const p = data.payment;

  // Enlace público firmado: el cliente lo abre sin tener cuenta en el sistema
  const url = p.voided ? "" : await signedUrl("recibo", p.id);
  const msg = renderTemplate(s.templates.recibo, {
    cliente: p.client_name.split(" ")[0], negocio: s.business_name, saldo_total: formatMoney(data.balanceDue, s), link_recibo: url,
  });

  return (
    <div className="min-h-dvh bg-canvas py-6 print:bg-white print:py-0">
      <PrintControls auto={sp.print === "1"} shareUrl={p.voided ? undefined : whatsappLink(p.phone, msg, s.phone_country_code)} shareText="Enviar por WhatsApp" />
      <ReceiptTicket s={s} data={data} />
    </div>
  );
}
