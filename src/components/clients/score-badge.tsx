import { Badge } from "@/components/ui/badge";
import { scoreTier, SCORE_TIER_LABEL } from "@/services/finance";

export function ScoreBadge({ score, status }: { score: number; status?: string }) {
  const tier = scoreTier(score, status === "bloqueado");
  const tone = tier === "excelente" ? "ok" : tier === "regular" ? "warn" : "danger";
  return <Badge tone={tone}>{score} · {SCORE_TIER_LABEL[tier]}</Badge>;
}
