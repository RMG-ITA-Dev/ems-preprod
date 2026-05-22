-- Migration: Auto-generate engagement code on INSERT (Bug 0306-82)
-- Creates: parametro table, new columns on engagements, RPC create_engagement_with_code

CREATE TABLE IF NOT EXISTS public.parametro (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre       text NOT NULL,
  periodo      integer NOT NULL,
  date_begin   date NOT NULL,
  date_end     date NOT NULL,
  valor        integer NOT NULL DEFAULT 1,
  descripcion  text,
  created_at   timestamptz DEFAULT now(),
  UNIQUE (nombre, periodo)
);

ALTER TABLE public.engagements
  ADD COLUMN IF NOT EXISTS oficina    smallint,
  ADD COLUMN IF NOT EXISTS practica   smallint,
  ADD COLUMN IF NOT EXISTS anio_fiscal integer;

ALTER TABLE public.engagements
  ADD CONSTRAINT chk_engagements_oficina  CHECK (oficina  IN (1, 2)),
  ADD CONSTRAINT chk_engagements_practica CHECK (practica IN (1, 2, 3));

CREATE OR REPLACE FUNCTION public.create_engagement_with_code(
  p_engagement_name     text,
  p_client_id           uuid,
  p_partner_id          uuid,
  p_manager_id          uuid,
  p_start_date          date,
  p_end_date            date,
  p_status              text,
  p_oficina             smallint,
  p_practica            smallint,
  p_anio_fiscal         integer,
  p_work_order_required boolean,
  p_activity_required   boolean,
  p_is_internal         boolean,
  p_approval_required   boolean
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
BEGIN
  IF p_oficina IS NULL OR p_oficina NOT IN (1, 2) THEN
    RAISE EXCEPTION 'Oficina inválida: %', p_oficina;
  END IF;

  IF p_practica IS NULL OR p_practica NOT IN (1, 2, 3) THEN
    RAISE EXCEPTION 'Práctica inválida: %', p_practica;
  END IF;

  IF p_anio_fiscal IS NULL OR p_anio_fiscal < 2020 OR p_anio_fiscal > 2100 THEN
    RAISE EXCEPTION 'Año fiscal inválido: %', p_anio_fiscal;
  END IF;

  -- Año fiscal: inicia el 1 de octubre del año anterior al FY, termina el 30 de septiembre del FY
  -- Ejemplo: FY 2027 → 2026-10-01 a 2027-09-30
  v_date_begin := ((p_anio_fiscal - 1)::text || '-10-01')::date;
  v_date_end   := (p_anio_fiscal::text        || '-09-30')::date;

  -- Auto-insertar la fila del FY si no existe (FY rollover automático)
  INSERT INTO public.parametro (nombre, periodo, date_begin, date_end, valor, descripcion)
  VALUES (
    'Correlativo OT',
    p_anio_fiscal,
    v_date_begin,
    v_date_end,
    1,
    'Correlativo global de encargos FY ' || p_anio_fiscal::text
  )
  ON CONFLICT (nombre, periodo) DO NOTHING;

  -- Incremento atómico del correlativo para el FY indicado
  UPDATE public.parametro
    SET valor = valor + 1
  WHERE nombre  = 'Correlativo OT'
    AND periodo = p_anio_fiscal
  RETURNING valor - 1 INTO v_correlativo;

  IF v_correlativo IS NULL THEN
    RAISE EXCEPTION 'No se pudo obtener el correlativo para el FY %', p_anio_fiscal;
  END IF;

  -- Formato: [FY].[CC][P].[CORRELATIVO 4dig]
  v_code := p_anio_fiscal::text
    || '.' || p_oficina::text || p_practica::text
    || '.' || LPAD(v_correlativo::text, 4, '0');

  INSERT INTO public.engagements (
    engagement_name, engagement_code, client_id, partner_id, manager_id,
    start_date, end_date, status, oficina, practica, anio_fiscal,
    work_order_required, activity_required, is_internal, approval_required
  ) VALUES (
    p_engagement_name, v_code, p_client_id, p_partner_id, p_manager_id,
    p_start_date, p_end_date, p_status, p_oficina, p_practica, p_anio_fiscal,
    p_work_order_required, p_activity_required, p_is_internal, p_approval_required
  ) RETURNING * INTO v_engagement;

  RETURN v_engagement;
END;
$$;

REVOKE ALL ON FUNCTION public.create_engagement_with_code(
  text, uuid, uuid, uuid, date, date, text,
  smallint, smallint, integer, boolean, boolean, boolean, boolean
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_engagement_with_code(
  text, uuid, uuid, uuid, date, date, text,
  smallint, smallint, integer, boolean, boolean, boolean, boolean
) TO authenticated;
