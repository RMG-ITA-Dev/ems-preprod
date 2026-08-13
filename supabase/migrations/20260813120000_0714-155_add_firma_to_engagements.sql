-- 0714-155: Sociedad (firma interna) en Nuevo Encargo.
--
-- 1. Agregar engagements.society_id (FK a public.society, ya existente — sin tabla nueva).
-- 2. Backfill acotado: SOLO encargos cuyo client_id sea uno de los 2 registros-firma
--    (clients.client_legal_name = society.name, join dinámico — NUNCA hardcoded, para que
--    siga funcionando si el nombre legal de la sociedad cambia a futuro, p.ej. SRL -> SA).
-- 3. Desactivar (is_active=false) esos mismos client-firma — no se borran ni renombran.
-- 4. Reemplazar create_engagement_with_code() agregando p_society_id obligatorio.
--
-- Decisiones confirmadas por el operador (2026-08-13, bugs/0714-155/plan_v2.md §Open Questions):
--   #1 el nombre de la sociedad NUNCA se hardcodea — el backfill matchea por igualdad exacta
--      contra public.society.name en vez de literales fijos, así sigue funcionando si el
--      nombre legal cambia a futuro.
--   #2 society_id no tiene default: todo encargo nuevo debe traer una sociedad asociada.
--   #3 en la UI el campo se llama "Sociedad" (no "Firma"), consistente con StaffForm
--      (staff.society / staff.selectSociety), para no introducir un segundo término para
--      el mismo concepto.

-- ────────────────────────────────────────────────────────────────────────────
-- 1. COLUMNA (nullable — histórico parcial; sin índice, mismo precedente que
--    engagements.taxonomy_id: cardinalidad 2, sin filtro server-side)
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.engagements
  ADD COLUMN society_id uuid REFERENCES public.society(society_id) ON DELETE RESTRICT;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. BACKFILL ACOTADO: solo encargos cuyo client_id ES uno de los 2 client-firma
--    (match exacto de nombre contra society.name, sin literales hardcoded). Clientes
--    reales/internos quedan society_id = NULL.
-- ────────────────────────────────────────────────────────────────────────────
UPDATE public.engagements e
   SET society_id = s.society_id
  FROM public.clients c
  JOIN public.society s ON s.name = c.client_legal_name
 WHERE e.client_id = c.client_id;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. DESACTIVAR los client-firma (is_active=false, no se borran ni renombran): dejan
--    de ofrecerse en el combo de Cliente para altas nuevas; los FK e historial intactos.
-- ────────────────────────────────────────────────────────────────────────────
UPDATE public.clients c
   SET is_active = false
  FROM public.society s
 WHERE s.name = c.client_legal_name;

-- ────────────────────────────────────────────────────────────────────────────
-- 4. REEMPLAZAR RPC: agregar p_society_id (obligatorio, sin DEFAULT — va antes de los
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
