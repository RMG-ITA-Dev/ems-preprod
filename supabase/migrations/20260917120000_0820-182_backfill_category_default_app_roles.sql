-- =====================================================================
-- BUG 0820-182 — completar roles predeterminados por práctica y categoría
-- =====================================================================
-- El seed cero_11 contiene este catálogo, pero usa ON CONFLICT DO NOTHING.
-- Por eso una base que ya tenía las categorías conserva sus valores previos
-- (incluyendo NULL) al incorporar el seed. Esta migración aplica la fuente
-- autorizada a las filas existentes, identificándolas por el código estable de
-- la práctica y el nombre de la categoría, nunca por orden ni por UUID. Actualiza
-- tanto default_app_role (espejo legacy) como default_role_key (el campo que
-- muestra la UI "Rol de App Predeterminado").
--
-- Es segura de reintentar: volver a ejecutarla deja las mismas 61 parejas con
-- el mismo valor. Si faltara una práctica/categoría esperada, aborta en vez de
-- actualizar un subconjunto silenciosamente.
--
-- Despliegue: supabase db push --project-ref <ref>
-- =====================================================================

CREATE TEMP TABLE _0820_182_category_role_defaults (
  practice_name text NOT NULL,
  practice_code smallint,
  category_name text NOT NULL,
  default_app_role public.app_role NOT NULL,
  PRIMARY KEY (practice_name, category_name)
) ON COMMIT DROP;

INSERT INTO _0820_182_category_role_defaults (
  practice_name, category_name, default_app_role
) VALUES
  -- Auditoría
  ('Auditoría', 'Socio', 'partner'),
  ('Auditoría', 'SQR', 'sqr'),
  ('Auditoría', 'Director', 'director'),
  ('Auditoría', 'Gerente', 'manager'),
  ('Auditoría', 'Supervisor', 'senior'),
  ('Auditoría', 'Senior', 'senior'),
  ('Auditoría', 'Semi-Senior', 'semisenior'),
  ('Auditoría', 'Asistente', 'staff'),
  ('Auditoría', 'Pasante', 'staff'),
  ('Auditoría', 'Gerente - Especialista IT', 'specialist_it'),
  ('Auditoría', 'Senior - Especialista IT', 'senior'),
  ('Auditoría', 'Asistente - Especialista IT', 'staff'),
  ('Auditoría', 'Gerente - Especialista Tax', 'specialist_tax'),
  ('Auditoría', 'Senior - Especialista Tax', 'senior'),
  ('Auditoría', 'Asistente - Especialista Tax', 'staff'),
  -- Compliance
  ('Compliance', 'Socio', 'partner'),
  ('Compliance', 'Director', 'director'),
  ('Compliance', 'Gerente', 'manager'),
  ('Compliance', 'Supervisor', 'senior'),
  ('Compliance', 'Senior', 'senior'),
  ('Compliance', 'Semi Senior', 'semisenior'),
  ('Compliance', 'Asistente', 'staff'),
  ('Compliance', 'Pasante', 'staff'),
  -- Tax & Advisory
  ('Tax & Advisory', 'Socio', 'partner'),
  ('Tax & Advisory', 'Director', 'director'),
  ('Tax & Advisory', 'Gerente', 'manager'),
  ('Tax & Advisory', 'Supervisor', 'senior'),
  ('Tax & Advisory', 'Senior', 'senior'),
  ('Tax & Advisory', 'Semi Senior', 'semisenior'),
  ('Tax & Advisory', 'Asistente', 'staff'),
  ('Tax & Advisory', 'Pasante', 'staff'),
  -- Precios de Transferencias
  ('Precios de Transferencias', 'Socio', 'partner'),
  ('Precios de Transferencias', 'Director', 'director'),
  ('Precios de Transferencias', 'Gerente', 'manager'),
  ('Precios de Transferencias', 'Supervisor', 'senior'),
  ('Precios de Transferencias', 'Senior', 'senior'),
  ('Precios de Transferencias', 'Semi Senior', 'semisenior'),
  ('Precios de Transferencias', 'Asistente', 'staff'),
  ('Precios de Transferencias', 'Pasante', 'staff'),
  -- M&A
  ('M&A', 'Socio', 'partner'),
  ('M&A', 'Director', 'director'),
  ('M&A', 'Gerente', 'manager'),
  ('M&A', 'Supervisor', 'senior'),
  ('M&A', 'Senior', 'senior'),
  ('M&A', 'Semi Senior', 'semisenior'),
  ('M&A', 'Asistente', 'staff'),
  ('M&A', 'Pasante', 'staff'),
  -- Legal
  ('Legal', 'Socio', 'partner'),
  ('Legal', 'Director', 'director'),
  ('Legal', 'Gerente/Asociado Senior', 'manager'),
  ('Legal', 'Asociado', 'senior'),
  ('Legal', 'Asociado Junior', 'semisenior'),
  ('Legal', 'Abogado practicante', 'staff'),
  -- Growth & Strategy
  ('Growth & Strategy', 'Socio', 'partner'),
  ('Growth & Strategy', 'Director', 'director'),
  ('Growth & Strategy', 'Gerente', 'manager'),
  ('Growth & Strategy', 'Supervisor', 'senior'),
  ('Growth & Strategy', 'Senior', 'senior'),
  ('Growth & Strategy', 'Semi Senior', 'semisenior'),
  ('Growth & Strategy', 'Asistente', 'staff'),
  ('Growth & Strategy', 'Pasante', 'staff');

-- Los nombres de práctica de arriba documentan la fuente; el join contra la
-- base usa su código inmutable del catálogo. Un cambio de etiqueta visible de
-- la práctica no debe impedir este backfill.
UPDATE _0820_182_category_role_defaults
   SET practice_code = CASE practice_name
     WHEN 'Auditoría' THEN 1
     WHEN 'Compliance' THEN 2
     WHEN 'Tax & Advisory' THEN 3
     WHEN 'Precios de Transferencias' THEN 4
     WHEN 'M&A' THEN 5
     WHEN 'Legal' THEN 6
     WHEN 'Growth & Strategy' THEN 7
   END;

ALTER TABLE _0820_182_category_role_defaults
  ALTER COLUMN practice_code SET NOT NULL;

DO $$
DECLARE
  v_expected_count integer;
  v_matched_count integer;
  v_mismatches text;
  v_missing_role_keys text;
BEGIN
  SELECT count(*) INTO v_expected_count
    FROM _0820_182_category_role_defaults;

  IF v_expected_count <> 61 THEN
    RAISE EXCEPTION '0820-182 expected 61 category-role mappings, found %', v_expected_count;
  END IF;

  SELECT count(*) INTO v_matched_count
    FROM _0820_182_category_role_defaults d
    JOIN public.practicas p ON p.code = d.practice_code
    JOIN public.categories c
      ON c.practica_id = p.practica_id
     AND c.category_name = d.category_name;

  IF v_matched_count <> v_expected_count THEN
    SELECT string_agg(format('%s / %s', d.practice_name, d.category_name), ', ')
      INTO v_mismatches
      FROM _0820_182_category_role_defaults d
      LEFT JOIN public.practicas p ON p.code = d.practice_code
      LEFT JOIN public.categories c
        ON c.practica_id = p.practica_id
       AND c.category_name = d.category_name
     WHERE c.category_id IS NULL;

    RAISE EXCEPTION '0820-182 missing expected practice/category mappings: %', v_mismatches;
  END IF;

  -- `default_role_key` es el rol del catálogo que consume el formulario. El
  -- enum legacy `staff` se llama `assistant` en ese catálogo; los dos roles
  -- especializados de gerente tienen sus role_key propios.
  SELECT string_agg(expected.role_key, ', ' ORDER BY expected.role_key)
    INTO v_missing_role_keys
    FROM (VALUES
      ('partner'), ('sqr'), ('director'), ('manager'), ('senior'),
      ('semisenior'), ('assistant'),
      ('ita_manager'), ('ita_senior'), ('ita_assistant'),
      ('tax_manager'), ('tax_senior'), ('tax_assistant')
    ) AS expected(role_key)
    LEFT JOIN public.authorization_roles ar
      ON ar.role_key = expected.role_key
     AND ar.is_active
   WHERE ar.role_key IS NULL;

  IF v_missing_role_keys IS NOT NULL THEN
    RAISE EXCEPTION '0820-182 active authorization role keys missing: %', v_missing_role_keys;
  END IF;

  UPDATE public.categories c
     SET default_app_role = d.default_app_role,
         default_role_key = CASE
           WHEN d.category_name = 'Gerente - Especialista IT' THEN 'ita_manager'
           WHEN d.category_name = 'Senior - Especialista IT' THEN 'ita_senior'
           WHEN d.category_name = 'Asistente - Especialista IT' THEN 'ita_assistant'
           WHEN d.category_name = 'Gerente - Especialista Tax' THEN 'tax_manager'
           WHEN d.category_name = 'Senior - Especialista Tax' THEN 'tax_senior'
           WHEN d.category_name = 'Asistente - Especialista Tax' THEN 'tax_assistant'
           WHEN d.default_app_role = 'partner' THEN 'partner'
           WHEN d.default_app_role = 'sqr' THEN 'sqr'
           WHEN d.default_app_role = 'director' THEN 'director'
           WHEN d.default_app_role = 'manager' THEN 'manager'
           WHEN d.default_app_role = 'senior' THEN 'senior'
           WHEN d.default_app_role = 'semisenior' THEN 'semisenior'
           WHEN d.default_app_role = 'staff' THEN 'assistant'
         END
    FROM _0820_182_category_role_defaults d
    JOIN public.practicas p ON p.code = d.practice_code
   WHERE c.practica_id = p.practica_id
     AND c.category_name = d.category_name
     AND (
       c.default_app_role IS DISTINCT FROM d.default_app_role
       OR c.default_role_key IS DISTINCT FROM CASE
         WHEN d.category_name = 'Gerente - Especialista IT' THEN 'ita_manager'
         WHEN d.category_name = 'Senior - Especialista IT' THEN 'ita_senior'
         WHEN d.category_name = 'Asistente - Especialista IT' THEN 'ita_assistant'
         WHEN d.category_name = 'Gerente - Especialista Tax' THEN 'tax_manager'
         WHEN d.category_name = 'Senior - Especialista Tax' THEN 'tax_senior'
         WHEN d.category_name = 'Asistente - Especialista Tax' THEN 'tax_assistant'
         WHEN d.default_app_role = 'partner' THEN 'partner'
         WHEN d.default_app_role = 'sqr' THEN 'sqr'
         WHEN d.default_app_role = 'director' THEN 'director'
         WHEN d.default_app_role = 'manager' THEN 'manager'
         WHEN d.default_app_role = 'senior' THEN 'senior'
         WHEN d.default_app_role = 'semisenior' THEN 'semisenior'
         WHEN d.default_app_role = 'staff' THEN 'assistant'
       END
     );

  IF EXISTS (
    SELECT 1
      FROM _0820_182_category_role_defaults d
      JOIN public.practicas p ON p.code = d.practice_code
      JOIN public.categories c
        ON c.practica_id = p.practica_id
       AND c.category_name = d.category_name
     WHERE c.default_app_role IS DISTINCT FROM d.default_app_role
        OR c.default_role_key IS DISTINCT FROM CASE
          WHEN d.category_name = 'Gerente - Especialista IT' THEN 'ita_manager'
          WHEN d.category_name = 'Senior - Especialista IT' THEN 'ita_senior'
          WHEN d.category_name = 'Asistente - Especialista IT' THEN 'ita_assistant'
          WHEN d.category_name = 'Gerente - Especialista Tax' THEN 'tax_manager'
          WHEN d.category_name = 'Senior - Especialista Tax' THEN 'tax_senior'
          WHEN d.category_name = 'Asistente - Especialista Tax' THEN 'tax_assistant'
          WHEN d.default_app_role = 'partner' THEN 'partner'
          WHEN d.default_app_role = 'sqr' THEN 'sqr'
          WHEN d.default_app_role = 'director' THEN 'director'
          WHEN d.default_app_role = 'manager' THEN 'manager'
          WHEN d.default_app_role = 'senior' THEN 'senior'
          WHEN d.default_app_role = 'semisenior' THEN 'semisenior'
          WHEN d.default_app_role = 'staff' THEN 'assistant'
        END
  ) THEN
    RAISE EXCEPTION '0820-182 category default role backfill verification failed';
  END IF;
END;
$$;
