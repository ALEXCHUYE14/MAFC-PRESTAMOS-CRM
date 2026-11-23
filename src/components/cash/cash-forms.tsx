"use client";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/misc";
import { useMoney } from "@/components/ui/money";
import { CASH_CATEGORY_LABEL, MANUAL_CASH_CATEGORIES } from "@/lib/constants";
import { addMovement, closeCash, forceClose, openCash } from "@/app/(dashboard)/caja/actions";

export function OpenCashForm() {
  const [state, action] = useActionState(openCash, null);
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
      <Field label="Monto de apertura (fondo de caja)"><Input name="opening_amount" type="number" step="0.01" min="0" defaultValue="0" inputMode="decimal" /></Field>
      <Field label="Sucursal"><Input name="branch" defaultValue="Principal" /></Field>
      <SubmitButton>Abrir caja</SubmitButton>
      {state && !state.ok && <div className="sm:col-span-3"><Alert tone="danger">{state.error}</Alert></div>}
    </form>
  );
}

export function MovementForm({ isAdmin }: { isAdmin: boolean }) {
  const [state, action] = useActionState(addMovement, null);
  const form = useRef<HTMLFormElement>(null);
  const [type, setType] = useState<"ingreso" | "egreso">("egreso");
  useEffect(() => { if (state?.ok) form.current?.reset(); }, [state]);
  const cats = MANUAL_CASH_CATEGORIES.filter((c) => isAdmin || !["inyeccion_capital", "retiro_utilidad"].includes(c))
    .filter((c) => type === "ingreso" ? c !== "retiro_utilidad" && c !== "gasto_operativo" : c !== "inyeccion_capital");
  return (
    <form ref={form} action={action} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Tipo">
          <Select name="movement_type" value={type} onChange={(e) => setType(e.target.value as "ingreso" | "egreso")}>
            <option value="egreso">Egreso</option><option value="ingreso">Ingreso</option>
          </Select>
        </Field>
        <Field label="Categoría">
          <Select name="category">{cats.map((c) => <option key={c} value={c}>{CASH_CATEGORY_LABEL[c]}</option>)}</Select>
        </Field>
      </div>
      <Field label="Monto"><Input name="amount" type="number" step="0.01" min="0.01" required inputMode="decimal" /></Field>
      <Field label="Descripción"><Input name="description" required placeholder="Ej. Movilidad de cobrador, útiles…" /></Field>
      {state && !state.ok && <Alert tone="danger">{state.error}</Alert>}
      {state?.ok && <Alert tone="ok">Movimiento registrado.</Alert>}
      <SubmitButton variant="secondary" className="w-full">Registrar movimiento</SubmitButton>
    </form>
  );
}

export function CloseCashForm({ expected }: { expected: number }) {
  const { fmt } = useMoney();
  const [state, action] = useActionState(closeCash, null);
  const [counted, setCounted] = useState("");
  const diff = counted === "" ? null : Number(counted) - expected;
  if (state?.ok) {
    const d = state.data.difference;
    return (
      <div className="space-y-2">
        <Alert tone={Math.abs(d) < 0.005 ? "ok" : "warn"}>
          Caja cerrada. Esperado {fmt(state.data.expected)} · Contado {fmt(state.data.counted)} ·
          {Math.abs(d) < 0.005 ? " Cuadre exacto." : d > 0 ? ` Sobrante ${fmt(d)}.` : ` Faltante ${fmt(-d)}.`}
        </Alert>
      </div>
    );
  }
  return (
    <form action={action} className="space-y-3">
      <Field label="Efectivo contado (arqueo)"><Input name="counted_amount" type="number" step="0.01" min="0" required inputMode="decimal"
        value={counted} onChange={(e) => setCounted(e.target.value)} className="h-12 text-lg font-semibold tabular-nums" /></Field>
      {diff !== null && (
        <p className={`text-sm tabular-nums ${Math.abs(diff) < 0.005 ? "text-ok" : diff > 0 ? "text-warn" : "text-danger"}`}>
          {Math.abs(diff) < 0.005 ? "Cuadra exacto" : diff > 0 ? `Sobrante ${fmt(diff)}` : `Faltante ${fmt(-diff)}`}
        </p>
      )}
      <Field label="Observaciones"><Textarea name="notes" className="min-h-[60px]" /></Field>
      {state && !state.ok && <Alert tone="danger">{state.error}</Alert>}
      <SubmitButton variant="danger" className="w-full">Cerrar caja</SubmitButton>
    </form>
  );
}

export function ForceCloseButton({ sessionId, expected }: { sessionId: string; expected: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button size="sm" variant="danger-outline" disabled={pending} onClick={() => {
      const v = prompt("Monto contado para el cierre:", expected.toFixed(2));
      if (v === null) return;
      start(async () => { const r = await forceClose(sessionId, Number(v)); if (!r.ok) alert(r.error); router.refresh(); });
    }}>Cerrar</Button>
  );
}
