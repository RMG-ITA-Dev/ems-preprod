

# Plan: Fix Negative Number Entry in Ajuste Field

## Root Cause Analysis

The `NumericInput` component has a design flaw when handling intermediate states like `-` (minus sign only):

**Current Flow (Broken):**
1. User types `-` in empty Ajuste field
2. `handleChange` receives `newValue = "-"`
3. Line 167 calls `onValueChange?.("-")` - but WorkOrderForm doesn't provide `onValueChange`!
4. Line 167 does nothing (optional chaining), then function returns at line 168
5. The parent component never receives the update → input resets to empty

**The Issue:** WorkOrderForm passes only `onChange` (for numeric values), not `onValueChange` (for string values). The NumericInput's intermediate state handling only works with `onValueChange`.

---

## Solution

Modify `NumericInput` to handle intermediate states (`-`, `.`, `,`) even when `onValueChange` is not provided. We need to track the display value internally when in an intermediate state.

### File: `src/components/ui/numeric-input.tsx`

**Change 1: Add internal state for intermediate values**

Add a `useState` hook to track the display value when in an intermediate state (like "-"):

```tsx
const [intermediateValue, setIntermediateValue] = useState<string | null>(null);
```

**Change 2: Modify handleChange to update internal state for intermediate values**

When the value is just `-` or a decimal separator, store it in internal state:

```tsx
// Allow just a minus sign or decimal separator while typing
if (newValue === "-" || newValue === decimalSeparator) {
  setIntermediateValue(newValue);
  onValueChange?.(newValue);
  return;
}
```

**Change 3: Modify the input's value prop to use intermediate state when present**

```tsx
value={intermediateValue !== null ? intermediateValue : formatValue(value)}
```

**Change 4: Clear intermediate state when a valid value is entered**

In `handleChange`, after successfully parsing a value, clear the intermediate state:

```tsx
setIntermediateValue(null);
onValueChange?.(newValue);
onChange?.(isNaN(numericValue) ? 0 : numericValue);
```

**Change 5: Clear intermediate state on blur**

In `handleBlur`, reset intermediate state:

```tsx
setIntermediateValue(null);
```

**Change 6: Sync intermediate state when external value changes**

Use `useEffect` to clear intermediate state when the external value changes:

```tsx
useEffect(() => {
  // When value changes externally, clear any intermediate state
  if (value !== undefined && value !== null && value !== "") {
    setIntermediateValue(null);
  }
}, [value]);
```

---

## Implementation Summary

| Line Range | Change |
|------------|--------|
| 20-34 | Add `useState` import and `intermediateValue` state |
| 165-169 | Update intermediate value handling to also set internal state |
| 201-203 | Clear intermediate state when valid value is parsed |
| 205-234 | Clear intermediate state on blur |
| 245 | Use `intermediateValue` in the input's value prop when present |

---

## Code Changes

### Before (lines 165-169):
```tsx
// Allow just a minus sign or decimal separator while typing
if (newValue === "-" || newValue === decimalSeparator) {
  onValueChange?.(newValue);
  return;
}
```

### After:
```tsx
// Allow just a minus sign or decimal separator while typing
if (newValue === "-" || newValue === decimalSeparator) {
  setIntermediateValue(newValue);
  onValueChange?.(newValue);
  return;
}
```

### Before (line 245):
```tsx
value={formatValue(value)}
```

### After:
```tsx
value={intermediateValue !== null ? intermediateValue : formatValue(value)}
```

---

## Why This Works

1. **User types `-`** → `handleChange` stores `-` in `intermediateValue` → input displays `-`
2. **User types `5`** → `handleChange` parses `-5`, calls `onChange(-5)`, clears `intermediateValue` → input displays `-5`
3. **Parent re-renders with `adjustmentAmount = -5`** → `formatValue(-5)` returns `-5` → input displays `-5` ✓

The internal state bridges the gap between the intermediate string state and the parent's numeric state.

---

## Testing Checklist

After implementation:
- [ ] Type `-500` in Ajuste field (minus first, then digits) → should work
- [ ] Type `500` then add minus → should work (existing functionality)
- [ ] Clear field and type `.5` → should become `0.5` on blur
- [ ] Leave field with just `-` → should clear to empty on blur
- [ ] Negative values still display in red
- [ ] Spanish locale still uses comma for decimals

---

## File to Modify

| File | Changes |
|------|---------|
| `src/components/ui/numeric-input.tsx` | Add internal state for intermediate values, use it in value prop, clear on valid input or blur |

