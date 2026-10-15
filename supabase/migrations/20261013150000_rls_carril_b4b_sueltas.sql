-- Carril B, etapa B4b del barrido RLS: las dos tablas que quedaban sin RLS. BAR-001/BAR-004 (respaldo) y exposición de migration_run_log.
-- Resumen y decisiones: docs/seguridad/registro-seguridad-rls.md. Idempotente (ENABLE RLS y REVOKE repetibles): se aplica primero a
-- mano en Dev 2.0 y después con `db push`.
--
--   · migration_run_log: registro interno de migraciones de datos (migration_key, backup_table_name, executed_by). Sin políticas y
--     con RLS apagada, authenticated tenía SELECT/INSERT/UPDATE/DELETE/TRUNCATE: cualquier empleado podía leerla y escribirla.
--     Ninguna función, vista, política, Edge Function ni pantalla la usa (solo el archivo de tipos autogenerado).
--   · user_roles_backup_0220_56_20260224: copia de user_roles del 24/02/2026 (user_id y rol). Los roles de la API ya no tienen
--     privilegios sobre ella (Carril A), pero con RLS apagada un GRANT descuidado la expondría. Tampoco tiene consumidores.
--
-- Qué cambia: ENABLE RLS sin políticas (los roles de la API quedan sin acceso, que es lo deseado) y se retiran los privilegios que
-- quedaban a anon y authenticated. No se borra nada: el dueño (postgres), las migraciones y service_role (BYPASSRLS) siguen como
-- hasta ahora. Con esto sale la última excepción de la lista del check 12 y el CI rechaza cualquier tabla nueva sin RLS.

ALTER TABLE public.migration_run_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles_backup_0220_56_20260224 ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.migration_run_log FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.user_roles_backup_0220_56_20260224 FROM PUBLIC, anon, authenticated;
