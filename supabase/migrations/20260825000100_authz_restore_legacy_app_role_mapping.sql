-- =====================================================================
-- Migración cero — restaura el mapeo `authorization_roles.legacy_app_role`
-- =====================================================================
-- REGRESIÓN DE LA CONSOLIDACIÓN, no de un bug de producto.
--
-- La migración `20260729000000_authz_fase8_ui_role_key.sql` (commit e6d1f46c,
-- 29-jul-2026) poblaba esta columna con un mapeo revisado rol por rol. La
-- consolidación de las 184 migraciones (commit 15515cfa) conservó la COLUMNA en
-- cero_02 pero dejó el UPDATE fuera del seed: el INSERT de cero_13 solo escribe
-- (role_key, label_key, display_order, is_system), y ningún otro archivo la toca.
--
-- Efecto: en el mirror y en producción la columna está poblada (aquella migración
-- corrió antes de la consolidación), pero en CUALQUIER base replayada desde cero
-- —`reset-desde-cero.sh`, el proyecto Test— los 23 roles quedan con
-- legacy_app_role NULL. Y `admin_set_user_role_key` devuelve ROLE_NOT_MAPPED
-- cuando el espejo es NULL, así que Gestión de Roles no puede asignar NINGÚN rol.
--
-- Este archivo restaura ese mapeo verbatim. No inventa nada: el contenido sale de
--   git show e6d1f46c:supabase/migrations/20260729000000_authz_fase8_ui_role_key.sql
--
-- Es idempotente y en el mirror es un no-op (los valores ya coinciden).
--
-- No se aplica hasta correr en Lovable:
--   LOVABLE PROMPT: "Apply pending Supabase migrations"
-- =====================================================================

-- ---------------------------------------------------------------------
-- Mapeo role_key -> enum legacy, como DATO revisable (no lógica oculta)
-- ---------------------------------------------------------------------
-- Los 7 roles con contraparte exacta en el enum se mapean a sí mismos.
-- `assistant` -> `staff` es la equivalencia que ya usó el backfill de Fase 1.
-- Los 15 especializados se mapean a su NIVEL jerárquico: revisar esta tabla si
-- alguna política legacy debe tratarlos distinto.
update public.authorization_roles ar
set legacy_app_role = m.legacy::app_role
from (values
  -- role_key,                legacy_app_role,  nota
  ('admin',                   'admin'),      -- exacto
  ('senior_partner',          'partner'),    -- nivel: socio
  ('partner',                 'partner'),    -- exacto
  ('risk_partner',            'partner'),    -- nivel: socio
  ('director',                'director'),   -- exacto
  ('sqr',                     'sqr'),        -- exacto
  ('manager',                 'manager'),    -- exacto
  ('it_security_manager',     'manager'),    -- nivel: gerente
  ('ita_manager',             'manager'),    -- nivel: gerente
  ('tax_manager',             'manager'),    -- nivel: gerente
  ('accounting_manager',      'manager'),    -- nivel: gerente
  ('hr_manager',              'manager'),    -- nivel: gerente
  ('risk_supervisor',         'manager'),    -- nivel: gerente (supervisa)
  ('senior',                  'senior'),     -- exacto
  ('ita_senior',              'senior'),     -- nivel: senior
  ('tax_senior',              'senior'),     -- nivel: senior
  ('accounting_analyst',      'senior'),     -- nivel: senior (analista)
  ('collections_analyst',     'senior'),     -- nivel: senior (analista)
  ('hr_analyst',              'senior'),     -- nivel: senior (analista)
  ('semisenior',              'semisenior'), -- exacto
  ('assistant',               'staff'),      -- equivalencia Fase 1
  ('ita_assistant',           'staff'),      -- nivel: asistente
  ('tax_assistant',           'staff')       -- nivel: asistente
) as m(role_key, legacy)
where ar.role_key = m.role_key;

-- ---------------------------------------------------------------------
-- Guard: ningún rol activo puede quedar sin espejo legacy
-- ---------------------------------------------------------------------
-- Sin espejo, `admin_set_user_role_key` falla con ROLE_NOT_MAPPED y ese rol es
-- inasignable desde la UI. Que reviente acá es preferible a descubrirlo en
-- runtime — y evita que la próxima ampliación del catálogo repita esta omisión.
DO $$
DECLARE
  v_missing text;
BEGIN
  SELECT string_agg(role_key, ', ' ORDER BY role_key) INTO v_missing
    FROM public.authorization_roles
   WHERE is_active AND legacy_app_role IS NULL;

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'authorization_roles activos sin legacy_app_role: %', v_missing;
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- Backfill de categories.default_role_key (BUG 0820-182)
-- ---------------------------------------------------------------------
-- Vive ACÁ y no en 20260825000000 —donde nace la columna— porque DEPENDE del mapeo de
-- arriba. Puesto allá corría antes de que legacy_app_role existiera, así que en una base
-- replayada desde las consolidadas era un no-op permanente: las categorías sembradas se
-- quedaban sin las sugerencias inequívocas que sí obtenía una base actualizada. El mismo
-- set de migraciones producía datos distintos según el historial de la base.
--
-- Tres salvaguardas, cada una tapa algo distinto:
--   · `IS NULL`      — no pisa una sugerencia ya elegida a mano.
--   · `<> 'admin'`   — el formulario ANTERIOR a FASE 3c permitía elegir `admin`, así que
--                      una base actualizada puede tener categorías con
--                      default_app_role = 'admin'; y como ningún otro role_key mapea a
--                      ese enum, el guard de unicidad lo daría por inequívoco. Copiarlo
--                      reintroduciría por datos lo que la UI prohíbe. (Sin este filtro el
--                      CHECK categories_default_role_key_not_admin haría fallar la
--                      migración — que es exactamente lo que debe pasar.)
--   · `count(*) = 1` — no inventa un rol donde varios role_key comparten el mismo espejo
--                      legacy: `manager` lo comparten 7, `senior` 6, `partner` 3 y
--                      `staff` 3. Solo director/sqr/semisenior quedan como 1:1 una vez
--                      excluido admin, así que se espera que toque POCAS filas. Es el
--                      resultado correcto para un campo de sugerencia opcional, no un
--                      backfill incompleto.
UPDATE public.categories c
   SET default_role_key = ar.role_key
  FROM public.authorization_roles ar
 WHERE ar.legacy_app_role = c.default_app_role
   AND c.default_role_key IS NULL
   AND ar.role_key <> 'admin'
   AND (SELECT count(*) FROM public.authorization_roles a2
         WHERE a2.legacy_app_role = c.default_app_role) = 1;
