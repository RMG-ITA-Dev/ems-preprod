-- Agregar tipo a parametro para discriminar contadores por función
ALTER TABLE public.parametro
  ADD COLUMN IF NOT EXISTS tipo text;

-- Reemplazar constraint de unicidad: ahora incluye tipo
ALTER TABLE public.parametro
  DROP CONSTRAINT IF EXISTS parametro_nombre_periodo_key;

ALTER TABLE public.parametro
  ADD CONSTRAINT parametro_nombre_periodo_tipo_key UNIQUE (nombre, periodo, tipo);

-- Agregar función a engagements
ALTER TABLE public.engagements
  ADD COLUMN IF NOT EXISTS funcion smallint;

ALTER TABLE public.engagements
  ADD CONSTRAINT chk_engagements_funcion CHECK (funcion IN (0, 1, 2, 3));

-- RPC actualizado: p_funcion, correlativo por (FY, nombre, tipo), formato 3 dígitos
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

  -- Año fiscal: inicia el 1 de octubre del año anterior al FY
  v_date_begin := ((p_anio_fiscal - 1)::text || '-10-01')::date;
  v_date_end   := (p_anio_fiscal::text        || '-09-30')::date;

  -- Mapeo p_funcion → tipo (texto legible para la tabla parametro)
  v_tipo := CASE p_funcion
    WHEN 0 THEN 'administrativa'
    WHEN 1 THEN 'cliente'
    WHEN 2 THEN 'capacitacion'
    WHEN 3 THEN 'calidad'
  END;

  -- Auto-insertar fila del contador si no existe para (FY, nombre, tipo).
  -- Todos los contadores comparten nombre='Correlativo OT'; el tipo los separa.
  -- Ejemplo: FY2026 tendrá 4 filas: tipo='administrativa', 'cliente', 'capacitacion', 'calidad'.
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

  -- Incremento atómico del correlativo por (FY=periodo, nombre, tipo=función).
  -- Los 3 campos juntos identifican unívocamente el contador correcto.
  UPDATE public.parametro
    SET valor = valor + 1
  WHERE nombre  = 'Correlativo OT'
    AND periodo = p_anio_fiscal
    AND tipo    = v_tipo
  RETURNING valor - 1 INTO v_correlativo;

  IF v_correlativo IS NULL THEN
    RAISE EXCEPTION 'No se pudo obtener el correlativo para FY % tipo %', p_anio_fiscal, v_tipo;
  END IF;

  -- Formato: [FY].[CC][S][F].[CORRELATIVO 3dig]
  v_code := p_anio_fiscal::text
    || '.' || p_oficina::text || p_practica::text || p_funcion::text
    || '.' || LPAD(v_correlativo::text, 3, '0');

  INSERT INTO public.engagements (
    engagement_name, engagement_code, client_id, partner_id, manager_id,
    start_date, end_date, status, oficina, practica, funcion, anio_fiscal,
    work_order_required, activity_required, is_internal, approval_required
  ) VALUES (
    p_engagement_name, v_code, p_client_id, p_partner_id, p_manager_id,
    p_start_date, p_end_date, p_status, p_oficina, p_practica, p_funcion, p_anio_fiscal,
    p_work_order_required, p_activity_required, p_is_internal, p_approval_required
  ) RETURNING * INTO v_engagement;

  RETURN v_engagement;
END;
$$;

REVOKE ALL ON FUNCTION public.create_engagement_with_code(
  text, uuid, uuid, uuid, date, date, text,
  smallint, smallint, smallint, integer, boolean, boolean, boolean, boolean
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_engagement_with_code(
  text, uuid, uuid, uuid, date, date, text,
  smallint, smallint, smallint, integer, boolean, boolean, boolean, boolean
) TO authenticated;
