-- BUG 0604-143: derive Año Fiscal from an engagement closing date instead of manual selection.
-- Drop the current 19-arg overload (added by 20260625000000_add_engagement_responsible_personnel.sql)
-- before recreating with p_fecha_cierre/p_anio_fiscal_override.
DROP FUNCTION IF EXISTS public.create_engagement_with_code(
  text, uuid, uuid, uuid, date, date, text,
  smallint, smallint, smallint, integer, boolean, boolean, boolean, boolean,
  uuid, uuid, uuid, uuid
);

ALTER TABLE public.engagements
  ADD COLUMN IF NOT EXISTS fecha_cierre date,
  ADD COLUMN IF NOT EXISTS anio_fiscal_override boolean NOT NULL DEFAULT false;

-- Backfill legacy rows so fecha_cierre can be NOT NULL (Sep 30 of FY round-trips to same FY).
UPDATE public.engagements
   SET fecha_cierre = make_date(anio_fiscal, 9, 30)
 WHERE fecha_cierre IS NULL AND anio_fiscal IS NOT NULL;
UPDATE public.engagements
   SET fecha_cierre = created_at::date
 WHERE fecha_cierre IS NULL;

ALTER TABLE public.engagements ALTER COLUMN fecha_cierre SET NOT NULL;

-- RPC extended with p_fecha_cierre/p_anio_fiscal_override (required, so declared before the
-- personnel params which have DEFAULT NULL — Postgres requires defaulted params last).
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
  p_sqr_id               uuid DEFAULT NULL,
  p_encargado_id         uuid DEFAULT NULL,
  p_specialist_it_id     uuid DEFAULT NULL,
  p_specialist_tax_id    uuid DEFAULT NULL
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

  IF p_practica IS NULL OR p_practica NOT IN (0, 1, 2, 3, 4) THEN
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

  -- REVIEW FIX (0604-143 it.3): p_anio_fiscal was trusted as-is from the caller with no relation
  -- to p_fecha_cierre, so a mismatched pair (stale client, direct RPC call) could persist an
  -- anio_fiscal that the closing date never derives, even with anio_fiscal_override = false.
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
    fecha_cierre, anio_fiscal_override
  ) VALUES (
    p_engagement_name, v_code, p_client_id, p_partner_id, p_manager_id,
    p_start_date, p_end_date, p_status, p_oficina, p_practica, p_funcion, p_anio_fiscal,
    p_work_order_required, p_activity_required, p_is_internal, p_approval_required,
    p_sqr_id, p_encargado_id, p_specialist_it_id, p_specialist_tax_id,
    p_fecha_cierre, p_anio_fiscal_override
  ) RETURNING * INTO v_engagement;

  RETURN v_engagement;
END;
$$;

REVOKE ALL ON FUNCTION public.create_engagement_with_code(
  text, uuid, uuid, uuid, date, date, text,
  smallint, smallint, smallint, integer, boolean, boolean, boolean, boolean,
  date, boolean, uuid, uuid, uuid, uuid
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_engagement_with_code(
  text, uuid, uuid, uuid, date, date, text,
  smallint, smallint, smallint, integer, boolean, boolean, boolean, boolean,
  date, boolean, uuid, uuid, uuid, uuid
) TO authenticated;
