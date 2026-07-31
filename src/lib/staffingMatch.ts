// Phase 3 — Scheduler match-suggestion engine.
//
// Pure functions only: no React, no Supabase imports. Ranks a staff
// candidate against an engagement's aggregated staffing requirements
// using the four mutually exclusive quality tiers defined in
// docs/scheduler-objective.md ("Match-suggestion semantics").
//
// "Suggest, never block": everything in this module is advisory. Callers
// surface tiers as muted color indicators and never gate a save on them.

export type ProficiencyLevel = "Beginner" | "Intermediate" | "Advanced";

export type MatchTier = "full" | "partial" | "category_only" | "none";

// Ordering matches Phase 1 semantics: a required level is a minimum (≥).
const LEVEL_ORDER: Record<ProficiencyLevel, number> = {
  Beginner: 1,
  Intermediate: 2,
  Advanced: 3,
};

export interface RequiredSkill {
  skill_id: string;
  /** Human-readable name — tooltips must name skills, never IDs. */
  skill_name: string;
  min_level: ProficiencyLevel;
}

export interface AggregatedRequirement {
  category_id: string;
  /**
   * Union across all work orders of the engagement. When the same skill
   * appears in more than one WO for the same category, the strictest
   * (highest) min_level wins.
   */
  required_skills: RequiredSkill[];
}

export interface StaffCandidate {
  staff_id: string;
  category_id: string | null;
  skills: Array<{ skill_id: string; level: ProficiencyLevel }>;
}

export interface MatchResult {
  tier: MatchTier;
  /** Required skills the staff doesn't have at all. */
  missing: RequiredSkill[];
  /** Required skills the staff has, but below the required level. */
  belowLevel: RequiredSkill[];
}

// Structural subset of useEmsData's WorkOrderStaffingRequirementWithSkills.
// Declared here (rather than imported) to keep this module dependency-free.
export interface WorkOrderRequirementInput {
  category_id: string;
  requirement_skills: Array<{
    skill_id: string;
    min_proficiency_level: ProficiencyLevel;
    skill?: { name?: string | null } | null;
  }>;
}

/**
 * Collapse per-work-order staffing requirements into one requirement per
 * category for the whole engagement. Skills are unioned per category; for
 * a `(category_id, skill_id)` pair contributed by multiple work orders,
 * the highest `min_proficiency_level` wins
 * (`Beginner < Intermediate < Advanced`).
 */
export function aggregateRequirements(
  woRequirements: WorkOrderRequirementInput[]
): AggregatedRequirement[] {
  const byCategory = new Map<string, Map<string, RequiredSkill>>();

  for (const req of woRequirements) {
    let skills = byCategory.get(req.category_id);
    if (!skills) {
      skills = new Map<string, RequiredSkill>();
      byCategory.set(req.category_id, skills);
    }
    for (const rs of req.requirement_skills) {
      const existing = skills.get(rs.skill_id);
      if (
        !existing ||
        LEVEL_ORDER[rs.min_proficiency_level] > LEVEL_ORDER[existing.min_level]
      ) {
        skills.set(rs.skill_id, {
          skill_id: rs.skill_id,
          skill_name: rs.skill?.name ?? existing?.skill_name ?? rs.skill_id,
          min_level: rs.min_proficiency_level,
        });
      }
    }
  }

  return Array.from(byCategory.entries()).map(([category_id, skills]) => ({
    category_id,
    required_skills: Array.from(skills.values()),
  }));
}

/**
 * Rank one staff candidate against one aggregated category requirement.
 *
 * The four tiers are mutually exclusive — every input shape maps to
 * exactly one:
 * - `full`          — category matches AND required_skills is non-empty AND
 *                     every required skill is held at ≥ min_level.
 * - `partial`       — category matches AND at least one required skill met
 *                     AND not all met.
 * - `category_only` — category matches; required_skills is empty OR none met.
 *                     (The correct tier for an engagement with no skill
 *                     requirements at all.)
 * - `none`          — wrong category.
 */
export function rankCandidate(
  staff: StaffCandidate,
  req: AggregatedRequirement
): MatchResult {
  const staffLevels = new Map<string, ProficiencyLevel>();
  for (const s of staff.skills) staffLevels.set(s.skill_id, s.level);

  const missing: RequiredSkill[] = [];
  const belowLevel: RequiredSkill[] = [];
  let metCount = 0;

  for (const rs of req.required_skills) {
    const held = staffLevels.get(rs.skill_id);
    if (held === undefined) {
      missing.push(rs);
    } else if (LEVEL_ORDER[held] < LEVEL_ORDER[rs.min_level]) {
      belowLevel.push(rs);
    } else {
      metCount += 1;
    }
  }

  if (!staff.category_id || staff.category_id !== req.category_id) {
    // `missing` and `belowLevel` are retained so the tooltip can surface
    // what the target category additionally requires. The UI leads the
    // none-tier tooltip with an explicit "category mismatch" line so these
    // lists read as context, not as the cause of the mismatch.
    return { tier: "none", missing, belowLevel };
  }
  if (req.required_skills.length === 0 || metCount === 0) {
    return { tier: "category_only", missing, belowLevel };
  }
  if (metCount === req.required_skills.length) {
    return { tier: "full", missing, belowLevel };
  }
  return { tier: "partial", missing, belowLevel };
}

/**
 * Rank a staff candidate against a whole engagement's aggregated
 * requirements, evaluated for one target category (the assignment row's
 * category, or the staff's own category in the candidate picker).
 *
 * Returns `null` when the engagement has no requirement for the target
 * category — there is nothing to match against, so the UI shows a neutral
 * "no requirement" state rather than a misleading `none`.
 */
export function rankCandidateForCategory(
  staff: StaffCandidate,
  requirements: AggregatedRequirement[],
  targetCategoryId: string | null | undefined
): MatchResult | null {
  if (!targetCategoryId) return null;
  const req = requirements.find((r) => r.category_id === targetCategoryId);
  if (!req) return null;
  return rankCandidate(staff, req);
}

/** Sort order for the candidate picker: full → partial → category_only → none. */
export const TIER_SORT_ORDER: Record<MatchTier, number> = {
  full: 0,
  partial: 1,
  category_only: 2,
  none: 3,
};
