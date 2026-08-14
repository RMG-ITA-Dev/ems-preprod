-- 0714-155: Sociedad (firma interna) en Nuevo Encargo.
--
-- 1. Agregar engagements.society_id (FK a public.society, ya existente — sin tabla nueva).
-- 2. Backfill: encargos cuyo Cliente es la sociedad facturándose servicios administrativos
--    a sí misma (client_legal_name empieza con el nombre de una society — join dinámico,
--    NUNCA hardcoded) reciben ese society_id.
-- 2b. Default histórico: el resto de los encargos (clientes reales, sin huella de ninguna
--     sociedad) recibe la ÚNICA sociedad que sí tuvo huella en 2 — decisión del operador
--     (2026-08-13): "todos los encargos deben tener sociedad", y no hay ningún dato que
--     distinga cuáles serían de la otra sociedad, así que el histórico completo se asume de
--     la que ya se usaba. Si en el futuro hay huella de MÁS de una sociedad, no aplica
--     default automático (ambiguo) — avisa y hay que decidir caso por caso.
-- 3. Reemplazar create_engagement_with_code() agregando p_society_id obligatorio.
-- 3b. Limpieza defensiva + postcondition: dropear el overload legado de 15 params (visto
--     vivo en fingerprints reales de al menos un entorno) y verificar que sobreviva
--     exactamente 1 firma del RPC — evita que quede una vía de creación de encargos que
--     no valide society_id.
--
-- REVIEW FIX (post-implementación, 2026-08-14): esta migración también se corre contra una
-- base vacía (réplay completo de todas las migraciones). Los pasos 2/2b salen temprano si
-- `engagements` no tiene filas, en vez de correr el loop de diagnóstico y los UPDATE contra
-- tablas vacías. Además, ambos UPDATE deshabilitan/rehabilitan
-- update_engagements_updated_at para no pisar el updated_at real de los encargos
-- backfilleados con la hora de la migración.
--
-- Decisiones confirmadas por el operador (2026-08-13, bugs/0714-155/plan_v2.md §Open Questions):
--   #1 el nombre de la sociedad NUNCA se hardcodea — el backfill matchea dinámicamente
--      contra public.society.name en vez de literales fijos, así sigue funcionando si el
--      nombre legal cambia a futuro.
--   #2 society_id no tiene default: todo encargo nuevo debe traer una sociedad asociada.
--   #3 en la UI el campo se llama "Sociedad" (no "Firma"), consistente con StaffForm
--      (staff.society / staff.selectSociety), para no introducir un segundo término para
--      el mismo concepto.
--
-- REVIEW FIX (post-implementación, 2026-08-13): se investigó en EMS_Dev_Supabase por qué el
-- backfill no afectaba filas. Hallazgo del operador: NO hay 2 "clientes-hack" a limpiar como
-- asumía el packet original — hay UN cliente real y legítimo, "Ruizmier Pelaez S.R.L. ADMIN",
-- que representa a la sociedad Pelaez facturándose servicios administrativos a sí misma (12
-- encargos). Cliente y Sociedad son conceptos que coexisten aquí, no un cliente-firma a
-- desactivar. En consecuencia:
--   - Se ELIMINA por completo el paso de desactivar clients (ya no aplica: no se toca la
--     tabla clients para nada, ni is_active ni ningún otro campo).
--   - El match pasa de igualdad exacta/normalizada a PREFIJO dinámico
--     (client_legal_name ILIKE society.name || '%'), porque el nombre real del cliente
--     extiende el nombre de la sociedad con un sufijo (" ADMIN"), no es igual a secas.
--   - Un bloque de diagnóstico hace RAISE NOTICE/WARNING con el conteo de matches por
--     sociedad ANTES del UPDATE, para que un 0 sea visible en el log en vez de silencioso.
-- Verificar el resultado con las queries de diagnóstico documentadas en el bug packet antes
-- de dar por buena la migración en EMS_Dev_Supabase.

-- ────────────────────────────────────────────────────────────────────────────
-- 1. COLUMNA (nullable a nivel de esquema, sin NOT NULL — sin índice, mismo precedente
--    que engagements.taxonomy_id: cardinalidad 2, sin filtro server-side. Los pasos 2/2b
--    de abajo backfillean el histórico completo y el RPC exige la sociedad en toda alta
--    nueva, así que en la práctica no quedan filas sin asignar; la nulabilidad es solo una
--    salvaguarda de esquema)
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.engagements
  ADD COLUMN society_id uuid REFERENCES public.society(society_id) ON DELETE RESTRICT;

-- ────────────────────────────────────────────────────────────────────────────
-- REVIEW FIX (2026-08-14): los pasos 2/2b se corren también contra una base recién creada
-- (réplay completo de todas las migraciones, p.ej. para validación de esquema) donde
-- `engagements` está vacía — ahí no hay nada que backfillear, así que ambos bloques
-- salen temprano en vez de correr el loop de diagnóstico y los UPDATE contra tablas
-- vacías. Esto también evita que la advertencia de "0 sociedades con huella" (pensada
-- para un histórico real que no matcheó) se dispare en una base vacía, donde no
-- significa nada.
--
-- Los dos UPDATE de backfill/default deshabilitan temporalmente
-- update_engagements_updated_at (mismo patrón que
-- 20260218023625_ee35a838-e97e-4356-8de2-7d4986d8d114.sql): sin esto, cada fila
-- backfilleada perdería su updated_at real y aparentaría haber sido modificada en el
-- momento de correr esta migración, arruinando cualquier auditoría por fecha.
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.engagements DISABLE TRIGGER update_engagements_updated_at;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. BACKFILL: encargos cuyo Cliente es la sociedad autofacturándose servicios
--    administrativos (client_legal_name EMPIEZA CON el nombre de una society — join
--    dinámico por prefijo, sin hardcodear ningún literal). No se toca la tabla clients.
-- ────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_society        record;
  v_match_count    integer;
  v_total_matched  integer := 0;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.engagements) THEN
    RAISE NOTICE '0714-155 backfill: engagements está vacía (base nueva) — nada que backfillear.';
    RETURN;
  END IF;

  -- Diagnóstico ANTES de tocar datos: si alguna sociedad no tiene ningún cliente cuyo
  -- nombre empiece con la suya, avisa en el log — puede ser esperado (esa sociedad nunca
  -- se autofacturó servicios administrativos) o señal de que el nombre difiere más de lo
  -- que este match cubre.
  FOR v_society IN SELECT society_id, name FROM public.society LOOP
    SELECT count(*) INTO v_match_count
      FROM public.clients c
     WHERE c.client_legal_name ILIKE trim(v_society.name) || '%';

    IF v_match_count = 0 THEN
      RAISE WARNING '0714-155 backfill: ningún cliente empieza con el nombre de la sociedad "%" — su backfill quedará en 0 filas.', v_society.name;
    ELSE
      RAISE NOTICE '0714-155 backfill: % cliente(s) empiezan con el nombre de la sociedad "%".', v_match_count, v_society.name;
    END IF;
  END LOOP;

  UPDATE public.engagements e
     SET society_id = s.society_id
    FROM public.clients c
    JOIN public.society s ON c.client_legal_name ILIKE trim(s.name) || '%'
   WHERE e.client_id = c.client_id;

  GET DIAGNOSTICS v_total_matched = ROW_COUNT;
  RAISE NOTICE '0714-155 backfill: % encargo(s) recibieron society_id.', v_total_matched;
END $$;

-- ────────────────────────────────────────────────────────────────────────────
-- 2b. DEFAULT HISTÓRICO: el resto de los encargos (sin huella de ninguna sociedad, p.ej.
--     clientes reales) recibe la ÚNICA sociedad que sí quedó asignada en el paso 2. No se
--     hardcodea "Ruizmier Pelaez S.R.L." — se deriva de qué sociedad tiene huella real en
--     los datos. Si hay huella de 0 o de MÁS de una sociedad, es ambiguo: no aplica default
--     y avisa (decidir caso por caso en vez de adivinar).
-- ────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_default_society_id uuid;
  v_default_name        text;
  v_distinct_societies   integer;
  v_defaulted            integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.engagements) THEN
    RETURN; -- base vacía: el paso 2 ya lo notificó, nada que defaultear tampoco.
  END IF;

  SELECT count(DISTINCT society_id) INTO v_distinct_societies
    FROM public.engagements
   WHERE society_id IS NOT NULL;

  IF v_distinct_societies = 1 THEN
    SELECT DISTINCT e.society_id, s.name INTO v_default_society_id, v_default_name
      FROM public.engagements e
      JOIN public.society s ON s.society_id = e.society_id
     WHERE e.society_id IS NOT NULL;

    UPDATE public.engagements
       SET society_id = v_default_society_id
     WHERE society_id IS NULL;

    GET DIAGNOSTICS v_defaulted = ROW_COUNT;
    RAISE NOTICE '0714-155 default histórico: % encargo(s) sin sociedad recibieron el default ("%").', v_defaulted, v_default_name;
  ELSE
    RAISE WARNING '0714-155 default histórico: hay % sociedad(es) distinta(s) con huella real (esperada: 1) — NO se aplicó ningún default automático. Decidir manualmente.', v_distinct_societies;
  END IF;
END $$;

ALTER TABLE public.engagements ENABLE TRIGGER update_engagements_updated_at;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. REEMPLAZAR RPC: agregar p_society_id (obligatorio, sin DEFAULT — va antes de los
--    parámetros con DEFAULT, junto a p_oficina/p_practica/p_funcion/p_anio_fiscal_override).
--    Cuerpo idéntico a 20260707000000_create_taxonomies_catalog.sql salvo la validación e
--    inserción de society_id. No se agrega trigger de inmutabilidad ni de insert: el insert
--    es exclusivo del RPC (validado abajo) y la inmutabilidad post-creación es UI-only, igual
--    que oficina/practica/funcion (el packet pide que se comporte igual que esos 3 campos).
-- ────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.create_engagement_with_code(
  text, uuid, uuid, uuid, date, date, text,
  smallint, smallint, smallint, integer, boolean, boolean, boolean, boolean,
  date, boolean, uuid, uuid, uuid, uuid, text, uuid
);

CREATE OR REPLACE FUNCTION public.create_engagement_with_code(
  p_engagement_name      text,
  p_client_id            uuid,
  p_partner_id           uuid,
  p_manager_id           uuid,
  p_start_date           date,
  p_end_date             date,
  p_status               text,
  p_oficina              smallint,
  p_practica             smallint,
  p_funcion              smallint,
  p_anio_fiscal          integer,
  p_work_order_required  boolean,
  p_activity_required    boolean,
  p_is_internal          boolean,
  p_approval_required    boolean,
  p_fecha_cierre         date,
  p_anio_fiscal_override boolean,
  p_society_id           uuid,
  p_sqr_id               uuid DEFAULT NULL,
  p_encargado_id         uuid DEFAULT NULL,
  p_specialist_it_id     uuid DEFAULT NULL,
  p_specialist_tax_id    uuid DEFAULT NULL,
  p_contract_file_path   text DEFAULT NULL,
  p_taxonomy_id          uuid DEFAULT NULL
) RETURNS public.engagements
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_correlativo integer;
  v_code        text;
  v_engagement  public.engagements;
  v_date_begin  date;
  v_date_end    date;
  v_tipo        text;
  v_derived_fy  integer;
BEGIN
  IF p_oficina IS NULL OR p_oficina NOT IN (0, 1, 2) THEN
    RAISE EXCEPTION 'Oficina inválida: %', p_oficina;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.services WHERE code = p_practica AND is_active) THEN
    RAISE EXCEPTION 'Práctica inválida: %', p_practica;
  END IF;

  IF p_funcion IS NULL OR p_funcion NOT IN (0, 1, 2, 3) THEN
    RAISE EXCEPTION 'Función inválida: %', p_funcion;
  END IF;

  IF p_anio_fiscal IS NULL OR p_anio_fiscal < 2020 OR p_anio_fiscal > 2100 THEN
    RAISE EXCEPTION 'Año fiscal inválido: %', p_anio_fiscal;
  END IF;

  IF p_fecha_cierre IS NULL THEN
    RAISE EXCEPTION 'Fecha de cierre requerida';
  END IF;

  -- FEAT 0714-155: sociedad interna del encargo — obligatoria y debe estar activa.
  IF p_society_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.society WHERE society_id = p_society_id AND is_active
  ) THEN
    RAISE EXCEPTION 'Sociedad inválida o inactiva: %', p_society_id;
  END IF;

  -- Taxonomy is optional, but if provided it must reference an active row.
  IF p_taxonomy_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.taxonomies WHERE taxonomy_id = p_taxonomy_id AND is_active
  ) THEN
    RAISE EXCEPTION 'Taxonomía inválida o inactiva: %', p_taxonomy_id;
  END IF;

  -- Mirrors getFiscalYearForDate (src/lib/fiscalCalculations.ts): fiscal year runs Oct 1 -> Sep 30,
  -- named by the ending year.
  v_derived_fy := CASE
    WHEN EXTRACT(MONTH FROM p_fecha_cierre) >= 10 THEN EXTRACT(YEAR FROM p_fecha_cierre)::integer + 1
    ELSE EXTRACT(YEAR FROM p_fecha_cierre)::integer
  END;

  IF p_anio_fiscal_override THEN
    IF NOT public.is_admin() THEN
      RAISE EXCEPTION 'FORBIDDEN: el override manual del año fiscal requiere rol administrador'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSIF p_anio_fiscal IS DISTINCT FROM v_derived_fy THEN
    RAISE EXCEPTION 'Año fiscal % no coincide con el derivado de la fecha de cierre % (esperado %)',
      p_anio_fiscal, p_fecha_cierre, v_derived_fy;
  END IF;

  v_date_begin := ((p_anio_fiscal - 1)::text || '-10-01')::date;
  v_date_end   := (p_anio_fiscal::text        || '-09-30')::date;

  v_tipo := CASE p_funcion
    WHEN 0 THEN 'administrativa'
    WHEN 1 THEN 'cliente'
    WHEN 2 THEN 'capacitacion'
    WHEN 3 THEN 'calidad'
  END;

  INSERT INTO public.parametro (nombre, periodo, date_begin, date_end, valor, descripcion, tipo)
  VALUES (
    'Correlativo OT',
    p_anio_fiscal,
    v_date_begin,
    v_date_end,
    1,
    'Correlativo encargos FY ' || p_anio_fiscal::text || ' - ' || v_tipo,
    v_tipo
  )
  ON CONFLICT (nombre, periodo, tipo) DO NOTHING;

  UPDATE public.parametro
    SET valor = valor + 1
  WHERE nombre  = 'Correlativo OT'
    AND periodo = p_anio_fiscal
    AND tipo    = v_tipo
  RETURNING valor - 1 INTO v_correlativo;

  IF v_correlativo IS NULL THEN
    RAISE EXCEPTION 'No se pudo obtener el correlativo para FY % tipo %', p_anio_fiscal, v_tipo;
  END IF;

  v_code := p_anio_fiscal::text
    || '.' || p_oficina::text || p_practica::text || p_funcion::text
    || '.' || LPAD(v_correlativo::text, 3, '0');

  INSERT INTO public.engagements (
    engagement_name, engagement_code, client_id, partner_id, manager_id,
    start_date, end_date, status, oficina, practica, funcion, anio_fiscal,
    work_order_required, activity_required, is_internal, approval_required,
    sqr_id, encargado_id, specialist_it_id, specialist_tax_id,
    fecha_cierre, anio_fiscal_override, contract_file_path, taxonomy_id, society_id
  ) VALUES (
    p_engagement_name, v_code, p_client_id, p_partner_id, p_manager_id,
    p_start_date, p_end_date, p_status, p_oficina, p_practica, p_funcion, p_anio_fiscal,
    p_work_order_required, p_activity_required, p_is_internal, p_approval_required,
    p_sqr_id, p_encargado_id, p_specialist_it_id, p_specialist_tax_id,
    p_fecha_cierre, p_anio_fiscal_override, p_contract_file_path, p_taxonomy_id, p_society_id
  ) RETURNING * INTO v_engagement;

  RETURN v_engagement;
END;
$$;

REVOKE ALL ON FUNCTION public.create_engagement_with_code(
  text, uuid, uuid, uuid, date, date, text,
  smallint, smallint, smallint, integer, boolean, boolean, boolean, boolean,
  date, boolean, uuid, uuid, uuid, uuid, uuid, text, uuid
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_engagement_with_code(
  text, uuid, uuid, uuid, date, date, text,
  smallint, smallint, smallint, integer, boolean, boolean, boolean, boolean,
  date, boolean, uuid, uuid, uuid, uuid, uuid, text, uuid
) TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 3b. LIMPIEZA DEFENSIVA (REVIEW FIX, post-implementación 2026-08-14): la cadena lineal de
--     migraciones ya dropea el overload de 15 params (pre-0602-137, sin personal
--     responsable/fecha de cierre/taxonomía) en 20260625000000_add_engagement_responsible_
--     personnel.sql, pero los fingerprints reales capturados en
--     supabase/tests/fixtures/route-fingerprints/ruta_{a,b,c}_schema.sql (2026-08-06)
--     muestran ese overload todavía vivo junto al de 23 params en las 3 rutas — drift entre
--     entornos (Test/Dev2.0/Lovable), no un problema de esta cadena de migraciones en sí.
--     Sigue siendo SECURITY DEFINER y NO valida society_id: si sobrevive en el entorno de
--     destino, permite crear encargos con society_id = NULL, saltándose la validación nueva
--     de este archivo. Se dropea explícitamente por las dudas (idempotente, IF EXISTS).
-- ────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.create_engagement_with_code(
  text, uuid, uuid, uuid, date, date, text,
  smallint, smallint, smallint, integer, boolean, boolean, boolean, boolean
);

-- Postcondition: después de los DROP de arriba debe sobrevivir exactamente 1 firma.
-- REVIEW FIX (2026-08-14): un RAISE WARNING no detiene la migración — si sobreviviera un
-- overload legado desconocido (uno no cubierto por los 2 DROP explícitos de arriba), la
-- migración se completaba igual con el bypass potencialmente vivo (SECURITY DEFINER, sin
-- validar society_id). Se escala a RAISE EXCEPTION para que la migración aborte (rollback)
-- y quede en manos de una persona revisarlo, en vez de depender de que alguien lea el log.
DO $$
DECLARE
  v_overload_count integer;
BEGIN
  SELECT count(*) INTO v_overload_count
    FROM pg_proc
   WHERE proname = 'create_engagement_with_code'
     AND pronamespace = 'public'::regnamespace;

  IF v_overload_count <> 1 THEN
    RAISE EXCEPTION '0714-155: se esperaba 1 overload de create_engagement_with_code, hay % — revisar overloads legados antes de reintentar la migración.', v_overload_count;
  ELSE
    RAISE NOTICE '0714-155: overload único de create_engagement_with_code confirmado.';
  END IF;
END $$;
