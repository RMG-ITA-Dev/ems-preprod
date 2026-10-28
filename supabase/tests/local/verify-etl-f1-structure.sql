-- ETL fase 1 (bugs/ETL/carga/fase1/plan_v2.md, T02 / F1-CA13 / F1-CA15): aserciones tempranas de
-- estructura. Corre desde run-rls-tests.sh justo DESPUÉS de cero_04 (cero_02 columnas, cero_03
-- checks e índices, cero_04 FK) y antes de cualquier seed: no depende de roles sembrados, solo del
-- catálogo de esquema. Es de solo lectura (no escribe nada).
--
-- Comprueba que cada pieza existe UNA vez y con la forma acordada:
--   * categories.default_role_key: columna text nullable, check "no admin", FK a authorization_roles
--     (ON UPDATE CASCADE ON DELETE SET NULL) — nace en la estructura inicial, no en 20260825000000.
--   * clients: tax_id NOT NULL sin unicidad; seis atributos nuevos nullable y SIN default; los siete
--     checks; FK padre ON DELETE RESTRICT; índices de búsqueda NO únicos.
--   * industries.status: text NOT NULL DEFAULT 'active' con check ('active','inactive').
--
-- Salida de éxito: "ETL F1 STRUCTURE: ALL CHECKS PASSED".

DO $$
DECLARE
  v_n integer;
  v_def text;
  v_fk record;
  v_col record;
  v_name text;
BEGIN
  -- ── categories.default_role_key ────────────────────────────────────────────────────────────
  SELECT count(*) INTO v_n FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'categories'
     AND column_name = 'default_role_key' AND data_type = 'text' AND is_nullable = 'YES';
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: categories.default_role_key debe existir una vez, text y nullable (hay %)', v_n; END IF;
  RAISE NOTICE 'PASS: categories.default_role_key existe (text, nullable)';

  SELECT count(*) INTO v_n FROM pg_constraint
   WHERE conrelid = 'public.categories'::regclass AND conname = 'categories_default_role_key_not_admin' AND contype = 'c';
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: falta categories_default_role_key_not_admin (hay %)', v_n; END IF;
  RAISE NOTICE 'PASS: check categories_default_role_key_not_admin presente una vez';

  SELECT count(*) AS n, min(confupdtype::text) AS upd, min(confdeltype::text) AS del INTO v_fk
    FROM pg_constraint
   WHERE conrelid = 'public.categories'::regclass AND contype = 'f' AND confrelid = 'public.authorization_roles'::regclass;
  IF v_fk.n <> 1 OR v_fk.upd <> 'c' OR v_fk.del <> 'n' THEN
    RAISE EXCEPTION 'FAIL: categories -> authorization_roles debe tener UNA FK, ON UPDATE CASCADE ON DELETE SET NULL (n=%, upd=%, del=%)', v_fk.n, v_fk.upd, v_fk.del;
  END IF;
  RAISE NOTICE 'PASS: una sola FK default_role_key -> authorization_roles (CASCADE / SET NULL)';

  -- Sin depender de roles sembrados: el check rechaza 'admin' aunque el catálogo esté vacío.
  IF (SELECT pg_get_constraintdef(oid) FROM pg_constraint
       WHERE conrelid = 'public.categories'::regclass AND conname = 'categories_default_role_key_not_admin')
     NOT LIKE '%admin%' THEN
    RAISE EXCEPTION 'FAIL: el check no_admin no menciona admin';
  END IF;

  -- ── clients: tax_id y atributos nuevos ─────────────────────────────────────────────────────
  SELECT count(*) INTO v_n FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'clients' AND column_name = 'tax_id' AND is_nullable = 'NO'
     AND data_type = 'character varying' AND character_maximum_length = 50;
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: clients.tax_id debe ser varchar(50) NOT NULL'; END IF;
  SELECT count(*) INTO v_n FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'clients' AND column_name = 'unique_tax_id';
  IF v_n <> 0 THEN RAISE EXCEPTION 'FAIL: clients.unique_tax_id no debe existir (renombrada a tax_id)'; END IF;
  RAISE NOTICE 'PASS: clients.tax_id varchar(50) NOT NULL; unique_tax_id ya no existe';

  FOR v_col IN
    SELECT * FROM (VALUES
      ('operating_name', 'character varying'), ('client_type', 'text'), ('parent_client_id', 'uuid'),
      ('parent_relationship', 'text'), ('client_origin', 'text'), ('billing_tax_treatment', 'text')
    ) AS t(column_name, data_type)
  LOOP
    SELECT count(*) INTO v_n FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'clients' AND column_name = v_col.column_name
       AND data_type = v_col.data_type AND is_nullable = 'YES' AND column_default IS NULL;
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'FAIL: clients.% debe ser % nullable y SIN default', v_col.column_name, v_col.data_type;
    END IF;
  END LOOP;
  RAISE NOTICE 'PASS: los 6 atributos nuevos de clients son nullable y sin default';

  FOREACH v_name IN ARRAY ARRAY[
    'clients_client_type_check', 'clients_parent_relationship_check', 'clients_client_origin_check',
    'clients_billing_tax_treatment_check', 'clients_parent_pair_check', 'clients_parent_not_self_check',
    'clients_fideicomiso_not_sucursal_check'
  ] LOOP
    SELECT count(*) INTO v_n FROM pg_constraint
     WHERE conrelid = 'public.clients'::regclass AND conname = v_name AND contype = 'c';
    IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: falta el check % (hay %)', v_name, v_n; END IF;
  END LOOP;
  RAISE NOTICE 'PASS: los 7 checks de clients presentes una vez';

  SELECT count(*) AS n, min(confdeltype::text) AS del INTO v_fk
    FROM pg_constraint
   WHERE conrelid = 'public.clients'::regclass AND conname = 'clients_parent_client_id_fkey'
     AND contype = 'f' AND confrelid = 'public.clients'::regclass;
  IF v_fk.n <> 1 OR v_fk.del <> 'r' THEN
    RAISE EXCEPTION 'FAIL: clients_parent_client_id_fkey debe existir una vez con ON DELETE RESTRICT (n=%, del=%)', v_fk.n, v_fk.del;
  END IF;
  RAISE NOTICE 'PASS: FK padre de clientes con ON DELETE RESTRICT';

  -- Sin unicidad sobre NIT ni razón social (constraint o índice único): identidades legítimas repetidas.
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.clients'::regclass
                AND conname IN ('clients_unique_tax_id_key', 'clients_tax_id_key')) THEN
    RAISE EXCEPTION 'FAIL: sigue existiendo una unicidad de NIT en clients';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
              WHERE i.indrelid = 'public.clients'::regclass AND i.indisunique AND NOT i.indisprimary) THEN
    RAISE EXCEPTION 'FAIL: clients no debe tener índices únicos aparte de la PK';
  END IF;
  RAISE NOTICE 'PASS: clients sin unicidad de NIT ni de razón social (solo PK)';

  FOREACH v_name IN ARRAY ARRAY['idx_clients_tax_id', 'idx_clients_legal_name', 'idx_clients_parent_client_id'] LOOP
    SELECT count(*) INTO v_n FROM pg_indexes
     WHERE schemaname = 'public' AND tablename = 'clients' AND indexname = v_name AND indexdef NOT LIKE 'CREATE UNIQUE%';
    IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: falta el índice no único %', v_name; END IF;
  END LOOP;
  SELECT indexdef INTO v_def FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_clients_legal_name';
  IF v_def NOT LIKE '%lower(TRIM(BOTH FROM client_legal_name))%' THEN
    RAISE EXCEPTION 'FAIL: idx_clients_legal_name debe indexar el nombre normalizado (%)', v_def;
  END IF;
  SELECT indexdef INTO v_def FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_clients_parent_client_id';
  IF v_def NOT LIKE '%WHERE%parent_client_id IS NOT NULL%' THEN
    RAISE EXCEPTION 'FAIL: idx_clients_parent_client_id debe ser parcial (%)', v_def;
  END IF;
  RAISE NOTICE 'PASS: índices de búsqueda no únicos (NIT, nombre normalizado, padre parcial)';

  -- ── industries.status ─────────────────────────────────────────────────────────────────────
  SELECT count(*) INTO v_n FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'industries' AND column_name = 'status'
     AND data_type = 'text' AND is_nullable = 'NO' AND column_default LIKE '%active%';
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: industries.status debe ser text NOT NULL DEFAULT ''active'''; END IF;
  SELECT count(*) INTO v_n FROM pg_constraint
   WHERE conrelid = 'public.industries'::regclass AND conname = 'industries_status_check' AND contype = 'c';
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: falta industries_status_check'; END IF;
  RAISE NOTICE 'PASS: industries.status text NOT NULL DEFAULT active, con check';

  RAISE NOTICE 'ETL F1 STRUCTURE: ALL CHECKS PASSED';
END
$$;
