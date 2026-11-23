import { Download } from "lucide-react";
import { requireProfile, getSettings } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { addDays } from "@/services/finance";
import { formatDate, formatMoney, todayISO } from "@/lib/formatters";
import { CASH_CATEGORY_LABEL } from "@/lib/constants";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input, Field } from "@/components/ui/form";
import { Button, buttonVariants } from "@/components/ui/button";
import { PageHeader, Stat, UrlTabs } from "@/components/ui/misc";
import { Table, TableWrap, Td, Th, Tr } from "@/components/ui/table";

export const metadata = { title: "Reportes" };

export default async function ReportesPage({ searchParams }: { searchParams: Promise<{ tab?: string; from?: string; to?: string }> }) {
  const sp = await searchParams;
  await requireProfile(["admin", "cajero"]);
  const settings = await getSettings();
  const supabase = await createClient();
  const today = todayISO(settings.timezone);
  const from = sp.from ?? addDays(today, -29);
  const to = sp.to ?? today;
  const tab = sp.tab ?? "recaudacion";
  const m = (v: number) => formatMoney(v, settings);
  const qs = `from=${from}&to=${to}`;

  const [{ data: coll }, { data: aging }, { data: flow }, { data: disb }] = await Promise.all([
    supabase.rpc("report_collections", { p_from: from, p_to: to }),
    supabase.rpc("report_aging"),
    supabase.rpc("report_cash_flow", { p_from: from, p_to: to }),
    // Suma en la base de datos (antes se descargaban todos los préstamos del periodo)
    supabase.rpc("report_disbursements", { p_from: from, p_to: to }),
  ]);
  // Sin la migración 004: cálculo anterior, sumando en el servidor
  const desembolsado = disb
    ? (disb[0]?.total ?? 0)
    : ((await supabase.from("loans").select("net_disbursed").neq("status", "anulado")
        .gte("disbursed_at", `${from}T00:00:00`).lte("disbursed_at", `${to}T23:59:59`)).data ?? [])
        .reduce((a, l) => a + l.net_disbursed, 0);

  const byCollector = new Map<string, { name: string; pagos: number; total: number; capital: number; interes: number; mora: number }>();
  for (const r of coll ?? []) {
    const k = r.collector_id ?? "—";
    const acc = byCollector.get(k) ?? { name: r.collector_name, pagos: 0, total: 0, capital: 0, interes: 0, mora: 0 };
    acc.pagos += r.pagos; acc.total += r.total; acc.capital += r.capital; acc.interes += r.interes; acc.mora += r.mora;
    byCollector.set(k, acc);
  }
  const totals = [...byCollector.values()].reduce((a, r) => ({ total: a.total + r.total, interes: a.interes + r.interes, mora: a.mora + r.mora, capital: a.capital + r.capital }), { total: 0, interes: 0, mora: 0, capital: 0 });
  const ingresos = (flow ?? []).filter((f) => f.movement_type === "ingreso").reduce((a, f) => a + f.total, 0);
  const egresos = (flow ?? []).filter((f) => f.movement_type === "egreso").reduce((a, f) => a + f.total, 0);
  const gastos = (flow ?? []).filter((f) => f.category === "gasto_operativo").reduce((a, f) => a + f.total, 0);
  const agingTotal = (aging ?? []).reduce((a, r) => a + r.amount, 0);

  const Export = ({ report }: { report: string }) => (
    <a href={`/api/export/${report}?${qs}`} className={buttonVariants({ variant: "secondary", size: "sm" })}><Download strokeWidth={1.75} />CSV / Excel</a>
  );

  return (
    <>
      <PageHeader title="Reportes gerenciales" description={`Del ${formatDate(from)} al ${formatDate(to)}`} />
      <form className="mb-4 flex flex-wrap items-end gap-2">
        <input type="hidden" name="tab" value={tab} />
        <Field label="Desde"><Input type="date" name="from" defaultValue={from} /></Field>
        <Field label="Hasta"><Input type="date" name="to" defaultValue={to} /></Field>
        <Button type="submit" variant="secondary">Aplicar</Button>
      </form>
      <UrlTabs basePath="/reportes" active={tab} params={{ from, to }}
        tabs={[{ key: "recaudacion", label: "Recaudación" }, { key: "cartera", label: "Cartera vencida" }, { key: "rentabilidad", label: "Rentabilidad y flujo" }]} />

      {tab === "recaudacion" && (
        <div className="space-y-4">
          <Card><CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="Recaudado" value={m(totals.total)} /><Stat label="Capital recuperado" value={m(totals.capital)} />
            <Stat label="Interés cobrado" value={m(totals.interes)} tone="ok" /><Stat label="Mora cobrada" value={m(totals.mora)} tone="ok" />
          </CardContent></Card>
          <Card>
            <CardHeader><CardTitle>Por cobrador</CardTitle><div className="flex gap-2"><Export report="recaudacion" /><Export report="pagos" /></div></CardHeader>
            <TableWrap><Table>
              <thead><tr><Th>Cobrador</Th><Th align="right">Pagos</Th><Th align="right">Capital</Th><Th align="right">Interés</Th><Th align="right">Mora</Th><Th align="right">Total</Th><Th align="right">% del total</Th></tr></thead>
              <tbody>{[...byCollector.values()].sort((a, b) => b.total - a.total).map((r) => (
                <Tr key={r.name}><Td className="font-medium">{r.name}</Td><Td align="right">{r.pagos}</Td><Td align="right">{m(r.capital)}</Td>
                  <Td align="right">{m(r.interes)}</Td><Td align="right">{m(r.mora)}</Td><Td align="right" className="font-semibold">{m(r.total)}</Td>
                  <Td align="right" className="text-ink-muted">{totals.total ? ((r.total / totals.total) * 100).toFixed(1) : "0.0"}%</Td></Tr>
              ))}</tbody>
            </Table></TableWrap>
          </Card>
          <Card>
            <CardHeader><CardTitle>Por fecha y cobrador</CardTitle></CardHeader>
            <TableWrap className="max-h-[480px] overflow-y-auto"><Table>
              <thead className="sticky top-0"><tr><Th>Fecha</Th><Th>Cobrador</Th><Th align="right">Pagos</Th><Th align="right">Total</Th></tr></thead>
              <tbody>{(coll ?? []).map((r, i) => (
                <Tr key={i}><Td className="tabular-nums">{formatDate(r.fecha)}</Td><Td>{r.collector_name}</Td><Td align="right">{r.pagos}</Td><Td align="right">{m(r.total)}</Td></Tr>
              ))}</tbody>
            </Table></TableWrap>
          </Card>
        </div>
      )}

      {tab === "cartera" && (
        <Card>
          <CardHeader><div><CardTitle>Aging de mora</CardTitle><CardDescription>Monto vencido por tramo de días de atraso (al día de hoy)</CardDescription></div><Export report="cartera" /></CardHeader>
          <CardContent className="space-y-4">
            {(aging ?? []).map((r) => {
              const pct = agingTotal ? (r.amount / agingTotal) * 100 : 0;
              return (
                <div key={r.bucket}>
                  <div className="mb-1 flex justify-between text-sm"><span className="font-medium">{r.bucket} días</span>
                    <span className="tabular-nums text-ink-muted">{r.loans} préstamos · <span className="font-semibold text-ink">{m(r.amount)}</span> · {pct.toFixed(1)}%</span></div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-sand"><div className="h-full rounded-full bg-danger" style={{ width: `${pct}%`, opacity: 0.45 + Math.min(0.55, pct / 100) }} /></div>
                </div>
              );
            })}
            <p className="border-t border-sand-border pt-3 text-sm">Total cartera vencida: <span className="font-semibold tabular-nums">{m(agingTotal)}</span></p>
          </CardContent>
        </Card>
      )}

      {tab === "rentabilidad" && (
        <div className="space-y-4">
          <Card><CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="Ganancia bruta (interés + mora)" value={m(totals.interes + totals.mora)} tone="ok" />
            <Stat label="Gastos operativos" value={m(gastos)} tone="danger" />
            <Stat label="Utilidad operativa" value={m(totals.interes + totals.mora - gastos)} tone={totals.interes + totals.mora - gastos >= 0 ? "ok" : "danger"} />
            <Stat label="Flujo de caja neto" value={m(ingresos - egresos)} hint={`Desembolsado ${m(desembolsado)}`} />
          </CardContent></Card>
          <Card>
            <CardHeader><CardTitle>Movimientos de caja por categoría</CardTitle><Export report="flujo" /></CardHeader>
            <TableWrap><Table>
              <thead><tr><Th>Tipo</Th><Th>Categoría</Th><Th align="right">Movimientos</Th><Th align="right">Total</Th></tr></thead>
              <tbody>{(flow ?? []).map((f, i) => (
                <Tr key={i}><Td className={f.movement_type === "ingreso" ? "text-ok" : "text-danger"}>{f.movement_type === "ingreso" ? "Ingreso" : "Egreso"}</Td>
                  <Td>{CASH_CATEGORY_LABEL[f.category]}</Td><Td align="right">{f.movimientos}</Td><Td align="right">{m(f.total)}</Td></Tr>
              ))}</tbody>
            </Table></TableWrap>
          </Card>
        </div>
      )}
    </>
  );
}
