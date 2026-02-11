
# Plan: Rewrite `docs/CHANGELOG-2026-02-06.md` with All 21 Bugs

## Overview

Replace the current `docs/CHANGELOG-2026-02-06.md` (which only documents 3 bugs) with a comprehensive changelog covering all 21 bugs from the February 6, 2026 testing session (`TestEMS20-060226_v3.json`), fixed during the February 10, 2026 debugging session.

## Source Data

The uploaded JSON file `TestEMS20-060226_v3.json` contains 21 bugs (IDs 1-21) reported by testers `lcandia` and `jyamaca`. Each bug includes: ID, date, type, title, description, suggestion, route, priority, and status.

## Mapping: JSON Bug IDs to Code Changes

Based on codebase analysis (searching for `BUG #` comments), the fixes map as follows:

| JSON ID | Title | Code BUG # Ref | Files Changed |
|---------|-------|----------------|---------------|
| 1 | Registro de usuario inactivo | (auth/login logic) | `src/hooks/useCurrentStaff.ts`, `src/hooks/useAuth.tsx` |
| 2 | Cronometro no registra tiempo correctamente | (timer rewrite) | `src/hooks/useTimeTracker.ts` |
| 3 | Botones no disponibles en semanas distintas | BUG #32 | `src/pages/TimeSheet.tsx`, `src/hooks/useTimesheetMutations.ts` |
| 4 | Transferencia Cronometro a Hoja de Tiempo | (import dialog) | `src/components/tracker/TimerImportDialog.tsx`, `src/pages/TrackerList.tsx` |
| 5 | Control semanas vs fecha ingreso | BUG #5 | `src/pages/TimeSheet.tsx`, `src/components/timesheet/WeekNavigator.tsx`, `src/components/timesheet/TimesheetGrid.tsx` |
| 6 | Leyendas estados ordenes de trabajo | (status legend) | `src/pages/WorkOrders.tsx` |
| 7 | Crear nueva categoria - campos vacios | (zod validation) | `src/components/forms/CategoryForm.tsx` |
| 8 | No se puede seleccionar encargo | BUG #19 | `src/hooks/useTimesheetWeek.ts` |
| 9 | Control campos crear usuario | (zod required) | `src/components/forms/StaffForm.tsx` |
| 10 | Roles faltantes SQR, Especialista IT/TAX | (enum + UI) | `src/components/settings/UserRolesManager.tsx`, DB migration |
| 11 | Mostrar/Ocultar contrasena login | (Eye toggle) | `src/pages/Auth.tsx` |
| 12 | Cuenta correo repetida | BUG #15 | `src/hooks/mutations/useStaffMutations.ts`, `src/lib/error-handler.ts` |
| 13 | Mensaje cuenta no vinculada | (email fallback) | `src/hooks/useCurrentStaff.ts` |
| 14 | Dropdown Seleccionar Encargo - contraste | BUG #31 | `src/components/timesheet/TimesheetGrid.tsx` |
| 15 | Cronometro permite multiples actividades | (single timer) | `src/hooks/useTimeTracker.ts`, `src/components/tracker/TrackerBar.tsx` |
| 16 | Aprobacion de horas desde gerente | (RPC fix) | `src/hooks/useTimesheetApprovals.ts`, DB function |
| 17 | Comportamiento erratico Hoja de Tiempo | BUG #29, #33 | `src/components/timesheet/TimesheetGrid.tsx`, `src/components/ui/numeric-input.tsx` |
| 18 | Nombre cliente repetido | BUG #11 | `src/hooks/mutations/useClientMutations.ts`, `src/lib/error-handler.ts` |
| 19 | Fecha inicio encargo anterior a creacion | (date validation) | `src/components/forms/EngagementForm.tsx` |
| 20 | Error deleting client | BUG #20 fix | `src/pages/ClientEdit.tsx`, `src/components/forms/ClientForm.tsx` |
| 21 | Aprobar semana no enviada | BUG #21 fix | `src/pages/TimeSheet.tsx` |

## What Will Be Created

A single file `docs/CHANGELOG-2026-02-06.md` (replacing the existing one) structured as:

1. **Header**: Session metadata (dates, version, session focus)
2. **Completion Summary Table**: All 21 bugs with ID, title, priority, type, and status
3. **Per-Bug Sections** (21 sections): Each with:
   - Original bug description (from JSON)
   - Problem analysis
   - Files changed
   - Technical details of the fix
4. **Translation Keys Added**: Summary of all i18n keys added
5. **Testing Checklist**: Organized by module

## Technical Details

- The file will reference actual code patterns found in the codebase (e.g., `BUG #5`, `BUG #11`, `BUG #29`, etc.)
- Each bug section will include the specific files modified and the approach taken
- The document will be written primarily in English with Spanish bug titles preserved from the original test report
- Estimated length: ~400-500 lines of Markdown
