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

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;


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
