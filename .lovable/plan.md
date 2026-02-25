

# Plan v11: Increase Active Tab Contrast in Settings

**Plan ID**: UI-0225-settings-tab-contrast-v1

---

## Problem

The currently selected tab on the Settings page has minimal visual distinction from inactive tabs -- just a subtle background and shadow change. The user wants more contrast to make it obvious which tab is active.

---

## Fix

### File: `src/components/ui/tabs.tsx` (MODIFY)

Update the `TabsTrigger` component's default `data-[state=active]` classes to use the primary color for the active state instead of just `bg-background` with a subtle shadow.

**Current active styling:**
```
data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm
```

**New active styling:**
```
data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm
```

This applies the teal brand primary color as the background and white text on the active tab, giving it strong contrast against the muted tab bar -- consistent with the brand identity used throughout the app (sidebar, buttons, etc.).

---

## What Stays Unchanged

- No changes to Settings.tsx or any page-level code
- Inactive tab styling remains the same
- This is a global change to the tabs component, which will apply consistently wherever `TabsTrigger` is used

---

## Scope

Single file change: `src/components/ui/tabs.tsx` (one line modification)

