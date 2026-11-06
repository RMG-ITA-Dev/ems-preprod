-- Carril B, etapa B3p del barrido de seguridad RLS: permisos de lectura para cobranza y contabilidad.
-- Decisión del operador, 12/10/2026. Resumen: docs/seguridad/registro-seguridad-rls.md. Idempotente
-- (ON CONFLICT DO UPDATE): se aplica primero a mano en Dev 2.0 para probar y después con `db push`.
-- Va ANTES de las etapas que activan RLS en engagements y clients (B3c): sin estos permisos esos
-- roles quedarían sin ver el encargo ni el cliente de las OT que ya manejan.
--
-- Por qué: `accounting_manager` y `collections_analyst` tienen `work_order.payment_plan.approve` con
-- alcance `department`, y la política `payment_plan firm read` ya les deja leer TODOS los planes de pago.
-- Pero no tenían ningún permiso de lectura de la OT a la que pertenece cada plan (cobranza veía 0 OT;
-- contabilidad solo las 6 ligadas a sus solicitudes de fondos). Lo mismo para encargos y clientes.
--
-- Esto cambia la nota del 09/10 («en la matriz de permisos solo cambian los roles de riesgo»): por
-- decisión del operador, también cambian estos tres roles. Solo se agregan permisos de LECTURA con
-- alcance `department` (que en las políticas equivale a toda la firma). No se agrega ningún permiso de
-- crear, editar ni enviar.
--
-- Alcance de cada fila:
--   collections_analyst : work_order.read, engagement.read y client.read (cobra: necesita el contacto).
--   accounting_manager  : work_order.read y engagement.read.
--   accounting_analyst  : work_order.read y engagement.read.
-- Contabilidad NO recibe client.read: solo necesita el nombre del cliente, que dará el directorio de B4.
--
-- OJO, efecto en cadena: las políticas `budget_lines firm read` y `expense_budget firm read` de
-- wo_budget_lines y wo_expense_budget usan work_order.read. Cuando B3b active RLS en esas tablas, estos
-- tres roles verán los presupuestos de OT (horas y tarifa estándar por línea, y el presupuesto de gastos).
-- Hoy esas tablas no tienen RLS y las leen todos; no hay cambio visible hasta B3b.

INSERT INTO public.authorization_role_permissions (role_key, permission_key, scope_key) VALUES
  ('collections_analyst', 'work_order.read', 'department'),
  ('collections_analyst', 'engagement.read', 'department'),
  ('collections_analyst', 'client.read',     'department'),
  ('accounting_manager',  'work_order.read', 'department'),
  ('accounting_manager',  'engagement.read', 'department'),
  ('accounting_analyst',  'work_order.read', 'department'),
  ('accounting_analyst',  'engagement.read', 'department')
ON CONFLICT (role_key, permission_key) DO UPDATE SET scope_key = EXCLUDED.scope_key;

-- 1028-211 (decisión del operador, 2026-11-05): activación de clientes. Cualquier rol con client.create crea el
-- cliente, pero solo Cobranzas, el Gerente de Contabilidad y admin lo activan (client.activate, que también
-- desactiva). Sin el permiso, el alta nace inactiva (trg_clients_enforce_activation) y un cliente inactivo no
-- admite encargos (trg_engagements_enforce_client_active). El Gerente de Contabilidad recibe además client.read
-- para encontrar en /clients los clientes que tiene que activar; como los otros dos roles contables, lo ve
-- recortado a su sociedad (my_society_client_ids, que para un cliente sin encargos usa la sociedad del creador).
-- Revierte para accounting_manager la nota de arriba ("Contabilidad NO recibe client.read").
INSERT INTO public.authorization_permissions (permission_key, module_key, action_key, label_key, display_order)
VALUES ('client.activate', 'client', 'activate', 'authz.perm.client.activate', 40)
ON CONFLICT (permission_key) DO NOTHING;

INSERT INTO public.authorization_role_permissions (role_key, permission_key, scope_key) VALUES
  ('admin',               'client.activate', 'firm'),
  ('accounting_manager',  'client.activate', 'department'),
  ('collections_analyst', 'client.activate', 'department'),
  ('accounting_manager',  'client.read',     'department')
ON CONFLICT (role_key, permission_key) DO UPDATE SET scope_key = EXCLUDED.scope_key;
