import Link from "next/link";
import { notFound } from "next/navigation";
import { HandCoins, MapPin, MessageCircle, Pencil, Phone, ShieldCheck, UserRound } from "lucide-react";
import { requireProfile, getSettings } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatMoney, whatsappLink } from "@/lib/formatters";
import { LOAN_STATUS_LABEL } from "@/lib/constants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge, toneForStatus } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { PageHeader, Progress, Stat, Alert } from "@/components/ui/misc";
import { Table, TableWrap, Td, Th, Tr } from "@/components/ui/table";
import { ScoreBadge } from "@/components/clients/score-badge";
import { DocumentVault } from "@/components/clients/document-vault";
import { ClientStatusActions } from "@/components/clients/client-status-actions";
import { CollectionNoteForm } from "@/components/payments/collection-note-form";
import { NotesTimeline } from "@/components/payments/notes-timeline";

export default async function ClientePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await requireProfile();
  const settings = await getSettings();
  const supabase = await createClient();

  const [{ data: c }, { data: loans }, { data: docs }, { data: notes }, { data: people }] = await Promise.all([
    supabase.from("clients").select("*").eq("id", id).single(),
    supabase.from("v_loan_portfolio").select("*").eq("client_id", id).order("disbursed_at", { ascending: false }),
    supabase.from("client_documents").select("*").eq("client_id", id).order("created_at", { ascending: false }),
    supabase.from("collection_notes").select("*").eq("client_id", id).order("created_at", { ascending: false }).limit(30),
    supabase.from("profiles").select("id, full_name"),
  ]);
  if (!c) notFound();

  const signed = docs?.length
    ? (await supabase.storage.from("client-docs").createSignedUrls(docs.map((d) => d.storage_path), 3600)).data ?? []
    : [];
  const vault = (docs ?? []).map((d, i) => ({ id: d.id, kind: d.kind, created_at: d.created_at, url: signed[i]?.signedUrl ?? null }));
  const authors = Object.fromEntries((people ?? []).map((p) => [p.id, p.full_name]));
  const m = (v: number) => formatMoney(v, settings);
  const active = (loans ?? []).filter((l) => l.status === "activo");
  const debt = active.reduce((a, l) => a + l.balance_due + l.late_fee_pending, 0);
  const name = `${c.first_name} ${c.last_name}`;
  const msg = `Hola ${c.first_name}, le saluda ${settings.business_name}.`;

  return (
    <>
      <PageHeader
        title={name}
        description={`${c.code ?? ""} · ${c.document_type} ${c.document_number}`}
        actions={
          <>
            <a href={whatsappLink(c.phone, msg, settings.phone_country_code)} target="_blank" rel="noreferrer" className={buttonVariants({ variant: "secondary" })}>
              <MessageCircle strokeWidth={1.75} />WhatsApp</a>
            <a href={`tel:${c.phone}`} className={buttonVariants({ variant: "secondary" })}><Phone strokeWidth={1.75} />Llamar</a>
            {profile.role !== "cobrador" && (
              <>
                <Link href={`/clientes/${c.id}/editar`} className={buttonVariants({ variant: "secondary" })}><Pencil strokeWidth={1.75} />Editar</Link>
                <ClientStatusActions clientId={c.id} status={c.status} />
                {c.status !== "bloqueado" && (
                  <Link href={`/prestamos/nuevo?cliente=${c.id}`} className={buttonVariants()}><HandCoins strokeWidth={1.75} />Nuevo préstamo</Link>
                )}
              </>
            )}
          </>
        }
      />
      {c.status === "bloqueado" && <div className="mb-4"><Alert tone="danger">Cliente en lista negra. No puede recibir nuevos desembolsos.</Alert></div>}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Stat label="Score interno" value={<ScoreBadge score={c.credit_score} status={c.status} />} />
              <Stat label="Deuda vigente" value={m(debt)} tone={debt > 0 ? "warn" : undefined} />
              <Stat label="Préstamos activos" value={active.length} />
              <Stat label="Historial" value={`${loans?.length ?? 0} préstamos`} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Préstamos</CardTitle></CardHeader>
            {loans?.length ? (
              <TableWrap>
                <Table>
                  <thead><tr><Th>Código</Th><Th>Estado</Th><Th align="right">Capital</Th><Th align="right">Saldo</Th><Th>Avance</Th><Th>Atraso</Th><Th>Desembolso</Th></tr></thead>
                  <tbody>
                    {loans.map((l) => (
                      <Tr key={l.id}>
                        <Td><Link href={`/prestamos/${l.id}`} className="font-medium tabular-nums hover:text-brand">{l.code}</Link></Td>
                        <Td><Badge tone={toneForStatus(l.status)}>{LOAN_STATUS_LABEL[l.status]}</Badge></Td>
                        <Td align="right">{m(l.principal_amount)}</Td>
                        <Td align="right">{m(l.balance_due)}</Td>
                        <Td className="min-w-28"><Progress value={(l.paid_count / l.term_count) * 100} /></Td>
                        <Td>{l.days_overdue > 0 ? <Badge tone="danger">{l.days_overdue} d</Badge> : <span className="text-ink-faint">—</span>}</Td>
                        <Td className="tabular-nums text-ink-muted">{formatDate(l.disbursed_at)}</Td>
                      </Tr>
                    ))}
                  </tbody>
                </Table>
              </TableWrap>
            ) : <CardContent><p className="text-sm text-ink-muted">Sin préstamos.</p></CardContent>}
          </Card>

          <Card>
            <CardHeader><CardTitle>Bóveda documental</CardTitle></CardHeader>
            <CardContent><DocumentVault clientId={c.id} docs={vault} /></CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Bitácora de cobranza</CardTitle></CardHeader>
            <CardContent><NotesTimeline notes={notes ?? []} authors={authors} /></CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Contacto y ubicación</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p className="flex gap-2"><Phone strokeWidth={1.75} className="mt-0.5 size-4 shrink-0 text-ink-faint" />
                <span className="tabular-nums">{c.phone}{c.phone_secondary ? ` · ${c.phone_secondary}` : ""}</span></p>
              <p className="flex gap-2"><MapPin strokeWidth={1.75} className="mt-0.5 size-4 shrink-0 text-ink-faint" />
                <span>{c.address}{c.address_reference ? <span className="block text-ink-muted">Ref.: {c.address_reference}</span> : null}
                  {c.zone ? <span className="block text-ink-muted">Zona: {c.zone}</span> : null}</span></p>
              <a className="text-xs font-medium text-brand" target="_blank" rel="noreferrer"
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(c.address)}`}>Abrir en mapas</a>
              <p className="flex gap-2"><UserRound strokeWidth={1.75} className="mt-0.5 size-4 shrink-0 text-ink-faint" />
                <span>{c.occupation ?? "—"}{c.business_name ? ` · ${c.business_name}` : ""}
                  {c.monthly_income ? <span className="block text-ink-muted">Ingresos: {m(c.monthly_income)}</span> : null}</span></p>
              <p className="text-xs text-ink-muted">Cobrador: {authors[c.assigned_collector_id ?? ""] ?? "Sin asignar"}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck strokeWidth={1.75} className="size-4" />Aval y referencias</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              {c.guarantor_name ? (
                <div>
                  <p className="font-medium">{c.guarantor_name}</p>
                  <p className="text-ink-muted tabular-nums">{c.guarantor_document ?? ""} · {c.guarantor_phone ?? ""}</p>
                  <p className="text-ink-muted">{c.guarantor_relationship ?? ""} {c.guarantor_address ? `· ${c.guarantor_address}` : ""}</p>
                </div>
              ) : <p className="text-ink-muted">Sin aval registrado.</p>}
              {c.references_json.map((r, i) => (
                <div key={i} className="border-t border-sand-border pt-2">
                  <p className="font-medium">{r.name}</p>
                  <p className="text-ink-muted tabular-nums">{r.phone}{r.relationship ? ` · ${r.relationship}` : ""}</p>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Registrar gestión</CardTitle></CardHeader>
            <CardContent><CollectionNoteForm clientId={c.id} loanId={active[0]?.id} /></CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
