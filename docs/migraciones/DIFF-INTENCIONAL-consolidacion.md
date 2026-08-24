# Diff intencional — consolidación (Fase 2)

> Documenta, hunk por hunk, cada diferencia aceptada entre el fingerprint `baseline_184_*`
> (184 migraciones + `preseed-development-gaps.sh`, capturado 2026-08-21) y `consolidado_*`
> (los 7 archivos `cero_01`..`cero_07`, capturado 2026-08-22/23). Criterio de aceptación:
> `bugs/migracion_cero/plan_v2.md` §2.6.5. Cualquier diff fuera de esta lista es una regresión.

## 1. `schema.sql` — cambios deliberados de diseño (§2.2 del plan)

Los únicos hunks de DDL/función admisibles, todos derivados de §5 y §7.11 del informe de
consolidación más el drift positivo de §0.5.6:

1. **`activity_codes.service_id` pasa de `NOT NULL` a nullable**, con
   `is_system boolean NOT NULL DEFAULT false` agregado y
   `CHECK (is_system OR service_id IS NOT NULL)` reemplazando el `NOT NULL` simple.
2. **`create_service_activity`, `deactivate_service_activity`, `reactivate_service_activity`,
   `reorder_service_activity`**: los tres últimos pierden el guard por regex de
   `20260820120000` ("Activity code % predates the ordinal scheme...") — ya no puede dispararse
   porque el diseño `is_system` hace que la fila `ADM` nunca entre al `JOIN ... USING
   (service_id)` que alimenta esas consultas (`service_id IS NULL` no matchea nada). Los 3
   agregan `AND ac.is_system = false` explícito por claridad/defensa, y `create_service_activity`
   reescribe el comentario de su cálculo de ordinal para reflejar la semántica nueva en vez de
   listar los 8 códigos legacy por nombre.
3. **`staff.target_utilization_percent numeric NOT NULL DEFAULT 85`** — drift positivo capturado
   de Dev 2.0 real (§0.5.6): existe ahí y en `types.ts`, pero ninguna de las 184 migraciones lo
   crea, así que el baseline del replay local nunca pudo verlo.
4. **`authorization_roles.legacy_app_role`** — mismo tipo de drift que el punto anterior,
   encontrado tarde (2026-08-24, probando `admin_set_user_role_key()` en Test después de la
   migración cero): ninguna de las 184 migraciones ni el fixture de CI
   (`supabase/tests/local/40-fixture-rbac-catalog.sql`) poblaban esta columna al insertar los
   23 roles — quedaba `NULL` para todos, lo que hace que `admin_set_user_role_key()` devuelva
   `ROLE_NOT_MAPPED` para cualquier rol elegido (bug funcional real, no solo diff de
   fingerprint: rompe el cambio de rol de usuarios en cualquier ambiente reseteado con el set
   consolidado). El valor real vive en Dev 2.0 (verificado por el operador con `SELECT
   role_key, legacy_app_role FROM authorization_roles`) y se agregó al `INSERT` de
   `cero_13_seed_authorization_rbac.sql` y al fixture de CI, ambos con los 23 valores reales
   de Dev 2.0.

`enforce_activity_default()` **no tiene hunk**: su cuerpo final (post-`20260719000000`) ya no
menciona "actividad global legacy" en ningún comentario — esa redacción quedó superada por una
`CREATE OR REPLACE` posterior antes de llegar al estado baseline, así que no había nada que
corregir.

## 2. `schema.sql` — ruido de entorno filtrado, no es un hunk real

**Particiones diarias de `realtime.messages_YYYY_MM_DD`** (y sus `TABLE ATTACH`/`CONSTRAINT`
asociados): Supabase Realtime crea/rota estas tablas por calendario, fuera del control de
cualquier migración de la app. `baseline_184` se capturó el 2026-08-21; `consolidado`, dos días
después — los nombres de partición corridos en el tiempo son la única diferencia. Se excluyen del
diff con `grep -vE 'messages_[0-9]{4}_[0-9]{2}_[0-9]{2}'` en ambos lados antes de comparar. No
requiere ninguna corrección: es indistinguible de comparar el mismo esquema capturado en dos días
distintos.

## 3. `catalog_grants.txt` / `catalog_column_grants.txt` / `catalog_routine_grants.txt` —
## corrección de grants heredados del bootstrap de plataforma

**Hallazgo de verificación** (no estaba en la lista original de hunks admisibles del plan; se
descubrió, se investigó a fondo con `pg_default_acl`, y se corrigió antes de aceptar el gate):

El bootstrap de Supabase (`roles.sql`, corre en cada `supabase start`/`db reset`, antes de
cualquier migración) fija `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON
TABLES/FUNCTIONS/SEQUENCES TO postgres, anon, authenticated, service_role` — **toda tabla,
vista o función nueva hereda ALL para `anon`/`authenticated` en el momento de crearse**, salvo
que algo lo revoque explícitamente después. El historial real de 184 migraciones fue revocando
esto tabla por tabla y función por función a medida que se hardenizaban partes del sistema (login
lockout, RBAC, PII de `staff`, Scheduler). `pg_dump` reconstruye el estado final comparando
contra los *privilegios iniciales* del objeto (`pg_init_privs`) — como esas tablas/funciones ya
nacieron con el default angosto en la línea de tiempo real, sus init-privileges YA eran angostos,
y por eso el dump no necesita emitir ningún REVOKE explícito para ellas: coinciden con su propio
init. Al recrear todo en una sola sesión nueva (`CREATE TABLE`/`CREATE FUNCTION` de una sola
pasada), el default angosto de esa "línea de tiempo" no existe — el bootstrap sigue siendo el
amplio original — así que cada objeto nuevo hereda ALL para anon/authenticated de verdad, y el
dump del *estado nuevo* sí necesitaría mostrarlo (cosa que confirmamos comparando contra
`baseline_184_catalog_grants.txt`, que no tiene ninguna de esas filas).

Corrección aplicada en `cero_06_grants.sql`, en dos bloques:

- **14 combinaciones (tabla/vista, rol)** con `REVOKE` explícito de los privilegios extra
  detectados (`auth_login_attempts`, `engagement_assignments`, `user_lifecycle_audit_log`,
  `staff` — SELECT de tabla en favor de los grants por columna ya presentes, `vw_staffing_alerts`,
  `vw_actual_hours_by_category_activity`, `vw_budget_vs_actual_hours_by_category_activity`,
  `vw_wo_budget_hours_by_category`, `vw_wo_budget_hours_by_category_activity`,
  `wo_staffing_requirement_skills`, `wo_staffing_requirements`).
- **19 funciones** con `REVOKE EXECUTE` explícito para `anon`/`authenticated`/`service_role` —
  el `REVOKE ... FROM PUBLIC` que ya traían esas funciones (verbatim del historial) solo revoca
  lo heredado por membresía `PUBLIC`, nunca un `GRANT` directo a un rol nombrado como el que fija
  el default de plataforma.

**Orden crítico descubierto durante la verificación**: el `REVOKE SELECT ON TABLE public.staff
FROM authenticated` debía ir **antes** de los 20 `GRANT SELECT(columna) ... TO authenticated`
del hardening PII (no después) — un `REVOKE` de un privilegio a nivel de tabla borra también
cualquier privilegio del mismo tipo ya otorgado a nivel de columna para ese rol, verificado
empíricamente contra el stack local antes de fijar el orden final.

Tras la corrección: `catalog_grants.txt` y `catalog_routine_grants.txt` — diff vacío.
`catalog_column_grants.txt` — diff vacío salvo las filas de `is_system`/
`target_utilization_percent` (columnas nuevas, ausentes en baseline por diseño, ver §1).
`catalog_policies.txt` y `catalog_storage_buckets.txt` — diff vacío desde la primera captura.

## 4. Ausencia notable: `ALTER DEFAULT PRIVILEGES` de 6 statements NO incluidos

`dump_full_baseline.sql` incluye 6 bloques `Type: DEFAULT ACL; Schema: public` (`FOR ROLE
postgres`/`FOR ROLE supabase_admin`, sobre SEQUENCES/FUNCTIONS/TABLES, granando a los 4 roles).
**No pasan al set consolidado**: son el mismo bootstrap de plataforma descrito en §3 — ya activo
antes de que corra cualquier migración nuestra, idéntico en cualquier ambiente nuevo — y
aplicarlos como el rol que ejecuta las migraciones falla con `permission denied to change
default privileges` para los de `FOR ROLE supabase_admin`. Detalle completo en
`docs/migraciones/legado-consolidacion.md` §0.

## 5. Ruido de plataforma entre el runner de CI y un Docker local (Fase 3+, no es un hunk de las migraciones)

Documentado originalmente solo en `supabase/tests/fixtures/route-fingerprints/VERSIONS.md`
("Hallazgo real", 2026-08-24) — se traslada aquí por consistencia con el resto de este
documento (hallazgo de review de PR #310: todo diff aceptado debe quedar registrado acá, no
solo en `VERSIONS.md`, para cumplir plan §2.6.6).

Al comparar `consolidado_renamed_*` (capturado localmente) contra el replay real del job
`consolidated-replay` corriendo en un runner de GitHub Actions, aparecieron 3 diffs que no
tocan ningún `cero_01`..`cero_16` ni el rename de Fase 3 — son ruido de la imagen/versión de
plataforma entre un Docker local (Windows) y el runner real, aun pineando la misma versión del
Supabase CLI (`2.100.1`):

1. **`pg_graphql`**: habilitada en el runner real, aparece como stub "not enabled" en el Docker
   local.
2. **Funciones de Storage** (`storage.foldername`, `storage.filename`, `storage.extension`,
   `storage.get_size_by_bucket`): cuerpo con formato de texto distinto entre plataformas (mismo
   comportamiento, texto fuente diferente).
3. **`auth.custom_oauth_providers.custom_claims_allowlist`**: columna presente en el runner
   real, ausente en el Docker local reproducido.

Un Docker local con la misma versión de CLI pineada no reprodujo el estado del runner real ni
purgando todas las imágenes cacheadas y forzando un `supabase start` limpio — es una diferencia
de la plataforma subyacente (imagen de Postgres/GoTrue del runner de GitHub Actions vs. Docker
Desktop local), no de las migraciones de este set. Por eso, desde 2026-08-24,
`consolidado_renamed_*` se recaptura directamente desde el artifact `route-fingerprint-replay`
que el propio job sube en cada corrida (nunca desde una réplica local) — ver `VERSIONS.md` para
el procedimiento de re-aceptación.
