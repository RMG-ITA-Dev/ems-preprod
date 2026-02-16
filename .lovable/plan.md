

# Bug 0213-22: Auto-Logout After 30 Minutes of Inactivity (Final)

## Problem

Sessions persist indefinitely. A user left the system unattended for 4 hours and it remained active -- a security risk for an audit/consulting firm.

## Solution

Create a `useInactivityTimeout` hook with:
- Configurable timeout via `global_settings.SESSION_TIMEOUT_MINUTES` (default 30)
- Throttled activity monitoring (reset once per minute max)
- Warning toast 2 minutes before logout
- Cross-tab sync via `BroadcastChannel` -- logout in one tab logs out all tabs
- Visibility change handler for backgrounded tabs

## Changes

### 1. Database: Insert `SESSION_TIMEOUT_MINUTES` setting

```sql
INSERT INTO public.global_settings (setting_key, setting_value, description)
VALUES ('SESSION_TIMEOUT_MINUTES', '30', 'Minutes of inactivity before automatic logout');
```

### 2. New file: `src/hooks/useInactivityTimeout.ts`

Core design:
- Events monitored: `mousedown`, `mousemove`, `keydown`, `scroll`, `touchstart`, `click`
- `THROTTLE_MS = 60_000` -- only reset timers once per minute
- `WARNING_BEFORE_MS = 2 * 60_000` -- warning toast 2 min before logout
- `BroadcastChannel("ems_session_channel")` -- posts `{ type: "LOGOUT" }` on timeout; listens for same from other tabs
- `visibilitychange` listener -- refreshes timers when tab becomes visible
- Accepts `timeoutMinutes` param (number, from parsed setting); defaults to 30
- On timeout: calls `signOut()`, navigates to `/auth`, shows toast
- Only active when `user` is truthy
- Cleans up all listeners, timers, and channel on unmount

### 3. Modify: `src/components/ProtectedRoute.tsx`

- Import `useInactivityTimeout` and `useSetting`
- After the existing `useCurrentStaff` call (line 12), add:

```typescript
const timeoutSetting = useSetting("SESSION_TIMEOUT_MINUTES");
const timeoutMinutes = timeoutSetting ? parseInt(timeoutSetting, 10) : 30;
useInactivityTimeout(timeoutMinutes);
```

### 4. Localization

**`src/locales/en.json`** -- add 2 keys at end of `auth` object (before line 793 closing brace):

```json
"sessionExpiredInactivity": "Your session has expired due to inactivity. Please sign in again.",
"sessionWarningInactivity": "Your session will expire in 2 minutes due to inactivity."
```

**`src/locales/es.json`** -- same location:

```json
"sessionExpiredInactivity": "Su sesion ha expirado por inactividad. Por favor, inicie sesion nuevamente.",
"sessionWarningInactivity": "Su sesion expirara en 2 minutos por inactividad."
```

### 5. Documentation: `docs/CHANGELOG-2026-02-13.md`

Append bug fix entry covering problem, solution, files modified.

## Files Summary

| File | Action |
|------|--------|
| Migration SQL | Insert `SESSION_TIMEOUT_MINUTES` into `global_settings` |
| `src/hooks/useInactivityTimeout.ts` | New hook |
| `src/components/ProtectedRoute.tsx` | Add `useSetting` + `useInactivityTimeout` calls |
| `src/locales/en.json` | Add 2 keys under `auth` |
| `src/locales/es.json` | Add 2 keys under `auth` |
| `docs/CHANGELOG-2026-02-13.md` | Append entry |

## Risk Assessment

- **Low risk** -- purely additive; no existing auth or session logic modified.
- `BroadcastChannel` supported in all modern browsers; if unavailable, single-tab behavior still works.
- `useSetting` reuses existing `global_settings` query cache -- no extra network request.
- Time Tracker data persists in DB so no data loss on auto-logout.

## Testing

1. Set `SESSION_TIMEOUT_MINUTES` to `2` in Settings, idle for 2+ minutes -- verify warning toast at ~0:00 and logout at ~2:00
2. Move mouse periodically -- verify session stays alive
3. Open two tabs: when one times out, both log out
4. Change setting value in Settings -- verify new timeout applies on next page load
5. Logged-out user on `/auth` -- hook does nothing, no errors

