-- Migración cero — Fase 4 (plan §4.1/§4.2, decisión §0.1): seed de holidays 2026-2027.
-- Fuente de verdad: src/lib/boliviaHolidays.ts — getBoliviaNationalHolidays(año), con
-- traslado dominical. Estas 26 filas son EXACTAMENTE su salida (verificado corriendo el
-- generador: 13 filas/año = 11 nacionales oficina=0 + La Paz oficina=1 + Santa Cruz
-- oficina=2) — no se re-derivan a mano, se transcriben del resultado real del algoritmo.
--
-- Extras del catálogo maestro (datos_maestros.md): 2 "Feriado adicional (puente)"
-- (2026-06-05, 2026-08-07) no vienen del generador. Decisión del operador (2026-08-23):
-- se siembran renombradas a "Puente (Adicional)" — cumple el patrón protegido de sufijo
-- "(Adicional)" exigido por §0.1, así NATIONAL_HOLIDAY_NAMES nunca las puede colisionar
-- ni el botón "Generar" las toca.
--
-- La función public.seed_initial_holidays(uuid) vive ahora donde la regla del repositorio
-- (docs/operations.md, «Edit migrations in place») pone cada cosa: la función en cero_02 y sus permisos
-- (REVOKE de PUBLIC, anon, authenticated y service_role) al final de cero_06. Este archivo conserva el
-- contrato documentado y es un paso sin cambios: no siembra filas ni declara objetos.
--
-- ETL fase 1 (bugs/ETL/carga/fase1/plan_v2.md F1-M07): el INSERT con CROSS JOIN a la ficha fija de
-- cero_14 se sustituye por la función public.seed_initial_holidays(uuid). Una instalación nueva
-- NO tiene ningún feriado hasta que la consola de fase 1 la ejecuta con el administrador ya
-- confirmado; el CROSS JOIN contra un staff inexistente habría omitido las 28 filas en silencio.
--
-- Contrato:
--   * LANGUAGE plpgsql, SECURITY INVOKER, search_path = public. Ejecutable SOLO por el propietario
--     de las migraciones (conexión SQL del operador): se revoca de PUBLIC, anon, authenticated y
--     service_role. Una función que escribe feriados a nombre de otra persona no se expone por API.
--   * Valida que p_created_by sea un staff activo, no borrado, enlazado a Auth y con rol efectivo admin.
--   * Compara las filas existentes con el catálogo y el autor esperado ANTES de aceptar una
--     reanudación: un feriado con la misma (fecha, oficina) pero nombre o autor distinto aborta toda
--     la llamada, sin sobrescribir nada.
--   * Inserta solo los faltantes; una repetición correcta no modifica ninguna fila.
--   * Comprueba el conjunto esperado completo y devuelve 28.

DO $$
BEGIN
  RAISE NOTICE 'cero_15: sin feriados sembrados; usar scripts/etl/fase1.mjs initialize (public.seed_initial_holidays, definida en cero_02)';
END
$$;
