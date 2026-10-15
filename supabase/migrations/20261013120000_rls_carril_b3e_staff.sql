-- Carril B, etapa B3e del barrido de seguridad RLS: RLS en public.staff. BAR-002, BAR-013 (parte).
-- Resumen y decisiones: docs/seguridad/registro-seguridad-rls.md. Idempotente (DROP POLICY IF EXISTS, ENABLE RLS repetido
-- no cambia nada): se aplica primero a mano en Dev 2.0 para probar y después con `db push`.
--
-- Por qué estaba apagado: ver 20261012130000 (B3a): la migración 20260115000154 del bot de Lovable apagó el RLS
-- «for beta testing» y nunca se revirtió. Las políticas de cero_05 siguen escritas y se conservan, salvo una.
--
-- Qué cambia:
--   · LECTURA: nada. Siguen las tres políticas de SELECT de cero_05, una de ellas `USING (true)` (permisivas: se suman),
--     así que cualquier empleado con sesión lee todas las fichas, como hoy. Los datos sensibles (id_number,
--     aud_reg_number, target_utilization_percent) siguen protegidos por el SELECT por columna de authenticated y se
--     leen por get_staff_full() (staff.read). La RLS no decide aquí qué columnas se ven.
--   · ESCRITURA: INSERT/UPDATE/DELETE pasan a regir por las políticas «staff write *» (staff.create / staff.update /
--     staff.delete: hoy solo admin). Antes de B3e (RLS apagado) los 11 roles de prueba actualizaban las 32 fichas,
--     insertaban y borraban, y podían SECUESTRAR la identidad de un compañero (soltar su auth_user_id y tomar el de otro:
--     get_my_staff_id() devolvía la ficha del compañero y con ella su alcance de gerente o socio; no hay UNIQUE sobre
--     auth_user_id).
--   · Se QUITA «Users can update their linked staff record» (auth_user_id = auth.uid(), TO public, sin acotar columnas):
--     dejaba a cualquiera cambiar su propia categoría, sociedad, práctica, is_active o fechas. Ningún flujo legítimo la
--     usa: el único UPDATE de un no-admin sobre staff era el auto-enlace por email de useCurrentStaff, que esa política
--     ni siquiera permitía (la fila sin enlazar no cumple auth_user_id = auth.uid()); el hook ya no lo hace. El enlace
--     lo hacen los triggers DEFINER link_auth_user_to_staff y trg_link_staff_to_auth_user.
--   · Sin cambio: las 49 funciones DEFINER que leen o escriben staff (dueño postgres, BYPASSRLS, sin FORCE), las vistas
--     (staff_directory solo SELECT; vw_staffing_alerts y vw_actual_hours_by_category_activity son security_invoker y leen
--     con la política `true`) y las políticas de otras tablas que consultan staff en línea (la lectura sigue abierta).
--     service_role (Edge Functions) tiene BYPASSRLS.

-- 1. Política retirada ──────────────────────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users can update their linked staff record" ON public.staff;

-- 2. Guarda y ENABLE RLS ────────────────────────────────────────────────────────────────────────────────────────────
-- Activar RLS sin política de lectura dejaría la tabla ilegible para todos; sin la de UPDATE, ni admin podría editar.
DO $$
DECLARE
  c text;
BEGIN
  FOREACH c IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_policies
                    WHERE schemaname = 'public' AND tablename = 'staff' AND cmd = c) THEN
      RAISE EXCEPTION 'B3e: public.staff no tiene política de %; activar RLS la dejaría inutilizable', c;
    END IF;
  END LOOP;
END $$;

ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;
