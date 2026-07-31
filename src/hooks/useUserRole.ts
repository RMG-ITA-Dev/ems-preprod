import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { logger } from "@/lib/logger";
import { handleError, ErrorCode, AppError } from "@/lib/error-handler";

export type AppRole = "admin" | "partner" | "director" | "manager" | "senior" | "semisenior" | "staff" | "viewer" | "sqr" | "specialist_it" | "specialist_tax";

interface UserRole {
  id: string;
  user_id: string;
  role: AppRole;
}

interface UseUserRoleResult {
  role: AppRole;
  isAdmin: boolean;
  isPartner: boolean;
  isDirector: boolean;
  isManager: boolean;
  isSenior: boolean;
  isSemisenior: boolean;
  isStaff: boolean;
  isViewer: boolean;
  isSQR: boolean;
  isSpecialistIT: boolean;
  isSpecialistTAX: boolean;
  isLoading: boolean;
  /** True if there was an error fetching the role */
  hasError: boolean;
  /** Error details if fetch failed */
  error: AppError | null;
  /** True if user has no role assigned (not an error, just missing data) */
  isRoleMissing: boolean;
  /** Fase 3 — Scheduler: reintentar la resolución de rol tras un error
   *  (p.ej. desde el estado "loadFailed" de SchedulerStaff/SchedulerGaps). */
  refetch: () => void;
}

export function useUserRole(): UseUserRoleResult {
  const { user } = useAuth();

  const { data: userRole, isLoading, error, isError, refetch } = useQuery({
    queryKey: ["user_role", user?.id],
    queryFn: async () => {
      if (!user?.id) {
        throw new AppError(
          "Cannot fetch role: No authenticated user",
          ErrorCode.AUTH_UNAUTHORIZED
        );
      }
      
      const { data, error } = await supabase
        .from("user_roles")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();
      
      if (error) {
        // Log and throw - this is a real error that should be visible
        logger.error("Failed to fetch user role:", error.message);
        throw new AppError(
          `Failed to fetch user role: ${error.message}`,
          ErrorCode.DB_QUERY,
          { userId: user.id }
        );
      }
      
      // No role found is NOT an error - return null and handle gracefully
      if (!data) {
        logger.debug("No role assigned to user, will use default 'staff' role", { userId: user.id });
        return null;
      }
      
      return data as UserRole;
    },
    enabled: !!user?.id,
    // Don't retry on auth errors
    retry: (failureCount, error) => {
      if (error instanceof AppError && error.code === ErrorCode.AUTH_UNAUTHORIZED) {
        return false;
      }
      return failureCount < 2;
    },
  });

  // Handle error state - show toast only once via error handler
  const appError = isError && error 
    ? (error instanceof AppError 
        ? error 
        : handleError(error, { 
            showToast: true, 
            toastTitle: "Role fetch failed",
            context: { userId: user?.id }
          })
      )
    : null;

  // Determine effective role - default to staff if no role assigned OR if there was an error
  // This maintains backwards compatibility while making the error visible
  const effectiveRole: AppRole = userRole?.role || "staff";
  const isRoleMissing = !isLoading && !isError && !userRole;
  
  return {
    role: effectiveRole,
    isAdmin: effectiveRole === "admin",
    isPartner: effectiveRole === "partner",
    isDirector: effectiveRole === "director",
    isManager: effectiveRole === "manager",
    isSenior: effectiveRole === "senior",
    isSemisenior: effectiveRole === "semisenior",
    isStaff: effectiveRole === "staff",
    isViewer: effectiveRole === "viewer",
    isSQR: effectiveRole === "sqr",
    isSpecialistIT: effectiveRole === "specialist_it",
    isSpecialistTAX: effectiveRole === "specialist_tax",
    isLoading,
    hasError: isError,
    error: appError,
    isRoleMissing,
    refetch: () => {
      void refetch();
    },
  };
}
