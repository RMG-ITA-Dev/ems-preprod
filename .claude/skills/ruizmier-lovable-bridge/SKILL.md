---
name: ruizmier-lovable-bridge
description: >
  Bridge between Ruizmier Skill Set and Lovable.dev — prompt templates and workflow guidance.
  Use when preparing prompts for Lovable, discussing Lovable development workflow,
  or helping the team use Lovable with Ruizmier design conventions.
  Keywords: lovable, prompt, template, bridge, workflow, development, team.
user-invocable: true
---

# Ruizmier Lovable Bridge

Lovable.dev does not read `.claude/skills/` directly. To use the Ruizmier Skill Set in Lovable:

## How It Works

1. The skill docs live in `docs/skills/` — these are plain markdown files synced to the repo
2. Lovable reads the full repo via GitHub sync, so it can access these files
3. When prompting Lovable, **reference the docs by path** so Lovable reads them for context

## Quick Workflow

1. Open `docs/skills/lovable-prompts.md` for copy-paste prompt templates
2. Pick the template matching your task (new CRUD module, style a form, add nav item, etc.)
3. Replace `[placeholders]` with your specifics
4. Paste into Lovable's chat

## Available Templates

| Template | Use Case |
|----------|----------|
| New CRUD Module | Complete entity with list + add + edit pages |
| New List Page Only | Read-only data view |
| Style a Form | Align existing form to design system |
| Add Sidebar Nav Item | Add navigation entry |
| Make Component Responsive | Apply responsive patterns |
| Add Status Badge Column | DataTable status column |
| Create Confirmation Dialog | Delete/action confirmation |

## General Rules to Include

Always include these baseline rules in Lovable prompts:
- Button colors: Purple=Add/Save, Gray=Cancel, Blue=Submit, Crimson=Delete
- No back arrows — use Cancel button
- Date format: DD/MM/YYYY
- Numbers: right-aligned, zero decimals, no currency signs in cells
- All text through i18n: `t("key")`
- High density: `space-y-2`, `p-4`, `text-xs` labels, `text-sm` data

## Full Reference

See `docs/skills/lovable-prompts.md` for all prompt templates with complete examples.
See `.lovable/instructions.md` for the Lovable context file.
