import Link from "next/link";
import { ChevronLeft, ChevronRight, ScrollText } from "lucide-react";
import { getSettings, requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime, startOfDayUTC } from "@/lib/formatters";
import {
  AUDIT_ACTIONS, AUDIT_TABLES, addDaysISO, auditRecordHref, auditRecordLabel, diffRecord, formatAuditValue,
  type AuditAction, type AuditTable,
} from "@/lib/audit";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import { Alert, EmptyState, PageHeader } from "@/components/ui/misc";
import { Table, TableWrap, Td, Th, Tr } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export const metadata = { title: "Auditoría" };

const PAGE_SIZE = 50;
const MAX_PAGE = 1000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACTION_TONE: Record<AuditAction, "ok" | "brand" | "danger"> = { insert: "ok", update: "brand", delete: "danger" };

type Search = { tabla?: string; accion?: string; usuario?: string; registro?: string; desde?: string; hasta?: string; p?: string };

/** Lee y valida los filtros: cualquier valor fuera de lo permitido se ignora. */
function parseFilters(sp: Search) {
  const tabla = sp.tabla && sp.tabla in AUDIT_TABLES ? (sp.tabla as AuditTable) : undefined;
  const accion = sp.accion && sp.accion in AUDIT_ACTIONS ? (sp.accion as AuditAction) : undefined;
  const usuario = sp.usuario && UUID_RE.test(sp.usuario) ? sp.usuario : undefined;
  const registro = sp.registro && /^[\w-]{1,64}$/.test(sp.registro.trim()) ? sp.registro.trim() : undefined;
  const desde = sp.desde && DATE_RE.test(sp.desde) ? sp.desde : undefined;
  const hasta = sp.hasta && DATE_RE.test(sp.hasta) ? sp.hasta : undefined;
  const page = Math.min(MAX_PAGE, Math.max(1, Number.parseInt(sp.p ?? "1", 10) || 1));
  return { tabla, accion, usuario, registro, desde, hasta, page };
}

/** Registro inmutable de cambios: quién, cuándo y qué cambió. Solo administradores. */
export default async function AuditoriaPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requireProfile(["admin"]);
  const settings = await getSettings();
  const f = parseFilters(await searchParams);
  const supabase = await createClient();

  let query = supabase.from("audit_logs").select("*");
  if (f.tabla) query = query.eq("table_name", f.tabla);
  if (f.accion) query = query.eq("action", f.accion);
  if (f.usuario) query = query.eq("actor_id", f.usuario);
  if (f.registro) query = query.eq("record_id", f.registro);
  if (f.desde) query = query.gte("created_at", startOfDayUTC(f.desde, settings.timezone));
  if (f.hasta) query = query.lt("created_at", startOfDayUTC(addDaysISO(f.hasta, 1), settings.timezone));
  const offset = (f.page - 1) * PAGE_SIZE;
  // Se pide una fila extra para saber si hay página siguiente sin contar toda la tabla
  const [{ data: logs, error }, { data: people }] = await Promise.all([
    query.order("created_at", { ascending: false }).order("id", { ascending: false }).range(offset, offset + PAGE_SIZE),
    supabase.from("profiles").select("id, full_name").order("full_name"),
  ]);

  const rows = (logs ?? []).slice(0, PAGE_SIZE);
  const hasNext = (logs ?? []).length > PAGE_SIZE;
  const names = Object.fromEntries((people ?? []).map((p) => [p.id, p.full_name || "Sin nombre"]));
  const keep = { tabla: f.tabla, accion: f.accion, usuario: f.usuario, registro: f.registro, desde: f.desde, hasta: f.hasta };
  const pageHref = (p: number) => {
    const qs = new URLSearchParams(Object.entries({ ...keep, p: String(p) }).filter(([, v]) => v) as [string, string][]);
    return `/auditoria?${qs.toString()}`;
  };
  const filtered = Object.values(keep).some(Boolean);

  return (
    <>
      <PageHeader title="Auditoría" description="Registro inmutable de cambios en clientes, préstamos, pagos, caja, usuarios y ajustes." />

      <Card className="mb-4 p-4">
        <form method="get" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <Field label="Módulo" htmlFor="tabla">
            <Select id="tabla" name="tabla" defaultValue={f.tabla ?? ""}>
              <option value="">Todos</option>
              {Object.entries(AUDIT_TABLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
          </Field>
          <Field label="Acción" htmlFor="accion">
            <Select id="accion" name="accion" defaultValue={f.accion ?? ""}>
              <option value="">Todas</option>
              {Object.entries(AUDIT_ACTIONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
          </Field>
          <Field label="Usuario" htmlFor="usuario">
            <Select id="usuario" name="usuario" defaultValue={f.usuario ?? ""}>
              <option value="">Todos</option>
              {(people ?? []).map((p) => <option key={p.id} value={p.id}>{p.full_name || "Sin nombre"}</option>)}
            </Select>
          </Field>
          <Field label="Desde" htmlFor="desde"><Input id="desde" name="desde" type="date" defaultValue={f.desde} /></Field>
          <Field label="Hasta" htmlFor="hasta"><Input id="hasta" name="hasta" type="date" defaultValue={f.hasta} /></Field>
          <Field label="ID de registro" htmlFor="registro">
            <Input id="registro" name="registro" defaultValue={f.registro} placeholder="UUID" maxLength={64} />
          </Field>
          <div className="flex gap-2 sm:col-span-2 lg:col-span-6">
            <button type="submit" className={buttonVariants()}>Filtrar</button>
            {filtered && <Link href="/auditoria" className={buttonVariants({ variant: "ghost" })}>Limpiar filtros</Link>}
          </div>
        </form>
      </Card>

      {error ? (
        <Alert tone="danger">No se pudo leer la auditoría: {error.message}</Alert>
      ) : rows.length === 0 ? (
        <Card><EmptyState icon={ScrollText} title="Sin registros" description={filtered ? "Ningún cambio coincide con los filtros." : "Aún no hay cambios registrados."} /></Card>
      ) : (
        <Card>
          <TableWrap>
            <Table>
              <thead><tr><Th>Fecha</Th><Th>Usuario</Th><Th>Módulo</Th><Th>Acción</Th><Th>Registro</Th><Th>Cambios</Th></tr></thead>
              <tbody>
                {rows.map((log) => {
                  const action = log.action as AuditAction;
                  const values = log.new_values ?? log.old_values;
                  const changes = diffRecord(log.old_values, log.new_values);
                  const href = auditRecordHref(log.table_name, log.record_id, values);
                  const label = auditRecordLabel(log.record_id, values);
                  return (
                    <Tr key={log.id} className="align-top">
                      <Td className="whitespace-nowrap tabular-nums text-ink-muted">{formatDateTime(log.created_at, settings.timezone)}</Td>
                      <Td className="whitespace-nowrap">{log.actor_id ? names[log.actor_id] ?? "Usuario eliminado" : <span className="text-ink-muted">Sistema</span>}</Td>
                      <Td>{AUDIT_TABLES[log.table_name as AuditTable] ?? log.table_name}</Td>
                      <Td><Badge tone={ACTION_TONE[action] ?? "neutral"}>{AUDIT_ACTIONS[action] ?? log.action}</Badge></Td>
                      <Td className="whitespace-nowrap font-medium tabular-nums">
                        {href ? <Link href={href} className="hover:text-brand">{label}</Link> : label}
                      </Td>
                      <Td className="min-w-[260px]">
                        {changes.length === 0 ? <span className="text-ink-muted">Sin cambios de datos</span> : (
                          <details>
                            <summary className="cursor-pointer text-sm">
                              {action === "update"
                                ? `${changes.length} campo${changes.length === 1 ? "" : "s"}: ${changes.slice(0, 3).map((c) => c.field).join(", ")}${changes.length > 3 ? "…" : ""}`
                                : `${changes.length} campos`}
                            </summary>
                            <dl className="mt-2 space-y-1 rounded-md bg-canvas p-2 text-xs">
                              {changes.map((c) => (
                                <div key={c.field} className="grid grid-cols-[minmax(0,10rem)_1fr] gap-2">
                                  <dt className="truncate font-mono text-ink-muted" title={c.field}>{c.field}</dt>
                                  <dd className="break-words">
                                    {action === "update" ? (
                                      <><span className="text-danger line-through">{formatAuditValue(c.before)}</span>{" → "}<span className="text-ok">{formatAuditValue(c.after)}</span></>
                                    ) : (
                                      <span className={cn(action === "delete" && "text-danger")}>{formatAuditValue(action === "delete" ? c.before : c.after)}</span>
                                    )}
                                  </dd>
                                </div>
                              ))}
                            </dl>
                          </details>
                        )}
                      </Td>
                    </Tr>
                  );
                })}
              </tbody>
            </Table>
          </TableWrap>
          <div className="flex items-center justify-between border-t border-sand-border px-4 py-3 text-sm">
            <span className="text-ink-muted">Página {f.page} · {rows.length} registro{rows.length === 1 ? "" : "s"}</span>
            <div className="flex gap-2">
              {f.page > 1 && <Link href={pageHref(f.page - 1)} className={buttonVariants({ variant: "secondary", size: "sm" })}><ChevronLeft strokeWidth={1.75} />Anterior</Link>}
              {hasNext && f.page < MAX_PAGE && <Link href={pageHref(f.page + 1)} className={buttonVariants({ variant: "secondary", size: "sm" })}>Siguiente<ChevronRight strokeWidth={1.75} /></Link>}
            </div>
          </div>
        </Card>
      )}
    </>
  );
}
