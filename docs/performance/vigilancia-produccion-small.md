# Vigilancia de producción en Small: alarmas, umbrales y criterio para subir a Medium

**Estado:** propuesta basada en la campaña de carga k6 sobre producción (Etapas 4–9, 18–26/10/2026). **Los umbrales son una propuesta: se calibran con los datos reales de la primera semana.**
**Para quién:** quien opera EMS en producción (Supabase, proyecto `xcdcxtduotwgwmhxvsiz`, cómputo Small) durante las primeras semanas.
**Marcas:** **VERIFICADO** (medido en la campaña), **INFERIDO** (deducido, no medido), **VERIFICAR** (dato de Supabase que hay que confirmar en su documentación o panel).

---

## 1. Decisión y por qué

**Salir en Small y vigilar las primeras semanas; subir a Medium solo si se cumple un criterio objetivo (§4).** Medium cuesta unas 5 veces más; Small es suficiente para la carga esperada según lo medido.

Lo medido, con la firma (admin y senior_partner) a un ritmo realista (`portfolio_overview` 0,4/min):

| Prueba | Carga | Resultado en Small |
|---|---|---|
| S2 | 128 usuarios, 60 min de meseta, mezcla completa con escrituras | 0 × 57014, 0 × 5xx de la base, sin degradación (3.º/1.º ≤ 1,06×), memoria máx. ~2,4 GB de 2,89 GB, swap ≈ 0 |
| S3 | 170 usuarios, meseta de 18 min, mezcla completa | 0 × 57014, 0 × 5xx, memoria máx. ~2,35 GB, swap 0 |

Se esperan unos 140 usuarios, la mayoría asistentes, semiseniors y seniors cargando horas: es la parte barata (lecturas p95 ~0,4 s, escrituras p95 ~0,3 s). Lo caro lo hacen pocas personas.

**Lo que la campaña NO cubre (por eso se vigila):**
- Cada condición se probó **una sola vez** (la Pasada 2 de repetición se omitió: riesgo aceptado y firmado por el operador el 26/10/2026, informe de la Etapa 9, §17).
- Las pruebas son carga **sostenida** (18–60 min), no ráfagas (todos entrando el lunes a primera hora, envíos de fin de semana o de mes).
- Las pruebas corrieron con los **crones de envío pausados y el correo apagado**. En vivo, el correo (Microsoft Graph) y los crones (Railway) corren **como servicios externos**, fuera del alcance de la campaña k6 y de este documento; lo que hagan contra la misma base suma carga (INFERIDO) y por eso se vigila desde la base (§3.4). Son el principal factor nuevo de las primeras semanas. **Estado verificado el 27/10:** los 8 crones de `pg_cron` que envían avisos, correos y cierran timers colgados siguen **inactivos** (estaban activos el 18/10); si el servicio externo no los repone, el síntoma es funcional (sin recordatorios ni correos, timers sin cerrar), no de rendimiento (H-9-22).
- La meseta de S3 fue de solo 18 min; en S2 el máximo de memoria llegó entre los 39 y 45 min de meseta.

---

## 2. Línea base medida (lo «normal» en Small)

| Métrica | En reposo | Con carga (S2/S3) | Fuente de la medida |
|---|---|---|---|
| Memoria comprometida (capacidad 2,89 GB) | ~1,35 GB (tras reiniciar) | 1,9–2,4 GB | Observability → Database |
| Swap | 0 | 0 (un escalón pequeño en S2, sin cifra) | Observability → Database |
| CPU de la base | < 5 % | 10–30 % | Observability → Database |
| Conexiones | no medido en reposo | 13–24 de 90 | consulta a `pg_stat_activity` |
| Consulta activa más larga | — | 1–5 s | consulta a `pg_stat_activity` |
| `portfolio_overview` (admin / senior_partner) | — | 3,5–5 s por llamada, máx. 5,4 s | API Gateway |
| Dashboards de gerentes, socios (`dash_cartera`) | — | ~0,3–0,6 s | API Gateway |
| Lecturas pesadas (p95) | — | ~2 s | k6 |
| Scheduler (p95 con 128–170 usuarios) | — | 5,8–7,7 s (REVISAR conocido) | k6 |
| Errores esperados en el API Gateway | — | solo 400/403 por reglas (RLS, `NOT_OWNER`, etc.) | API Gateway |

La campaña también midió que el límite de `statement_timeout` de la API es de 8 s (un 57014 es una consulta cancelada por ese límite).

---

## 3. Alarmas y umbrales

«Aviso» = revisar el mismo día. «Crítico» = actuar ahora (§5). Todos los umbrales son propuestas.

### 3.1 Base de datos (Observability → Database)

| Métrica | Aviso | Crítico | Por qué |
|---|---|---|---|
| Memoria comprometida | ≥ 2,5 GB durante 10 min | ≥ 2,7 GB (con 2,89 GB de capacidad plena, un reinicio por falta de memoria es posible: INFERIDO) | Pico medido 2,4 GB; el margen hasta el tope es ~0,4 GB |
| Swap | > 50 MB | > 300 MB y subiendo | En las pruebas fue ≈ 0; en S (la corrida que falló) subió junto con la memoria |
| CPU de la base | > 60 % durante 10 min | > 80 % durante 3 min | Medido 10–30 % |
| Conexiones activas | > 60 de 90 | > 80 de 90 | Medido máx. 24 |
| Consulta activa más larga | > 8 s | > 20 s | El límite de la API es 8 s |

### 3.2 API Gateway y Postgres (logs)

| Señal | Aviso | Crítico | Qué significa |
|---|---|---|---|
| Errores 5xx | cualquiera | > 1 % de las solicitudes de 5 min | En las pruebas hubo 0 (salvo 2 `BOOT_ERROR` de Edge en S2) |
| Código 57014 (consulta cancelada por `statement_timeout`) | 1 en 10 min | ≥ 2 en 10 min | Fue lo que cortó la prueba S; apunta a `portfolio_overview` |
| `portfolio_overview` por llamada | > 6 s | > 8 s (se cancela) | Medido 3,5–5,4 s |
| 429 (límite de tasa) o fallos de renovación de sesión | cualquiera | repetidos | Límite de Auth: 150 renovaciones por 5 min por IP (INFERIDO para usuarios en la misma oficina) |
| Errores 400/403 esperados | no alarmar | — | Son las reglas funcionando (`NOT_OWNER`, RLS, `WEEKLY_MIN_NOT_MET`...). Alarmar solo si **cambian de volumen** de golpe |

### 3.3 Edge Functions y Auth

| Señal | Aviso | Crítico |
|---|---|---|
| 503 `BOOT_ERROR` («Function failed to start») | cualquiera | > 5 en 10 min |
| Duración del Scheduler | p95 > 10 s | cualquier llamada > 20 s |
| Errores de login (`secure-signin`) | > 2 % | > 10 % |

### 3.4 Correos y crones (servicios EXTERNOS: Microsoft Graph y Railway; solo se vigila su efecto en la base)

| Señal | Aviso | Crítico |
|---|---|---|
| Cola de correos `pending` sin bajar | creciendo más de 1 h | creciendo más de 4 h |
| Correos con `attempts` > 0 o errores del proveedor (Graph) | cualquiera | repetidos |
| Un trabajo externo (Railway) que dura más de lo normal o se solapa | cualquiera | memoria o CPU de la base suben al ejecutarse |

**Fuera de alcance:** el diseño, la activación y la supervisión de los crones (Railway) y del envío de correo (Microsoft Graph) los llevan quienes operan esos servicios; esta vigilancia solo observa su efecto en la base (cola `pending`, memoria, CPU, conexiones). **Recomendación para esos equipos:** poner en marcha los trabajos **de uno en uno**, con un día entre cada uno, mirando memoria y CPU de la base antes y después; no activarlos todos el mismo día.

### 3.5 Cómo recibir los avisos

- **Hoy se puede hacer a mano:** abrir Observability → Database cada hora en horario laboral la primera semana, y los logs de API Gateway una vez al día.
- **Alarma automática (VERIFICAR):** Supabase ofrece formas de exportar métricas y logs (por ejemplo un endpoint de métricas del proyecto o drenaje de logs). **Hay que confirmar en su documentación qué incluye el plan actual** antes de montarlo. Si no hay alarma nativa, un script programado que consulte la base y envíe correo cubre los umbrales de §3.1 y §3.2 (conexiones, consultas largas, errores). La memoria y el swap del panel no se consultan desde SQL: para esos dos, la fuente es el panel o la API de métricas.

Consultas útiles (solo lectura):

```sql
-- conexiones por estado
select state, count(*) from pg_stat_activity group by state order by 2 desc;
-- consultas activas más largas
select pid, now() - query_start as duracion, left(query, 100) as consulta
from pg_stat_activity where state = 'active' and pid <> pg_backend_pid()
order by 2 desc limit 10;
```

---

## 4. Criterio para subir a Medium (decidirlo de antemano)

Subir a Medium si ocurre **cualquiera** de estos casos, confirmado en dos días distintos:

1. Memoria comprometida ≥ 2,6 GB sostenida 10 min, **dos veces**, con la carga normal.
2. Swap > 100 MB y subiendo, en cualquier momento.
3. Un 57014 de `portfolio_overview` con el uso normal de la firma (no con un abuso puntual).
4. Un reinicio de la base por falta de memoria (no por mantenimiento).
5. CPU > 80 % durante 3 min con regularidad en el horario normal.

No subir solo por: el Scheduler lento (es código: se corrige con la región fija, §6), por los 400/403 esperados, ni por un único pico aislado.
**Procedimiento (VERIFICAR en Supabase):** el cambio de tamaño del cómputo implica una breve interrupción; hacerlo fuera de horario y avisar a los usuarios. Medir antes y después con la misma vista del panel.

---

## 5. Qué hacer ante cada alarma

| Alarma | Primero revisar | Acción |
|---|---|---|
| Memoria o swap altos | ¿Hay un trabajo externo (Railway) corriendo? ¿Alguien abrió `portfolio_overview` muchas veces? Consultas activas largas | Pedir a quien opera Railway que pause el trabajo más reciente; si sigue, aplicar §4 |
| 57014 | Qué ruta (logs de API Gateway): casi seguro `portfolio_overview` con alcance de firma | Avisar a quien lo abre; es la RPC que hay que optimizar (§6) |
| CPU alta | Consultas activas; trabajo externo o correo masivo | Pausar la tarea externa; si es carga de usuarios, §4 |
| 503 `BOOT_ERROR` | Frecuencia; si coincide con ráfagas | Reintento del cliente absorbe uno aislado; si se repite, reportar a Supabase |
| 429 / renovaciones fallidas | Cuántos usuarios por IP | Escalonar el inicio de sesión o contactar a Supabase |
| Correos acumulados | Proveedor (Graph) y el trabajo externo que envía | Pausar el trabajo externo; revisar credenciales y límites |

---

## 6. Qué hacer antes de salir (no depende de Small o Medium)

1. **Paginar las respuestas de 1.000 filas** (hallazgo H-4-02): es una corrección de datos; hoy, por ejemplo, la pantalla de aprobaciones de la firma ve 1.000 de 3.869 filas.
2. **Fijar la región del Scheduler en `us-west-2`** (corrección A de H-4-01): baja su latencia 3,5–4× según las mediciones; lo mismo para `secure-signin` (H-4-03, −1,45 s por login).
3. **Optimizar `portfolio_overview` para el alcance de la firma** (3,5–5 s): pocas personas la abren, pero es la única ruta que llegó a 8 s.
4. **Montar las alarmas de §3** y probarlas (provocando una a propósito en un ambiente de prueba).
5. **Pasada 2 de la campaña: omitida por decisión del operador (26/10/2026), no es un requisito de salida.** Repetirla sería una prueba nueva, con aprobación y preparación propias: las cuentas y el seed de k6 ya se retiraron en el cierre, así que habría que reconstruirlos y volver a escribir datos de prueba en producción. Mientras tanto, la vigilancia de §3 cubre el riesgo de que los resultados hayan sido una sola corrida afortunada.

---

## 7. Plan de vigilancia

| Cuándo | Qué mirar | Quién |
|---|---|---|
| Día de salida | Panel Database cada 30 min en horario laboral; logs de API Gateway al cierre; sin trabajos externos nuevos ese día | operador |
| Días 2–7 | Panel cada hora en los picos (inicio del día, cierre de semana); revisar el resumen de errores cada mañana; activar un trabajo externo por día (lo coordinan quienes operan Railway) | operador |
| Semanas 2–4 | Una revisión diaria de los 5 indicadores (memoria, swap, CPU, 57014, 5xx); revisar los picos de fin de semana y de fin de mes | operador |
| Al final del primer mes | Decidir: seguir en Small, subir a Medium, o ajustar umbrales con los datos reales | operador + responsable técnico |

Registrar cada día el pico de memoria comprometida y la hora: con 2–3 semanas de datos se ve la tendencia real y se calibran los umbrales de §3.

---

## 7b. Riesgo: el volumen de datos de las pruebas no es el volumen real

**Pregunta del operador (26/10):** ¿el volumen sembrado en xcdc es comparable a la carga real? **Respuesta: comparable en orden de magnitud, parcialmente conservador y NO idéntico; no está confirmado que lo medido se mantenga con los datos reales.** Por eso queda como riesgo.

| Dato | Sembrado en xcdc (VERIFICADO el 26/10) | Real (legacy, perfilado del .bak; VERIFICADO) | Lectura |
|---|---|---|---|
| Horas (`time_entries`) | 95.715 | 138.546 (`EjecucionHoras`) | **La prueba tuvo ~31 % menos horas** que el legacy (el real tiene ~45 % más): no es conservador en este dato |
| Clientes | 272 | 267 | equivalente |
| OT / encargos | 1.003 OT y 1.015 encargos | 609 OT (`OrdenTrabajoCliente`) | **La prueba tuvo más OT** (~65 % más): conservador para los dashboards de firma, cuyo costo crece con los encargos visibles (~3,5 ms por encargo en `portfolio_overview`) |
| Personas | 211 cuentas cargando horas todo el año (170 certificables) | ~133 con horas hoy, pico 170; 272 usuarios en el legacy | conservador en actividad |
| Líneas de aprobación | 38.831 | 138.546 (`AprobacionHoras`, otra granularidad) | no comparable 1 a 1 |
| Tamaño de la base | **121 MB** | — | cabe entera en memoria |

**Lo que se infiere (INFERIDO):**
- Con una base de ~121 MB, el volumen **no es el motor de la memoria**: lo es la concurrencia (conexiones y procesos). Añadir ~45 % de horas cambia poco el uso de memoria, pero sí el **costo de las consultas que recorren horas** (listados, aprobaciones, dashboards por persona).
- La **forma** de los datos reales (encargos gigantes, textos largos, concentración de horas en pocas personas y semanas de cierre) no se reprodujo: la siembra usa los mismos promedios por persona-semana (media 8,6, mediana 6, p90 17, igual que el legacy) pero distribución sintética.
- **No se midió** ninguna ruta con datos reales: todas las latencias de la campaña son sobre datos sembrados.

**Mitigación (barata):**
1. **`ANALYZE`** justo después de cargar los datos reales (con estadísticas viejas, la consulta de selección del lanzador tardó 16,6 s: H-9-17).
2. **Una medición corta, solo de lectura,** de las rutas pesadas con los datos reales **antes de abrir el sistema a todos**: `portfolio_overview` de admin y senior_partner, W01 y aprobaciones de la firma, y una pantalla de horas de un asistente. Compararla con la línea base de la §2 (3,5–5 s para `portfolio_overview`; ~0,4 s para lecturas livianas). Si alguna ruta se desvía más de ~2×, tratarlo como aviso de la §3.
3. Mantener las alarmas de la §3 durante las primeras semanas, que es justo la etapa en que el volumen real se hace visible.

## 8. Reservas abiertas de la campaña (para no olvidarlas)

- Cifra exacta del swap en S2 (un escalón pequeño; no se leyó en MB).
- Causa de los 2 `BOOT_ERROR` de Edge Functions en S2 (no se revisó el log de Edge).
- Causa de la caída de memoria de 2,4 a 1,9 GB en S2 a las 14:35 (sin rastro en el log de Postgres).
- Una sola corrida por condición; la meseta de 170 usuarios fue de 18 min.
- Scheduler en REVISAR en todas las pruebas (p95 5,8–7,7 s con 128–170 usuarios).
- Las estadísticas de las cuentas de prueba están desactualizadas (hallazgo H-9-17): se corrige con un ANALYZE al cerrar la campaña.

Fuente completa: `bugs/tests/k6/produccion/etapa9/informe_etapa9.md` (no versionado; ver también `docs/seguridad/registro-seguridad-produccion.md`).
