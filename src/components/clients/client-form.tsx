"use client";
import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { Alert } from "@/components/ui/misc";
import { saveClient } from "@/app/(dashboard)/clientes/actions";
import type { Client, Profile } from "@/types/database";

export function ClientForm({ client, collectors }: { client?: Client; collectors: Pick<Profile, "id" | "full_name">[] }) {
  const router = useRouter();
  const [state, action] = useActionState(saveClient, null);
  useEffect(() => {
    if (state?.ok) router.push(`/clientes/${state.data.id}`);
  }, [state, router]);
  const refs = client?.references_json ?? [];

  return (
    <form action={action} className="space-y-4">
      {client ? <input type="hidden" name="id" value={client.id} /> : null}
      <Card>
        <CardHeader><div><CardTitle>Datos personales</CardTitle><CardDescription>Identificación y contacto principal</CardDescription></div></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Tipo de documento">
            <Select name="document_type" defaultValue={client?.document_type ?? "DNI"}>
              {["DNI", "RUC", "CE", "CEDULA", "PASAPORTE", "OTRO"].map((d) => <option key={d}>{d}</option>)}
            </Select>
          </Field>
          <Field label="Número de documento"><Input name="document_number" required inputMode="numeric" defaultValue={client?.document_number} /></Field>
          <Field label="Nombres"><Input name="first_name" required defaultValue={client?.first_name} /></Field>
          <Field label="Apellidos"><Input name="last_name" required defaultValue={client?.last_name} /></Field>
          <Field label="Teléfono principal (WhatsApp)"><Input name="phone" required inputMode="tel" defaultValue={client?.phone} /></Field>
          <Field label="Teléfono secundario"><Input name="phone_secondary" inputMode="tel" defaultValue={client?.phone_secondary ?? ""} /></Field>
          <Field label="Correo"><Input name="email" type="email" defaultValue={client?.email ?? ""} /></Field>
          <Field label="Cobrador asignado">
            <Select name="assigned_collector_id" defaultValue={client?.assigned_collector_id ?? ""}>
              <option value="">Sin asignar</option>
              {collectors.map((c) => <option key={c.id} value={c.id}>{c.full_name}</option>)}
            </Select>
          </Field>
          <Field label="Dirección exacta" className="sm:col-span-2"><Input name="address" required defaultValue={client?.address} /></Field>
          <Field label="Referencia de ubicación"><Input name="address_reference" placeholder="Frente al mercado…" defaultValue={client?.address_reference ?? ""} /></Field>
          <Field label="Zona / Ruta"><Input name="zone" defaultValue={client?.zone ?? ""} /></Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><div><CardTitle>Actividad económica</CardTitle></div></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <Field label="Ocupación"><Input name="occupation" defaultValue={client?.occupation ?? ""} /></Field>
          <Field label="Negocio"><Input name="business_name" defaultValue={client?.business_name ?? ""} /></Field>
          <Field label="Ingresos mensuales estimados"><Input name="monthly_income" type="number" step="0.01" min="0" defaultValue={client?.monthly_income ?? ""} /></Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><div><CardTitle>Aval / Garante</CardTitle><CardDescription>Obligatorio según el monto configurado en Ajustes</CardDescription></div></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <Field label="Nombre completo" className="lg:col-span-2"><Input name="guarantor_name" defaultValue={client?.guarantor_name ?? ""} /></Field>
          <Field label="Documento"><Input name="guarantor_document" defaultValue={client?.guarantor_document ?? ""} /></Field>
          <Field label="Teléfono"><Input name="guarantor_phone" inputMode="tel" defaultValue={client?.guarantor_phone ?? ""} /></Field>
          <Field label="Parentesco"><Input name="guarantor_relationship" defaultValue={client?.guarantor_relationship ?? ""} /></Field>
          <Field label="Dirección del aval" className="sm:col-span-2 lg:col-span-5"><Input name="guarantor_address" defaultValue={client?.guarantor_address ?? ""} /></Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><div><CardTitle>Referencias personales</CardTitle></div></CardHeader>
        <CardContent className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="grid gap-3 sm:grid-cols-3">
              <Input name={`ref_name_${i}`} placeholder={`Referencia ${i + 1} — nombre`} defaultValue={refs[i]?.name ?? ""} />
              <Input name={`ref_phone_${i}`} placeholder="Teléfono" inputMode="tel" defaultValue={refs[i]?.phone ?? ""} />
              <Input name={`ref_rel_${i}`} placeholder="Relación" defaultValue={refs[i]?.relationship ?? ""} />
            </div>
          ))}
          <Field label="Observaciones"><Textarea name="notes" defaultValue={client?.notes ?? ""} /></Field>
        </CardContent>
      </Card>

      {state && !state.ok ? <Alert tone="danger">{state.error}</Alert> : null}
      <div className="flex justify-end gap-2">
        <SubmitButton size="lg">{client ? "Guardar cambios" : "Registrar cliente"}</SubmitButton>
      </div>
    </form>
  );
}
