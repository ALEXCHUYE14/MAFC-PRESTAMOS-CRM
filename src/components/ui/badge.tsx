import * as React from "react";
import { cn } from "@/lib/utils";

type Tone = "ok" | "warn" | "danger" | "neutral" | "brand";

const tones: Record<Tone, string> = {
  ok: "bg-ok-bg text-ok",
  warn: "bg-warn-bg text-warn",
  danger: "bg-danger-bg text-danger",
  neutral: "bg-sand text-ink-muted",
  brand: "bg-brand-soft text-brand",
};

export function Badge({ tone = "neutral", className, ...props }: React.HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-sm px-2 py-0.5 text-xs font-medium tabular-nums", tones[tone], className)} {...props} />
  );
}

export function toneForDaysOverdue(days: number, dueSoon = false): Tone {
  if (days >= 1) return "danger";
  if (dueSoon) return "warn";
  return "ok";
}

export function toneForStatus(status: string): Tone {
  switch (status) {
    case "pagado": case "activo": case "condonado": case "abierta": return status === "activo" ? "brand" : "ok";
    case "parcial": case "pendiente": return "warn";
    case "refinanciado": case "cerrada": case "inactivo": return "neutral";
    case "anulado": case "castigado": case "bloqueado": return "danger";
    default: return "neutral";
  }
}
