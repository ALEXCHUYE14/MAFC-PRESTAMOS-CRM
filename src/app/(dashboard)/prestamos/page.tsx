import Link from "next/link";
import { HandCoins, Plus, Search, ChevronRight } from "lucide-react";
import { requireProfile, getSettings } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatMoney, todayISO } from "@/lib/formatters";
import { LOAN_STATUS_LABEL } from "@/lib/constants";
import { FREQUENCY_LABEL } from "@/services/finance";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/form";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge, toneForStatus } from "@/components/ui/badge";
import { EmptyState, PageHeader, Progress, UrlTabs } from "@/components/ui/misc";
import { Table, TableWrap, Td, Th, Tr } from "@/components/ui/table";
import { LoanPeek } from "@/components/loans/loan-peek";
import type { LoanFrequency, LoanStatus } from "@/types/database";

export const metadata = { title: "Préstamos" };
const PAGE = 40;

export default async function PrestamosPage({ searchParams }: {
  searchParams: Promise<{ tab?: string; q?: string; frecuencia?: string; cobrador?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const profile = await requireProfile();
  const settings = await getSettings();
  const supabase = await createClient();
  const tab = sp.tab ?? "activo";
  const page = Math.max(1, Number(sp.page ?? 1));

  let query = supabase.from("v_loan_portfolio").select("*", { count: "exact" })
    .order(tab === "mora" ? "days_overdue" : "disbursed_at", { ascending: false })
    .range((page - 1) * PAGE, page * PAGE - 1);
  if (tab === "mora") query = query.eq("status", "activo").gt("days_overdue", 0);
  else if (tab !== "todos") query = query.eq("status", tab as LoanStatus);
  if (sp.q) {
    const q = sp.q.replace(/[%,()]/g, " ").trim();
    query = query.or(`code.ilike.%${q}%,client_name.ilike.%${q}%,document_number.ilike.%${q}%`);
  }
  if (sp.frecuencia) query = query.eq("frequency", sp.frecuencia as LoanFrequency);
  if (sp.cobrador) query = query.eq("effective_collector_id", sp.cobrador);

  const [{ data: loans, count }, { data: collectors }] = await Promise.all([
    query,
    supabase.from("profiles").select("id, full_name").eq("role", "cobrador").order("full_name"),
  ]);
  const m = (v: number) => formatMoney(v, settings);
  const today = todayISO(settings.timezone);
  const keep = { q: sp.q, frecuencia: sp.frecuencia, cobrador: sp.cobrador };
  const pages = Math.max(1, Math.ceil((count ?? 0) / PAGE));
  const pageHref = (p: number) => `/prestamos?${new URLSearchParams(Object.entries({ ...keep, tab, page: String(p) }).filter(([, v]) => v) as [string, string][])}`;

  return (
    <>
      <PageHeader title="Préstamos" description={`${count ?? 0} resultados`}
        actions={profile.role !== "cobrador" ? <Link href="/prestamos/nuevo" className={buttonVariants()}><Plus strokeWidth={1.75} />Nuevo préstamo <kbd className="ml-1 hidden rounded bg-white/15 px-1 text-[10px] lg:inline">Alt N</kbd></Link> : null} />
      <UrlTabs basePath="/prestamos" active={tab} params={keep}
        tabs={[{ key: "activo", label: "Activos" }, { key: "mora", label: "En mora" }, { key: "pagado", label: "Pagados" }, { key: "refinanciado", label: "Refinanciados" }, { key: "todos", label: "Todos" }]} />
      <form className="mb-4 grid gap-2 sm:grid-cols-[1fr_180px_200px_auto]">
        <input type="hidden" name="tab" value={tab} />
        <div className="relative">
          <Search strokeWidth={1.75} className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
          <Input data-search name="q" defaultValue={sp.q} placeholder="Código, cliente o documento" className="pl-9" />
        </div>
        <Select name="frecuencia" defaultValue={sp.frecuencia ?? ""}>
          <option value="">Toda frecuencia</option>
          {Object.entries(FREQUENCY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
        <Select name="cobrador" defaultValue={sp.cobrador ?? ""}>
          <option value="">Todos los cobradores</option>
          {(collectors ?? []).map((c) => <option key={c.id} value={c.id}>{c.full_name}</option>)}
        </Select>
        <Button type="submit" variant="secondary">Filtrar</Button>
      </form>

      <Card>
        {!loans?.length ? <EmptyState icon={HandCoins} title="No hay préstamos en esta vista" /> : (
          <>
            <ul className="divide-y divide-sand-border md:hidden">
              {loans.map((l) => (
                <li key={l.id}>
                  <Link href={`/prestamos/${l.id}`} className="flex items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{l.client_name}</p>
                      <p className="text-xs text-ink-muted tabular-nums">{l.code} · {FREQUENCY_LABEL[l.frequency]} · {l.paid_count}/{l.term_count}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold tabular-nums">{m(l.balance_due)}</p>
                      {l.days_overdue > 0 ? <Badge tone="danger">{l.days_overdue} d</Badge> : <Badge tone={toneForStatus(l.status)}>{LOAN_STATUS_LABEL[l.status]}</Badge>}
                    </div>
                    <ChevronRight strokeWidth={1.75} className="size-4 text-ink-faint" />
                  </Link>
                </li>
              ))}
            </ul>
            <TableWrap className="hidden md:block">
              <Table>
                <thead>
                  <tr><Th className="sticky left-0 z-10">Código</Th><Th>Cliente</Th><Th>Frecuencia</Th><Th align="right">Capital</Th><Th align="right">Cuota</Th>
                    <Th align="right">Saldo</Th><Th align="right">Vencido</Th><Th>Avance</Th><Th>Próximo</Th><Th>Estado</Th><Th>Cobrador</Th><Th /></tr>
                </thead>
                <tbody>
                  {loans.map((l) => (
                    <Tr key={l.id}>
                      <Td className="sticky left-0 bg-surface"><Link href={`/prestamos/${l.id}`} className="font-medium tabular-nums hover:text-brand">{l.code}</Link></Td>
                      <Td><Link href={`/clientes/${l.client_id}`} className="hover:text-brand">{l.client_name}</Link></Td>
                      <Td className="text-ink-muted">{FREQUENCY_LABEL[l.frequency]}</Td>
                      <Td align="right">{m(l.principal_amount)}</Td>
                      <Td align="right">{m(l.installment_amount)}</Td>
                      <Td align="right" className="font-medium">{m(l.balance_due)}</Td>
                      <Td align="right" className={l.overdue_amount > 0 ? "text-danger" : "text-ink-faint"}>{l.overdue_amount > 0 ? m(l.overdue_amount) : "—"}</Td>
                      <Td className="min-w-28"><div className="flex items-center gap-2"><Progress value={(l.paid_count / l.term_count) * 100} /><span className="text-xs tabular-nums text-ink-muted">{l.paid_count}/{l.term_count}</span></div></Td>
                      <Td className="tabular-nums">{formatDate(l.next_due_date)}</Td>
                      <Td>{l.days_overdue > 0 && l.status === "activo" ? <Badge tone="danger">{l.days_overdue} d atraso</Badge> : <Badge tone={toneForStatus(l.status)}>{LOAN_STATUS_LABEL[l.status]}</Badge>}</Td>
                      <Td className="text-ink-muted">{l.collector_name ?? "—"}</Td>
                      <Td><LoanPeek loanId={l.id} code={l.code} today={today} /></Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
          </>
        )}
      </Card>
      {pages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="tabular-nums text-ink-muted">Página {page} de {pages}</span>
          <div className="flex gap-2">
            {page > 1 && <Link className={buttonVariants({ variant: "secondary", size: "sm" })} href={pageHref(page - 1)}>Anterior</Link>}
            {page < pages && <Link className={buttonVariants({ variant: "secondary", size: "sm" })} href={pageHref(page + 1)}>Siguiente</Link>}
          </div>
        </div>
      )}
    </>
  );
}
