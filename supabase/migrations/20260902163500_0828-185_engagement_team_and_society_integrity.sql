--
-- BUG 0828-185 (Plan v2 §c.4/§c.5): dos endurecimientos de esquema requeridos por el bucket
-- own_society del nuevo RPC list_portfolio_engagements() (20260902163000), más la ampliación
-- de elegibilidad del bloque Equipo del encargo (plan_v0 §5, decisiones del operador).
--
-- Ambos endurecimientos REMEDIAN antes de exigir (backfill/null-out con un valor por defecto
-- elegido por el operador), y solo abortan con un guard residual si, después de remediar,
-- quedara alguna fila inconsistente -- nunca corren SET NOT NULL / ADD CONSTRAINT a ciegas
-- sobre datos reales. El ambiente destino post-migración-cero entra VACÍO, así que en la
-- práctica esto es un no-op fuera de este archivo de bootstrap.
--

-- ── §c.4: engagements.society_id NOT NULL + índice ──────────────────────────────────────────
--
-- own_society compara `e.society_id = <sociedad del llamante>`; una fila con society_id NULL
-- nunca puede matchear ninguna sociedad real, así que quedaría invisible para partner/sqr/
-- director sin importar quién la creó -- salvo que también sea su creador. NOT NULL cierra ese
-- agujero de forma explícita en el esquema, no solo en el RPC.
UPDATE public.engagements
   SET society_id = (SELECT society_id FROM public.society WHERE name = 'Ruizmier Pelaez S.R.L.')
 WHERE society_id IS NULL;

DO $$
DECLARE v_missing integer;
BEGIN
  SELECT count(*) INTO v_missing FROM public.engagements WHERE society_id IS NULL;
  IF v_missing > 0 THEN
    RAISE EXCEPTION '0828-185: % encargo(s) siguen con society_id NULL tras el backfill -- ¿falta la sociedad "Ruizmier Pelaez S.R.L." en public.society?', v_missing;
  END IF;
END $$;

ALTER TABLE public.engagements ALTER COLUMN society_id SET NOT NULL;

-- own_society filtra por society_id en cada llamada del RPC; sin índice, seq-scan sobre
-- `engagements` para cada partner/sqr/director.
CREATE INDEX idx_engagements_society ON public.engagements (society_id);

-- ── §c.5b: manager_id no puede coincidir con specialist_it_id/specialist_tax_id ─────────────
--
-- plan_v0 §5b: una misma persona no debe figurar a la vez como Gerente y como Especialista del
-- mismo encargo. Remediación antes del CHECK: se conserva manager_id (rol jerárquicamente
-- superior en el bloque Equipo) y se limpia el campo de especialista en conflicto.
UPDATE public.engagements
   SET specialist_it_id = NULL
 WHERE manager_id IS NOT NULL AND manager_id = specialist_it_id;

UPDATE public.engagements
   SET specialist_tax_id = NULL
 WHERE manager_id IS NOT NULL AND manager_id = specialist_tax_id;

DO $$
DECLARE v_conflicts integer;
BEGIN
  SELECT count(*) INTO v_conflicts
    FROM public.engagements
   WHERE manager_id IS NOT NULL
     AND (manager_id = specialist_it_id OR manager_id = specialist_tax_id);
  IF v_conflicts > 0 THEN
    RAISE EXCEPTION '0828-185: % encargo(s) siguen con manager_id igual a un campo de especialista tras la remediación', v_conflicts;
  END IF;
END $$;

ALTER TABLE public.engagements
  ADD CONSTRAINT chk_engagements_manager_not_specialist
  CHECK (manager_id IS NULL OR (manager_id IS DISTINCT FROM specialist_it_id AND manager_id IS DISTINCT FROM specialist_tax_id));

COMMENT ON CONSTRAINT chk_engagements_manager_not_specialist ON public.engagements IS 'BUG 0828-185 (plan_v0 §5b): la misma persona no puede ser a la vez manager_id y specialist_it_id/specialist_tax_id del mismo encargo. Validado contra los datos existentes (remediados arriba en esta misma migración), no NOT VALID.';

-- ── §c.5a: ROLE_KEY_TO_GROUPS multi-valor (espejo de src/lib/engagementTeamCandidates.ts) ──
--
-- get_engagement_team_candidates() (0817-180, 20260826221706) mapeaba cada role_key a UN solo
-- candidate_group vía CASE. Decisión del operador (0828-185): amplía el pool de "Socio/
-- Director/SQR" con senior_partner/risk_partner (hoy excluidos del bloque Equipo pese a tener
-- visibilidad firm-wide) y hace que ita_manager/tax_manager -- ya elegibles para Especialista --
-- también aparezcan como candidatos de "Gerente/Supervisor" (un Especialista TI/Impuestos
-- puede además actuar como manager_id de un encargo cualquiera, no solo del suyo propio).
-- Se reemplaza el CASE por un JOIN a una tabla de mapeo (role_key, candidate_group) con DOS filas
-- para ita_manager y para tax_manager -- una fila por (staff, group), la firma de salida no
-- cambia (types.ts:3493 sigue siendo válido).
CREATE OR REPLACE FUNCTION public.get_engagement_team_candidates() RETURNS TABLE(staff_id uuid, display_name text, candidate_group text, practica_id uuid)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT s.staff_id,
         (s.first_name || ' ' || s.last_name)::text AS display_name,
         g.candidate_group,
         s.practica_id
    FROM public.staff s
    -- INNER JOIN: excluye al personal sin cuenta vinculada (staff.auth_user_id es nullable
    -- por diseño) y, junto con el JOIN de mapeo de abajo, a quien tenga role_key NULL o no
    -- elegible. Espejo de src/lib/engagementTeamCandidates.ts (ROLE_KEY_TO_GROUPS); si se
    -- toca uno, tocar el otro.
    JOIN public.user_roles ur          ON ur.user_id  = s.auth_user_id
    JOIN public.authorization_roles ar ON ar.role_key = ur.role_key
    JOIN (VALUES
           ('partner',        'partner_director'),
           ('director',       'partner_director'),
           -- BUG 0828-185: amplía el pool de Socio/Director/SQR -- antes excluidos pese a
           -- visibilidad firm-wide.
           ('senior_partner', 'partner_director'),
           ('risk_partner',   'partner_director'),
           ('manager',        'manager'),
           ('hr_manager',     'manager'),
           ('senior',         'encargado'),
           ('semisenior',     'encargado'),
           -- BUG 0828-185: ita_manager/tax_manager quedan en DOS grupos -- su propia
           -- especialidad y, además, Gerente/Supervisor.
           ('ita_manager',    'specialist_it'),
           ('ita_manager',    'manager'),
           ('ita_senior',     'specialist_it'),
           ('ita_assistant',  'specialist_it'),
           ('tax_manager',    'specialist_tax'),
           ('tax_manager',    'manager'),
           ('tax_senior',     'specialist_tax'),
           ('tax_assistant',  'specialist_tax')
         ) AS g(role_key, candidate_group) ON g.role_key = ur.role_key
   WHERE (public.has_permission('engagement.create')
          OR public.has_permission('engagement.update'))
     AND s.is_active
     AND s.deleted_at IS NULL
     AND ar.is_active
   ORDER BY s.last_name, s.first_name;
$$;

COMMENT ON FUNCTION public.get_engagement_team_candidates() IS 'BUG 0722-162 (actualizado 0817-180 y 0828-185): candidatos elegibles por campo del bloque Equipo del encargo. Agrupa role_key en 5 grupos de candidatura (partner_director, manager, encargado, specialist_it, specialist_tax) vía un mapeo (role_key, candidate_group) que admite MÚLTIPLES grupos por rol -- ita_manager/tax_manager caen en su especialidad Y en manager; senior_partner/risk_partner se agregaron a partner_director. NO expone email, auth_user_id ni el role_key crudo. Gateada por engagement.create OR engagement.update.';

-- ── §c.5a: enforce_engagement_creator_team() -- ita_manager/tax_manager autoasignan manager_id ─
--
-- Espejo de SELF_ASSIGN_MANAGER_ROLE_KEYS en src/lib/engagementSelfAssignment.ts. A diferencia
-- del candidate pool de arriba, el pool de AUTOASIGNACIÓN del campo Socio/Director NO cambia
-- (senior_partner/risk_partner no se autoasignan como partner_id al crear -- solo se suman como
-- candidatos elegibles para que OTRO creador pueda elegirlos).
CREATE OR REPLACE FUNCTION public.enforce_engagement_creator_team() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_role  text;
  v_staff uuid;
BEGIN
  -- Sin identidad autenticada no hay a quién asignar: seeds, imports, migraciones de backfill y
  -- cualquier operación con service_role pasan intactas.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- Espejo EXACTO del `isAdmin` del formulario (`roleKey === "admin"` vía
  -- get_my_authorization_context). A PROPÓSITO no se usa public.is_admin(): esa helper lee el enum
  -- LEGACY `user_roles.role` (20260107032620, nunca redefinida), no `role_key`. Un usuario con
  -- role_key = 'admin' cuyo espejo legacy no diga 'admin' vería su elección reescrita pese a que la
  -- UI se la ofrece editable.
  v_role := public.current_role_key();
  IF v_role IS NULL OR v_role = 'admin' THEN
    RETURN NEW;
  END IF;

  -- Sin staff vinculado no hay `staff_id` que canonizar. Se deja el payload intacto: escribir NULL
  -- en un campo que el negocio considera obligatorio sería peor, y rechazar dejaría al usuario sin
  -- forma de crear nada. Es el mismo criterio fail-open que aplica la UI, que en ese caso tampoco
  -- bloquea el campo.
  v_staff := public.get_my_staff_id();
  IF v_staff IS NULL THEN
    RETURN NEW;
  END IF;

  -- ESPEJO de src/lib/engagementSelfAssignment.ts (SELF_ASSIGN_PARTNER_ROLE_KEYS /
  -- SELF_ASSIGN_MANAGER_ROLE_KEYS). Si se toca uno, tocar el otro.
  --
  -- BUG 0828-185: ita_manager/tax_manager se agregan al campo Gerente/Supervisor -- ya tienen
  -- engagement.create y ya eran candidatos de Especialista; ahora también se autoasignan como
  -- manager_id igual que Gerente/hr_manager. Quedan deliberadamente FUERA del campo Socio/
  -- Director (sin cambios): senior_partner, risk_partner, risk_supervisor, it_security_manager,
  -- accounting_*, hr_analyst, sqr, senior, semisenior y assistant.
  IF v_role IN ('partner', 'director') THEN
    NEW.partner_id := v_staff;
  ELSIF v_role IN ('manager', 'hr_manager', 'ita_manager', 'tax_manager') THEN
    NEW.manager_id := v_staff;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.enforce_engagement_creator_team() IS 'BUG 0810-172 (actualizado 0817-180 y 0828-185): en la CREACIÓN de un encargo canoniza partner_id/manager_id al staff del llamante según su role_key (partner/director -> partner_id; manager/hr_manager/ita_manager/tax_manager -> manager_id). Exentos: role_key admin, inserts sin auth.uid() (seeds/service_role) y llamantes sin staff vinculado. Espejo de src/lib/engagementSelfAssignment.ts. Solo INSERT: el UPDATE no aplica esta regla.';
