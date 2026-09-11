-- Bug 0722-156b (Fase 2) -- Iteracion 15/16 de review (greptile + codex), decision del
-- operador 2026-09-10: Socio (partner) y Senior Partner nunca debieron tener el permiso
-- work_order.create -- error de catalogo de RBAC detectado de paso mientras se revisaba
-- el modelo de autorizacion del TC, sin relacion con el tipo de cambio en si (ver
-- bugs/0722-156/plan_v2.md, Amendment 2026-09-10 "continuacion").
--
-- 20251204001004_cero_13_seed_authorization_rbac.sql (y su espejo
-- supabase/tests/local/40-fixture-rbac-catalog.sql) ya se corrigieron para que una
-- instalacion NUEVA (reset desde cero) nunca otorgue estas 2 filas. Pero ese seed ya
-- corrio contra Test/Dev 2.0 ANTES de esa correccion -- editar el archivo historico no
-- reescribe filas ya insertadas en una base real (mismo motivo por el que el resto de
-- las migraciones de este ticket nunca reescribe una migracion ya aplicada). Sin este
-- DELETE explicito, PermissionRoute ("/work-orders/new") y la policy RLS
-- wo_create_by_permission siguen autorizando a ambos roles en cualquier ambiente donde
-- el seed original ya corrio -- un DELETE manual (lo unico planteado hasta ahora)
-- depende de que alguien se acuerde de correrlo en cada ambiente.
--
-- Migracion forward-only: aplica en cualquier ambiente (nueva instalacion o una donde
-- las filas ya existan) sin fallar en ninguno de los 2 casos.
DELETE FROM public.authorization_role_permissions
WHERE role_key IN ('senior_partner', 'partner')
  AND permission_key = 'work_order.create';
