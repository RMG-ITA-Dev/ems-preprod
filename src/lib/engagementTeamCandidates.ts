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
// categoría ya no dicta el rol. Como `useStaff()` no expone `auth_user_id` (PII excluido a
// propósito), el cruce personal↔rol se hace del lado del servidor —
// `get_engagement_team_candidates()` — y este módulo solo contiene la parte pura y testeable:
// el mapa campo→grupo, el mapa role_key→grupo (espejo del CASE del RPC), el filtro por servicio
// y el merge del valor ya guardado.

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

// Espejo EXACTO del CASE de get_engagement_team_candidates(). Está duplicado por necesidad —
// el filtro real tiene que ocurrir en la BD (no se puede confiar en el cliente), y acá se
// necesita para tipar/rutear. La mitigación de la duplicación es cobertura: los tests recorren
// los 11 roles en ambos lados.
//
// Solo el ROL BASE de cada nivel es elegible (decisión de negocio 2026-08-17):
//   · Socio/Director y SQR → `partner`, `director`. Fuera: `senior_partner`, `risk_partner`.
//   · Gerente             → `manager`. Fuera: los seis managers especializados
//                           (`ita_manager`, `tax_manager`, `it_security_manager`,
//                           `accounting_manager`, `hr_manager`, `risk_supervisor`).
//   · Encargado           → `senior`, `semisenior`. Fuera: `ita_senior`, `tax_senior` y los
//                           tres `*_analyst`.
//   · Especialistas       → las tres familias `ita_*` / `tax_*` completas.
// `admin` queda fuera de los seis campos: es un rol técnico, no de negocio. A quien figure como
// `admin` siendo Socio/Director/Gerente se le asigna su role_key real en Settings.
export const ROLE_KEY_TO_GROUP: Record<string, TeamCandidateGroup> = {
  partner: "partner_director",
  director: "partner_director",
  manager: "manager",
  senior: "encargado",
  semisenior: "encargado",
  ita_manager: "specialist_it",
  ita_senior: "specialist_it",
  ita_assistant: "specialist_it",
  tax_manager: "specialist_tax",
  tax_senior: "specialist_tax",
  tax_assistant: "specialist_tax",
};

/** Los `role_key` elegibles, en el orden del mapa. Espeja el `IN (...)` del RPC. */
export const ELIGIBLE_ROLE_KEYS = Object.keys(ROLE_KEY_TO_GROUP);

/** Opción de combobox de personal, con el servicio del candidato para el filtro por servicio. */
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
 * Estado del filtro por servicio. Son TRES situaciones distintas, no dos —
 * colapsarlas en un `string | null` fue el defecto que marcó la revisión de Greptile:
 *
 *   { apply: false }                      → todavía no hay servicio que aplicar (creación sin
 *                                           `practica` elegida). Se filtra solo por rol.
 *   { apply: true,  serviceId: "svc-x" }  → hay servicio resuelto: se restringe a él.
 *   { apply: true,  serviceId: null }     → hay `practica` pero el catálogo de servicios no la
 *                                           resolvió (cargando, falló, o el code no existe).
 *                                           FAIL-CLOSED: lista vacía.
 *
 * El tercer caso es el importante: si se devolviera la lista completa, durante la carga del
 * catálogo se ofrecería personal de otros servicios, y una selección hecha en esa ventana
 * quedaría en el formulario y podría guardarse contra el servicio equivocado.
 */
export interface ServiceFilter {
  apply: boolean;
  serviceId: string | null;
}

/** Filtro inerte, para cuando todavía no hay `practica` elegida. */
export const NO_SERVICE_FILTER: ServiceFilter = { apply: false, serviceId: null };

/**
 * Restringe las opciones al servicio del encargo.
 *
 * Nunca ensancha el conjunto: en la duda devuelve menos, no más. El filtro por rol ya lo aplicó
 * el RPC; acá solo se refina por servicio.
 */
export function filterByService(
  options: TeamCandidateOption[],
  filter: ServiceFilter
): TeamCandidateOption[] {
  if (!filter.apply) return options;
  if (!filter.serviceId) return [];
  return options.filter((o) => o.serviceId === filter.serviceId);
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
 *
 * Se aplica DESPUÉS de `filterByService`: el staff embebido en el encargo no trae `service_id`,
 * y el histórico debe preservarse sin importar el servicio.
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
 * cuatro) y DESPUÉS de `filterByService`. Es una excepción DELIBERADA al filtro por servicio: los
 * no-admin reciben `practica` = Auditoría forzada, y un creador cuyo `staff.service_id` sea otro no
 * sobreviviría al filtro. Sin esta inyección pasarían tres cosas a la vez, todas malas:
 *
 *   1. `StaffCombobox` no encontraría el id en `options` y mostraría el placeholder en un campo
 *      obligatorio que SÍ está lleno y además bloqueado.
 *   2. El `useEffect` de limpieza de valores stale de EngagementForm borraría el valor sembrado,
 *      dejando un campo obligatorio bloqueado y VACÍO ⇒ formulario sin salida.
 *   3. El aviso de "falta personal" no se dispararía (otros socios sí califican), así que el
 *      usuario no tendría ninguna explicación.
 *
 * Al vivir dentro del memo de opciones, las tres se resuelven de una sola vez: no hace falta
 * exceptuar el efecto de limpieza aparte, porque para él el valor deja de ser stale.
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
