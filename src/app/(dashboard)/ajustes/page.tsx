import Link from "next/link";
import { Database, Download, ScrollText } from "lucide-react";
import { requireProfile, getSettings } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { PageHeader, UrlTabs } from "@/components/ui/misc";
import { BusinessForm, FinancialForm, HolidaysCard, TemplatesForm, UsersCard } from "@/components/settings/settings-forms";

export const metadata = { title: "Ajustes" };

const TABLES = ["clients", "loans", "installments", "payments", "collection_notes", "cash_sessions", "cash_movements", "audit_logs"];

export default async function AjustesPage({ searchParams }: { searchParams: Promise<{ tab?: string; tabla?: string }> }) {
  const sp = await searchParams;
  const me = await requireProfile(["admin"]);
  const s = await getSettings();
  const supabase = await createClient();
  const tab = sp.tab ?? "negocio";

  // Solo se consulta lo que necesita la pestaña abierta
  const [{ data: users }, { data: holidays }] = await Promise.all([
    tab === "usuarios" ? supabase.from("profiles").select("*").order("full_name") : Promise.resolve({ data: [] }),
    tab === "financiero" ? supabase.from("holidays").select("*").order("holiday_date") : Promise.resolve({ data: [] }),
  ]);

  return (
    <>
      <PageHeader title="Ajustes del sistema" description="Configuración sin código. Los cambios aplican de inmediato." />
      <UrlTabs basePath="/ajustes" active={tab} tabs={[
        { key: "negocio", label: "Negocio y ticket" }, { key: "financiero", label: "Parámetros financieros" },
        { key: "usuarios", label: "Usuarios y roles" }, { key: "plantillas", label: "Plantillas WhatsApp" },
        { key: "auditoria", label: "Auditoría y respaldo" },
      ]} />

      {tab === "negocio" && <BusinessForm s={s} />}
      {tab === "financiero" && <div className="space-y-4"><FinancialForm s={s} /><HolidaysCard holidays={holidays ?? []} /></div>}
      {tab === "usuarios" && <UsersCard users={users ?? []} meId={me.id} />}
      {tab === "plantillas" && <TemplatesForm templates={s.templates} businessName={s.business_name} />}
      {tab === "auditoria" && (
        <div className="space-y-4">
          <Card>
            <CardHeader><div><CardTitle className="flex items-center gap-2"><Database strokeWidth={1.75} className="size-4" />Respaldo</CardTitle>
              <CardDescription>Exportación completa de la base de datos</CardDescription></div></CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <a href="/api/export/backup?format=json" className={buttonVariants()}><Download strokeWidth={1.75} />Respaldo completo JSON</a>
              {TABLES.map((t) => <a key={t} href={`/api/export/backup?format=csv&table=${t}`} className={buttonVariants({ variant: "secondary", size: "sm" })}>{t}.csv</a>)}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><div><CardTitle className="flex items-center gap-2"><ScrollText strokeWidth={1.75} className="size-4" />Registro de auditoría</CardTitle>
              <CardDescription>Quién creó, modificó o anuló cada registro, con filtros por módulo, usuario y fechas</CardDescription></div></CardHeader>
            <CardContent><Link href="/auditoria" className={buttonVariants({ variant: "secondary" })}>Abrir auditoría</Link></CardContent>
          </Card>
        </div>
      )}
    </>
  );
}
