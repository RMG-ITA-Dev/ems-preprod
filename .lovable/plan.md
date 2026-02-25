# Plan v3: BUG-0220-52-followup-search-display -- Searchable Engagement Selector with Unified CODE - Name Display

**Plan ID**: BUG-0220-52-followup-search-display-v3

---

## Problem

1. **Manual Entry dialog** displays engagements as `engagement_code || engagement_name` (line 287), showing only one or the other -- not the combined `CODE - Name` format used in the stopwatch.
2. **Neither** the stopwatch nor the manual entry dialog has a search bar to filter engagements by partial code or name match.

---

## Locked Decisions


| Decision                 | Value                                                           |
| ------------------------ | --------------------------------------------------------------- |
| Stopwatch eligibility    | Unchanged -- `useApprovedEngagements` (excludes internal)       |
| Manual entry eligibility | Unchanged -- `useManualEntryEngagements` (includes internal)    |
| Backend changes          | None (no DB, no RPC)                                            |
| Architecture             | Single reusable `EngagementCombobox` component                  |
| Search behavior          | Case-insensitive partial match on code and name (cmdk built-in) |
| Display format           | `CODE - Name` (bold code, muted name); fallback to Name only    |


---

## File-by-File Changes

### S1. `src/components/tracker/EngagementCombobox.tsx` (CREATE)

Reusable combobox using existing `Popover` + `Command` primitives.

**Props interface:**

```typescript
interface EngagementComboboxProps {
  engagements: Array<{
    engagement_id: string;
    engagement_code: string | null;
    engagement_name: string;
  }>;
  value: string;                     // selected engagement_id
  onValueChange: (id: string) => void;
  disabled?: boolean;
  placeholder?: string;
}
```

**Implementation:**

- `Popover` wrapping a `Button` trigger (variant="outline", role="combobox")
- Trigger shows selected engagement as `CODE - Name` or placeholder text; includes `ChevronsUpDown` icon
- Inside popover: `Command` > `CommandInput` (placeholder from `t("tracker.searchEngagement")`) > `CommandList` > `CommandEmpty` (text from `t("tracker.noMatchingEngagements")`) > `CommandGroup` with `CommandItem` per engagement
- Each `CommandItem` sets `value` to `"code name"` string for cmdk filtering
- Display per item: `<span className="font-medium">{code}</span><span className="text-muted-foreground ml-2">- {name}</span>`
- Selected item gets a `Check` icon
- Local `open` state; popover closes on selection
- When `disabled` is true, the trigger button is disabled

### S2. `src/components/tracker/TrackerBar.tsx` (MODIFY)

**Lines 5-11 (imports):**  

- **Keep** existing `Select` imports needed by Activity dropdown.
- **Add** `EngagementCombobox` import.
- Only remove an import if it truly becomes unused after refactor.

**Lines 91-123 (engagement selector):** Replace the entire engagement `Select` block with:

```tsx
<div className="flex-1">
  <Label className="text-xs text-muted-foreground mb-1.5 block">
    {t("tracker.engagement")}
  </Label>
  <EngagementCombobox
    engagements={engagements}
    value={engagementId || ""}
    onValueChange={(val) => {
      onEngagementChange(val || null);
      const eng = engagements.find(e => e.engagement_id === val);
      if (eng && !eng.activity_required && adminActivityId) {
        onActivityChange(adminActivityId);
      } else if (eng && !eng.activity_required) {
        onActivityChange(null);
      }
    }}
    disabled={isRunning}
    placeholder={t("tracker.selectEngagement")}
  />
</div>
```

Activity selector (lines 125-148) remains a `Select` -- keep those imports.

### S3. `src/components/tracker/ManualEntryDialog.tsx` (MODIFY)

**Lines 16-22 (imports):** The `Select` imports are still needed for the Activity selector (lines 295-308), so keep them. Add `EngagementCombobox` import.

**Lines 270-292 (engagement selector):** Replace the `Select` block with:

```tsx
<div className="space-y-2">
  <Label>{t("tracker.engagement")}</Label>
  <EngagementCombobox
    engagements={engagements}
    value={engagementId}
    onValueChange={(val) => {
      setEngagementId(val);
      const eng = engagements.find(e => e.engagement_id === val);
      if (eng && !eng.activity_required && adminActivityId) {
        setActivityId(adminActivityId);
      } else {
        setActivityId("");
      }
    }}
    placeholder={t("tracker.selectEngagement")}
  />
</div>
```

This fixes the display from `code || name` to the unified `CODE - Name` format.

### S4. `src/locales/en.json` and `src/locales/es.json` (MODIFY)

Add inside the `"tracker"` object:

**EN:**

```json
"searchEngagement": "Search engagement...",
"noMatchingEngagements": "No matching engagements."
```

**ES:**

```json
"searchEngagement": "Buscar encargo...",
"noMatchingEngagements": "No se encontraron encargos."
```

### S5. `docs/CHANGELOG-2026-02-24.md` (APPEND) like below but more detail please.

```markdown

---

## Enhancement: Searchable Engagement Selector with Unified Display

### Changes

- Created reusable `EngagementCombobox` component (`src/components/tracker/EngagementCombobox.tsx`) using existing `Popover` + `Command` (cmdk) UI primitives. The component accepts an array of engagements and renders a searchable dropdown with `CommandInput` for filtering and `CommandItem` for each engagement.
- Integrated `EngagementCombobox` into Stopwatch (`TrackerBar.tsx` lines 91-123), replacing the basic `Select` engagement dropdown. Activity selector remains as `Select`.
- Integrated `EngagementCombobox` into Manual Entry (`ManualEntryDialog.tsx` lines 270-292), replacing the basic `Select` engagement dropdown. This fixes the display format from `engagement_code || engagement_name` (showing only one) to the unified `CODE - Name` format (showing both). Activity selector remains as `Select`.
- Both selectors now support case-insensitive partial matching by engagement code or engagement name via cmdk's built-in filtering.
- Display format: `CODE - Name` with bold code and muted name text. Falls back to Name only when code is missing.
- Stopwatch eligibility unchanged: continues using `useApprovedEngagements` (excludes internal engagements).
- Manual Entry eligibility unchanged: continues using `useManualEntryEngagements` (includes internal/ADMIN engagements).
- Activity auto-assignment logic preserved in both selectors (auto-assigns ADM activity for engagements where activity is not required).
- Disabled state during running timer preserved in Stopwatch.
- Added i18n keys `tracker.searchEngagement` (EN: "Search engagement...", ES: "Buscar encargo...") and `tracker.noMatchingEngagements` (EN: "No matching engagements.", ES: "No se encontraron encargos.").
- No database or RPC changes.
```

---

## What Stays Unchanged

- `src/hooks/useApprovedEngagements.ts` -- no changes
- `src/hooks/useManualEntryEngagements.ts` -- no changes
- `src/pages/TrackerRecord.tsx` -- no changes
- Activity selectors in both components -- remain as `Select` dropdowns
- All existing eligibility and guard logic

---

## Execution Order

1. Add i18n keys to `en.json` and `es.json` (S4)
2. Create `EngagementCombobox.tsx` (S1)
3. Update `TrackerBar.tsx` (S2)
4. Update `ManualEntryDialog.tsx` (S3)
5. Append `docs/CHANGELOG-2026-02-24.md` There needs to be sufficient detail to be able to verify if the changes to the codebase correspond to the CHANGELOG. (S5)

---

## Acceptance Criteria

1. Both selectors display engagements as `CODE - Name`.
2. Both selectors include a search input for partial matching by code or name.
3. Search is case-insensitive.
4. Stopwatch eligibility unchanged (internal engagements excluded).
5. Manual Entry eligibility unchanged (internal engagements included).
6. Activity auto-assignment logic preserved in both screens.
7. Disabled state during running timer preserved in Stopwatch.
8. No DB or RPC changes.
9. EN/ES i18n parity for new keys.

---

## Verification

1. **Add automated tests to the plan**   
Add at least:
  - search by partial code and partial name in both selectors,
  - label rendering `CODE - Name` in Manual Entry,
  - stopwatch still excludes internal engagements while manual entry includes them.

**Manual QA:**

1. Open Tracker > "Usar cronometro" -- engagement dropdown shows search bar; type partial code or name to filter; selected shows `CODE - Name`; internal engagements NOT visible.
2. Open Tracker > "+ Nuevo Registro de Tiempo" -- engagement dropdown shows search bar; internal/ADMIN engagements visible; selected shows `CODE - Name`.
3. Select engagement in stopwatch, verify activity auto-assignment still works.
4. Start timer, verify engagement selector is disabled.

---

## Risk Register


| Risk                                       | Severity | Mitigation                                                            |
| ------------------------------------------ | -------- | --------------------------------------------------------------------- |
| Regressing stopwatch filtering             | High     | Hooks unchanged; only UI selector replaced                            |
| Inconsistent display across screens        | Low      | Single shared component ensures consistency                           |
| cmdk filter not matching expected behavior | Low      | cmdk built-in filter does case-insensitive substring match by default |


---

## Rollback Plan

1. Delete `EngagementCombobox.tsx`.
2. Restore `Select` blocks in `TrackerBar.tsx` and `ManualEntryDialog.tsx`.
3. Remove i18n keys.
4. No database rollback needed.