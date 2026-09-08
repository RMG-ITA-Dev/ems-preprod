/**
 * BUG 0820-182 — qué roles puede SUGERIR una categoría.
 *
 * `categories.default_role_key` es una sugerencia: el formulario de categorías la propone
 * y StaffForm ofrece aplicarla al cambiar de categoría. Eso la convierte en un camino de
 * asignación de roles, y por lo tanto en un vector de escalada de privilegios si el rol
 * sugerido es `admin` — bastaría con mover a alguien a una categoría "administrativa".
 *
 * Por eso `admin` nunca es sugerible. Es un rol técnico/de seguridad: se asigna a mano en
 * Configuración → Roles de Usuario, nunca por pertenencia a una categoría.
 *
 * La regla vive acá y no duplicada en cada consumidor porque tiene DOS puntos de
 * aplicación con consecuencias distintas:
 *   · CategoryForm — filtra el desplegable (no se puede elegir);
 *   · StaffForm    — no ofrece sincronizar (no se puede aplicar).
 * Filtrar solo el primero deja abierto el segundo: un `default_role_key` que llegue por
 * otra vía (backfill desde el enum legacy, un RPC llamado a mano, un restore) seguiría
 * ofreciéndose. La BD lo refuerza además con un CHECK en la columna, así que son tres
 * capas para el mismo invariante.
 */
export const NON_SUGGESTABLE_ROLE_KEYS = ["admin"] as const;

export function isSuggestableRoleKey(roleKey: string | null | undefined): boolean {
  if (!roleKey) return false;
  return !NON_SUGGESTABLE_ROLE_KEYS.includes(roleKey as (typeof NON_SUGGESTABLE_ROLE_KEYS)[number]);
}
