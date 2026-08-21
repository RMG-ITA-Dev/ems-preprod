# Legado de la consolidación — migración cero

> Documento vivo, iniciado en Fase 1 (PR-1) y completado en Fase 2 (PR-2) de
> `bugs/migracion_cero/plan_v2.md`. Registra todo lo que el set consolidado de
> `supabase/migrations/*_cero_*.sql` no puede expresar por sí solo — la evidencia de que
> nada se perdió al reemplazar las 184 migraciones originales por el set consolidado.

## 1. Operaciones sobre datos no capturables por dump (`DISABLE TRIGGER`)

_Pendiente — se completa en Fase 2 (§2.3 del plan)._

## 2. Validaciones fail-fast (`DO $$ ... RAISE EXCEPTION`)

_Pendiente — se completa en Fase 2 (§2.3 del plan)._

## 3. Cadena del incidente ADM

_Pendiente — resumen de §5 del informe de consolidación (`bugs/migracion_cero/informe_consolidacion.md`)
con la semántica nueva de `is_system`. Se completa en Fase 2._

## 4. Drift positivo capturado de Dev 2.0 (ausente de las 184 migraciones)

_Pendiente — `staff.target_utilization_percent` (§0.5.6 del plan). Se completa en Fase 2._
