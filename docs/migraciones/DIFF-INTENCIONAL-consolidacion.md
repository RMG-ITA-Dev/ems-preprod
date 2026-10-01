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

---

## 6. Re-aceptaciones posteriores a la consolidación

El gate `consolidated-replay` corre `supabase start`, que aplica **todas** las migraciones del
directorio — no solo las `cero_*`. Por lo tanto cada migración incremental que toca el esquema
mueve el fingerprint y obliga a re-aceptar `consolidado_renamed_*`. Es la operación normal, no una
excepción: el propio job sube el artifact `route-fingerprint-replay` justamente para eso
(`VERSIONS.md` documenta el procedimiento). El fixture **no** es un contrato de diseño que el
código deba respetar; es la foto del esquema con la que se comparó la consolidación.

Lo que sí es obligatorio es que el diff sea **enteramente explicable**: si aparece un objeto que
nadie agregó a propósito, ahí hay drift real y hay que parar. Por eso cada re-aceptación deja acá
sus hunks.

### 6.1 — 0820-182 (`categories.default_role_key` + `sync_user_role_from_category`)

Re-aceptado desde el artifact del run **34163500139** (`headSha` 2c6ce409, 2026-09-07). Tres de
los seis fixtures gateados divergieron; `catalog_policies`, `catalog_grants` y
`catalog_storage_buckets` quedaron idénticos.

`consolidado_renamed_schema.sql`:

1. `categories.default_role_key text` + su `COMMENT`, el FK a
   `authorization_roles(role_key)` (`ON UPDATE CASCADE ON DELETE SET NULL`) y el
   `CHECK categories_default_role_key_not_admin` — una categoría no puede sugerir `admin`,
   porque eso convertiría un cambio de categoría en escalada de privilegios.
2. `create_category_for_practice` y `update_category_for_practice` ganan
   `p_default_role_key text` (de ahí el cambio de nombre en el encabezado `-- Name: ...` de cada
   una: la firma es parte del identificador). Se hicieron con `DROP` + `CREATE`, no
   `CREATE OR REPLACE`: agregar un parámetro crea una SOBRECARGA y con dos firmas visibles
   PostgREST devuelve `PGRST203`.
3. `copy_categories_between_practices` clona la columna nueva (dos hunks: la lista de columnas
   del `INSERT` y el `SELECT`).
4. `sync_user_role_from_category(uuid, text, text)` — función nueva, `SECURITY DEFINER`, con su
   `COMMENT`. Aplica el rol que la categoría vigente de un staff sugiere, delegando en
   `admin_set_user_role_key` y agregando dos precondiciones atómicas que esa función no tiene:
   nunca degradar a un admin y nunca asignar `admin`.

`consolidado_renamed_catalog_column_grants.txt`: 16 filas nuevas — los 4 privilegios
(`INSERT`/`REFERENCES`/`SELECT`/`UPDATE`) de `categories.default_role_key` para los 4 roles
(`anon`, `authenticated`, `postgres`, `service_role`). Se heredan del `GRANT ALL ON TABLE
public.categories` de `cero_06`; no se otorgaron por columna. Total 9475 → 9491.

`consolidado_renamed_catalog_routine_grants.txt`: las 8 filas de `create/update_category_for_practice`
cambian de firma (ver hunk 2), y se suman 4 filas de `sync_user_role_from_category`. Total
514 → 518.

`consolidado_renamed_catalog.txt` **no** se re-aceptó: no está entre los seis fixtures que el gate
compara, y su diff es ruido de entorno (lista tamaños de tabla, que varían según qué filas insertó
cada corrida).

### 6.2 — 0817-179 (retiro del estado 9 «Congelado»)

Re-aceptado desde el artifact del run **34241633466** (`headSha` bbc92ab0, 2026-09-08), el
primero posterior al merge de `development` que trajo 0820-182 — la re-aceptación previa
(run 33889841095, `headSha` 21575b59) quedó obsoleta con ese merge, porque el fingerprint
pasó a tener que reflejar los dos juegos de migraciones. Solo
`consolidado_renamed_schema.sql` divergió (36 líneas); los otros cinco fixtures gateados quedaron
idénticos — este bug no toca policies, grants ni storage.

Todo el diff proviene de la única migración de la rama,
`20260902120000_0817-179_retire_frozen_engagement_state.sql`:

1. `engagements_state_override_check`: el rango pasa de `1..9` a `1..8`, y el `COMMENT` de
   `engagements.engagement_state_override` se actualiza en consecuencia.
2. `authorize_engagement_state_override()`: desaparece el bloque que era la **única** excepción
   para un no-admin (el Gerente del encargo congelando/descongelando, `null <-> 9`). Retirado el
   estado 9, no queda ningún cambio de override permitido a un no-admin, así que la función cae
   directo al rechazo. Su `COMMENT` se reescribe con esa semántica.
3. Las listas de estados terminales pasan de `(6, 7, 9)` a `(6, 7)` — en el guard de edición de
   fechas y en el `NOT IN` de la vista que deriva el estado.
4. El mensaje de la excepción de fechas deja de nombrar «Congelado».

### 6.3 — Carril A del incidente RLS 2026-09-28 (`user_roles`, su respaldo y `assign_user_role_atomic`)

Re-aceptado desde el artifact del run **36932176260** (`headSha` a9b2fbc5, 2026-10-01, PR #362).
Divergieron exactamente los tres fixtures de grants, con solo filas que desaparecen (−26, −68, −3);
`catalog_policies`, `catalog_storage_buckets` y `consolidado_renamed_schema.sql` quedaron idénticos.

Cambio deliberado de seguridad, no de consolidación: un bloque nuevo de `REVOKE` al final de
`cero_06_grants.sql`, con el mismo mecanismo que §3 (los `GRANT ALL` del dump quedan verbatim y el
estado final se corrige con `REVOKE` explícitos, que también limpian el grant directo del default
de plataforma). Contexto, consumidores verificados y hallazgos: `bugs/seguridad/barrido_plan.md` §5 y
`bugs/seguridad/barrido_report.md` (BAR-001, BAR-004, BAR-007).

Hunks esperados (todos son filas que **desaparecen**; `service_role` y `postgres` no cambian):

1. `consolidado_renamed_catalog_grants.txt`: `user_roles` pierde `DELETE`, `INSERT`, `REFERENCES`,
   `TRIGGER`, `TRUNCATE` y `UPDATE` para `anon` y `authenticated` (conserva `SELECT`);
   `user_roles_backup_0220_56_20260224` pierde todos los privilegios de `anon` y `authenticated`.
2. `consolidado_renamed_catalog_column_grants.txt`: las filas por columna derivadas de esos mismos
   privilegios (`INSERT`/`REFERENCES`/`UPDATE` de `user_roles`; las cuatro de cada columna del
   respaldo) para `anon` y `authenticated`.
3. `consolidado_renamed_catalog_routine_grants.txt`: `assign_user_role_atomic(uuid)` pierde
   `EXECUTE` para `anon`, `authenticated` y `PUBLIC` (en el fixture, `unknown (OID=0)`).

`catalog_policies`, `catalog_storage_buckets` y `schema.sql` no deberían cambiar: no se toca ninguna
política, flag de RLS ni definición. Si el diff del artifact trae algo fuera de esta lista, es drift
real y hay que parar.

Guardia de regresión: `supabase/tests/schema-convergence-assertions.sql`, checks 11 (estos grants) y
12 (compuerta `relrowsecurity` con lista de excepciones).

#### Ambientes que ya aplicaron `cero_06` (Test, Dev 2.0, Lovable)

Editar `cero_06` en su lugar solo protege a un proyecto que la aplique por primera vez (producción
`xcdcxtduotwgwmhxvsiz` nace vacía, y cualquier reset desde cero). `supabase db push` salta las
migraciones ya registradas en `supabase_migrations.schema_migrations`, así que un proyecto vivo que
ya tenga `20251204000006` en su ledger **sigue expuesto** aunque reciba esta rama (hallazgo de review
del PR #362). Se decidió no crear una migración nueva (ver `barrido_plan.md` rev. 3: esos ambientes se
resetean o se corrigen una vez). Para el que **no** se vaya a resetear, correr este bloque una sola
vez en su SQL Editor, verificando antes que el editor abierto es el del `project-ref` correcto:

```sql
-- Carril A, aplicación única en un ambiente ya migrado. Idempotente: repetirlo no cambia nada.
BEGIN;
REVOKE DELETE, INSERT, REFERENCES, TRIGGER, TRUNCATE, UPDATE ON TABLE public.user_roles FROM anon;
REVOKE DELETE, INSERT, REFERENCES, TRIGGER, TRUNCATE, UPDATE ON TABLE public.user_roles FROM authenticated;
REVOKE ALL ON TABLE public.user_roles_backup_0220_56_20260224 FROM anon;
REVOKE ALL ON TABLE public.user_roles_backup_0220_56_20260224 FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.assign_user_role_atomic(p_user_id uuid) FROM PUBLIC, anon, authenticated;
COMMIT;

-- Verificación (solo lectura). Esperado: las cuatro primeras columnas en false,
-- user_roles_select en true para ambos roles y service_role_ok en true.
SELECT r.rol,
       has_table_privilege(r.rol, 'public.user_roles', 'INSERT')
         OR has_table_privilege(r.rol, 'public.user_roles', 'UPDATE')
         OR has_table_privilege(r.rol, 'public.user_roles', 'DELETE')
         OR has_table_privilege(r.rol, 'public.user_roles', 'TRUNCATE')            AS user_roles_escritura,
       has_any_column_privilege(r.rol, 'public.user_roles', 'INSERT, UPDATE')   AS user_roles_escritura_columna,
       has_table_privilege(r.rol, 'public.user_roles_backup_0220_56_20260224',
                           'SELECT, INSERT, UPDATE, DELETE, TRUNCATE')            AS respaldo_acceso,
       has_function_privilege(r.rol, 'public.assign_user_role_atomic(uuid)', 'EXECUTE') AS assign_execute,
       has_table_privilege(r.rol, 'public.user_roles', 'SELECT')                  AS user_roles_select,
       has_table_privilege('service_role', 'public.user_roles', 'INSERT')
         AND has_function_privilege('service_role', 'public.assign_user_role_atomic(uuid)', 'EXECUTE') AS service_role_ok
  FROM (VALUES ('anon'), ('authenticated')) r(rol);
```

Reversión exacta, solo si el bloque rompe un flujo legítimo (restaura la exposición; registrar el
motivo en `bugs/seguridad/barrido_report.md` §3 antes de correrla):

```sql
BEGIN;
GRANT ALL ON TABLE public.user_roles TO anon, authenticated;
GRANT ALL ON TABLE public.user_roles_backup_0220_56_20260224 TO anon, authenticated;
GRANT ALL ON FUNCTION public.assign_user_role_atomic(p_user_id uuid) TO anon, authenticated;
COMMIT;
```

La reversión no devuelve el `EXECUTE` a `PUBLIC`: no lo necesita ningún consumidor y, con
`anon`/`authenticated` restaurados, el comportamiento previo queda igual para la Data API.
