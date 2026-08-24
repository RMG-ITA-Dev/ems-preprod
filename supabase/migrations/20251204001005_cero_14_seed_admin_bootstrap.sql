-- Migración cero — Fase 4 (plan §4.1/§4.2.1): bootstrap del admin inicial.
-- Única migración del set que escribe en auth.* (esquema gestionado por GoTrue) — sus columnas
-- pueden cambiar entre versiones de Auth, por eso el smoke real de este archivo es
-- supabase/tests/local/verify-auth-bootstrap.sh (plan §4.3.4ter) contra el stack replayado, no
-- solo este replay. Persona real (Neil Graneros, Socio de Auditoría) — decisión del operador
-- 2026-08-21 (plan §0.1), no un actor sintético.
--
-- Depende de: cero_10 (society), cero_11 (practicas/categories), cero_13 (catálogo RBAC —
-- handle_new_user() inserta user_roles.role_key='admin', que tiene FK a
-- authorization_roles.role_key; sin cero_13 antes, este INSERT revienta la FK — hallazgo real
-- del primer replay [EXEC], 2026-08-23). Debe ir ANTES de cero_15 (holidays.created_by
-- referencia el staff sembrado acá) y ANTES de cero_16 (global_settings vacía en este punto es
-- lo que hace inofensivo a validate_email_domain, ver punto 3 abajo).
--
-- Contraseña: NUNCA se commitea. encrypted_password es un hash aleatorio inutilizable — el
-- operador la establece post-reset (plan §4.2.1.5 / §7.3).

DO $$
DECLARE
  -- UUIDs fijos (constantes de este archivo, plan §4.2.1.1/.4).
  v_auth_user_id uuid := 'c32c03fd-ddfb-4ae2-9176-664982d4621e';
  v_staff_id     uuid := '7b1c2429-6bb1-478a-abb2-afc1a21d42d0';
  v_email        text := 'neilgraneros@ruizmier.com';
BEGIN
  -- 1. auth.users — columnas text de tokens en '' (no NULL: GoTrue revienta escaneando NULLs
  -- en filas creadas por SQL, plan §4.2.1.1). Contraseña aleatoria inutilizable.
  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, invited_at,
    confirmation_token, confirmation_sent_at,
    recovery_token, recovery_sent_at,
    email_change_token_new, email_change, email_change_sent_at,
    email_change_token_current,
    last_sign_in_at, raw_app_meta_data, raw_user_meta_data,
    is_super_admin, created_at, updated_at,
    phone, phone_change, phone_change_token,
    reauthentication_token
  ) VALUES (
    v_auth_user_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    v_email, extensions.crypt(gen_random_uuid()::text, extensions.gen_salt('bf')),
    now(), NULL,
    '', NULL,
    '', NULL,
    '', '', NULL,
    '',
    NULL, '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
    false, now(), now(),
    NULL, '', '',
    ''
  )
  ON CONFLICT (id) DO NOTHING;

  -- 2. auth.identities — fila provider='email' que GoTrue exige para login por password.
  -- NO se inserta la columna `email`: es generada en las versiones actuales (plan §4.2.1.2).
  INSERT INTO auth.identities (
    provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
  ) VALUES (
    v_auth_user_id::text, v_auth_user_id,
    jsonb_build_object('sub', v_auth_user_id::text, 'email', v_email),
    'email', now(), now(), now()
  )
  ON CONFLICT (provider_id, provider) DO NOTHING;

  -- 3. Efecto de los 3 triggers de cero_07 sobre este INSERT (verificado por el plan §4.2.1.3):
  --    - validate_email_domain: ALLOWED_EMAIL_DOMAIN todavía no existe (cero_15 corre después)
  --      → no bloquea. El email igual es @ruizmier.com.
  --    - handle_new_user: primer usuario ⇒ user_roles(role='admin', role_key='admin'). Por eso
  --      este seed NO toca user_roles.
  --    - link_auth_user_to_staff: no encuentra staff todavía (se inserta en el paso 4) →
  --      inofensivo, se referencia auth_user_id explícito abajo en vez de confiar en el trigger.

  -- 4. staff — ficha completa y real (plan §4.2.1.4): Auditoría / Socio / Ruizmier Pelaez.
  -- Ejercita el FK compuesto staff(practica_id, category_id) → categories(practica_id,
  -- category_id) de 0810-173 — la categoría Socio pertenece a Auditoría en el seed.
  INSERT INTO public.staff (
    staff_id, auth_user_id, first_name, last_name, email, short_name, id_number,
    hire_date, city, society_id, practica_id, category_id, is_active,
    weekly_capacity_hours, target_utilization_percent
  )
  SELECT
    v_staff_id, v_auth_user_id, 'Neil', 'Graneros', v_email, 'neilgraneros', '9911843',
    '2026-04-27'::date, 'La Paz',
    (SELECT society_id FROM public.society WHERE name = 'Ruizmier Pelaez S.R.L.'),
    p.practica_id, c.category_id, true,
    40, 85
  FROM public.practicas p
  JOIN public.categories c ON c.practica_id = p.practica_id AND c.category_name = 'Socio'
  WHERE p.abbreviation = 'AUD'
  ON CONFLICT (lower(trim(email))) WHERE (email IS NOT NULL AND deleted_at IS NULL) DO NOTHING;
END $$;
