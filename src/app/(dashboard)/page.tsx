import Link from "next/link";
import { AlertTriangle, ArrowRight, CalendarClock, HandCoins, Plus } from "lucide-react";
import { requireProfile, getSettings } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatMoney, formatPercent, formatDate, todayISO } from "@/lib/formatters";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress, PageHeader, EmptyState, Alert } from "@/components/ui/misc";
import { buttonVariants } from "@/components/ui/button";
import { FlowChart, PortfolioChart } from "@/components/dashboard/charts";
import { RealtimeRefresh } from "@/components/dashboard/realtime-refresh";
import { cn } from "@/lib/utils";
import type { PortfolioQuality } from "@/types/database";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ dias?: string; denied?: string }> }) {
  const sp = await searchParams;
  const profile = await requireProfile();
  const settings = await getSettings();
  const supabase = await createClient();
  const days = sp.dias === "30" ? 30 : 14;

  const showQuality = profile.role !== "cobrador";
  const [{ data: k, error }, { data: today }, { data: critical }, { data: quality }] = await Promise.all([
    supabase.rpc("get_dashboard_kpis", { p_days: days }),
    supabase.from("v_loan_portfolio").select("*").eq("status", "activo")
      .lte("next_due_date", todayISO(settings.timezone)).order("days_overdue", { ascending: false }).limit(8),
    supabase.from("v_loan_portfolio").select("*").eq("status", "activo").gte("days_overdue", 8)
      .order("overdue_amount", { ascending: false }).limit(6),
    // Si la migración 003 aún no se aplicó, data llega null y el bloque no se muestra
    showQuality ? supabase.rpc("get_portfolio_quality") : Promise.resolve({ data: null }),
  ]);

  const m = (v: number) => formatMoney(v, settings);
  if (error || !k) {
    return <Alert tone="danger">No se pudieron cargar los indicadores: {error?.message}</Alert>;
  }
  const progress = k.meta_hoy > 0 ? (k.cobrado_hoy / k.meta_hoy) * 100 : 0;
  const morosidad = k.saldo_cartera > 0 ? (k.cartera_vencida / k.saldo_cartera) * 100 : 0;

  return (
    <>
      <RealtimeRefresh />
      <PageHeader
        title={`Hola, ${profile.full_name.split(" ")[0] || "equipo"}`}
        description={new Intl.DateTimeFormat("es-PE", { weekday: "long", day: "numeric", month: "long", timeZone: settings.timezone }).format(new Date())}
        actions={profile.role !== "cobrador" ? (
          <>
            <Link href="/cobranzas?tab=hoy" className={buttonVariants({ variant: "secondary" })}><CalendarClock strokeWidth={1.75} />Ruta de hoy</Link>
            <Link href="/prestamos/nuevo" className={buttonVariants()}><Plus strokeWidth={1.75} />Nuevo préstamo</Link>
          </>
        ) : (
          <Link href="/cobranzas?tab=hoy" className={buttonVariants()}><HandCoins strokeWidth={1.75} />Iniciar ruta</Link>
        )}
      />
      {sp.denied ? <div className="mb-4"><Alert tone="warn">No tiene permisos para esa sección.</Alert></div> : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Card className="col-span-2 lg:col-span-2">
          <CardContent>
            <div className="flex items-baseline justify-between">
              <p className="text-xs text-ink-muted">Cobrado hoy vs. meta</p>
              <span className="text-xs font-medium tabular-nums text-ink-muted">{formatPercent(progress, 0)}</span>
            </div>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{m(k.cobrado_hoy)}
              <span className="ml-2 text-sm font-normal text-ink-muted">de {m(k.meta_hoy)}</span></p>
            <div className="mt-3"><Progress value={progress} tone={progress >= 80 ? "ok" : progress >= 40 ? "warn" : "danger"} /></div>
          </CardContent>
        </Card>
        <Kpi label="Capital activo en la calle" value={m(k.capital_activo)} hint={`${k.prestamos_activos} préstamos activos`} />
        <Kpi label="Cartera vencida" value={m(k.cartera_vencida)} hint={`${formatPercent(morosidad, 1)} de morosidad · ${k.prestamos_en_mora} préstamos`} tone="danger" />
        <Kpi label="Interés y mora del mes" value={m(k.interes_mes)} hint={`Saldo en caja ${m(k.saldo_caja)}`} tone="ok" />
      </div>

      {quality ? <QualityCard q={quality} m={m} /> : null}

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div><CardTitle>Cobranza vs. desembolsos</CardTitle><CardDescription>Últimos {days} días</CardDescription></div>
            <div className="flex gap-1 text-xs">
              {[14, 30].map((d) => (
                <Link key={d} href={`/?dias=${d}`} className={cn("rounded-md px-2 py-1", d === days ? "bg-sand font-medium" : "text-ink-muted hover:bg-sand")}>{d} d</Link>
              ))}
            </div>
          </CardHeader>
          <CardContent><FlowChart data={k.serie} /></CardContent>
        </Card>
        <Card>
          <CardHeader><div><CardTitle>Distribución de cartera</CardTitle><CardDescription>Préstamos activos por estado</CardDescription></div></CardHeader>
          <CardContent><PortfolioChart data={k.distribucion} /></CardContent>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div><CardTitle>Cobros prioritarios de hoy</CardTitle><CardDescription>Vencen hoy o están atrasados</CardDescription></div>
            <Link href="/cobranzas?tab=hoy" className="flex items-center gap-1 text-xs font-medium text-brand">Ver ruta <ArrowRight strokeWidth={1.75} className="size-3.5" /></Link>
          </CardHeader>
          {today?.length ? (
            <ul className="divide-y divide-sand-border">
              {today.map((l) => (
                <li key={l.id}>
                  <Link href={`/prestamos/${l.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-canvas sm:px-5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{l.client_name}</p>
                      <p className="truncate text-xs text-ink-muted">{l.code} · {l.zone ?? l.address}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold tabular-nums">{m(l.overdue_amount > 0 ? l.overdue_amount : l.next_due_amount ?? 0)}</p>
                      {l.days_overdue > 0 ? <Badge tone="danger">{l.days_overdue} d atraso</Badge> : <Badge tone="warn">Vence hoy</Badge>}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          ) : <EmptyState icon={CalendarClock} title="Sin cobros pendientes para hoy" />}
        </Card>
        <Card>
          <CardHeader>
            <div><CardTitle>Alertas de mora crítica</CardTitle><CardDescription>8 o más días de atraso</CardDescription></div>
            <Link href="/cobranzas?tab=atrasados" className="flex items-center gap-1 text-xs font-medium text-brand">Ver todos <ArrowRight strokeWidth={1.75} className="size-3.5" /></Link>
          </CardHeader>
          {critical?.length ? (
            <ul className="divide-y divide-sand-border">
              {critical.map((l) => (
                <li key={l.id}>
                  <Link href={`/prestamos/${l.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-canvas sm:px-5">
                    <AlertTriangle strokeWidth={1.75} className="size-4 shrink-0 text-danger" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{l.client_name}</p>
                      <p className="text-xs text-ink-muted">{l.overdue_count} cuotas vencidas · desde {formatDate(l.next_due_date)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold tabular-nums text-danger">{m(l.overdue_amount)}</p>
                      <p className="text-xs tabular-nums text-ink-muted">{l.days_overdue} días</p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          ) : <EmptyState icon={AlertTriangle} title="Sin mora crítica" description="Ningún préstamo supera los 7 días de atraso." />}
        </Card>
      </div>
    </>
  );
}

function Kpi({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "ok" | "danger" }) {
  return (
    <Card>
      <CardContent>
        <p className="text-xs text-ink-muted">{label}</p>
        <p className={cn("mt-1 text-xl font-semibold tabular-nums", tone === "danger" && "text-danger", tone === "ok" && "text-ok")}>{value}</p>
        {hint ? <p className="mt-1 text-xs text-ink-faint">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}

/** Semáforo de PAR: referencias habituales en microfinanzas. */
function parTone(pct: number, warn: number, danger: number): "ok" | "warn" | "danger" {
  return pct >= danger ? "danger" : pct >= warn ? "warn" : "ok";
}

function QualityCard({ q, m }: { q: PortfolioQuality; m: (v: number) => string }) {
  const pct = (v: number) => (q.capital_cartera > 0 ? (v / q.capital_cartera) * 100 : 0);
  const rows = [
    { label: "PAR 1", help: "Con al menos 1 día de atraso", amount: q.par_1, loans: q.prestamos_par_1, tone: parTone(pct(q.par_1), 10, 20) },
    { label: "PAR 30", help: "Más de 30 días de atraso", amount: q.par_30, loans: q.prestamos_par_30, tone: parTone(pct(q.par_30), 5, 10) },
    { label: "PAR 90", help: "Más de 90 días: candidatos a castigo", amount: q.par_90, loans: q.prestamos_par_90, tone: parTone(pct(q.par_90), 2, 5) },
  ];
  const toneText = { ok: "text-ok", warn: "text-warn", danger: "text-danger" } as const;
  return (
    <Card className="mt-4">
      <CardHeader>
        <div>
          <CardTitle>Calidad de cartera</CardTitle>
          <CardDescription>Capital en riesgo sobre {m(q.capital_cartera)} de capital pendiente en préstamos activos</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {rows.map((r) => (
            <div key={r.label}>
              <div className="flex items-baseline justify-between">
                <p className="text-xs text-ink-muted" title={r.help}>{r.label}</p>
                <span className={cn("text-sm font-semibold tabular-nums", toneText[r.tone])}>{formatPercent(pct(r.amount), 1)}</span>
              </div>
              <p className="mt-1 text-lg font-semibold tabular-nums">{m(r.amount)}</p>
              <div className="mt-2"><Progress value={Math.min(100, pct(r.amount))} tone={r.tone} /></div>
              <p className="mt-1 text-xs text-ink-faint">{r.loans} préstamo{r.loans === 1 ? "" : "s"} · {r.help.toLowerCase()}</p>
            </div>
          ))}
          <div className="rounded-md bg-canvas p-3">
            <p className="text-xs text-ink-muted">Cartera castigada</p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-danger">{m(q.castigado_total)}</p>
            <p className="text-xs text-ink-faint">Este mes {m(q.castigado_mes)}</p>
            <p className="mt-2 text-xs text-ink-muted">Recuperado</p>
            <p className="text-sm font-semibold tabular-nums text-ok">{m(q.recuperado_total)}
              <span className="ml-1 text-xs font-normal text-ink-faint">
                ({formatPercent(q.castigado_total > 0 ? (q.recuperado_total / q.castigado_total) * 100 : 0, 1)})
              </span>
            </p>
            <p className="text-xs text-ink-faint">Este mes {m(q.recuperado_mes)}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
