"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ban, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { setClientStatus } from "@/app/(dashboard)/clientes/actions";

export function ClientStatusActions({ clientId, status }: { clientId: string; status: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const change = (s: "activo" | "bloqueado") => start(async () => { await setClientStatus(clientId, s); router.refresh(); });
  return status === "bloqueado" ? (
    <Button variant="secondary" disabled={pending} onClick={() => change("activo")}><RotateCcw strokeWidth={1.75} />Reactivar</Button>
  ) : (
    <Button variant="danger-outline" disabled={pending}
      onClick={() => { if (confirm("¿Enviar este cliente a lista negra? No podrá recibir nuevos préstamos.")) change("bloqueado"); }}>
      <Ban strokeWidth={1.75} />Lista negra
    </Button>
  );
}
