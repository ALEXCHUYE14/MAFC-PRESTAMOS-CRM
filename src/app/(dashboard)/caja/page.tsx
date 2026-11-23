import { ArrowDownLeft, ArrowUpRight, Wallet } from "lucide-react";
import { requireProfile, getSettings, can } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime, formatMoney } from "@/lib/formatters";
import { CASH_CATEGORY_LABEL } from "@/lib/constants";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge, toneForStatus } from "@/components/ui/badge";
import { EmptyState, PageHeader, Stat } from "@/components/ui/misc";
import { Table, TableWrap, Td, Th, Tr } from "@/components/ui/table";
import { CloseCashForm, ForceCloseButton, MovementForm, OpenCashForm } from "@/components/cash/cash-forms";

export const metadata = { title: "Caja" };

export default async function CajaPage() {
  const profile = await requireProfile();
  const settings = await getSettings();
  const supabase = await createClient();
  const m = (v: number) => formatMoney(v, settings);

  const { data: sessionId } = await supabase.rpc("current_cash_session");
  const [{ data: session }, { data: movements }, { data: expected }, { data: history }, { data: people }] = await Promise.all([
    sessionId ? supabase.from("cash_sessions").select("*").eq("id", sessionId).single() : Promise.resolve({ data: null }),
    sessionId ? supabase.from("cash_movements").select("*").eq("cash_session_id", sessionId).order("created_at", { ascending: false }) : Promise.resolve({ data: [] }),
    sessionId ? supabase.rpc("cash_session_expected", { p_session_id: sessionId }) : Promise.resolve({ data: 0 }),
    supabase.from("cash_sessions").select("*").order("opened_at", { ascending: false }).limit(20),
    supabase.from("profiles").select("id, full_name"),
  ]);
  const names = Object.fromEntries((people ?? []).map((p) => [p.id, p.full_name]));
  const mv = movements ?? [];
  const ingresos = mv.filter((x) => x.movement_type === "ingreso").reduce((a, x) => a + x.amount, 0);
  const egresos = mv.filter((x) => x.movement_type === "egreso").reduce((a, x) => a + x.amount, 0);
  const openOthers = profile.role === "admin" ? (history ?? []).filter((s) => s.status === "abierta" && s.id !== sessionId) : [];
  const expectedByOther = await Promise.all(openOthers.map(async (s) => (await supabase.rpc("cash_session_expected", { p_session_id: s.id })).data ?? 0));

  return (
    <>
      <PageHeader title="Caja y arqueo" description={session ? `Abierta ${formatDateTime(session.opened_at, settings.timezone)} · ${session.branch}` : "Sin caja abierta"} />

      {!session ? (
        <Card>
          <CardHeader><div><CardTitle>Apertura de caja</CardTitle>
            <CardDescription>{settings.require_open_cash ? "Es obligatorio abrir caja para cobrar o desembolsar." : "Recomendado para cuadrar al cierre."}</CardDescription></div></CardHeader>
          <CardContent><OpenCashForm /></CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            <Card>
              <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Stat label="Apertura" value={m(session.opening_amount)} />
                <Stat label="Ingresos" value={m(ingresos)} tone="ok" />
                <Stat label="Egresos" value={m(egresos)} tone="danger" />
                <Stat label="Saldo esperado" value={m(expected ?? 0)} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Movimientos de la sesión</CardTitle></CardHeader>
              {mv.length ? (
                <TableWrap>
                  <Table>
                    <thead><tr><Th>Hora</Th><Th>Tipo</Th><Th>Categoría</Th><Th>Descripción</Th><Th align="right">Monto</Th></tr></thead>
                    <tbody>
                      {mv.map((x) => (
                        <Tr key={x.id}>
                          <Td className="tabular-nums text-ink-muted">{formatDateTime(x.created_at, settings.timezone).split(" ").pop()}</Td>
                          <Td>{x.movement_type === "ingreso"
                            ? <span className="inline-flex items-center gap-1 text-ok"><ArrowDownLeft strokeWidth={1.75} className="size-4" />Ingreso</span>
                            : <span className="inline-flex items-center gap-1 text-danger"><ArrowUpRight strokeWidth={1.75} className="size-4" />Egreso</span>}</Td>
                          <Td>{CASH_CATEGORY_LABEL[x.category]}</Td>
                          <Td className="max-w-xs truncate text-ink-muted">{x.description}</Td>
                          <Td align="right" className={x.movement_type === "ingreso" ? "text-ok" : "text-danger"}>{x.movement_type === "ingreso" ? "+" : "−"}{m(x.amount)}</Td>
                        </Tr>
                      ))}
                    </tbody>
                  </Table>
                </TableWrap>
              ) : <EmptyState icon={Wallet} title="Sin movimientos todavía" />}
            </Card>
          </div>
          <div className="space-y-4">
            {can(profile.role, "cash_manual") && (
              <Card>
                <CardHeader><div><CardTitle>Movimiento manual</CardTitle><CardDescription>Gastos, inyecciones de capital o retiros</CardDescription></div></CardHeader>
                <CardContent><MovementForm isAdmin={profile.role === "admin"} /></CardContent>
              </Card>
            )}
            <Card>
              <CardHeader><div><CardTitle>Cierre y arqueo</CardTitle><CardDescription>Cuente el efectivo físico</CardDescription></div></CardHeader>
              <CardContent><CloseCashForm expected={expected ?? 0} /></CardContent>
            </Card>
          </div>
        </div>
      )}

      {openOthers.length > 0 && (
        <Card className="mt-4">
          <CardHeader><div><CardTitle>Cajas abiertas del equipo</CardTitle><CardDescription>Cierre global por administrador</CardDescription></div></CardHeader>
          <TableWrap>
            <Table>
              <thead><tr><Th>Usuario</Th><Th>Sucursal</Th><Th>Apertura</Th><Th align="right">Esperado</Th><Th /></tr></thead>
              <tbody>
                {openOthers.map((s, i) => (
                  <Tr key={s.id}>
                    <Td>{names[s.user_id] ?? "—"}</Td><Td>{s.branch}</Td>
                    <Td className="tabular-nums">{formatDateTime(s.opened_at, settings.timezone)}</Td>
                    <Td align="right">{m(expectedByOther[i])}</Td>
                    <Td align="right"><ForceCloseButton sessionId={s.id} expected={expectedByOther[i]} /></Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        </Card>
      )}

      <Card className="mt-4">
        <CardHeader><CardTitle>Historial de cierres</CardTitle></CardHeader>
        <TableWrap>
          <Table>
            <thead><tr><Th>Usuario</Th><Th>Apertura</Th><Th>Cierre</Th><Th align="right">Fondo</Th><Th align="right">Esperado</Th><Th align="right">Contado</Th><Th align="right">Diferencia</Th><Th>Estado</Th></tr></thead>
            <tbody>
              {(history ?? []).map((s) => (
                <Tr key={s.id}>
                  <Td>{names[s.user_id] ?? "—"}</Td>
                  <Td className="tabular-nums text-ink-muted">{formatDateTime(s.opened_at, settings.timezone)}</Td>
                  <Td className="tabular-nums text-ink-muted">{formatDateTime(s.closed_at, settings.timezone)}</Td>
                  <Td align="right">{m(s.opening_amount)}</Td>
                  <Td align="right">{s.expected_amount != null ? m(s.expected_amount) : "—"}</Td>
                  <Td align="right">{s.counted_amount != null ? m(s.counted_amount) : "—"}</Td>
                  <Td align="right" className={s.difference && s.difference < 0 ? "text-danger" : s.difference && s.difference > 0 ? "text-warn" : ""}>{s.difference != null ? m(s.difference) : "—"}</Td>
                  <Td><Badge tone={toneForStatus(s.status)}>{s.status}</Badge></Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </TableWrap>
      </Card>
    </>
  );
}
