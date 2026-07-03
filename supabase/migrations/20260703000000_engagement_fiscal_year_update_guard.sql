-- BUG 0604-143 (review it.4): the anio_fiscal/fecha_cierre/anio_fiscal_override invariant added in
-- 20260702000000 only guards the create_engagement_with_code RPC (INSERT path). useUpdateEngagement
-- (src/hooks/mutations/useEngagementMutations.ts) writes directly via
-- supabase.from("engagements").update(data), and the "Team can update engagements" RLS policy
-- (20260107032620, FOR UPDATE USING (is_engagement_team_member(engagement_id)), no WITH CHECK on
-- column values) lets any staff member assigned as an engagement's manager_id/partner_id persist
-- anio_fiscal_override = true or a mismatched anio_fiscal/fecha_cierre with no admin check or
-- derived-FY validation. A BEFORE UPDATE trigger enforces the same invariant on every write path
-- (direct table update or any future RPC), independent of which policy let the row through.
--
-- INSERT is not covered here: it's already either admin-gated ("Admins can manage engagements",
-- FOR ALL, non-admin INSERT is rejected by RLS) or goes through create_engagement_with_code
-- (SECURITY DEFINER, already validated in 20260702000000).

CREATE OR REPLACE FUNCTION public.enforce_engagement_fiscal_year_invariant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_derived_fy integer;
BEGIN
  -- Only re-validate when a field this invariant governs actually changes; unrelated updates
  -- (status, name, personnel, dates, etc.) pass through untouched.
  IF NEW.fecha_cierre IS NOT DISTINCT FROM OLD.fecha_cierre
     AND NEW.anio_fiscal IS NOT DISTINCT FROM OLD.anio_fiscal
     AND NEW.anio_fiscal_override IS NOT DISTINCT FROM OLD.anio_fiscal_override THEN
    RETURN NEW;
  END IF;

  IF NEW.fecha_cierre IS NULL THEN
    RAISE EXCEPTION 'Fecha de cierre requerida';
  END IF;

  -- Mirrors getFiscalYearForDate (src/lib/fiscalCalculations.ts) and the check added to
  -- create_engagement_with_code: fiscal year runs Oct 1 -> Sep 30, named by the ending year.
  v_derived_fy := CASE
    WHEN EXTRACT(MONTH FROM NEW.fecha_cierre) >= 10 THEN EXTRACT(YEAR FROM NEW.fecha_cierre)::integer + 1
    ELSE EXTRACT(YEAR FROM NEW.fecha_cierre)::integer
  END;

  IF NEW.anio_fiscal_override THEN
    IF NOT public.is_admin() THEN
      RAISE EXCEPTION 'FORBIDDEN: el override manual del año fiscal requiere rol administrador'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSIF NEW.anio_fiscal IS DISTINCT FROM v_derived_fy THEN
    RAISE EXCEPTION 'Año fiscal % no coincide con el derivado de la fecha de cierre % (esperado %)',
      NEW.anio_fiscal, NEW.fecha_cierre, v_derived_fy;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS engagements_fiscal_year_invariant ON public.engagements;
CREATE TRIGGER engagements_fiscal_year_invariant
  BEFORE UPDATE ON public.engagements
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_engagement_fiscal_year_invariant();
