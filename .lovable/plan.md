

# Bug #20: Friendly Delete Prevention for Clients With Engagements

## Problem

Deleting a client with linked engagements shows a generic "violates data constraints" error. The delete button should be disabled when engagements exist, and hovering over it should explain that all engagements must be deleted first.

## Fix

### 1. `src/pages/ClientEdit.tsx`

- Add a `useQuery` count query for engagements linked to the client.
- If `count > 0`: replace the AlertDialog with a **disabled** Button wrapped in a Tooltip. The tooltip message: "To delete this client, all associated engagements must be deleted first."
- If `count === 0`: keep the existing AlertDialog delete flow.
- Add a safety pre-check in `handleDelete` (queries engagement count before executing delete; shows toast if any exist).

### 2. `src/components/forms/ClientForm.tsx`

- Same pattern for the full-layout (non-compact) delete button: count query, conditional disable with Tooltip, pre-check in `handleDelete`.

### 3. Locale strings

| Key | en | es |
|-----|----|----|
| `client.cannotDeleteTooltip` | To delete this client, all associated engagements must be deleted first. | Para eliminar este cliente, primero debe eliminar todos los encargos asociados. |
| `client.cannotDelete` | Cannot delete this client | No se puede eliminar este cliente |

### 4. Imports needed

- `useQuery` from `@tanstack/react-query` (already used in the project)
- `Tooltip, TooltipTrigger, TooltipContent, TooltipProvider` from `@/components/ui/tooltip`
- `supabase` from `@/integrations/supabase/client`

## Files Modified

| File | Change |
|------|--------|
| `src/pages/ClientEdit.tsx` | Add engagement count query, conditional disabled button with hover tooltip, pre-check in `handleDelete` |
| `src/components/forms/ClientForm.tsx` | Same pattern for full-layout delete button |
| `src/locales/en.json` | Add `client.cannotDeleteTooltip`, `client.cannotDelete` |
| `src/locales/es.json` | Add `client.cannotDeleteTooltip`, `client.cannotDelete` |

## Technical Notes

- Count query: `supabase.from('engagements').select('engagement_id', { count: 'exact', head: true }).eq('client_id', clientId)` -- efficient, returns no row data.
- Radix Tooltip requires a non-disabled element as trigger, so the disabled Button is wrapped in a `<span>` inside `TooltipTrigger asChild`.
- The hover tooltip clearly states: the user must delete all engagements before they can delete the client.

