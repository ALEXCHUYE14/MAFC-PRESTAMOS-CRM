"use client";
import { useActionState, useEffect, useRef, useState } from "react";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { Alert } from "@/components/ui/misc";
import { CONTACT_RESULT_LABEL } from "@/lib/constants";
import { addCollectionNote } from "@/app/(dashboard)/clientes/actions";
import type { ContactResult } from "@/types/database";

export function CollectionNoteForm({ clientId, loanId, onDone }: { clientId: string; loanId?: string; onDone?: () => void }) {
  const [state, action] = useActionState(addCollectionNote, null);
  const [result, setResult] = useState<ContactResult>("contactado");
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) { form.current?.reset(); setResult("contactado"); onDone?.(); }
  }, [state, onDone]);

  return (
    <form ref={form} action={action} className="space-y-3">
      <input type="hidden" name="client_id" value={clientId} />
      {loanId ? <input type="hidden" name="loan_id" value={loanId} /> : null}
      <Field label="Resultado de la gestión">
        <Select name="contact_result" value={result} onChange={(e) => setResult(e.target.value as ContactResult)}>
          {Object.entries(CONTACT_RESULT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
      </Field>
      {result === "promesa_pago" && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Fecha prometida"><Input type="datetime-local" name="promise_date_local"
            onChange={(e) => { const h = form.current?.elements.namedItem("promise_date") as HTMLInputElement | null; if (h) h.value = e.target.value.slice(0, 10); }} /></Field>
          <Field label="Monto prometido"><Input type="number" step="0.01" min="0" name="promise_amount" /></Field>
          <input type="hidden" name="promise_date" />
        </div>
      )}
      <Field label="Detalle"><Textarea name="notes" placeholder='Ej. "Prometió pagar mañana a las 4 pm en su puesto"' /></Field>
      {state && !state.ok ? <Alert tone="danger">{state.error}</Alert> : null}
      {state?.ok ? <Alert tone="ok">Gestión registrada.</Alert> : null}
      <SubmitButton className="w-full">Registrar gestión</SubmitButton>
    </form>
  );
}
