-- Paso único de bootstrap para las cuentas RLS sintéticas de xcdcxtduotwgwmhxvsiz.
-- Se ejecuta SOLO después de `node scripts/rls-target-xcdc-accounts.mjs crear`.
-- Promueve una única cuenta controlada para poder asignar los roles restantes mediante
-- `admin_set_user_role_key`, la misma RPC que usa la aplicación.

BEGIN;

DO $$
DECLARE
  v_user_id uuid;
  v_count int;
  v_linked int;
BEGIN
  SELECT count(*) INTO v_linked
    FROM public.staff s
    JOIN auth.users u ON u.id = s.auth_user_id
   WHERE lower(trim(s.email)) LIKE 'rls-xcdc-20261016-%@ruizmier.com'
     AND lower(trim(s.email)) = lower(trim(u.email));
  IF v_linked <> 17 THEN
    RAISE EXCEPTION 'RLS bootstrap FAIL: esperados 17 enlaces staff↔Auth, hay %', v_linked;
  END IF;

  SELECT id INTO v_user_id
    FROM auth.users
   WHERE lower(email) = 'rls-xcdc-20261016-admin@ruizmier.com';
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'RLS bootstrap FAIL: no existe la cuenta sintética ADMIN';
  END IF;

  SELECT count(*) INTO v_count FROM public.user_roles WHERE user_id = v_user_id;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'RLS bootstrap FAIL: se esperaba una fila user_roles para ADMIN, hay %', v_count;
  END IF;

  UPDATE public.user_roles
     SET role = 'admin', role_key = 'admin'
   WHERE user_id = v_user_id;

  RAISE NOTICE 'RLS bootstrap PASS: 17 enlaces staff↔Auth y cuenta ADMIN sintética promovida; los demás roles se asignarán por la RPC real';
END $$;

COMMIT;
