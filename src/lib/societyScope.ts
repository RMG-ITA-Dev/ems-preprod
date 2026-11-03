// Alcance por sociedad (2026-10-28) — Contabilidad y Cobranzas solo ven y operan lo de SU sociedad.
//
// Sin React ni Supabase, igual que collectionsAccess.ts. Es el espejo en el cliente de
// `public.is_society_scoped_role_key()`: la autoridad real son las políticas RESTRICTIVE y las RPC;
// esto solo decide qué mostrar (por ejemplo, el selector de sociedad de Cobranzas) y cómo explicar
// los rechazos del servidor.

export const SOCIETY_SCOPED_ROLES: ReadonlySet<string> = new Set([
  "accounting_manager",
  "accounting_analyst",
  "collections_analyst",
]);

/** ¿Este rol está limitado a su sociedad? Admin y el resto de roles, no. */
export function isSocietyScopedRole(roleKey: string | null | undefined): boolean {
  return !!roleKey && SOCIETY_SCOPED_ROLES.has(roleKey);
}

// Prefijos estables que el servidor pone al principio del mensaje (todos con SQLSTATE 42501 salvo el
// del encargo). Van ANTES del mapeo genérico por código: un 42501 cualquiera no es "otra sociedad".
// FUND_REQUEST_ENGAGEMENT_FORBIDDEN (BUG 0923-202) no es de sociedad, pero es la misma regla de armado de
// solicitudes y el mismo mecanismo: el solicitante no es del equipo ni está asignado al encargo de la OT.
const SOCIETY_ERROR_KEYS: ReadonlyArray<readonly [token: string, i18nKey: string]> = [
  ["FUND_REQUEST_SOCIETY_MISMATCH", "errors.fundRequestSocietyMismatch"],
  ["FUND_REQUEST_ENGAGEMENT_FORBIDDEN", "errors.fundRequestEngagementForbidden"],
  ["ENGAGEMENT_SOCIETY_LOCKED", "errors.engagementSocietyLocked"],
  ["SOCIETY_SCOPE_FORBIDDEN", "errors.societyScopeForbidden"],
];

/** La clave de traducción del rechazo por sociedad que trae el mensaje, o null si no es uno de ellos. */
export function societyScopeErrorKey(message: string | null | undefined): string | null {
  if (!message) return null;
  return SOCIETY_ERROR_KEYS.find(([token]) => message.includes(token))?.[1] ?? null;
}
