// Match-quality dot — extracted verbatim from Phase 3's
// StaffAssignmentsCard (plan §6/§10) so the Scheduler L2 surface and the
// engagement form share ONE implementation. Five states: full / partial /
// category_only / none / null (neutral outline — no requirement captured
// for the category). Advisory only ("Suggest, never block"): never
// contributes to any disabled/blocked state.

import { useTranslation } from "react-i18next";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type {
  MatchResult,
  MatchTier,
  ProficiencyLevel,
} from "@/lib/staffingMatch";
import { cn } from "@/lib/utils";

// Muted, Ruizmier-aligned tier tones — deliberately not harsh traffic lights.
export const TIER_DOT_CLASS: Record<MatchTier, string> = {
  full: "bg-success/80",
  partial: "bg-warning/80",
  category_only: "bg-muted-foreground/50",
  none: "bg-destructive/70",
};

export function MatchDot({ result }: { result: MatchResult | null }) {
  const { t } = useTranslation();

  if (!result) {
    // No requirement captured for the target category — neutral, not a
    // mismatch. An engagement with no Phase 2 data shows this everywhere.
    // tabIndex 0: the Radix tooltip opens on keyboard focus, so the match
    // detail is never pointer-only (PR #214 review P2-04).
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            role="img"
            tabIndex={0}
            className="inline-block h-2.5 w-2.5 rounded-full border border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={t("engagement.assignments.match.noRequirement")}
          />
        </TooltipTrigger>
        <TooltipContent side="left" className="max-w-64">
          <p className="text-xs">{t("engagement.assignments.match.noRequirement")}</p>
        </TooltipContent>
      </Tooltip>
    );
  }

  const tierLabelKey: Record<MatchTier, string> = {
    full: "engagement.assignments.match.full",
    partial: "engagement.assignments.match.partial",
    category_only: "engagement.assignments.match.categoryOnly",
    none: "engagement.assignments.match.none",
  };

  const levelLabel = (level: ProficiencyLevel) =>
    t(`staff.competencies.levels.${level.toLowerCase()}`);
  const skillList = (skills: MatchResult["missing"]) =>
    skills.map((s) => `${s.skill_name} (${levelLabel(s.min_level)})`).join(", ");

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          role="img"
          tabIndex={0}
          className={cn(
            "inline-block h-2.5 w-2.5 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            TIER_DOT_CLASS[result.tier]
          )}
          aria-label={t(tierLabelKey[result.tier])}
        />
      </TooltipTrigger>
      <TooltipContent side="left" className="max-w-64 space-y-1">
        <p className="text-xs font-medium">{t(tierLabelKey[result.tier])}</p>
        {result.tier === "none" && (
          // `none` means the category itself is wrong — say so up front,
          // so the skill lists below read as extra context, not the cause.
          <p className="text-xs">{t("engagement.assignments.match.categoryMismatch")}</p>
        )}
        {result.missing.length > 0 && (
          <p className="text-xs">
            {t("engagement.assignments.match.missingSkills", {
              list: skillList(result.missing),
            })}
          </p>
        )}
        {result.belowLevel.length > 0 && (
          <p className="text-xs">
            {t("engagement.assignments.match.belowLevel", {
              list: skillList(result.belowLevel),
            })}
          </p>
        )}
      </TooltipContent>
    </Tooltip>
  );
}
