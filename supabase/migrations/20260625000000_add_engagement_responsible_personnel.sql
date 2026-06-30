-- FEAT 0602-137: Personal Responsable en Encargos
-- Agrega 4 columnas nullable (sqr_id, encargado_id, specialist_it_id, specialist_tax_id)
-- y actualiza el RPC create_engagement_with_code para recibirlas como parámetros opcionales.

ALTER TABLE public.engagements
  ADD COLUMN IF NOT EXISTS sqr_id           UUID REFERENCES public.staff(staff_id),
  ADD COLUMN IF NOT EXISTS encargado_id     UUID REFERENCES public.staff(staff_id),
  ADD COLUMN IF NOT EXISTS specialist_it_id  UUID REFERENCES public.staff(staff_id),
  ADD COLUMN IF NOT EXISTS specialist_tax_id UUID REFERENCES public.staff(staff_id);

-- Eliminar la firma anterior (15 params) antes de recrear con 19 params.
DROP FUNCTION IF EXISTS public.create_engagement_with_code(
  text, uuid, uuid, uuid, date, date, text,
  smallint, smallint, smallint, integer, boolean, boolean, boolean, boolean
);

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
  p_funcion             smallint,
  p_anio_fiscal         integer,
  p_work_order_required boolean,
  p_activity_required   boolean,
  p_is_internal         boolean,
  p_approval_required   boolean,
  p_sqr_id              uuid    DEFAULT NULL,
  p_encargado_id        uuid    DEFAULT NULL,
  p_specialist_it_id    uuid    DEFAULT NULL,
  p_specialist_tax_id   uuid    DEFAULT NULL
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
    sqr_id, encargado_id, specialist_it_id, specialist_tax_id
  ) VALUES (
    p_engagement_name, v_code, p_client_id, p_partner_id, p_manager_id,
    p_start_date, p_end_date, p_status, p_oficina, p_practica, p_funcion, p_anio_fiscal,
    p_work_order_required, p_activity_required, p_is_internal, p_approval_required,
    p_sqr_id, p_encargado_id, p_specialist_it_id, p_specialist_tax_id
  ) RETURNING * INTO v_engagement;

  RETURN v_engagement;
END;
$$;

REVOKE ALL ON FUNCTION public.create_engagement_with_code(
  text, uuid, uuid, uuid, date, date, text,
  smallint, smallint, smallint, integer, boolean, boolean, boolean, boolean,
  uuid, uuid, uuid, uuid
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_engagement_with_code(
  text, uuid, uuid, uuid, date, date, text,
  smallint, smallint, smallint, integer, boolean, boolean, boolean, boolean,
  uuid, uuid, uuid, uuid
) TO authenticated;
