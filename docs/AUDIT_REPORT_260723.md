# EMS 2.0 — Changelog Audit Report

**Date:** 23 July 2026
**Audited branch:** development@eaf6728
**Baseline:** CHANGELOG-2026-04-30.md, landed by PR #46 (fce9b80)
**Scope:** Directed backfill of selected functional integrations plus branch-status audit
**Status:** ✅ Directed backfill complete; residual documentation debt recorded

---

## Executive Summary

The audit corrected the issue's original baseline. The latest changelog present on
development is CHANGELOG-2026-04-30.md, not CHANGELOG-2026-07-19.md. The
2026-05-06 through 2026-07-19 Scheduler changelogs exist on the Scheduler/Claude
line only and are not part of development.

The directed backfill documents 11 selected functional integrations already
contained in development in CHANGELOG-2026-07-23.md. Scheduler branches remain
outside development and are recorded as pending; their changelogs were not
ported. Other functional merges after the April baseline are inventoried below
as residual documentation debt rather than being silently treated as complete.

| Metric | Result |
|---|---:|
| Directed integrations selected | 11 |
| Directed integrations documented | 11 / 11 |
| Unique migrations cited and verified | 16 |
| Scheduler branch lines outside development | 5 |
| Additional numbered functional PR merges after baseline | 38 |
| Additional direct maintenance events outside directed scope | 6 |

---

## Section 1: Baseline and Method

The baseline is the first-parent changelog landing fce9b80, which added
CHANGELOG-2026-04-30.md through PR #46. The audit head is eaf6728, the merge
of PR #231 into development.

For each directed entry, the effective merge diff (merge first parent to merge
commit) was used to identify principal files, tests, migrations, and backend
changes. PR descriptions and recorded checks supplied historical test and
deployment evidence. Where no command/result transcript was recoverable, the
changelog states that limitation instead of inventing a result.

The directed scope intentionally excludes the documentation-only PR #82 and
the already-documented baseline PR #46. It does not claim that every other
functional merge after 30 April has already received a dedicated changelog.

---

## Section 2: Integrated and Documented

All recorded merge/direct commits below are ancestors of development@eaf6728 and
have a corresponding entry in CHANGELOG-2026-07-23.md. The source branch
feat/0602-134-fecha-inicio has a later equivalent hotfix tip (c8cc84a) that is
not itself an ancestor; its patch is represented by integrated commit dbed93a.

| Branch / integration | PR or commit | Merge | Migration status | Changelog |
|---|---|---|---|---|
| feat/0526-122 | #218 | 24e0dad | 2 migrations verified | [Entry](changelogs/CHANGELOG-2026-07-23.md#feat0526-122--pr-218--departmental-holidays-and-office-scoped-pending-hours) |
| fix/0306-78 | direct 94a6b7a | 94a6b7a | None | [Entry](changelogs/CHANGELOG-2026-07-23.md#fix0306-78--direct-development-hotfix) |
| feat/0625-150-plan-pagos | #196 | a4d3181 | 1 migration verified | [Entry](changelogs/CHANGELOG-2026-07-23.md#feat0625-150-plan-pagos--pr-196--work-order-payment-plans) |
| feat/0625-151-contrato-escaneado | #204 | 176f8fa | 2 migrations verified | [Entry](changelogs/CHANGELOG-2026-07-23.md#feat0625-151-contrato-escaneado--pr-204) |
| feat/0602-134-fecha-inicio | #203 + dbed93a follow-up | 09520a2 | Shared fiscal-year guard delta | [Entry](changelogs/CHANGELOG-2026-07-23.md#feat0602-134-fecha-inicio--pr-203) |
| feat/0604-143 | #201 | 9419c5a | 2 migrations touched | [Entry](changelogs/CHANGELOG-2026-07-23.md#feat0604-143--pr-201--closing-date-and-fiscal-year-override) |
| feat/0702-152 | #202 | b0c57b8 | 2 migrations verified | [Entry](changelogs/CHANGELOG-2026-07-23.md#feat0702-152--pr-202--service-scoped-categories) |
| feat/0513-114 | #199 | d565661 | 3 migrations verified | [Entry](changelogs/CHANGELOG-2026-07-23.md#feat0513-114--pr-199--service-linked-activity-codes) |
| fix/0625-148 | #195 | e60967a | None | [Entry](changelogs/CHANGELOG-2026-07-23.md#fix0625-148--pr-195--role-scoped-service-selection) |
| feat/0602-135-136 | unnumbered merge | 01f0d39 | 3 migrations verified | [Entry](changelogs/CHANGELOG-2026-07-23.md#feat0602-135-136--direct-merge-without-numbered-pr) |
| fix/0714-154 | #231 | eaf6728 | 1 migration verified | [Entry](changelogs/CHANGELOG-2026-07-23.md#fix0714-154--pr-231--worksheet-service-scope-and-atomic-saves) |

The shared migration
20260703000000_engagement_fiscal_year_update_guard.sql is deliberately
described as a creation/change sequence across PRs #201 and #203 rather than
counted twice.

---

## Section 3: Scheduler Branches Outside development

None of the rows below is an ancestor of development@eaf6728. Their existing
Scheduler changelogs remain on their source line and were not copied into this
backfill.

| Ref | Scheduler relationship | Status relative to development |
|---|---|---|
| sruizmier-scheduler-v3@c1cb303 | Contains Scheduler phases and merged PRs #229, #230, and #232–#235; contains changelogs through 2026-07-19. | **Not integrated** |
| claude/getting-it-working-7n7pho@06b3bb2 | PR #229, L2 Scheduler Cancel navigation; ancestor of Scheduler v3. | **Not integrated** |
| claude/engagement-assignments-category-id-7o30cu@c0ed0b6 | PR #230, canonical engagement_assignments shape and category_id/RLS repair; ancestor of Scheduler v3. | **Not integrated** |
| claude/fix-revoked-session-recovery@91305cd | PR #235, revoked cross-origin session recovery; ancestor of Scheduler v3. | **Not integrated** |
| claude/scheduler-changes-b8w5wl@4949357 | Contains merged #232–#234 plus the three follow-up commits of open PR #236. | **Not integrated; PR #236 open** |

The Scheduler line also contains work from earlier Scheduler phases. This
report records the branch boundary and does not represent those changes as
available in development.

---

## Section 4: Residual Documentation Debt

The following functional PR merges are in the post-30-April first-parent
history of development but are outside this directed backfill. They remain
explicit follow-up work:

| Period | PRs / integrations |
|---|---|
| May | #96, #92, #93, #89, #95, #94, #103, #104, #88, #107, #115, #111, #123, #121, #120, #119, #127 |
| June | #139, #137, #138, #142, #145, #146, #155, #154, #156, #152, #160, #159, #164, #163, #172, #173, #166, #175 |
| July | #198, #193, #194 |
| Direct maintenance commits | 33e78b5, 8214ec2, 49c2ac5, 8fca5c2, 62a7b75, 352dbc4 |

These items are not classified as “documented” merely because the affected
code is present in development. A future exhaustive backfill should use the
same merge-diff, PR-evidence, migration, and deployment rules applied here.

---

## Section 5: Verification Record

The following checks are required for and were used to validate this report:

- The 11 directed merge/direct commits resolve as commits and are contained by
  development@eaf6728.
- The Scheduler refs listed in Section 3 are not ancestors of development;
  the three child branches marked as Scheduler-contained are ancestors of
  sruizmier-scheduler-v3.
- The c8cc84a and dbed93a EngagementForm hotfixes are patch-equivalent; the
  latter is the commit integrated into development.
- All 16 unique migration filenames cited by the directed changelog exist in
  supabase/migrations/.
- Migration and Edge Function entries state the repository's required Lovable
  action: Apply pending Supabase migrations or the exact Deploy the
  <name> edge function prompt.
- No build or Vitest run is presented as historical evidence for this
  documentation-only change.

---

## Conclusion

The directed changelog gap is closed for the 11 selected integrations already
in development. Scheduler work remains clearly separated as not integrated,
including open PR #236. The report preserves the larger post-baseline gap as
follow-up debt instead of implying that this targeted backfill is an
exhaustive historical reconstruction.
