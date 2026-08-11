-- Convergencia dev-scheduler + feat/roles-permisos — corrige una policy huérfana en public.skills.
--
-- Por qué: 20260724050000_authz_fase4_olaA_reference.sql intentó reemplazar el acceso de lectura de
-- `skills` por `has_permission('competency.read')`, pero el DROP apuntó a un nombre que nunca
-- existió en el ledger de migraciones ("Skill viewers can read skills" — probablemente el nombre
-- real en el Supabase donde se desarrolló esa migración, no el de este repo). La policy real,
-- creada en 20260412073936_869e1ad3-2725-4318-8e52-c5acb11fd27f.sql como
-- "Authenticated users can read skills" con USING (true), nunca se eliminó. Como el DROP usó
-- IF EXISTS, no falló — solo no hizo nada. Resultado: dos policies SELECT permisivas conviven en
-- `skills`, y PostgreSQL las combina con OR — la nueva basada en permiso es un no-op, cualquier
-- autenticado sigue leyendo la tabla completa.
--
-- Fix: DROP del nombre real. Aditiva/de cola, no toca el contenido de ninguna migración existente.
-- La policy "skills read" (has_permission('competency.read')) ya existe y queda como única
-- autorización de SELECT tras este cambio.

DROP POLICY IF EXISTS "Authenticated users can read skills" ON public.skills;

-- Validación (contra Postgres aislado — no ejecutar desde R-APP):
--   select policyname from pg_policies where schemaname='public' and tablename='skills' and cmd='r';
--   -> debe devolver únicamente "skills read"
--   Un usuario autenticado sin competency.read debe recibir 0 filas de `select * from skills`.
