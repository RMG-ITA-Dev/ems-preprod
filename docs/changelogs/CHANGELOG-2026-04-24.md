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

<!-- Subsequent steps (S-06 → S-12) will be appended below as their PRs are produced. -->
