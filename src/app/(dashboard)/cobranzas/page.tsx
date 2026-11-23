import Link from "next/link";
import { CheckCircle2, Search, Route } from "lucide-react";
import { requireProfile, getSettings, can } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { addDays } from "@/services/finance";
import { formatDate, formatMoney, startOfDayUTC, todayISO } from "@/lib/formatters";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState, PageHeader, UrlTabs, Stat } from "@/components/ui/misc";
import { Table, TableWrap, Td, Th, Tr } from "@/components/ui/table";
import { RouteCard } from "@/components/payments/route-card";
import { PaymentSheet, type PaymentContext } from "@/components/payments/payment-sheet";
import { NoteSheet } from "@/components/payments/note-sheet";
import type { LoanPortfolioView } from "@/types/database";

export const metadata = { title: "Cobranzas" };

export default async function CobranzasPage({ searchParams }: {
  searchParams: Promise<{ tab?: string; cobrador?: string; zona?: string; q?: string }>;
}) {
  const sp = await searchParams;
  const profile = await requireProfile();
  const settings = await getSettings();
  const supabase = await createClient();
  const today = todayISO(settings.timezone);
  const tab = sp.tab ?? "hoy";
  // Mora al día sin recalcular toda la cartera en cada visita: solo si el último cálculo
  // es de otro día o tiene más de 15 min (el cron lo hace cada hora). Sin la migración 004,
  // se usa el recálculo completo de antes.
  const stale = await supabase.rpc("refresh_late_fees_if_stale", { p_max_age_minutes: 15 });
  if (stale.error) await supabase.rpc("refresh_all_late_fees").then(() => null, () => null);

  const base = (head = false) => {
    let q = (head
      ? supabase.from("v_loan_portfolio").select("*", { count: "exact", head: true })
      : supabase.from("v_loan_portfolio").select("*")).eq("status", "activo");
    if (sp.cobrador) q = q.eq("effective_collector_id", sp.cobrador);
    if (sp.zona) q = q.eq("zone", sp.zona);
    return q;
  };
  let query = base();
  if (tab === "hoy") query = query.lte("next_due_date", today).order("days_overdue", { ascending: false }).order("zone");
  else if (tab === "atrasados") query = query.gt("days_overdue", 0).order("days_overdue", { ascending: false });
  else if (tab === "proximos") query = query.gt("next_due_date", today).lte("next_due_date", addDays(today, 3)).order("next_due_date");
  else query = query.order("client_name");
  if (tab === "buscar" || sp.q) {
    const term = (sp.q ?? "").replace(/[%,()]/g, " ").trim();
    query = term ? query.or(`client_name.ilike.%${term}%,document_number.ilike.%${term}%,code.ilike.%${term}%`) : query.limit(0);
  }

  const [{ data: loans }, { data: collectors }, { data: zones }, { count: hoyCount }, { count: atrCount }, { count: proxCount }, { data: todayPayments }] = await Promise.all([
    query.limit(200),
    supabase.from("profiles").select("id, full_name").eq("role", "cobrador").order("full_name"),
    // Solo las zonas distintas (antes se descargaba la zona de cada cliente)
    supabase.from("v_client_zones").select("zone").then(async (res) =>
      res.error ? await supabase.from("clients").select("zone").not("zone", "is", null) : res),
    base(true).lte("next_due_date", today),
    base(true).gt("days_overdue", 0),
    base(true).gt("next_due_date", today).lte("next_due_date", addDays(today, 3)),
    supabase.from("payments").select("amount").eq("voided", false).neq("payment_method", "refinanciamiento")
      .eq("collected_by", profile.id).gte("paid_at", startOfDayUTC(today, settings.timezone)),
  ]);

  const list = (loans ?? []) as LoanPortfolioView[];

  const money = settings;
  const m = (v: number) => formatMoney(v, money);
  const canWaive = can(profile.role, "waive") && settings.allow_late_fee_waiver;
  const ctxFor = (l: LoanPortfolioView): PaymentContext => ({
    loanId: l.id, loanCode: l.code, clientName: l.client_name, clientPhone: l.phone,
    today, paymentOrder: settings.payment_order, allowPartial: settings.allow_partial_payments, canWaive,
    businessName: settings.business_name, countryCode: settings.phone_country_code, receiptTemplate: settings.templates.recibo,
    appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "",
  });
  const toCollect = list.reduce((a, l) => a + (l.overdue_amount > 0 ? l.overdue_amount : l.next_due_amount ?? 0), 0);
  const collectedByMe = (todayPayments ?? []).reduce((a, p) => a + p.amount, 0);
  const uniqueZones = [...new Set((zones ?? []).map((z) => z.zone).filter(Boolean))] as string[];
  const keep = { cobrador: sp.cobrador, zona: sp.zona };

  return (
    <>
      <PageHeader title="Cobranzas" description={profile.role === "cobrador" ? "Su ruta asignada" : "Ruta diaria, mora y bitácora"} />
      <UrlTabs basePath="/cobranzas" active={tab} params={keep} tabs={[
        { key: "hoy", label: "Hoy", count: hoyCount ?? 0 },
        { key: "atrasados", label: "Atrasados", count: atrCount ?? 0 },
        { key: "proximos", label: "Próximos 3 días", count: proxCount ?? 0 },
        { key: "todos", label: "Todos" },
        { key: "buscar", label: "Buscar" },
      ]} />

      <div className="mb-4 grid gap-2 sm:grid-cols-[1fr_auto]">
        <form className="grid gap-2 sm:grid-cols-[1fr_200px_160px_auto]">
          <input type="hidden" name="tab" value={tab} />
          <div className="relative">
            <Search strokeWidth={1.75} className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
            <Input data-search name="q" defaultValue={sp.q} autoFocus={tab === "buscar"} placeholder="Buscar cliente, DNI o código" className="pl-9" />
          </div>
          {profile.role !== "cobrador" ? (
            <Select name="cobrador" defaultValue={sp.cobrador ?? ""}>
              <option value="">Todos los cobradores</option>
              {(collectors ?? []).map((c) => <option key={c.id} value={c.id}>{c.full_name}</option>)}
            </Select>
          ) : <span className="hidden sm:block" />}
          <Select name="zona" defaultValue={sp.zona ?? ""}>
            <option value="">Todas las zonas</option>
            {uniqueZones.map((z) => <option key={z} value={z}>{z}</option>)}
          </Select>
          <Button variant="secondary" type="submit">Aplicar</Button>
        </form>
      </div>

      <Card className="mb-4">
        <CardContent className="grid grid-cols-3 gap-3">
          <Stat label="Clientes en vista" value={list.length} />
          <Stat label="Por cobrar" value={m(toCollect)} tone="warn" />
          <Stat label="Cobrado por mí hoy" value={m(collectedByMe)} tone="ok" />
        </CardContent>
      </Card>

      {!list.length ? (
        <Card><EmptyState icon={tab === "buscar" ? Search : tab === "hoy" ? CheckCircle2 : Route}
          title={tab === "buscar" ? "Escriba para buscar un cliente" : tab === "hoy" ? "Ruta completada" : "Sin resultados"}
          description={tab === "hoy" ? "No quedan cobros pendientes para hoy en esta vista." : undefined} /></Card>
      ) : (
        <>
          <ul className="space-y-3 lg:hidden">
            {list.map((l) => <RouteCard key={l.id} loan={l} ctx={ctxFor(l)} money={money} templates={settings.templates} today={today} />)}
          </ul>
          <Card className="hidden lg:block">
            <TableWrap>
              <Table>
                <thead><tr><Th>Cliente</Th><Th>Préstamo</Th><Th>Zona</Th><Th>Vence</Th><Th align="right">Cuota</Th><Th align="right">A cobrar</Th><Th align="right">Mora</Th><Th>Atraso</Th><Th>Cobrador</Th><Th /></tr></thead>
                <tbody>
                  {list.map((l) => (
                    <Tr key={l.id}>
                      <Td><Link href={`/clientes/${l.client_id}`} className="font-medium hover:text-brand">{l.client_name}</Link>
                        <span className="block text-xs text-ink-muted tabular-nums">{l.phone}</span></Td>
                      <Td><Link href={`/prestamos/${l.id}`} className="tabular-nums hover:text-brand">{l.code}</Link></Td>
                      <Td className="text-ink-muted">{l.zone ?? "—"}</Td>
                      <Td className="tabular-nums">{formatDate(l.next_due_date)}</Td>
                      <Td align="right">{m(l.installment_amount)}</Td>
                      <Td align="right" className="font-semibold">{m(l.overdue_amount > 0 ? l.overdue_amount : l.next_due_amount ?? 0)}</Td>
                      <Td align="right" className={l.late_fee_pending > 0 ? "text-danger" : "text-ink-faint"}>{l.late_fee_pending > 0 ? m(l.late_fee_pending) : "—"}</Td>
                      <Td>{l.days_overdue > 0 ? <Badge tone="danger">{l.days_overdue} d</Badge> : l.next_due_date === today ? <Badge tone="warn">Hoy</Badge> : <Badge tone="ok">Al día</Badge>}</Td>
                      <Td className="text-ink-muted">{l.collector_name ?? "—"}</Td>
                      <Td>
                        <div className="flex items-center justify-end gap-1">
                          <NoteSheet clientId={l.client_id} loanId={l.id} clientName={l.client_name} compact />
                          <PaymentSheet ctx={ctxFor(l)} triggerProps={{ size: "sm" }} />
                        </div>
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
          </Card>
        </>
      )}
    </>
  );
}
