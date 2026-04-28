# LATE_STAGE_S-09_AND_S-11_PLAN

**Status:** DEFERRED. To be revisited after Wave 3 closes (S-10 + S-12) and after the multi-collaborator audit listed below is complete.

**Original plan reference:** CODEX_PLAN_v5 steps S-09 (backend dashboard contract) and S-11 (decide fate of `dashboard-data` edge function).

**Author / decision owner:** Repository owner (`sruizmier`).

**Why this document exists:** During the EMS dashboard performance remediation (PRs #14–#23), it became clear that S-09 and S-11 are the same architectural decision rephrased. They were deferred because the project shares its Supabase backend with other in-flight work (e.g. `sruizmier-scheduler-v2`) and external collaborators may be exercising the `dashboard-data` edge function in ways not observable from this repository's source. Deleting or refactoring blindly risks breaking their workflows.

This document captures **everything needed to execute either path later**, without reconstructing the context.

---

## 1. Context at deferral time (2026-04-25)

### What was completed before deferral
S-01 through S-08 of the dashboard performance remediation, in order:

| Step | What it did | PR |
|---|---|---|
| S-01 | Set global React Query defaults | #14 |
| S-02 | Bulk-fetched Practica partner leaderboard (removed N+1) + split risk column | #15 |
| Complement | Added Lovable preview reindex runbook to `AGENTS.md` | #16 |
| S-03 | Collapsed three 8-week sparkline loops to single-range fetches | #17 |
| S-04 | Bulk-fetched Cartera pending-approvals hours (removed N+1) | #18 |
| S-05 | Fixed Encargo period-key/query mismatch (correctness bug) | #19 |
| S-06 | Replaced 5 wildcard `select('*')` with explicit columns | #20 |
| S-07a | Added `safeNumber` + `hasItems` query helpers and adopted across dashboard | #21 |
| S-07b | Threaded React Query abort signals through 18 dashboard queryFns | #22 |
| S-08 | Added 7 DB indexes for dashboard predicates (Lovable-implemented) | #23 |

After this work, the client-query path in the four dashboard tabs (`PracticaTab.tsx`, `CarteraTab.tsx`, `EncargoTab.tsx`, `PersonalTab.tsx`) is well-optimized:
- Bulk fetches replace N+1 patterns
- `Promise.all` parallelizes independent fetches
- Abort signals cancel in-flight requests on user navigation
- DB indexes back every dashboard predicate
- Pure aggregation helpers consolidate KPI math
- Explicit column selects reduce payload + improve schema-evolution safety

### What was not done (and why we paused)
- **S-09** — Move dashboard aggregation logic to backend (edge function). The original plan treated S-09 as a pilot on the `Practica` tab.
- **S-11** — Decide whether to deprecate or adopt the existing `supabase/functions/dashboard-data/` edge function.

### Discovery that triggered the deferral
1. `supabase/functions/dashboard-data/index.ts` exists and is **938 lines**, exposing 8 actions: `time-value`, `engagement-kpis`, `staff-utilization`, `portfolio-risk`, `partner-leaderboard`, `my-week`, `timesheet-status`, `practice-pulse`.
2. **Zero callers from this repository's frontend code.** Verified:
   ```bash
   grep -rn "dashboard-data\|invoke('dashboard-data'\|functions/dashboard-data" \
     src --include="*.ts" --include="*.tsx"
   # (no matches)
   ```
3. **Possible callers we cannot see from this repo:**
   - Other Git branches (`sruizmier-scheduler-v2`, `feat/0319-86`, `f/0319-87`, etc.)
   - External tools used by the team (BI tools, debug scripts, manual `curl` testing during development)
   - Cron jobs, webhooks, or Supabase database functions
   - QA / staging environments using a different frontend

Deleting or repurposing the function blind would break any of the above without warning. The repository owner deferred the decision until the external-caller audit can be completed.

---

## 2. Pre-execution audit (MANDATORY before resuming)

Before executing **either path**, complete this audit. Each item below is a specific question that must be answered with evidence, not assumed.

### 2.1 Caller audit (cross-Git-branch)
- [ ] Run `git branch -r` and identify every active branch (`origin/main`, `origin/sruizmier-scheduler-v2`, `origin/feat/*`, `origin/fix/*`, etc.)
- [ ] For each branch with recent commits (last 90 days), grep for `dashboard-data` usage:
  ```bash
  for branch in $(git branch -r --no-merged origin/main); do
    echo "=== $branch ==="
    git --no-pager grep -l "dashboard-data" "$branch" -- 'src/' || echo "(no matches)"
  done
  ```
- [ ] Document any branches that DO call any of the 8 actions

### 2.2 Caller audit (external systems)
Ask the team / repository owner directly:
- [ ] **Debugging collaborators:** Has anyone (developers, QA, BI) been calling the `dashboard-data` actions during their own work?
- [ ] **External integrations:** Are there any cron jobs, webhooks, BI dashboards (Metabase, Looker, Tableau), Slack bots, or scheduled reports that invoke `dashboard-data`?
- [ ] **Mobile/standalone clients:** Is there a mobile app, native client, or standalone integration that consumes `dashboard-data`?
- [ ] **CI/CD or test automation:** Are there end-to-end tests, smoke tests, or staging probes that hit `dashboard-data`?

### 2.3 Function-side observability
If accessible:
- [ ] Check Lovable Cloud's edge function invocation logs for `dashboard-data` over the last 30 days. Look for non-zero invocation count from any source.
- [ ] If invocation count is zero in production for 30+ days → strong signal nobody is calling it
- [ ] If non-zero → identify the caller (look at JWT subject, source IP, user-agent if logged)

### 2.4 Function-side correctness audit
The function was written before the S-01 → S-08 client-side optimizations. Its 8 actions may compute KPIs differently than what the current frontend produces. Before adopting (Path B), establish parity:
- [ ] For each of the 8 actions, document what KPI it returns and what frontend it was originally designed for
- [ ] Compare each action's output to the post-S-08 client-query equivalent
- [ ] Flag any action whose semantics drift from the current frontend (e.g. period-handling differs, filter differs)
- [ ] Identify any action that is now obsolete or duplicates another

---

## 3. Decision tree (after audit)

```
Audit complete?
├── No → Stop. Complete §2 first.
├── Yes
    │
    ├── Any external/cross-branch caller found?
    │   ├── Yes → Path B (Adopt) is mandatory.
    │   │        Cannot delete without breaking active consumers.
    │   │        Or, alternative: Build a compatibility shim.
    │   │
    │   └── No
    │       │
    │       ├── Team wants single source of truth for KPI
    │       │   semantics + willing to invest 2–4 days?
    │       │   ├── Yes → Path B (Adopt)
    │       │   └── No  → Path A (Deprecate)
```

If the audit is **inconclusive** (caller may exist but uncertain), default to Path B's lower-risk variant: build new typed wrappers, leave existing actions untouched, and migrate frontend opportunistically. Worst case is harmless duplication.

---

## 4. Path A — Deprecate (`dashboard-data` deleted)

**Use when:** Audit confirms zero external callers AND team prefers to consolidate on the now-optimized client-query path.

**Effort:** ~1 hour (Lovable prompt + small docs PR).

### 4.1 Steps

#### Step A.1 — Lovable prompt
```
Delete the unused `dashboard-data` edge function and all of its files.

Path: supabase/functions/dashboard-data/
Includes:
- index.ts (938 lines exposing 8 actions: time-value, engagement-kpis,
  staff-utilization, portfolio-risk, partner-leaderboard, my-week,
  timesheet-status, practice-pulse)
- Any associated Deno config (deno.json, import_map.json), README, etc.

Reason for deletion: a multi-collaborator audit (per docs/plans/
LATE_STAGE_S-09_AND_S-11_PLAN.md §2) confirmed zero callers across
all known branches and external systems. The dashboard performance
remediation (PRs #14–#23) optimized the client-query path; the edge
function was an unfinished alternative architecture and is now
unambiguously dead code.

After deletion, undeploy the function from the Lovable Cloud runtime
so any orphan calls get a 404 immediately rather than continuing to
hit cached deployments.
```

#### Step A.2 — Repository follow-up (Claude Code)
- Verify Lovable's commit removed `supabase/functions/dashboard-data/`
- Update `CLAUDE.md` edge-function count: `**Edge Functions** (5)` → `**Edge Functions** (4)`
- Append a CHANGELOG entry (`docs/changelogs/CHANGELOG-<DATE>.md`) documenting:
  - Audit results that justified the deletion
  - Date of deletion
  - Lovable commit SHA that performed the removal
  - Confirmation that no further follow-up is needed on the dashboard architecture

#### Step A.3 — Verification
- `git grep "dashboard-data"` returns only the CHANGELOG / docs references (no code)
- `npm run build`: clean
- `npx vitest run`: full suite passes (no test depended on the function existing)

### 4.2 Risk
- **Low** if §2 audit is comprehensive
- **High** if §2 audit was rushed and a caller exists — they get 404s instantly

### 4.3 Rollback
- Lovable's deletion commit is reversible via `git revert`. The function source is in git history forever; a revert PR plus a Lovable redeploy would resurrect it.

---

## 5. Path B — Adopt (`dashboard-data` becomes the canonical contract)

**Use when:** Audit finds external callers OR team wants single source of truth for KPI semantics + accepts the 2–4 day cost.

**Effort:** 2–4 days minimum. Realistically more given backend testing infrastructure gaps.

### 5.1 Steps

#### Step B.1 — Action audit (½ day)
- Document each of the 8 existing actions with their current input/output shape (read `supabase/functions/dashboard-data/index.ts` end-to-end)
- Map each action to the post-S-08 client-query equivalent in `src/components/dashboard/tabs/*.tsx`
- For each action, decide: **keep / refactor / deprecate**

#### Step B.2 — Schema definition (½ day)
- Define a strict TypeScript response schema per action, in a new file `src/integrations/dashboard/contract.ts`
- Use Zod or a hand-rolled validator at the frontend boundary so untyped JSON from the edge function gets type-narrowed
- Schema lives in this repo (frontend); edge function code references the same schema by structural shape

#### Step B.3 — Pilot: Practica tab (1 day)
- Pick `PracticaTab.tsx` as the pilot (mirrors original plan's S-09 scope)
- Refactor the function actions used by this tab (`practice-pulse`, `partner-leaderboard`) to match the schema and produce KPI values byte-identical to the post-S-08 client-query output
- Add typed frontend wrappers: `getPracticePulse()`, `getPartnerLeaderboard()` in `src/integrations/dashboard/api.ts`
- Add a feature flag (`VITE_DASHBOARD_USE_BACKEND_CONTRACT=true`) so we can toggle between paths during validation
- Wire `PracticaTab` to consume the new API behind the flag
- Run the dashboard tab side-by-side under both flags; verify byte-identical KPI output for representative engagements

#### Step B.4 — Contract tests (½ day)
- Add Deno tests under `supabase/functions/dashboard-data/__tests__/` that exercise each action with fixture inputs and assert on the response shape
- Add frontend snapshot tests for the typed wrapper outputs

#### Step B.5 — Migrate remaining tabs (1–2 days)
- Repeat the pilot pattern for `Cartera`, `Encargo`, `Personal`
- One tab at a time, behind the same feature flag
- Remove the corresponding client-query code only after the new path is validated for that tab

#### Step B.6 — Flag flip + cleanup (½ day)
- Once all four tabs migrated and validated, flip `VITE_DASHBOARD_USE_BACKEND_CONTRACT` to default `true`
- After one stable week in production, delete the now-unused client-query code from each tab (this reverts much of S-02 through S-07b, but the work is preserved in git history)
- Remove the feature flag

### 5.2 Risk
- **Medium** — refactor touches all four dashboard tabs; KPI drift risk during migration
- Mitigation: feature flag + side-by-side validation per tab

### 5.3 Rollback
- Per-tab: flip the feature flag off for that tab. The old client-query code remains until cleanup step (B.6).
- After cleanup: `git revert` the relevant commits.

---

## 6. Cross-cutting concerns (apply to both paths)

### 6.1 Multi-collaborator backend (the trigger for this deferral)
EMS v2.0 uses a single shared Supabase backend across all git branches. Unlike code, database state and edge function deployments are not branch-isolated. Before any backend change:

- Coordinate timing with active collaborators
- Announce the change in advance (Slack, email, or whatever the team uses)
- Prefer reversible changes (Path B's feature-flag pattern) over irreversible (Path A's deletion)
- Consider enabling **Lovable Branches** (per-branch DB isolation) to remove this constraint long-term — see also the post-S-08 CHANGELOG entry on Option B (types.ts regeneration)

### 6.2 RLS policies
Each existing action in `dashboard-data` likely uses the service role key (`SUPABASE_SERVICE_ROLE_KEY`) for cross-user reads. Before Path B:
- Verify each action's authorization model (does it correctly scope by JWT subject, or does it leak data across users?)
- Verify RLS policies on the underlying tables are not being bypassed in ways that would surprise the security team

### 6.3 Observability
The current client-query path is observable via the browser DevTools network panel. Edge function calls are observable only via Lovable Cloud's function logs.
- For Path B: ensure log retention is sufficient for production debugging
- Add `X-Trace-Id` propagation if not already present so a frontend issue can be correlated with a function-side log entry

### 6.4 KPI parity testing
Whichever path, before flipping any user-visible behavior, validate KPI parity. The simplest method:
- Pick 5 representative engagements (small/medium/large by hours)
- Snapshot the dashboard's displayed KPI values on the current code path
- Run the new path against the same engagements
- Diff the values cell-by-cell; require 100% match before merging

---

## 7. Acceptance criteria

### Path A acceptance
- [ ] §2 audit completed and documented (caller list = empty)
- [ ] `supabase/functions/dashboard-data/` directory removed from `sruizmier-performance-v1` (or `main`)
- [ ] `CLAUDE.md` edge-function count updated
- [ ] CHANGELOG entry appended documenting the audit + deletion
- [ ] `git grep "dashboard-data"` returns only docs references
- [ ] `npm run build` clean, `npx vitest run` passes
- [ ] Two-week monitoring period in production with no 404 spikes on `/functions/v1/dashboard-data`

### Path B acceptance
- [ ] §2 audit completed and documented
- [ ] Action audit (B.1) documented per-action
- [ ] Strict schema defined in `src/integrations/dashboard/contract.ts`
- [ ] All four tabs migrated behind feature flag
- [ ] Per-tab KPI parity validated (5 engagements, cell-by-cell diff = 0)
- [ ] Feature flag flipped to default-on for one stable week
- [ ] Old client-query code removed
- [ ] Feature flag removed
- [ ] CHANGELOG entry appended documenting each tab's migration commit

---

## 8. Estimated effort summary

| Path | Effort | Risk | Reversibility |
|---|---|---|---|
| A — Deprecate | ~1 hour | Low (if audit thorough), High (if not) | Easy via `git revert` + redeploy |
| B — Adopt | 2–4 days minimum | Medium | Per-tab via feature flag |

---

## 9. Final reminders for whoever picks this up

1. **Do not act without §2 audit.** The whole reason this got deferred is that we don't know who else is calling the function.
2. **The pre-S-08 plan recommended Path A.** That recommendation was made before the multi-collaborator constraint became visible. Re-evaluate based on the actual audit results.
3. **The 8 existing actions may be stale.** They were written before S-01 through S-08 made the client-query path fast and consistent. Some actions may compute KPIs differently than the current frontend. Path B requires byte-level parity audit.
4. **Lovable Branches is the architectural fix to the multi-collaborator concern.** Worth investigating in parallel with this work.
5. **Both paths benefit from doing S-12 (governance) first.** With perf budgets and instrumentation in place, KPI drift during a Path B migration is much easier to catch.

---

## 10. Appendix — Files and references

### Files involved
- `supabase/functions/dashboard-data/index.ts` (938 lines — the function in question)
- `src/components/dashboard/tabs/PracticaTab.tsx` (Path B pilot)
- `src/components/dashboard/tabs/CarteraTab.tsx` (Path B subsequent)
- `src/components/dashboard/tabs/EncargoTab.tsx` (Path B subsequent)
- `src/components/dashboard/tabs/PersonalTab.tsx` (Path B subsequent)
- `src/integrations/dashboard/contract.ts` (Path B — to be created)
- `src/integrations/dashboard/api.ts` (Path B — to be created)
- `CLAUDE.md` (edge-function count update)
- `docs/changelogs/CHANGELOG-<DATE>.md` (entry to be added)

### Related CHANGELOG entries (`docs/changelogs/CHANGELOG-2026-04-24.md`)
- S-01 through S-08 entries (context for the client-query architecture state)
- "Unexpected `types.ts` Regeneration (resolved)" sub-section in the S-08 entry (Lovable shared-DB caveat that triggered this deferral)
- S-09/S-11 deferral entry (companion to this document)

### Original plan reference
- CODEX_PLAN_v5 in the project root or planning doc (depending on where the team archives plans)
- Sections **S-09 — Introduce backend dashboard contract** and **S-11 — Decide the fate of `dashboard-data` edge function**
