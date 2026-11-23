"use client";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Calculator, Loader2, RefreshCcw, Search, UserRound, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Field, Input, Select, Switch, Textarea } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Alert, Stat } from "@/components/ui/misc";
import { useMoney } from "@/components/ui/money";
import { ScoreBadge } from "@/components/clients/score-badge";
import { SchedulePreviewTable } from "./schedule-table";
import {
  buildSchedule, fromCents, FREQUENCY_LABEL, LATE_FEE_LABEL, type Frequency, type InterestType, type FlatRateMode, type LateFeeType,
} from "@/services/finance";
import { searchClients, type ClientOption } from "@/app/(dashboard)/clientes/actions";
import { createLoan, getRefinanceOptions, type RefinanceOption } from "@/app/(dashboard)/prestamos/actions";
import type { Profile, SystemSettings } from "@/types/database";

interface Props {
  settings: SystemSettings;
  holidays: string[];
  today: string;
  collectors: Pick<Profile, "id" | "full_name">[];
  initialClient?: ClientOption | null;
  initialRefinanceId?: string | null;
}

export function LoanSimulator({ settings, holidays, today, collectors, initialClient, initialRefinanceId }: Props) {
  const router = useRouter();
  const { fmt } = useMoney();
  const [client, setClient] = useState<ClientOption | null>(initialClient ?? null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ClientOption[]>([]);
  const [searching, startSearch] = useTransition();
  const [refiOptions, setRefiOptions] = useState<RefinanceOption[]>([]);
  const [refiId, setRefiId] = useState<string>(initialRefinanceId ?? "");
  const [saving, startSave] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [f, setF] = useState({
    principal: "1000",
    rate: String(settings.default_interest_rate),
    interestType: settings.default_interest_type as InterestType,
    flatMode: settings.default_flat_rate_mode as FlatRateMode,
    frequency: settings.default_frequency as Frequency,
    terms: String(settings.default_term_count),
    startDate: today,
    grace: String(settings.default_grace_days),
    lateType: settings.default_late_fee_type as LateFeeType,
    lateValue: String(settings.default_late_fee_value),
    lateCap: settings.default_late_fee_cap != null ? String(settings.default_late_fee_cap) : "",
    excludeSundays: settings.default_frequency === "diario" && settings.exclude_sundays_daily,
    collectorId: "",
    notes: "",
  });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((s) => ({ ...s, [k]: v }));

  // Búsqueda de clientes con debounce
  useEffect(() => {
    if (client) return;
    const t = setTimeout(() => startSearch(async () => setResults(await searchClients(query))), 250);
    return () => clearTimeout(t);
  }, [query, client]);

  useEffect(() => {
    if (!client) { setRefiOptions([]); return; }
    if (client.collectorId) setF((s) => ({ ...s, collectorId: s.collectorId || client.collectorId || "" }));
    getRefinanceOptions(client.id).then(setRefiOptions);
  }, [client]);

  const schedule = useMemo(() => {
    try {
      return buildSchedule({
        principal: Number(f.principal), ratePct: Number(f.rate), interestType: f.interestType, flatRateMode: f.flatMode,
        frequency: f.frequency, termCount: Number(f.terms), startDate: f.startDate, excludeSundays: f.excludeSundays, holidays,
      });
    } catch {
      return null;
    }
  }, [f, holidays]);

  const refi = refiOptions.find((r) => r.id === refiId) ?? null;
  const principal = Number(f.principal) || 0;
  const net = principal - (refi?.payoff ?? 0);
  const needsGuarantor = settings.require_guarantor_from != null && principal >= settings.require_guarantor_from && client && !client.hasGuarantor;

  const submit = () => {
    if (!client || !schedule) return;
    setError(null);
    startSave(async () => {
      const res = await createLoan({
        client_id: client.id, principal, interest_rate: Number(f.rate), interest_type: f.interestType,
        flat_rate_mode: f.flatMode, frequency: f.frequency, term_count: Number(f.terms), start_date: f.startDate,
        grace_days: Number(f.grace), late_fee_type: f.lateType, late_fee_value: Number(f.lateValue),
        late_fee_cap: f.lateCap === "" ? null : Number(f.lateCap), exclude_sundays: f.excludeSundays,
        previous_loan_id: refiId || null, collector_id: f.collectorId || null, notes: f.notes || null,
      });
      if (!res.ok) { setError(res.error); return; }
      router.push(`/prestamos/${res.data.loan_id}?nuevo=1`);
    });
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
      <div className="space-y-4">
        <Card>
          <CardHeader><div><CardTitle>Cliente</CardTitle><CardDescription>Busque por nombre o documento</CardDescription></div></CardHeader>
          <CardContent>
            {client ? (
              <div className="flex items-center gap-3 rounded-md border border-sand-border bg-canvas px-3 py-2.5">
                <UserRound strokeWidth={1.75} className="size-5 text-ink-muted" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{client.name}</p>
                  <p className="text-xs text-ink-muted tabular-nums">{client.document}</p>
                </div>
                <ScoreBadge score={client.score} status={client.status} />
                <button className="rounded-md p-2 hover:bg-sand" aria-label="Cambiar cliente" onClick={() => { setClient(null); setRefiId(""); }}>
                  <X strokeWidth={1.75} className="size-4" />
                </button>
              </div>
            ) : (
              <div>
                <div className="relative">
                  <Search strokeWidth={1.75} className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
                  <Input autoFocus data-search value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Nombre, apellido o DNI" className="pl-9" />
                  {searching && <Loader2 strokeWidth={1.75} className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-ink-faint" />}
                </div>
                <ul className="mt-2 max-h-64 divide-y divide-sand-border overflow-y-auto rounded-md border border-sand-border">
                  {results.map((r) => (
                    <li key={r.id}>
                      <button type="button" disabled={r.status === "bloqueado"} onClick={() => setClient(r)}
                        className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-canvas disabled:opacity-50">
                        <span className="flex-1 text-sm">{r.name}<span className="ml-2 text-xs text-ink-muted tabular-nums">{r.document}</span></span>
                        <ScoreBadge score={r.score} status={r.status} />
                      </button>
                    </li>
                  ))}
                  {!results.length && <li className="px-3 py-3 text-sm text-ink-muted">Sin resultados</li>}
                </ul>
              </div>
            )}
            {refiOptions.length > 0 && (
              <div className="mt-4 rounded-md border border-sand-border p-3">
                <p className="mb-2 flex items-center gap-2 text-sm font-medium"><RefreshCcw strokeWidth={1.75} className="size-4" />Refinanciar / renovar</p>
                <Select value={refiId} onChange={(e) => setRefiId(e.target.value)}>
                  <option value="">Préstamo nuevo (sin refinanciar)</option>
                  {refiOptions.map((r) => <option key={r.id} value={r.id}>{r.code} — saldo a cancelar {fmt(r.payoff)}</option>)}
                </Select>
                {refi && <p className="mt-2 text-xs text-ink-muted">El saldo de {refi.code} (incluye mora al día) se descuenta del desembolso y el préstamo anterior queda como refinanciado.</p>}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><div><CardTitle>Condiciones</CardTitle><CardDescription>Valores por defecto tomados de Ajustes</CardDescription></div></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Monto a prestar"><Input type="number" inputMode="decimal" step="0.01" min="1" value={f.principal} onChange={(e) => set("principal", e.target.value)} /></Field>
            <Field label="Modalidad de interés">
              <Select value={f.interestType} onChange={(e) => set("interestType", e.target.value as InterestType)}>
                <option value="simple">Simple / Flat</option><option value="frances">Francés (cuota fija)</option>
              </Select>
            </Field>
            <Field label={f.interestType === "frances" ? "Tasa mensual %" : f.flatMode === "total" ? "Tasa total %" : "Tasa por periodo %"}>
              <Input type="number" inputMode="decimal" step="0.01" min="0" value={f.rate} onChange={(e) => set("rate", e.target.value)} />
            </Field>
            {f.interestType === "simple" ? (
              <Field label="Aplicación de la tasa">
                <Select value={f.flatMode} onChange={(e) => set("flatMode", e.target.value as FlatRateMode)}>
                  <option value="total">Sobre el total del préstamo</option><option value="por_periodo">Por cada periodo (× cuotas)</option>
                </Select>
              </Field>
            ) : <div className="hidden lg:block" />}
            <Field label="Frecuencia">
              <Select value={f.frequency} onChange={(e) => {
                const fr = e.target.value as Frequency;
                setF((s) => ({ ...s, frequency: fr, excludeSundays: fr === "diario" ? settings.exclude_sundays_daily : false }));
              }}>
                {Object.entries(FREQUENCY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </Field>
            <Field label="Número de cuotas"><Input type="number" inputMode="numeric" min="1" max="720" value={f.terms} onChange={(e) => set("terms", e.target.value)} /></Field>
            <Field label="Fecha de desembolso"><Input type="date" value={f.startDate} onChange={(e) => set("startDate", e.target.value)} /></Field>
            <Field label="Cobrador">
              <Select value={f.collectorId} onChange={(e) => set("collectorId", e.target.value)}>
                <option value="">Según cliente</option>
                {collectors.map((c) => <option key={c.id} value={c.id}>{c.full_name}</option>)}
              </Select>
            </Field>
            <div className="sm:col-span-2 lg:col-span-4">
              <Switch label="Excluir domingos y feriados" description="La cuota que caiga en día no laborable pasa al siguiente día hábil."
                checked={f.excludeSundays} onChange={(v) => set("excludeSundays", v)} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><div><CardTitle>Mora</CardTitle></div></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-4">
            <Field label="Días de gracia"><Input type="number" min="0" value={f.grace} onChange={(e) => set("grace", e.target.value)} /></Field>
            <Field label="Tipo de mora">
              <Select value={f.lateType} onChange={(e) => set("lateType", e.target.value as LateFeeType)}>
                {Object.entries(LATE_FEE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </Field>
            <Field label={f.lateType === "porcentaje_diario" ? "% diario" : "Monto"}><Input type="number" step="0.01" min="0" value={f.lateValue} onChange={(e) => set("lateValue", e.target.value)} /></Field>
            <Field label="Tope por cuota (opcional)"><Input type="number" step="0.01" min="0" value={f.lateCap} onChange={(e) => set("lateCap", e.target.value)} /></Field>
            <Field label="Notas" className="sm:col-span-4"><Textarea value={f.notes} onChange={(e) => set("notes", e.target.value)} className="min-h-[60px]" /></Field>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4 xl:sticky xl:top-6 xl:self-start">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Calculator strokeWidth={1.75} className="size-4" />Resumen en vivo</CardTitle></CardHeader>
          <CardContent>
            {schedule ? (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <Stat label="Valor de cuota" value={fmt(fromCents(schedule.installmentCents))}
                    hint={schedule.rows.length > 1 && schedule.rows.at(-1)!.totalCents !== schedule.installmentCents ? `Última: ${fmt(fromCents(schedule.rows.at(-1)!.totalCents))}` : `${f.terms} cuotas ${FREQUENCY_LABEL[f.frequency].toLowerCase()}s`} />
                  <Stat label="Total interés" value={fmt(fromCents(schedule.interestCents))} />
                  <Stat label="Total a pagar" value={fmt(fromCents(schedule.totalCents))} />
                  <Stat label="Tasa efectiva" value={`${schedule.effectiveRatePct}%`} hint={`≈ ${schedule.monthlyEquivalentPct}% mensual`} />
                  <Stat label="Primer vencimiento" value={schedule.firstDueDate.split("-").reverse().join("/")} />
                  <Stat label="Vencimiento final" value={schedule.maturityDate.split("-").reverse().join("/")} />
                </div>
                {refi && (
                  <div className="mt-4 space-y-1 rounded-md bg-canvas p-3 text-sm">
                    <div className="flex justify-between"><span className="text-ink-muted">Capital nuevo</span><span className="tabular-nums">{fmt(principal)}</span></div>
                    <div className="flex justify-between"><span className="text-ink-muted">Saldo {refi.code}</span><span className="tabular-nums">−{fmt(refi.payoff)}</span></div>
                    <div className="flex justify-between border-t border-sand-border pt-1 font-semibold"><span>Neto a entregar</span><span className={`tabular-nums ${net <= 0 ? "text-danger" : ""}`}>{fmt(net)}</span></div>
                  </div>
                )}
              </>
            ) : <Alert tone="warn">Complete monto, tasa y cuotas válidos.</Alert>}
            <div className="mt-4 space-y-2">
              {needsGuarantor && <Alert tone="warn">Montos desde {fmt(settings.require_guarantor_from)} requieren aval. Regístrelo en el expediente.</Alert>}
              {refi && net <= 0 && <Alert tone="danger">El nuevo capital debe superar el saldo a refinanciar.</Alert>}
              {error && <Alert tone="danger">{error}</Alert>}
              <Button size="lg" className="w-full" onClick={submit}
                disabled={!client || !schedule || saving || Boolean(needsGuarantor) || (refi !== null && net <= 0)}>
                {saving ? <Loader2 strokeWidth={1.75} className="animate-spin" /> : null}
                {refi ? `Refinanciar y entregar ${fmt(net)}` : `Desembolsar ${fmt(principal)}`}
              </Button>
              {!client && <p className="text-center text-xs text-ink-muted">Seleccione un cliente para continuar.</p>}
            </div>
          </CardContent>
        </Card>
        {schedule && (
          <Card>
            <CardHeader><CardTitle>Cronograma previo</CardTitle></CardHeader>
            <SchedulePreviewTable rows={schedule.rows.map((r) => ({
              number: r.number, dueDate: r.dueDate, principal: fromCents(r.principalCents), interest: fromCents(r.interestCents),
              total: fromCents(r.totalCents), balance: fromCents(r.balanceAfterCents),
            }))} />
          </Card>
        )}
      </div>
    </div>
  );
}
