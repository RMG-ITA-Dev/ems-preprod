// BUG 0722-162 — elegibilidad por rol de los seis selectores del bloque "Equipo" del encargo.
//
// Antes de este fix, cuatro de los seis campos (SQR, Encargado, Especialista TI, Especialista
// Impuestos) recibían `allActiveStaff` — la nómina completa, sin ningún filtro — y los otros dos
// filtraban por rangos de `categories.display_order`, que dejó de significar jerarquía cuando
// 20260130231039 insertó SQR en la posición 2 y 20260702000002 renormalizó el orden 1..N POR
// SERVICIO. Resultado: "Socio/Director" ofrecía gente SQR y omitía a los Director, y
// "Gerente/Supervisor" listaba Seniors.
//
// La autoridad ahora es `user_roles.role_key` (catálogo de 23 roles), no la categoría del
// personal: FASE 3c quitó `default_app_role` del formulario de categorías justamente porque la
// categoría ya no dicta el rol. 0820-182 devolvió un selector de rol a ese formulario, pero como
// SUGERENCIA (`default_role_key`, confirmada a mano en StaffForm) — la autoridad sigue siendo
// `user_roles.role_key`. Como `useStaff()` no expone `auth_user_id` (PII excluido a
// propósito), el cruce personal↔rol se hace del lado del servidor —
// `get_engagement_team_candidates()` — y este módulo solo contiene la parte pura y testeable:
// el mapa campo→grupo, el mapa role_key→grupo (espejo del CASE del RPC) y el merge del valor ya
// guardado.
//
// ACTUALIZADO 2026-08-27 (decisión del operador): este módulo tenía además un filtro ADICIONAL
// por práctica/servicio del encargo (`filterByService`/`ServiceFilter`/`NO_SERVICE_FILTER`),
// retirado por completo. La firma tiene 4 Socios que manejan de todo — ninguno "asignado" a una
// práctica en particular — así que ese filtro dejaba los seis campos vacíos para cualquier
// creador cuya práctica de ficha no tuviera un candidato con esa misma práctica. La elegibilidad
// depende ÚNICAMENTE del rol (`ROLE_KEY_TO_GROUP` / `candidate_group`), nunca de la práctica.

/** Los cinco grupos de candidatura que devuelve `get_engagement_team_candidates()`. */
export type TeamCandidateGroup =
  | "partner_director"
  | "manager"
  | "encargado"
  | "specialist_it"
  | "specialist_tax";

/** Los seis campos de personal del bloque Equipo, por nombre de columna del encargo. */
export type TeamFieldName =
  | "partner_id"
  | "sqr_id"
  | "manager_id"
  | "encargado_id"
  | "specialist_it_id"
  | "specialist_tax_id";

// Traducción literal de la SUGERENCIA del packet 0722-162. `partner_id` y `sqr_id` comparten
// grupo a propósito: el packet pide "Socio o Director" para AMBOS campos (SQR = Socio de Control
// de Calidad, o sea un socio/director actuando de contralor), y la categoría `SQR` NO es elegible
// en su propio campo — decisión confirmada, no un olvido.
export const TEAM_FIELD_GROUPS: Record<TeamFieldName, TeamCandidateGroup> = {
  partner_id: "partner_director",
  sqr_id: "partner_director",
  manager_id: "manager",
  encargado_id: "encargado",
  specialist_it_id: "specialist_it",
  specialist_tax_id: "specialist_tax",
};

// Espejo EXACTO del mapeo (role_key, candidate_group) de get_engagement_team_candidates().
// Está duplicado por necesidad — el filtro real tiene que ocurrir en la BD (no se puede confiar
// en el cliente), y acá se necesita para tipar/rutear. La mitigación de la duplicación es
// cobertura: los tests recorren los 14 roles en ambos lados.
//
// Solo el ROL BASE de cada nivel es elegible (decisión de negocio 2026-08-17), con dos
// ampliaciones del operador (BUG 0828-185):
//   · Socio/Director y SQR → `partner`, `director`, y desde 0828-185 también `senior_partner`/
//                           `risk_partner` (visibilidad firm-wide, antes excluidos del bloque
//                           Equipo pese a eso).
//   · Gerente             → `manager`, `hr_manager` (0817-180: "no hagamos casos especiales") y
//                           desde 0828-185 también `ita_manager`/`tax_manager` — un Especialista
//                           TI/Impuestos puede además actuar como Gerente de CUALQUIER encargo,
//                           no solo del suyo. Fuera: `it_security_manager`, `accounting_manager`,
//                           `risk_supervisor`.
//   · Encargado           → `senior`, `semisenior`. Fuera: `ita_senior`, `tax_senior` y los
//                           tres `*_analyst` (incluido `hr_analyst`: mismo criterio que
//                           `accounting_analyst`/`collections_analyst`, ninguno es candidato).
//   · Especialistas       → las tres familias `ita_*` / `tax_*` completas — `ita_manager`/
//                           `tax_manager` caen ADEMÁS en su especialidad (doble grupo).
// `admin` queda fuera de los seis campos: es un rol técnico, no de negocio. A quien figure como
// `admin` siendo Socio/Director/Gerente se le asigna su role_key real en Settings.
export const ROLE_KEY_TO_GROUPS: Record<string, readonly TeamCandidateGroup[]> = {
  partner: ["partner_director"],
  director: ["partner_director"],
  senior_partner: ["partner_director"],
  risk_partner: ["partner_director"],
  manager: ["manager"],
  hr_manager: ["manager"],
  senior: ["encargado"],
  semisenior: ["encargado"],
  ita_manager: ["specialist_it", "manager"],
  ita_senior: ["specialist_it"],
  ita_assistant: ["specialist_it"],
  tax_manager: ["specialist_tax", "manager"],
  tax_senior: ["specialist_tax"],
  tax_assistant: ["specialist_tax"],
};

/** Los `role_key` elegibles, en el orden del mapa. Espeja el JOIN de mapeo del RPC. */
export const ELIGIBLE_ROLE_KEYS = Object.keys(ROLE_KEY_TO_GROUPS);

/**
 * Opción de combobox de personal. `serviceId` es la práctica del candidato tal como la devuelve
 * el RPC — puramente informativo desde 2026-08-27: ya no alimenta ningún filtro (ver la nota de
 * cabecera de este archivo).
 */
export interface TeamCandidateOption {
  value: string;
  label: string;
  serviceId: string | null;
}

/** Forma mínima del staff embebido en el encargo (`engagement.partner`, `.sqr`, …). */
export interface SavedStaffRef {
  staff_id: string;
  first_name: string;
  last_name: string;
}

/**
 * Fusiona a la persona ya asignada cuando no califica bajo el criterio nuevo — pero SOLO mientras
 * siga siendo el valor del campo.
 *
 * El objetivo es que un valor histórico no desaparezca de su propio campo: sin esto,
 * `StaffCombobox` no encontraría el id en `options` y mostraría el placeholder en un campo
 * obligatorio que sí está lleno (el valor sigue en React Hook Form, así que no se pierde al
 * guardar, pero el usuario lo vería vacío). Mismo patrón que `societyOptions` /
 * `clientOptions` / `activeServiceOptions` en EngagementForm.
 *
 * `currentValue` es lo que distingue "no perder de vista lo guardado" de "volver elegible a
 * alguien que no califica" (review de Codex). Si el editor ya eligió un reemplazo válido, el
 * histórico deja de ofrecerse: si siguiera en la lista podría volver a seleccionarse y
 * persistirse, y el update path no valida elegibilidad.
 */
export function withSavedStaff(
  options: TeamCandidateOption[],
  saved: SavedStaffRef | null | undefined,
  currentValue: string | null | undefined
): TeamCandidateOption[] {
  if (!saved) return options;
  // Ya fue reemplazado por otro valor ⇒ no re-ofrecerlo.
  if (currentValue !== saved.staff_id) return options;
  if (options.some((o) => o.value === saved.staff_id)) return options;
  return [
    ...options,
    {
      value: saved.staff_id,
      label: `${saved.first_name} ${saved.last_name}`,
      serviceId: null,
    },
  ];
}

/**
 * BUG 0810-172 — garantiza que el creador autoasignado figure en las opciones de SU campo.
 *
 * Se aplica solo al campo que 0810-172 bloquea (`partner_id` o `manager_id`, nunca a los otros
 * cuatro). Sin esta inyección pasarían dos cosas a la vez, ambas malas:
 *
 *   1. `StaffCombobox` no encontraría el id en `options` y mostraría el placeholder en un campo
 *      obligatorio que SÍ está lleno y además bloqueado.
 *   2. El aviso de "falta personal" no se dispararía (otros candidatos sí califican), así que el
 *      usuario no tendría ninguna explicación.
 *
 * A diferencia de `withSavedStaff`, no se condiciona al valor vigente del campo: el creador debe
 * poder mostrarse ANTES de que el efecto de siembra escriba el valor, y el campo queda bloqueado,
 * así que no hay riesgo de que se use para re-seleccionar a alguien inelegible.
 */
export function withSelfCandidate(
  options: TeamCandidateOption[],
  self: TeamCandidateOption | null
): TeamCandidateOption[] {
  if (!self) return options;
  if (options.some((o) => o.value === self.value)) return options;
  return [...options, self];
}
