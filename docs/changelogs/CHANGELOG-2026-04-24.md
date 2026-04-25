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

<!-- Subsequent steps (S-03 → S-12) will be appended below as their PRs are produced. -->
