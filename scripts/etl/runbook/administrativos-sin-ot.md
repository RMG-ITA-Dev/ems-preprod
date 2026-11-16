# Administrativos aprobados sin OT — 16/11/2026

Preparación sobre `feat/ETL`, HEAD inicial `54bc26d4c25dc3dddfd6d182fe6114a98ba96e1d`. Árbol inicialmente limpio. No se detectaron cambios pendientes ajenos; los issues de roles/sociedades siguen fuera de este cambio.

Durante el cierre aparecieron cambios paralelos de tasa de impuesto: `WorkOrderForm`, `Settings`, páginas de OT y `WorksheetEdit`, más `taxRate.ts` y sus pruebas. Se conservaron, sin atribuirlos a esta corrección. Las traducciones EN/ES también contienen aportes de ambos trabajos; este cambio aporta las ayudas de aprobación/OT administrativa, los avisos de candado y las etiquetas de aprobación migrada; la validación de tasa es del trabajo paralelo.

## Decisión vigente del operador

Marcelo confirmó en esta sesión: todas las OT administrativas seleccionadas del legacy ya están aprobadas. Los **107 encargos administrativos se importan aprobados, sin una OT EMS y sin exigir una nueva aprobación del socio**. Esta decisión sustituye la alternativa de importarlos pendientes.

La aprobación importada tiene `partner_approval_status='approved'` y procedencia `partner_approval_legacy_source='legacy:TimeControlDB_20261106_1600:<COT>'`. **No se fabrican firmante, fecha ni motivo**: `partner_approval_decided_by`, `partner_approval_decided_at` y `partner_approval_reason` quedan NULL. La interfaz identifica esta aprobación como migrada. `approval_required=true` se conserva: habilitar el encargo no aprueba sus líneas de horas.

Un encargo nuevo creado en EMS conserva el flujo normal: nace pendiente, el socio asignado decide por RPC y después puede admitir horas. Un encargo que requiere OT conserva su flujo de aprobación de OT. No se crean matrices, presupuestos, planes ni OT ficticias para los 107 administrativos.

## Implementación

- Las últimas definiciones de `check_wo_approved`, `engagement_allows_hours_or_requests` y `list_loggable_engagements` aceptan un no-Cliente sin OT únicamente con aprobación del encargo. Pendiente/rechazado/NULL no pasan aunque tengan override 4/5/7. Se conserva el control de estados, estado activo y fechas; Finalizado solo admite carga dentro de su rango, con aprobación previa y fecha final.
- Hoja de Tiempo, Tracker y carga manual usan el mismo selector. Tracker incorpora administrativos aprobados; el hook verifica también la aprobación recibida. Al decidir/re-enviar se invalidan las tres cachés. El servidor controla además creación/cambio de encargo o fecha de timers no-Cliente sin OT; detener un timer existente sigue permitido y exportarlo vuelve a validar las horas.
- Los estados efectivos TS, sus dos copias Scheduler y SQL impiden presentar un override 4/5 como aprobación de un no-Cliente sin OT todavía pendiente/rechazado.
- Fondos conserva OT real aprobada, controles de estado, sociedad y alcance, tanto al seleccionar como al asignar y enviar. La aprobación del encargo sin OT no habilita fondos.
- F3 crea por `authenticated` con el administrador técnico, con todos los controles de responsables existentes. Dentro de la **misma transacción**, la conexión propietaria importa la aprobación solo de los IDs recién creados con procedencia administrativa. No se agrega una RPC ni un permiso API para hacerlo. El pedido transitorio de aprobación generado por el alta normal se retira para esos IDs antes del COMMIT; los demás avisos mantienen su contención habitual.
- La columna de procedencia tiene CHECK y protección contra escritura API, incluso admin. El INSERT normal no puede inyectarla. La relectura F3 exige la aprobación y procedencia esperadas, sin firmante/fecha EMS. La procedencia participa en el hash durable del payload: no reanudar journals anteriores con este código.
- Preflight exige la columna, la función de control, el contrato del selector y el trigger de timers actualizados. Contar versiones de migración no demuestra ese contrato.

Se editaron las migraciones existentes: `cero_02`, `cero_04`, selector `20260831013000`, estado efectivo `20260915130000` y portafolio administrativo `20261012180000`. No se creó otra migración. `types.ts` sigue sin regenerarse, por decisión del operador.

## Conciliación y huellas

- Nuevo **L1c**: todos los administrativos del journal deben estar aprobados con procedencia legacy, sin OT, con aprobación de líneas habilitada y sin firmante/fecha EMS. La relectura del bloque controla la referencia exacta por respaldo/COT.
- El conjunto administrativo de **L9 versión 2** incluye aprobación, procedencia y ausencia de firma/fecha EMS. Una L9 versión 1 es incompatible; no se reinterpreta ni sobrescribe. Solo se calcularon huellas de fixtures en memoria durante las pruebas, sin registrar un sello de ensayo.
- La cantidad base de controles pasa de 25 a 26 (contrato anterior de horas), y de 28 a 29 (D41). `legacy-agreed-total-v1` agrega L6g/L6h: **31 controles** con D41 en la configuración vigente.
- Ningún CSV ni configuración privada base cambia por esta corrección: **13/13 SHA-256 verificados** contra `inputs-v3-d41-secretaria.sha256`. F2 mantiene la variante de Karina `secretariat_head`; F3 mantiene el contrato financiero `legacy-agreed-total-v1`.
- Los datos y el sello original de `lt01`, incluidos los tres períodos vacíos de pruebas manuales, se conservan. No se ejecutó conciliación nueva sobre ese ensayo con un esquema diferente ni se registró L9.

## Pruebas y límites

PostgreSQL 17 descartable, contenedor `ems-admin-no-wo-tests-20261116`, puerto exclusivo `127.0.0.1:55439`, base `ems_rls_test_admin_no_wo`. Se reprodujo el esquema del arnés con las migraciones actuales, sin tocar el contenedor/base de `lt01`. El arnés usa shim Auth y catálogos de prueba; no equivale a un ensayo completo Supabase ni prueba Auth/Storage reales de `cero_07`.

- 62 suites SQL/RLS/contratos, incluido D41 y adaptador Node real. Cobertura nueva: pendiente/rechazado/NULL, overrides 4/5/7, aprobación real del socio, aprobación importada sin firma, rango de fechas, estados cancelado/finalizado, timers, fuente protegida contra API admin, envío de horas pendiente y aprobación por `manager_id`, ausencia de elegibilidad de fondos, relectura y reversión atómica de un lote con responsable inválido.
- Vitest seleccionado: 441 aprobadas, 9 omitidas. Incluye ETL, estados y paridad Scheduler, selectores de las tres pantallas, ficha de aprobación y flujo de importación Tracker.
- Build correcto; ESLint de archivos modificados correcto. TypeScript mantiene **110 errores en HEAD y 110 actuales, cero diagnósticos nuevos**, comparados con el compilador y un overlay de lectura en memoria, sin revertir archivos. Los tipos generados permanecen pendientes.
- Sin nuevas consultas de dashboard ni imports lazy. No se midió Network antes/después: no se conectó el frontend a un proyecto remoto ni se modificó el ensayo para medirlo. El revisor con acceso al ambiente actualizado debe observar los selectores y dashboards consumidores; no se declara evidencia de Network que no se capturó.
- CI `consolidated-replay` y aceptación de fingerprints de rutas quedan para el operador después de revisión/PR, a partir del artefacto CI, nunca de una recaptura local.

## Pendientes antes de ejecutar F3 o Test

1. Integrar y comprobar los issues de Director como gerente de Cliente, aprobadores entre sociedades y elegibilidad de `risk_partner`. En el HEAD auditado siguen las restricciones que incompatibilizan las 51 asignaciones señaladas (16 + 28 + 7). **F3 no se declara ejecutable sobre los datos reales** por estas pruebas con responsables válidos de fixture. No se cambian responsables ni sociedades para sortearlas.
2. Revisión de este cambio, regeneración final de tipos cuando Marcelo lo disponga, commit/push/CI por el operador. Ninguno se ejecutó en esta sesión.
3. Autorizar aparte una corrida completa nueva con esquema actualizado y run-id nuevo. No reanudar `lt01`. Mantener crones pausados y la contención de correos; los conteos de notificaciones pueden diferir por los roles y aprobaciones nuevas.
4. Verificar L1c=107, 31 controles de la configuración vigente, los 155 totales/414 cuotas y D41, y probar manualmente Hoja de Tiempo, Tracker, carga manual y fondos. Solo registrar una nueva L9 v2 tras orden expresa, con ruta nueva. Nunca sobrescribir la anterior.

Comandos de referencia para Marcelo, **solo después de integrar los issues y autorizar otro ensayo** (Git Bash; no ejecutados como carga aquí):

```bash
export BASE_F2_CONFIG=scripts/etl/fase2.local-v5-secretaria.config.json
export BASE_F3_CONFIG=scripts/etl/fase3.local-v6-total-legacy.config.json
export INPUTS_BASELINE=bugs/ETL/carga/fase4/inputs-v3-d41-secretaria.sha256

# Sustituir NUEVO_ID por un identificador nuevo. 00 es lectura/validación.
bash scripts/etl/runbook/00-preflight.sh --env local --run-id NUEVO_ID
# 10 borra el destino local: requiere autorización nueva y respaldo verificado.
bash scripts/etl/runbook/run.sh --env local --run-id NUEVO_ID --yes-local --from 10 --to 50
```

Los comandos de migración/reset los ejecuta Marcelo acompañado por el agente. No se inicia Test, otra carga completa, ni registro de L9 desde esta corrección.
