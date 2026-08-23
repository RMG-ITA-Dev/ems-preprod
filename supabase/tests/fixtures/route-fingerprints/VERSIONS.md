# Versiones — fixtures de fingerprint

Estos fixtures son sensibles a la versión exacta del stack que los capturó (formato de
`pg_dump`, imagen de Postgres, esquema de GoTrue). Subir cualquiera de estas versiones es un
cambio deliberado que implica re-capturar y re-aceptar los fixtures — nunca un drift silencioso
(plan §2.5.a.2).

| Herramienta | Versión | Capturada el |
|---|---|---|
| Supabase CLI | `2.100.1` | 2026-08-21 (`baseline_184_*`), 2026-08-22/23 (`consolidado_renamed_*`, Fase 3 rename) |
| Imagen `supabase/postgres` | `17.6.1.121` (`PostgreSQL 17.6 on x86_64-pc-linux-gnu`) | ídem |
| Imagen `supabase/storage-api` | `v1.69.0` | ídem |
| Node.js | `v25.8.2` | ambiente de autoría |
| npm | `11.12.1` | ambiente de autoría |

El workflow `consolidated-replay` (`.github/workflows/scheduler-fase2-integrity.yml`) pinea
`supabase/setup-cli@v1` a `version: 2.100.1` — nunca `version: latest` — para que el runner de
CI reproduzca este mismo stack. `postgresql-client-17` (el `pg_dump` del lado del runner, para que
coincida con el servidor 17.6) se mantiene tal como estaba en el job `route-parity` anterior.
