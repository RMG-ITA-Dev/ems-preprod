-- Carril B, etapa B3c del barrido de seguridad RLS: RLS en clients y engagements, directorio de clientes de
-- solo nombre y fin de la escritura a través de las vistas del dueño. BAR-002, BAR-010 (parte) y BAR-013 (parte).
-- Resumen y decisiones: docs/seguridad/registro-seguridad-rls.md. Análisis y cifras:
-- bugs/seguridad/carril-b/b3c_analisis.md (no versionado). Idempotente: se aplica primero a mano en Dev 2.0 para
-- probar y después con `db push`, que la registra en el ledger.
--
-- ORDEN DE DESPLIEGUE (obligatorio): el frontend de B3c (embed `client:clients_directory(...)`, `useClientDirectory`
-- en el selector de cliente del alta de encargo y en el filtro del Scheduler) va ANTES que esta migración. Sin él,
-- el gerente no puede elegir un cliente existente que no gestiona, hr_manager/hr_analyst no ven ninguno y
-- contabilidad, supervisor de riesgos y asistente pierden el nombre del cliente en OT y aprobaciones.
--
-- Por qué estaba apagado: ver 20261012130000 (B3a): la migración 20260115000154 del bot de Lovable apagó el RLS
-- «for beta testing» y nunca se revirtió. Las políticas siguen escritas en cero_05 y se conservan TAL CUAL: las 12
-- (5 de clients y 7 de engagements). Ninguna política, vista, función INVOKER ni trigger de otras tablas cambia de
-- resultado: todas las funciones auxiliares (is_assigned_to_engagement, is_engagement_team_member,
-- engagement_in_my_fund_request, has_permission...) son SECURITY DEFINER de `postgres`, que tiene BYPASSRLS.
--
-- Qué cambia al activarlas, medido en Dev 2.0 el 12/10/2026 con las 11 cuentas de prueba (ensayo con ROLLBACK):
--   · clients (9): ven todos admin, risk_partner y cobranza (client.read department); el socio los de sus encargos
--     (5); el gerente los de los suyos (3) y los que creó; asistente, senior, semisenior, contabilidad y supervisor
--     de riesgos pasan a ver 0 (decisión del operador: solo el nombre, por el directorio).
--   · engagements (10): ven todos admin, socio, risk_partner, risk_supervisor, contabilidad y cobranza (por B3p);
--     el gerente y el asistente 4 (el asistente, solo los de sus solicitudes de fondos enviadas); senior y semisenior
--     0: no tienen engagement.read, así que la política no los deja ver ni siendo `encargado`.
--
-- LA VISTA clients_directory ANULABA LA RLS (verificado el 12/10 dentro de un ROLLBACK): era una vista simple de
-- `postgres` (BYPASSRLS), sin security_invoker y con GRANT ALL a authenticated. Con RLS activa en clients, el
-- asistente y el senior seguían leyendo el contacto de 7 de los 9 clientes y un UPDATE a través de la vista alcanzaba
-- los 9. Se redefine con solo client_id, client_legal_name e is_active (is_active: el selector del alta de encargo
-- oculta los inactivos) y solo SELECT. NUNCA agregarle contacto, NIT ni industria.
--   · Filas: todos los clientes para cualquier sesión con ficha de staff (`get_my_staff_id() IS NOT NULL`, el mismo
--     patrón que fund_request_selectable_work_orders). No expone nada nuevo: los nombres ya los devuelve
--     list_loggable_engagements a quien tiene time_entry.create.
--   · DROP + CREATE porque CREATE OR REPLACE VIEW no puede quitar columnas. Ningún objeto depende de la vista
--     (pg_depend verificado) y ningún consumidor la usaba antes del frontend de B3c.
--
-- Fin de la escritura a través de las vistas del dueño (BAR-010 para empleados): engagement_wo_state, staff_directory,
-- fund_request_selectable_work_orders y work_order_summary conservaban INSERT/UPDATE/DELETE/TRUNCATE para
-- authenticated (un UPDATE a engagement_wo_state alcanzaba las 10 OT con los 11 roles). Todos sus consumidores solo
-- leen. A B4 le queda decidir la LECTURA de cada una.
--
-- Fuera de esta etapa (anotado en el plan): TRUNCATE de authenticated sobre las dos tablas (B5); EXECUTE de anon en
-- algunas funciones de etiquetas (B5); el selector de cliente de otras pantallas y Scheduler L2 (frontend aparte).

-- Guarda: activar RLS sin política de lectura dejaría la tabla ilegible para todos (fallo silencioso).
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['clients', 'engagements'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_policies
                    WHERE schemaname = 'public' AND tablename = t AND cmd = 'SELECT') THEN
      RAISE EXCEPTION 'B3c: public.% no tiene política de lectura; activar RLS la dejaría ilegible para todos', t;
    END IF;
  END LOOP;
END $$;

-- Directorio de clientes: solo nombre y estado, solo lectura.
DROP VIEW IF EXISTS public.clients_directory;
CREATE VIEW public.clients_directory WITH (security_invoker = false) AS
  SELECT c.client_id, c.client_legal_name, c.is_active
    FROM public.clients c
   WHERE public.get_my_staff_id() IS NOT NULL;

COMMENT ON VIEW public.clients_directory IS
  'B3c: directorio de nombres de cliente para quien no tiene client.read. SECURITY DEFINER a proposito (lee por '
  'encima de la RLS de clients): NUNCA agregar contacto, NIT ni industria. Solo SELECT para authenticated.';

-- El privilegio por defecto del esquema le da todo a anon y authenticated al crear la vista: se limpia.
REVOKE ALL ON public.clients_directory FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.clients_directory TO authenticated;
GRANT ALL ON public.clients_directory TO service_role;

-- Fin de la escritura a través de las demás vistas del dueño.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.engagement_wo_state, public.staff_directory,
     public.fund_request_selectable_work_orders, public.work_order_summary
  FROM authenticated;

ALTER TABLE public.clients     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.engagements ENABLE ROW LEVEL SECURITY;
