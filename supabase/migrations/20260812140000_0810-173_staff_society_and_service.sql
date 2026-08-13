-- 0810-173: Sociedad y práctica en el registro de staff.
--
-- 1. Crear catálogo interno public.society (Ruizmier Pelaez / Ruizmier Juaregui), sin ABM.
-- 2. Agregar staff.society_id / staff.service_id.
-- 3. Backfill: todo el staff actual → Ruizmier Pelaez + Auditoría; remapear category_id
--    a la categoría homónima dentro de Auditoría (fallback: la de mayor display_order).
-- 4. Enforcement declarativo: FK compuesto staff(service_id, category_id) →
--    categories(service_id, category_id), sin trigger.
--
-- Decisiones confirmadas por el operador (2026-08-12, bugs/0810-173/plan_v2.md §Open Questions):
--   #1 fallback de categoría sin homónimo en Auditoría → la de mayor display_order
--      (verificado en ../EMS_Dev_Supabase/: 0 filas afectadas con los datos actuales).
--   #2 sin default de sociedad/práctica en altas nuevas (frontend, fuera de esta migración).
--   #3 columna de display de society = `name` (espejo de `services`).

-- ────────────────────────────────────────────────────────────────────────────
-- 1. SOCIETY TABLE (catálogo interno, sin ABM)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE public.society (
  society_id uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text        NOT NULL UNIQUE,
  is_active  boolean     NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.society ENABLE ROW LEVEL SECURITY;

-- Read-only: "sin ABM" → no hay policies de INSERT/UPDATE/DELETE. El seed de
-- abajo corre como owner de la migración (bypassa RLS).
CREATE POLICY "Authenticated users can read society"
  ON public.society FOR SELECT
  TO authenticated
  USING (true);

INSERT INTO public.society (name) VALUES
  ('Ruizmier Pelaez S.R.L.'),
  ('Ruizmier Juaregui S.R.L.');

-- ────────────────────────────────────────────────────────────────────────────
-- 2. STAFF: society_id / service_id (nullable hasta backfill)
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.staff
  ADD COLUMN society_id uuid REFERENCES public.society (society_id) ON DELETE RESTRICT,
  ADD COLUMN service_id uuid REFERENCES public.services (service_id) ON DELETE RESTRICT;

-- `20260730080000_harden_staff_pii_columns.sql` revocó el SELECT de tabla en
-- staff para `authenticated` y lo reemplazó por un GRANT explícito por columna
-- (mismo motivo por el que `20260806000000` tuvo que sumar `is_schedulable`):
-- una columna nueva ausente de ese GRANT tumba la consulta COMPLETA con 403
-- para cualquier SELECT que la incluya, admin incluido — no solo esa columna.
GRANT SELECT (society_id, service_id) ON public.staff TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. BACKFILL
-- ────────────────────────────────────────────────────────────────────────────
UPDATE public.staff
   SET society_id = (SELECT society_id FROM public.society WHERE name = 'Ruizmier Pelaez S.R.L.'),
       service_id = (SELECT service_id FROM public.services WHERE code = 1); -- Auditoría

-- Remap category_id → la categoría homónima dentro de Auditoría. Fallback (sin
-- homónimo): la categoría de Auditoría con mayor display_order. Staff con
-- category_id NULL quedan NULL (no entran al remap).
DO $$
DECLARE
  v_auditoria_service_id uuid;
  v_fallback_category_id uuid;
  v_fallback_count        integer;
BEGIN
  SELECT service_id INTO v_auditoria_service_id
    FROM public.services WHERE code = 1;

  SELECT category_id INTO v_fallback_category_id
    FROM public.categories
   WHERE service_id = v_auditoria_service_id
   ORDER BY display_order DESC
   LIMIT 1;

  -- Observabilidad: cuántas filas van a caer en el fallback (no aborta).
  SELECT COUNT(*) INTO v_fallback_count
    FROM public.staff st
    JOIN public.categories c ON c.category_id = st.category_id
   WHERE st.category_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.categories c_aud
        WHERE c_aud.service_id = v_auditoria_service_id
          AND c_aud.category_name = c.category_name
     );

  RAISE NOTICE '0810-173 backfill: % staff row(s) fall back to the default Auditoría category (no name match)', v_fallback_count;

  UPDATE public.staff st
     SET category_id = COALESCE(
       (SELECT c_aud.category_id
          FROM public.categories c_orig
          JOIN public.categories c_aud
            ON c_aud.service_id = v_auditoria_service_id
           AND c_aud.category_name = c_orig.category_name
         WHERE c_orig.category_id = st.category_id),
       v_fallback_category_id
     )
   WHERE st.category_id IS NOT NULL;
END $$;

-- society_id / service_id son ahora obligatorios (el backfill los seteó en todas las filas).
ALTER TABLE public.staff
  ALTER COLUMN society_id SET NOT NULL,
  ALTER COLUMN service_id SET NOT NULL;

-- ────────────────────────────────────────────────────────────────────────────
-- 4. ENFORCEMENT DECLARATIVO: categoría ↔ práctica (sin trigger)
-- ────────────────────────────────────────────────────────────────────────────
-- Target del FK compuesto (trivialmente único porque category_id ya es PK).
ALTER TABLE public.categories
  ADD CONSTRAINT categories_service_category_unique UNIQUE (service_id, category_id);

-- MATCH SIMPLE (default): filas con category_id NULL no se validan; las demás
-- quedan garantizadas a que la categoría pertenezca a la práctica del staff.
-- Se conserva el FK simple existente staff.category_id → categories(category_id).
ALTER TABLE public.staff
  ADD CONSTRAINT staff_service_category_fk FOREIGN KEY (service_id, category_id)
    REFERENCES public.categories (service_id, category_id);
