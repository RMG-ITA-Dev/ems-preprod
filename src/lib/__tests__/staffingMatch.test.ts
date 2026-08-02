import { describe, it, expect } from "vitest";
import {
  aggregateRequirements,
  rankCandidate,
  rankCandidateForCategory,
  TIER_SORT_ORDER,
  type AggregatedRequirement,
  type StaffCandidate,
  type WorkOrderRequirementInput,
} from "@/lib/staffingMatch";

const CAT_SENIOR = "cat-senior";
const CAT_MANAGER = "cat-manager";

const SKILL_IFRS = "skill-ifrs";
const SKILL_TAX = "skill-tax";
const SKILL_AUDIT = "skill-audit";

function req(
  category_id: string,
  skills: Array<[string, "Beginner" | "Intermediate" | "Advanced"]>
): AggregatedRequirement {
  return {
    category_id,
    required_skills: skills.map(([skill_id, min_level]) => ({
      skill_id,
      skill_name: skill_id,
      min_level,
    })),
  };
}

function staff(
  category_id: string | null,
  skills: Array<[string, "Beginner" | "Intermediate" | "Advanced"]>
): StaffCandidate {
  return {
    staff_id: "staff-1",
    category_id,
    skills: skills.map(([skill_id, level]) => ({ skill_id, level })),
  };
}

describe("rankCandidate — tier outcomes", () => {
  it("full: category matches and every required skill held at ≥ min level", () => {
    const result = rankCandidate(
      staff(CAT_SENIOR, [
        [SKILL_IFRS, "Advanced"],
        [SKILL_TAX, "Intermediate"],
      ]),
      req(CAT_SENIOR, [
        [SKILL_IFRS, "Intermediate"],
        [SKILL_TAX, "Intermediate"],
      ])
    );
    expect(result.tier).toBe("full");
    expect(result.missing).toEqual([]);
    expect(result.belowLevel).toEqual([]);
  });

  it("partial: at least one required skill met, but not all", () => {
    const result = rankCandidate(
      staff(CAT_SENIOR, [[SKILL_IFRS, "Advanced"]]),
      req(CAT_SENIOR, [
        [SKILL_IFRS, "Intermediate"],
        [SKILL_TAX, "Beginner"],
      ])
    );
    expect(result.tier).toBe("partial");
    expect(result.missing.map((s) => s.skill_id)).toEqual([SKILL_TAX]);
    expect(result.belowLevel).toEqual([]);
  });

  it("category_only: category matches but none of the required skills are met", () => {
    const result = rankCandidate(
      staff(CAT_SENIOR, [[SKILL_AUDIT, "Advanced"]]),
      req(CAT_SENIOR, [
        [SKILL_IFRS, "Intermediate"],
        [SKILL_TAX, "Beginner"],
      ])
    );
    expect(result.tier).toBe("category_only");
    expect(result.missing.map((s) => s.skill_id).sort()).toEqual(
      [SKILL_IFRS, SKILL_TAX].sort()
    );
  });

  it("category_only (NOT full): empty required_skills — engagement with no skill requirements", () => {
    const result = rankCandidate(
      staff(CAT_SENIOR, [[SKILL_IFRS, "Advanced"]]),
      req(CAT_SENIOR, [])
    );
    expect(result.tier).toBe("category_only");
    expect(result.missing).toEqual([]);
    expect(result.belowLevel).toEqual([]);
  });

  it("none: wrong category, even with perfect skills", () => {
    const result = rankCandidate(
      staff(CAT_MANAGER, [[SKILL_IFRS, "Advanced"]]),
      req(CAT_SENIOR, [[SKILL_IFRS, "Beginner"]])
    );
    expect(result.tier).toBe("none");
  });

  it("none: staff with NULL category is wrong-category by definition", () => {
    const result = rankCandidate(
      staff(null, [[SKILL_IFRS, "Advanced"]]),
      req(CAT_SENIOR, [[SKILL_IFRS, "Beginner"]])
    );
    expect(result.tier).toBe("none");
  });
});

describe("rankCandidate — missing vs belowLevel distinction", () => {
  it("separates skills not held at all from skills held below the required level", () => {
    const result = rankCandidate(
      staff(CAT_SENIOR, [[SKILL_IFRS, "Beginner"]]),
      req(CAT_SENIOR, [
        [SKILL_IFRS, "Advanced"], // held, but below
        [SKILL_TAX, "Beginner"], // not held at all
      ])
    );
    expect(result.tier).toBe("category_only"); // zero met
    expect(result.missing.map((s) => s.skill_id)).toEqual([SKILL_TAX]);
    expect(result.belowLevel.map((s) => s.skill_id)).toEqual([SKILL_IFRS]);
  });

  it("still reports missing/belowLevel detail for wrong-category (none) rows", () => {
    const result = rankCandidate(
      staff(CAT_MANAGER, [[SKILL_IFRS, "Beginner"]]),
      req(CAT_SENIOR, [
        [SKILL_IFRS, "Advanced"],
        [SKILL_TAX, "Beginner"],
      ])
    );
    expect(result.tier).toBe("none");
    expect(result.missing.map((s) => s.skill_id)).toEqual([SKILL_TAX]);
    expect(result.belowLevel.map((s) => s.skill_id)).toEqual([SKILL_IFRS]);
  });
});

describe("rankCandidate — proficiency level ordering (minimum ≥ semantics)", () => {
  it("Advanced satisfies an Intermediate minimum", () => {
    const result = rankCandidate(
      staff(CAT_SENIOR, [[SKILL_IFRS, "Advanced"]]),
      req(CAT_SENIOR, [[SKILL_IFRS, "Intermediate"]])
    );
    expect(result.tier).toBe("full");
  });

  it("exact level satisfies the minimum", () => {
    const result = rankCandidate(
      staff(CAT_SENIOR, [[SKILL_IFRS, "Intermediate"]]),
      req(CAT_SENIOR, [[SKILL_IFRS, "Intermediate"]])
    );
    expect(result.tier).toBe("full");
  });

  it("Beginner does not satisfy an Intermediate minimum", () => {
    const result = rankCandidate(
      staff(CAT_SENIOR, [[SKILL_IFRS, "Beginner"]]),
      req(CAT_SENIOR, [[SKILL_IFRS, "Intermediate"]])
    );
    expect(result.tier).toBe("category_only");
    expect(result.belowLevel.map((s) => s.skill_id)).toEqual([SKILL_IFRS]);
  });

  it("Beginner minimum is satisfied by every level", () => {
    for (const level of ["Beginner", "Intermediate", "Advanced"] as const) {
      const result = rankCandidate(
        staff(CAT_SENIOR, [[SKILL_IFRS, level]]),
        req(CAT_SENIOR, [[SKILL_IFRS, "Beginner"]])
      );
      expect(result.tier).toBe("full");
    }
  });
});

describe("aggregateRequirements", () => {
  function woReq(
    category_id: string,
    skills: Array<[string, "Beginner" | "Intermediate" | "Advanced", string?]>
  ): WorkOrderRequirementInput {
    return {
      category_id,
      requirement_skills: skills.map(([skill_id, min_proficiency_level, name]) => ({
        skill_id,
        min_proficiency_level,
        skill: { name: name ?? `${skill_id}-name` },
      })),
    };
  }

  it("merges the same category across work orders, unioning skills", () => {
    const result = aggregateRequirements([
      woReq(CAT_SENIOR, [[SKILL_IFRS, "Intermediate"]]),
      woReq(CAT_SENIOR, [[SKILL_TAX, "Beginner"]]),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].category_id).toBe(CAT_SENIOR);
    expect(result[0].required_skills.map((s) => s.skill_id).sort()).toEqual(
      [SKILL_IFRS, SKILL_TAX].sort()
    );
  });

  it("conflicting min_levels for the same (category, skill): the strictest (highest) wins", () => {
    const result = aggregateRequirements([
      woReq(CAT_SENIOR, [[SKILL_IFRS, "Beginner"]]),
      woReq(CAT_SENIOR, [[SKILL_IFRS, "Advanced"]]),
      woReq(CAT_SENIOR, [[SKILL_IFRS, "Intermediate"]]),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].required_skills).toHaveLength(1);
    expect(result[0].required_skills[0].min_level).toBe("Advanced");
  });

  it("keeps distinct categories separate", () => {
    const result = aggregateRequirements([
      woReq(CAT_SENIOR, [[SKILL_IFRS, "Intermediate"]]),
      woReq(CAT_MANAGER, [[SKILL_TAX, "Advanced"]]),
    ]);
    expect(result).toHaveLength(2);
    const categories = result.map((r) => r.category_id).sort();
    expect(categories).toEqual([CAT_MANAGER, CAT_SENIOR].sort());
  });

  it("carries skill names through for tooltips (names, never IDs)", () => {
    const result = aggregateRequirements([
      woReq(CAT_SENIOR, [[SKILL_IFRS, "Intermediate", "IFRS"]]),
    ]);
    expect(result[0].required_skills[0].skill_name).toBe("IFRS");
  });

  it("a category with no skills aggregates to an empty required_skills list", () => {
    const result = aggregateRequirements([woReq(CAT_SENIOR, [])]);
    expect(result).toHaveLength(1);
    expect(result[0].required_skills).toEqual([]);
  });

  it("empty input aggregates to no requirements", () => {
    expect(aggregateRequirements([])).toEqual([]);
  });
});

describe("rankCandidateForCategory", () => {
  const requirements = [
    req(CAT_SENIOR, [[SKILL_IFRS, "Intermediate"]]),
    req(CAT_MANAGER, []),
  ];

  it("ranks against the requirement of the target category", () => {
    const result = rankCandidateForCategory(
      staff(CAT_SENIOR, [[SKILL_IFRS, "Advanced"]]),
      requirements,
      CAT_SENIOR
    );
    expect(result?.tier).toBe("full");
  });

  it("returns none when the target category requirement exists but staff category differs", () => {
    const result = rankCandidateForCategory(
      staff(CAT_SENIOR, [[SKILL_IFRS, "Advanced"]]),
      requirements,
      CAT_MANAGER
    );
    expect(result?.tier).toBe("none");
  });

  it("returns null (neutral, no indicator) when no requirement exists for the target category", () => {
    const result = rankCandidateForCategory(
      staff(CAT_SENIOR, [[SKILL_IFRS, "Advanced"]]),
      requirements,
      "cat-unknown"
    );
    expect(result).toBeNull();
  });

  it("returns null when the target category is unset", () => {
    expect(
      rankCandidateForCategory(staff(CAT_SENIOR, []), requirements, null)
    ).toBeNull();
    expect(
      rankCandidateForCategory(staff(CAT_SENIOR, []), requirements, undefined)
    ).toBeNull();
  });
});

describe("TIER_SORT_ORDER", () => {
  it("orders full → partial → category_only → none", () => {
    expect(TIER_SORT_ORDER.full).toBeLessThan(TIER_SORT_ORDER.partial);
    expect(TIER_SORT_ORDER.partial).toBeLessThan(TIER_SORT_ORDER.category_only);
    expect(TIER_SORT_ORDER.category_only).toBeLessThan(TIER_SORT_ORDER.none);
  });
});

// Fase 4 — categorías homónimas de servicios distintos y skills inactivas persistidas.
describe("category_id is the sole boundary — homonymous categories across services never mix", () => {
  // Two different services can each have a category literally named "Senior" — only
  // category_id (globally unique) distinguishes them, never the name.
  const CAT_SENIOR_AUDIT = "cat-senior-audit-service";
  const CAT_SENIOR_TAX = "cat-senior-tax-service";

  it("aggregateRequirements keeps homonymous categories from different services as separate entries", () => {
    const result = aggregateRequirements([
      {
        category_id: CAT_SENIOR_AUDIT,
        requirement_skills: [{ skill_id: SKILL_IFRS, min_proficiency_level: "Intermediate", skill: { name: "IFRS" } }],
      },
      {
        category_id: CAT_SENIOR_TAX,
        requirement_skills: [{ skill_id: SKILL_TAX, min_proficiency_level: "Advanced", skill: { name: "Tax Law" } }],
      },
    ]);
    expect(result).toHaveLength(2);
    const byCategory = new Map(result.map((r) => [r.category_id, r]));
    expect(byCategory.get(CAT_SENIOR_AUDIT)?.required_skills.map((s) => s.skill_id)).toEqual([SKILL_IFRS]);
    expect(byCategory.get(CAT_SENIOR_TAX)?.required_skills.map((s) => s.skill_id)).toEqual([SKILL_TAX]);
  });

  it("rankCandidate: staff scoped to one service's 'Senior' never matches the other service's homonymous 'Senior'", () => {
    const auditReq: AggregatedRequirement = req(CAT_SENIOR_AUDIT, [[SKILL_IFRS, "Beginner"]]);
    const staffInTaxSenior = staff(CAT_SENIOR_TAX, [[SKILL_IFRS, "Advanced"]]);
    const result = rankCandidate(staffInTaxSenior, auditReq);
    expect(result.tier).toBe("none");
  });

  it("rankCandidateForCategory resolves each homonymous category to its own independent requirement", () => {
    const requirements = [
      req(CAT_SENIOR_AUDIT, [[SKILL_IFRS, "Intermediate"]]),
      req(CAT_SENIOR_TAX, [[SKILL_TAX, "Advanced"]]),
    ];
    const auditStaff = staff(CAT_SENIOR_AUDIT, [[SKILL_IFRS, "Advanced"]]);
    expect(rankCandidateForCategory(auditStaff, requirements, CAT_SENIOR_AUDIT)?.tier).toBe("full");
    // Same staff evaluated against the homonymous-but-different Tax category: category mismatch.
    expect(rankCandidateForCategory(auditStaff, requirements, CAT_SENIOR_TAX)?.tier).toBe("none");
  });
});

describe("inactive persisted skills still count as demand (matching has no is_active concept)", () => {
  it("a requirement skill sourced from an inactive skill still aggregates and ranks normally", () => {
    // WorkOrderRequirementInput has no is_active field — a skill that later became
    // inactive in the catalog must keep counting as demand for OTs that already
    // required it (removing it silently would shrink scope without a save).
    const aggregated = aggregateRequirements([
      {
        category_id: CAT_SENIOR,
        requirement_skills: [
          { skill_id: SKILL_AUDIT, min_proficiency_level: "Advanced", skill: { name: "Legacy Audit Skill" } },
        ],
      },
    ]);
    expect(aggregated[0].required_skills).toEqual([
      { skill_id: SKILL_AUDIT, skill_name: "Legacy Audit Skill", min_level: "Advanced" },
    ]);

    const result = rankCandidate(staff(CAT_SENIOR, [[SKILL_AUDIT, "Advanced"]]), aggregated[0]);
    expect(result.tier).toBe("full");
  });
});
