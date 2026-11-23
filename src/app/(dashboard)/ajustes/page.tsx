import { Database, Download } from "lucide-react";
import { requireProfile, getSettings } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/formatters";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader, UrlTabs } from "@/components/ui/misc";
import { Table, TableWrap, Td, Th, Tr } from "@/components/ui/table";
import { BusinessForm, FinancialForm, HolidaysCard, TemplatesForm, UsersCard } from "@/components/settings/settings-forms";

export const metadata = { title: "Ajustes" };

const TABLES = ["clients", "loans", "installments", "payments", "collection_notes", "cash_sessions", "cash_movements", "audit_logs"];

function diff(oldV: Record<string, unknown> | null, newV: Record<string, unknown> | null) {
  if (!oldV || !newV) return [];
  return Object.keys(newV).filter((k) => JSON.stringify(oldV[k]) !== JSON.stringify(newV[k]) && !["updated_at"].includes(k))
    .map((k) => ({ k, from: oldV[k], to: newV[k] }));
}

export default async function AjustesPage({ searchParams }: { searchParams: Promise<{ tab?: string; tabla?: string }> }) {
  const sp = await searchParams;
  const me = await requireProfile(["admin"]);
  const s = await getSettings();
  const supabase = await createClient();
  const tab = sp.tab ?? "negocio";

  const [{ data: users }, { data: holidays }, { data: logs }] = await Promise.all([
    tab === "usuarios" || tab === "auditoria" ? supabase.from("profiles").select("*").order("full_name") : Promise.resolve({ data: [] }),
    tab === "financiero" ? supabase.from("holidays").select("*").order("holiday_date") : Promise.resolve({ data: [] }),
    tab === "auditoria"
      ? (sp.tabla ? supabase.from("audit_logs").select("*").eq("table_name", sp.tabla) : supabase.from("audit_logs").select("*"))
          .order("created_at", { ascending: false }).limit(150)
      : Promise.resolve({ data: [] }),
  ]);
  const names = Object.fromEntries((users ?? []).map((u) => [u.id, u.full_name]));

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
            <CardHeader>
              <div><CardTitle>Logs de auditoría</CardTitle><CardDescription>Registro inmutable: quién creó, editó o anuló, con valores anteriores y nuevos</CardDescription></div>
              <form className="flex gap-2"><input type="hidden" name="tab" value="auditoria" />
                <select name="tabla" defaultValue={sp.tabla ?? ""} className="h-9 rounded-md border border-sand-border bg-surface px-2 text-sm">
                  <option value="">Todas las tablas</option>
                  {["loans", "payments", "clients", "system_settings", "profiles", "cash_sessions", "holidays"].map((t) => <option key={t}>{t}</option>)}
                </select>
                <button className={buttonVariants({ variant: "secondary", size: "sm" })}>Filtrar</button>
              </form>
            </CardHeader>
            <TableWrap><Table>
              <thead><tr><Th>Fecha</Th><Th>Usuario</Th><Th>Tabla</Th><Th>Acción</Th><Th>Registro</Th><Th>Cambios</Th></tr></thead>
              <tbody>{(logs ?? []).map((l) => {
                const changes = diff(l.old_values, l.new_values);
                const ref = (l.new_values ?? l.old_values) as Record<string, unknown> | null;
                return (
                  <Tr key={l.id} className="align-top">
                    <Td className="tabular-nums text-ink-muted">{formatDateTime(l.created_at, s.timezone)}</Td>
                    <Td>{names[l.actor_id ?? ""] ?? "Sistema"}</Td>
                    <Td className="font-mono text-xs">{l.table_name}</Td>
                    <Td><Badge tone={l.action === "delete" ? "danger" : l.action === "insert" ? "ok" : "warn"}>{l.action}</Badge></Td>
                    <Td className="tabular-nums">{String(ref?.code ?? ref?.document_number ?? l.record_id?.slice(0, 8) ?? "")}</Td>
                    <Td className="whitespace-normal text-xs">
                      {l.action === "update" ? (changes.length ? changes.slice(0, 6).map((c) => (
                        <div key={c.k}><span className="font-mono text-ink-muted">{c.k}</span>: <span className="text-danger line-through">{JSON.stringify(c.from)}</span> → <span className="text-ok">{JSON.stringify(c.to)}</span></div>
                      )) : <span className="text-ink-faint">Sin cambios relevantes</span>) : <span className="text-ink-faint">{l.action === "insert" ? "Creación" : "Eliminación"}</span>}
                    </Td>
                  </Tr>
                );
              })}</tbody>
            </Table></TableWrap>
          </Card>
        </div>
      )}
    </>
  );
}
