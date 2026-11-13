import { ReactNode } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuthorization } from "@/hooks/useAuthorization";
import { useCurrentStaff } from "@/hooks/useCurrentStaff";
import { PermissionRoute } from "@/components/authz/PermissionRoute";

// 1110-220 (plan_v5 §6.4) — el Aprobador de horas de un encargo no-Cliente abre el detalle del encargo y de su OT en solo
// lectura aunque su rol no tenga `engagement.read` / `work_order.read` (senior, ita_senior, tax_senior). No se concede el
// permiso global: la excepción se decide por DATO, con una consulta sujeta a RLS (políticas "engagements hours approver
// read" y "Team can view engagement work orders"). Si la fila no vuelve, no hay acceso. Quien tiene el permiso entra
// como siempre y la consulta ni se hace. Escribir sigue dependiendo de los permisos de edición: la pantalla queda en
// solo lectura.

interface HoursApproverDetailRouteProps {
  permission: "engagement.read" | "work_order.read";
  kind: "engagement" | "work_order";
  children: ReactNode;
}

export function HoursApproverDetailRoute({ permission, kind, children }: HoursApproverDetailRouteProps) {
  const { id } = useParams<{ id: string }>();
  const { can, isLoading: authLoading } = useAuthorization();
  const { staffRecord, isLoading: staffLoading } = useCurrentStaff();
  const myStaffId = staffRecord?.staff_id ?? null;
  const needsCheck = !authLoading && !can(permission) && !!id;

  const { data: allowed, isLoading } = useQuery({
    queryKey: ["hours-approver-route", kind, id, myStaffId],
    enabled: needsCheck && !!myStaffId,
    queryFn: async () => {
      if (kind === "engagement") {
        const { data, error } = await supabase
          .from("engagements")
          .select("engagement_id, funcion, manager_id")
          .eq("engagement_id", id as string)
          .maybeSingle();
        if (error) return false;
        return !!data && data.funcion != null && data.funcion !== 1 && data.manager_id === myStaffId;
      }
      const { data, error } = await supabase
        .from("work_orders")
        .select("wo_id, engagement:engagements(funcion, manager_id)")
        .eq("wo_id", id as string)
        .maybeSingle();
      if (error || !data) return false;
      const eng = (data as unknown as { engagement: { funcion: number | null; manager_id: string | null } | null }).engagement;
      return !!eng && eng.funcion != null && eng.funcion !== 1 && eng.manager_id === myStaffId;
    },
  });

  const pending = needsCheck && (staffLoading || (!!myStaffId && isLoading));

  return (
    <PermissionRoute permission={permission} alsoAllow={{ allowed: !!allowed, pending }}>
      {children}
    </PermissionRoute>
  );
}
