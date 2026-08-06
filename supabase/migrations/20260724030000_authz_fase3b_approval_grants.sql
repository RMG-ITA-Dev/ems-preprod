-- =====================================================================
-- Roles & Permisos — FASE 3b (parche de seed): concesiones del módulo Aprobaciones
-- según la matriz (captura) + nuevo permiso timesheet.self_approve.
-- Idempotente (delete + insert). Requiere Fase 1 aplicada.
-- =====================================================================

-- 1) Nuevo permiso: auto-aprobación de las propias horas (no está en el Excel;
--    es el concepto derivado de la regla de auto-aprobación).
insert into public.authorization_permissions (permission_key, module_key, action_key, label_key, display_order)
values ('timesheet.self_approve', 'timesheet', 'self_approve', 'authz.perm.timesheet.self_approve', 90)
on conflict (permission_key) do nothing;

-- 2) Reemplazar las concesiones de las 3 acciones de Aprobaciones.
--    (delete + insert para que los roles removidos —ita/tax— realmente desaparezcan.)
delete from public.authorization_role_permissions
where permission_key in (
  'timesheet_approval.read',
  'timesheet_approval.approve',
  'timesheet_approval.reject'
);

insert into public.authorization_role_permissions (role_key, permission_key, scope_key) values
  -- Ver Aprobaciones: admin, senior_partner, socio, gerente, socio de riesgos
  ('admin',          'timesheet_approval.read', 'firm'),
  ('senior_partner', 'timesheet_approval.read', 'firm'),
  ('partner',        'timesheet_approval.read', 'assigned_engagements'),
  ('manager',        'timesheet_approval.read', 'assigned_engagements'),
  ('risk_partner',   'timesheet_approval.read', 'department'),
  -- Aprobar: admin, gerente
  ('admin',   'timesheet_approval.approve', 'firm'),
  ('manager', 'timesheet_approval.approve', 'assigned_engagements'),
  -- Rechazar: admin, gerente
  ('admin',   'timesheet_approval.reject', 'firm'),
  ('manager', 'timesheet_approval.reject', 'assigned_engagements');

-- 3) Auto-aprobación de horas propias: admin, senior_partner, director, socio.
delete from public.authorization_role_permissions where permission_key = 'timesheet.self_approve';
insert into public.authorization_role_permissions (role_key, permission_key, scope_key) values
  ('admin',          'timesheet.self_approve', 'own'),
  ('senior_partner', 'timesheet.self_approve', 'own'),
  ('director',       'timesheet.self_approve', 'own'),
  ('partner',        'timesheet.self_approve', 'own');

-- =====================================================================
-- VALIDACIÓN:
--   select permission_key, role_key, scope_key from public.authorization_role_permissions
--     where permission_key like 'timesheet_approval%' or permission_key = 'timesheet.self_approve'
--     order by permission_key, role_key;
-- Esperado:
--   timesheet_approval.approve -> admin, manager
--   timesheet_approval.reject  -> admin, manager
--   timesheet_approval.read    -> admin, senior_partner, partner, manager, risk_partner
--   timesheet.self_approve     -> admin, senior_partner, director, partner
-- (Hrs Admins / Capacitación queda sin tocar — decisión D10 diferida.)
-- =====================================================================
