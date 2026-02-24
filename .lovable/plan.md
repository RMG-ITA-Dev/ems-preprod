

# Plan: Focus Mode and Navigation Safety for Timesheet, Approvals Detail, and Settings Global Tab (v4)

---

## 1) Objective

Apply the proven focus-mode pattern (hidden sidebar/mobile nav + navigation lock + explicit safe-exit) to three contexts, ensuring every protected render branch (loading, error, empty, main) provides at least one explicit safe exit. The Approvals list page and non-global Settings tabs remain normal contexts with sidebar visible.

**v4 refinements over v3**: Back navigation uses `navigate(-1)` with fallback to a known route. Test assertions explicitly verify `allowNextNavigation()` call order before `navigate()`.

---

## 2) Route-by-Route Behavior Contract

| Route | Context Type | Sidebar | Mobile Nav | Nav Lock | isDirty Rule | Exit Controls | All Branches Protected? |
|---|---|---|---|---|---|---|---|
| `/timesheet` | Protected edit | Hidden | Hidden | Yes | `false` (auto-saves) | Back button in every branch + LeavePageDialog | Yes |
| `/timesheet/approvals` | Normal list | Visible | Visible | No | N/A | Standard sidebar/nav | N/A |
| `/timesheet/approvals/:periodId` | Protected decision | Hidden | Hidden | Yes | `hasDecisions` | Cancel button (loading/empty: Back button) + LeavePageDialog | Yes |
| `/settings` (non-global tab) | Normal | Visible | Visible | No | N/A | Standard sidebar/nav | N/A |
| `/settings` (global tab active) | Protected config | Hidden | Hidden | Yes | `isGlobalDirty` (computed) | Cancel button resets + switches tab + LeavePageDialog | Yes |

### Protected-State Exit Invariant

Every render path (`if (loading)`, `if (error)`, `if (!data)`, main return) that uses `focusMode` MUST include:
1. An explicit in-screen exit control (Back or Cancel button).
2. A `<LeavePageDialog>` component.

---

## 3) File-by-File Add/Change/Delete Actions

| # | File | Action | Description |
|---|------|--------|-------------|
| 1 | `src/pages/TimeSheet.tsx` | **Change** | Add `focusMode` to all 4 `AppLayout` calls. Add `usePageLeaveLock`, `useNavigate`, Back button + `LeavePageDialog` in all 4 branches. |
| 2 | `src/pages/TimesheetApprovals.tsx` | **No change** | Normal list context. |
| 3 | `src/pages/TimesheetApprovalDetail.tsx` | **Change** | Add `focusMode` to all 3 `AppLayout` calls. Add `usePageLeaveLock`. Wire `handleBack` and post-save navigate through `allowNextNavigation()`. Add Back button to loading/empty branches. Add `LeavePageDialog` to all 3 branches. |
| 4 | `src/pages/Settings.tsx` | **Change** | Add controlled tab state. Conditional `focusMode={activeTab === "global"}`. Add `usePageLeaveLock` with `isGlobalDirty`. Add `handleCancelGlobal` with full reset. Add Cancel button next to Save. Add `LeavePageDialog`. Wire save success to exit global tab. |
| 5 | `src/locales/en.json` | **Change** | Add `"back": "Back"` in `common` block. |
| 6 | `src/locales/es.json` | **Change** | Add `"back": "Volver"` in `common` block. |
| 7 | `src/pages/__tests__/TimeSheet.focus-lock.test.tsx` | **Add** | 4 tests. |
| 8 | `src/pages/__tests__/TimesheetApprovalDetail.lock-navigation.test.tsx` | **Add** | 4 tests. |
| 9 | `src/pages/__tests__/Settings.global-focus-cancel.test.tsx` | **Add** | 5 tests. |
| 10 | `docs/CHANGELOG-2026-02-22.md` | **Change** | Append changelog entry at end of file. |

No files deleted. No database/RPC changes. `TimesheetApprovals.tsx` unchanged.

---

## 4) Navigation Safety Rules

### 4a. Back Navigation Pattern

All Back buttons use `navigate(-1)` with a fallback for cases where there is no browser history (e.g., direct URL entry):

```typescript
const handleBack = () => {
  allowNextNavigation();
  if (window.history.length > 1) {
    navigate(-1);
  } else {
    navigate("/");  // fallback for Timesheet
    // or navigate("/timesheet/approvals") for Approval Detail
  }
};
```

### 4b. General Pattern (mirrors `ClientEdit.tsx`)

Every protected context must:
1. Import and call `usePageLeaveLock({ locked, isDirty })`.
2. Render `<LeavePageDialog blocker={blocker} isDirty={isDirty} />` in every render branch where `locked=true`.
3. Call `allowNextNavigation()` immediately before every programmatic `navigate()`.
4. Pass `focusMode` to `<AppLayout>` in all render branches.

### 4c. Enumerated Programmatic Navigation Paths

| # | File | Branch | Navigation Call | `allowNextNavigation()` Required? | Why |
|---|---|---|---|---|---|
| N1 | `TimeSheet.tsx` | Loading branch | Back button -> `navigate(-1)` / fallback `navigate("/")` | Yes | Protected context |
| N2 | `TimeSheet.tsx` | No staff branch | Back button -> same | Yes | Protected context |
| N3 | `TimeSheet.tsx` | Error branch | Back button -> same | Yes | Protected context |
| N4 | `TimeSheet.tsx` | Main branch | Back button -> same | Yes | Protected context |
| N5 | `TimesheetApprovalDetail.tsx` | Loading branch | Back button -> `navigate(-1)` / fallback `navigate("/timesheet/approvals")` | Yes | Protected context |
| N6 | `TimesheetApprovalDetail.tsx` | Empty branch | Back button -> same | Yes | Protected context |
| N7 | `TimesheetApprovalDetail.tsx` | Main: `handleBack` (Cancel) | Same as N5 | Yes | Protected context |
| N8 | `TimesheetApprovalDetail.tsx` | Main: `processDecisions` success (line 158-159) | `navigate("/timesheet/approvals")` | Yes | Protected context |
| N9 | `Settings.tsx` | Global tab: Cancel | `setActiveTab("account")` | No | No `navigate()` call; lock deactivates because `activeTab !== "global"` |
| N10 | `Settings.tsx` | Global tab: Save success | `setActiveTab("account")` | No | Same as N9 |

---

## 5) Settings Cancel/Reset Algorithm

### 5a. Persisted Snapshot Source

The `settings` array from `useGlobalSettings()` is the source of truth. The existing `useEffect` (lines 84-107) syncs local state from `settings` on load.

### 5b. `isGlobalDirty` Computation

```typescript
const isGlobalDirty = useMemo(() => {
  if (!settings) return false;
  const persistedLang = getSetting("LANGUAGE") || "en";
  const persistedWeekend = getSetting("ALLOW_WEEKEND_TRACKING") === "true";
  const persistedCompact = getSetting("COMPACT_FONT") === "true";
  const persistedDomain = getSetting("ALLOWED_EMAIL_DOMAIN") || "";
  const persistedTax = (parseFloat(getSetting("TAX_RATE") || "0.13") * 100).toString();
  const persistedRealization = getSetting("REALIZATION_LIMIT") || "75";
  const persistedDaily = getSetting("DAILY_LIMIT") || "12";
  const persistedWeekly = getSetting("WEEKLY_LIMIT") || "50";

  return (
    language !== persistedLang ||
    allowWeekendTracking !== persistedWeekend ||
    compactFont !== persistedCompact ||
    allowedEmailDomain !== persistedDomain ||
    (taxRate !== "" && taxRate !== persistedTax) ||
    (realizationLimit !== "" && realizationLimit !== persistedRealization) ||
    (dailyLimit !== "" && dailyLimit !== persistedDaily) ||
    (weeklyLimit !== "" && weeklyLimit !== persistedWeekly)
  );
}, [settings, language, allowWeekendTracking, compactFont, allowedEmailDomain,
    taxRate, realizationLimit, dailyLimit, weeklyLimit]);
```

### 5c. Cancel Button Handler

```typescript
const handleCancelGlobal = () => {
  setLanguage(getSetting("LANGUAGE") || "en");
  setAllowWeekendTracking(getSetting("ALLOW_WEEKEND_TRACKING") === "true");

  const persistedCompact = getSetting("COMPACT_FONT") === "true";
  setCompactFont(persistedCompact);
  document.documentElement.dataset.compactFont = persistedCompact ? "true" : "false";

  setAllowedEmailDomain(getSetting("ALLOWED_EMAIL_DOMAIN") || "");
  setTaxRate("");
  setRealizationLimit("");
  setDailyLimit("");
  setWeeklyLimit("");

  setActiveTab("account");
};
```

### 5d. Save Success Exit

After successful save in `handleSaveSettings`, add `setActiveTab("account")` after `toast.success` (line 242) to exit protected context.

### 5e. Cancel Button Placement

Replace the standalone Save button (line 514) with a Cancel + Save group:

```tsx
<div className="flex gap-3">
  <Button variant="cancel" onClick={handleCancelGlobal} className="btn-action">
    {t("common.cancel")}
  </Button>
  <Button onClick={handleSaveSettings} disabled={updateSettingMutation.isPending}>
    {updateSettingMutation.isPending ? t("common.saving") : t("common.saveChanges")}
  </Button>
</div>
```

---

## 6) Implementation Details per File

### 6a. `src/pages/TimeSheet.tsx`

**Add imports:**
```typescript
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { usePageLeaveLock } from "@/hooks/usePageLeaveLock";
import { LeavePageDialog } from "@/components/ui/leave-page-dialog";
```

**Add hooks** (after line 36):
```typescript
const navigate = useNavigate();
const { blocker, allowNextNavigation } = usePageLeaveLock({ locked: true, isDirty: false });
```

**Helper function:**
```typescript
const handleBack = () => {
  allowNextNavigation();
  if (window.history.length > 1) {
    navigate(-1);
  } else {
    navigate("/");
  }
};
```

**Branch 1: Loading (lines 342-350):**
```tsx
<AppLayout title={t("timesheet.title")} focusMode>
  <div className="flex items-center justify-between mb-4">
    <Button variant="cancel" onClick={handleBack} className="btn-action">
      <ArrowLeft className="h-4 w-4 mr-1" />
      {t("common.back")}
    </Button>
  </div>
  <div className="flex items-center justify-center h-64">
    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
  </div>
  <LeavePageDialog blocker={blocker} isDirty={false} />
</AppLayout>
```

**Branch 2: No staff record (lines 353-368):** Same pattern -- Back button + focusMode + LeavePageDialog wrapping existing Alert.

**Branch 3: Error (lines 371-382):** Same pattern.

**Branch 4: Main return (line 385):** Add `focusMode` to AppLayout. Add Back button as first element in the actions bar (line 508, inside `flex gap-3`):
```tsx
<Button variant="cancel" onClick={handleBack} className="btn-action">
  <ArrowLeft className="h-4 w-4 mr-1" />
  {t("common.back")}
</Button>
```

Add `<LeavePageDialog blocker={blocker} isDirty={false} />` before closing `</AppLayout>`.

### 6b. `src/pages/TimesheetApprovalDetail.tsx`

**Add imports:**
```typescript
import { ArrowLeft } from "lucide-react";
import { usePageLeaveLock } from "@/hooks/usePageLeaveLock";
import { LeavePageDialog } from "@/components/ui/leave-page-dialog";
```

**Add hook** after `hasDecisions` (after line 87):
```typescript
const { blocker, allowNextNavigation } = usePageLeaveLock({ locked: true, isDirty: hasDecisions });
```

**Wire `handleBack`** (lines 47-49):
```typescript
const handleBack = () => {
  allowNextNavigation();
  if (window.history.length > 1) {
    navigate(-1);
  } else {
    navigate("/timesheet/approvals");
  }
};
```

**Wire post-save navigation** in `processDecisions` (lines 157-160):
```typescript
if (summary.stillPending === 0) {
  allowNextNavigation();
  navigate("/timesheet/approvals");
}
```

**Branch 1: Loading (lines 182-190):**
```tsx
<AppLayout title={t("approval.title")} focusMode>
  <div className="flex items-center justify-between mb-4">
    <Button variant="cancel" onClick={handleBack} className="btn-action">
      <ArrowLeft className="h-4 w-4 mr-1" />
      {t("common.back")}
    </Button>
  </div>
  <div className="flex items-center justify-center h-64">
    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
  </div>
  <LeavePageDialog blocker={blocker} isDirty={false} />
</AppLayout>
```

**Branch 2: No data (lines 192-200):** Same pattern with Back button + focusMode + LeavePageDialog.

**Branch 3: Main return (line 208):** Add `focusMode` to AppLayout. Existing Cancel button already calls `handleBack` (now wired through `allowNextNavigation`). Add `<LeavePageDialog blocker={blocker} isDirty={hasDecisions} />` before closing `</AppLayout>`.

### 6c. `src/pages/Settings.tsx`

**Add imports:**
```typescript
import { usePageLeaveLock } from "@/hooks/usePageLeaveLock";
import { LeavePageDialog } from "@/components/ui/leave-page-dialog";
```

**Add controlled tab state** (after line 57):
```typescript
const [activeTab, setActiveTab] = useState("account");
const isGlobalTabActive = activeTab === "global";
```

**Add `isGlobalDirty`** (as described in Section 5b).

**Add `usePageLeaveLock`:**
```typescript
const { blocker } = usePageLeaveLock({
  locked: isGlobalTabActive,
  isDirty: isGlobalTabActive && isGlobalDirty,
});
```

**Add `handleCancelGlobal`** (as described in Section 5c).

**Change `<Tabs>`** (line 250) to controlled:
```tsx
<Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
```

**Change `<AppLayout>`** (line 249) to conditional focus mode:
```tsx
<AppLayout title={t("settings.title")} focusMode={isGlobalTabActive}>
```

**Replace Save button** (line 514) with Cancel + Save group (Section 5e).

**Wire save success** -- add `setActiveTab("account")` after `toast.success` on line 242.

**Add dialog** before closing `</AppLayout>`:
```tsx
<LeavePageDialog blocker={blocker} isDirty={isGlobalDirty} />
```

### 6d. Locale Files

**`src/locales/en.json`** -- add in `"common"` block:
```json
"back": "Back"
```

**`src/locales/es.json`** -- add in `"common"` block:
```json
"back": "Volver"
```

---

## 7) Test Strategy

### 7a. `src/pages/__tests__/TimeSheet.focus-lock.test.tsx` (4 tests)

| # | Test Name | Assertion |
|---|-----------|-----------|
| TF1 | renders focusMode in main branch | `AppLayout` receives `focusMode={true}` |
| TF2 | renders Back button in loading branch | Back button is present and clickable |
| TF3 | Back button calls allowNextNavigation before navigate | Mock `allowNextNavigation` and `navigate`; click Back; assert `allowNextNavigation` called first, then `navigate` called second (verify call order via `vi.fn()` invocation indices) |
| TF4 | LeavePageDialog renders when blocker is blocked | Dialog content visible |

### 7b. `src/pages/__tests__/TimesheetApprovalDetail.lock-navigation.test.tsx` (4 tests)

| # | Test Name | Assertion |
|---|-----------|-----------|
| TA1 | renders focusMode in all branches | All `AppLayout` calls have `focusMode` |
| TA2 | Cancel calls allowNextNavigation before navigate | Mock both; click Cancel; assert call order: `allowNextNavigation` invocationCallOrder < `navigate` invocationCallOrder |
| TA3 | post-save navigation calls allowNextNavigation before navigate | Mock `processDecisions` with `stillPending=0`; assert call order |
| TA4 | LeavePageDialog shows dirty warning when hasDecisions is true | Set approval decisions, trigger blocker; dialog shows dirty title |

### 7c. `src/pages/__tests__/Settings.global-focus-cancel.test.tsx` (5 tests)

| # | Test Name | Assertion |
|---|-----------|-----------|
| TS1 | focusMode active only on global tab | Switch to global tab: `focusMode={true}`; switch to account: `focusMode={false}` |
| TS2 | Cancel resets language to persisted value | Change language, click Cancel; `language` state reverts |
| TS3 | Cancel resets compactFont and reverts dataset attribute | Toggle compact font, click Cancel; `compactFont` reverts; `document.documentElement.dataset.compactFont` matches persisted |
| TS4 | Cancel resets all 8 fields and switches to account tab | Modify all fields, click Cancel; all 8 fields match persisted; `activeTab === "account"` |
| TS5 | isGlobalDirty true when any field differs | Change one field; LeavePageDialog shows dirty warning on blocked navigation |

### 7d. Test Matrix Summary

| Dimension | Covered By |
|---|---|
| Sidebar hidden in Timesheet | TF1 |
| Sidebar hidden in Approval Detail | TA1 |
| Sidebar hidden in Settings global tab only | TS1 |
| Back button in all Timesheet branches | TF2, TF3 |
| Back button in Approval Detail loading/empty branches | TA1 |
| Cancel in Approval Detail main branch | TA2 |
| `allowNextNavigation` called BEFORE `navigate()` (call order) | TF3, TA2, TA3 |
| Settings Cancel resets all fields | TS2, TS3, TS4 |
| Settings Cancel reverts compact font dataset | TS3 |
| `isGlobalDirty` computation | TS5 |
| LeavePageDialog renders in blocked state | TF4, TA4, TS5 |
| No-trap exits in loading/error branches | TF2, TA1 |
| `navigate(-1)` with fallback | TF3 (via mock verification) |

---

## 8) Risk Analysis and Rollback

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| `navigate(-1)` goes to external site | Very Low | Leaves app | `window.history.length > 1` check prevents fallback only when no history; within-app navigation always has history entries |
| Timesheet users feel trapped without sidebar | Low | UX friction | Back button present in ALL branches including loading/error |
| Settings tab switch triggers unexpected lock | Low | Confusion | Lock only activates on `"global"` tab |
| Approval Detail post-save navigate blocked | Low | Button appears stuck | `allowNextNavigation()` called before `navigate()` in `processDecisions` |
| Compact font dataset not reverted on cancel | Medium | Visual glitch | `handleCancelGlobal` explicitly reverts `document.documentElement.dataset.compactFont` |
| `isGlobalDirty` false positive from empty vs persisted string | Low | Unnecessary dirty warning | Empty string states treated as "unchanged" |

### Rollback

1. Revert the single commit containing changes to 10 files.
2. No database changes to roll back.
3. Verify sidebar reappears on Timesheet, Approval Detail, and Settings Global tab.

---

## 9) Definition of Done

- [ ] `/timesheet`: `focusMode` on ALL 4 render branches (loading, no-staff, error, main)
- [ ] `/timesheet`: Back button present and functional in ALL 4 render branches
- [ ] `/timesheet`: `LeavePageDialog` rendered in ALL 4 render branches
- [ ] `/timesheet`: Back button uses `navigate(-1)` with fallback to `"/"`
- [ ] `/timesheet`: `allowNextNavigation()` called before `navigate()` in all Back handlers
- [ ] `/timesheet/approvals`: No changes (sidebar visible, no lock)
- [ ] `/timesheet/approvals/:periodId`: `focusMode` on ALL 3 render branches
- [ ] `/timesheet/approvals/:periodId`: Back/Cancel button present in ALL 3 render branches
- [ ] `/timesheet/approvals/:periodId`: `LeavePageDialog` rendered in ALL 3 render branches
- [ ] `/timesheet/approvals/:periodId`: `handleBack` uses `navigate(-1)` with fallback to `"/timesheet/approvals"`
- [ ] `/timesheet/approvals/:periodId`: `allowNextNavigation()` called before `navigate()` in `handleBack` AND `processDecisions` success path
- [ ] `/timesheet/approvals/:periodId`: `isDirty` tracks `hasDecisions`
- [ ] `/settings`: `focusMode` active only when `activeTab === "global"`
- [ ] `/settings`: `isGlobalDirty` correctly compares all 8 fields against persisted values
- [ ] `/settings`: Cancel button resets all 8 fields, reverts compact font dataset, switches to account tab
- [ ] `/settings`: Save success switches to account tab
- [ ] `/settings`: `LeavePageDialog` rendered with `isDirty={isGlobalDirty}`
- [ ] Locale keys `common.back` added in `en.json` and `es.json`
- [ ] `src/pages/__tests__/TimeSheet.focus-lock.test.tsx` created with 4 tests, all passing
- [ ] `src/pages/__tests__/TimesheetApprovalDetail.lock-navigation.test.tsx` created with 4 tests, all passing
- [ ] `src/pages/__tests__/Settings.global-focus-cancel.test.tsx` created with 5 tests, all passing
- [ ] Tests TF3, TA2, TA3 explicitly assert `allowNextNavigation` call order before `navigate`
- [ ] Changelog entry appended to `docs/CHANGELOG-2026-02-22.md`

---

## 10) Changelog Entry

**Target file**: `docs/CHANGELOG-2026-02-22.md`
**Insertion**: Append at end of file.

```text

---

### Focus Mode and Navigation Safety: Timesheet, Approvals Detail, Settings Global

**Routes affected**:
- `/timesheet`: Added focus mode (hidden sidebar/mobile nav) with Back button (`navigate(-1)` + fallback) and `usePageLeaveLock` (`isDirty=false`, auto-save context) in ALL render branches (loading, no-staff-record, error, main).
- `/timesheet/approvals`: No change (normal list context, sidebar visible).
- `/timesheet/approvals/:periodId`: Added focus mode with `usePageLeaveLock` (`isDirty=hasDecisions`) in ALL render branches (loading, empty, main). Wired Cancel button and post-save navigation through `allowNextNavigation()`. Added Back button to loading/empty branches. Cancel uses `navigate(-1)` with fallback.
- `/settings` (global tab): Added conditional focus mode (only when global tab active) with `usePageLeaveLock` and computed `isGlobalDirty`. Added Cancel button that resets all 8 global fields to persisted values (including `document.documentElement.dataset.compactFont` revert) and switches to account tab. Save success also exits to account tab.
- `/settings` (other tabs): No change (normal context, sidebar visible).

**Why previous behavior was unsafe**:
- Timesheet had no focus mode; users could accidentally navigate away via sidebar mid-edit.
- Approval Detail had no navigation lock; unsaved approve/reject decisions were lost on accidental navigation.
- Settings Global tab had no Cancel button and no navigation lock; changed settings could be abandoned without explicit cancel, and compact font toggle applied immediately without revert path.

**Lock and exit semantics**:
- All protected contexts use `usePageLeaveLock` + `LeavePageDialog` pattern from `ClientEdit.tsx`.
- `allowNextNavigation()` called before every programmatic `navigate()` in protected contexts (8 enumerated paths).
- Back buttons use `navigate(-1)` with fallback to known route when no browser history exists.
- Settings Cancel resets all local state to persisted `global_settings` values, reverts compact font dataset attribute, and exits focus mode by switching to account tab.
- Protected-state exit invariant enforced: every render branch with `focusMode` includes an explicit exit control AND `LeavePageDialog`.

**Tests**:
- 4 tests (`TimeSheet.focus-lock.test.tsx`): focusMode in branches, Back button presence, call-order assertion for allowNextNavigation before navigate, dialog behavior.
- 4 tests (`TimesheetApprovalDetail.lock-navigation.test.tsx`): focusMode in branches, Cancel/post-save call-order assertions, dirty dialog.
- 5 tests (`Settings.global-focus-cancel.test.tsx`): conditional focusMode, cancel reset for language/compactFont/all-8-fields, isGlobalDirty computation.
```

