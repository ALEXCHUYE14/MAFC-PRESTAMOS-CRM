import Link from "next/link";
import { Plus, Search, Users, Phone, ChevronRight } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/form";
import { buttonVariants, Button } from "@/components/ui/button";
import { Badge, toneForStatus } from "@/components/ui/badge";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { Table, TableWrap, Td, Th, Tr } from "@/components/ui/table";
import { ScoreBadge } from "@/components/clients/score-badge";
import { formatDate } from "@/lib/formatters";

export const metadata = { title: "Clientes" };
const PAGE = 30;

export default async function ClientesPage({ searchParams }: { searchParams: Promise<{ q?: string; estado?: string; page?: string }> }) {
  const sp = await searchParams;
  const profile = await requireProfile();
  const supabase = await createClient();
  const page = Math.max(1, Number(sp.page ?? 1));

  let query = supabase.from("clients").select("*", { count: "exact" }).order("created_at", { ascending: false })
    .range((page - 1) * PAGE, page * PAGE - 1);
  if (sp.q) {
    const q = sp.q.replace(/[%,()]/g, " ").trim();
    query = query.or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,document_number.ilike.%${q}%,phone.ilike.%${q}%,code.ilike.%${q}%`);
  }
  if (sp.estado) query = query.eq("status", sp.estado as "activo");
  const { data: clients, count } = await query;
  const pages = Math.max(1, Math.ceil((count ?? 0) / PAGE));
  const qs = (p: number) => `/clientes?${new URLSearchParams({ ...(sp.q ? { q: sp.q } : {}), ...(sp.estado ? { estado: sp.estado } : {}), page: String(p) })}`;

  return (
    <>
      <PageHeader title="Clientes" description={`${count ?? 0} clientes registrados`}
        actions={profile.role !== "cobrador" ? <Link href="/clientes/nuevo" className={buttonVariants()}><Plus strokeWidth={1.75} />Nuevo cliente</Link> : null} />

      <form className="mb-4 flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search strokeWidth={1.75} className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
          <Input data-search name="q" defaultValue={sp.q} placeholder="Buscar por nombre, documento, teléfono o código  ( / )" className="pl-9" />
        </div>
        <Select name="estado" defaultValue={sp.estado ?? ""} className="sm:w-44">
          <option value="">Todos los estados</option>
          <option value="activo">Activo</option><option value="inactivo">Inactivo</option><option value="bloqueado">Bloqueado</option>
        </Select>
        <Button variant="secondary" type="submit">Filtrar</Button>
      </form>

      <Card>
        {!clients?.length ? (
          <EmptyState icon={Users} title="No hay clientes" description={sp.q ? "Pruebe con otro término de búsqueda." : "Registre su primer cliente para empezar."} />
        ) : (
          <>
            <ul className="divide-y divide-sand-border md:hidden">
              {clients.map((c) => (
                <li key={c.id}>
                  <Link href={`/clientes/${c.id}`} className="flex items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{c.first_name} {c.last_name}</p>
                      <p className="truncate text-xs text-ink-muted">{c.document_type} {c.document_number} · {c.zone ?? c.address}</p>
                      <div className="mt-1"><ScoreBadge score={c.credit_score} status={c.status} /></div>
                    </div>
                    <ChevronRight strokeWidth={1.75} className="size-4 text-ink-faint" />
                  </Link>
                </li>
              ))}
            </ul>
            <TableWrap className="hidden md:block">
              <Table>
                <thead><tr><Th>Código</Th><Th>Cliente</Th><Th>Documento</Th><Th>Teléfono</Th><Th>Zona</Th><Th>Score</Th><Th>Estado</Th><Th>Alta</Th></tr></thead>
                <tbody>
                  {clients.map((c) => (
                    <Tr key={c.id}>
                      <Td className="tabular-nums text-ink-muted">{c.code}</Td>
                      <Td><Link className="font-medium hover:text-brand" href={`/clientes/${c.id}`}>{c.first_name} {c.last_name}</Link></Td>
                      <Td className="tabular-nums">{c.document_type} {c.document_number}</Td>
                      <Td><span className="inline-flex items-center gap-1 tabular-nums"><Phone strokeWidth={1.75} className="size-3.5 text-ink-faint" />{c.phone}</span></Td>
                      <Td className="text-ink-muted">{c.zone ?? "—"}</Td>
                      <Td><ScoreBadge score={c.credit_score} status={c.status} /></Td>
                      <Td><Badge tone={toneForStatus(c.status)}>{c.status}</Badge></Td>
                      <Td className="tabular-nums text-ink-muted">{formatDate(c.created_at)}</Td>
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
          <span className="text-ink-muted tabular-nums">Página {page} de {pages}</span>
          <div className="flex gap-2">
            {page > 1 && <Link className={buttonVariants({ variant: "secondary", size: "sm" })} href={qs(page - 1)}>Anterior</Link>}
            {page < pages && <Link className={buttonVariants({ variant: "secondary", size: "sm" })} href={qs(page + 1)}>Siguiente</Link>}
          </div>
        </div>
      )}
    </>
  );
}
