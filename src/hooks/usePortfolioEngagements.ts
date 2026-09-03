import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Engagement } from "@/hooks/useEmsData";

// BUG 0828-185 — Encargos.tsx / EngagementEdit.tsx / ClientEngagementsTable.tsx mostraban,
// además de lo creado por el usuario, cualquier encargo donde figurara como partner/manager/
// sqr/encargado (la policy RLS "engagements read" resuelve "asignado" así para el scope
// assigned_engagements). El RPC dedicado list_portfolio_engagements() (SECURITY DEFINER,
// bugs/0828-185/plan_v2.md §c.1) aplica en su lugar las reglas de negocio: firm-wide para los
// roles que ya ven todo, own_society/own_management por role_key, y creador para cualquiera —
// sin tocar la policy real, que otras pantallas (aprobación de OT, Hoja de Tiempo, worksheets)
// siguen necesitando intacta.
//
// NOTA: list_portfolio_engagements aún no está en src/integrations/supabase/types.ts (se
// regenera tras aplicar la migración desde el Supabase real) — mismo escape que
// useEngagementTeamCandidates() con get_engagement_team_candidates.
export function usePortfolioEngagements() {
  return useQuery({
    // Prefijo compartido con ["engagements"]: las invalidaciones existentes de
    // useEngagementMutations.ts (create/update/delete) usan queryKey: ["engagements"], que
    // TanStack matchea por prefijo — este hook se refresca con ellas sin ningún cambio ahí.
    queryKey: ["engagements", "portfolio"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc(
        "list_portfolio_engagements" as never
      );
      if (error) throw error;
      return (data ?? []) as unknown as Engagement[];
    },
  });
}
