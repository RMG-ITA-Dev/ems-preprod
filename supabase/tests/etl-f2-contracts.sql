-- Contratos que consume la consola ETL F2. Solo se ejecuta en el PG descartable del harness.
BEGIN;
DO $$
DECLARE v_parent uuid := 'c2f2c200-0000-4000-8000-000000000001';
        v_child uuid := 'c2f2c200-0000-4000-8000-000000000002';
        v_staff uuid := '52f2c200-0000-4000-8000-000000000001';
BEGIN
  -- T1: una carga privilegiada permite cero cobranza y un contacto general.
  INSERT INTO public.clients (client_id, client_legal_name, tax_id) VALUES (v_parent, 'F2 contrato padre', 'F2-001');
  INSERT INTO public.client_contacts (contact_id, client_id, contact_type, full_name, email, phone)
  VALUES ('d2f2c200-0000-4000-8000-000000000001', v_parent, 'general', 'Contacto F2', 'f2@example.test', '70000001');
  IF (SELECT count(*) FROM public.client_contacts WHERE client_id=v_parent) <> 1 THEN RAISE EXCEPTION 'FAIL T1'; END IF;
  RAISE NOTICE 'PASS T1: cliente ETL con contacto general sin cobranza';
  -- T2/T3: una baja se conserva y el paso manual a inactivo es permitido.
  INSERT INTO public.staff (staff_id, first_name, last_name, email, hire_date, termination_date, is_active, practica_id, society_id)
  VALUES (v_staff, 'F2', 'Baja', 'f2-baja@example.test', DATE '2024-01-01', DATE '2026-10-01', true,
          (SELECT practica_id FROM public.practicas ORDER BY code LIMIT 1), (SELECT society_id FROM public.society ORDER BY name LIMIT 1));
  UPDATE public.staff SET is_active=false WHERE staff_id=v_staff;
  IF NOT EXISTS (SELECT 1 FROM public.staff WHERE staff_id=v_staff AND NOT is_active AND termination_date=DATE '2026-10-01') THEN RAISE EXCEPTION 'FAIL T2/T3'; END IF;
  RAISE NOTICE 'PASS T2/T3: baja preservada y paso manual a inactivo';
  -- T6: padre/hijo y borrado RESTRICT.
  INSERT INTO public.clients (client_id, client_legal_name, tax_id, parent_client_id, parent_relationship)
  VALUES (v_child, 'F2 contrato hijo', 'F2-002', v_parent, 'proyecto_de');
  BEGIN DELETE FROM public.clients WHERE client_id=v_parent; RAISE EXCEPTION 'FAIL T6: parent delete admitted';
  EXCEPTION WHEN foreign_key_violation OR restrict_violation THEN NULL; END;
  RAISE NOTICE 'PASS T6: FK padre RESTRICT';
  RAISE NOTICE 'ETL F2 CONTRACTS: ALL CHECKS PASSED';
END $$;
ROLLBACK;
