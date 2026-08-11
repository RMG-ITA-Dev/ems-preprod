import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";

/**
 * Clears the app-level React Query cache on every identity CHANGE — signing
 * out (A -> null) and switching accounts within the same SPA session
 * (A -> B) — but never on hydration or a first login (null -> A): nothing
 * from another account can be cached yet, and clearing there would discard
 * data fetched while AuthProvider was still resolving its initial session.
 *
 * Deliberately a sibling component rather than logic inside AuthProvider:
 * src/hooks/__tests__/useAuth.test.tsx mounts <AuthProvider> without a
 * QueryClientProvider in every one of its cases, so giving useAuth a React
 * Query dependency would break all of them. This component only ever
 * renders where both providers exist (App.tsx), so useQueryClient() here is
 * legitimate.
 */
export function SessionCacheGuard(): null {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const previousUserId = useRef<string | null>(null);

  useEffect(() => {
    const currentId = user?.id ?? null;
    const previousId = previousUserId.current;
    if (previousId !== null && previousId !== currentId) {
      queryClient.clear();
    }
    previousUserId.current = currentId;
  }, [user, queryClient]);

  return null;
}
