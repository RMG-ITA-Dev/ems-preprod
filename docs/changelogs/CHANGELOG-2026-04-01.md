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
