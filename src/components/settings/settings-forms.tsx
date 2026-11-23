"use client";
import { useActionState, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ImageUp, Loader2, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Field, Input, Select, Switch, Textarea } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { Table, TableWrap, Td, Th, Tr } from "@/components/ui/table";
import { FREQUENCY_LABEL, LATE_FEE_LABEL, COMPONENT_LABEL, type PaymentComponent } from "@/services/finance";
import { renderTemplate, TEMPLATE_LABEL, TEMPLATE_VARIABLES, formatDate } from "@/lib/formatters";
import {
  addHoliday, createUser, removeHoliday, saveBusiness, saveFinancial, saveTemplates, updateUser,
} from "@/app/(dashboard)/ajustes/actions";
import type { ActionResult } from "@/lib/utils";
import type { Holiday, Profile, SystemSettings, UserRole, WhatsappTemplates } from "@/types/database";

function Feedback({ state }: { state: ActionResult | null }) {
  if (!state) return null;
  return state.ok ? <Alert tone="ok">{state.message ?? "Guardado"}</Alert> : <Alert tone="danger">{state.error}</Alert>;
}

// ------------------------------------------------------------------ Negocio y ticket
export function BusinessForm({ s }: { s: SystemSettings }) {
  const [state, action] = useActionState(saveBusiness, null);
  const [logo, setLogo] = useState(s.logo_url ?? "");
  const [uploading, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);

  const upload = (f: File) => start(async () => {
    setErr(null);
    const supabase = createClient();
    const path = `logo-${Date.now()}.${f.name.split(".").pop()}`;
    const { error } = await supabase.storage.from("branding").upload(path, f, { upsert: true, contentType: f.type });
    if (error) { setErr(error.message); return; }
    setLogo(supabase.storage.from("branding").getPublicUrl(path).data.publicUrl);
  });

  return (
    <form action={action}>
      <Card>
        <CardHeader><div><CardTitle>Datos del negocio</CardTitle><CardDescription>Aparecen en recibos, estados de cuenta y mensajes</CardDescription></div></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Nombre comercial"><Input name="business_name" defaultValue={s.business_name} required /></Field>
          <Field label="Razón social"><Input name="legal_name" defaultValue={s.legal_name ?? ""} /></Field>
          <Field label="Identificación fiscal (RUC / NIT)"><Input name="tax_id" defaultValue={s.tax_id ?? ""} /></Field>
          <Field label="Teléfono"><Input name="phone" defaultValue={s.phone ?? ""} /></Field>
          <Field label="Dirección" className="sm:col-span-2"><Input name="address" defaultValue={s.address ?? ""} /></Field>
          <div className="sm:col-span-2">
            <input type="hidden" name="logo_url" value={logo} />
            <p className="mb-1.5 text-xs font-medium text-ink-muted">Logo</p>
            <div className="flex items-center gap-3">
              <div className="flex size-16 items-center justify-center overflow-hidden rounded-md border border-sand-border bg-canvas">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {logo ? <img src={logo} alt="Logo" className="max-h-full max-w-full object-contain" /> : <ImageUp strokeWidth={1.75} className="size-5 text-ink-faint" />}
              </div>
              <input ref={file} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); }} />
              <Button type="button" variant="secondary" onClick={() => file.current?.click()} disabled={uploading}>
                {uploading && <Loader2 strokeWidth={1.75} className="animate-spin" />}Subir logo
              </Button>
              {logo && <Button type="button" variant="ghost" onClick={() => setLogo("")}>Quitar</Button>}
            </div>
            {err && <p className="mt-1 text-xs text-danger">{err}</p>}
          </div>
        </CardContent>
      </Card>
      <Card className="mt-4">
        <CardHeader><div><CardTitle>Ticket térmico</CardTitle></div></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-[200px_1fr]">
          <Field label="Ancho de papel">
            <Select name="receipt_width" defaultValue={String(s.receipt_width)}><option value="80">80 mm</option><option value="58">58 mm</option></Select>
          </Field>
          <Field label="Pie de página del recibo"><Textarea name="receipt_footer" defaultValue={s.receipt_footer ?? ""} className="min-h-[60px]" /></Field>
        </CardContent>
      </Card>
      <div className="mt-4 flex items-center justify-end gap-3"><Feedback state={state} /><SubmitButton>Guardar</SubmitButton></div>
    </form>
  );
}

// ------------------------------------------------------------------ Parámetros financieros
export function FinancialForm({ s }: { s: SystemSettings }) {
  const [state, action] = useActionState(saveFinancial, null);
  const [order, setOrder] = useState<PaymentComponent[]>(s.payment_order);
  const comps: PaymentComponent[] = ["late_fee", "interest", "principal"];
  return (
    <form action={action} className="space-y-4">
      <Card>
        <CardHeader><div><CardTitle>Moneda y región</CardTitle></div></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <Field label="Código ISO"><Input name="currency_code" defaultValue={s.currency_code} maxLength={3} /></Field>
          <Field label="Símbolo"><Input name="currency_symbol" defaultValue={s.currency_symbol} /></Field>
          <Field label="Posición">
            <Select name="currency_position" defaultValue={s.currency_position}><option value="before">Antes (S/ 10)</option><option value="after">Después (10 COP)</option></Select>
          </Field>
          <Field label="Decimales"><Select name="currency_decimals" defaultValue={String(s.currency_decimals)}><option>2</option><option>1</option><option>0</option></Select></Field>
          <Field label="Código país (WhatsApp)"><Input name="phone_country_code" defaultValue={s.phone_country_code} /></Field>
          <Field label="Zona horaria"><Input name="timezone" defaultValue={s.timezone} /></Field>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><div><CardTitle>Valores por defecto del préstamo</CardTitle></div></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3 lg:grid-cols-4">
          <Field label="Tasa de interés %"><Input name="default_interest_rate" type="number" step="0.01" defaultValue={s.default_interest_rate} /></Field>
          <Field label="Modalidad">
            <Select name="default_interest_type" defaultValue={s.default_interest_type}><option value="simple">Simple / Flat</option><option value="frances">Francés</option></Select>
          </Field>
          <Field label="Tasa simple aplicada">
            <Select name="default_flat_rate_mode" defaultValue={s.default_flat_rate_mode}><option value="total">Sobre el total</option><option value="por_periodo">Por periodo</option></Select>
          </Field>
          <Field label="Frecuencia">
            <Select name="default_frequency" defaultValue={s.default_frequency}>{Object.entries(FREQUENCY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
          </Field>
          <Field label="N° de cuotas"><Input name="default_term_count" type="number" min="1" defaultValue={s.default_term_count} /></Field>
          <Field label="Días de gracia"><Input name="default_grace_days" type="number" min="0" defaultValue={s.default_grace_days} /></Field>
          <Field label="Tipo de mora">
            <Select name="default_late_fee_type" defaultValue={s.default_late_fee_type}>{Object.entries(LATE_FEE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
          </Field>
          <Field label="Valor de mora"><Input name="default_late_fee_value" type="number" step="0.01" min="0" defaultValue={s.default_late_fee_value} /></Field>
          <Field label="Tope de mora por cuota"><Input name="default_late_fee_cap" type="number" step="0.01" min="0" defaultValue={s.default_late_fee_cap ?? ""} placeholder="Sin tope" /></Field>
          <Field label="Exigir aval desde (monto)"><Input name="require_guarantor_from" type="number" step="0.01" min="0" defaultValue={s.require_guarantor_from ?? ""} placeholder="Nunca" /></Field>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><div><CardTitle>Reglas de operación</CardTitle></div></CardHeader>
        <CardContent className="divide-y divide-sand-border">
          <Switch name="exclude_sundays_daily" defaultChecked={s.exclude_sundays_daily} label="Excluir domingos en préstamos diarios" description="También se saltan los feriados configurados." />
          <Switch name="allow_partial_payments" defaultChecked={s.allow_partial_payments} label="Permitir abonos parciales" description="Si se desactiva, el mínimo es la cuota vencida del día." />
          <Switch name="allow_late_fee_waiver" defaultChecked={s.allow_late_fee_waiver} label="Permitir condonación de mora en cobro" description="Solo administradores y cajeros." />
          <Switch name="require_open_cash" defaultChecked={s.require_open_cash} label="Exigir caja abierta para cobrar y desembolsar" />
        </CardContent>
      </Card>
      <Card>
        <CardHeader><div><CardTitle>Orden de imputación de pagos</CardTitle><CardDescription>Primero se cubren las cuotas vencidas en este orden; el sobrante va a las siguientes cuotas.</CardDescription></div></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Field key={i} label={`${i + 1}° prioridad`}>
              <Select name={`order_${i + 1}`} value={order[i]} onChange={(e) => {
                const v = e.target.value as PaymentComponent;
                setOrder((o) => { const n = [...o]; const j = n.indexOf(v); n[j] = n[i]; n[i] = v; return n; });
              }}>
                {comps.map((c) => <option key={c} value={c}>{COMPONENT_LABEL[c]}</option>)}
              </Select>
            </Field>
          ))}
        </CardContent>
      </Card>
      <div className="flex items-center justify-end gap-3"><Feedback state={state} /><SubmitButton>Guardar parámetros</SubmitButton></div>
    </form>
  );
}

export function HolidaysCard({ holidays }: { holidays: Holiday[] }) {
  const [state, action] = useActionState(addHoliday, null);
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Card>
      <CardHeader><div><CardTitle>Feriados</CardTitle><CardDescription>Las cuotas que caigan en estas fechas pasan al siguiente día hábil</CardDescription></div></CardHeader>
      <CardContent>
        <form action={action} className="grid gap-2 sm:grid-cols-[180px_1fr_auto]">
          <Input type="date" name="holiday_date" required />
          <Input name="description" placeholder="Descripción" />
          <SubmitButton variant="secondary">Agregar</SubmitButton>
        </form>
        {state && !state.ok && <div className="mt-2"><Alert tone="danger">{state.error}</Alert></div>}
        <ul className="mt-3 divide-y divide-sand-border">
          {holidays.map((h) => (
            <li key={h.holiday_date} className="flex items-center gap-3 py-2 text-sm">
              <span className="w-24 tabular-nums">{formatDate(h.holiday_date)}</span><span className="flex-1 text-ink-muted">{h.description}</span>
              <button disabled={pending} className="rounded-md p-1.5 text-ink-muted hover:bg-danger-bg hover:text-danger" aria-label="Eliminar"
                onClick={() => start(async () => { await removeHoliday(h.holiday_date); router.refresh(); })}><Trash2 strokeWidth={1.75} className="size-4" /></button>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

// ------------------------------------------------------------------ Usuarios
const ROLE_DESC: Record<UserRole, string> = {
  admin: "Acceso total, ajustes, anulaciones y reportes",
  cajero: "Desembolsos, cobros en ventanilla, su caja y clientes",
  cobrador: "Solo su cartera: abonos y gestiones en campo",
};

export function UsersCard({ users, meId }: { users: Profile[]; meId: string }) {
  const [state, action] = useActionState(createUser, null);
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const patch = (id: string, p: Parameters<typeof updateUser>[1]) => start(async () => {
    const r = await updateUser(id, p); setErr(r.ok ? null : r.error); router.refresh();
  });
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><div><CardTitle>Equipo</CardTitle><CardDescription>Roles y acceso (RBAC aplicado también en la base de datos con RLS)</CardDescription></div></CardHeader>
        {err && <div className="px-5 pt-3"><Alert tone="danger">{err}</Alert></div>}
        <TableWrap><Table>
          <thead><tr><Th>Nombre</Th><Th>Teléfono</Th><Th>Rol</Th><Th>Zona</Th><Th>Estado</Th></tr></thead>
          <tbody>{users.map((u) => (
            <Tr key={u.id}>
              <Td className="font-medium">{u.full_name}{u.id === meId && <Badge tone="brand" className="ml-2">Usted</Badge>}</Td>
              <Td className="tabular-nums text-ink-muted">{u.phone ?? "—"}</Td>
              <Td>
                <Select value={u.role} disabled={pending} className="h-9 w-36" onChange={(e) => patch(u.id, { role: e.target.value as UserRole })}>
                  <option value="admin">Administrador</option><option value="cajero">Cajero</option><option value="cobrador">Cobrador</option>
                </Select>
              </Td>
              <Td><Input defaultValue={u.zone ?? ""} className="h-9 w-32" onBlur={(e) => e.target.value !== (u.zone ?? "") && patch(u.id, { zone: e.target.value || null })} /></Td>
              <Td>
                <button disabled={pending} onClick={() => patch(u.id, { active: !u.active })}>
                  <Badge tone={u.active ? "ok" : "danger"}>{u.active ? "Activo" : "Inactivo"}</Badge>
                </button>
              </Td>
            </Tr>
          ))}</tbody>
        </Table></TableWrap>
      </Card>
      <Card>
        <CardHeader><div><CardTitle>Nuevo usuario</CardTitle><CardDescription>Requiere SUPABASE_SERVICE_ROLE_KEY en el servidor</CardDescription></div></CardHeader>
        <CardContent>
          <form action={action} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Nombre completo"><Input name="full_name" required /></Field>
            <Field label="Correo"><Input name="email" type="email" required /></Field>
            <Field label="Contraseña temporal"><Input name="password" type="text" minLength={8} required /></Field>
            <Field label="Teléfono"><Input name="phone" /></Field>
            <Field label="Zona / Ruta"><Input name="zone" /></Field>
            <Field label="Rol">
              <Select name="role" defaultValue="cobrador">
                {(Object.keys(ROLE_DESC) as UserRole[]).map((r) => <option key={r} value={r}>{r[0].toUpperCase() + r.slice(1)} — {ROLE_DESC[r]}</option>)}
              </Select>
            </Field>
            <div className="flex items-center justify-end gap-3 sm:col-span-2 lg:col-span-3"><Feedback state={state} /><SubmitButton>Crear usuario</SubmitButton></div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

// ------------------------------------------------------------------ Plantillas WhatsApp
const SAMPLE = {
  cliente: "María", negocio: "Mi Financiera", monto_cuota: "S/ 50.00", saldo_total: "S/ 850.00",
  fecha_vencimiento: "24/11/2026", dias_mora: 3, link_recibo: "https://…/recibo/REC-0042",
};

export function TemplatesForm({ templates, businessName }: { templates: WhatsappTemplates; businessName: string }) {
  const [state, action] = useActionState(saveTemplates, null);
  const [values, setValues] = useState(templates);
  const refs = useRef<Record<string, HTMLTextAreaElement | null>>({});
  const insert = (key: keyof WhatsappTemplates, v: string) => {
    const el = refs.current[key];
    const token = `{${v}}`;
    const cur = values[key];
    const pos = el?.selectionStart ?? cur.length;
    const next = cur.slice(0, pos) + token + cur.slice(el?.selectionEnd ?? pos);
    setValues((s) => ({ ...s, [key]: next }));
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(pos + token.length, pos + token.length); });
  };
  return (
    <form action={action} className="space-y-4">
      {(Object.keys(TEMPLATE_LABEL) as (keyof WhatsappTemplates)[]).map((k) => (
        <Card key={k}>
          <CardHeader><CardTitle>{TEMPLATE_LABEL[k]}</CardTitle></CardHeader>
          <CardContent className="grid gap-4 lg:grid-cols-2">
            <div>
              <Textarea ref={(el) => { refs.current[k] = el; }} name={k} value={values[k]} onChange={(e) => setValues((s) => ({ ...s, [k]: e.target.value }))} className="min-h-[110px]" />
              <div className="mt-2 flex flex-wrap gap-1.5">
                {TEMPLATE_VARIABLES.map((v) => (
                  <button type="button" key={v} onClick={() => insert(k, v)}
                    className="rounded-sm border border-sand-border bg-canvas px-2 py-1 font-mono text-[11px] text-ink-muted hover:border-brand hover:text-brand">{`{${v}}`}</button>
                ))}
              </div>
            </div>
            <div className="rounded-lg bg-[#EFEAE2] p-3">
              <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-ink-faint">Vista previa</p>
              <div className="max-w-sm whitespace-pre-wrap rounded-lg rounded-tl-none bg-white px-3 py-2 text-sm shadow-card">
                {renderTemplate(values[k], { ...SAMPLE, negocio: businessName })}
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
      <div className="flex items-center justify-end gap-3"><Feedback state={state} /><SubmitButton>Guardar plantillas</SubmitButton></div>
    </form>
  );
}
