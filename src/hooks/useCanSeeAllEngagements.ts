import { useAuthorization } from "@/hooks/useAuthorization";

/**
 * ¿El usuario lee TODOS los encargos de la firma?
 *
 * B3c activó RLS en `engagements`: la política de lectura devuelve todos los encargos solo si el alcance de
 * `engagement.read` NO es por asignación (firm o department); con `assigned_engagements` (gerente, socio, director,
 * SQR, hr_*) devuelve únicamente los suyos. Los conteos que se calculan en el navegador a partir de `useEngagements()`
 * (encargos por persona en Personal, por cliente en Clientes) solo son verdaderos cuando esto es `true`; si no, son
 * un número parcial presentado como real, así que la pantalla debe mostrar «-» en vez de un conteo engañoso.
 */
export function useCanSeeAllEngagements(): boolean {
  const { can, scope } = useAuthorization();
  if (!can("engagement.read")) return false;
  const s = scope("engagement.read");
  return s === "firm" || s === "department";
}
