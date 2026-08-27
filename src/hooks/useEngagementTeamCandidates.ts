import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  TeamCandidateGroup,
  TeamCandidateOption,
} from "@/lib/engagementTeamCandidates";

// BUG 0722-162 — candidatos elegibles para cada campo del bloque "Equipo" del encargo.
//
// Por qué un RPC y no `useStaff()`: el rol de negocio vive en `user_roles.role_key`, y para
// cruzarlo con el personal hace falta `staff.auth_user_id`, que `useStaff()` NO selecciona (PII
// excluido a propósito, ver useEmsData.ts). Tampoco sirve `get_all_user_roles()`: está gateado
// por `user_role.read` — permiso que un Gerente con `engagement.create` no necesariamente tiene —
// y además devuelve email y user_id, PII que este caso de uso no necesita.
//
// `get_engagement_team_candidates()` es SECURITY DEFINER, gateada por
// `engagement.create OR engagement.update`, y devuelve un GRUPO neutro en vez del `role_key`
// crudo: quien crea un encargo no necesita conocer el rol exacto de sus colegas.

/** Fila cruda del RPC. */
interface TeamCandidateRow {
  staff_id: string;
  display_name: string;
  candidate_group: TeamCandidateGroup | null;
  practica_id: string | null;
}

export interface UseEngagementTeamCandidatesResult {
  /** Socio/Director — alimenta `partner_id` Y `sqr_id` (ambos piden Socio o Director). */
  partnerDirectorOptions: TeamCandidateOption[];
  /** Gerente/Supervisor — solo el rol base `manager`. */
  managerRoleOptions: TeamCandidateOption[];
  /** Encargado — `senior` y `semisenior`. */
  encargadoOptions: TeamCandidateOption[];
  /** Especialista TI — las tres familias `ita_*`. */
  specialistItOptions: TeamCandidateOption[];
  /** Especialista Impuestos — las tres familias `tax_*`. */
  specialistTaxOptions: TeamCandidateOption[];
  /** Primer fetch, todavía sin datos. */
  isLoading: boolean;
  /**
   * Hay un fetch en curso, INCLUIDO el refetch en background que sirve datos cacheados.
   *
   * Review de Codex: `isLoading` no alcanza para decidir si los candidatos son confiables. Con
   * datos en cache TanStack devuelve `isLoading: false` y refetchea por detrás, así que el
   * formulario seguiría ofreciendo el conjunto viejo. Y las invalidaciones que disparan las
   * mutaciones de personal y de roles vuelven ese camino la NORMA: la query queda stale, y al
   * montar el formulario siempre hay una ventana sirviendo lo anterior. Quien consuma este hook
   * debe tratar `isFetching` como "todavía no resuelto".
   */
  isFetching: boolean;
  isError: boolean;
}

// A propósito NO se exponen flags tipo `hasPartnerDirectorCandidates`: EngagementForm ya deriva
// el aviso de "falta personal" directamente de la longitud de estos mismos arrays, así que un
// flag aparte solo duplicaría esa cuenta sin agregar información.

const EMPTY: TeamCandidateOption[] = [];

export function useEngagementTeamCandidates(): UseEngagementTeamCandidatesResult {
  const { data, isLoading, isFetching, isError } = useQuery({
    queryKey: ["engagement-team-candidates"],
    queryFn: async () => {
      // NOTA: get_engagement_team_candidates aún no está en src/integrations/supabase/types.ts
      // (se regenera tras aplicar la migración desde el Supabase real). Hasta entonces se
      // castea el nombre — mismo escape que usa useStaffFull() con get_staff_full.
      const { data, error } = await supabase.rpc(
        "get_engagement_team_candidates" as never
      );
      if (error) throw error;
      return (data ?? []) as unknown as TeamCandidateRow[];
    },
  });

  // Un solo pase agrupando por `candidate_group`. Preserva el orden que ya trae el RPC
  // (ORDER BY last_name, first_name), así los selectores siguen alfabéticos por apellido.
  //
  // Ante error o datos ausentes: arrays VACÍOS, nunca la nómina completa. Un fallback amplio
  // recrearía exactamente el bug que este fix corrige.
  const grouped = useMemo(() => {
    const buckets: Record<TeamCandidateGroup, TeamCandidateOption[]> = {
      partner_director: [],
      manager: [],
      encargado: [],
      specialist_it: [],
      specialist_tax: [],
    };
    for (const row of data ?? []) {
      // Defensa: el CASE del RPC devuelve NULL si algún rol dejara de estar mapeado.
      if (!row.candidate_group || !(row.candidate_group in buckets)) continue;
      buckets[row.candidate_group].push({
        value: row.staff_id,
        label: row.display_name,
        serviceId: row.practica_id,
      });
    }
    return buckets;
  }, [data]);

  return {
    partnerDirectorOptions: grouped.partner_director ?? EMPTY,
    managerRoleOptions: grouped.manager ?? EMPTY,
    encargadoOptions: grouped.encargado ?? EMPTY,
    specialistItOptions: grouped.specialist_it ?? EMPTY,
    specialistTaxOptions: grouped.specialist_tax ?? EMPTY,
    isLoading,
    isFetching,
    isError,
  };
}
