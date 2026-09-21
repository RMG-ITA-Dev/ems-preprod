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
| Cartera `portfolio_overview` query | ≤ 1 round-trip (constant — single `SECURITY DEFINER` RPC, does not scale with engagements, activities, or approvals) | dash_cartera (2026-09-17) — replaces the 3 rows above (`portfolio`, `pendingApprovals`, `weeklyTrend` queries), all retired with the `CarteraTab.tsx` rewrite |
| Encargo full tab load (6 queryFns) | ≤ 7 round-trips | S-05, S-06 |
| Personal full tab load (6 queryFns) | ≤ 6 round-trips | S-03, S-06 |
| Socio `partner_overview` query | ≤ 1 round-trip (constant — does not scale with engagements, managers, or clients; single `SECURITY DEFINER` RPC) | dash_socio (2026-09-15) |
| Socio `partner_overview_engagements` query (Bloque F) | ≤ 1 round-trip, **fires on every initial tab load, not on demand** (updated 2026-09-17, review.md iteración 4, MF-03) — since the 2026-09-17 Bloque F redesign this is the sole source of that block's rows (server-side sort/filter), so it always runs alongside `partner_overview`; "Ver todos" reuses the same query with a higher `limit`, no extra round-trip. This row previously said "on demand", which stopped being true when the redesign shipped and was never corrected here. | dash_socio (2026-09-15), corrected 2026-09-17 |
| **Total typical first dashboard load (active tab + practiceMetrics)** | **≤ 13 round-trips** (was ≤ 12 — bumped by 1 for the Socio tab's 2nd always-on RPC, see row above) | sum of above |

**Note (dash_cartera, 2026-09-17):** the Cartera tab went from up to 9 round-trips (3 separate `useQuery` client-side aggregations: `portfolio-engagements`, `pending-approvals`, `cartera-weekly-trend`) down to 1 (`portfolio_overview`, single `SECURITY DEFINER` RPC — same architecture as `partner_overview` for Socio). The round-trip rows above are historical baselines being replaced, not additive.

### Bundle size budgets

Measured by inspecting `dist/assets/` after `npm run build`. Sizes are uncompressed; gzip is roughly 1/3.

| Chunk | Budget | Currently |
|---|---|---|
| Dashboard route shell `Index-<hash>.js` | ≤ 50 KB | ~12.25 KB ✅ (measured 2026-09-17, `npm run build`) |
| Per-tab chunk (`PracticaTab`, `EncargoTab`, `PersonalTab`) | ≤ 30 KB each | 14.15–27.19 KB ✅ (measured 2026-09-17) |
| `CarteraTab` chunk | ≤ 35 KB (bumped from the 30 KB per-tab cap, dash_cartera 2026-09-17 — see note below) | **32.26 KB (7.86 KB gzip)** ⚠️ exceeds the original 30 KB cap by ~2.3 KB — measured 2026-09-17, `npm run build`. Recharts is required for the Cascada de Actividades' floating-bar waterfall (decisiones.md §5.1.1, cannot be done in CSS/HTML alone) plus the bicolor KPI bars and the Facturación stacked bar; everything else (Horas por categoría, Presupuesto de personal, Cola, Hitos, Horas por encargo) is plain HTML/Tailwind per plan_v2.md §3.1. **Needs the same explicit sign-off `PartnerTab` got (review.md iteración 1, MF-10) — pending, not yet requested from the operator in a PR (this run did not open one).** |
| `PartnerTab` chunk | ≤ 60 KB (bumped from the 30 KB per-tab cap — see note below) | ~60.54 KB (14.24 KB gzip) — measured 2026-09-17 after the dash_cartera build (down from the ~69.4 KB recorded 2026-09-16): `CarteraTab.tsx` now also imports `partnerOverviewAggregation.ts` for its 6 reused pure functions (plan_v2.md §15 forbids extracting them to a new shared module, but it reuses the existing file as-is), so Rollup split it into its own shared chunk (`partnerOverviewAggregation-<hash>.js`, 9.67 KB) instead of inlining it into `PartnerTab`. `PartnerTab.tsx` itself was **not modified** by this work. dash_socio (2026-09-15/16): fila D+E+G (dos donas de sector + tabla de gerentes + barra de Top clientes sobre el total) + tabla de Bloque F (Horas por encargo, con pp de cumplimiento y orden) sumaron ~9.5 KB el 2026-09-16. **Decisión del operador (review.md iteración 1, MF-10, 2026-09-17): aceptado tal cual por ahora** — no hay lentitud reportada; ver la nota de remediación futura más abajo en vez de tocar código hoy. |
| Pure aggregation helper chunks (when split out) | ≤ 5 KB each | varies (most fold into tab chunks) |
| Shared sparkline/recharts chunk (`weeklyHoursBucket-<hash>.js`) | ≤ 400 KB | ~376 KB (recharts dependency dominates — accepted) |

**Note on the recharts chunk:** the 376 KB shared chunk is dominated by the `recharts` library imported transitively via `Sparkline.tsx`. It's loaded once on first sparkline-using tab visit, then cached. Replacing recharts with a lighter charting library would unlock the next significant improvement here, but is out of remediation scope.

**Note on the `PartnerTab` bump (dash_socio, 2026-09-16, intentional):** an earlier CSS-only version of `PartnerTab` fit the standard 30 KB per-tab cap, but the operator decided to prioritize visual fidelity over bundle size — `PartnerTab` uses real Recharts components (`BarChart`, `PieChart`/donut, interactive `Tooltip`s) instead of CSS-only bars, matching the approved layout in `bugs/dashboard/socio/plan_v2.md` §3 more closely than the CSS version could. This is the only per-tab chunk that exceeds 30 KB; the other four (`PracticaTab`, `CarteraTab`, `EncargoTab`, `PersonalTab`) stay within the original cap. Do not silently raise this further — any additional growth needs the same explicit sign-off.

**Future remediation if slowness is ever reported (review.md iteración 1, MF-10):** the chunk is currently ~69.4 KB against a 60 KB cap, and the operator explicitly parked this — no code change now, just documented here so it isn't rediscovered from scratch later. If a future PR needs to actually shrink it, the two options evaluated (not started) are:
1. **Split the D/E/G row and the Bloque F table into their own lazily-loaded sub-chunks**, loaded only when `PartnerTab` mounts and its data resolves (they're the ~9.5 KB added on 2026-09-16) — same per-file lazy-loading pattern S-10 already uses for the top-level tab chunks.
2. **Defer the Recharts imports used only by the donut/table blocks** (`PieChart`, table-only `BarChart` variants) behind a dynamic `import()` gated on the first render of those specific blocks, instead of importing them eagerly at the top of `PartnerTab.tsx`.
Either option is a `PartnerTab.tsx`-only change (no RPC/contract impact). Re-measure with `npm run build` after either one before closing this note.

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
| p95 of `partner_overview` (Test) | ≤ 500 ms (same `SLOW_QUERY_THRESHOLD_MS` convention as above). Not yet measured in this PR — no telemetry exists for it and this workstream does not touch Supabase; measure with `EXPLAIN ANALYZE` in Test before/at merge (bugs/dashboard/socio/plan_v2.md §9.4, §11). |

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
2. A new tab is added → add its budget rows (e.g. the Socio tab added 2026-09-15, dash_socio: `partner_overview` + `partner_overview_engagements`, `PartnerTab` chunk). Cartera was **rediseñada** (not new) 2026-09-17, dash_cartera: `portfolio_overview` replaces its 3 legacy client-side queries, `CarteraTab` chunk re-measured.
3. `Index.tsx` or any tab gets a major refactor → re-measure bundle sizes
4. The deferred S-09/S-11 plan is executed → all budgets are re-derived for the new architecture
5. Production telemetry shows actual p95s diverging from the budgets (drift in either direction is informative)
6. A new charting library replaces recharts → revisit the shared-chunk budget
