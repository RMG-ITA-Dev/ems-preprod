

# Plan v1 -- Move CHANGELOG files to docs/changelogs/

## Objective

Relocate all 9 CHANGELOG files from `docs/` into a new `docs/changelogs/` subdirectory for better organization.

## Files to Move

| Current Path | New Path |
|---|---|
| `docs/CHANGELOG-2026-01-30.md` | `docs/changelogs/CHANGELOG-2026-01-30.md` |
| `docs/CHANGELOG-2026-02-06.md` | `docs/changelogs/CHANGELOG-2026-02-06.md` |
| `docs/CHANGELOG-2026-02-11.md` | `docs/changelogs/CHANGELOG-2026-02-11.md` |
| `docs/CHANGELOG-2026-02-13.md` | `docs/changelogs/CHANGELOG-2026-02-13.md` |
| `docs/CHANGELOG-2026-02-17.md` | `docs/changelogs/CHANGELOG-2026-02-17.md` |
| `docs/CHANGELOG-2026-02-22.md` | `docs/changelogs/CHANGELOG-2026-02-22.md` |
| `docs/CHANGELOG-2026-02-24.md` | `docs/changelogs/CHANGELOG-2026-02-24.md` |
| `docs/CHANGELOG-2026-02-27.md` | `docs/changelogs/CHANGELOG-2026-02-27.md` |
| `docs/CHANGELOG-2026-03-08.md` | `docs/changelogs/CHANGELOG-2026-03-08.md` |

## Implementation

For each file: read content, write to new path. Since Lovable doesn't have a rename/move command, each file will be recreated at the new path. The old files at `docs/` will remain as empty/deleted -- I'll overwrite them with a redirect note or we can leave them. 

Note: Lovable's file tools only support write (create/overwrite), not delete. The old files will remain in `docs/` but can be emptied with a deprecation notice pointing to the new location.

## Approach

1. Create each file at `docs/changelogs/CHANGELOG-*.md` with the original content
2. Overwrite each old `docs/CHANGELOG-*.md` with a short redirect note

This is a pure file reorganization -- no code or logic changes.

