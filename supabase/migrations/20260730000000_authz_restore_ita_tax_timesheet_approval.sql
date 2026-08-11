-- =====================================================================
-- Roles & Permisos — restituir Aprobar/Rechazar horas a ITA y TAX
--
-- Decisión del negocio (2026-07-30, confirmada contra el Excel firmado
-- "Matriz Roles Permisos.xlsx", hoja "Matriz de Roles y Permisos"):
-- Gerente Especialista ITA y Gerente Especialista TAX SÍ aprueban y rechazan
-- hojas de tiempo.
--
-- Contexto: la Fase 3b (20260724030000) los había quitado con un delete+insert
-- sobre los 3 permisos del módulo Aprobaciones, dejando solo admin, manager,
-- senior_partner, partner y risk_partner. Ese era el único hueco real entre la
-- matriz y la base: los otros 21 roles cuadran exacto.
--
-- Alcance: 'assigned_engagements', igual que `manager` — aprueban las horas de
-- los encargos donde están asignados, no de toda la firma.
--
-- Incluye 'timesheet_approval.read': requerimientos confirmó (2026-07-30) que es
-- un bug de la matriz — deben ver la pantalla de Aprobaciones, pero SOLO las de
-- sus encargos asignados. Sin este permiso el sidebar oculta el ítem y la ruta
-- /timesheet/approvals devuelve 403, así que Aprobar/Rechazar serían inalcanzables.
--
-- Idempotente: borra solo los pares (rol, permiso) que crea. No toca las
-- concesiones de los demás roles.
-- =====================================================================

delete from public.authorization_role_permissions
where role_key in ('ita_manager', 'tax_manager')
  and permission_key in ('timesheet_approval.read',
                         'timesheet_approval.approve',
                         'timesheet_approval.reject');

insert into public.authorization_role_permissions (role_key, permission_key, scope_key) values
  ('ita_manager', 'timesheet_approval.read',    'assigned_engagements'),
  ('ita_manager', 'timesheet_approval.approve', 'assigned_engagements'),
  ('ita_manager', 'timesheet_approval.reject',  'assigned_engagements'),
  ('tax_manager', 'timesheet_approval.read',    'assigned_engagements'),
  ('tax_manager', 'timesheet_approval.approve', 'assigned_engagements'),
  ('tax_manager', 'timesheet_approval.reject',  'assigned_engagements');

-- El alcance 'assigned_engagements' es lo que implementa "solo las suyas": las
-- funciones de aprobación (20260724040000) filtran por él, así que ven y aprueban
-- únicamente las hojas de tiempo de los encargos donde están asignados.

-- =====================================================================
-- VALIDACIÓN
--   -- Esperado: 6 filas, todas assigned_engagements
--   select role_key, permission_key, scope_key
--   from public.authorization_role_permissions
--   where role_key in ('ita_manager','tax_manager')
--     and permission_key like 'timesheet_approval.%'
--   order by role_key, permission_key;
--
--   -- Quién aprueba ahora (esperado: admin, manager, ita_manager, tax_manager)
--   select role_key, scope_key from public.authorization_role_permissions
--   where permission_key = 'timesheet_approval.approve' order by role_key;
-- =====================================================================
