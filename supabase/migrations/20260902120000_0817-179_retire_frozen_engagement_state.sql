-- BUG 0817-179 (bugs/0817-179/plan_v2.md): retira el estado 9 Congelado de la máquina de estados
-- del encargo. Queda una máquina de 8 estados (1..8) y el CHECK de la columna hace el 9
-- inalcanzable — borrar el enum en TypeScript solo lo esconde: sin narrowear el constraint, un 9
-- escrito por REST/SQL se renderizaría como Aprobado y cargable (isValidState lo rechaza y el
-- estado cae al derivado de la OT).
--
-- Orden obligatorio: el backfill va ANTES del constraint, porque ADD CONSTRAINT valida las filas
-- existentes y abortaría si quedara un 9. Idempotente de punta a punta: se puede re-pegar en el
-- SQL Editor tras una aplicación parcial.
--
-- El toggle de congelar/descongelar del Gerente ya se había retirado de la UI en 0722-157; acá se
-- elimina la rama del trigger que se lo permitía en BD (código muerto desde entonces).

-- 1. Backfill defensivo: los encargos Congelados vuelven a colgar del estado derivado de la OT
--    (inverso exacto de congelar). Si su end_date ya pasó, el trigger recompute_engagement_
--    finalization los mueve solo a 7 Finalizado en este mismo UPDATE, que es el destino correcto.
--    No-op en una BD vacía; imprescindible en cualquier ambiente que sí tenga filas con 9.
UPDATE public.engagements
   SET engagement_state_override = NULL
 WHERE engagement_state_override = 9;

-- 2. Guard del estado: se cae la rama del Gerente (null<->9) y el bloqueo de fechas pasa a 6/7.
CREATE OR REPLACE FUNCTION public.authorize_engagement_state_override() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  -- Sistema (cron/service_role/definer sin sesión): sin auth.uid() → permitir.
  if auth.uid() is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.engagement_state_override is not null and not public.is_admin() then
      raise exception 'No autorizado a fijar el estado del encargo';
    end if;
    return new;
  end if;

  -- Decisión A: bloqueo server-side de edición de fechas por no-admin cuando el
  -- estado actual es terminal (override 6/7). Se evalúa aunque el override no
  -- cambie. 0817-179: el 9 salió de la lista junto con el estado.
  if not public.is_admin()
     and old.engagement_state_override in (6, 7)
     and (
       new.start_date    is distinct from old.start_date
       or new.end_date   is distinct from old.end_date
       or new.fecha_cierre is distinct from old.fecha_cierre
     )
  then
    raise exception 'No autorizado a editar fechas de un encargo Cancelado/Finalizado';
  end if;

  -- UPDATE: validación del override solo si cambia.
  if new.engagement_state_override is not distinct from old.engagement_state_override then
    return new;
  end if;

  if public.is_admin() then
    return new;
  end if;

  -- 0817-179: acá vivía la única excepción para no-admin (Gerente DEL encargo congelando o
  -- descongelando, null<->9). Retirado el estado 9, no queda ningún cambio de override
  -- permitido a un no-admin, así que se cae directo al rechazo.
  raise exception 'No autorizado a cambiar el estado del encargo (override)';
end;
$$;

COMMENT ON FUNCTION public.authorize_engagement_state_override() IS 'Guard del estado del encargo. Admin: control total. No-admin: no puede fijar ni cambiar el override, ni editar fechas de un encargo Cancelado/Finalizado (6/7). BUG 0817-179: se retiró el estado 9 Congelado y con él la excepción de congelar/descongelar del Gerente.';

-- 3. Escrituras de asignaciones: terminales pasan a ser solo 6/7.
CREATE OR REPLACE FUNCTION public.engagement_accepts_assignment_writes(p_engagement_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT COALESCE(
    (SELECT engagement_state_override NOT IN (6, 7)
       FROM public.engagements
      WHERE engagement_id = p_engagement_id),
    true)  -- override NULL (estado derivado 1..5/8) o engagement inexistente ⇒ escribible
$$;

-- 4. El CHECK es la garantía real: sin esto el estado no queda retirado, solo oculto.
ALTER TABLE public.engagements DROP CONSTRAINT IF EXISTS engagements_state_override_check;
ALTER TABLE public.engagements
  ADD CONSTRAINT engagements_state_override_check
  CHECK (((engagement_state_override IS NULL) OR ((engagement_state_override >= 1) AND (engagement_state_override <= 8))));

COMMENT ON COLUMN public.engagements.engagement_state_override IS 'FEAT 0602-135: override manual del estado del encargo (1..8). NULL = derivado de la OT. 6 Cancelado / 7 Finalizado son terminales; 7 lo escribe el cron finalize-engagements. BUG 0817-179: el 9 Congelado se retiró del sistema.';
