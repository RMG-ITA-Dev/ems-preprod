-- ETL F3: contratos del destino. La suite se ejecuta sólo contra el stack local del harness.
BEGIN;

DO $$
BEGIN
  IF to_regprocedure('public.create_engagement_with_code(text,uuid,uuid,uuid,date,date,text,smallint,smallint,smallint,integer,boolean,boolean,boolean,boolean,date,boolean,uuid,uuid,uuid,uuid,uuid,text,uuid)') IS NULL THEN
    RAISE EXCEPTION 'ETL F3: create_engagement_with_code ausente';
  END IF;
  IF to_regprocedure('public.sync_worksheet_to_wo_budget(uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION 'ETL F3: sync_worksheet_to_wo_budget ausente';
  END IF;
  IF to_regprocedure('public.add_installment_note(uuid,uuid,text)') IS NULL THEN
    RAISE EXCEPTION 'ETL F3: add_installment_note ausente';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='time_entries' AND column_name='period_id' AND is_nullable='YES') THEN
    RAISE EXCEPTION 'ETL F3: time_entries.period_id debe admitir NULL';
  END IF;

  -- S05 (F3-Q10): la partición técnica de celdas > 99,99 h vive en cero_02/cero_03, sin migración aparte.
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='time_entries' AND column_name='etl_split_index' AND data_type='smallint' AND is_nullable='NO' AND column_default='1') THEN
    RAISE EXCEPTION 'ETL F3: time_entries.etl_split_index debe ser smallint NOT NULL DEFAULT 1';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.time_entries'::regclass AND conname='time_entries_etl_split_index_check' AND pg_get_constraintdef(oid) LIKE '%etl_split_index > 0%') THEN
    RAISE EXCEPTION 'ETL F3: falta CHECK etl_split_index > 0';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='idx_time_entries_unique_entry' AND indexdef LIKE 'CREATE UNIQUE INDEX%' AND indexdef LIKE '%(staff_id, engagement_id, activity_id, date_worked, is_forecast, etl_split_index)%') THEN
    RAISE EXCEPTION 'ETL F3: la unicidad de time_entries debe incluir etl_split_index';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='time_entries' AND column_name='hours_logged' AND numeric_precision=4 AND numeric_scale=2) THEN
    RAISE EXCEPTION 'ETL F3: hours_logged debe seguir siendo numeric(4,2): las celdas > 99,99 h se parten, no ensanchan la columna';
  END IF;

  -- S08 (P-02): el TC del plan es contrato de dash_socio (NOT NULL, > 0, DEFAULT latest_exchange_rate()); BOB lo toma del DEFAULT.
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='wo_payment_plan' AND column_name='exchange_rate' AND is_nullable='NO' AND column_default LIKE '%latest_exchange_rate()%') THEN
    RAISE EXCEPTION 'ETL F3: wo_payment_plan.exchange_rate debe conservar NOT NULL DEFAULT latest_exchange_rate() (P-02, sin migración que lo relaje)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='wo_payment_plan' AND column_name='exchange_rate_mode' AND is_nullable='NO' AND column_default LIKE '''fijo''%') THEN
    RAISE EXCEPTION 'ETL F3: wo_payment_plan.exchange_rate_mode debe conservar NOT NULL DEFAULT fijo';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.wo_payment_plan'::regclass AND conname='wo_payment_plan_exchange_rate_positive') THEN
    RAISE EXCEPTION 'ETL F3: falta CHECK exchange_rate > 0 del plan';
  END IF;
  IF public.latest_exchange_rate() IS NULL OR public.latest_exchange_rate() <= 0 THEN
    RAISE EXCEPTION 'ETL F3: latest_exchange_rate() no devuelve un TC positivo; un plan BOB no podría tomar el DEFAULT';
  END IF;
END $$;

ROLLBACK;
SELECT 'ETL F3 CONTRACTS: ALL CHECKS PASSED' AS result;
