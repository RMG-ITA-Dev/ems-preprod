// Cobranzas — quién entra a la vista de Cobranzas y a las acciones de cobranza.
//
// Sin React ni Supabase, para que la misma regla sirva en el sidebar, en la página de Cobranzas
// y en la OT, y no se escriba tres veces con tres criterios distintos.
//
// Es el espejo en el cliente de `public.is_collections_role()`: Gerente de Contabilidad y
// Analista de Cobranzas tienen EXACTAMENTE los mismos permisos de cobranza (decisión del
// operador Q58). El Analista de Contabilidad (`accounting_analyst`) queda fuera a propósito:
// sólo trabaja solicitudes de fondos.
//
// La autoridad real es el servidor —la RPC y las policies—; esto sólo decide qué mostrar.

export const COLLECTIONS_ROLES: ReadonlySet<string> = new Set([
  "accounting_manager",
  "collections_analyst",
]);

/** ¿Este rol hace cobranza? `admin` entra aparte, igual que en la base. */
export function isCollectionsRole(roleKey: string | null | undefined): boolean {
  return !!roleKey && COLLECTIONS_ROLES.has(roleKey);
}

/** Quién ve la pantalla de Cobranzas y las acciones de cobranza de la OT. */
export function canDoCollections(roleKey: string | null | undefined): boolean {
  return roleKey === "admin" || isCollectionsRole(roleKey);
}
