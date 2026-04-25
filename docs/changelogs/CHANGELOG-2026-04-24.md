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

<!-- Subsequent steps (S-02 → S-12) will be appended below as their PRs are produced. -->
