"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ban, Loader2, ShieldAlert } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/form";
import { Alert } from "@/components/ui/misc";
import { useMoney } from "@/components/ui/money";
import { voidLoan, writeOffLoan } from "@/app/(dashboard)/prestamos/actions";

type Mode = "anular" | "castigar";

const COPY: Record<Mode, { title: string; button: string; confirm: string }> = {
  anular: {
    title: "Anular préstamo",
    button: "Anular",
    confirm: "Confirmo que el desembolso fue un error y debe revertirse",
  },
  castigar: {
    title: "Castigar préstamo",
    button: "Castigar",
    confirm: "Confirmo que la deuda se considera incobrable",
  },
};

/**
 * Acciones irreversibles del administrador sobre un préstamo activo.
 * La validación real (rol, estado, pagos vigentes, caja) la hace la base de datos.
 */
export function LoanAdminActions({ loanId, loanCode, netDisbursed, balanceDue, hasPayments, isRefinancing, previousCode }: {
  loanId: string; loanCode: string; netDisbursed: number; balanceDue: number;
  hasPayments: boolean; isRefinancing: boolean; previousCode: string | null;
}) {
  const router = useRouter();
  const { fmt } = useMoney();
  const [mode, setMode] = useState<Mode | null>(null);
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const close = () => { setMode(null); setReason(""); setConfirmed(false); setError(null); };
  const valid = reason.trim().length >= 5 && confirmed;

  const submit = () => start(async () => {
    if (!mode || !valid) return;
    setError(null);
    const r = mode === "anular" ? await voidLoan(loanId, reason) : await writeOffLoan(loanId, reason);
    if (!r.ok) { setError(r.error); return; }
    close();
    router.refresh();
  });

  return (
    <Sheet open={mode !== null} onOpenChange={(o) => { if (!o) close(); }}>
      <div className="flex gap-2">
        <SheetTrigger asChild>
          <Button variant="danger-outline" onClick={() => setMode("anular")}><Ban strokeWidth={1.75} />Anular</Button>
        </SheetTrigger>
        <SheetTrigger asChild>
          <Button variant="danger-outline" onClick={() => setMode("castigar")}><ShieldAlert strokeWidth={1.75} />Castigar</Button>
        </SheetTrigger>
      </div>
      {mode && (
        <SheetContent title={COPY[mode].title} description={loanCode}>
          <div className="space-y-4">
            {mode === "anular" ? (
              hasPayments ? (
                <Alert tone="danger">
                  Este préstamo tiene pagos vigentes. Anule primero cada pago desde &quot;Recibos emitidos&quot;; luego podrá anular el préstamo.
                </Alert>
              ) : (
                <Alert tone="warn">
                  Úselo solo si el préstamo se registró por error. Se marcará como <strong>anulado</strong> y
                  {netDisbursed > 0 ? <> se registrará un <strong>ingreso de {fmt(netDisbursed)}</strong> en su caja (devolución del desembolso)</> : " no habrá movimiento de caja"}.
                  {isRefinancing && <> El préstamo anterior <strong>{previousCode ?? ""}</strong> volverá a quedar <strong>activo</strong> con su saldo original.</>}
                </Alert>
              )
            ) : (
              <Alert tone="warn">
                El préstamo saldrá de la cartera activa como <strong>castigado</strong> con un saldo incobrable de
                <strong> {fmt(balanceDue)}</strong>. No mueve caja y ya no podrá recibir cobros. Afecta el score del cliente.
              </Alert>
            )}

            {!(mode === "anular" && hasPayments) && (
              <>
                <Field label="Motivo" hint="Obligatorio. Queda registrado en la auditoría." htmlFor="admin-reason">
                  <Textarea id="admin-reason" rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)}
                    placeholder={mode === "anular" ? "Ej.: monto digitado incorrectamente" : "Ej.: cliente inubicable desde hace 120 días"} />
                </Field>
                <label className="flex items-start gap-2 text-sm">
                  <input type="checkbox" className="mt-0.5 size-4 accent-danger" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
                  <span>{COPY[mode].confirm}. Esta acción no se puede deshacer.</span>
                </label>
                {error && <Alert tone="danger">{error}</Alert>}
                <Button variant="danger" size="lg" className="w-full" disabled={!valid || pending} onClick={submit}>
                  {pending && <Loader2 strokeWidth={1.75} className="animate-spin" />}{COPY[mode].button} {loanCode}
                </Button>
              </>
            )}
          </div>
        </SheetContent>
      )}
    </Sheet>
  );
}
