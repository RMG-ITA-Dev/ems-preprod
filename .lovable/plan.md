

# Bug #7 Fix: Prevent Zero/Empty Rates in Category Form

## Problem

The Category form accepts zero values for all four rate fields (BOB High/Low, USD High/Low). Since rates are hourly billing rates, zero is economically invalid and causes downstream calculation errors in work orders.

## Changes (single file: `src/components/forms/CategoryForm.tsx`)

### 1. Zod schema: change `.min(0)` to `.positive()` (lines 44-47)

Replace all four rate validations so zero is rejected:

```typescript
rate_high_bob: z.coerce.number().positive("Rate must be greater than 0"),
rate_low_bob: z.coerce.number().positive("Rate must be greater than 0"),
rate_high_usd: z.coerce.number().positive("Rate must be greater than 0"),
rate_low_usd: z.coerce.number().positive("Rate must be greater than 0"),
```

Note: The schema is defined outside the component so `t()` is not available. The error message stays in English to match the existing `category_name` validation pattern on line 42. The `FormMessage` component renders whatever Zod returns.

### 2. Default values: use `undefined` instead of `0` for new categories (lines 72-75)

So rate fields appear blank (not pre-filled with 0) when creating a new category:

```typescript
rate_high_bob: undefined as unknown as number,
rate_low_bob: undefined as unknown as number,
rate_high_usd: undefined as unknown as number,
rate_low_usd: undefined as unknown as number,
```

### 3. Edit reset: use `??` instead of `||` (lines 86-89)

So actual DB values are preserved and null/undefined shows as empty:

```typescript
rate_high_bob: category?.rate_high_bob ?? (undefined as unknown as number),
rate_low_bob: category?.rate_low_bob ?? (undefined as unknown as number),
rate_high_usd: category?.rate_high_usd ?? (undefined as unknown as number),
rate_low_usd: category?.rate_low_usd ?? (undefined as unknown as number),
```

## Files Modified

| File | Change |
|------|--------|
| `src/components/forms/CategoryForm.tsx` | Zod `.positive()`, blank defaults, nullish coalescing on edit reset |

## What Does NOT Change

- No database changes
- No translation changes (error messages use static English, matching existing pattern)
- Form layout, permissions section, delete logic all untouched

