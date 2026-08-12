-- =====================================================================
-- Post-reset: restaurar grants de Supabase + activar RLS
-- =====================================================================
-- Tras reconstruir el esquema `public` desde cero (drop schema / db reset), se
-- pierden DOS cosas que Supabase configura al crear el proyecto y que las
-- migraciones NO recrean:
--
--   1. Los GRANTS de tabla/secuencia a anon/authenticated → sin ellos PostgREST
--      da "permission denied for table ..." (42501) al loguear.
--   2. El RLS quedó apagado en 18 tablas (drift de 20260115000154, ver
--      docs/hallazgo-rls-drift-ruta-a.md).
--
-- Con grants restaurados PERO RLS apagado, esas tablas quedarían LEGIBLES por
-- anon (la anon key es pública) → por eso los dos pasos van juntos y en este
-- orden. Con RLS on, las políticas filtran por auth.uid() (anon no ve nada).
--
-- Idempotente. Correr contra Test:
--   psql "$SUPABASE_DB_URL" -f supabase/tests/local/post-reset-grants-rls.sql
-- =====================================================================

-- 1) Grants de tabla / secuencia (estándar Supabase; RLS restringe las filas).
grant usage on schema public to anon, authenticated, service_role;
grant all on all tables    in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables    to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;

-- 2) Funciones: EXECUTE solo a authenticated/service_role (NO anon, para no
--    deshacer los `revoke ... from public` de seguridad de las funciones authz).
grant execute on all functions in schema public to authenticated, service_role;
alter default privileges in schema public grant execute on functions to authenticated, service_role;

-- 3) Re-activar RLS en las tablas que el replay dejó apagadas.
do $$
declare
  v_t text;
  v_tables text[] := array[
    'activity_codes','activity_worksheet_cells','activity_worksheets','categories',
    'clients','engagements','expense_types','global_settings','industries','staff',
    'staff_capacity','time_entries','timer_entries','timesheet_line_approvals',
    'timesheet_periods','user_roles','wo_budget_lines','wo_expense_budget','work_orders',
    'migration_run_log','user_roles_backup_0220_56_20260224'
  ];
begin
  foreach v_t in array v_tables loop
    if to_regclass('public.' || quote_ident(v_t)) is not null then
      execute format('alter table public.%I enable row level security', v_t);
    end if;
  end loop;
end $$;

-- =====================================================================
-- VERIFICACIÓN:
--   -- 0 tablas sin RLS:
--   select relname from pg_class where relnamespace='public'::regnamespace
--     and relkind='r' and not relrowsecurity order by relname;
--   -- authenticated puede leer user_roles:
--   set role authenticated; select count(*) from public.user_roles; reset role;
-- =====================================================================
