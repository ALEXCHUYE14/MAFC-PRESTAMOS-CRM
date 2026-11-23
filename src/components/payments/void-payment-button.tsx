"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Undo2 } from "lucide-react";
import { voidPayment } from "@/app/(dashboard)/prestamos/actions";

export function VoidPaymentButton({ paymentId, loanId, code }: { paymentId: string; loanId: string; code: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button disabled={pending} title="Anular pago" aria-label={`Anular ${code}`}
      className="rounded-md p-1.5 text-ink-muted hover:bg-danger-bg hover:text-danger disabled:opacity-50"
      onClick={() => {
        const reason = prompt(`Motivo de anulación de ${code}:`);
        if (!reason?.trim()) return;
        start(async () => {
          const r = await voidPayment(paymentId, reason.trim(), loanId);
          if (!r.ok) alert(r.error);
          router.refresh();
        });
      }}>
      <Undo2 strokeWidth={1.75} className="size-4" />
    </button>
  );
}
