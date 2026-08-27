# Versiones — fixtures de fingerprint

Estos fixtures son sensibles a la versión exacta del stack que los capturó (formato de
`pg_dump`, imagen de Postgres, esquema de GoTrue). Subir cualquiera de estas versiones es un
cambio deliberado que implica re-capturar y re-aceptar los fixtures — nunca un drift silencioso
(plan §2.5.a.2).

| Herramienta | Versión | Capturada el |
|---|---|---|
| Supabase CLI | `2.100.1` | 2026-08-21 (`baseline_184_*`), 2026-08-22/23 (captura local descartada), 2026-08-24 (`consolidado_renamed_*` vigente, vía runner de CI), 2026-08-25 (`consolidado_renamed_schema.sql` re-aceptado, vía runner de CI, 0825-183) |
| Imagen `supabase/postgres` | `17.6` (server), `pg_dump 17.11 (Ubuntu 17.11-1.pgdg24.04+2)` | 2026-08-24 |
| Node.js | `v25.8.2` | ambiente de autoría (baseline_184 solamente) |
| npm | `11.12.1` | ambiente de autoría (baseline_184 solamente) |

El workflow `consolidated-replay` (`.github/workflows/scheduler-fase2-integrity.yml`) pinea
`supabase/setup-cli@v1` a `version: 2.100.1` — nunca `version: latest` — para que el runner de
CI reproduzca este mismo stack. `postgresql-client-17` (el `pg_dump` del lado del runner, para que
coincida con el servidor 17.6) se mantiene tal como estaba en el job `route-parity` anterior.

**Hallazgo real (2026-08-24):** un Docker local (Windows) con la misma versión de CLI pineada
(`2.100.1`) no reproduce de forma confiable el mismo estado de plataforma que el runner de GitHub
Actions — se observaron diffs en objetos que no dependemos ni tocamos (extensión `pg_graphql`
habilitada vs. stub "not enabled", cuerpo de `storage.foldername`/`filename`/`extension`/
`get_size_by_bucket` con formato distinto, columna `auth.custom_oauth_providers.custom_claims_allowlist`)
incluso después de purgar todas las imágenes cacheadas y forzar un `supabase start` limpio. Ninguno
de estos diffs tocó `cero_01`..`cero_16` ni el rename de Fase 3. Por eso, desde esta fecha,
`consolidado_renamed_*` se recaptura **directamente desde el artifact `route-fingerprint-replay`
que el propio job `consolidated-replay` sube en cada run** (nunca desde una réplica local) —
bajar el artifact del run de referencia y copiar `replay_<name>.<ext>` sobre
`consolidado_renamed_<name>.<ext>` es la única vía soportada para re-aceptar este fixture.
