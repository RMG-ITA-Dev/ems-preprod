#!/usr/bin/env bash
# Captures a schema + catalog fingerprint of a local Supabase stack, so Rutas A/B/C of
# bugs/scheduler/fase_2/plan_v2.md can be diffed against each other (the parity gate that is
# Fase 2's central acceptance criterion). Run once per route, right after that route's migrations
# have finished applying (`supabase migration list` clean, `db push --dry-run` with 0 pending) and
# BEFORE resetting the stack for the next route — the fingerprint is the only thing that survives
# the reset.
#
# Usage:
#   supabase/tests/local/capture-route-fingerprint.sh <prefix>
#   e.g. capture-route-fingerprint.sh ruta_a
#        capture-route-fingerprint.sh ruta_b
#        capture-route-fingerprint.sh ruta_c
#
# Writes 7 files to supabase/tests/fixtures/route-fingerprints/<prefix>_*:
#   <prefix>_schema.sql                  pg_dump --schema-only (DDL, no owners/privileges)
#   <prefix>_catalog.txt                 \d+ (relation listing)
#   <prefix>_catalog_policies.txt        pg_policies (public, storage, auth schemas)
#   <prefix>_catalog_grants.txt          information_schema.role_table_grants (public, storage, auth)
#   <prefix>_catalog_column_grants.txt   information_schema.column_privileges (public, storage, auth)
#   <prefix>_catalog_routine_grants.txt  function ACLs by signature, from pg_proc/aclexplode
#   <prefix>_catalog_storage_buckets.txt storage.buckets rows (data, invisible to a schema-only dump)
#
# Coverage note (2026-08-21): the dump itself already covers auth/storage schemas (no schema
# filter on pg_dump), but policies/grants used to be filtered to `public` only — invisible blind
# spots were storage.objects policies, the column-level grants behind staff's PII hardening
# (20260730080000, 20260806000000, 0810-173), function EXECUTE ACLs, and storage.buckets config
# rows. All widened/added below so the consolidation can't silently drop any of those controls.
#
# DB_URL defaults to the standard local Supabase Docker stack; override to point at a different
# disposable stack (e.g. a Ruta C worktree using the same project_id/containers).
#
# Deliberately uses each tool's own file-output flag (`pg_dump -f`, `psql -o`) instead of shell
# redirection (`>`) — redirecting a native process's stdout through PowerShell reinterprets/corrupts
# the encoding (confirmed 2026-07-29: UTF-16 garbage from `psql -c "..." > file` on Windows). `-f`/`-o`
# write UTF-8 straight to disk regardless of the calling shell.
#
# Diffing two <prefix>_schema.sql files for the parity gate: ignore the `\restrict`/`\unrestrict`
# lines (first and last line of the dump). pg_dump 18 wraps every dump in a matching random token
# pair as a safety feature — it differs on every invocation even against an identical, unchanged
# schema (confirmed 2026-07-29: two captures back-to-back against the same DB were byte-identical
# except for that token pair). A real parity diff should skip those two lines, e.g.
# `diff <(tail -n +6 a_schema.sql) <(tail -n +6 b_schema.sql)` adjusted to also drop the trailing
# `\unrestrict` line.

set -euo pipefail

PREFIX="${1:?Usage: $0 <prefix> (e.g. ruta_a, ruta_b, ruta_c)}"
DB_URL="${DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)/tests/fixtures/route-fingerprints"
mkdir -p "$OUT_DIR"

pg_dump "$DB_URL" --schema-only --no-owner --no-privileges -f "$OUT_DIR/${PREFIX}_schema.sql"

psql "$DB_URL" -o "$OUT_DIR/${PREFIX}_catalog.txt" -c "\d+"

psql "$DB_URL" -o "$OUT_DIR/${PREFIX}_catalog_policies.txt" -c "
  SELECT schemaname, tablename, policyname, cmd, qual, with_check
    FROM pg_policies
   WHERE schemaname IN ('public','storage','auth')
   ORDER BY schemaname, tablename, policyname;
"

psql "$DB_URL" -o "$OUT_DIR/${PREFIX}_catalog_grants.txt" -c "
  SELECT table_schema, grantee, table_name, privilege_type
    FROM information_schema.role_table_grants
   WHERE table_schema IN ('public','storage','auth')
   ORDER BY table_schema, table_name, grantee, privilege_type;
"

psql "$DB_URL" -o "$OUT_DIR/${PREFIX}_catalog_column_grants.txt" -c "
  SELECT grantee, table_schema, table_name, column_name, privilege_type
    FROM information_schema.column_privileges
   WHERE table_schema IN ('public','storage','auth')
   ORDER BY table_schema, table_name, column_name, grantee, privilege_type;
"

psql "$DB_URL" -o "$OUT_DIR/${PREFIX}_catalog_routine_grants.txt" -c "
  SELECT n.nspname, p.proname,
         pg_get_function_identity_arguments(p.oid) AS args,
         pg_get_userbyid(a.grantee) AS grantee, a.privilege_type
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    CROSS JOIN LATERAL aclexplode(p.proacl) a
   WHERE n.nspname IN ('public','storage','auth')
   ORDER BY 1, 2, 3, 4, 5;
"

psql "$DB_URL" -o "$OUT_DIR/${PREFIX}_catalog_storage_buckets.txt" -c "
  SELECT id, name, public, file_size_limit, allowed_mime_types
    FROM storage.buckets
   ORDER BY id;
"

echo "Fingerprint '$PREFIX' captured in $OUT_DIR:"
ls -la "$OUT_DIR/${PREFIX}"_*
