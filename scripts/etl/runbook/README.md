# Runbook ETL F1 → F3 (Test y ensayo local)

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
| 30 | `30-f2.sh` | F2: `validate`/`preflight`/`load`/`verify`/`report`, segunda `load` sin cambios, sondeos opcionales (`--probe legacy:N`) | sí |
| 35 | `35-bajas.sh` | Paso manual de las bajas (al 06/11: 151 activas / 16 inactivas, corte 2026-11-06), verificado por SQL contra el journal de F2; frase `APLICAR <n> BAJAS` | sí |
| 40 | `40-f3.sh` | F3 por bloques con acta de aceptación escrita por Marcelo (`ACEPTO <bloque>`); incluye las cuotas facturadas (`--operation invoices`, D19) y, con `--tracking-start <lunes>`, fija `TS_TRACKING_START_DATE` (D24) | sí |
| 50 | `50-reconcile.sh` | `reconcile-legacy` (L1–L8), segunda pasada de F3 con huella md5 de las tablas del lote, resumen sin PII | no (relecturas) |
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
