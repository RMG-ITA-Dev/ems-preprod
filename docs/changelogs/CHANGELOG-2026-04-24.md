# Changelog — 2026-04-24

## Work Session: 260424_EMS2.0 — Dashboard Performance Remediation

Tracks step-by-step execution of the EMS v2.0 dashboard performance remediation
plan (CODEX_PLAN_v5, steps S-01 → S-12). All steps land on branch
`claude/performance-improvements-DeNVL` and PR into `sruizmier-performance-v1`.
No step PRs into `main`.

---

### S-01 — Set global React Query defaults (stability + warm-speed)

**Configures explicit defaults on the global `QueryClient` so the dashboard (and the rest of the app) stops issuing redundant refetches on remounts, window focus, and network reconnect events. Foundational config step; no business logic, query bodies, query keys, or component code changed.**

#### Scope
- Frontend only
- Single file edit: `src/App.tsx`
- No schema, RPC, edge function, dependency, or test changes
- No KPI math touched

#### Files Changed

##### `src/App.tsx` (line 47)

- **Edited** the `QueryClient` constructor.
  - **Before** (line 47):
    ```ts
    const queryClient = new QueryClient();
    ```
  - **After** (lines 47–57):
    ```ts
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          staleTime: 60_000,
          gcTime: 300_000,
          retry: 1,
          refetchOnWindowFocus: false,
          refetchOnReconnect: false,
        },
      },
    });
    ```

#### Defaults Set — Rationale

| Option | Value | Behavior change vs. React Query default |
|---|---|---|
| `staleTime` | `60_000` (60 s) | Default is `0`. Queries are now treated as fresh for 60 s, so component remounts within that window do **not** trigger a network refetch. |
| `gcTime` | `300_000` (5 min) | Default is `300_000` already; set explicitly to make the cache lifetime visible alongside `staleTime`. Unused query data is retained 5 min, so warm tab switches reuse cache instead of refetching. |
| `retry` | `1` | Default is `3`. Failures surface to the UI 2× faster (one retry instead of three). |
| `refetchOnWindowFocus` | `false` | Default is `true`. Stops the dashboard refetch storm that previously fired every time a user alt-tabbed back into the app. |
| `refetchOnReconnect` | `false` | Default is `true`. Stops the same storm pattern on flaky-network reconnect events (added beyond plan as the natural pair to `refetchOnWindowFocus`, approved by repo owner before implementation). |

#### Mutation Defaults
- **Not modified.** Per the plan, only the `queries` defaults block was set. No `mutations` key is added to `defaultOptions`, so mutation `retry` and other defaults remain at React Query's library defaults. This preserves all existing mutation retry semantics in `src/hooks/mutations/**` and `src/hooks/useTimesheetMutations.ts`.

#### Expected Runtime Impact

- **Eliminated:** refetch wave when the user switches browser tabs/windows and returns (every active query no longer refires).
- **Eliminated:** refetch wave on network reconnect.
- **Eliminated:** redundant refetches when components unmount and remount within 60 s (e.g., dashboard tab navigation).
- **Faster failures:** 1 retry instead of 3 cuts perceived hang time on transient errors by ~66%.
- **Unchanged:** initial cold-load request count for any page; manual `queryClient.invalidateQueries` paths; mutation behavior; query keys; query bodies.

#### Tests

- **No new tests added.** Per the plan, this step is a config tweak validated against the existing test infrastructure.
- **Validation runs:**
  - `npx vitest run src/pages/__tests__/Index.dashboard-tabs.test.tsx` → **5/5 passed** (327 ms)
  - `npx vitest run` (full suite) → **514 passed, 1 skipped, 0 failed** across 57 test files (43.22 s)

#### Acceptance Gates (all pass)

- ✅ No failing tests
- ✅ No KPI drift (no business logic touched)
- ✅ Query count does not increase
- ✅ No new wildcard `select('*')`
- ✅ No new per-item async loops over DB calls

#### What is NOT Changed

- React Query mutation defaults (intentionally preserved)
- Any `useQuery` / `useQueries` call sites — none received per-call overrides as part of this step
- Query keys, query functions, Supabase calls, edge functions, RPCs, migrations
- `src/integrations/supabase/types.ts` (auto-generated; never edited)
- `supabase/config.toml` (managed by Lovable Cloud)
- Test files, test infra, or test wrappers
- Dependencies (`package.json` / `package-lock.json` untouched)

#### Risk / Rollback

- **Risk:** Very low — single config block, no logic changes.
- **Rollback:** Revert the PR or restore `const queryClient = new QueryClient();` in `src/App.tsx`. No data, schema, or API contract is affected; no migration to undo.

#### Verification Checklist (for reviewer)

To confirm this changelog matches the codebase:
1. Open `src/App.tsx` line 47.
2. Confirm the `QueryClient` is constructed with `defaultOptions.queries` containing exactly the five options listed above with the listed values.
3. Confirm no `mutations` key exists inside `defaultOptions`.
4. Confirm no other file in the diff is changed (`git diff sruizmier-performance-v1...claude/performance-improvements-DeNVL -- src/` should show only `src/App.tsx`).
5. Run `npx vitest run` — full suite should report 514 passed / 1 skipped / 0 failed.

#### Traceability

- **Plan reference:** CODEX_PLAN_v5 step **S-01**
- **Branch:** `claude/performance-improvements-DeNVL`
- **Base:** `sruizmier-performance-v1`
- **Commit:** `cce4df1` — `perf(s-01): set global React Query defaults`
- **PR:** #14 — `perf(s-01): set global React Query defaults`

---

### S-02 — Refactor `Practica` partner leaderboard to remove N+1 (with risk-column split)

**Replaces the per-partner query loop in the `Practica` tab leaderboard with a constant-cost set of bulk fetches running in parallel, and resolves a tab-wide rule inconsistency by splitting the leaderboard's single "Risks" column into "At Risk" (80–100% consumption) and "Over Budget" (>100%) — matching the practice-wide KPI cards above. Aggregation is extracted into a pure, fully unit-tested function with zero React/Supabase dependencies.**

#### Scope
- Frontend only (phase 1)
- Three files touched: one refactored, two new
- No schema, RPC, edge function, dependency, or i18n key change
- One intentional, documented UI change (risk-column split — Option C, approved before implementation)

#### Files Changed

##### NEW `src/components/dashboard/tabs/practicaLeaderboard.ts` (124 lines)

- **Created** a pure aggregation module exporting:
  - DTO interfaces: `PartnerRow`, `LeaderboardEngagementRow`, `LeaderboardTimeEntryRow`, `LeaderboardWorkOrderRow`, `LeaderboardBudgetRow`, `PartnerMetrics`
  - Function `aggregatePartnerLeaderboard(input): PartnerMetrics[]`
- **Behavior:**
  - Builds `partnerIdToEngagementIds` from the engagements list
  - Pre-aggregates per-engagement totals into three Maps:
    - `hoursByEng` (sum of `hours_logged`)
    - `feesByEng` (sum of `total_standard_fee + adjustment_amount`)
    - `budgetByEng` (sum of `total_budget_hours` — accumulates multi-category rows)
  - For each partner, walks their engagement IDs and computes `totalHours`, `totalFees`, plus the **mutually exclusive** band counts:
    - `consumption > 100` → `overBudgetCount++`
    - `else if consumption > 80` → `atRiskCount++`
  - Partners with zero engagements still produce a row with all zeros
  - Sorts by `totalFees` desc with stable tie-break on `staffId`
- **Helpers:** `toNumber()` coerces null/undefined/NaN to 0; `resolveName()` falls back `short_name → "first last"`; `resolveInitials()` falls back `initials → firstChar+firstChar`
- **No imports from React, `@tanstack/react-query`, or `@/integrations/supabase/client`** — fully tree-shakable, framework-free

##### NEW `src/components/dashboard/tabs/__tests__/practicaLeaderboard.test.ts` (9 unit tests)

- **Created** unit tests against `aggregatePartnerLeaderboard` using hand-crafted fixtures (no Supabase, no mocks):
  1. Returns `[]` when there are no partners
  2. Emits a zeroed row for a partner with no engagements
  3. Zeroes out a partner whose engagements have no time/WO/budget rows
  4. Splits at-risk vs. over-budget into mutually exclusive buckets (50/90/110% fixtures)
  5. Boundary conditions at 80% (neither), 100% (at-risk), 100.0001% (over-budget)
  6. Sorts partners by `totalFees` desc with stable secondary `staffId` tie-break
  7. Coerces `null` numerics to 0 across hours, fees (both `total_standard_fee` and `adjustment_amount`), and budgets
  8. Sums multi-category budget rows per engagement before computing consumption
  9. Falls back correctly for missing display name and initials
- **Result:** 9/9 passing in 15 ms

##### `src/components/dashboard/tabs/PracticaTab.tsx`

###### Imports (top of file, ~lines 18–28)
- **Added** import of `aggregatePartnerLeaderboard` and the five DTO types from `./practicaLeaderboard`
- **Removed** the local `interface PartnerMetrics { … atRiskCount: number }` block — now consumed from the new module (which adds `overBudgetCount: number`)

###### `partnerLeaderboard` `queryFn` (formerly lines 152–255 — now ~lines 150–230)
- **Removed** the `for (const partner of partners)` loop and all per-partner sub-queries
- **Removed** the inline name/initials fallback duplication and the inline at-risk computation block (lines 220–249 in the prior file)
- **Added** a single bulk fetch returning `engagement_id, partner_id` for every active engagement owned by the fetched partners (`partner_id IN partnerIds AND status = 'active'`)
- **Added** an empty-array guard: if `engagementIds.length === 0`, the function calls `aggregatePartnerLeaderboard` with empty data arrays so partner rows still appear with zeros (preserves prior behavior; avoids `.in('engagement_id', [])`)
- **Added** a `Promise.all([...])` block that issues the three remaining bulk fetches in parallel:
  - `time_entries` filtered `engagement_id IN allEngagementIds AND date_worked BETWEEN startDateStr AND endDateStr`, selecting `engagement_id, hours_logged`
  - `work_order_summary` filtered `engagement_id IN allEngagementIds`, selecting `engagement_id, total_standard_fee, adjustment_amount`
  - `vw_wo_budget_hours_by_category` filtered `engagement_id IN allEngagementIds`, selecting `engagement_id, total_budget_hours`
- **Added** narrowing maps from raw Supabase rows to the strict DTO types (filters out rows whose `engagement_id`/`partner_id` came back null at the type-system level)
- **Added** final call to `aggregatePartnerLeaderboard({ partners, engagements, timeEntries, workOrders, budgets })` and returns its result
- **Net query count for leaderboard path:** **1 (partners) + 1 (engagements) + 3 (parallel bulk) = 5 round-trips, constant**, vs. previously `1 + 4·N` (sequential)

###### Leaderboard `<thead>` (lines 446–453 prior → now `<th>` count goes from 6 to 7)
- **Removed** the single `<th>{t('dashboard.practica.risks')}</th>` cell
- **Added** two `<th>` cells:
  - `<th>{t('dashboard.practica.atRisk')}</th>`
  - `<th>{t('dashboard.practica.overBudget')}</th>`

###### Leaderboard `<tbody>` row cells (formerly the single risk cell at lines 483–493)
- **Removed** the single risk badge cell that read `partner.atRiskCount` with the `>0 ? warning : success` toggle
- **Added** two cells:
  - **At Risk cell:** outline badge — `bg-warning/10 text-warning border-warning/30` if `partner.atRiskCount > 0`, otherwise green `bg-success/10 text-success border-success/30 → "0"` (visual symmetry with prior idiom)
  - **Over Budget cell:** outline badge — `bg-destructive/10 text-destructive border-destructive/30` if `partner.overBudgetCount > 0`, otherwise green `bg-success/10 text-success border-success/30 → "0"`
- These badge color choices intentionally mirror the existing practice-wide KPI cards (warning amber for `atRisk` at line 397, destructive red for `overBudget` at line 411 — pre-edit numbering).

###### Empty-state row (formerly line 498)
- **Edited** the empty-state row's `colSpan` from `6` to `7` to span the new column

#### Translations
- **Verified** `dashboard.practica.atRisk` and `dashboard.practica.overBudget` already exist in both `src/locales/en.json` (lines 695–696) and `src/locales/es.json` (lines 695–696). **No new keys added.**
- **Note:** the prior key `dashboard.practica.risks` (en.json line 700, es.json line 700) is no longer referenced in code. Left untouched in this step to avoid scope creep; can be removed in a later i18n cleanup PR.

#### Behavior Preservation Guarantees

| Output | Change vs. prior |
|---|---|
| `totalHours` per partner | None — sum-of-`hours_logged` math identical |
| `totalFees` per partner | None — `total_standard_fee + adjustment_amount` math identical |
| `engagementCount` per partner | None |
| Partners with zero engagements appear with zeros | Preserved (was lines 183–193 inline; now in pure function) |
| `name` fallback (`short_name → "first last"`) | Preserved |
| `initials` fallback (`initials → firstChar+firstChar`) | Preserved |
| Sort: `totalFees` desc | Preserved (with new stable `staffId` tie-break — visible only when two partners have identical `totalFees`) |
| Risk count split | **Intentional UI change.** Was: single `atRiskCount` field counting `>80%` (which lumped over-budget into at-risk). Now: `atRiskCount` for `80–100%` only + `overBudgetCount` for `>100%`. Sum of the two new fields equals the prior single field for any partner. This was approved as Option C before implementation. |
| KPI cards above leaderboard (practice-wide metrics) | None — `practiceMetrics` queryFn untouched |
| Sparkline weekly trend | None — `weeklyTrend` queryFn untouched (S-03 will address it) |

#### Performance Impact

- **Round-trip count, leaderboard path:** `1 + 4·N` → `5` (constant). For 8 partners: **33 → 5**. For 12 partners: **49 → 5**.
- **Inner fetches:** sequential → parallel (`Promise.all`). Latency now bounded by the slowest of the three bulk fetches rather than sum of all four (previously per-partner) sub-queries.
- **Payload size:** unchanged at the row level, but with no per-partner duplication of e.g. shared `time_entries` rows — net payload may decrease for partners sharing engagements (rare, but possible).

#### Tests

| Test command | Result |
|---|---|
| `npx vitest run src/components/dashboard/tabs/__tests__/practicaLeaderboard.test.ts` | **9/9 passed** (15 ms) |
| `npx vitest run` (full suite) | **523 passed, 1 skipped, 0 failed** across 58 files (was 514+1 before; the +9 new tests bring the new total to 523) |
| `npm run build` | TypeScript compile clean, Vite build succeeds in 17 s |

#### Acceptance Gates (all pass)

- ✅ No failing tests (523 passing)
- ✅ KPI math preserved for `totalHours`, `totalFees`, `engagementCount`, sort, display fallbacks
- ✅ Risk-count split is the **only** intentional UI change, documented here and in the PR
- ✅ Network call count for leaderboard reduced from `O(N)` to `O(1)` and the inner fetches run in parallel
- ✅ No new wildcard `select('*')` introduced
- ✅ No `.in('col', [])` calls (empty-array guard in place)
- ✅ Pure aggregation function has zero React/Supabase imports
- ✅ Build / TS compile clean

#### What is NOT Changed

- `practiceMetrics` queryFn (lines 53–149 in current file) — unchanged
- `weeklyTrend` queryFn (sparkline) — unchanged (S-03's territory)
- KPI card layout, "Risk Summary" 3-card row, drill-down handler — unchanged
- Other tabs (`CarteraTab`, `EncargoTab`, `PersonalTab`) — untouched
- Database schema, RPCs, edge functions, migrations
- React Query defaults from S-01 — unchanged
- `dashboard.practica.risks` translation key (left in locale files; no longer referenced in code)
- Test infra, test wrappers, dependencies (no `package.json` change)

#### Verification Checklist (for reviewer)

To confirm this changelog matches the codebase:
1. Confirm `src/components/dashboard/tabs/practicaLeaderboard.ts` exists, exports `aggregatePartnerLeaderboard`, and contains zero imports from React, `@tanstack/*`, or `@/integrations/*`.
2. Confirm `src/components/dashboard/tabs/__tests__/practicaLeaderboard.test.ts` exists with 9 tests; run `npx vitest run src/components/dashboard/tabs/__tests__/practicaLeaderboard.test.ts` → 9/9 pass.
3. Open `src/components/dashboard/tabs/PracticaTab.tsx`, locate the `partnerLeaderboard` `useQuery` block, and confirm:
   - There is **no** `for (const partner of partners)` loop.
   - There is exactly one `Promise.all([...])` call inside it with three Supabase queries.
   - The function ends with `return aggregatePartnerLeaderboard({ ... })`.
4. In the same file, confirm the leaderboard `<thead>` has 7 `<th>` cells (not 6); two of them are `t('dashboard.practica.atRisk')` and `t('dashboard.practica.overBudget')`.
5. Confirm the empty-state row uses `colSpan={7}`.
6. Run `git grep "dashboard.practica.risks" src/` → should return **no matches** (key still in locale JSON files but unused in code).
7. Run `npx vitest run` → 523 passed / 1 skipped / 0 failed.
8. Run `npm run build` → clean compile.

#### Risk / Rollback

- **Risk:** Medium-low. Largest aggregation refactor in the plan, isolated to one `useQuery` block and one `<table>` block. The pure-function extraction makes correctness verifiable purely from the unit tests.
- **Rollback:** Revert this PR. The two new files (`practicaLeaderboard.ts` + its test) are deletable; `PracticaTab.tsx` returns to the prior loop + single-column form. No data, schema, or API contract is affected.

#### Traceability

- **Plan reference:** CODEX_PLAN_v5 step **S-02** + decision Option C (risk-column split)
- **Branch:** `claude/performance-improvements-DeNVL`
- **Base:** `sruizmier-performance-v1`
- **Commit:** `2514e2a` — `perf(s-02): bulk-fetch Practica partner leaderboard, split risk column`
- **PR:** #15 — `perf(s-02): bulk-fetch Practica partner leaderboard, split risk column`

---

### S-01 and S-02 Complement — Lovable Preview Resilience

**Process hardening, no source code change. Documents the Lovable preview reindex behavior that intermittently caused the preview to fail after PRs that introduce net-new files, and provides an idiot-proof recovery command. Forward-applicable to S-03 (`weeklyHoursBucket.ts`), S-07 (`queryHelpers.ts`), and S-12 (`queryPerfLogger.ts`).**

#### Incident Summary

After PR #15 (S-02) merged into `sruizmier-performance-v1` on 2026-04-25:
- Lovable UI showed "Preview has not been built yet" with a "Preview failed" badge on the merge entry
- Browser console showed `GET https://<project-id>.lovableproject.com/_sandbox/dev-server → 404`
- Lovable's chat assistant said "Dev server is running and locale files are valid — try refreshing"
- `main` branch preview loaded fine
- `npm run build` passed locally before merge
- Full vitest suite (523 tests) passed locally before merge
- The preview self-recovered after an indeterminate window without any code change

#### Root Cause

S-02 introduced **`src/components/dashboard/tabs/practicaLeaderboard.ts`** as a net-new file and immediately consumed it from the modified **`src/components/dashboard/tabs/PracticaTab.tsx`** (`import { aggregatePartnerLeaderboard } from "./practicaLeaderboard"`). Lovable's preview pipeline operated from a file index that predated the merge, so the module resolver returned a 404 for the new path → the preview iframe failed to mount.

This is a **Lovable infrastructure index-lag behavior**, not a defect in our code:
- Local `tsc` and Vite resolved the import correctly
- Production bundle (run via `npm run build`) included the new module
- All tests passed
- Lovable eventually re-indexed the branch and the preview recovered

#### Why No Source Code Change Was Made

An Explore-agent diagnostic (Claude Code, 2026-04-25) ranked three hypotheses:

1. **Lovable file-index lag (~85%)** — confirmed by self-recovery without code change
2. **TS-to-ESM module resolution mismatch (~12%)** — ruled out: `vite.config.ts` and `tsconfig.app.json` resolve `.ts` extensions correctly, and Vite's prod build succeeds
3. **Test file leaking into production bundle (~3%)** — ruled out: `dist/assets/` contains no `*.test.*` artifacts; `vitest` is a devDependency only

Adding defensive `vite.config.ts` externals, switching to explicit `.ts` extensions in imports, or restructuring the helper file location would all be **AI SLOP** — they do not address the actual root cause and would introduce churn for hypothetical benefit.

#### Lovable's Plan_v1 Was Skipped

Lovable's own AI produced a "Plan_v1" suggesting changes to `src/components/forms/StaffForm.tsx`, `src/locales/en.json`, and `src/locales/es.json` for a Competencies feature. **None of these files are related to the failure** — Lovable's plan diagnosed wrong context. We **clicked Skip** on its plan to avoid unnecessary changes to unrelated code.

#### Files Changed

##### `AGENTS.md` (root, 41 → 67 lines)

- **Appended** new section "**Lovable Preview Reindex on New-File PRs**" after the existing "File Conventions" section.
- Documents:
  - Symptom checklist (UI message, console 404, chat behavior, local build status)
  - Recovery command:
    ```bash
    git commit --allow-empty -m "chore: trigger Lovable preview rebuild"
    git push origin <feature-branch>
    ```
  - Escalation guidance: if two trigger commits don't recover the preview, treat as a Lovable platform issue
  - Explicit anti-pattern: do NOT add defensive Vite/tsconfig changes
  - Cross-reference back to this CHANGELOG entry

##### `docs/changelogs/CHANGELOG-2026-04-24.md`

- **Appended** this section.

#### Files NOT Changed

- No file under `src/` modified
- `vite.config.ts`: untouched
- `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json`: untouched
- `package.json`, `package-lock.json`: untouched
- No test files added or modified
- No translations added or modified
- No new code logic introduced anywhere

#### Verification

- `git diff sruizmier-performance-v1...claude/performance-improvements-DeNVL -- src/` returns empty diff
- `npm run build`: clean (no regression — output identical to S-02 build)
- `npx vitest run`: **523 passed, 1 skipped, 0 failed** (unchanged from S-02 baseline)

#### Acceptance Gates

- ✅ No source code changes
- ✅ No new failure surface introduced
- ✅ Build clean
- ✅ Test suite unchanged
- ✅ Documentation is concrete (specific symptoms, specific command, specific escalation)
- ✅ Cross-referenced bidirectionally between `AGENTS.md` and the CHANGELOG

#### Forward Applicability

The runbook applies as-is to:
- **S-03**: will add `src/components/dashboard/weeklyHoursBucket.ts` + test file
- **S-07**: will add `src/lib/queryHelpers.ts`
- **S-12**: optionally adds `src/lib/queryPerfLogger.ts`

If the preview fails after any of these merges, the operator runs the documented empty-commit trigger and the preview recovers.

#### Risk / Rollback

- **Risk:** Zero — no runtime code, no dependency change, no schema change.
- **Rollback:** Revert this PR to remove the documentation. The runbook command itself remains usable directly even if removed from `AGENTS.md`.

#### Traceability

- **Plan reference:** "S-01 and S-02 Complement" (post-incident, 2026-04-25)
- **Branch:** `claude/performance-improvements-DeNVL`
- **Base:** `sruizmier-performance-v1`
- **Commits:** `8f4cc5f` (AGENTS.md runbook) · `b55149e` (this CHANGELOG entry)
- **PR:** #16 — `docs(s-01+s-02): Lovable preview reindex runbook (Complement)`

---

### S-03 — Collapse 8-week sparkline query loops into single-range fetch

**Replaces three identical per-week query loops (one per dashboard tab) with a single date-range fetch + in-memory bucketing. Drops total dashboard sparkline round-trips from 24 sequential requests to 4. Aggregation lives in a new pure helper file (`weeklyHoursBucket.ts`) with zero React/Supabase imports and a 9-case unit test suite. One small intentional UI change in Cartera: when a user has no portfolio engagements, the sparkline now renders as a flat-line-at-0 (8 zero buckets) instead of being hidden; this aligns Cartera with the always-8-buckets behavior already present in Practica and Personal.**

#### Scope
- Frontend only
- Five files touched: three refactored, two new
- No schema, RPC, edge function, dependency, i18n key, or react-query default change
- One intentional, documented UI change (Cartera empty-portfolio sparkline — approved as Option C-equivalent before implementation)

#### Files Changed

##### NEW `src/components/dashboard/weeklyHoursBucket.ts` (49 lines)

- **Created** a pure helper module exporting:
  - `interface HoursRow { date_worked: string; hours_logged: number | null; }`
  - `getWeekRange(referenceDate?: Date): { rangeStart: Date; rangeEnd: Date }` — returns Monday-aligned start of the 8-week window and Sunday-aligned end of the current week
  - `getWeekStamp(referenceDate?: Date): string` — returns the current Monday formatted as `yyyy-MM-dd`, used as a query-key cache invalidator
  - `bucketHoursByWeek(rows: HoursRow[], referenceDate?: Date): SparklineDataPoint[]` — returns exactly 8 ordered buckets (oldest → newest)
- **Behavior of `bucketHoursByWeek`:**
  - Builds 8 Monday-aligned week-start keys from the reference date
  - Initializes a `Map<weekKey, 0>` so missing weeks remain at 0
  - For each row: skips empty `date_worked`, parses with `parseISO` (avoids timezone drift), guards against invalid dates with `Number.isNaN(date.getTime())`, computes the week-start key, and only sums into known buckets (out-of-range rows are dropped defensively)
  - Coerces `Number(hours_logged)` and guards with `Number.isFinite` to handle `null`, `NaN`, or non-finite values
- **Imports:** only `date-fns` (`format`, `parseISO`, `startOfWeek`, `endOfWeek`, `subWeeks`) and a **type-only** import of `SparklineDataPoint` from `./Sparkline` (erased at compile time)
- **Zero imports from React, `@tanstack/react-query`, or `@/integrations/supabase/client`** — fully framework-free

##### NEW `src/components/dashboard/__tests__/weeklyHoursBucket.test.ts` (9 unit tests)

- **Created** unit tests using a fixed reference date `new Date(2026, 3, 25, 12, 0, 0)` (April 25, 2026, 12:00 local time) for deterministic bucket-key computation:
  1. Empty rows → 8 buckets all at 0
  2. Single entry placed in its matching week bucket (and only that bucket)
  3. Sparse weeks (entries at offsets 7, 4, 0) → expected `[5, 0, 0, 10, 0, 0, 0, 15]`
  4. Multiple entries in the same week sum correctly (3 + 4.5 + 1 = 8.5)
  5. Out-of-range entries (10 weeks ago, 1 week ahead) are ignored; in-window total preserved
  6. `null`, `NaN` `hours_logged` coerce to 0
  7. Monday-of-week boundary: an entry on the Monday belongs to that week (not the prior one)
  8. `getWeekRange` returns Monday-aligned start and Sunday-aligned end with the correct 7-week offset
  9. `getWeekStamp` returns a `yyyy-MM-dd` string equal to the current week's Monday
- **Result:** 9/9 passing in 14 ms

##### `src/components/dashboard/tabs/PracticaTab.tsx`

- **Removed** the per-week loop (formerly lines 238–262), `subWeeks`/`startOfWeek` imports
- **Added** imports for `bucketHoursByWeek`, `getWeekRange`, `getWeekStamp` from the new helper
- **Refactored** the `weeklyTrend` query:
  - Query key: `['practica-weekly-trend']` → `['practica-weekly-trend', getWeekStamp()]` (now invalidates on Monday boundaries — fixes a stale-cache issue where the previous unkeyed query could have shown the prior week's data after the boundary changed)
  - Query body: single `time_entries.select('date_worked, hours_logged').gte(rangeStart).lte(rangeEnd)` (firm-wide, no engagement filter)
  - Returns `bucketHoursByWeek(data ?? [], today)` — always 8 points
- **Round-trip count:** 8 sequential → 1

##### `src/components/dashboard/tabs/CarteraTab.tsx`

- **Removed** the per-week loop (formerly lines 222–236), `subWeeks`/`startOfWeek` imports
- **Added** imports for `bucketHoursByWeek`, `getWeekRange`, `getWeekStamp` from the new helper
- **Refactored** the `weeklyTrend` query:
  - Query key: `['cartera-weekly-trend', staffRecord?.staff_id]` → `['cartera-weekly-trend', staffRecord?.staff_id, getWeekStamp()]`
  - Engagement-IDs lookup preserved (returns `[]` if `staffRecord` absent — this is the existing `enabled` gate behavior)
  - **Empty-portfolio behavior changed (intentional):** previously, when the user owned zero active engagements as partner/manager, the function returned `[]` and the sparkline was hidden by the `weeklyTrend.length >= 2` render guard. Now, the function returns `bucketHoursByWeek([], today)` (8 zero buckets) and the sparkline renders as a flat line at 0. This aligns Cartera with the always-8-buckets behavior already present in Practica and Personal, communicating "no portfolio activity" as a visible flat line rather than a hidden component.
  - Query body when engagements exist: single `time_entries.select('date_worked, hours_logged').in('engagement_id', engagementIds).gte(rangeStart).lte(rangeEnd)` — empty-array guard remains in place (the guard returns the 8-zero-bucket sparkline before any `.in()` is issued)
- **Round-trip count:** previously 1 (engagements lookup) + 8 (per-week) = 9. Now: 1 + 1 = 2 (when user has engagements), or 1 + 0 = 1 (when user has none, due to the empty-array guard short-circuit).

##### `src/components/dashboard/tabs/PersonalTab.tsx`

- **Removed** the per-week loop (formerly lines 62–75), `subWeeks` from `date-fns` imports (other date-fns helpers — `startOfWeek`, `endOfWeek` — retained because they're used elsewhere in the file at lines 24–25 for current-week display)
- **Added** imports for `bucketHoursByWeek`, `getWeekRange`, `getWeekStamp` from the new helper
- **Refactored** the `weeklyTrend` query:
  - Query key: `['personal-weekly-trend', staffRecord?.staff_id]` → `['personal-weekly-trend', staffRecord?.staff_id, getWeekStamp()]`
  - Query body: single `time_entries.select('date_worked, hours_logged').eq('staff_id', X).gte(rangeStart).lte(rangeEnd)`
  - Returns `bucketHoursByWeek(data ?? [], today)`
- **Round-trip count:** 8 sequential → 1

#### Cache-Key Improvement (beyond plan)

All three sparkline query keys now include `getWeekStamp()` (the current Monday formatted `yyyy-MM-dd`). Previously:
- Practica's key had **zero date-dependent components** — the cached result could show stale data indefinitely (modulo the `staleTime: 60_000` from S-01) even after the bucket boundaries shifted on Monday
- Cartera and Personal had `staff_id` only — same issue

Now the cache invalidates exactly when the bucket boundaries shift (Monday at the user's local-week boundary), eliminating a class of stale-display bugs that S-01's `staleTime` could not catch.

#### Performance Impact

| Tab | Round-trips before | Round-trips after | Sequential? |
|---|---|---|---|
| Practica sparkline | 8 | 1 | was sequential |
| Cartera sparkline (with engagements) | 1 + 8 = 9 | 1 + 1 = 2 | was sequential |
| Cartera sparkline (no engagements) | 1 + 0 = 1 | 1 + 0 = 1 | n/a |
| Personal sparkline | 8 | 1 | was sequential |
| **Total typical dashboard load** | **24** | **4** | — |

Latency impact is even larger than the round-trip count suggests: the per-week loop was sequential (each iteration awaited the prior), so the prior implementation's wall-clock latency was 8× the per-query latency. The new implementation is one round-trip's wall-clock latency.

#### Tests

| Test command | Result |
|---|---|
| `npx vitest run src/components/dashboard/__tests__/weeklyHoursBucket.test.ts` | **9/9 passed** (14 ms) |
| `npx vitest run` (full suite) | **532 passed, 1 skipped, 0 failed** across 59 files (was 523 before; the +9 new tests bring the new total to 532) |
| `npm run build` | TypeScript compile clean, Vite build succeeds in 20.55 s |

#### Acceptance Gates (all pass)

- ✅ All existing tests still pass (523 → 532 with the 9 new bucketing tests)
- ✅ New helper has zero React/Supabase imports
- ✅ Per-sparkline query count: Practica 8→1, Cartera 9→2, Personal 8→1
- ✅ Total dashboard sparkline round-trips: 24 → 4
- ✅ No new wildcard `select('*')` introduced
- ✅ Empty-array guard preserved (Cartera short-circuits before any `.in('engagement_id', [])`)
- ✅ Build / TS compile clean
- ✅ Cache-key freshness now correct (Monday-boundary invalidation)

#### Behavior Preservation Guarantees

| Behavior | Drift |
|---|---|
| Sparkline shape for any non-empty data | None — same totals per week |
| Practica: always 8 buckets | None |
| Personal: always 8 buckets when `staffRecord` present | None |
| `weekStartsOn: 1` (Monday) | None |
| Cartera: hides sparkline when `staffRecord` is null/loading | None — `enabled: !!staffRecord?.staff_id` preserved |
| **Cartera: empty-portfolio behavior** | **Intentional change.** Was: `return []` → sparkline hidden. Now: 8 zero buckets → flat-line-at-0 renders. Aligns with Practica/Personal idiom. |
| Cache invalidation across Monday boundary | **Improved** — was effectively never; now happens automatically on the week-boundary rollover. |

#### What is NOT Changed

- Practice-wide metrics (`practiceMetrics` queryFn in PracticaTab) — untouched
- Partner leaderboard (`partnerLeaderboard` queryFn in PracticaTab) — untouched (S-02's territory)
- Cartera portfolio table, pending approvals query, KPI cards — untouched (S-04 will address pending approvals)
- Personal monthly hours, recent entries, capacity meter — untouched
- Other dashboard tabs (Encargo) — untouched
- React Query defaults from S-01 — unchanged
- Database schema, RPCs, edge functions, migrations
- Translations, theme, design tokens
- Test infra, dependencies (no `package.json` change)

#### Verification Checklist (for reviewer)

To confirm this changelog matches the codebase:
1. Confirm `src/components/dashboard/weeklyHoursBucket.ts` exists, exports `bucketHoursByWeek`, `getWeekRange`, `getWeekStamp`, `HoursRow`, and contains zero imports from React, `@tanstack/*`, or `@/integrations/*`. The only non-`date-fns` import is a **type-only** `import type { SparklineDataPoint } from './Sparkline'`.
2. Confirm `src/components/dashboard/__tests__/weeklyHoursBucket.test.ts` exists with 9 tests; run `npx vitest run src/components/dashboard/__tests__/weeklyHoursBucket.test.ts` → 9/9 pass.
3. Run `git grep -n "for (let i" src/components/dashboard/tabs/` → should return **no matches** (the per-week loops are gone from all three tabs).
4. Run `git grep -n "subWeeks" src/components/dashboard/tabs/` → should return **no matches** in any tab queryFn (only PersonalTab keeps `startOfWeek`/`endOfWeek` for unrelated current-week display at lines 24–25).
5. In each tab, confirm the sparkline query uses `bucketHoursByWeek(data ?? [], today)` and the query key includes `getWeekStamp()`.
6. Confirm CarteraTab's empty-array branch returns `bucketHoursByWeek([], today)` (not `[]`).
7. Run `npx vitest run` → 532 passed / 1 skipped / 0 failed.
8. Run `npm run build` → clean compile.

#### Risk / Rollback

- **Risk:** Low. Three identical refactors backed by a small pure helper with focused unit tests. Sparkline UI is read-only — no mutation paths affected.
- **Rollback:** Revert this PR. The two new files (`weeklyHoursBucket.ts` + its test) are deletable; the three tabs return to the per-week loop form. No data, schema, or API contract is affected.

#### Lovable Preview Reindex

Per the Complement runbook in `AGENTS.md`: this PR introduces **two new files** under `src/components/dashboard/`. If the Lovable preview shows 404 on `/_sandbox/dev-server` after merge, run:
```bash
git commit --allow-empty -m "chore: trigger Lovable preview rebuild"
git push origin sruizmier-performance-v1
```

#### Traceability

- **Plan reference:** CODEX_PLAN_v5 step **S-03** + decisions: helper at `src/components/dashboard/weeklyHoursBucket.ts` (one level above `tabs/`); Cartera empty-portfolio aligned with always-8-buckets; cache-key freshness improvement (`getWeekStamp()`)
- **Branch:** `claude/performance-improvements-DeNVL`
- **Base:** `sruizmier-performance-v1`
- **Commit:** `ca76ef9` — `perf(s-03): collapse 8-week sparkline loops to single-range fetch`
- **PR:** #17 — `perf(s-03): collapse 8-week sparkline loops to single-range fetch`

---

### S-04 — Fix `Cartera` pending-approvals N+1 hours lookup

**Replaces the per-approval inner `time_entries` query (an N+1 anti-pattern that fired one round-trip per pending approval) with a single bulk fetch keyed by composite `(period_id, engagement_id)`. Aggregation is extracted into a pure helper with zero React/Supabase imports and unit-tested across 9 cases. Pending-approvals path drops from `2 + N` round-trips to `3` constant — for a manager with 20 pending approvals: **22 → 3**.**

#### Scope
- Frontend only
- Three files touched: one refactored, two new
- No schema, RPC, edge function, dependency, i18n key, or react-query default change
- Zero KPI drift — all displayed values (hours, engagement metadata, staff name, week start) preserved exactly

#### Files Changed

##### NEW `src/components/dashboard/pendingApprovalsAggregation.ts` (24 lines)

- **Created** a pure helper module exporting:
  - `interface PendingApprovalsTimeEntryRow { period_id: string; engagement_id: string; hours_logged: number | null; }`
  - `compositeKey(periodId: string, engagementId: string): string` — joins with a `:` separator
  - `aggregateHoursByPeriodAndEngagement(rows): Map<string, number>` — sums `hours_logged` per composite key
- **Behavior of `aggregateHoursByPeriodAndEngagement`:**
  - Skips rows whose `period_id` or `engagement_id` is empty/falsy (defensive)
  - Coerces `Number(hours_logged)` and guards with `Number.isFinite` to handle `null`, `NaN`, `Infinity`
  - Sums into the map keyed by `compositeKey(period_id, engagement_id)`
- **Imports:** none. **Zero imports from React, `@tanstack/react-query`, `@/integrations/supabase/client`, or even `date-fns`.** Fully framework-free; can run anywhere TypeScript runs.

##### NEW `src/components/dashboard/__tests__/pendingApprovalsAggregation.test.ts` (9 unit tests)

- **Created** unit tests using hand-crafted fixtures (no Supabase, no mocks):
  1. Empty input → empty map
  2. Single row → one entry with the value
  3. Multiple rows for the same `(period, engagement)` pair sum correctly (3 + 4.5 + 0.5 = 8)
  4. Distinct pairs in distinct buckets — 5-row fixture across 4 distinct `(period, engagement)` pairs, one duplicated
  5. `null` `hours_logged` coerces to 0 (no NaN propagation)
  6. `NaN` and `Infinity` coerce to 0
  7. Rows with empty `period_id` or `engagement_id` are skipped entirely
  8. `compositeKey` joins with colon separator
  9. `compositeKey` does not collide for distinct logical pairs of normal-shaped IDs
- **Result:** 9/9 passing in 8 ms

##### `src/components/dashboard/tabs/CarteraTab.tsx`

###### Imports (top of file)
- **Added** import `aggregateHoursByPeriodAndEngagement, compositeKey from '@/components/dashboard/pendingApprovalsAggregation'`
- All other imports unchanged

###### `pendingApprovals` queryFn (formerly lines 142–204; bulk path now ~lines 175–205)
- **Removed** the per-approval `for (const approval of approvals)` loop that issued one `time_entries.eq(period_id).eq(engagement_id)` Supabase query per iteration
- **Removed** the per-iteration inline `entries?.reduce((sum, e) => sum + e.hours_logged, 0)` aggregation
- **Added** computation of unique `periodIds` and `approvalEngagementIds` arrays from the existing `approvals` list (using `Set` for de-duplication)
- **Added** a single bulk `time_entries` fetch:
  ```ts
  supabase
    .from('time_entries')
    .select('period_id, engagement_id, hours_logged')
    .in('period_id', periodIds)
    .in('engagement_id', approvalEngagementIds)
  ```
  Note on over-fetching: this filter returns the Cartesian-product superset of `(period, engagement)` pairs. Extra rows for combinations not present in the actual approvals list are summed into the map but never looked up — they're harmlessly discarded. For typical manager queues (5–20 approvals) the over-fetch is bounded and trivially smaller than the prior N sequential queries.
- **Added** `const hoursByPair = aggregateHoursByPeriodAndEngagement(entries ?? [])`
- **Added** lookup-based per-approval mapping: `hoursByPair.get(compositeKey(approval.period_id, approval.engagement_id)) ?? 0`
- **Preserved** all other per-approval mapping logic exactly:
  - `engMap.get(approval.engagement_id)` for `engagement_code` / `engagement_name`
  - `period?.staff` for `staff_name` fallback (`short_name || \`${first} ${last}\` || ''` — pre-existing edge case for missing staff fields preserved per scope decision)
  - `period?.week_start_date` for `week_start_date`
  - Insertion order of `approvals` preserved (no sort change)

#### Performance Impact

| Scenario | Round-trips before | Round-trips after |
|---|---|---|
| Manager queue with 20 pending approvals | 1 (engagements) + 1 (approvals) + 20 (per-approval hours) = **22** | 1 + 1 + 1 = **3** |
| Manager queue with 5 pending approvals | 1 + 1 + 5 = **7** | 1 + 1 + 1 = **3** |
| Manager queue with 0 pending approvals | 1 + 1 + 0 = **2** | 1 + 1 + 0 = **2** (unchanged — early-return short-circuit preserved) |

Latency impact is even larger than the count suggests because the prior loop was sequential (`await` per iteration); wall-clock latency grew linearly with approval count.

#### Tests

| Test command | Result |
|---|---|
| `npx vitest run src/components/dashboard/__tests__/pendingApprovalsAggregation.test.ts` | **9/9 passed** (8 ms) |
| `npx vitest run` (full suite) | **541 passed, 1 skipped, 0 failed** across 60 files (was 532 before; the +9 new tests bring the new total to 541) |
| `npm run build` | TypeScript compile clean, Vite build succeeds in 21.40 s |

#### Acceptance Gates (all pass)

- ✅ All existing tests still pass (532 → 541 with the 9 new aggregation tests)
- ✅ New helper has zero React/Supabase imports
- ✅ Pending-approvals path: `2 + N` → `3` constant (or 2 when no approvals — early-return short-circuit)
- ✅ KPI math preserved for `hours` per approval (identical totals)
- ✅ All other per-approval fields (`engagement_code`, `engagement_name`, `staff_name`, `week_start_date`) unchanged
- ✅ No new wildcard `select('*')` introduced
- ✅ No `.in('col', [])` calls — short-circuit at `if (!approvals?.length) return []` preserved
- ✅ Build / TS compile clean

#### Behavior Preservation Guarantees

| Output | Drift |
|---|---|
| `approval_id`, `period_id`, `engagement_id`, `engagement_code`, `engagement_name`, `week_start_date` | None — same fields from same source rows |
| `hours` (per-approval total) | None — same sum, same source filter `(period_id = X, engagement_id = Y)` |
| `staff_name` | None — fallback logic untouched (`short_name || \`${first} ${last}\` || ''`) |
| Sort order | None — insertion order from `approvals` query preserved |
| Empty-result paths (`!staffRecord`, no engagements, no approvals) | None — early returns preserved |
| `enabled: !!staffRecord?.staff_id` query gate | None |

#### Deferred / Out of Scope

- **Pre-existing staff-name edge case** (`staff_name` renders as `"undefined undefined"` when `staff?.first_name` and `staff?.last_name` are both undefined and `short_name` is also empty) is **preserved as-is**. This was approved as deferred before implementation — fixing it belongs in a separate, scoped UX/i18n PR rather than mixed into a perf refactor.

#### What is NOT Changed

- Practica/Personal tabs — untouched
- Cartera's other queries: portfolio (`portfolio` queryFn), weekly trend sparkline (`weeklyTrend` from S-03), KPI totals, drill-down handler — all untouched
- React Query defaults from S-01 — unchanged
- Pure helpers from S-02 (`practicaLeaderboard`) and S-03 (`weeklyHoursBucket`) — unchanged
- Database schema, RPCs, edge functions, migrations
- Translations, theme, design tokens
- Test infra, dependencies (no `package.json` change)

#### Verification Checklist (for reviewer)

To confirm this changelog matches the codebase:
1. Confirm `src/components/dashboard/pendingApprovalsAggregation.ts` exists, exports `aggregateHoursByPeriodAndEngagement` and `compositeKey`, and contains **zero** import statements (the file is dependency-free at runtime).
2. Confirm `src/components/dashboard/__tests__/pendingApprovalsAggregation.test.ts` exists with 9 tests; run `npx vitest run src/components/dashboard/__tests__/pendingApprovalsAggregation.test.ts` → 9/9 pass.
3. Open `src/components/dashboard/tabs/CarteraTab.tsx`, locate the `pendingApprovals` `useQuery` block, and confirm:
   - There is **no** `for (const approval of approvals)` loop
   - There is exactly one `await supabase.from('time_entries')` call inside the bulk-fetch block
   - The function ends with `result.map((approval) => …)` returning the joined row, where `totalHours = hoursByPair.get(compositeKey(...)) ?? 0`
4. Run `git grep -n "for (const approval of approvals)" src/` → should return **no matches**.
5. Run `npx vitest run` → 541 passed / 1 skipped / 0 failed.
6. Run `npm run build` → clean compile.

#### Risk / Rollback

- **Risk:** Low. Single `useQuery` block, single inner-loop replacement. Pure-function extraction makes correctness verifiable from unit tests; the React component just wires data in and out.
- **Rollback:** Revert this PR. The two new files (`pendingApprovalsAggregation.ts` + its test) are deletable; `CarteraTab.tsx` returns to the per-approval loop form. No data, schema, or API contract is affected.

#### Lovable Preview Reindex

This PR introduces **two new files** under `src/components/dashboard/`. Per the runbook in `AGENTS.md` (added by PR #16): if after merge the Lovable preview shows 404 on `/_sandbox/dev-server`, run:
```bash
git commit --allow-empty -m "chore: trigger Lovable preview rebuild"
git push origin sruizmier-performance-v1
```

#### Traceability

- **Plan reference:** CODEX_PLAN_v5 step **S-04** + decisions: helper at `src/components/dashboard/pendingApprovalsAggregation.ts` (matches S-03 location convention); pre-existing staff-name fallback edge case explicitly deferred
- **Branch:** `claude/performance-improvements-DeNVL`
- **Base:** `sruizmier-performance-v1`
- **Commit:** `c463f4a` — `perf(s-04): bulk-fetch Cartera pending-approvals hours, remove N+1`
- **PR:** #18 — `perf(s-04): bulk-fetch Cartera pending-approvals hours, remove N+1`

---

### S-05 — Fix `Encargo` period-key/query mismatch (correctness bug)

**Fixes a silent correctness bug in `EncargoTab`'s "Actual Hours by Category" panel: the query key included `startDateStr` and `endDateStr` (so React Query refetched on period change), but the query body filtered only by `engagement_id` (no date filter), so each refetch returned identical all-time totals. Users saw all-time totals while believing they had selected a specific period. Replaces the date-blind view query with a direct `time_entries` query that actually filters by date, aggregates in JS through a new pure helper, and adds a code-level invariant comment to prevent recurrence.**

#### Scope
- Frontend only (no backend migration in this PR; `vw_actual_hours_by_category_activity` view kept untouched and may be revisited in S-09)
- Three files touched: one refactored, two new
- No schema, RPC, edge function, dependency, i18n key, or react-query default change
- **One intentional, documented behavior change:** the displayed totals now reflect the selected period (this is the bug fix)

#### Files Changed

##### NEW `src/components/dashboard/encargoActualByCategory.ts` (52 lines)

- **Created** a pure aggregation module exporting:
  - `interface ActualHoursTimeEntryRow` — DTO matching the Supabase nested-select shape (`hours_logged`, `staff.category.{category_id, category_name, display_order}`)
  - `interface ActualHoursByCategoryRow` — output DTO (`category_id, category_name, actual_hours, display_order`)
  - `aggregateActualHoursByCategory(rows): ActualHoursByCategoryRow[]`
- **Behavior:**
  - Drops rows whose `staff` or `staff.category` is null (defensive — `!inner` join in the query already filters these server-side)
  - Coerces `Number(hours_logged)` and guards with `Number.isFinite` to handle `null`, `NaN`, `Infinity`
  - Defaults missing `category_name` to `''` (matches prior line 142 behavior)
  - Defaults missing `display_order` to `99` (matches prior line 144 behavior)
  - Sorts ascending by `display_order` (matches prior line 150 behavior)
- **Imports:** none. **Zero imports from React, `@tanstack/react-query`, `@/integrations/supabase/client`, or `date-fns`.** Fully framework-free.

##### NEW `src/components/dashboard/__tests__/encargoActualByCategory.test.ts` (7 unit tests)

- **Created** unit tests using hand-crafted fixtures (no Supabase, no mocks):
  1. Empty rows → `[]`
  2. Single row → one category with the value
  3. Multiple rows same category → summed (3 + 4.5 + 0.5 = 8)
  4. Multiple categories → sorted ascending by `display_order` (verified via 3-category fixture with shuffled input order)
  5. `null`/`NaN` `hours_logged` → coerce to 0
  6. Rows with `staff = null` OR `staff.category = null` → dropped
  7. Missing `display_order` defaults to 99 and missing `category_name` defaults to `''`
- **Result:** 7/7 passing in 6 ms

##### `src/components/dashboard/tabs/EncargoTab.tsx`

###### Imports (top of file)
- **Added** `import { aggregateActualHoursByCategory, type ActualHoursTimeEntryRow } from "@/components/dashboard/encargoActualByCategory"`

###### `actualByCategory` queryFn (formerly lines 122–153)
- **Added** an `INVARIANT` comment immediately above the queryFn:
  ```ts
  // INVARIANT: every queryKey parameter must affect the query body. Do not add date params
  // to the key without filtering on them — see CHANGELOG S-05 for the bug this prevents.
  ```
- **Removed** the date-blind view query:
  ```ts
  supabase
    .from('vw_actual_hours_by_category_activity')
    .select('*')
    .eq('engagement_id', selectedEngagementId)
  ```
- **Removed** the inline `categoryMap` aggregation (lines 136–148 in the prior file)
- **Added** a direct `time_entries` query that actually respects the period:
  ```ts
  supabase
    .from('time_entries')
    .select(`
      hours_logged,
      staff:staff!inner(
        category:categories!inner(category_id, category_name, display_order)
      )
    `)
    .eq('engagement_id', selectedEngagementId)
    .eq('is_forecast', false)
    .gte('date_worked', startDateStr)
    .lte('date_worked', endDateStr)
  ```
- **Added** `return aggregateActualHoursByCategory((data ?? []) as unknown as ActualHoursTimeEntryRow[])`

###### Notes on the new query
- `is_forecast = false` filter explicitly preserved — the prior view (`docs/database-schema.sql:381`) had this in its WHERE clause; the new direct query replicates it to prevent forecast hours from being counted as actuals
- `staff:staff!inner(...)` and `category:categories!inner(...)` use Supabase's `!inner` join syntax (matches the `!inner` pattern already used at `PracticaTab.tsx:166`) so the result type is non-nullable and rows with missing staff/category are dropped server-side
- Wildcard `select('*')` was removed; the new select is explicit-column

#### Behavior Preservation Guarantees

| Output | Drift |
|---|---|
| Output array shape (`category_id, category_name, actual_hours, display_order`) | None — exactly matches prior shape |
| Sort order (ascending `display_order`) | None |
| Default `display_order = 99` for missing | None |
| Default `category_name = ''` for missing | None |
| `is_forecast = false` filter | None — preserved (was implicit in the view's WHERE clause) |
| **`actual_hours` totals** | **Now period-filtered.** Previously: all-time sum across the engagement's entire history. Now: sum for `[startDateStr, endDateStr]`. **This is the bug fix.** Reviewer must visually confirm new totals are sensible: they should be ≤ the prior all-time totals, equal only when the selected period covers all the engagement's history. |
| Other Encargo queries (`engagementData`, `budgetData`, `woSummary`, `categoryBudget`, `hoursByStatus`) | None — untouched |

#### Performance / Trade-off Note

The new query fetches one row per `(staff_id, activity_id, date_worked)` for the engagement in the selected period — vs. the prior view's pre-aggregated rows per `(category, activity)` pair. For typical period sizes (e.g., 28 days × 10 staff × 5 activities ≈ ~1400 rows worst case, often far less), this is acceptable: aggregation is JS-side O(N) on a tiny set and network transfer is bounded by the period. If scale becomes an issue on long periods or high-volume engagements, S-09 (backend contract) is the natural place to introduce a date-aware pre-aggregated view or RPC.

#### Tests

| Test command | Result |
|---|---|
| `npx vitest run src/components/dashboard/__tests__/encargoActualByCategory.test.ts` | **7/7 passed** (6 ms) |
| `npx vitest run` (full suite) | **548 passed, 1 skipped, 0 failed** across 61 files (was 541; +7 new = 548) |
| `npm run build` | TypeScript compile clean, Vite build succeeds in 15.79 s |

#### Acceptance Gates (all pass)

- ✅ All existing tests still pass (541 → 548 with the 7 new aggregation tests)
- ✅ Query body now respects `startDateStr` and `endDateStr`
- ✅ Output shape (`category_id, category_name, actual_hours, display_order`) unchanged
- ✅ `is_forecast = false` filter preserved
- ✅ Pure helper has zero React/Supabase imports
- ✅ Invariant comment added above the queryFn
- ✅ No new wildcard `select('*')` introduced; the new query is explicit-column
- ✅ Build / TS compile clean

#### What is NOT Changed

- The `vw_actual_hours_by_category_activity` view itself — left untouched (consumer simply switched away from it; the view may still be used by other consumers)
- Other Encargo queries (`engagementData`, `budgetData`, `woSummary`, `categoryBudget`, `hoursByStatus`) — untouched
- Practica, Cartera, Personal tabs — untouched
- React Query defaults from S-01 — unchanged
- Pure helpers from S-02, S-03, S-04 — unchanged
- Database schema, RPCs, edge functions, migrations
- Translations, theme, design tokens
- Test infra, dependencies (no `package.json` change)

#### Verification Checklist (for reviewer)

To confirm this changelog matches the codebase:
1. Confirm `src/components/dashboard/encargoActualByCategory.ts` exists, exports `aggregateActualHoursByCategory` and the two interfaces, and contains **zero** import statements (the file is dependency-free at runtime).
2. Confirm `src/components/dashboard/__tests__/encargoActualByCategory.test.ts` exists with 7 tests; run `npx vitest run src/components/dashboard/__tests__/encargoActualByCategory.test.ts` → 7/7 pass.
3. Open `src/components/dashboard/tabs/EncargoTab.tsx`, locate the `actualByCategory` `useQuery` block, and confirm:
   - The `INVARIANT` comment is present immediately above the `useQuery` call
   - The query body uses `time_entries` (not `vw_actual_hours_by_category_activity`)
   - The query has `.eq('is_forecast', false)`, `.gte('date_worked', startDateStr)`, and `.lte('date_worked', endDateStr)`
   - The function ends with `return aggregateActualHoursByCategory(...)`
4. Run `git grep -n "vw_actual_hours_by_category_activity" src/` → should return **no matches** (the view is no longer referenced from the frontend).
5. Run `npx vitest run` → 548 passed / 1 skipped / 0 failed.
6. Run `npm run build` → clean compile.
7. **Visual smoke test:** open the Encargo tab in the running app, select an engagement, and change the period selector. The "Actual Hours by Category" panel totals should now change with the period (they would have been static before this PR).

#### Risk / Rollback

- **Risk:** Low-medium. This is a correctness fix, not a refactor. The displayed values **will change** for any user with a non-empty period filter (which is virtually all users). Reviewer should visually confirm the new totals are sensible (smaller than or equal to the prior all-time totals).
- **Rollback:** Revert this PR. The two new files deletable; queryFn returns to the view-based all-time form. **Note: rolling back restores the bug** — users will once again see all-time totals while believing they've selected a period.

#### Lovable Preview Reindex

This PR introduces **two new files** under `src/components/dashboard/`. Per the runbook in `AGENTS.md` (added by PR #16): if after merge the Lovable preview shows 404 on `/_sandbox/dev-server`, run:
```bash
git commit --allow-empty -m "chore: trigger Lovable preview rebuild"
git push origin sruizmier-performance-v1
```

#### Traceability

- **Plan reference:** CODEX_PLAN_v5 step **S-05** + decisions: period-sensitive over all-time (matches plan recommendation and tab convention); helper at `src/components/dashboard/encargoActualByCategory.ts` (matches S-03/S-04 location convention); per-row-shape trade-off accepted (S-09 may re-introduce a pre-aggregated date-aware view if scale demands it)
- **Branch:** `claude/performance-improvements-DeNVL`
- **Base:** `sruizmier-performance-v1`
- **Commit:** `dea1d98` — `perf(s-05): fix Encargo period-key/query mismatch (correctness bug)`
- **PR:** #19 — `perf(s-05): fix Encargo period-key/query mismatch (correctness bug)`

---

### S-06 — Replace `select('*')` with explicit columns in dashboard hot paths

**Pure column-narrowing sweep across the three dashboard tabs that consume Supabase views and tables. Five wildcard selects on data-returning queries replaced with explicit column lists matching the audited consumer set; two idiomatic `count: 'exact', head: true` wildcards left untouched (they don't return rows). Reduces network payload + JSON parse overhead per dashboard tab load and gives TypeScript schema-evolution coverage — a future column rename in the database now surfaces as a build-time error at the consumer line, instead of a silent `undefined` at runtime.**

#### Scope
- Frontend only
- Three files touched (one diff each, except EncargoTab which has three)
- No new files, no new tests, no new dependencies
- No schema, RPC, edge function, i18n, or react-query default change
- Zero KPI drift — same columns sourced, same math, same display

#### Files Changed

##### `src/components/dashboard/tabs/EncargoTab.tsx` (3 edits)

###### `budgetData` queryFn (line 79) — `vw_budget_vs_actual_hours_by_category_activity`
- **Before:** `.select('*')`
- **After:** `.select('activity_id, activity_code, activity_description, actual_hours, budget_hours, category_display_order')`
- **Audited consumers:**
  - `activity_id` — React `key` at `EncargoTab.tsx:509`
  - `activity_code` — table cell at line 511; also used in `.order('activity_code')` server-side (line 82)
  - `activity_description` — table cell at line 514
  - `actual_hours` — filter (line 256), sort (line 257), display (line 517)
  - `budget_hours` — filter (line 256)
  - `category_display_order` — used in `.order('category_display_order')` server-side (line 81); included in select defensively to avoid Supabase typing concerns about narrowed row types
- View has 12 columns; new select retrieves 6. **50% column reduction.**

###### `woSummary` queryFn (line 98) — `work_order_summary`
- **Before:** `.select('*')`
- **After:** `.select('fee_with_tax_gross_up, total_standard_fee, realization_percent')`
- **Audited consumers:**
  - `fee_with_tax_gross_up` — `agreedFee` at line 223
  - `total_standard_fee` — `standardFee` at line 224
  - `realization_percent` — `realizationPercent` at line 225
- View has many columns (financial summary); new select retrieves 3.

###### `categoryBudget` queryFn (line 116) — `vw_wo_budget_hours_by_category`
- **Before:** `.select('*')`
- **After:** `.select('category_id, category_name, total_budget_hours, category_display_order')`
- **Audited consumers:**
  - `category_id` — find/key at lines 238, 245
  - `category_name` — display at line 246
  - `total_budget_hours` — sum at line 217, value at line 239
  - `category_display_order` — `.order()` server-side (line 118); included defensively
- View has 6 columns; new select retrieves 4.

##### `src/components/dashboard/tabs/PracticaTab.tsx` (1 edit)

###### `woSummaries` query inside `practiceMetrics` queryFn (line 74) — `work_order_summary`
- **Before:** `.select('*')`
- **After:** `.select('total_standard_fee, adjustment_amount')`
- **Audited consumers:**
  - `total_standard_fee` — sum at line 131, term in `adjustedFee` at line 132
  - `adjustment_amount` — term in `adjustedFee` at line 132
- This is a separate `work_order_summary` query from EncargoTab's; PracticaTab consumes only 2 columns whereas EncargoTab consumes 3. Each call site now narrowed to its own minimum column set.

##### `src/components/dashboard/tabs/PersonalTab.tsx` (1 edit)

###### `timesheetPeriod` queryFn (line 167) — `timesheet_periods`
- **Before:** `.select('*')`
- **After:** `.select('deadline, submitted_at')`
- **Audited consumers:**
  - `deadline` — `parseISO` at lines 194–195
  - `submitted_at` — conditional render at line 330
- `timesheet_periods` is one of the larger tables in the schema; this narrowing has the highest absolute payload reduction of the five edits.

#### Wildcards Intentionally Left Untouched

| File:line | Source | Why kept |
|---|---|---|
| `PracticaTab.tsx:94` | `timesheet_line_approvals` | `count: 'exact', head: true` — count-only query, returns no rows; `*` is idiomatic and replacing it adds noise without benefit |
| `PersonalTab.tsx:105` | (count-only query) | Same reason |

After this PR: `git grep "select('\*')" src/components/dashboard/tabs/` returns exactly these two count-only matches.

#### Behavior Preservation Guarantees

| Behavior | Drift |
|---|---|
| Every consumed value (totals, displays, flags, sorts) | None — same columns sourced, same math |
| Server-side ordering (`.order(...)` calls) | None — `.order()` works regardless of select; defensive inclusion of `category_display_order` ensures Supabase TypeScript narrowing never affects sort behavior |
| Network payload size per response | **Reduced** — only consumed columns transit |
| Parse overhead (JSON deserialization) | **Reduced** — fewer keys per row |
| Schema-evolution safety | **Improved** — column rename in DB now surfaces as TS error at consumer line, not as silent `undefined` at runtime |

#### Tests

| Test command | Result |
|---|---|
| `npm run build` (primary correctness gate — TS catches missed columns) | **Clean** — 15.15 s |
| `npx vitest run` (full suite) | **548 passed, 1 skipped, 0 failed** across 61 files (unchanged from S-05; this PR adds no new tests) |

No new tests added per plan: TypeScript is the right gate for column-narrowing changes. Adding unit tests for "this column is selected" would test the framework, not the code.

#### Acceptance Gates (all pass)

- ✅ All 5 wildcards on data-returning queries replaced with explicit column lists
- ✅ The 2 idiomatic `count: 'exact', head: true` wildcards left untouched (verified via `git grep`)
- ✅ All existing tests still pass (548 → 548)
- ✅ `npm run build` clean (TS would have caught any forgotten consumed column)
- ✅ Zero KPI drift (consumer behavior identical)
- ✅ No new files, no new dependencies

#### What is NOT Changed

- The two count-only wildcards intentionally preserved
- All explicit selects already in use elsewhere in the dashboard (e.g. `PracticaTab.tsx:80` already explicit) — untouched
- React Query defaults from S-01 — unchanged
- Pure helpers from S-02, S-03, S-04, S-05 — unchanged
- Database schema, RPCs, edge functions, migrations
- Translations, theme, design tokens
- Test infra, dependencies (no `package.json` change)

#### Verification Checklist (for reviewer)

To confirm this changelog matches the codebase:
1. Run `git grep "select('\*')" src/components/dashboard/tabs/` → exactly 2 matches, both `count: 'exact', head: true`.
2. Open `EncargoTab.tsx`, lines around 79 / 98 / 116 — confirm explicit column lists matching the table above.
3. Open `PracticaTab.tsx` line 74 — confirm `'total_standard_fee, adjustment_amount'`.
4. Open `PersonalTab.tsx` line 167 — confirm `'deadline, submitted_at'`.
5. Run `npm run build` → clean compile.
6. Run `npx vitest run` → 548 passed / 1 skipped / 0 failed.
7. **Visual smoke test:** open each tab in the running app — Encargo, Practica, Personal — and verify that all displayed values (KPI cards, leaderboard, category breakdown, activity breakdown, timesheet status / deadline) render identically to before.

#### Risk / Rollback

- **Risk:** Very low. Pure narrowing — no logic changes. The only failure mode (forgetting a consumed column) is caught by TypeScript at build time, not runtime.
- **Rollback:** Revert this PR. Five small line-level diffs revert cleanly; no dependent state.

#### Lovable Preview Reindex

This PR introduces **no new files** — all five edits modify existing tab files that Lovable's index already knows about. Reindex risk is therefore minimal. If preview shows 404 on `/_sandbox/dev-server`, the same runbook command applies (per `AGENTS.md`):
```bash
git commit --allow-empty -m "chore: trigger Lovable preview rebuild"
git push origin sruizmier-performance-v1
```

#### Traceability

- **Plan reference:** CODEX_PLAN_v5 step **S-06** + decisions: defensive inclusion of `.order()` columns; count-only wildcards left as-is per recommendation
- **Branch:** `claude/performance-improvements-DeNVL`
- **Base:** `sruizmier-performance-v1`
- **Commit:** `2849541` — `perf(s-06): replace select('*') with explicit columns in dashboard hot paths`
- **PR:** #20 — `perf(s-06): replace select('*') with explicit columns in dashboard hot paths`

---

### S-07a — Query hardening utilities (Part 1: helpers + adoption)

**Adds two pure-utility helpers (`safeNumber`, `hasItems`) at `src/lib/queryHelpers.ts` and adopts them across four dashboard tabs and four prior aggregation helpers as a single source of truth for numeric coercion and non-empty-array checks. Behavior is identical for all real-world inputs the dashboard sees, but `safeNumber` is strictly safer against `±Infinity` (the prior `Number(value) || 0` pattern would have leaked `Infinity` through a falsy-check), and `hasItems` provides TypeScript type narrowing for downstream usage. S-07b will follow with abort-signal threading across all dashboard queryFns.**

#### Scope
- Frontend only — Part 1 of the split S-07
- Two new files (helper + tests); seven existing files lightly edited (4 tabs + 3 of the 4 prior aggregation helpers + 1 helper renamed and re-imported)
- No schema, RPC, edge function, dependency, or i18n change
- No KPI drift in observed behavior — all values produced by `safeNumber(x)` for the actual `number | null` DB columns are identical to the prior `Number(x || 0)` and `Number.isFinite(value) ? value : 0` patterns

#### Files Changed

##### NEW `src/lib/queryHelpers.ts` (15 lines)

- **Created** a dependency-free utilities module exporting:
  - `safeNumber(value: unknown): number` — coerces any input to a finite number; returns 0 for `null`, `undefined`, `NaN`, `±Infinity`, non-numeric strings, objects, arrays, and any other non-finite value
  - `hasItems<T>(arr: readonly T[] | null | undefined): arr is readonly T[]` — type guard that returns `true` iff `arr` is a non-empty array; narrows the type to `readonly T[]` after a positive check
- **Imports:** none. **Zero imports** — runtime-free utilities.

##### NEW `src/lib/__tests__/queryHelpers.test.ts` (14 unit tests)

- **Created** unit tests covering:
  - `safeNumber` (8 cases): valid number, numeric string, `null`, `undefined`, `NaN`, `±Infinity`, non-numeric strings, objects/arrays/booleans
  - `hasItems` (5 cases): empty array, `null`, `undefined`, single-element, multi-element
  - `hasItems` type narrowing (1 case): TS-only assertion that after a positive `hasItems` check, the value is narrowed enough to access `.length` and indexing without further null guards
- **Result:** 14/14 passing in 5 ms

##### `src/components/dashboard/tabs/practicaLeaderboard.ts`
- **Removed** the local `toNumber(value)` helper (formerly lines 49–50): `value == null ? 0 : Number(value) || 0`
- **Added** `import { safeNumber } from '@/lib/queryHelpers'` at the top
- **Replaced** all 3 internal `toNumber(...)` call sites (per-engagement hours sum, fee sum, budget sum) with `safeNumber(...)`
- **Behavior note:** the prior `toNumber` used `Number(value) || 0` which leaked `Infinity` through (Infinity is truthy). The new `safeNumber` returns 0 for `±Infinity`. In practice DB numeric columns don't return Infinity, so this is a defensive improvement, not an observed bug fix.

##### `src/components/dashboard/weeklyHoursBucket.ts`
- **Added** `import { safeNumber } from '@/lib/queryHelpers'`
- **Replaced** the inline `const value = Number(row.hours_logged); ... + (Number.isFinite(value) ? value : 0)` pattern with a direct `+ safeNumber(row.hours_logged)`. Behavior identical.

##### `src/components/dashboard/pendingApprovalsAggregation.ts`
- **Added** `import { safeNumber } from '@/lib/queryHelpers'`
- **Replaced** the inline `const value = Number(row.hours_logged); const safe = Number.isFinite(value) ? value : 0; result.set(key, ... + safe);` pattern with `result.set(key, ... + safeNumber(row.hours_logged));`. Behavior identical.

##### `src/components/dashboard/encargoActualByCategory.ts`
- **Added** `import { safeNumber } from '@/lib/queryHelpers'`
- **Replaced** the inline `const value = Number(row.hours_logged); const safe = Number.isFinite(value) ? value : 0;` pattern with `const safe = safeNumber(row.hours_logged);`. Behavior identical.

##### `src/components/dashboard/tabs/EncargoTab.tsx`
- **Added** `import { safeNumber, hasItems } from "@/lib/queryHelpers"`
- **Replaced** 9 `Number(x || 0)` and `Number(x)` patterns with `safeNumber(x)`:
  - `totalBudgetHours` reduce at line 217
  - `totalActualHours` reduce at line 218
  - `budgetHours` and `actualHours` constants at lines 239–240
  - `activityBreakdown` filter (`a.actual_hours`, `a.budget_hours`) at line 256
  - `activityBreakdown` sort (`a.actual_hours`, `b.actual_hours`) at line 257
  - `act.actual_hours` display at line 517
  - `entry.hours_logged` accumulation in `hoursByStatus` queryFn at lines 204, 206
  - `entries.reduce` total at line 181
- **Replaced** 2 inline empty-array guards with `hasItems`:
  - `if (!entries || entries.length === 0)` → `if (!hasItems(entries))` (line 174)
  - `if (periodIds.length === 0)` → `if (!hasItems(periodIds))` (line 179)
- Also changed `actualByEngagement.get(...) || 0` and `budgetByEngagement.get(...) || 0` to `... ?? 0` for clarity (these were not in the formal `safeNumber` mandate but are co-located edits in the same blocks)

##### `src/components/dashboard/tabs/PracticaTab.tsx`
- **Added** `import { safeNumber, hasItems } from "@/lib/queryHelpers"`
- **Replaced** 4 `Number(x || 0)` patterns with `safeNumber(x)`:
  - `budgetByEngagement` set at line 102
  - `actualByEngagement` set at line 109
  - `totalStandardFees` accumulation at line 131
  - `adjustedFee` term at line 132
- **Replaced** 2 inline empty-array guards with `hasItems`:
  - `if (!partners?.length)` → `if (!hasItems(partners))` (line 172)
  - `if (engagementIds.length === 0)` → `if (!hasItems(engagementIds))` (line 189)
- Also changed `Map.get(...) || 0` to `... ?? 0` in the budget/actual aggregation blocks for consistency

##### `src/components/dashboard/tabs/CarteraTab.tsx`
- **Added** `import { hasItems } from '@/lib/queryHelpers'`
- **Replaced** 4 inline empty-array guards with `hasItems`:
  - `if (!engagements?.length)` → `if (!hasItems(engagements))` (line 76)
  - `if (!myEngagements?.length)` → `if (!hasItems(myEngagements))` (line 158)
  - `if (!approvals?.length)` → `if (!hasItems(approvals))` (line 178)
  - `if (engagementIds.length === 0)` → `if (!hasItems(engagementIds))` (line 236)
- No `safeNumber` adoptions in this tab — CarteraTab's queryFns delegate all numeric aggregation to the four pure helpers, which were already updated above.

##### `src/components/dashboard/tabs/PersonalTab.tsx`
- No edits in S-07a — PersonalTab's queryFns don't have inline `Number(x || 0)` patterns or empty-array guards (its `!staffRecord?.staff_id` checks are object-presence, not array-presence). Will be touched in S-07b for abort-signal threading.

#### What is NOT Changed (Out of Scope for S-07a)

- **Abort-signal threading** — deferred to S-07b. No `useQuery` queryFn signatures or `.abortSignal(...)` chains touched.
- **JSX render guards** (e.g., `portfolio?.length === 0 ? <empty/> : <full/>` in `CarteraTab.tsx:359, 446, 495` and `PracticaTab.tsx:485`) — left as inline patterns. `hasItems` adoption in these sites would invert the predicate and reduce JSX readability without correctness benefit.
- **`Number(x).toFixed(...)` and `Math.round(Number(x))` patterns** that were already type-safe — preserved.
- **The four prior helpers' tests** (S-02/S-03/S-04/S-05) — unchanged. Their assertions hold against the new `safeNumber` adoption because behavior is identical for all the test fixtures.

#### Behavior Preservation Guarantees

| Behavior | Drift |
|---|---|
| All KPI values, sums, filters, sorts on dashboard | None — `safeNumber(x)` and `Number(x || 0)` produce identical results for `null`, `undefined`, `0`, and finite numbers (the actual values DB returns) |
| Dashboard empty-state rendering | None — `!hasItems(x)` and `!x?.length` produce identical truthiness for arrays/null/undefined |
| Defensive coverage of `±Infinity` in numeric helpers | **Improved** — `safeNumber(±Infinity) === 0`, whereas `Number(±Infinity) || 0 === ±Infinity`. No observed bug fixed; defensive hardening only. |
| Type narrowing after empty-array check | **Improved** — `hasItems(arr)` narrows to non-null array; the prior `!arr?.length` did not |
| The four pure aggregation helpers' outputs | None — `safeNumber` is mathematically identical to the inline `Number.isFinite`-guarded coercion they used before |

#### Performance Impact

**None measurable.** This step is consistency + defensive correctness, not performance. The function-call overhead of `safeNumber(x)` vs. inline `Number(x || 0)` is negligible (V8 inlines tiny pure functions). Bundle size impact: ~150 bytes added (gzipped) for the helper module.

#### Tests

| Test command | Result |
|---|---|
| `npx vitest run src/lib/__tests__/queryHelpers.test.ts` | **14/14 passed** (5 ms) |
| `npx vitest run` (the four prior helpers' test files, post-adoption) | **34/34 passed** — `practicaLeaderboard` (9), `weeklyHoursBucket` (9), `pendingApprovalsAggregation` (9), `encargoActualByCategory` (7) |
| `npx vitest run` (full suite) | **562 passed, 1 skipped, 0 failed** across 62 files (was 548; +14 new = 562) |
| `npm run build` | TypeScript compile clean, Vite build succeeds in 13.22 s |

#### Acceptance Gates (all pass)

- ✅ All existing tests still pass (548 → 562 with 14 new helper tests)
- ✅ New helper file has zero runtime imports
- ✅ All 11 inline `Number(x || 0)` patterns in dashboard tabs replaced with `safeNumber(x)` (plus 4 additional `Number(x)`-without-fallback sites also tightened)
- ✅ All 4 prior aggregation helpers' inline coercion replaced with `safeNumber` for one source of truth
- ✅ All 8 inline empty-array guards in dashboard queryFn early returns replaced with `hasItems`
- ✅ JSX render guards intentionally preserved (different idiom, no correctness benefit)
- ✅ `npm run build` clean
- ✅ Zero observable KPI drift

#### Verification Checklist (for reviewer)

To confirm this changelog matches the codebase:
1. Confirm `src/lib/queryHelpers.ts` exists, exports `safeNumber` and `hasItems`, and contains **zero** import statements.
2. Confirm `src/lib/__tests__/queryHelpers.test.ts` exists with 14 tests; run targeted test → 14/14 pass.
3. Run `git grep -n "Number([a-zA-Z_.?\[\]]\+ || 0)" src/components/dashboard/tabs/` → should return **no matches** (all such patterns replaced).
4. Run `git grep -n "from '@/lib/queryHelpers'" src/` → should return at least 8 matches (1 test + 4 prior helpers + 3 dashboard tabs that adopted; PersonalTab will appear in S-07b).
5. Run `npx vitest run` → 562 passed / 1 skipped / 0 failed.
6. Run `npm run build` → clean compile.
7. **Visual smoke test:** open each dashboard tab — Practica, Cartera, Encargo, Personal — and verify all KPI cards, leaderboard, sparklines, category breakdown, activity breakdown, and pending approvals render identically to before.

#### Risk / Rollback

- **Risk:** Very low. Adoption of helpers with mathematically identical behavior; TypeScript guardrails on every site. No new dependencies, no new files in `src/components/dashboard/tabs/` (the new helper lives in `src/lib/`).
- **Rollback:** Revert PR. The two new files deletable; tabs and prior helpers revert to their inline patterns.

#### Lovable Preview Reindex

This PR introduces **two new files** under `src/lib/` (a new pattern for this remediation — earlier steps added under `src/components/dashboard/`). Per `AGENTS.md`: if after merge the preview shows 404 on `/_sandbox/dev-server`, run:
```bash
git commit --allow-empty -m "chore: trigger Lovable preview rebuild"
git push origin sruizmier-performance-v1
```

#### Traceability

- **Plan reference:** CODEX_PLAN_v5 step **S-07** (split into S-07a + S-07b per agreement) + decisions: adopt inside the four prior aggregation helpers (one source of truth); skip rapid-navigation integration test (deferred to S-12)
- **Branch:** `claude/performance-improvements-DeNVL`
- **Base:** `sruizmier-performance-v1`
- **Commit:** `57d8452` — `perf(s-07a): add safeNumber + hasItems query helpers and adopt`
- **PR:** #21 — `perf(s-07a): add safeNumber + hasItems query helpers and adopt`

---

### S-07b — Thread abort signals through dashboard queryFns (Part 2)

**Threads React Query's per-query `AbortSignal` through every Supabase call inside the four dashboard tabs' 18 useQuery queryFns. When a user changes the period selector, switches engagement, or navigates between tabs while requests are still in flight, the still-pending HTTP requests now actually get cancelled (server stops processing, network connection released) instead of completing and being silently discarded by React Query. Pure HTTP-cancellation wiring; no logic changes, no new files.**

#### Scope
- Frontend only — Part 2 of the split S-07
- Four files edited (the four dashboard tab files); no new files, no new tests
- No schema, RPC, edge function, dependency, or i18n change
- Zero KPI drift on completed queries — `.abortSignal(signal)` only takes effect when React Query cancels mid-flight

#### Why this matters

React Query v5 already creates an `AbortController` per query and aborts when the query is cancelled (period change, tab switch, component unmount). **Without** `.abortSignal(signal)` chained on the Supabase query:

- The cancellation is observed in JS state — React Query marks the query as cancelled
- BUT the underlying `fetch()` is **not** cancelled — the HTTP request completes server-side and the response is silently dropped on the client

**With** `.abortSignal(signal)`:

- The `fetch()` itself is cancelled (Supabase passes the signal through to `fetch`)
- Server-side processing stops as soon as the cancellation propagates
- Network connection released
- No wasted bandwidth, no wasted server CPU on results that will never be used

The Supabase v2 `.abortSignal(signal): this` method is on `PostgrestTransformBuilder` — chainable freely with all other builder methods including `.single()`/`.maybeSingle()`. Verified in `node_modules/@supabase/postgrest-js/dist/cjs/PostgrestTransformBuilder.d.ts`.

#### Files Changed

##### `src/components/dashboard/tabs/PracticaTab.tsx` (3 queryFns, 11 Supabase calls)

| queryFn | Supabase calls receiving `.abortSignal(signal)` |
|---|---|
| `practiceMetrics` | 5 — `engagements`, `work_order_summary`, `vw_wo_budget_hours_by_category`, `time_entries`, `timesheet_line_approvals` (count) |
| `partnerLeaderboard` | 5 — `staff` (partners), `engagements` (rows), and 3 inside `Promise.all([...])` (`time_entries`, `work_order_summary`, `vw_wo_budget_hours_by_category`) |
| `weeklyTrend` | 1 — `time_entries` |

When the main signal aborts, all three parallel `Promise.all` requests are cancelled together.

##### `src/components/dashboard/tabs/CarteraTab.tsx` (3 queryFns, 9 Supabase calls)

| queryFn | Supabase calls receiving `.abortSignal(signal)` |
|---|---|
| `portfolio` | 4 — `engagements`, `work_order_summary`, `vw_wo_budget_hours_by_category`, `time_entries` |
| `pendingApprovals` | 3 — `engagements` (myEngagements), `timesheet_line_approvals`, `time_entries` (bulk) |
| `weeklyTrend` | 2 — `engagements`, `time_entries` |

##### `src/components/dashboard/tabs/EncargoTab.tsx` (6 queryFns, 7 Supabase calls)

| queryFn | Supabase calls receiving `.abortSignal(signal)` |
|---|---|
| `engagementData` | 1 — `engagements` (with nested joins, `.single()`) — placement: `.abortSignal(signal).single()` |
| `budgetData` | 1 — `vw_budget_vs_actual_hours_by_category_activity` |
| `woSummary` | 1 — `work_order_summary` (`.single()`) — placement: `.abortSignal(signal).single()` |
| `categoryBudget` | 1 — `vw_wo_budget_hours_by_category` |
| `actualByCategory` | 1 — `time_entries` (with nested staff/category joins) |
| `hoursByStatus` | 2 — `time_entries`, `timesheet_line_approvals` |

##### `src/components/dashboard/tabs/PersonalTab.tsx` (6 queryFns, 6 Supabase calls)

| queryFn | Supabase calls receiving `.abortSignal(signal)` |
|---|---|
| `weekTimeEntries` | 1 — `time_entries` |
| `weeklyTrend` | 1 — `time_entries` |
| `monthHours` | 1 — `time_entries` |
| `pendingApprovals` | 1 — `timesheet_line_approvals` (count, head: true) |
| `engagementHours` | 1 — `time_entries` (with engagement nested join) |
| `timesheetPeriod` | 1 — `timesheet_periods` (`.maybeSingle()`) — placement: `.abortSignal(signal).maybeSingle()` |

#### Total

- **18 queryFns** received the `{ signal }` parameter (verified by `grep -cE "queryFn: async \(\{ signal" src/components/dashboard/tabs/*.tsx`: 3+3+6+6=18)
- **33 Supabase calls** received `.abortSignal(signal)` (verified by `grep -cE "\.abortSignal\(signal\)" src/components/dashboard/tabs/*.tsx`: 11+9+7+6=33)

#### Implementation pattern

**Standard chain (returns array):**
```ts
queryFn: async ({ signal }) => {
  const { data } = await supabase
    .from('...')
    .select(...)
    .eq(...)
    .abortSignal(signal);
  ...
}
```

**With `.single()` / `.maybeSingle()`:**
```ts
const { data } = await supabase
  .from('...')
  .select(...)
  .eq(...)
  .abortSignal(signal)
  .single();
```

**Inside `Promise.all([...])`** (e.g. `PracticaTab.tsx` `partnerLeaderboard`):
```ts
const [a, b, c] = await Promise.all([
  supabase.from('...').select(...).abortSignal(signal),
  supabase.from('...').select(...).abortSignal(signal),
  supabase.from('...').select(...).abortSignal(signal),
]);
```

#### Behavior Preservation Guarantees

| Behavior | Drift |
|---|---|
| Successful query results | None — `.abortSignal(signal)` only takes effect when React Query cancels mid-flight; for completed queries, the HTTP request is unaffected |
| Cancelled query handling | **Improved** — cancelled HTTP requests now actually cancel server-side; previously the response was silently dropped on the client after server-side completion |
| Error handling | None — `.abortSignal(signal)` returns the same builder; cancellation surfaces as `AbortError`, which React Query already handles via the cancellation lifecycle |
| KPI values, totals, sorts, displays | None |
| Query keys, query enabled state, default options from S-01 | None |
| Network request count for completed loads | None |
| Network request count under rapid navigation | **Reduced** — the cancelled request is killed instead of going through to completion |

#### Validation Strategy (used during implementation)

Per the agreed cadence, each tab was edited individually with `npm run build` between each. Order: PracticaTab → CarteraTab → EncargoTab → PersonalTab. All four built clean after their respective edits. Catches any signature mismatch at the file level before propagating across files.

#### Tests

| Test command | Result |
|---|---|
| `npm run build` (TS — primary correctness gate for the threading mechanical change) | **Clean** after each tab; final clean in 13.95 s |
| `npx vitest run` (full suite) | **562 passed, 1 skipped, 0 failed** across 62 files (unchanged from S-07a baseline; this PR adds no new tests) |

No new tests added per agreement (rapid-navigation integration test deferred to S-12). The mechanism is provided by:
- React Query v5 (well-tested upstream — passes `signal` to queryFn)
- Supabase v2 `.abortSignal(signal)` (well-tested upstream — passes signal to underlying `fetch`)

Our responsibility is wiring them together correctly. TypeScript catches any signature mismatch at build time.

#### Acceptance Gates (all pass)

- ✅ All 18 dashboard queryFns receive the `{ signal }` parameter
- ✅ All 33 Supabase calls inside dashboard queryFns chain `.abortSignal(signal)`
- ✅ All existing tests still pass (562 → 562)
- ✅ `npm run build` clean
- ✅ Zero KPI drift (this is purely HTTP-cancellation wiring; results returned by completed queries are unchanged)

#### What is NOT Changed

- Any pure helper file (`practicaLeaderboard.ts`, `weeklyHoursBucket.ts`, `pendingApprovalsAggregation.ts`, `encargoActualByCategory.ts`, `queryHelpers.ts`) — these don't make HTTP calls
- React Query defaults from S-01 — unchanged
- Query keys — unchanged
- `enabled` gates — unchanged
- Any other React component, hook, page, or route — unchanged
- Database schema, RPCs, edge functions, migrations
- Translations, theme, design tokens
- Test infra, dependencies (no `package.json` change)

#### Verification Checklist (for reviewer)

To confirm this changelog matches the codebase:
1. Run `git grep -cE "queryFn: async \(\{ signal" src/components/dashboard/tabs/` → should return 3 (Practica), 3 (Cartera), 6 (Encargo), 6 (Personal) = 18 total.
2. Run `git grep -cE "\.abortSignal\(signal\)" src/components/dashboard/tabs/` → should return 11 (Practica), 9 (Cartera), 7 (Encargo), 6 (Personal) = 33 total.
3. Run `npx vitest run` → 562 passed / 1 skipped / 0 failed.
4. Run `npm run build` → clean compile.
5. **Manual smoke test in DevTools:**
   - Open the dashboard, switch the period selector several times rapidly while watching the Network tab
   - Cancelled requests now show as "(canceled)" in the Status column instead of completing with a 200 response
   - Same behavior expected when switching engagements rapidly in the Encargo tab

#### Risk / Rollback

- **Risk:** Low. Mechanical migration with TypeScript guardrails on every signature change. The riskiest piece (`.abortSignal(signal)` placement in chains with `.single()`/`.maybeSingle()`) was caught at build time during incremental implementation.
- **Rollback:** Revert PR. Each tab reverts independently; signal threading is purely additive, no semantic changes.

#### Lovable Preview Reindex

This PR introduces **no new files** — all 4 edits modify existing tab files that Lovable's index already knows about. Reindex risk minimal. Standard runbook applies if needed (per `AGENTS.md`).

#### Traceability

- **Plan reference:** CODEX_PLAN_v5 step **S-07** (Part 2 of split S-07)
- **Branch:** `claude/performance-improvements-DeNVL`
- **Base:** `sruizmier-performance-v1`
- **Commit:** `3c0fbe4` — `perf(s-07b): thread abort signals through dashboard queryFns`
- **PR:** #22 — `perf(s-07b): thread abort signals through dashboard queryFns`

---

### S-08 — Add DB indexes for dashboard predicates (Backend, Lovable-implemented)

**Backend-only step. Adds 7 indexes to `time_entries`, `engagements`, and `timesheet_line_approvals` to accelerate every dashboard tab query that filters on engagement/staff/period predicates. The migration is implemented by Lovable Cloud (per its standard "Apply pending Supabase migrations" flow); this CHANGELOG entry documents the predicate audit, the exact SQL applied, the rationale per index, the indexes intentionally NOT created, and the verification queries the reviewer can run in Supabase SQL Editor to confirm the migration landed correctly.**

#### Scope
- **Backend only** — `supabase/migrations/<TIMESTAMP>_dashboard_perf_indexes.sql` (Lovable will choose the exact timestamp; expected `20260425000000_dashboard_perf_indexes.sql` per Lovable's approved plan)
- No frontend code changes
- No schema changes (indexes only — `types.ts` is unchanged because indexes are not reflected in generated types)
- No RLS / function / trigger changes
- No data changes

#### Predicate Audit (post-S-07b, basis for which indexes to create)

| Table | Predicate pattern | Used by |
|---|---|---|
| `time_entries` | `engagement_id IN (...) AND date_worked BETWEEN start AND end` | Practica practiceMetrics, Practica partnerLeaderboard, Cartera portfolio, Cartera weeklyTrend |
| `time_entries` | `engagement_id = X AND is_forecast = false AND date_worked BETWEEN start AND end` | Encargo actualByCategory |
| `time_entries` | `engagement_id = X AND is_forecast = false` | Encargo hoursByStatus |
| `time_entries` | `staff_id = X AND date_worked BETWEEN start AND end` | Personal weekTimeEntries, weeklyTrend, monthHours, engagementHours |
| `time_entries` | `period_id IN (...) AND engagement_id IN (...)` | Cartera pendingApprovals (S-04 bulk fetch) |
| `time_entries` | `date_worked BETWEEN start AND end` (firm-wide) | Practica weeklyTrend |
| `engagements` | `partner_id IN (...) AND status = 'active'` | Practica partnerLeaderboard |
| `engagements` | `(partner_id = X OR manager_id = X) AND status = 'active'` | Cartera portfolio, Cartera weeklyTrend |
| `engagements` | `partner_id = X OR manager_id = X` (no status filter) | Cartera pendingApprovals |
| `engagements` | `status = 'active'` | Practica practiceMetrics |
| `engagements` | `engagement_id = X` | Encargo engagementData (PK lookup — already indexed) |
| `timesheet_line_approvals` | `status = 'pending'` (count) | Practica practiceMetrics, Personal pendingApprovals |
| `timesheet_line_approvals` | `engagement_id IN (...) AND status = 'pending'` | Cartera pendingApprovals |
| `timesheet_line_approvals` | `engagement_id = X AND period_id IN (...)` | Encargo hoursByStatus |

#### Existing Indexes (verified — NOT recreated)

- `idx_time_entries_period` ON `time_entries(period_id)` — single-col, distinct from the new composite `idx_time_entries_period_engagement`
- `idx_time_entries_unique_entry` UNIQUE ON `time_entries(staff_id, engagement_id, activity_id, date_worked, is_forecast)` — leftmost prefix `staff_id` available, but `date_worked` is the 4th column so unfit for `(staff_id, date_worked)` range scans
- `idx_engagements_code_unique` UNIQUE ON `engagements(engagement_code) WHERE engagement_code IS NOT NULL` — irrelevant for our predicates
- `idx_timesheet_periods_*` (3 indexes on `timesheet_periods`) — separate table

#### Migration File (actual filename created by Lovable)

`supabase/migrations/20260425232210_2a4c3593-fab6-4799-a92f-9a28be7839d7.sql`

Lovable used its standard `<TIMESTAMP>_<UUID>.sql` naming convention rather than the descriptive name `dashboard_perf_indexes` proposed in the plan. The timestamp `20260425232210` (2026-04-25 23:22:10 UTC) sorts after all existing migrations. Functionally equivalent.

#### Migration Contents (exact SQL Lovable applied — verified byte-for-byte against approved plan)

```sql
-- time_entries — three composite indexes for the three distinct dashboard predicate shapes
CREATE INDEX IF NOT EXISTS idx_time_entries_engagement_date
  ON public.time_entries(engagement_id, date_worked);

CREATE INDEX IF NOT EXISTS idx_time_entries_staff_date
  ON public.time_entries(staff_id, date_worked);

CREATE INDEX IF NOT EXISTS idx_time_entries_period_engagement
  ON public.time_entries(period_id, engagement_id);

-- engagements — partner/manager lookups with status filter
CREATE INDEX IF NOT EXISTS idx_engagements_partner_status
  ON public.engagements(partner_id, status);

CREATE INDEX IF NOT EXISTS idx_engagements_manager_status
  ON public.engagements(manager_id, status);

-- timesheet_line_approvals — partial filtered index for pending, plus engagement+period composite
CREATE INDEX IF NOT EXISTS idx_tla_pending_engagement
  ON public.timesheet_line_approvals(engagement_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_tla_engagement_period
  ON public.timesheet_line_approvals(engagement_id, period_id);
```

#### Index-by-Index Rationale

| # | Index | Justification |
|---|---|---|
| 1 | `idx_time_entries_engagement_date` ON `(engagement_id, date_worked)` | Serves the 4 most-frequent dashboard predicates (`engagement_id IN ... AND date_worked BETWEEN`). Without it, Postgres seq-scans `time_entries` for each dashboard tab load. |
| 2 | `idx_time_entries_staff_date` ON `(staff_id, date_worked)` | Personal tab fires 4 queries on `(staff_id, date_worked)` per load. The existing unique index has `staff_id` as leftmost but `date_worked` is the 4th column — useless for range scans. |
| 3 | `idx_time_entries_period_engagement` ON `(period_id, engagement_id)` | Cartera pendingApprovals bulk fetch (S-04) filters on `(period_id IN ..., engagement_id IN ...)` — composite index avoids a Cartesian-product scan against the unique index. |
| 4 | `idx_engagements_partner_status` ON `(partner_id, status)` | Composite handles both `partner_id = X` (via leftmost prefix) AND `partner_id = X AND status = 'active'`. Used by Practica partnerLeaderboard and Cartera (3 queries). |
| 5 | `idx_engagements_manager_status` ON `(manager_id, status)` | Same shape for the manager-side `.or()` clause in Cartera. Postgres uses BitmapOr to combine indexes 4 and 5 when the query filter is `partner_id = X OR manager_id = X`. |
| 6 | `idx_tla_pending_engagement` ON `(engagement_id) WHERE status = 'pending'` | **Partial filtered** index — only contains rows where `status = 'pending'`. Smaller than a full index, perfect for both the count-only queries (`status = 'pending'`) and the engagement-filtered queries (Cartera pendingApprovals). |
| 7 | `idx_tla_engagement_period` ON `(engagement_id, period_id)` | Encargo hoursByStatus filters on `(engagement_id = X, period_id IN (...))`. The existing PK index on `approval_id` doesn't help. |

#### Indexes Intentionally NOT Created (Documented for Future Reference)

- **`time_entries(date_worked)` standalone** — only used by Practica weeklyTrend (firm-wide sparkline, 1 query). Not on the hot path. If the table grows large, revisit in S-12 governance.
- **`engagements(status)` standalone** — would have low selectivity (most engagements are active). Composite indexes 4 + 5 cover most needs; firm-wide `status = 'active'` query (Practica practiceMetrics) is one query and small enough to seq-scan.
- **`time_entries(is_forecast)` standalone** — boolean column, low selectivity. Not worth indexing alone.

#### Application & Implementation Notes

- All 7 statements use `CREATE INDEX IF NOT EXISTS` → idempotent, safe to re-run, won't fail if any already exist
- No `CONCURRENTLY` — Supabase migrations run inside a transaction, which forbids `CREATE INDEX CONCURRENTLY`. Index builds briefly hold a SHARE lock on each table (concurrent SELECTs proceed; concurrent INSERT/UPDATE/DELETE briefly block until the index build completes). Acceptable for tables of EMS v2.0's typical size.
- Migration runs via the standard Lovable Cloud flow: Lovable creates the file in `supabase/migrations/`, then "Apply pending Supabase migrations" prompt applies it.

#### Unexpected `types.ts` Regeneration (resolved)

The plan asserted "`types.ts` is unchanged because indexes are not reflected in generated types." That was correct in principle — **the indexes themselves do not appear in `types.ts`** — but Lovable's migration apply flow also **regenerated** `src/integrations/supabase/types.ts` from the live DB schema, picking up tables and views that already existed in production but had not yet been reflected in this branch's `types.ts`. Net diff: **+620 lines, 0 lines from the indexes**. The new entries are unrelated scheduler-v2 features:

- Tables: `engagement_assignments`, `engagement_staffing_requirements`, `resource_planning_audit_log`, `skills`, `staff_skills`, `staff_unavailability`
- Views: `vw_engagement_staffing_summary`, `vw_staff_weekly_capacity`, `vw_staffing_alerts`
- Plus minor `engagement_id` FK relationship additions to existing `engagements`-referencing tables that now point at the new views

These types were already present on the live DB (added by the parallel `sruizmier-scheduler-v2` work). Lovable's regeneration brought `sruizmier-performance-v1` in sync with the live schema. **Verified safe:** `npm run build` clean and `npx vitest run` 562 passed / 1 skipped / 0 failed against the regenerated file — no test depends on the old shape, no consumer references a renamed/removed column.

#### Cross-Branch Coordination (corrected from plan — Lovable behaved differently than expected)

The plan anticipated Lovable would push to `main` first. **Actual:** Lovable pushed two commits directly to `sruizmier-performance-v1`:
- `a2c15d3` "Changes" — added the migration file + regenerated `types.ts` + updated `.lovable/plan.md`
- `eaf60f5` "Added dashboard performance indexes" — merge commit consolidating the above with the prior PR #22 merge

Both commits were authored by `gpt-engineer-app[bot]` (the Lovable bot). The migration file and the `types.ts` regeneration are now both on `sruizmier-performance-v1` directly — no `main` → `sruizmier-performance-v1` merge required for this step.

#### Verification (run in Supabase SQL Editor after Lovable applies)

```sql
-- 1. Confirm all 7 new indexes exist
SELECT indexname, tablename FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname IN (
    'idx_time_entries_engagement_date',
    'idx_time_entries_staff_date',
    'idx_time_entries_period_engagement',
    'idx_engagements_partner_status',
    'idx_engagements_manager_status',
    'idx_tla_pending_engagement',
    'idx_tla_engagement_period'
  )
ORDER BY tablename, indexname;
-- Expected: 7 rows
```

```sql
-- 2. Confirm Practica practiceMetrics' time_entries query uses idx_time_entries_engagement_date
EXPLAIN ANALYZE
SELECT engagement_id, hours_logged FROM public.time_entries
WHERE engagement_id IN (SELECT engagement_id FROM public.engagements WHERE status = 'active' LIMIT 10)
  AND date_worked BETWEEN '2026-04-01' AND '2026-04-30';
-- Expected plan: "Index Scan using idx_time_entries_engagement_date" or "Bitmap Index Scan on idx_time_entries_engagement_date"
```

```sql
-- 3. Confirm Personal weekTimeEntries uses idx_time_entries_staff_date
EXPLAIN ANALYZE
SELECT * FROM public.time_entries
WHERE staff_id = (SELECT staff_id FROM public.staff LIMIT 1)
  AND date_worked BETWEEN '2026-04-01' AND '2026-04-30';
-- Expected plan: "Index Scan using idx_time_entries_staff_date"
```

```sql
-- 4. Confirm partial index used for pending count
EXPLAIN ANALYZE
SELECT COUNT(*) FROM public.timesheet_line_approvals WHERE status = 'pending';
-- Expected plan: "Index Only Scan using idx_tla_pending_engagement" (or Bitmap variant on small data sets)
```

#### Acceptance Gates

- ✅ All 7 indexes documented in this CHANGELOG match the SQL applied by Lovable (verified byte-for-byte on `supabase/migrations/20260425232210_2a4c3593-fab6-4799-a92f-9a28be7839d7.sql`)
- ✅ All 7 referenced columns verified to exist on the live tables (per `docs/database-schema.sql`):
  - `time_entries`: `engagement_id`, `date_worked`, `staff_id`, `period_id`
  - `engagements`: `partner_id`, `manager_id`, `status`
  - `timesheet_line_approvals`: `engagement_id`, `period_id`, `status` (default `'pending'`)
- ✅ All statements use `IF NOT EXISTS` (idempotent, safe to re-run)
- ✅ No conflict with the 4 existing indexes on these tables (verified by name and column-set comparison)
- ✅ No source code change required for the indexes themselves; `types.ts` was independently regenerated by Lovable's apply flow and brought in unrelated scheduler-v2 entities (build + tests verified clean against the regenerated file)
- ✅ `npm run build` clean (18.54 s) and full `npx vitest run` 562 passed / 1 skipped / 0 failed against the post-Lovable state on `sruizmier-performance-v1`

#### Rollback (if Lovable's apply fails or the migration causes issues)

Apply this rollback as a follow-up migration:

```sql
DROP INDEX IF EXISTS public.idx_time_entries_engagement_date;
DROP INDEX IF EXISTS public.idx_time_entries_staff_date;
DROP INDEX IF EXISTS public.idx_time_entries_period_engagement;
DROP INDEX IF EXISTS public.idx_engagements_partner_status;
DROP INDEX IF EXISTS public.idx_engagements_manager_status;
DROP INDEX IF EXISTS public.idx_tla_pending_engagement;
DROP INDEX IF EXISTS public.idx_tla_engagement_period;
```

`DROP INDEX` is fast and acquires only a brief lock; safe to run during business hours.

#### Lovable Plan Source

The Lovable-prepared plan was reviewed and approved before any application. Approval flagged two minor doc imprecisions in Lovable's plan that did not affect the migration content:

1. **Lock semantics:** Lovable's plan claimed "ACCESS EXCLUSIVE locks." Actual lock for non-`CONCURRENTLY` `CREATE INDEX` is `SHARE`. Practical impact identical (writes briefly blocked, reads proceed).
2. **Verification commands:** Lovable's plan suggested `\d+ public.<table>` (psql meta-command). Won't work in Supabase web SQL Editor; equivalent `pg_indexes` query supplied in this CHANGELOG instead.

#### Traceability

- **Plan reference:** CODEX_PLAN_v5 step **S-08** — backend-only DB-index migration
- **Branch (this docs entry):** `claude/performance-improvements-DeNVL`
- **Branch (Lovable migration):** `sruizmier-performance-v1` directly (Lovable did NOT push to `main` first as the plan anticipated — convention varies per Lovable workflow setup)
- **Migration filename (actual):** `supabase/migrations/20260425232210_2a4c3593-fab6-4799-a92f-9a28be7839d7.sql` (Lovable's `<TIMESTAMP>_<UUID>.sql` convention)
- **Side effect:** `src/integrations/supabase/types.ts` regenerated (+620 lines) — picks up unrelated scheduler-v2 tables/views that already existed in the live DB. Build + tests verified clean.
- **Implemented by:** Lovable Cloud via "Apply pending Supabase migrations" flow
- **Reviewed and approved by:** Claude Code (this session)
- **Commit (this docs entry, initial):** `d2dabb1` — `docs(s-08): record Lovable-implemented DB index migration plan`
- **Commit (this docs entry, corrections):** `033d27b` — `docs(s-08): correct CHANGELOG to reflect Lovable's actual application`
- **PR (this docs entry):** #23 — `docs(s-08): record Lovable-implemented DB index migration plan`
- **Lovable commits on `sruizmier-performance-v1`:** `a2c15d3` (Changes — migration + types regen) and `eaf60f5` (merge — "Added dashboard performance indexes")

---

### S-09 and S-11 — DEFERRED (multi-collaborator backend caveat)

**Both steps deferred without execution. Decision recorded; full execution plan saved at `docs/plans/LATE_STAGE_S-09_AND_S-11_PLAN.md` for future resumption.**

#### Why deferred

S-09 (move dashboard aggregation to backend edge function) and S-11 (decide fate of the existing `supabase/functions/dashboard-data/` edge function) were revealed to be the same architectural decision, rephrased. During pre-implementation reconnaissance:

1. **The `dashboard-data` edge function is 938 lines** exposing 8 actions: `time-value`, `engagement-kpis`, `staff-utilization`, `portfolio-risk`, `partner-leaderboard`, `my-week`, `timesheet-status`, `practice-pulse`.
2. **Zero callers from this repository's frontend.** Verified:
   ```bash
   grep -rn "dashboard-data\|invoke('dashboard-data'" src --include="*.ts" --include="*.tsx"
   # (no matches)
   ```
3. **External callers are possible** — other git branches (e.g. `sruizmier-scheduler-v2`), debug scripts, BI tools, cron jobs, or QA environments may exercise the function in ways not observable from this repository's source. EMS v2.0 uses a single shared Supabase backend across all branches; backend changes are not branch-isolated.

The repository owner (sruizmier) deferred the deprecate/adopt decision rather than risk breaking external collaborators' workflows by deleting the function blind.

#### What this CHANGELOG entry does

- Documents the deferral and its rationale
- Points to the comprehensive late-stage plan at `docs/plans/LATE_STAGE_S-09_AND_S-11_PLAN.md`
- Confirms that **no source code or backend changes were made** in the S-09/S-11 slot of this remediation
- Allows the dashboard performance remediation to advance to S-10 (lazy-loading) and S-12 (governance) without blocking on a multi-collaborator audit

#### What the late-stage plan contains

`docs/plans/LATE_STAGE_S-09_AND_S-11_PLAN.md` is a self-contained execution plan (≈300 lines) for whoever picks this up later. It covers:

1. Context at deferral time (post-S-08 codebase state, list of completed steps)
2. **Mandatory pre-execution audit** — caller audit across git branches, external systems, function-side observability, and per-action correctness audit
3. Decision tree — flowchart for choosing between Path A (Deprecate) and Path B (Adopt)
4. **Path A — Deprecate**: full Lovable prompt, repository follow-ups, verification, risk, rollback (~1 hour effort if audit clean)
5. **Path B — Adopt**: 6-step migration plan with feature flag, per-tab pilot, contract tests, byte-level KPI parity (2–4 days minimum)
6. Cross-cutting concerns: multi-collaborator backend, RLS, observability, KPI parity testing
7. Acceptance criteria per path
8. Effort summary table
9. Final reminders for the future operator
10. Appendix with file paths and references

#### Files Changed

- **NEW** `docs/plans/LATE_STAGE_S-09_AND_S-11_PLAN.md` — execution plan, ~300 lines
- `docs/changelogs/CHANGELOG-2026-04-24.md` — this entry

**Zero source code changes.** Zero backend changes. Zero `supabase/functions/` changes. Zero `types.ts` changes.

#### Acceptance Gates (for the deferral itself)

- ✅ Late-stage plan authored and saved at `docs/plans/LATE_STAGE_S-09_AND_S-11_PLAN.md`
- ✅ Plan includes mandatory pre-execution audit checklist
- ✅ Plan includes both Path A (deprecate) and Path B (adopt) in full
- ✅ Plan is self-contained (executable cold by future operator without reconstructing context)
- ✅ This CHANGELOG entry documents the deferral and points to the plan
- ✅ Dashboard performance remediation can advance to S-10 / S-12 without blocking

#### Resumption Trigger

The late-stage plan should be revisited when **any** of the following occur:

1. The multi-collaborator caller audit (plan §2) can be completed (e.g. team is available to confirm absence of external `dashboard-data` callers)
2. Lovable Branches (per-branch DB isolation) is enabled on the project, removing the multi-collaborator constraint
3. A new requirement emerges that needs server-side aggregation (e.g. multi-tenant rollups, scheduled exports)
4. The `dashboard-data` edge function is observed in production logs to have callers (or definitively zero callers for 30+ days)
5. The team decides to enforce single-source-of-truth KPI semantics platform-wide

#### Risk / Rollback

- **Risk:** Zero. No source or backend changes were made.
- **Rollback:** Revert this docs PR to remove the late-stage plan and CHANGELOG entry. The `dashboard-data` edge function remains untouched in either case.

#### Traceability

- **Plan reference:** CODEX_PLAN_v5 steps **S-09** and **S-11**
- **Branch (this docs entry):** `claude/performance-improvements-DeNVL`
- **Late-stage plan file:** `docs/plans/LATE_STAGE_S-09_AND_S-11_PLAN.md`
- **Decision owner:** sruizmier (repository owner)
- **Deferred at:** Post-S-08, pre-S-10
- **Commit (this docs entry):** `0cf63db` — `docs(s-09+s-11): defer with full late-stage execution plan`
- **PR (this docs entry):** #24 — `docs(s-09+s-11): defer with full late-stage execution plan`

---

### S-10 — Per-tab lazy-loading + per-tab failure isolation

**Refactors `src/pages/Index.tsx` so each of the four dashboard tab modules (Practica, Cartera, Encargo, Personal) becomes its own lazy-loaded code-split chunk, and each tab is wrapped by a new `TabErrorBoundary` so a thrown error inside one tab is contained inside that tab's panel — the rest of the dashboard route (period selector, tab list, sibling tabs) remains interactive. Build now produces 4 separate `<TabName>-<hash>.js` chunks; the dashboard route shell (`Index-<hash>.js`) drops from ~440 KB to **10.7 KB**.**

#### Scope
- Frontend only
- 6 files touched: 1 refactored, 1 new component + its tests, 1 deleted (barrel), 1 test updated, 2 locale files
- No schema, RPC, edge function, dependency, or react-query default change
- Zero KPI drift — the refactor only changes WHEN tab modules load and HOW errors are caught; never WHAT the tabs render

#### Files Changed

##### NEW `src/components/dashboard/TabErrorBoundary.tsx` (78 lines)

- **Created** a per-tab error boundary using a two-component pattern:
  - `TabErrorBoundaryClass` — minimal class component that handles React's `getDerivedStateFromError` / `componentDidCatch` lifecycle, logs to `logger.error` from `@/lib/logger`, and exposes a `reset()` callback. Receives a `fallback: (resetError, error) => ReactNode` render prop.
  - `TabErrorFallback` — function component that uses `useTranslation()` to render the localized error UI. Shows an `AlertTriangle` icon, a translated title interpolated with the tab label (`{{tab}}`), a translated description, the underlying `error.message` in a `<pre>` block (for debugging), and a "Try again" button that calls the reset callback.
  - `TabErrorBoundary` — public wrapper component that takes `tabLabel: string` + `children: ReactNode`, composes the class boundary with the i18n-aware fallback. This is what `Index.tsx` consumes.
- **Why two components:** Class components can't use hooks, so `useTranslation()` (needed for i18n compliance per CLAUDE.md) lives in the function component. The class boundary is reduced to pure lifecycle handling; the i18n-aware fallback is a render prop. Clean separation of concerns.
- **Imports:** `react`, `react-i18next`, `lucide-react`, `@/components/ui/button`, `@/lib/logger`. No new runtime deps.

##### NEW `src/components/dashboard/__tests__/TabErrorBoundary.test.tsx` (5 unit tests)

- **Created** unit tests covering:
  1. Renders children when no error is thrown
  2. Catches a thrown error and renders the fallback UI (with localized strings)
  3. Interpolates the tab label into the localized title via `{{tab}}`
  4. Logs the error to `logger.error` with a `'TabErrorBoundary'` marker in the message
  5. Clicking the "Try again" button resets the boundary and re-renders children if the underlying child no longer throws
- **Mocks:** `react-i18next` `useTranslation()` (returns minimal fixture for `dashboard.tabError.*` keys); `@/lib/logger` (spy on `error`); `console.error` suppressed (React's noisy expected-error log)
- **Result:** 5/5 passing in 101 ms

##### `src/pages/Index.tsx` (refactor; 103 → 137 lines)

###### Top-level imports (rewritten)
- **Removed** `import { PersonalTab, EncargoTab, CarteraTab, PracticaTab } from '@/components/dashboard/tabs';` (eager barrel import)
- **Added** `lazy`, `Suspense` from `react`
- **Added** `import { Skeleton } from "@/components/ui/skeleton";` for the suspense fallback
- **Added** `import { TabErrorBoundary } from "@/components/dashboard/TabErrorBoundary";`
- **Added** four `lazy()` declarations, one per tab, **importing from per-file paths** (NOT the barrel) so each becomes its own JS chunk:
  ```ts
  const PracticaTab = lazy(() =>
    import("@/components/dashboard/tabs/PracticaTab").then((m) => ({ default: m.PracticaTab }))
  );
  // ...same for CarteraTab, EncargoTab, PersonalTab
  ```
  The `.then((m) => ({ default: m.PracticaTab }))` adapter is required because `lazy()` expects a default export, but the tab files use named exports.

###### `TabSkeleton` component (new, internal)
- Added a small skeleton component that renders 4 KPI-card-sized blocks + a body block. Used as the suspense fallback for every tab. Visually matches the loading state the tabs themselves show during their internal data fetches, so the perceived experience is consistent whether the chunk is fetching or the data is fetching.

###### `<TabsContent>` blocks (rewritten)
- **Replaced** each direct `<TabName />` invocation with the wrap pattern:
  ```tsx
  <TabsContent value="practica" className="mt-4">
    <TabErrorBoundary tabLabel={t('dashboard.tabs.practica')}>
      <Suspense fallback={<TabSkeleton />}>
        <PracticaTab />
      </Suspense>
    </TabErrorBoundary>
  </TabsContent>
  ```
  Repeated for `cartera`, `encargo`, `personal`. The order is `TabErrorBoundary` outermost (so it can catch errors from Suspense boundary itself if the chunk fetch fails), then `Suspense`, then the lazy tab.

###### `PlaceholderTab` (deleted)
- Removed the unused `PlaceholderTab` function component (lines 80–88 in the previous file). Verified zero references via `git grep "PlaceholderTab"` — pure dead code from an earlier iteration.

##### DELETED `src/components/dashboard/tabs/index.ts` (4 lines)

- Removed the barrel that re-exported all four tabs. Verified only `Index.tsx` imported from it (`grep -rn "from ['\"]@/components/dashboard/tabs['\"]" src`); after the per-file lazy imports in Index.tsx, the barrel had zero consumers.

##### `src/pages/__tests__/Index.dashboard-tabs.test.tsx`

- **Updated** the test mocks to match the new per-file import paths in `Index.tsx`:
  ```ts
  // Before (single barrel mock)
  vi.mock("@/components/dashboard/tabs", () => ({ PracticaTab, CarteraTab, EncargoTab, PersonalTab: ... }));

  // After (one mock per file path)
  vi.mock("@/components/dashboard/tabs/PracticaTab", () => ({ PracticaTab: () => <div data-testid="practica-tab" /> }));
  vi.mock("@/components/dashboard/tabs/CarteraTab", () => ({ CarteraTab: () => <div data-testid="cartera-tab" /> }));
  vi.mock("@/components/dashboard/tabs/EncargoTab", () => ({ EncargoTab: () => <div data-testid="encargo-tab" /> }));
  vi.mock("@/components/dashboard/tabs/PersonalTab", () => ({ PersonalTab: () => <div data-testid="personal-tab" /> }));
  ```
- The barrel mock would never trigger in the new world since `lazy(() => import('@/components/dashboard/tabs/PracticaTab'))` resolves directly to the file, never through the barrel. Updating the mocks keeps the test's coverage of `Index.tsx` intact.
- **Result:** existing 5 test cases continue to pass after the mock-path update (no semantic test change).

##### `src/locales/en.json` (3 new keys)

```json
"dashboard.tabError": {
  "title": "Error in {{tab}} tab",
  "description": "This tab failed to load. Other tabs are unaffected.",
  "retry": "Try again"
}
```

##### `src/locales/es.json` (3 new keys)

```json
"dashboard.tabError": {
  "title": "Error en pestaña {{tab}}",
  "description": "Esta pestaña no se pudo cargar. Otras pestañas no se ven afectadas.",
  "retry": "Intentar de nuevo"
}
```

#### Build Output (verified)

After `npm run build`:

| Chunk | Size | Notes |
|---|---|---|
| `Index-<hash>.js` | **10.7 KB** | Dashboard route shell — period selector, tab list, error boundaries, suspense fallbacks |
| `PracticaTab-<hash>.js` | 13.7 KB | Lazy chunk for Practica tab + its `practicaLeaderboard.ts` aggregation helper |
| `CarteraTab-<hash>.js` | 12.8 KB | Lazy chunk for Cartera tab |
| `EncargoTab-<hash>.js` | 16.2 KB | Lazy chunk for Encargo tab + its `encargoActualByCategory.ts` aggregation helper |
| `PersonalTab-<hash>.js` | 17.9 KB | Lazy chunk for Personal tab |

For comparison: in the pre-S-10 build, `Index-<hash>.js` was ~440 KB (containing all four tab modules and their dependencies). The dashboard route shell is now ~40× smaller. Tab modules and their shared sparkline/recharts dependency live in separate chunks that fetch on-demand.

#### Behavior Preservation Guarantees

| Behavior | Drift |
|---|---|
| KPI values, totals, displays, sorts | None — tab components are unchanged |
| Tab navigation UX | None — `<Tabs>` (Radix) still controls active state |
| Initial render of the user's default tab | **Slightly delayed** by the chunk fetch (~50–100 ms first time; cached afterwards). The skeleton bridges the gap. |
| Subsequent tab clicks (first visit) | Brief skeleton (~50–100 ms chunk fetch); after first visit instant |
| Subsequent tab clicks (revisit) | Identical to before — cached chunk |
| Global `<ErrorBoundary>` in `App.tsx` | Unchanged — still catches errors that escape outside the dashboard |
| Per-tab error containment | **New** — a thrown error inside one tab is contained inside that tab's panel; sibling tabs and the rest of the dashboard route remain interactive |

#### Tests

| Test command | Result |
|---|---|
| `npx vitest run src/components/dashboard/__tests__/TabErrorBoundary.test.tsx` | **5/5 passed** (101 ms) |
| `npx vitest run src/pages/__tests__/Index.dashboard-tabs.test.tsx` | **5/5 passed** (335 ms — unchanged from S-07b after mock-path update) |
| `npx vitest run` (full suite) | **567 passed, 1 skipped, 0 failed** across 63 files (was 562 → +5 new = 567) |
| `npm run build` | TypeScript compile clean, Vite build succeeds in 17.58 s; **4 separate tab chunks produced** (verified via `ls dist/assets/`) |

#### Acceptance Gates (all pass)

- ✅ All 4 tabs lazy-loaded via per-file `lazy()` imports
- ✅ Each `<TabsContent>` wrapped with `<TabErrorBoundary>` + `<Suspense fallback>`
- ✅ New `TabErrorBoundary` has 5 passing unit tests
- ✅ Existing `Index.dashboard-tabs.test.tsx` 5 tests still pass after mock-path update
- ✅ `npm run build` produces 4 separate tab chunks (`PracticaTab-*.js`, `CarteraTab-*.js`, `EncargoTab-*.js`, `PersonalTab-*.js`)
- ✅ Initial bundle (`Index-*.js`) shrinks from ~440 KB to 10.7 KB (~40× reduction)
- ✅ Build clean, full vitest 567 passing
- ✅ All new strings via i18n; no hardcoded English/Spanish strings (per CLAUDE.md)
- ✅ Barrel `src/components/dashboard/tabs/index.ts` deleted (zero remaining consumers)

#### What is NOT Changed

- The four dashboard tab files (`PracticaTab.tsx`, `CarteraTab.tsx`, `EncargoTab.tsx`, `PersonalTab.tsx`) — internal logic unchanged
- The four pure aggregation helpers (`practicaLeaderboard.ts`, `weeklyHoursBucket.ts`, `pendingApprovalsAggregation.ts`, `encargoActualByCategory.ts`) — unchanged
- `src/lib/queryHelpers.ts` (S-07a) — unchanged
- The global `<ErrorBoundary>` in `App.tsx` — unchanged (still catches errors above the dashboard)
- Database schema, RPCs, edge functions, migrations
- React Query defaults from S-01
- Test infra, dependencies (no `package.json` change)

#### Verification Checklist (for reviewer)

To confirm this changelog matches the codebase:
1. Confirm `src/components/dashboard/TabErrorBoundary.tsx` exists; exports `TabErrorBoundary` (default-named export of the wrapper component).
2. Confirm `src/components/dashboard/__tests__/TabErrorBoundary.test.tsx` exists with 5 tests; run targeted test → 5/5 pass.
3. Confirm `src/components/dashboard/tabs/index.ts` does **NOT** exist (`ls src/components/dashboard/tabs/index.ts` returns "No such file or directory").
4. Open `src/pages/Index.tsx` and confirm:
   - Top-of-file uses `lazy(() => import('@/components/dashboard/tabs/<Name>Tab').then(...))` for each of the four tabs
   - Each `<TabsContent>` wraps its tab in `<TabErrorBoundary tabLabel={t(...)}>` → `<Suspense fallback={<TabSkeleton />}>` → `<TabName />`
5. Run `git grep "from ['\"]@/components/dashboard/tabs['\"]" src/` → should return **no matches** (the barrel is gone and no consumer references it).
6. Run `npx vitest run` → 567 passed / 1 skipped / 0 failed.
7. Run `npm run build` → clean compile; check `dist/assets/` for 4 separate `<TabName>Tab-<hash>.js` files.
8. **Visual smoke test:** open the dashboard, switch tabs — confirm the brief skeleton flash on first visit and instant rendering on revisit. Open DevTools Network tab and confirm chunk fetches happen on first tab visit only.
9. **Visual error-boundary smoke test (optional):** temporarily throw inside one tab's component (`throw new Error('test');`), navigate to that tab, confirm the error UI renders inside the tab panel only and other tabs remain functional.

#### Risk / Rollback

- **Risk:** Low. Pattern is well-known (React.lazy + Suspense + ErrorBoundary). Biggest risk would be mock-path mismatch in the existing test, which was addressed explicitly.
- **Rollback:** Revert PR. The two new files deletable; restore the barrel `src/components/dashboard/tabs/index.ts`; restore eager imports in `Index.tsx`; revert the test mock paths.

#### Lovable Preview Reindex

This PR introduces **two new files** under `src/components/dashboard/` (the boundary + its tests). Per `AGENTS.md`: if after merge the preview shows 404 on `/_sandbox/dev-server`, run:
```bash
git commit --allow-empty -m "chore: trigger Lovable preview rebuild"
git push origin sruizmier-performance-v1
```

#### Traceability

- **Plan reference:** CODEX_PLAN_v5 step **S-10** — per-tab failure isolation and lazy-loading
- **Branch:** `claude/performance-improvements-DeNVL`
- **Base:** `sruizmier-performance-v1`
- **Commit:** `af96228` — `perf(s-10): per-tab lazy-loading + per-tab failure isolation`
- **PR:** _(filled in after open)_

<!-- S-12 will be appended below as its PR is produced. -->
