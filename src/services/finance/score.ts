import { diffDays } from "./calendar";

export type ScoreTier = "excelente" | "regular" | "riesgo_alto" | "bloqueado";

export interface ScoreInstallment {
  dueDate: string;
  /** Fecha en que quedó totalmente pagada, o null si sigue pendiente. */
  paidAt: string | null;
  graceDays: number;
}

/** Espejo de `public.recompute_client_score`. 0..100, 70 para clientes sin historial. */
export function computeCreditScore(history: ScoreInstallment[], today: string): number {
  const evaluated = history.filter((i) => i.dueDate <= today);
  if (evaluated.length === 0) return 70;
  const onTime = evaluated.filter((i) => i.paidAt !== null && diffDays(i.paidAt, i.dueDate) <= i.graceDays).length;
  const avgLate =
    evaluated.reduce((a, i) => a + Math.max(0, diffDays(i.paidAt ?? today, i.dueDate)), 0) / evaluated.length;
  const maxOpen = Math.max(0, ...evaluated.filter((i) => i.paidAt === null).map((i) => diffDays(today, i.dueDate)));
  const raw = Math.round((onTime / evaluated.length) * 70 + Math.max(0, 30 - avgLate * 2)) - Math.min(20, maxOpen);
  return Math.min(100, Math.max(0, raw));
}

export function scoreTier(score: number, blocked = false): ScoreTier {
  if (blocked) return "bloqueado";
  if (score >= 80) return "excelente";
  if (score >= 50) return "regular";
  return "riesgo_alto";
}

export const SCORE_TIER_LABEL: Record<ScoreTier, string> = {
  excelente: "Excelente",
  regular: "Regular",
  riesgo_alto: "Riesgo alto",
  bloqueado: "Bloqueado / Lista negra",
};
