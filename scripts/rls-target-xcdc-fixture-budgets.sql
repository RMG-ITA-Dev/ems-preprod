-- Fixture sintético de presupuestos para completar la validación RLS por Data API de
-- xcdcxtduotwgwmhxvsiz. No invoca RPCs, no actualiza filas ni dispara notificaciones.
-- Precondiciones: fixtures de staff y negocio aplicados; las dos OT de cliente existen.

BEGIN;

-- Una hoja y una celda por cada uno de los dos encargos de cliente. La categoría y
-- actividad se resuelven en la misma práctica que el encargo, para pasar el trigger
-- de alcance de práctica sin depender de identificadores del seed.
INSERT INTO public.activity_worksheets (
  id, engagement_id, wo_id, version, status, notes, created_by_staff_id
) VALUES
(
  'a0c0dc00-0000-4000-8000-000000000001',
  'e0c0dc00-0000-4000-8000-000000000001',
  '40c0dc00-0000-4000-8000-000000000001', 1, 'draft', 'RLS-XCDC presupuesto Alfa',
  (SELECT staff_id FROM public.staff WHERE email = 'rls-xcdc-20261016-manager@ruizmier.com')
),
(
  'a0c0dc00-0000-4000-8000-000000000002',
  'e0c0dc00-0000-4000-8000-000000000002',
  '40c0dc00-0000-4000-8000-000000000002', 1, 'draft', 'RLS-XCDC presupuesto Beta',
  (SELECT staff_id FROM public.staff WHERE email = 'rls-xcdc-20261016-accounting-manager@ruizmier.com')
)
ON CONFLICT DO NOTHING;

INSERT INTO public.activity_worksheet_cells (id, worksheet_id, category_id, activity_id, budget_hours)
SELECT v.id, v.worksheet_id,
       (SELECT c.category_id
          FROM public.categories c
          JOIN public.practicas p ON p.practica_id = c.practica_id
         WHERE p.code = 1
         ORDER BY c.display_order, c.category_id
         LIMIT 1),
       (SELECT ac.activity_id
          FROM public.activity_codes ac
          JOIN public.practicas p ON p.practica_id = ac.practica_id
         WHERE p.code = 1 AND ac.is_system = false AND ac.is_active = true
         ORDER BY ac.activity_code, ac.activity_id
         LIMIT 1),
       v.budget_hours
  FROM (VALUES
    ('a1c0dc00-0000-4000-8000-000000000001'::uuid, 'a0c0dc00-0000-4000-8000-000000000001'::uuid, 12::numeric),
    ('a1c0dc00-0000-4000-8000-000000000002'::uuid, 'a0c0dc00-0000-4000-8000-000000000002'::uuid, 8::numeric)
  ) AS v(id, worksheet_id, budget_hours)
ON CONFLICT DO NOTHING;

-- Líneas de horas y gastos separadas de las hojas para probar los tres objetos RLS.
INSERT INTO public.wo_budget_lines (wo_line_id, wo_id, category_id, budgeted_hours, standard_rate)
SELECT v.id, v.wo_id,
       (SELECT c.category_id
          FROM public.categories c
          JOIN public.practicas p ON p.practica_id = c.practica_id
         WHERE p.code = 1
         ORDER BY c.display_order, c.category_id
         LIMIT 1),
       v.budget_hours, v.standard_rate
  FROM (VALUES
    ('a2c0dc00-0000-4000-8000-000000000001'::uuid, '40c0dc00-0000-4000-8000-000000000001'::uuid, 12::numeric, 100::numeric),
    ('a2c0dc00-0000-4000-8000-000000000002'::uuid, '40c0dc00-0000-4000-8000-000000000002'::uuid, 8::numeric, 100::numeric)
  ) AS v(id, wo_id, budget_hours, standard_rate)
ON CONFLICT DO NOTHING;

INSERT INTO public.wo_expense_budget (wo_exp_id, wo_id, expense_type_id, budgeted_amount)
SELECT v.id, v.wo_id,
       (SELECT expense_type_id FROM public.expense_types ORDER BY expense_type_id LIMIT 1),
       v.budgeted_amount
  FROM (VALUES
    ('a3c0dc00-0000-4000-8000-000000000001'::uuid, '40c0dc00-0000-4000-8000-000000000001'::uuid, 250::numeric),
    ('a3c0dc00-0000-4000-8000-000000000002'::uuid, '40c0dc00-0000-4000-8000-000000000002'::uuid, 175::numeric)
  ) AS v(id, wo_id, budgeted_amount)
ON CONFLICT DO NOTHING;

DO $$
DECLARE
  v_worksheets int;
  v_cells int;
  v_budget_lines int;
  v_expenses int;
BEGIN
  SELECT count(*) INTO v_worksheets FROM public.activity_worksheets
   WHERE id::text LIKE 'a0c0dc00-%';
  SELECT count(*) INTO v_cells FROM public.activity_worksheet_cells
   WHERE id::text LIKE 'a1c0dc00-%';
  SELECT count(*) INTO v_budget_lines FROM public.wo_budget_lines
   WHERE wo_line_id::text LIKE 'a2c0dc00-%';
  SELECT count(*) INTO v_expenses FROM public.wo_expense_budget
   WHERE wo_exp_id::text LIKE 'a3c0dc00-%';

  IF v_worksheets <> 2 OR v_cells <> 2 OR v_budget_lines <> 2 OR v_expenses <> 2 THEN
    RAISE EXCEPTION 'RLS budgets fixture FAIL: hojas %, celdas %, líneas %, gastos %',
      v_worksheets, v_cells, v_budget_lines, v_expenses;
  END IF;
  RAISE NOTICE 'RLS budgets fixture PASS: 2 hojas, 2 celdas, 2 líneas y 2 gastos sintéticos';
END $$;

COMMIT;
