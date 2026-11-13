# Runbook ETL F1 → F3 (Test y ensayo local)

**D41 (12/11/2026), Parte I implementada (13/11/2026, sin ejecutar aún sobre un ensayo completo):** las horas se importan como historia nativa aprobada: un `timesheet_periods` cerrado por persona y lunes (`is_period_locked`, `submitted_at` técnico = instante de importación, `import_batch`/`imported_at` solo ahí), las entradas con `period_id` y una línea `timesheet_line_approvals` `approved` por período+encargo+actividad con el aprobador y la fecha reales del legacy (archivo lateral `202611061600_horas_aprobaciones.csv`; NULL si no hay evidencia). La carga la hace `public.import_historic_timesheets` (solo la sesión propietaria, atómica, sin avisos ni correos). **Origen, manifiesto y contrato son tres cosas distintas:** el origen sigue siendo `TimeControlDB_20261106_1600`; el manifiesto variante es `scripts/etl/snapshots/TimeControlDB_20261106_1600_d41.json` (contrato `D41`, lote `legacy:TimeControlDB_20261106_1600:d41`); no es otra base del legacy. Para correr con D41 se usan los configs `fase{2,3}.local-v4.config.json`, `INPUTS_BASELINE=inputs-v3-d41.sha256` y un run-id nuevo (los journals de `v3a` guardan el SHA del manifiesto anterior y NO se reanudan con el variante). `reconcile-legacy` exige 28 controles con D41 (L8a–L8h) y 25 con el contrato anterior; la huella L9 incorpora períodos y líneas por clave natural y solo compara baselines del mismo contrato. Guía de ensayo: `bugs/ETL/carga/fase4/planes/d41_horas_aprobadas_ems.md`.

**Alcance vigente:** Parte I = migración aprobada/cerrada con procedencia persistente en BD (implementada, ver arriba). Parte II = protección permanente, restricciones de reversión/desbloqueo y corte de registro/envío; NO se implementa aquí y el operador la gestiona directamente.

Scripts que encadenan las tres consolas (`fase1.mjs`, `fase2.mjs`, `fase3.mjs`) con el reset, el paso manual
de bajas, las verificaciones y la conciliación contra el legacy. Plan: `bugs/ETL/carga/fase4/plan_v1.md`.
Destinos: `--env local` (ensayo E1) y `--env test` (ref fijo `slkqdcwwvmjtcbakajib`). **No existe destino de
producción**: su ref está vetado y la consola F3 lo rechaza.

Se ejecutan en **Git Bash** (el `bash` de PowerShell puede ser el de WSL), en **una sola terminal** para toda la
corrida.

| Paso | Script | Qué hace | Escribe |
|---|---|---|---|
| 00 | `00-preflight.sh` | Rama, commit subido, 61 migraciones, coherencia del ref, estado actual, huellas de los CSV, `validate` offline de F2/F3 | no |
| 10 | `10-reset.sh` | Reset desde cero y verificación `preinit` (test: `reset-desde-cero.sh`; local: `supabase db reset --local`) | **borra todo** |
| 11 | `11-recover-reset.sh` | Solo Test, solo si el 10 cayó en el hallazgo §6.1: DROP de la secuencia suelta, `db push`, borrado de Auth, verificación | sí |
| 15 | `15-crones.sh` | **Pausa verificada** de los crones `notif-%` (D24): los pausa con la frase `PAUSAR CRONES`, verifica que ninguno quede activo y **no** los reactiva (los correos salen por Railway después de la migración) | sí |
| 20 | `20-f1.sh` | F1: `preflight`/`initialize`/`verify`, `verify-seed`, `verify-auth-bootstrap`, segunda `initialize` sin cambios | sí |
| 30 | `30-f2.sh` | F2: `validate`/`preflight`/`load`, **`contain-emails`** (D40: deja como no entregables los correos `auth.role.changed` que encolan los roles de F2 y exige 0 pendientes), `verify`/`report`, segunda `load` sin cambios, sondeos opcionales (`--probe legacy:N`) | sí |
| 35 | `35-bajas.sh` | Paso manual de las bajas (al 06/11: 151 activas / 16 inactivas, corte 2026-11-06), verificado por SQL contra el journal de F2; frase `APLICAR <n> BAJAS` | sí |
| 40 | `40-f3.sh` | F3 por bloques con acta de aceptación escrita por Marcelo (`ACEPTO <bloque>`); incluye las cuotas facturadas (`--operation invoices`, D19) y, con `--tracking-start <lunes>`, fija `TS_TRACKING_START_DATE` (D24) | sí |
| 50 | `50-reconcile.sh` | `reconcile-legacy` (contrato anterior: **25 controles**; contrato D41: **28**, con L8a–L8h de períodos, cierre/procedencia, líneas aprobadas, entradas vinculadas, sumas y ausencia de avisos), segunda pasada de F3 con huella md5 de las tablas del lote y L9 (huella por clave natural) contra un baseline del mismo snapshot, resumen sin PII | no (relecturas) |
| — | `run.sh` | Encadena los pasos con una pausa `SIGUE` entre cada uno | según paso |

```bash
# Ensayo local (E1): sin pausas de aceptación; usa las credenciales de `supabase status`
export ADMIN_TEMP_PASSWORD='<≥ 12 caracteres, solo de ensayo>'
bash scripts/etl/runbook/run.sh --env local --run-id e1 --yes-local --from 00 --to 50

# Test: cada paso pide sin eco lo que necesita; nada se guarda ni se imprime
bash scripts/etl/runbook/00-preflight.sh --env test --run-id 0001
bash scripts/etl/runbook/run.sh --env test --run-id 0001 --from 10 --to 50
```

## Reglas

- **Credenciales:** solo por prompt sin eco (o ya exportadas en la misma terminal): `SUPABASE_DB_URL` (Session
  pooler, puerto 5432), `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_TEMP_PASSWORD`. Nunca por el chat, argv ni archivos.
  `--dry-run` oculta cualquier valor con `PASSWORD`, `KEY`, `SECRET` o `_URL`.
- **`--dry-run` es limitado:** omite las escrituras (`rb_etl_mut`), pero los `verify`, `report` y `preflight` posteriores siguen
  leyendo el estado real y fallan (`BLOQUEADO`) si la carga anterior no existe. Sirve para ver qué ejecutaría un paso contra un
  destino ya cargado; **no** previsualiza una corrida completa sobre una base vacía. Las cargas reales no lo usan.
- **Declaraciones humanas en Test:** `VENTANA <ref>` (ventana exclusiva, registro público cerrado,
  `MAIL_ENABLED=false`, respaldo restaurable), `DROP fund_request_number_seq`, `APLICAR 8 BAJAS`,
  `ACEPTO <bloque>`. No hay opción para saltárselas en Test; `--yes-local` solo existe en local.
- **Configuraciones privadas:** se generan en `scripts/etl/fase<N>.<env>-<run>.config.json` (ignoradas por Git)
  desde las configuraciones locales de ensayo, que traen las rutas de los CSV. En Test las `expectations` de F2
  se eliminan (no se pueden alterar). La de F3 se genera tras F1, con el administrador bootstrap como actor técnico.
- **Estado y registros** fuera del repositorio: `C:\ems-etl-state\<env>-<run>\{f1,f2,f3,logs}`. Use un `--run-id`
  nuevo para cada instalación nueva (un journal pertenece a un único proyecto e instalación).
- **Reanudación:** cada paso se puede repetir; las consolas retoman desde su journal. Un `BLOQUEADO` (exit 2) o
  `RECONCILIACION_REQUERIDA` (exit 3) detiene la corrida: no se reintenta a ciegas.
- **No crear migraciones:** si el pre-vuelo ve un número de migraciones distinto de 61, se detiene y se avisa a Marcelo.
- **Entradas con otra versión de los CSV (v3):** exporte en cada paso `BASE_F2_CONFIG` y `BASE_F3_CONFIG` (si faltan, el runbook lee el manifiesto del 23/10) e `INPUTS_BASELINE` (huellas de los CSV para el pre-vuelo); no use un `--run-id` que coincida con el nombre de una configuración base (`v3`).
- **L9 (paso 50):** el baseline por defecto (`bugs/ETL/carga/fase4/fingerprint-baseline.json`) es de una versión anterior y nunca se sobrescribe. Para comparar o registrar, indique el archivo con `ETL_BASELINE_FINGERPRINT`. `--record-fingerprint-baseline` exige esa ruta y rechaza un destino que ya existe. Un baseline de otro snapshot o sin snapshot declarado detiene el paso («baseline INCOMPATIBLE», exit 4 de `compare-fingerprints`); si el baseline no existe, local avisa «L9 NO SE COMPARÓ» y Test bloquea.
- **Correos de los encargos (contención anticipada):** los encargos encolan `engagement.created` y `*_assigned` desde su carga. `40-f3.sh` ejecuta SIEMPRE, antes de matrices y también al reanudar desde ese bloque, `fase3 load --block administrative-engagements --operation contain-engagement-emails`: marca `failed` (`ETL_F3_NO_DELIVERY`) los pendientes de los 262 encargos y exige 0 restantes y 0 enviados. No depende de ninguna marca del journal (relee la base), es repetible y deja su evidencia en `journal.earlyEmailContainment` (clave propia: `journal.evidence` lo reemplaza `validate()` y `units["work-orders"]` está vedado: si se creara sin `workOrderHash`, `loadWorkOrders` bloquearía). La contención de `work-orders` sigue después, para los correos de las etapas siguientes.
- **Cambiar el manifiesto con un journal ya creado:** F2 y F3 guardan el SHA-256 del manifiesto y bloquean si cambia. Un journal sin efectos (solo `VALIDADO`) puede archivarse a mano; uno con efectos exige un `--run-id` nuevo.

## Hallazgos del código que el runbook compensa

- El `verify` de F2 devuelve siempre `PENDIENTE_CAMBIO_MANUAL`; no detecta `APLICADO` ni exporta `bajas.json`.
  El paso 35 verifica por SQL y toma las 8 fichas del journal. No se repite `fase2 load` después de ese paso.
- El `verify` de F3 solo inventaría períodos, aprobaciones y cola de correo; la conciliación de contenido es
  `reconcile-legacy` (paso 50).
- Los pagos se cargan en una sola transacción de 124 OT: mida su duración en el ensayo local antes de Test.
- La contención de correo es posterior a la creación y se invoca desde el paso 40 (idempotente).

## Medido en el ensayo E1 (31/10/2026, local)

- **Reanudación:** el paso 40 omite lo que el journal ya marca como completado. Repetir la creación de OT, las
  matrices o los pagos con la carga avanzada falla cerrado (la consola exige OT en `Draft`; «OT ambigua», «falta o
  cambió evidencia persistida», «precondición de ajuste») sin escribir nada. Un paso interrumpido sin marca sí se repite.
- **Segunda pasada (paso 50):** solo se repiten las operaciones medidas como no-op (clientes, administrativos,
  sincronización, gastos, riesgos, contención de correos y horas); la huella md5 de las tablas debe quedar idéntica.
- **Tiempos locales:** F1 ≈ 8 s · F2 ≈ 2 min · F3 ≈ 3 min (pagos ≈ 2 s en una sola transacción).
- Resultado completo y defectos corregidos: `bugs/ETL/carga/fase4/plan_v1.md`, «E1: resultado».

## Entradas v2 (03/11/2026)

Las configuraciones base locales (`scripts/etl/fase2.local.config.json` y `fase3.local.config.json`, ignoradas por Git) apuntan a
los CSV corregidos de `Docs/carga/v2/`: `legacy_worked_at` es el día trabajado (la fecha de registro viaja en
`legacy_registered_at`), el inicio del encargo es la menor fecha entre la creación y la primera hora trabajada y las horas en
feriado aplicable se cargan como excepción histórica. `bugs/ETL/carga/fase4/inputs.sha256` y `fingerprint-baseline.json` son los
de esa versión; los de la primera carga quedaron como `*-v1`.
