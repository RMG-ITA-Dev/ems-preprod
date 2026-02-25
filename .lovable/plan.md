

# Plan: Make Email Read-Only on Staff Edit

## Problem
When editing a staff member, the email field is currently editable. Since email is linked to authentication credentials, changing it could break the auth link. The field should be read-only in edit mode.

## Change

### File: `src/components/forms/StaffForm.tsx` (line 501)

Add `disabled` and a visual style to the email Input when in edit mode:

```tsx
<Input
  type="email"
  placeholder="john.doe@example.com"
  {...field}
  disabled={isEdit}
  className={isEdit ? "bg-muted" : ""}
/>
```

This makes the email field visually greyed out and non-editable when editing an existing staff member, while remaining fully editable when creating a new staff member.

The existing warning message about linked auth accounts (lines 504-509) will remain as additional context.

