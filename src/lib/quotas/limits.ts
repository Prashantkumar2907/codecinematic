import { PLAN_CONFIG, type PlanCode } from "@/lib/plans";

export function getEffectiveLimits(plan: PlanCode) {
  return PLAN_CONFIG[plan];
}

export function validateCodePayload(plan: PlanCode, code: string) {
  const hasContent = code.trim().length > 0;
  const lines = hasContent ? code.split("\n") : [];
  const maxLineLength = Math.max(...lines.map((line) => line.length), 0);
  const limits = getEffectiveLimits(plan);

  return {
    ok: lines.length <= limits.maxCodeLines && maxLineLength <= limits.maxLineLength,
    lineCount: lines.length,
    longestLine: maxLineLength,
    limits
  };
}
