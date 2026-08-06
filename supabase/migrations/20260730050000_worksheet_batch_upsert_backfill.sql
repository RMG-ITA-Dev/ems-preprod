-- =====================================================================
-- FIX: crear batch_upsert_worksheet_cells, que quedó sin aplicar
--
-- Síntoma: al guardar/crear una matriz de trabajo, el frontend recibe
--   PGRST202 "Could not find the function
--   public.batch_upsert_worksheet_cells(p_cells, p_worksheet_id)"
-- y no se puede guardar NINGUNA matriz, para ningún rol.
--
-- Causa: la función se definió en la sección 4 de
-- 20260719000000_0714_154_worksheet_service_scope.sql, pero esa sección se
-- AGREGÓ AL ARCHIVO DESPUÉS de que la migración ya estaba aplicada (el propio
-- comentario del archivo la atribuye a "review.md iteración 10"). Como el
-- tracker de migraciones ya considera ese archivo aplicado, la sección nueva
-- nunca corrió y "Apply pending migrations" la sigue salteando.
--
-- Verificado en la base afectada:
--   - trg_enforce_worksheet_cell_service_scope  -> EXISTE (secciones 1-3 OK)
--   - enforce_worksheet_cell_service_scope      -> EXISTE
--   - batch_upsert_worksheet_cells              -> FALTA  (solo la sección 4)
-- Por eso esto va como migración de cola y no re-aplicando el archivo viejo:
-- así el tracker la toma en TODOS los entornos, que arrastran el mismo hueco.
--
-- El cuerpo es idéntico al de la sección 4 original. No se toca nada más de esa
-- migración (limpieza de datos y trigger ya están aplicados y correctos).
-- Idempotente (create or replace).
-- =====================================================================

-- ATOMIC BATCH UPSERT: borra + reinserta las celdas de una matriz en UNA
-- transacción. Antes el frontend hacía delete y insert como dos requests
-- separados (dos transacciones): si el trigger de alcance rechazaba el insert,
-- el delete quedaba commiteado y se perdía la matriz entera por una sola celda
-- inválida. Envolver ambos pasos acá hace que un insert rechazado revierta
-- también su propio delete.
--
-- La autorización replica las policies RLS que esta función (SECURITY DEFINER)
-- puentea — "Team can manage worksheet cells" / "Admins can manage worksheet
-- cells" de 20260107032620: el llamador debe ser miembro del equipo del encargo
-- o admin.
create or replace function public.batch_upsert_worksheet_cells(
  p_worksheet_id uuid,
  p_cells        jsonb
) returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_engagement_id uuid;
begin
  select engagement_id into v_engagement_id
    from public.activity_worksheets
   where id = p_worksheet_id;

  if v_engagement_id is null then
    raise exception 'Worksheet not found: %', p_worksheet_id;
  end if;

  if not (public.is_admin() or public.is_engagement_team_member(v_engagement_id)) then
    raise exception 'Permission denied: not a team member of this engagement'
      using errcode = 'insufficient_privilege';
  end if;

  delete from public.activity_worksheet_cells where worksheet_id = p_worksheet_id;

  insert into public.activity_worksheet_cells (worksheet_id, category_id, activity_id, budget_hours)
  select
    p_worksheet_id,
    (elem->>'category_id')::uuid,
    (elem->>'activity_id')::uuid,
    (elem->>'budget_hours')::numeric
  from jsonb_array_elements(p_cells) as elem
  where (elem->>'budget_hours')::numeric > 0;
end;
$$;

revoke all on function public.batch_upsert_worksheet_cells(uuid, jsonb) from public;
grant execute on function public.batch_upsert_worksheet_cells(uuid, jsonb) to authenticated;

-- =====================================================================
-- VALIDACIÓN
--
--   -- Debe devolver 1 fila con la firma (p_worksheet_id uuid, p_cells jsonb)
--   select proname, pg_get_function_identity_arguments(oid) as firma
--   from pg_proc
--   where pronamespace = 'public'::regnamespace
--     and proname = 'batch_upsert_worksheet_cells';
--
--   -- Si el frontend siguiera con PGRST202 tras aplicar, recargar la caché:
--   -- notify pgrst, 'reload schema';
--
--   -- En la app: abrir una matriz de trabajo, cargar horas y guardar.
-- =====================================================================
