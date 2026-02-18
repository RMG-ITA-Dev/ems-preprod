

# Plan: Create AI-Assisted Debugging Workflow v2.0

## Task

Create `docs/AI-Assisted-Debugging-Workflow-v2.md` documenting the three-AI debugging workflow refined through the February 2026 EMS 2.0 sessions.

## The Three-AI System

| AI | Model | Role |
|----|-------|------|
| Claude | Opus 4.6 Extended | Primary analyst: codebase analysis, bug triage, fix plan generation (OPUS_PLAN) |
| Lovable | Claude-based | Plan Mode review, generates LOVABLE_PLAN, produces versioned iterations with CODEX input, implements final approved plan |
| CODEX | OpenAI GPT-5.2 Extended | Independent arbiter: compares plans, merges best ideas, drives version loop until satisfied |

## The Version Loop (Corrected)

```text
1. Claude Opus generates OPUS_PLAN
2. Lovable generates LOVABLE_PLAN (its own interpretation)
3. Developer feeds BOTH plans to CODEX (GPT-5.2 Extended)
4. CODEX compares, merges best ideas, gives feedback
   --> CODEX may produce a merged JSON or annotated corrections
5. Developer prompts Claude Opus:
   "Please verify against requirements and comment or approve
    LOVABLE=[CODEX output / merged plan]"
6. LOVABLE produces next version (v2, v3, etc.) with CODEX input
7. Developer feeds new version back to CODEX
8. REPEAT steps 5-7 until CODEX is satisfied
9. Final approved version (e.g., v4) is implemented by Lovable
```

Key distinction from previous draft: Step 6 -- it is **Lovable** (not Claude Opus) that produces each subsequent plan version incorporating CODEX feedback. Claude Opus serves as a verification checkpoint (step 5), while Lovable is the iterating engine.

Evidence from project: `Plan_0213-27_C01_v5` (5 iterations), `Plan_0213-43_v4` (4 iterations).

## Document Outline

1. **Title Page** -- Version 2.0, February 2026, Author: SERGIO RUIZ-MIER
2. **Executive Summary** -- Three-AI workflow with CODEX arbitration loop
3. **Workflow Overview** -- ASCII diagram showing the three-AI version loop
4. **Phase 1: Bug Submission** -- JSON structure from v1.0 (proven, unchanged)
5. **Phase 2: Claude Project Setup** -- Claude Opus 4.6, Knowledge Base, codebase artifacts
6. **Phase 3: Codebase Analysis** -- Lovable Custom Knowledge reference
7. **Phase 4: Bug Analysis and Triage** -- Session-scoped ID format (MMDD-NN), batch processing
8. **Phase 5: Fix Plan Generation (OPUS_PLAN)** -- Claude generates initial plan
9. **Phase 6: Lovable Plan Review (LOVABLE_PLAN)** -- Lovable generates its own plan in Plan Mode
10. **Phase 7: CODEX Arbitration and Version Loop** -- GPT-5.2 compares both plans; Lovable iterates versions; Claude verifies; loop until CODEX approves
11. **Phase 8: Implementation** -- Final approved version executed by Lovable
12. **Phase 9: Changelog Documentation** -- Standardized format
13. **Phase 10: Verification and Iteration** -- Post-implementation delta handling
14. **Best Practices** -- From 27+ bugs across 5 sessions
15. **Appendix A: Bug JSON Template**
16. **Appendix B: Plan Template** -- `Plan_MMDD-NN_vX` format
17. **Appendix C: Changelog Entry Template**
18. **Appendix D: CODEX Arbitration Syntax**
19. **Appendix E: Lovable Knowledge Base Template**

## Style Rules

- No emojis in headers
- `---` horizontal rules between major sections
- Tables for structured data
- ASCII box-drawing diagrams for workflows
- Clean, professional tone
- Concrete examples from actual EMS 2.0 bugs

## File

| File | Action | Description |
|------|--------|-------------|
| `docs/AI-Assisted-Debugging-Workflow-v2.md` | CREATE | Three-AI workflow with corrected version loop |

