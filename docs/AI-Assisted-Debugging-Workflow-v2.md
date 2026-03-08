# AI-Assisted Bug Fix Workflow

## A Systematic Approach to Debugging Web Applications Using Lovable.dev, Claude Code, and OpenAI Codex

**Version:** 2.0  
**Last Updated:** March 2026  
**Author:** SERGIO RUIZ-MIER

---

## Executive Summary

This document describes a systematic workflow for triaging, planning, and resolving bugs in a web application using a three-model AI-assisted development pipeline. The workflow leverages **Lovable.dev** as the sole implementation engine, **Claude Code** for an independent analysis plan, and **OpenAI Codex** as the central arbiter that synthesizes and iterates plans to convergence. All three AI agents operate against the same GitHub repository, but only Lovable.dev is authorized to modify code on Main.

---

## Workflow Overview

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                     AI-ASSISTED BUG FIX WORKFLOW v2.0                           │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐                     │
│  │   QA Team    │────▶│  Bug JSON +  │────▶│   LOVABLE    │                     │
│  │   Testing    │     │  Screenshot  │     │  Plan v1     │                     │
│  └──────────────┘     └──────────────┘     └──────┬───────┘                     │
│                              │                    │                             │
│                     ┌────────┴────────┐           │                             │
│                     ▼                 ▼           │                             │
│              ┌──────────────┐  ┌──────────────┐   │                             │
│              │ CLAUDE CODE  │  │    CODEX     │   │                             │
│              │ Plan (1x)    │  │   Own Plan   │   │                             │
│              └──────┬───────┘  └──────┬───────┘   │                             │
│                     │                 │           │                             │
│                     └────────┬────────┘           │                             │
│                              ▼                    │                             │
│                     ┌──────────────────┐          │                             │
│                     │  CODEX Compares  │◀─────────┘                             │
│                     │  All 3 Plans     │                                        │
│                     └────────┬─────────┘                                        │
│                              ▼                                                  │
│                     ┌──────────────────┐                                        │
│                     │ CODEX Outputs:   │                                        │
│                     │  • Best Plan JSON│                                        │
│                     │  • Lovable Prompt│                                        │
│                     └────────┬─────────┘                                        │
│                              ▼                                                  │
│              ┌──────────────────────────────────┐                               │
│              │     PLAN ITERATION LOOP          │                               │
│              │                                  │                               │
│              │  LOVABLE ◀──────▶ CODEX          │                               │
│              │  (Plan vN)       (Verify/Revise) │                               │
│              │                                  │                               │
│              │  Repeat until CODEX approves     │                               │
│              └──────────────┬───────────────────┘                               │
│                             ▼                                                   │
│              ┌──────────────────────────────────┐                               │
│              │  Backup Plan to .docx            │                               │
│              │  LOVABLE executes final Plan     │                               │
│              │  CHANGELOG appended to codebase  │                               │
│              └──────────────────────────────────┘                               │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## Roles and Constraints

| Agent | Role | Repo Access | Can Modify Code? |
|-------|------|-------------|------------------|
| **Lovable.dev** | Implementation engine; creates and executes plans | Yes (Main) | **Yes** — sole authority |
| **Claude Code** | Independent plan generation (one shot) | Yes (Main, PLAN_MODE only) | No |
| **OpenAI Codex** | Central arbiter; compares, iterates, approves plans | Yes (Main, PLAN_MODE only) | No |

Key constraint: **All code changes to the Main branch are made exclusively through Lovable.dev.** Claude Code and Codex are used only in plan/analysis mode.

Note on cost: Claude Code produces only one plan per bug due to cost considerations. The iteration loop runs between Lovable and Codex.

---

## Phase 1: Bug Submission

### 1.1 QA Team Prepares Bug List

The testing team documents all discovered bugs in a structured JSON format. Each bug is a JSON object in a list stored in a text or `.docx` file. Related screenshots are stored in a shared folder, with filenames matching the bug ID.

### 1.2 Bug JSON Structure

```json
[
  {
    "ID": "0213-36",
    "FECHA": "2026-02-13",
    "TIPO DE ERROR": "Funcional",
    "TITULO": "Horas de socio",
    "VERSION": "v2.0.4",
    "DESCRIPCION": "Detailed description of the bug...",
    "SUGERENCIA": null,
    "CAPTURA": "0213-36.png",
    "RUTA": "OPERACIONES-Hoja de Tiempo",
    "USUARIO SIS": "jyujra",
    "PRIORIDAD": "Media",
    "ESTADO": "Abierto",
    "TESTER": "juanyujra"
  }
]
```

### 1.3 Field Definitions

| Field | Type | Description |
|-------|------|-------------|
| `ID` | String | Unique bug identifier (format: MMDD-NN) |
| `FECHA` | Date (YYYY-MM-DD) | Date bug was discovered |
| `TIPO DE ERROR` | Enum | Category: Funcional, UI, Seguridad, Datos, Consulta |
| `TITULO` | String | Short descriptive title of the bug |
| `VERSION` | String/Null | Application version where bug exists |
| `DESCRIPCION` | String | Detailed description with context, module, affected functionality, and root problem |
| `SUGERENCIA` | String/Null | Optional suggestion from the tester on how to fix |
| `CAPTURA` | Filename/Null | Screenshot filename (stored in shared folder, matches bug ID) |
| `RUTA` | String | Navigation path in the app where the bug is found |
| `USUARIO SIS` | String/Null | System username that encountered the bug |
| `PRIORIDAD` | Enum | Priority: Alta (High), Media (Medium), Baja (Low) |
| `ESTADO` | Enum | Status: Abierto (Open), En Progreso, Cerrado |
| `TESTER` | String | Name of QA team member who reported |

### 1.4 Screenshots

Screenshots are kept in a shared folder. The filename corresponds to the `CAPTURA` field in the bug JSON (e.g., bug `"ID": "0213-36"` maps to `0213-36.png`). The screenshot is manually loaded into Lovable alongside the bug JSON at the start of each debugging session.

---

## Phase 2: Parallel Plan Generation

Each debugging session targets a single bug. The bug's JSON and screenshot are fed to three AI agents in parallel.

### 2.1 Lovable Plan v1

Open Lovable.dev in planning mode. Use the following prompt template, replacing `XXXXXXXXXXX` with the bug's JSON and attaching the corresponding screenshot:

```
Prepare Plan v1 considering BUG=[XXXXXXXXXXX]. Never output partial plans.
Always a complete immediately implementable plan.

First make a plan do not make the changes until I have a chance to review
the plan and tell you to proceed. Please provide a Complete Plan.
```

This produces `LOVABLE_PLAN_v1`.

### 2.2 Claude Code Plan

In a separate window, with Claude Code connected to the GitHub repo (Main) in **PLAN_MODE**, provide the same bug JSON and screenshot. Let Claude Code produce its own independent plan. This produces `CLAUDE_PLAN`.

Claude Code is used only once per bug (due to cost). It does not participate in the iteration loop.

### 2.3 Codex Own Plan

In a separate Codex window (also connected to the GitHub repo in plan mode), Codex independently develops its own plan from the same bug input. This gives Codex its own perspective before comparing all three.

---

## Phase 3: Plan Synthesis in Codex

### 3.1 Three-Way Comparison

Centralize all plans in the Codex window. Use this prompt:

```
Use your plan and compare it to these two other plans

LOVABLE_PLAN=[LLLLLLLL];

CLAUDE_CODE_PLAN=[CCCCCCC]

The purpose of this comparison is to determine which aspect of which plan
would yield the best plan to fix the issues. Best plan being the one that
results in the most resilient software. We want consistency, compactness,
no AI SLOP, foolproof code that never breaks, even if the user is an idiot
and tries hard to break it.
```

### 3.2 Review and Refine

Review Codex's findings. Ask follow-up questions or provide suggestions until satisfied with the synthesized approach.

### 3.3 Export Final Plan and Lovable Prompt

Once satisfied, prompt Codex:

```
Give me a Complete Plan in a JSON format. In a separate JSON write a Prompt
for LOVABLE instructing it to change its PLAN to your new plan.
```

Codex outputs two artifacts: `CODEX_JSON_PLAN` and `CODEX_JSON_PROMPT`.

---

## Phase 4: Plan Iteration Loop (Lovable ↔ Codex)

### 4.1 Feed Codex Output to Lovable

Insert the two Codex JSON artifacts into Lovable using this prompt:

```
Prepare the next version of the plan (Next version always means if current
version is v(X) next= v(X+1) where X is an integer, so if v1 then next is v2,
etc.) considering CODEX=[CODEX_JSON_PROMPT; CODEX_JSON_PLAN]. Never output
partial plans. Always a complete immediately implementable plan.

First make a plan do not make the changes until I have a chance to review
the plan and tell you to proceed. Please provide a Complete Plan.
```

Lovable returns the next plan version (e.g., `LOVABLE_PLAN_v2`).

### 4.2 Codex Verifies Lovable's Updated Plan

Feed the new Lovable plan back to Codex for verification:

```
Please verify against requirements and comment or approve
LOVABLE_PLAN=[XXXX]. Do not make "suggestions". If something is important
prepare and include it in the Complete Plan you will output in this chat,
if not important, then do not.
```

### 4.3 Iterate Until Approval

Repeat steps 4.1 and 4.2. Each cycle increments the plan version (v2 → v3 → v4 ...). The loop ends when Codex approves the plan with no remaining issues.

Typical convergence: **3–5 iterations**. Occasionally 9+ iterations, which may indicate prompting or bug-complexity issues.

---

## Phase 5: Plan Backup and Execution

### 5.1 Backup the Approved Plan

Once Codex approves, copy the final plan into a `.docx` file. This serves as the Plans Backup archive.

### 5.2 Execute in Lovable

Instruct Lovable to execute the approved plan. The plan always includes a final step that appends a changelog entry to the codebase:

```
Changelog Append
File: docs/CHANGELOG-YYYY-MM-DD.md

You need to append to the CHANGELOG a detailed description of the changes
made while implementing this Plan. There needs to be sufficient detail to
be able to verify if the changes to the codebase correspond to the CHANGELOG.
```

### 5.3 Verify Execution

After Lovable completes execution, review the CHANGELOG and the implemented changes to confirm the bug fix matches the approved plan.

---

## Manual Steps Summary

The following steps in this workflow are currently performed manually and represent automation opportunities for future versions:

1. Extracting individual bug JSON from the bug list file
2. Locating and loading the corresponding screenshot from the shared folder
3. Pasting the bug JSON into Lovable's prompt
4. Copy-pasting plans between Lovable, Claude Code, and Codex windows
5. Copy-pasting Codex's JSON outputs back into Lovable
6. Copying the approved plan into a .docx backup file
7. Monitoring the iteration loop and deciding when to stop

---

## Best Practices

### For QA Teams

1. **Be Specific:** Include exact steps to reproduce in `DESCRIPCION`
2. **Add Screenshots:** Name them to match the bug `ID` and place in the shared folder
3. **Note Context:** Include module, user profile, affected functionality, and navigation path in `RUTA`
4. **Prioritize Honestly:** Not everything is "Alta"
5. **Use SUGERENCIA:** If the tester has an idea for a fix, include it

### For Plan Generation

1. **One Bug at a Time:** Each debugging session targets a single bug
2. **Let All Three Agents Work Independently First:** Don't bias Claude Code or Codex with Lovable's plan before they produce their own
3. **Be Explicit About Resilience:** The goal is foolproof, compact code — emphasize this in prompts
4. **Don't Accept Partial Plans:** Always require complete, immediately implementable plans

### For the Iteration Loop

1. **Trust the Process:** Let Codex be the arbiter — don't skip verification steps
2. **Track Version Numbers:** Plan versions increment sequentially (v1, v2, v3...)
3. **If Iterations Exceed 5:** Re-examine the bug description for ambiguity or consider splitting the bug
4. **Keep Claude Code to One Shot:** It provides a valuable independent perspective without the cost of iteration

### For Execution

1. **Always Backup the Plan:** Save to `.docx` before letting Lovable execute
2. **Require the Changelog Step:** Every plan must end with the changelog append
3. **Verify Against the Plan:** Compare the CHANGELOG output to the approved plan to confirm completeness

---

## Tools & Resources

| Tool | Purpose | Repo Access | Link |
|------|---------|-------------|------|
| Lovable.dev | Implementation (sole code authority) | Main (read/write) | lovable.dev |
| Claude Code | Independent plan generation (1x per bug) | Main (PLAN_MODE, read-only) | — |
| OpenAI Codex | Plan synthesis, iteration, and approval | Main (PLAN_MODE, read-only) | — |
| GitHub | Version control | Main branch | github.com |

---

## Appendix: Prompt Templates

### A. Lovable — Initial Plan (v1)

```
Prepare Plan v1 considering BUG=[{BUG_JSON}]. Never output partial plans.
Always a complete immediately implementable plan.

First make a plan do not make the changes until I have a chance to review
the plan and tell you to proceed. Please provide a Complete Plan.
```

### B. Codex — Three-Way Comparison

```
Use your plan and compare it to these two other plans

LOVABLE_PLAN=[{LOVABLE_PLAN}];

CLAUDE_CODE_PLAN=[{CLAUDE_PLAN}]

The purpose of this comparison is to determine which aspect of which plan
would yield the best plan to fix the issues. Best plan being the one that
results in the most resilient software. We want consistency, compactness,
no AI SLOP, foolproof code that never breaks, even if the user is an idiot
and tries hard to break it.
```

### C. Codex — Export Plan + Lovable Prompt

```
Give me a Complete Plan in a JSON format. In a separate JSON write a Prompt
for LOVABLE instructing it to change its PLAN to your new plan.
```

### D. Lovable — Iterate Plan

```
Prepare the next version of the plan (Next version always means if current
version is v(X) next= v(X+1) where X is an integer, so if v1 then next
is v2, etc.) considering CODEX=[{CODEX_JSON_PROMPT}; {CODEX_JSON_PLAN}].
Never output partial plans. Always a complete immediately implementable plan.

First make a plan do not make the changes until I have a chance to review
the plan and tell you to proceed. Please provide a Complete Plan.
```

### E. Codex — Verify Lovable Plan

```
Please verify against requirements and comment or approve
LOVABLE_PLAN=[{LOVABLE_PLAN_vN}]. Do not make "suggestions". If something
is important prepare and include it in the Complete Plan you will output
in this chat, if not important, then do not.
```

### F. Changelog Append (Included in Every Plan)

```
Changelog Append
File: docs/CHANGELOG-YYYY-MM-DD.md

You need to append to the CHANGELOG a detailed description of the changes
made while implementing this Plan. There needs to be sufficient detail to
be able to verify if the changes to the codebase correspond to the CHANGELOG.
```

### G. Bug Report Template (for QA)

```json
{
  "ID": "",
  "FECHA": "YYYY-MM-DD",
  "TIPO DE ERROR": "",
  "TITULO": "",
  "VERSION": "",
  "DESCRIPCION": "",
  "SUGERENCIA": null,
  "CAPTURA": "",
  "RUTA": "",
  "USUARIO SIS": "",
  "PRIORIDAD": "",
  "ESTADO": "Abierto",
  "TESTER": ""
}
```

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | January 2026 | Initial workflow documentation (single-model Claude approach) |
| 2.0 | March 2026 | Rewritten for three-model pipeline (Lovable + Claude Code + Codex); added plan iteration loop, prompt templates, manual steps summary |

---

*This workflow was developed through practical application on production web applications and refined through multiple iteration cycles.*
