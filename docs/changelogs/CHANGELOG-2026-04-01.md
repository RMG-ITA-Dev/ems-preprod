# Changelog — 2026-04-01

## Work Session: 260401_EMS2.0

---

### Sync Test
- GitHub sync verification commit — 2026-04-01

<!-- Entries will be appended below as issues are resolved -->

### Dark/Light Mode Implementation

**Three-way theme toggle (Light / Dark / System) with custom ThemeProvider, updated dark CSS palette, and FOUC prevention.**

#### Phase 1 — Foundation
- **Created** `src/components/theme/ThemeProvider.tsx` — React Context providing `{ theme, setTheme, resolvedTheme }` with localStorage persistence, system preference detection via `matchMedia`, and `.dark` class toggling on `<html>`
- **Created** `src/components/theme/ThemeToggle.tsx` — Three-way dropdown toggle (Sun/Monitor/Moon icons) using shadcn DropdownMenu, with i18n labels and keyboard-accessible `aria-label`
- **Edited** `index.html` — Added inline FOUC prevention script in `<head>` that reads localStorage before React hydrates; added `<meta name="theme-color">` tags for light (#008795) and dark (#0c1a2b) browser chrome
- **Edited** `src/App.tsx` — Wrapped entire app with `<ThemeProvider>` as outermost provider (outside ErrorBoundary)
- **Edited** `src/components/ui/sonner.tsx` — Replaced `import { useTheme } from "next-themes"` with `import { useTheme } from "@/components/theme/ThemeProvider"`

#### Phase 2 — Dark Palette
- **Edited** `src/index.css` — Added `color-scheme: light` to `:root`; replaced entire `.dark {}` block (lines 108-168) with new desaturated deep-blue palette: background `210 60% 12%` (#0c1a2b), card `212 50% 18%`, foreground `210 20% 95%` (warm white), primary teal `186 100% 35%`, brand purple `255 80% 72%`, plus dark-mode overrides for all brand, tracker, sidebar, and semantic status tokens

#### Phase 3 — Integration
- **Edited** `src/components/layout/AppHeader.tsx` — Added ThemeToggle between bell icon and user display name, wrapped in `hidden sm:block` for desktop-only
- **Edited** `src/components/layout/MobileMoreDrawer.tsx` — Added ThemeToggle row in profile section (after staff badge, before main nav)
- **Edited** `src/locales/en.json` — Added `theme.label`, `theme.light`, `theme.dark`, `theme.system` keys
- **Edited** `src/locales/es.json` — Added `theme.label` (Tema), `theme.light` (Claro), `theme.dark` (Oscuro), `theme.system` (Sistema) keys

#### Phase 4 — Component Audit
- **Edited** `src/components/settings/UserRolesManager.tsx` (lines 54-66) — Added `dark:` text color variants for 8 role badges (partner, director, manager, senior, semisenior, sqr, specialist_it, specialist_tax)
- **Edited** `src/components/dashboard/PendingHoursAlert.tsx` (lines 145-146) — Replaced hardcoded `text-green-700` / `bg-green-500` with semantic `text-success` / `bg-success`
- **Edited** `src/components/dashboard/tabs/PracticaTab.tsx` (line 466) — Added `dark:text-orange-400` variant for bronze medal badge
- **Verified** no hardcoded hex/rgb/rgba colors remain in `src/components/` (grep confirmed clean)
- **Verified** all chart components use `hsl(var(--*))` CSS variables
- **Verified** no SVG icons use hardcoded fill/stroke values

#### Phase 5 — Cleanup
- **Removed** `next-themes` dependency from `package.json` via `npm uninstall`
- **Verified** no remaining `next-themes` imports in `src/`
- **Edited** `src/test/utils.tsx` — Added `ThemeProvider` wrapper to test utility to fix test failures from `useTheme` context requirement
- **Added** `matchMedia` guard in ThemeProvider for jsdom test compatibility
- **Build**: `npm run build` passes with no TypeScript errors
- **Tests**: All 514 tests pass (56 test files, 1 skipped)

---

### BUG FIX: Holiday Proration Incorrectly Reduces Weekly Max (BUG 0402-01)

**Holidays no longer reduce weekly min/max capacity limits. Staff must log 8h on holidays against the holiday engagement, so holidays are full work days for capacity purposes.**

#### Root Cause
The `getEffectiveWeeklyLimits()` function in `timesheetUtils.ts` and the `submit_timesheet_safe()` RPC both subtracted holidays from the workable day count when calculating prorated weekly limits. This caused weeks with holidays (e.g., Viernes Santo) to have reduced maximums (32h instead of 40h), blocking valid 40h submissions.

#### Frontend Fix
- **Edited** `src/lib/timesheetUtils.ts` (line 215) — Removed `if (holidayDates.has(toISODateString(date))) continue;` from `getEffectiveWeeklyLimits()`. The `holidayDates` parameter is retained for backward compatibility but no longer affects the workable day count. Only hire date and termination date boundaries still reduce capacity.

#### Backend Fix
- **Migration** — Updated `submit_timesheet_safe()` RPC to remove the `v_holiday_count` variable and the holiday subtraction line (`v_workable_days := GREATEST(v_workable_days - v_holiday_count, 0)`). The proration block now only considers hire/termination date boundaries.

#### Tests
- **Edited** `src/lib/__tests__/timesheetUtils.test.ts` — Updated two test cases:
  - `"subtracts holidays from workable days"` → renamed to `"does NOT subtract holidays from workable days"`, now expects 5 workable days and 40h limits when a holiday is present
  - `"combines hire date and holidays"` → renamed to `"hire date still prorates but holidays do not"`, now expects 2 workable days (Thu+Fri) and 16h limits when hired on Thursday with a Friday holiday

#### What is NOT changed
- Holiday-blocking trigger (`enforce_holiday_blocking`) — still restricts entries to the holiday engagement on holiday dates
- Hire/termination proration — still works correctly
- Daily min/max validation — unchanged
- Approval workflow — unchanged
