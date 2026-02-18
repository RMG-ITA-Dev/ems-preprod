# AI-Assisted Debugging Workflow v2.0

**Version:** 2.0
**Date:** February 2026
**Author:** SERGIO RUIZ-MIER
**Project:** EMS 2.0 -- Engagement Management System

---

## Executive Summary

This document describes the **three-AI debugging workflow** refined through five development sessions in February 2026, processing 27+ bugs across the EMS 2.0 codebase. The workflow uses three complementary AI systems -- Claude Opus 4.6 Extended for analysis, OpenAI GPT-5.2 Extended (CODEX) for independent arbitration, and Lovable for iterative plan refinement and implementation -- connected by a **version loop** that drives plan quality until CODEX approves.

The key innovation over v1.0 is the CODEX arbitration loop: rather than a single AI generating a plan and implementing it, two AIs independently produce plans, a third compares and merges them, and the system iterates through versioned refinements (v2, v3, v4...) until the arbiter is satisfied. Evidence from production use shows plans reaching v5 before implementation.

---

## Workflow Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                     THREE-AI DEBUGGING WORKFLOW                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  DEVELOPER submits bug JSON                                         │
│       │                                                             │
│       ▼                                                             │
│  ┌──────────────────┐                                               │
│  │  CLAUDE OPUS 4.6 │──── Analyzes codebase, triages bugs           │
│  │    (Analyst)      │──── Generates OPUS_PLAN                      │
│  └────────┬─────────┘                                               │
│           │                                                         │
│           ▼                                                         │
│  ┌──────────────────┐                                               │
│  │     LOVABLE       │──── Reviews in Plan Mode                     │
│  │  (Plan Engine)    │──── Generates LOVABLE_PLAN                   │
│  └────────┬─────────┘                                               │
│           │                                                         │
│           ▼                                                         │
│  ┌──────────────────┐                                               │
│  │   CODEX (GPT-5.2)│──── Compares OPUS_PLAN vs LOVABLE_PLAN       │
│  │    (Arbiter)      │──── Merges best ideas, gives feedback        │
│  └────────┬─────────┘                                               │
│           │                                                         │
│           ▼                                                         │
│  ┌─────────────────────────────────────────────┐                    │
│  │            VERSION LOOP                      │                   │
│  │                                              │                   │
│  │  ┌────────────┐    verify    ┌────────────┐  │                   │
│  │  │ CLAUDE OPUS │◄───────────│  DEVELOPER  │  │                   │
│  │  │ (Verifier)  │            │  (Router)   │  │                   │
│  │  └──────┬─────┘             └──────┬──────┘  │                   │
│  │         │ comments                 │         │                   │
│  │         ▼                          │         │                   │
│  │  ┌────────────┐   next     ┌──────┴──────┐  │                   │
│  │  │  LOVABLE    │──version──►│   CODEX     │  │                   │
│  │  │ (Iterator)  │  (v2,v3)  │ (Approver)  │  │                   │
│  │  └────────────┘            └─────────────┘  │                   │
│  │                                              │                   │
│  │  REPEAT until CODEX approves                 │                   │
│  └──────────────────────────────┬───────────────┘                   │
│                                 │                                   │
│                                 ▼                                   │
│  ┌──────────────────┐                                               │
│  │     LOVABLE       │──── Implements final approved plan           │
│  │ (Implementor)     │──── (e.g., v4)                               │
│  └──────────────────┘                                               │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Bug Submission

The developer submits bugs as structured JSON. This format is unchanged from v1.0 and has proven reliable across 27+ bugs.

### Bug JSON Structure

```json
{
  "bugs": [
    {
      "id": "MMDD-NN",
      "title": "Short descriptive title",
      "severity": "critical | high | medium | low",
      "steps_to_reproduce": [
        "Step 1",
        "Step 2",
        "Step 3"
      ],
      "expected_behavior": "What should happen",
      "actual_behavior": "What actually happens",
      "affected_area": "Module or component name",
      "notes": "Any additional context, screenshots, or observations"
    }
  ]
}
```

### Bug ID Format

v2.0 uses **session-scoped IDs** in the format `MMDD-NN`:

- `MMDD` = month and day of the debugging session
- `NN` = sequential number within that session

Examples: `0213-27` (Feb 13, bug 27), `0213-43` (Feb 13, bug 43), `0217-01` (Feb 17, bug 1).

This format provides natural chronological ordering and session grouping without requiring a global counter.

---

## Phase 2: Claude Project Setup

### Model

**Claude Opus 4.6 Extended** -- selected for deep codebase analysis, long context window, and structured plan generation.

### Knowledge Base

Upload the following artifacts to the Claude project:

| Artifact | Purpose |
|----------|---------|
| `src/integrations/supabase/types.ts` | Database schema (tables, views, functions, enums) |
| `docs/database-schema.sql` | Full DDL with RLS policies and triggers |
| `supabase/ems-er-diagram.md` | Entity-relationship diagram |
| `docs/access_rules.md` | Role-based access control matrix |
| Lovable Custom Knowledge block | Business rules and coding conventions |
| Relevant changelogs | Prior fix history for context |

### Initial Prompt

Provide Claude with:

1. The bug JSON batch
2. A request to analyze the codebase against the bugs
3. Instructions to generate a structured fix plan

---

## Phase 3: Codebase Analysis

Claude Opus analyzes the codebase using the Knowledge Base artifacts. Key analysis areas:

| Area | What Claude Examines |
|------|---------------------|
| Schema | Table relationships, RLS policies, view definitions |
| Hooks | Data fetching patterns, mutation hooks, query invalidation |
| Components | Form logic, state management, conditional rendering |
| Business rules | Rate locking, fiscal year calculations, realization formulas |
| Access control | Role checks, policy enforcement, auth flow |

### Lovable Custom Knowledge

The Lovable instance has a **Custom Knowledge** block containing EMS 2.0 business rules, coding conventions, and architectural constraints. This ensures Lovable's plan generation respects project-specific rules such as:

- Rate locking at Work Order creation
- Fiscal year rule (Oct 1 -- Sep 30)
- Realization calculated from fees, not hours
- 1 Engagement = 1 Work Order (addendum model)
- Semantic Tailwind tokens only (no hardcoded colors)
- `sonner` for toasts, `NumericInput` for numeric fields

---

## Phase 4: Bug Analysis and Triage

Claude Opus processes the bug batch and produces:

1. **Root cause analysis** for each bug
2. **Severity confirmation** or adjustment
3. **Dependency mapping** between bugs (which fixes must precede others)
4. **Cluster grouping** -- bugs sharing root causes are grouped for efficient fixing

### Triage Output Format

```
Bug MMDD-NN: [Title]
  Severity: [confirmed or adjusted]
  Root Cause: [technical explanation]
  Affected Files: [list]
  Dependencies: [other bug IDs, if any]
  Cluster: [cluster name, if applicable]
```

### Batch Processing

Bugs are processed in batches per session. A typical session handles 10-17 bugs. Claude analyzes the full batch before generating any plans, ensuring cross-bug dependencies are identified.

---

## Phase 5: Fix Plan Generation (OPUS_PLAN)

Claude Opus generates the **OPUS_PLAN** -- a structured fix plan for each bug or bug cluster.

### Plan Format

Plans follow the naming convention: `Plan_MMDD-NN_vX`

- `MMDD-NN` = bug ID (or cluster ID like `MMDD-NN_C01`)
- `vX` = version number (starts at v1)

### Plan Structure

Each plan contains:

| Section | Content |
|---------|---------|
| Bug Reference | ID, title, severity |
| Root Cause | Technical explanation with code references |
| Solution | Step-by-step fix description |
| Files Summary | Table of files with action (MODIFY/CREATE/DELETE) and description |
| Risk Assessment | Impact analysis and rollback considerations |
| Dependencies | Prerequisites from other bugs |

### Files Summary Table

```
| # | File | Action | Description |
|---|------|--------|-------------|
| 1 | src/hooks/useExample.ts | MODIFY | Add null check for edge case |
| 2 | src/components/ExampleForm.tsx | MODIFY | Update validation logic |
| 3 | src/lib/calculations.ts | MODIFY | Fix formula for realization |
```

---

## Phase 6: Lovable Plan Review (LOVABLE_PLAN)

The developer pastes the OPUS_PLAN into Lovable using **Plan Mode** (read-only review mode).

### Process

1. Developer enters Plan Mode in Lovable
2. Pastes the OPUS_PLAN for review
3. Lovable generates its own interpretation: the **LOVABLE_PLAN**
4. LOVABLE_PLAN may differ from OPUS_PLAN in:
   - Implementation approach
   - File selection
   - Risk assessment
   - Additional edge cases identified
   - Alternative architectural choices

### Why Two Plans?

Each AI has different strengths:

| Strength | Claude Opus | Lovable |
|----------|-------------|---------|
| Deep schema analysis | Strong | Moderate |
| Live codebase access | Via artifacts | Direct (current code) |
| Business rule awareness | Via Knowledge Base | Via Custom Knowledge |
| Implementation feasibility | Theoretical | Practical (will execute) |
| Cross-file impact analysis | Strong | Strong |

Having both plans exposes blind spots that a single AI would miss.

---

## Phase 7: CODEX Arbitration and Version Loop

This is the **critical quality gate** that distinguishes v2.0 from v1.0.

### The Three-AI Version Loop

```
Step 1: Claude Opus generates OPUS_PLAN
Step 2: Lovable generates LOVABLE_PLAN (its own interpretation)
Step 3: Developer feeds BOTH plans to CODEX (GPT-5.2 Extended)
Step 4: CODEX compares, merges best ideas, gives feedback
        --> CODEX may produce a merged JSON or annotated corrections
Step 5: Developer prompts Claude Opus:
        "Please verify against requirements and comment or approve
         LOVABLE=[CODEX output / merged plan]"
Step 6: LOVABLE produces next version (v2, v3, etc.) with CODEX input
Step 7: Developer feeds new version back to CODEX
Step 8: REPEAT steps 5-7 until CODEX is satisfied
Step 9: Final approved version (e.g., v4) is implemented by Lovable
```

### Role Clarification

| Role in Loop | AI | Action |
|--------------|-----|--------|
| Iterating engine | Lovable | Produces each subsequent plan version (v2, v3, v4...) incorporating CODEX feedback |
| Verification checkpoint | Claude Opus | Reviews CODEX output against requirements, comments or approves |
| Arbiter / Approver | CODEX (GPT-5.2) | Compares plans, merges ideas, drives loop until satisfied |
| Router | Developer | Feeds outputs between the three AIs |

### CODEX Prompt Format

When feeding plans to CODEX:

```
Here are two plans for bug MMDD-NN:

OPUS_PLAN:
[paste Claude's plan]

LOVABLE_PLAN:
[paste Lovable's plan]

Please compare these plans, identify the strongest elements of each,
and produce a merged recommendation or corrections.
```

### Claude Verification Prompt Format

When feeding CODEX output back to Claude:

```
Please verify against requirements and comment or approve
LOVABLE=[CODEX merged output or corrections]
```

### Version Loop Evidence

Real examples from EMS 2.0 development:

| Plan ID | Iterations | Final Version |
|---------|------------|---------------|
| `Plan_0213-27_C01` | 5 rounds | v5 |
| `Plan_0213-43` | 4 rounds | v4 |
| `Plan_0213-27_C03` | 2 rounds | v2 |

The number of iterations varies by complexity. Simple bugs may converge at v2; complex architectural changes may require v4 or v5.

---

## Phase 8: Implementation

Once CODEX approves the final plan version, Lovable implements it.

### Process

1. Developer confirms the approved plan in Lovable
2. Lovable exits Plan Mode and enters Implementation Mode
3. Code changes are applied file by file
4. Lovable reports changes made and any deviations from the plan

### Implementation Notes

- Lovable implements the **final approved version** (e.g., v4), not earlier drafts
- If implementation reveals issues not covered by the plan, a delta plan is created (see Phase 10)
- All changes respect the Custom Knowledge constraints (semantic tokens, component conventions, etc.)

---

## Phase 9: Changelog Documentation

Every implementation session produces a changelog entry following the standardized format.

### Changelog File Naming

`docs/CHANGELOG-YYYY-MM-DD.md` -- one file per session date.

### Entry Format

Each bug fix is documented with:

```markdown
### Bug MMDD-NN: [Title]

**Problem:** [Observable symptom]

**Root Cause:** [Technical explanation of why the bug occurred]

**Solution:** [What was changed and why]

**Files Changed:**

| File | Change |
|------|--------|
| `src/path/to/file.ts` | Description of change |

**Risk Assessment:** [Impact analysis, edge cases considered, rollback plan]

**Plan Version:** Plan_MMDD-NN_vX (X iterations)
```

### Documentation Rule

The changelog entry is a **mandatory final step** of every implementation. It provides:

- Audit trail for the firm
- Institutional memory for future debugging sessions
- Evidence of the plan version that was implemented
- Risk assessment for change management

---

## Phase 10: Verification and Iteration

After implementation, the developer verifies the fix.

### Verification Steps

1. Test the specific reproduction steps from the bug JSON
2. Test related functionality for regressions
3. Review console for errors or warnings
4. Verify mobile responsiveness if UI changes were made

### Delta Handling

If verification reveals remaining issues:

1. Document the delta (what still needs fixing)
2. Create a new bug entry or update the existing one
3. Re-enter the workflow at Phase 5 (plan generation)
4. The delta plan follows the same versioning: `Plan_MMDD-NN_vX+1`

### Post-Implementation Iteration

In practice, some bugs require a second pass. The version loop ensures that even delta plans go through CODEX arbitration before implementation.

---

## Best Practices

Lessons learned from 27+ bugs across 5 sessions in February 2026.

### Bug Submission

1. **Be specific in reproduction steps.** Vague steps waste analysis cycles.
2. **Include the affected area.** This helps Claude focus its codebase analysis.
3. **Note severity honestly.** Over-inflating severity dilutes triage effectiveness.
4. **Batch related bugs.** Submit bugs from the same area together for cluster analysis.

### Plan Generation

5. **Trust the version loop.** Early versions are drafts, not failures. The loop is designed to refine.
6. **Let CODEX drive convergence.** Do not short-circuit the loop by implementing v1.
7. **Include risk assessment.** Every plan must state what could go wrong.
8. **Use structured tables.** File summaries as tables prevent ambiguity.

### Implementation

9. **Implement the approved version only.** Never mix elements from different versions.
10. **Respect Custom Knowledge.** Lovable's business rules exist to prevent regressions.
11. **Document deviations.** If implementation diverges from the plan, record why.

### Documentation

12. **Write the changelog immediately.** Do not defer documentation to a later session.
13. **Include the plan version number.** This creates traceability from bug to plan to implementation.
14. **Record the iteration count.** Future sessions benefit from knowing which bugs required extensive refinement.

---

## Appendix A: Bug JSON Template

```json
{
  "session": "YYYY-MM-DD",
  "submitted_by": "Developer Name",
  "bugs": [
    {
      "id": "MMDD-NN",
      "title": "",
      "severity": "critical | high | medium | low",
      "steps_to_reproduce": [],
      "expected_behavior": "",
      "actual_behavior": "",
      "affected_area": "",
      "notes": ""
    }
  ]
}
```

---

## Appendix B: Plan Template

```markdown
# Plan_MMDD-NN_vX

## Bug Reference
- **ID:** MMDD-NN
- **Title:** [title]
- **Severity:** [severity]

## Root Cause
[Technical explanation with specific code references]

## Solution
[Step-by-step description of the fix]

## Files Summary

| # | File | Action | Description |
|---|------|--------|-------------|
| 1 | path/to/file | MODIFY/CREATE/DELETE | What changes |

## Risk Assessment
- **Impact:** [What areas are affected]
- **Edge Cases:** [What could go wrong]
- **Rollback:** [How to revert if needed]

## Dependencies
- [Other bug IDs that must be fixed first, if any]
```

---

## Appendix C: Changelog Entry Template

```markdown
### Bug MMDD-NN: [Title]

**Problem:** [Observable symptom as reported]

**Root Cause:** [Why the bug occurred -- technical explanation]

**Solution:** [What was changed and the rationale]

**Files Changed:**

| File | Change |
|------|--------|
| `src/path/file.ts` | Description |

**Risk Assessment:** [Impact, edge cases, rollback considerations]

**Plan Version:** Plan_MMDD-NN_vX (X iterations)
```

---

## Appendix D: CODEX Arbitration Syntax

### Initial Comparison Prompt (to CODEX)

```
Here are two plans for bug MMDD-NN:

OPUS_PLAN:
[full plan text]

LOVABLE_PLAN:
[full plan text]

Please compare these plans. For each section, identify which plan
has the stronger approach and why. Produce a merged recommendation
that combines the best elements of both.
```

### Verification Prompt (to Claude Opus)

```
Please verify against requirements and comment or approve
LOVABLE=[CODEX merged output]
```

### Iteration Prompt (to Lovable)

```
CODEX feedback on your plan v[N]:
[paste CODEX feedback]

Claude Opus comments:
[paste Claude verification output]

Please produce plan v[N+1] incorporating this feedback.
```

### Approval Signal (from CODEX)

CODEX signals approval when it determines no further improvements are needed. The developer recognizes this when CODEX's response contains no correction requests and affirms the plan is ready for implementation.

---

## Appendix E: Lovable Knowledge Base Template

The Lovable Custom Knowledge block should contain project-specific rules that govern plan generation and implementation. Template:

```
# [Project Name] -- Lovable Knowledge (Always-On)

## Product
[One-line description]

## Stack and Architecture
- Frontend: [framework, libraries]
- Data fetching: [state management approach]
- Backend: [database, auth, edge functions]
- i18n: [internationalization setup]
- Styling: [design system approach]

## Non-Negotiable Business Rules
- [Rule 1: with specific technical constraint]
- [Rule 2: with specific technical constraint]
- [Rule N: with specific technical constraint]

## Key Component Conventions
- [Convention 1: e.g., toast library]
- [Convention 2: e.g., numeric input component]
- [Convention N: e.g., table styling class]

## Formatting and UI Rules
- [Date format]
- [Number locale]
- [Color system rule]

## Definitions
- [Term 1: definition]
- [Term N: definition]
```

---

*End of document.*
