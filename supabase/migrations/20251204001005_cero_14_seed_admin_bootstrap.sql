-- Migración cero — cero_14: antes sembraba el administrador fijo (auth.users, auth.identities y
-- public.staff de Neil Graneros). ETL fase 1 (bugs/ETL/carga/fase1/plan_v2.md F1-M06): se RETIRA
-- todo ese DML. El primer administrador ya no es una fila sembrada por migración: lo crea la
-- consola específica de fase 1 (scripts/etl/fase1.mjs) con la Admin API de Auth, una ficha de
-- staff y el enlace/rol que resuelven los triggers (handle_new_user: el primer usuario recibe
-- admin/admin). Cuenta genérica admin@ruizmier.com con datos ficticios; ver scripts/etl/README.md.
--
-- Este archivo se conserva (mismo nombre, prefijo y orden: F1-CA09) como no-op documentado:
-- una instalación nueva termina sin cuentas de usuario de aplicación, sin staff y sin user_roles
-- hasta que la consola inicializa. Los feriados (cero_15) dejan de depender de la ficha fija: su
-- siembra la ejecuta la consola con public.seed_initial_holidays(uuid).
--
-- Un ambiente que ya aplicó la versión anterior de este archivo (ledger) conserva su cuenta; no
-- se reaplica ni se altera.

DO $$
BEGIN
  RAISE NOTICE 'cero_14: sin administrador sembrado; usar scripts/etl/fase1.mjs initialize';
END
$$;
