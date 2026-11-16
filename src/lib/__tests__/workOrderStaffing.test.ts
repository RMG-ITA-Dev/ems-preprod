import { describe, it, expect } from "vitest";
import {
  budgetStaffingCategoryIds,
  buildStaffingPayload,
  createEmptyRequirement,
  createEmptySkill,
  hydrateFromPersisted,
  isStaffingDirty,
  mergeBudgetCategoriesIntoStaffing,
  validateStaffing,
  STAFFING_PROFICIENCY_LEVELS,
  STAFFING_VALIDATION_ERROR_I18N_KEY,
  type PersistedStaffingRequirement,
  type StaffingRequirementInput,
} from "@/lib/workOrderStaffing";

const CAT_A = "cat-a";
const CAT_B = "cat-b";
const SKILL_IFRS = "skill-ifrs";
const SKILL_TAX = "skill-tax";

function requirement(over: Partial<StaffingRequirementInput> = {}): StaffingRequirementInput {
  return {
    clientKey: "req-1",
    persistedId: null,
    categoryId: CAT_A,
    staffCount: 5,
    skills: [],
    ...over,
  };
}

describe("hydrateFromPersisted", () => {
  it("maps persisted rows to editable input, carrying persistedId and isActive/skillName", () => {
    const rows: PersistedStaffingRequirement[] = [
      {
        id: "req-db-1",
        category_id: CAT_A,
        staff_count: 3,
        requirement_skills: [
          {
            id: "skill-db-1",
            skill_id: SKILL_IFRS,
            min_proficiency_level: "Advanced",
            skill: { name: "IFRS", is_active: true },
          },
          {
            id: "skill-db-2",
            skill_id: SKILL_TAX,
            min_proficiency_level: "Beginner",
            skill: { name: "Legacy Tax", is_active: false },
          },
        ],
      },
    ];

    const [result] = hydrateFromPersisted(rows);
    expect(result.clientKey).toBe("req-db-1");
    expect(result.persistedId).toBe("req-db-1");
    expect(result.categoryId).toBe(CAT_A);
    expect(result.staffCount).toBe(3);
    expect(result.skills).toEqual([
      {
        clientKey: "skill-db-1",
        persistedId: "skill-db-1",
        skillId: SKILL_IFRS,
        minProficiencyLevel: "Advanced",
        isActive: true,
        skillName: "IFRS",
      },
      {
        clientKey: "skill-db-2",
        persistedId: "skill-db-2",
        skillId: SKILL_TAX,
        minProficiencyLevel: "Beginner",
        isActive: false,
        skillName: "Legacy Tax",
      },
    ]);
  });

  it("preserves historical category metadata for incompatible-service guidance", () => {
    const [result] = hydrateFromPersisted([{
      id: "req-db-1",
      category_id: CAT_A,
      staff_count: 1,
      category: { category_name: "Auditor histórico", practica_id: "svc-retired" },
      requirement_skills: [],
    }]);
    expect(result.categoryName).toBe("Auditor histórico");
    expect(result.categoryServiceId).toBe("svc-retired");
  });

  it("defaults isActive to true and skillName to null when the skill embed is absent", () => {
    const rows: PersistedStaffingRequirement[] = [
      {
        id: "req-db-1",
        category_id: CAT_A,
        staff_count: 1,
        requirement_skills: [{ id: "skill-db-1", skill_id: SKILL_IFRS, min_proficiency_level: "Beginner" }],
      },
    ];
    const [result] = hydrateFromPersisted(rows);
    expect(result.skills[0].isActive).toBe(true);
    expect(result.skills[0].skillName).toBeNull();
  });

  it("empty input hydrates to an empty array", () => {
    expect(hydrateFromPersisted([])).toEqual([]);
  });
});

describe("createEmptyRequirement / createEmptySkill", () => {
  it("produce fresh, unpersisted, incomplete rows with distinct clientKeys", () => {
    const a = createEmptyRequirement();
    const b = createEmptyRequirement();
    expect(a.persistedId).toBeNull();
    expect(a.categoryId).toBeNull();
    expect(a.staffCount).toBe(1);
    expect(a.skills).toEqual([]);
    expect(a.clientKey).not.toBe(b.clientKey);

    const s1 = createEmptySkill();
    const s2 = createEmptySkill();
    expect(s1.persistedId).toBeNull();
    expect(s1.skillId).toBe("");
    expect(s1.minProficiencyLevel).toBeNull();
    expect(s1.clientKey).not.toBe(s2.clientKey);
  });
});

describe("buildStaffingPayload", () => {
  it("strips clientKey/persistedId/isActive/skillName, keeping only the RPC-shaped fields", () => {
    const reqs: StaffingRequirementInput[] = [
      requirement({
        clientKey: "local-1",
        persistedId: "db-1",
        categoryId: CAT_A,
        staffCount: 4,
        skills: [
          {
            clientKey: "local-skill-1",
            persistedId: "db-skill-1",
            skillId: SKILL_IFRS,
            minProficiencyLevel: "Advanced",
            isActive: true,
            skillName: "IFRS",
          },
        ],
      }),
    ];
    expect(buildStaffingPayload(reqs)).toEqual([
      {
        category_id: CAT_A,
        staff_count: 4,
        skills: [{ skill_id: SKILL_IFRS, min_proficiency_level: "Advanced" }],
      },
    ]);
  });

  it("a requirement with no skills builds an empty skills array", () => {
    expect(buildStaffingPayload([requirement({ skills: [] })])).toEqual([
      { category_id: CAT_A, staff_count: 5, skills: [] },
    ]);
  });
});

describe("isStaffingDirty", () => {
  it("false for identical states regardless of requirement/skill order", () => {
    const skillA = { clientKey: "s1", persistedId: "s1", skillId: SKILL_IFRS, minProficiencyLevel: "Advanced" as const, isActive: true, skillName: "IFRS" };
    const skillB = { clientKey: "s2", persistedId: "s2", skillId: SKILL_TAX, minProficiencyLevel: "Beginner" as const, isActive: true, skillName: "Tax" };
    const original = [
      requirement({ clientKey: "r1", categoryId: CAT_A, skills: [skillA, skillB] }),
      requirement({ clientKey: "r2", categoryId: CAT_B, skills: [] }),
    ];
    const reordered = [
      requirement({ clientKey: "r2", categoryId: CAT_B, skills: [] }),
      requirement({ clientKey: "r1", categoryId: CAT_A, skills: [skillB, skillA] }),
    ];
    expect(isStaffingDirty(original, reordered)).toBe(false);
  });

  it("false when only clientKey/persistedId differ (new local IDs re-hydrated with new DB IDs)", () => {
    const original = [requirement({ clientKey: "local-1", persistedId: null })];
    const currentAfterSave = [requirement({ clientKey: "db-1", persistedId: "db-1" })];
    expect(isStaffingDirty(original, currentAfterSave)).toBe(false);
  });

  it("true when staff_count changes", () => {
    const original = [requirement({ staffCount: 5 })];
    const current = [requirement({ staffCount: 6 })];
    expect(isStaffingDirty(original, current)).toBe(true);
  });

  it("true when proficiency changes", () => {
    const skill = { clientKey: "s1", persistedId: "s1", skillId: SKILL_IFRS, minProficiencyLevel: "Beginner" as const, isActive: true, skillName: "IFRS" };
    const original = [requirement({ skills: [skill] })];
    const current = [requirement({ skills: [{ ...skill, minProficiencyLevel: "Advanced" }] })];
    expect(isStaffingDirty(original, current)).toBe(true);
  });

  it("true when a skill is added or removed", () => {
    const original = [requirement({ skills: [] })];
    const current = [requirement({ skills: [createEmptySkill()] })];
    expect(isStaffingDirty(original, current)).toBe(true);
  });

  it("true when a category requirement is deleted (removal = absence from current)", () => {
    const original = [requirement({ clientKey: "r1", categoryId: CAT_A }), requirement({ clientKey: "r2", categoryId: CAT_B })];
    const current = [requirement({ clientKey: "r1", categoryId: CAT_A })];
    expect(isStaffingDirty(original, current)).toBe(true);
  });

  it("both empty is never dirty", () => {
    expect(isStaffingDirty([], [])).toBe(false);
  });
});

describe("validateStaffing", () => {
  const openService = { serviceCategoryIds: null };

  it("returns null for a valid, complete state", () => {
    const reqs = [
      requirement({
        categoryId: CAT_A,
        staffCount: 10,
        skills: [{ clientKey: "s1", persistedId: null, skillId: SKILL_IFRS, minProficiencyLevel: "Intermediate", isActive: true, skillName: null }],
      }),
    ];
    expect(validateStaffing(reqs, openService)).toBeNull();
  });

  it("STAFFING_CATEGORY_MISSING when categoryId is null", () => {
    const result = validateStaffing([requirement({ categoryId: null })], openService);
    expect(result?.code).toBe("STAFFING_CATEGORY_MISSING");
  });

  it("STAFFING_CATEGORY_DUPLICATE when the same category appears twice", () => {
    const reqs = [requirement({ clientKey: "r1", categoryId: CAT_A }), requirement({ clientKey: "r2", categoryId: CAT_A })];
    expect(validateStaffing(reqs, openService)?.code).toBe("STAFFING_CATEGORY_DUPLICATE");
  });

  it("STAFFING_CATEGORY_FOREIGN_SERVICE when the category is outside the allow-list", () => {
    const result = validateStaffing([requirement({ categoryId: CAT_A })], {
      serviceCategoryIds: new Set([CAT_B]),
    });
    expect(result?.code).toBe("STAFFING_CATEGORY_FOREIGN_SERVICE");
  });

  it("serviceCategoryIds: null (unresolvable-but-legacy engagement) never blocks by service", () => {
    expect(validateStaffing([requirement({ categoryId: CAT_A })], { serviceCategoryIds: null })).toBeNull();
  });

  it("an empty allow-list (service set but unresolved) blocks every category", () => {
    const result = validateStaffing([requirement({ categoryId: CAT_A })], {
      serviceCategoryIds: new Set(),
    });
    expect(result?.code).toBe("STAFFING_CATEGORY_FOREIGN_SERVICE");
  });

  it.each([0, -1, 1.5, 1000, NaN])("STAFFING_STAFF_COUNT_RANGE for staffCount=%s", (staffCount) => {
    const result = validateStaffing([requirement({ staffCount })], openService);
    expect(result?.code).toBe("STAFFING_STAFF_COUNT_RANGE");
  });

  it.each([1, 500, 999])("staffCount=%s is valid", (staffCount) => {
    expect(validateStaffing([requirement({ staffCount })], openService)).toBeNull();
  });

  it("STAFFING_SKILL_DUPLICATE when the same skill appears twice in one requirement", () => {
    const dup = { clientKey: "s1", persistedId: null, skillId: SKILL_IFRS, minProficiencyLevel: "Beginner" as const, isActive: true, skillName: null };
    const result = validateStaffing(
      [requirement({ skills: [dup, { ...dup, clientKey: "s2" }] })],
      openService,
    );
    expect(result?.code).toBe("STAFFING_SKILL_DUPLICATE");
  });

  it("STAFFING_SKILL_INCOMPLETE when skillId is empty", () => {
    const result = validateStaffing(
      [requirement({ skills: [{ clientKey: "s1", persistedId: null, skillId: "", minProficiencyLevel: "Beginner", isActive: true, skillName: null }] })],
      openService,
    );
    expect(result?.code).toBe("STAFFING_SKILL_INCOMPLETE");
  });

  it("STAFFING_SKILL_INCOMPLETE when proficiency is null", () => {
    const result = validateStaffing(
      [requirement({ skills: [{ clientKey: "s1", persistedId: null, skillId: SKILL_IFRS, minProficiencyLevel: null, isActive: true, skillName: null }] })],
      openService,
    );
    expect(result?.code).toBe("STAFFING_SKILL_INCOMPLETE");
  });

  it("STAFFING_PROFICIENCY_INVALID for an out-of-enum value", () => {
    const result = validateStaffing(
      [
        requirement({
          skills: [
            {
              clientKey: "s1",
              persistedId: null,
              skillId: SKILL_IFRS,
              // Simulates a corrupted/unexpected value bypassing the TS union at runtime.
              minProficiencyLevel: "Expert" as never,
              isActive: true,
              skillName: null,
            },
          ],
        }),
      ],
      openService,
    );
    expect(result?.code).toBe("STAFFING_PROFICIENCY_INVALID");
  });

  it("returns the FIRST error encountered, in row order", () => {
    const reqs = [
      requirement({ clientKey: "r1", categoryId: null }),
      requirement({ clientKey: "r2", staffCount: -1 }),
    ];
    expect(validateStaffing(reqs, openService)?.clientKey).toBe("r1");
  });

  it("empty state is always valid", () => {
    expect(validateStaffing([], openService)).toBeNull();
  });
});

describe("STAFFING_VALIDATION_ERROR_I18N_KEY", () => {
  it("has an i18n key for every validation error code", () => {
    const codes = [
      "STAFFING_CATEGORY_MISSING",
      "STAFFING_CATEGORY_DUPLICATE",
      "STAFFING_CATEGORY_FOREIGN_SERVICE",
      "STAFFING_STAFF_COUNT_RANGE",
      "STAFFING_SKILL_DUPLICATE",
      "STAFFING_SKILL_INCOMPLETE",
      "STAFFING_PROFICIENCY_INVALID",
    ] as const;
    for (const code of codes) {
      expect(STAFFING_VALIDATION_ERROR_I18N_KEY[code]).toMatch(/^workOrders\.staffingRequirements\.errors\./);
    }
  });
});

describe("STAFFING_PROFICIENCY_LEVELS", () => {
  it("is exactly Beginner/Intermediate/Advanced, in that order", () => {
    expect(STAFFING_PROFICIENCY_LEVELS).toEqual(["Beginner", "Intermediate", "Advanced"]);
  });
});

// ---------------------------------------------------------------------------
// 0923-204 — Categorías del presupuesto → Requisitos de Staffing
// ---------------------------------------------------------------------------

describe("mergeBudgetCategoriesIntoStaffing (0923-204)", () => {
  const CAT_C = "cat-c";
  const CATEGORIES = [
    { category_id: CAT_A, category_name: "Socio", practica_id: "svc-1" },
    { category_id: CAT_B, category_name: "Gerente", practica_id: "svc-1" },
    { category_id: CAT_C, category_name: "Pasante", practica_id: "svc-1" },
  ];
  const opts = (serviceCategoryIds: ReadonlySet<string> | null = null) => ({
    serviceCategoryIds,
    categories: CATEGORIES,
  });
  const line = (category_id: string, budgeted_hours: number) => ({ category_id, budgeted_hours });

  it("MB1: empty staffing + 3 positive lines → 3 rows, count 1, needsReview, in line order", () => {
    const { requirements, addedCategoryIds } = mergeBudgetCategoriesIntoStaffing(
      [],
      [line(CAT_B, 8), line(CAT_A, 4), line(CAT_C, 2)],
      opts(),
    );
    expect(addedCategoryIds).toEqual([CAT_B, CAT_A, CAT_C]);
    expect(requirements.map((r) => r.categoryId)).toEqual([CAT_B, CAT_A, CAT_C]);
    for (const r of requirements) {
      expect(r.staffCount).toBe(1);
      expect(r.skills).toEqual([]);
      expect(r.persistedId).toBeNull();
      expect(r.needsReview).toBe(true);
      expect(r.clientKey).toBeTruthy();
    }
    expect(requirements[0].categoryName).toBe("Gerente");
    expect(requirements[0].categoryServiceId).toBe("svc-1");
  });

  it("MB2: zero, negative, NaN and Infinity hours create nothing", () => {
    const { requirements, addedCategoryIds } = mergeBudgetCategoriesIntoStaffing(
      [],
      [line(CAT_A, 0), line(CAT_B, -3), line(CAT_C, Number.NaN), line("cat-d", Number.POSITIVE_INFINITY)],
      opts(),
    );
    expect(requirements).toEqual([]);
    expect(addedCategoryIds).toEqual([]);
  });

  it("MB3: positive hours qualify even when the line's rate is 0 (Pasante)", () => {
    const lines = [{ category_id: CAT_C, budgeted_hours: 8, standard_rate: 0 }];
    const { addedCategoryIds } = mergeBudgetCategoriesIntoStaffing([], lines, opts());
    expect(addedCategoryIds).toEqual([CAT_C]);
  });

  it("MB4: two lines with the same category create one row", () => {
    const { requirements } = mergeBudgetCategoriesIntoStaffing([], [line(CAT_A, 4), line(CAT_A, 6)], opts());
    expect(requirements).toHaveLength(1);
  });

  it("MB5: an existing row is kept identical and not duplicated", () => {
    const existing = requirement({
      clientKey: "persisted-a",
      persistedId: "persisted-a",
      categoryId: CAT_A,
      staffCount: 3,
      skills: [{ ...createEmptySkill(), skillId: SKILL_IFRS, minProficiencyLevel: "Advanced" }],
    });
    const { requirements } = mergeBudgetCategoriesIntoStaffing([existing], [line(CAT_A, 8), line(CAT_B, 8)], opts());
    expect(requirements).toHaveLength(2);
    expect(requirements[0]).toBe(existing);
    expect(requirements[1].categoryId).toBe(CAT_B);
  });

  it("MB6: a manual row without category is untouched and doesn't block the addition", () => {
    const manual = requirement({ clientKey: "manual", categoryId: null });
    const { requirements } = mergeBudgetCategoriesIntoStaffing([manual], [line(CAT_A, 8)], opts());
    expect(requirements[0]).toBe(manual);
    expect(requirements[1].categoryId).toBe(CAT_A);
  });

  it("MB7: a category outside the service is skipped; with no service filter it is added", () => {
    const scoped = mergeBudgetCategoriesIntoStaffing([], [line(CAT_A, 8), line(CAT_B, 8)], opts(new Set([CAT_A])));
    expect(scoped.addedCategoryIds).toEqual([CAT_A]);
    const unscoped = mergeBudgetCategoriesIntoStaffing([], [line(CAT_A, 8), line(CAT_B, 8)], opts(null));
    expect(unscoped.addedCategoryIds).toEqual([CAT_A, CAT_B]);
  });

  it("MB8: no additions returns the same reference; applying twice equals applying once", () => {
    const current = [requirement({ categoryId: CAT_A })];
    const same = mergeBudgetCategoriesIntoStaffing(current, [line(CAT_A, 8)], opts());
    expect(same.requirements).toBe(current);
    expect(same.addedCategoryIds).toEqual([]);

    const once = mergeBudgetCategoriesIntoStaffing([], [line(CAT_A, 8), line(CAT_B, 8)], opts()).requirements;
    const twice = mergeBudgetCategoriesIntoStaffing(once, [line(CAT_A, 8), line(CAT_B, 8)], opts()).requirements;
    expect(twice).toBe(once);
  });

  it("MB9: inputs are not mutated", () => {
    const current = [requirement({ categoryId: CAT_A })];
    const lines = [line(CAT_A, 8), line(CAT_B, 8)];
    const before = JSON.parse(JSON.stringify({ current, lines }));
    mergeBudgetCategoriesIntoStaffing(current, lines, opts());
    expect(JSON.parse(JSON.stringify({ current, lines }))).toEqual(before);
  });

  it("MB10: needsReview never affects the dirty check nor reaches the payload", () => {
    const base = [requirement({ categoryId: CAT_A, staffCount: 1 })];
    const flagged = [{ ...base[0], needsReview: true }];
    expect(isStaffingDirty(base, flagged)).toBe(false);
    expect(buildStaffingPayload(flagged)[0]).not.toHaveProperty("needsReview");
  });
});

describe("budgetStaffingCategoryIds (0923-204)", () => {
  it("MB11: keeps line order, dedupes, filters by hours and service", () => {
    const ids = budgetStaffingCategoryIds(
      [
        { category_id: "x", budgeted_hours: 8 },
        { category_id: "y", budgeted_hours: 0 },
        { category_id: "x", budgeted_hours: 2 },
        { category_id: "z", budgeted_hours: 5 },
        { category_id: "foreign", budgeted_hours: 5 },
      ],
      new Set(["x", "y", "z"]),
    );
    expect(ids).toEqual(["x", "z"]);
  });
});
