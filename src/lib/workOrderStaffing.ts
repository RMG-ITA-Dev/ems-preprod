// Fase 4 — Work Order Staffing Requirements: tipos, hidratación, validación,
// payload y dirty-check puros.
//
// Sin imports de React/Supabase (mismo precedente que src/lib/staffingMatch.ts):
// los tipos "persistidos" se declaran localmente en vez de importarse de
// useEmsData.ts, para que este módulo siga siendo testeable sin montar nada.

export type StaffingProficiencyLevel = "Beginner" | "Intermediate" | "Advanced";

export const STAFFING_PROFICIENCY_LEVELS: readonly StaffingProficiencyLevel[] = [
  "Beginner",
  "Intermediate",
  "Advanced",
];

// ---------------------------------------------------------------------------
// Estado editable (UI)
// ---------------------------------------------------------------------------

export interface StaffingRequirementSkillInput {
  /** Identificador local estable para listas/diffing en React. Nunca vacío. */
  clientKey: string;
  /** id de wo_staffing_requirement_skills si ya está persistida, si no null. */
  persistedId: string | null;
  /** "" = fila incompleta (sin skill seleccionada todavía). */
  skillId: string;
  /** null = fila incompleta (proficiency no seleccionado todavía). */
  minProficiencyLevel: StaffingProficiencyLevel | null;
  /** skills.is_active al momento de hidratar — para el badge de "inactiva". */
  isActive: boolean;
  /**
   * Nombre de la skill al momento de hidratar. Solo se usa para mostrar
   * skills inactivas que ya no aparecen en el catálogo de activas (activeSkills);
   * las filas nuevas resuelven el nombre desde ese catálogo en la UI.
   */
  skillName: string | null;
}

export interface StaffingRequirementInput {
  /** Identificador local estable para listas/diffing en React. Nunca vacío. */
  clientKey: string;
  /** id de wo_staffing_requirements si ya está persistida, si no null. */
  persistedId: string | null;
  /** null = fila incompleta (categoría no seleccionada todavía). */
  categoryId: string | null;
  /** null = fila incompleta (aún no editada). */
  staffCount: number | null;
  skills: StaffingRequirementSkillInput[];
}

// ---------------------------------------------------------------------------
// Estado persistido (subconjunto estructural de
// WorkOrderStaffingRequirementWithSkills en src/hooks/useEmsData.ts)
// ---------------------------------------------------------------------------

export interface PersistedStaffingRequirementSkill {
  id: string;
  skill_id: string;
  min_proficiency_level: StaffingProficiencyLevel;
  skill?: { name?: string | null; is_active: boolean | null } | null;
}

export interface PersistedStaffingRequirement {
  id: string;
  category_id: string;
  staff_count: number;
  requirement_skills: PersistedStaffingRequirementSkill[];
}

export function createEmptySkill(): StaffingRequirementSkillInput {
  return {
    clientKey: crypto.randomUUID(),
    persistedId: null,
    skillId: "",
    minProficiencyLevel: null,
    isActive: true,
    skillName: null,
  };
}

export function createEmptyRequirement(): StaffingRequirementInput {
  return {
    clientKey: crypto.randomUUID(),
    persistedId: null,
    categoryId: null,
    staffCount: 1,
    skills: [],
  };
}

/** Convierte las filas persistidas (hook de lectura) al estado editable del formulario. */
export function hydrateFromPersisted(
  rows: readonly PersistedStaffingRequirement[],
): StaffingRequirementInput[] {
  return rows.map((row) => ({
    clientKey: row.id,
    persistedId: row.id,
    categoryId: row.category_id,
    staffCount: row.staff_count,
    skills: row.requirement_skills.map((rs) => ({
      clientKey: rs.id,
      persistedId: rs.id,
      skillId: rs.skill_id,
      minProficiencyLevel: rs.min_proficiency_level,
      isActive: rs.skill?.is_active ?? true,
      skillName: rs.skill?.name ?? null,
    })),
  }));
}

// ---------------------------------------------------------------------------
// Payload de guardado (forma exacta que valida save_wo_staffing, ver
// supabase/migrations/20260727120000_scheduler_fase2_rpc_save_wo_staffing.sql)
// ---------------------------------------------------------------------------

export interface StaffingPayloadSkill {
  skill_id: string;
  min_proficiency_level: StaffingProficiencyLevel;
}

export interface StaffingPayloadRequirement {
  category_id: string;
  staff_count: number;
  skills: StaffingPayloadSkill[];
}

/**
 * Construye el payload de `save_wo_staffing`. Asume que `validateStaffing`
 * ya pasó (categoryId/staffCount/skills completos y válidos) — no vuelve a
 * validar, solo despoja clientKey/persistedId/isActive.
 */
export function buildStaffingPayload(
  reqs: readonly StaffingRequirementInput[],
): StaffingPayloadRequirement[] {
  return reqs.map((req) => ({
    category_id: req.categoryId as string,
    staff_count: req.staffCount as number,
    skills: req.skills.map((s) => ({
      skill_id: s.skillId,
      min_proficiency_level: s.minProficiencyLevel as StaffingProficiencyLevel,
    })),
  }));
}

// ---------------------------------------------------------------------------
// Dirty check — estable pese al orden y a los IDs de cliente/persistidos.
// ---------------------------------------------------------------------------

interface CanonicalSkill {
  skill_id: string;
  min_proficiency_level: StaffingProficiencyLevel | null;
}

interface CanonicalRequirement {
  category_id: string | null;
  staff_count: number | null;
  skills: CanonicalSkill[];
}

function canonicalizeRequirement(req: StaffingRequirementInput): CanonicalRequirement {
  return {
    category_id: req.categoryId,
    staff_count: req.staffCount,
    skills: req.skills
      .map((s) => ({ skill_id: s.skillId, min_proficiency_level: s.minProficiencyLevel }))
      .sort((a, b) => a.skill_id.localeCompare(b.skill_id)),
  };
}

/** true si el estado de staffing difiere del baseline (orden e IDs de cliente/BD ignorados). */
export function isStaffingDirty(
  original: readonly StaffingRequirementInput[],
  current: readonly StaffingRequirementInput[],
): boolean {
  const canonicalize = (reqs: readonly StaffingRequirementInput[]) =>
    reqs
      .map(canonicalizeRequirement)
      .sort((a, b) => (a.category_id ?? "").localeCompare(b.category_id ?? ""));

  return JSON.stringify(canonicalize(original)) !== JSON.stringify(canonicalize(current));
}

// ---------------------------------------------------------------------------
// Validación — primer error, en el orden pedido por el issue (Fase 4 §7).
// ---------------------------------------------------------------------------

export type StaffingValidationErrorCode =
  | "STAFFING_CATEGORY_MISSING"
  | "STAFFING_CATEGORY_DUPLICATE"
  | "STAFFING_CATEGORY_FOREIGN_SERVICE"
  | "STAFFING_STAFF_COUNT_RANGE"
  | "STAFFING_SKILL_DUPLICATE"
  | "STAFFING_SKILL_INCOMPLETE"
  | "STAFFING_PROFICIENCY_INVALID";

export interface StaffingValidationError {
  code: StaffingValidationErrorCode;
  /** clientKey de la fila de requisito donde se detectó el error, para enfocarla en la UI. */
  clientKey: string;
}

/** Clave i18n (bajo workOrders.staffingRequirements.errors) para cada código de validación. */
export const STAFFING_VALIDATION_ERROR_I18N_KEY: Record<StaffingValidationErrorCode, string> = {
  STAFFING_CATEGORY_MISSING: "workOrders.staffingRequirements.errors.categoryMissing",
  STAFFING_CATEGORY_DUPLICATE: "workOrders.staffingRequirements.errors.categoryDuplicate",
  STAFFING_CATEGORY_FOREIGN_SERVICE: "workOrders.staffingRequirements.errors.categoryForeignService",
  STAFFING_STAFF_COUNT_RANGE: "workOrders.staffingRequirements.errors.staffCountRange",
  STAFFING_SKILL_DUPLICATE: "workOrders.staffingRequirements.errors.skillDuplicate",
  STAFFING_SKILL_INCOMPLETE: "workOrders.staffingRequirements.errors.skillIncomplete",
  STAFFING_PROFICIENCY_INVALID: "workOrders.staffingRequirements.errors.proficiencyInvalid",
};

export interface ValidateStaffingOptions {
  /**
   * category_id permitidos para el servicio del Engagement. `null` = servicio
   * no resoluble (Engagement legado sin `practica`) → no se bloquea por
   * servicio, mismo precedente que los triggers de Fase 2/C2.
   */
  serviceCategoryIds: ReadonlySet<string> | null;
}

/** Devuelve el primer error encontrado, o null si el estado es válido para guardar. */
export function validateStaffing(
  reqs: readonly StaffingRequirementInput[],
  options: ValidateStaffingOptions,
): StaffingValidationError | null {
  const seenCategories = new Set<string>();

  for (const req of reqs) {
    if (!req.categoryId) {
      return { code: "STAFFING_CATEGORY_MISSING", clientKey: req.clientKey };
    }
    if (seenCategories.has(req.categoryId)) {
      return { code: "STAFFING_CATEGORY_DUPLICATE", clientKey: req.clientKey };
    }
    seenCategories.add(req.categoryId);

    if (options.serviceCategoryIds && !options.serviceCategoryIds.has(req.categoryId)) {
      return { code: "STAFFING_CATEGORY_FOREIGN_SERVICE", clientKey: req.clientKey };
    }

    if (
      req.staffCount === null ||
      !Number.isInteger(req.staffCount) ||
      req.staffCount < 1 ||
      req.staffCount > 999
    ) {
      return { code: "STAFFING_STAFF_COUNT_RANGE", clientKey: req.clientKey };
    }

    const seenSkills = new Set<string>();
    for (const skill of req.skills) {
      if (!skill.skillId || !skill.minProficiencyLevel) {
        return { code: "STAFFING_SKILL_INCOMPLETE", clientKey: req.clientKey };
      }
      if (seenSkills.has(skill.skillId)) {
        return { code: "STAFFING_SKILL_DUPLICATE", clientKey: req.clientKey };
      }
      seenSkills.add(skill.skillId);
      if (!STAFFING_PROFICIENCY_LEVELS.includes(skill.minProficiencyLevel)) {
        return { code: "STAFFING_PROFICIENCY_INVALID", clientKey: req.clientKey };
      }
    }
  }

  return null;
}
