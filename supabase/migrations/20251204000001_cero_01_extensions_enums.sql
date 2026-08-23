SET check_function_bodies = false;
SET row_security = off;

-- Migración cero — set consolidado (bugs/migracion_cero/plan_v2.md Fase 2).
-- 01: extensiones + enum types (+ la secuencia fund_request_number_seq).
-- Fuente de autoría: bugs/migracion_cero/autoria/dump_full_baseline.sql (pg_dump --schema-only,
-- baseline de 184 migraciones + preseed). Extraído por bloque -- Name:/Type:/Schema: de pg_dump,
-- preservando el orden relativo original (orden topológico real de pg_dump, no reordenado a mano).
-- Ver docs/migraciones/DIFF-INTENCIONAL-consolidacion.md para los cambios deliberados vs baseline.

--
-- Name: pg_cron; Type: EXTENSION; Schema: -; Owner: -
--

-- Guardado (no en el dump original): pg_cron es una extensión de plataforma, no siempre
-- disponible (p.ej. el contenedor postgres:16 liso del harness RLS de CI no la trae), y
-- aun cuando está disponible, pg_cron solo puede instalarse en la base fijada por
-- cron.database_name (en el stack local Supabase, "postgres") — cualquier otra base
-- (como la de este mismo harness) recibe "can only create extension in database
-- postgres" al intentarlo, verificado en vivo. Mismo patrón defensivo que ya usa la app
-- en tiempo de ejecución para cron.schedule() (ver finalize_all_stale_timers() en
-- cero_02). Sobre el Supabase real de Test/producción la extensión se instala en la base
-- correcta y esto se comporta idéntico a la sentencia sin guardar.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron') THEN
    BEGIN
      EXECUTE 'CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog';
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'pg_cron no se pudo instalar en esta base (%); se omite.', SQLERRM;
    END;
  END IF;
END $$;


--
--
-- Name: app_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.app_role AS ENUM (
    'admin',
    'staff',
    'viewer',
    'partner',
    'director',
    'manager',
    'senior',
    'semisenior',
    'sqr',
    'specialist_it',
    'specialist_tax'
);


--
--
-- Name: fr_wo_approval_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.fr_wo_approval_status AS ENUM (
    'pendiente',
    'aprobado',
    'observado',
    'rechazado'
);


--
--
-- Name: fund_request_expense_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.fund_request_expense_status AS ENUM (
    'borrador',
    'pendiente_aprobacion',
    'aprobado_gerente',
    'observado',
    'rechazado',
    'revisado_asistente'
);


--
--
-- Name: fund_request_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.fund_request_status AS ENUM (
    'borrador',
    'pendiente_aprobacion',
    'aprobado_gerente',
    'observado',
    'rechazado',
    'fondos_entregados',
    'en_liquidacion',
    'cerrado',
    'cancelado'
);


--
--
-- Name: fund_request_number_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.fund_request_number_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
