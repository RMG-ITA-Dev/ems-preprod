# Dashboard Performance Budget

**Status:** Active. Established 2026-04-26 at the close of the EMS dashboard performance remediation (PRs #14–#26).

**Purpose:** Codify the performance gains from the remediation as **named budgets** that future PRs must respect or explicitly bump. Prevents regressions from creeping back during normal feature work.

**How to use:** Reviewers check incoming PRs against the hard budgets below. Authors flag any intentional budget bumps in the PR description and update this doc in the same PR.

---

## Hard budgets — PRs that violate these need explicit reviewer sign-off

### Round-trip budgets (Supabase calls per dashboard tab load)

Measured under typical conditions: a single user hitting one tab with the standard period selector (4-week range), no rapid navigation. Counted via DevTools Network panel filtered to `*supabase*` requests.

| Path | Budget | Established by |
|---|---|---|
| Practica `practiceMetrics` query | ≤ 5 round-trips | S-01, S-08 |
| Practica `partnerLeaderboard` query | ≤ 5 round-trips (constant — does NOT scale with partner count) | S-02 (was 1 + 4·N before) |
| Practica `weeklyTrend` (sparkline) | ≤ 1 round-trip | S-03 (was 8 before) |
| Cartera `portfolio` query | ≤ 4 round-trips | baseline |
| Cartera `pendingApprovals` query | ≤ 3 round-trips (constant — does NOT scale with approval count) | S-04 (was 2 + N before) |
| Cartera `weeklyTrend` (sparkline) | ≤ 2 round-trips (1 if user has no engagements) | S-03 (was 1 + 8 before) |
| Encargo full tab load (6 queryFns) | ≤ 7 round-trips | S-05, S-06 |
| Personal full tab load (6 queryFns) | ≤ 6 round-trips | S-03, S-06 |
| **Total typical first dashboard load (active tab + practiceMetrics)** | **≤ 12 round-trips** | sum of above |

### Bundle size budgets

Measured by inspecting `dist/assets/` after `npm run build`. Sizes are uncompressed; gzip is roughly 1/3.

| Chunk | Budget | Currently |
|---|---|---|
| Dashboard route shell `Index-<hash>.js` | ≤ 50 KB | ~10.7 KB ✅ |
| Per-tab chunk (`PracticaTab`, `CarteraTab`, `EncargoTab`, `PersonalTab`) | ≤ 30 KB each | 13–18 KB ✅ |
| Pure aggregation helper chunks (when split out) | ≤ 5 KB each | varies (most fold into tab chunks) |
| Shared sparkline/recharts chunk (`weeklyHoursBucket-<hash>.js`) | ≤ 400 KB | ~376 KB (recharts dependency dominates — accepted) |

**Note on the recharts chunk:** the 376 KB shared chunk is dominated by the `recharts` library imported transitively via `Sparkline.tsx`. It's loaded once on first sparkline-using tab visit, then cached. Replacing recharts with a lighter charting library would unlock the next significant improvement here, but is out of remediation scope.

### Query semantics — invariants that must hold

These are not "budgets" in the size sense; they are **structural rules** future PRs must not violate.

| Rule | Established by |
|---|---|
| Every `queryKey` parameter must affect the query body. Adding a parameter to the key without filtering on it is a bug (see PR #19 for the regression this prevents). | S-05 — there is an explicit `INVARIANT` comment in `EncargoTab.tsx` codifying this. |
| Time-range queries must filter `date_worked` at the query level (`.gte/.lte`), not in JS post-filter | S-03, S-05 |
| Empty-array short-circuit before any `.in('col', [])` — use `hasItems(arr)` from `src/lib/queryHelpers.ts` | S-02, S-04, S-07a |
| Abort signal must be threaded through every Supabase call inside a dashboard `useQuery` queryFn (`.abortSignal(signal)` chained on the builder) | S-07b |
| Numeric coercion via `safeNumber()` from `src/lib/queryHelpers.ts` (not inline `Number(x \|\| 0)`) | S-07a |
| No `select('*')` on data-returning queries (count-only `head: true` queries are exempt) | S-06 |
| Per-tab error containment via `<TabErrorBoundary>` + `<Suspense>` in `Index.tsx` | S-10 |

---

## Soft budgets — review-time signals, not hard gates

| Signal | Tool / mechanism |
|---|---|
| Slow query warning threshold | 500 ms (`SLOW_QUERY_THRESHOLD_MS` in `src/lib/queryPerfLogger.ts`). Dev-only `console.warn` via opt-in `withPerfLogging()` wrapper. |
| Sparkline week-bucket cache | Must invalidate on Monday boundary via `getWeekStamp()` from `src/components/dashboard/weeklyHoursBucket.ts` |
| KPI parity per dashboard PR | Snapshot 5 representative engagements (small / medium / large by hours) before and after; cell-by-cell diff must be 0 |

---

## Optional dev-time instrumentation

`src/lib/queryPerfLogger.ts` exposes `withPerfLogging(queryKey, fn, options?)` for **opt-in** instrumentation of any individual queryFn. Wrapping is per-call:

```ts
queryFn: ({ signal }) => withPerfLogging(
  ['my-query', selectedEngagementId],
  () => supabase.from('my_table').select('*').abortSignal(signal),
  { rowCountSelector: (r) => r.data?.length },
)
```

In production (`!import.meta.env.DEV`), the wrapper short-circuits to `fn()` with zero overhead. In development, it warns to `console.warn` if the query exceeds the threshold (default 500 ms; configurable per call via `options.thresholdMs`).

The remediation did NOT retroactively wire `withPerfLogging` into the existing 18 dashboard queryFns. Adoption is opportunistic — wrap any new heavy queryFn at the time it's added.

---

## When to break a budget

Acceptable reasons to update a budget (in the same PR that introduces the change):

1. **New feature requires a new query.** Document the new round-trip count in the PR description; bump the relevant budget here.
2. **Backend redesign per `docs/plans/LATE_STAGE_S-09_AND_S-11_PLAN.md`.** All budgets get re-derived once the dashboard data flows through a single backend contract.
3. **DB volume growth requires a new index.** New index migration → re-run the verification queries in the S-08 CHANGELOG entry → confirm planner uses the index → no budget change needed (round-trip count stays the same; latency improves).
4. **A library upgrade increases bundle size.** Document the upgrade and net impact in the PR description. Bumping the bundle budget is acceptable for justified upgrades (e.g. security patch); replace the budget number here.

Unacceptable reasons:

- "It's just one more query" — stop. Bulk-fetch instead. See S-02, S-04 for the pattern.
- "The N is small in practice" — N+1 patterns silently regress when data grows. Use a bulk fetch even when N=2.
- "We can index it later" — add the index at the same time as the new query.

---

## Reference: how each budget was achieved

| Budget category | Step(s) responsible |
|---|---|
| Round-trip caps (N+1 elimination) | S-02 (Practica leaderboard), S-03 (3 sparklines), S-04 (Cartera approvals) |
| Cache invalidation (correct period semantics) | S-01 (defaults), S-03 (week-stamp), S-05 (Encargo invariant) |
| Empty-array safety | S-02, S-04, S-07a (`hasItems`) |
| Abort signal coverage | S-07b (33 `.abortSignal` insertions across 18 queryFns) |
| DB-side index support | S-08 (7 indexes via Lovable) |
| Bundle size (route-shell + per-tab) | S-10 (per-file lazy-loading + 4 chunks) |
| Per-tab error containment | S-10 (`TabErrorBoundary`) |
| Numeric coercion safety (no NaN/Infinity leaks) | S-07a (`safeNumber`) |

---

## Cross-references

- **Entire remediation history** — `docs/changelogs/CHANGELOG-2026-04-24.md` (S-01 through S-12 entries)
- **Architecture decisions** — `docs/plans/LATE_STAGE_S-09_AND_S-11_PLAN.md` (deferred backend dashboard contract)
- **Lovable preview reindex runbook** — `AGENTS.md` (after any new-file PR)
- **Dashboard PR perf checklist** — `AGENTS.md`

---

## Resumption: when to revisit this doc

Review and revise this doc when:

1. A dashboard tab gets a new queryFn → update the round-trip table
2. A new tab is added → add its budget rows
3. `Index.tsx` or any tab gets a major refactor → re-measure bundle sizes
4. The deferred S-09/S-11 plan is executed → all budgets are re-derived for the new architecture
5. Production telemetry shows actual p95s diverging from the budgets (drift in either direction is informative)
6. A new charting library replaces recharts → revisit the shared-chunk budget
