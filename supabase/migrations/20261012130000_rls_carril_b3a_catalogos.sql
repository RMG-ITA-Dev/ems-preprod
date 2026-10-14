-- Carril B, etapa B3a del barrido de seguridad RLS: RLS en los cuatro catálogos de configuración
-- (activity_codes, categories, expense_types, industries). BAR-002 (escritura) y BAR-013 (parte).
-- Resumen y decisiones: docs/seguridad/registro-seguridad-rls.md. Idempotente (ENABLE RLS repetido no
-- cambia nada): se aplica primero a mano en Dev 2.0 para probar y después con `db push`, que la
-- registra en el ledger. Cada etapa del Carril B va en su propio archivo.
--
-- Por qué estaba apagado: la migración 20260115000154 (bot de Lovable) hizo
-- `DISABLE ROW LEVEL SECURITY` en 20 tablas «for beta testing» y nunca se revirtió; la consolidación
-- «cero» reprodujo ese estado. Las políticas siguen escritas en cero_05 y nunca rigieron.
--
-- Qué cambia al activarlas, medido en Dev 2.0 el 12/10/2026 con las 11 cuentas de prueba (ensayo con
-- ROLLBACK):
--   · LECTURA: no cambia para nadie. La política de lectura de las cuatro es `USING (true)` para
--     `authenticated`: todos siguen viendo 25 / 61 / 6 / 10 filas. Por eso esta etapa no puede dejar una
--     pantalla vacía.
--   · ESCRITURA: pasa de «cualquier empleado» a «quien tenga el permiso». Hasta hoy cualquier usuario con
--     sesión podía crear, editar o borrar tipos de gasto, industrias, códigos de actividad y categorías
--     (con sus tarifas), porque `authenticated` tiene GRANT ALL y no había RLS. Ahora rigen las políticas
--     `has_permission('<tabla>.create|update|delete')` (admin; expense_type también cobranza y
--     contabilidad) y las de `is_admin()`.
--
-- No cambia lo que ya funciona fuera de RLS: las funciones que escriben estas tablas
-- (create_category_for_practice, update_category_for_practice, move_category, create_practice_activity,
-- etc.) son SECURITY DEFINER y siguen igual; no hay funciones ni triggers INVOKER que las escriban; las
-- Edge Functions usan service_role. Las tarifas de `categories` siguen siendo legibles por todos los
-- usuarios con sesión: RLS filtra filas, no columnas, y eso queda para una etapa aparte de B3.

-- Guarda: activar RLS sin política de lectura dejaría la tabla ilegible para todos (fallo silencioso).
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['activity_codes', 'categories', 'expense_types', 'industries'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_policies
                    WHERE schemaname = 'public' AND tablename = t AND cmd = 'SELECT') THEN
      RAISE EXCEPTION 'B3a: public.% no tiene política de lectura; activar RLS la dejaría ilegible para todos', t;
    END IF;
  END LOOP;
END $$;

ALTER TABLE public.activity_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_types  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.industries     ENABLE ROW LEVEL SECURITY;
