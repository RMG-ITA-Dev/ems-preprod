-- 0602-136: Admin-manageable Service Taxonomies catalog + link on engagements.
--
-- 1. Create public.taxonomies table with RLS (independent of public.services).
-- 2. Seed with the 46 provided taxonomies (all global, service_id = NULL).
-- 3. Add engagements.taxonomy_id (nullable FK, no backfill).
-- 4. Update create_engagement_with_code() to accept and validate p_taxonomy_id.

-- ────────────────────────────────────────────────────────────────────────────
-- 1. TAXONOMIES TABLE
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.taxonomies (
  taxonomy_id uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  code        varchar(10) NOT NULL CHECK (char_length(trim(code)) BETWEEN 1 AND 10),
  name        text        NOT NULL CHECK (trim(name) <> ''),
  service_id  uuid        NULL REFERENCES public.services(service_id) ON DELETE SET NULL,
  is_active   boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Case-insensitive global uniqueness (AA1006 and aa1006 are the same code).
CREATE UNIQUE INDEX IF NOT EXISTS idx_taxonomies_code_unique
  ON public.taxonomies (lower(trim(code)));

CREATE INDEX IF NOT EXISTS idx_taxonomies_service_id
  ON public.taxonomies (service_id);

ALTER TABLE public.taxonomies ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can read all rows (including inactive) so
-- historical engagements can resolve the name of a deactivated taxonomy.
CREATE POLICY "Authenticated users can read taxonomies"
  ON public.taxonomies FOR SELECT
  TO authenticated
  USING (true);

-- Only admins may create or update taxonomies (deactivate-only, no delete).
CREATE POLICY "Admins can insert taxonomies"
  ON public.taxonomies FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "Admins can update taxonomies"
  ON public.taxonomies FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- No DELETE policy → deactivate-only by design.

-- ────────────────────────────────────────────────────────────────────────────
-- 2. SEED (46 taxonomies provided in bugs/0602-136; all global, active)
-- ────────────────────────────────────────────────────────────────────────────
INSERT INTO public.taxonomies (code, name, service_id, is_active) VALUES
  ('AA1006', 'New year end Financial Statement Audit required by law/regulation', NULL, true),
  ('AA1007', 'Continued year end Financial Statement Audit required by law/regulation', NULL, true),
  ('AA1501', 'New year end Financial Statement Audit NOT required by law/regulation', NULL, true),
  ('AA1502', 'Cont. year end Financial Statement Audit NOT required by law/regulation', NULL, true),
  ('AA1503', 'Interim and other non-year end financial statement audit activities', NULL, true),
  ('AA1504', 'Reviews of Historical Financial Statements', NULL, true),
  ('AA2005', 'Historical Data and Other Financial Information', NULL, true),
  ('AA2007', 'Internal Controls Assurance excluding SOC', NULL, true),
  ('AA2012', 'Other Assurance services: Non-ESG', NULL, true),
  ('AA2015', 'Services required by law or regulation (Regulatory)', NULL, true),
  ('AA2016', 'Integrated Reporting', NULL, true),
  ('AA2018', 'Audits of Specific Elements Accounts or Items of a Financial Statement', NULL, true),
  ('AA2101', 'ESG/Sustainability Assurance Services', NULL, true),
  ('AA2201', 'Transaction Related Services incl Involvement w/ Offering Documents and PFI', NULL, true),
  ('AA4002', 'Accounting Advice', NULL, true),
  ('AA4004', 'Compliance Oversight Services', NULL, true),
  ('AA4100', 'Agreed upon procedures: Non-ESG', NULL, true),
  ('AA4201', 'General Training (Incl. ARO & ADC access)', NULL, true),
  ('AA4301', 'ESG Agreed upon procedures', NULL, true),
  ('AA4403', 'Financial Statement Compilations', NULL, true),
  ('ADV001', 'ADV - Process consulting', NULL, true),
  ('ADV002', 'ADV - Impairment', NULL, true),
  ('ADV003', 'Other Advisory services', NULL, true),
  ('BB2200', 'M&A / Corporate', NULL, true),
  ('BB2500', 'Legal Compliance', NULL, true),
  ('BB2700', 'Commercial Law', NULL, true),
  ('BB3100', 'Other Legal services', NULL, true),
  ('BC2100', 'Family Office & Private Client Services', NULL, true),
  ('BC2210', 'GMS Employment Tax Compliance (Expats)', NULL, true),
  ('BC2270', 'GMS Mobility Consulting Services', NULL, true),
  ('BD2200', 'Domestic Corporate & Asset Management Tax Advisory', NULL, true),
  ('BD2300', 'International Tax', NULL, true),
  ('BD2400', 'Tax Deal Advisory, M&A (Tax and Labor Due Diligence)', NULL, true),
  ('BD2401', 'Tax, Deal Advisory, M&A (Tax Due Diligence)', NULL, true),
  ('BD2402', 'Tax, Deal Advisory, M&A (Labor Due Diligence)', NULL, true),
  ('BD2403', 'Tax, Deal Advisory, M&A (Legal Due Diligence)', NULL, true),
  ('BD2404', 'Tax, Deal Advisory, M&A (Finance Due Diligence)', NULL, true),
  ('BD2700', 'Valuations', NULL, true),
  ('BD2970', 'Tax Disputes/Litigation involving Independent Arbitration/Courts', NULL, true),
  ('BE2100', 'Tax Compliance', NULL, true),
  ('BE2900', 'Transfer Pricing Compliance & Documentation', NULL, true),
  ('DB2190', 'Smart Digital Finance', NULL, true),
  ('DF6010', 'Internal Audit and SOAS Strategic Sourcing', NULL, true),
  ('DK9510', 'Bookkeeping', NULL, true),
  ('DK9511', 'Payroll Services', NULL, true),
  ('DM1010', 'Strategy Support', NULL, true)
ON CONFLICT DO NOTHING;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. LINK ON ENGAGEMENTS (nullable — legacy rows are not backfilled)
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.engagements
  ADD COLUMN IF NOT EXISTS taxonomy_id uuid REFERENCES public.taxonomies(taxonomy_id);

-- ────────────────────────────────────────────────────────────────────────────
-- 4. UPDATE RPC: add p_taxonomy_id, validate active-when-non-null, insert it.
--    Body is byte-identical to 20260703010000_link_contract_in_create_engagement_rpc.sql
--    (the latest signature, including fecha_cierre/sqr_id/contract_file_path)
--    except the new p_taxonomy_id parameter/validation/insert.
-- ────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.create_engagement_with_code(
  text, uuid, uuid, uuid, date, date, text,
  smallint, smallint, smallint, integer, boolean, boolean, boolean, boolean,
  date, boolean, uuid, uuid, uuid, uuid, text
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
    fecha_cierre, anio_fiscal_override, contract_file_path, taxonomy_id
  ) VALUES (
    p_engagement_name, v_code, p_client_id, p_partner_id, p_manager_id,
    p_start_date, p_end_date, p_status, p_oficina, p_practica, p_funcion, p_anio_fiscal,
    p_work_order_required, p_activity_required, p_is_internal, p_approval_required,
    p_sqr_id, p_encargado_id, p_specialist_it_id, p_specialist_tax_id,
    p_fecha_cierre, p_anio_fiscal_override, p_contract_file_path, p_taxonomy_id
  ) RETURNING * INTO v_engagement;

  RETURN v_engagement;
END;
$$;

REVOKE ALL ON FUNCTION public.create_engagement_with_code(
  text, uuid, uuid, uuid, date, date, text,
  smallint, smallint, smallint, integer, boolean, boolean, boolean, boolean,
  date, boolean, uuid, uuid, uuid, uuid, text, uuid
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_engagement_with_code(
  text, uuid, uuid, uuid, date, date, text,
  smallint, smallint, smallint, integer, boolean, boolean, boolean, boolean,
  date, boolean, uuid, uuid, uuid, uuid, text, uuid
) TO authenticated;
