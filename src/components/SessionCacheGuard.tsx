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
 * On that null -> A transition it does invalidate ONE key, `global_settings`:
 * it is the only table the app reads without a session, and with RLS enabled
 * the `anon` policy returns just the three login keys instead of all 27. See
 * the comment on that branch for why a targeted invalidate and not clear().
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
    } else if (previousId === null && currentId !== null) {
      // A.5b: `global_settings` es la única tabla que la app consulta sin sesión (LanguageSync,
      // montado en toda la app, y Auth.tsx). Con RLS encendida la política de `anon` devuelve solo
      // LANGUAGE / COMPACT_FONT / ALLOWED_EMAIL_DOMAIN, no las 27 claves. La queryKey no lleva
      // identidad y el staleTime global es de 60 s (App.tsx), así que sin esta invalidación los
      // consumidores que ya corren con sesión seguirían leyendo esa respuesta recortada durante
      // hasta un minuto y caerían a sus valores por defecto: TAX_RATE -> 0.13 en WorkOrderNew /
      // WorkOrderEdit / WorksheetEdit, REALIZATION_LIMIT -> 75 en WorkOrderForm,
      // SESSION_TIMEOUT_MINUTES -> 30 en ProtectedRoute, HOLIDAY_ENGAGEMENT_ID -> null en
      // useHolidays. No hay error ni 403: la OT se guardaría con el impuesto mal calculado.
      // Invalidar una clave y no clear(): clear() descartaría lo que se trajo mientras
      // AuthProvider resolvía la sesión, que es justo lo que esta rama existe para no hacer.
      void queryClient.invalidateQueries({ queryKey: ["global_settings"] });
    }
    previousUserId.current = currentId;
  }, [user, queryClient]);

  return null;
}
