import { useEffect, useRef, useMemo } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useCurrentStaff } from "@/hooks/useCurrentStaff";
import { useUserRole } from "@/hooks/useUserRole";
import { useInactivityTimeout } from "@/hooks/useInactivityTimeout";
import { useSetting } from "@/hooks/useEmsData";
import { Loader2 } from "lucide-react";

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, loading, signOut } = useAuth();
  const { staffRecord, isLoading: staffLoading } = useCurrentStaff();
  const { isAdmin, isLoading: roleLoading } = useUserRole();
  const hasSignedOut = useRef(false);

  // BUG #0213-22: Auto-logout after inactivity
  const timeoutSetting = useSetting("SESSION_TIMEOUT_MINUTES");
  const timeoutMinutes = timeoutSetting ? parseInt(timeoutSetting, 10) : 30;
  useInactivityTimeout(timeoutMinutes);

  // Compute derived state — no side effects during render
  const { shouldSignOut, redirectTo } = useMemo(() => {
    // Still loading — no decisions yet
    if (loading || (user && (staffLoading || roleLoading))) {
      return { shouldSignOut: false, redirectTo: null };
    }

    if (!user) {
      return { shouldSignOut: false, redirectTo: "/auth" };
    }

    // Gate 1: No staff record
    if (!staffRecord) {
      if (isAdmin) {
        return { shouldSignOut: false, redirectTo: "/bootstrap" };
      }
      return { shouldSignOut: true, redirectTo: "/auth" };
    }

    // Gate 2: Staff inactive
    if (staffRecord.is_active === false) {
      return { shouldSignOut: true, redirectTo: "/auth" };
    }

    return { shouldSignOut: false, redirectTo: null };
  }, [loading, user, staffLoading, roleLoading, staffRecord, isAdmin]);

  // Side effect: sign out once when needed (MC #1 — never during render)
  useEffect(() => {
    if (shouldSignOut && !hasSignedOut.current) {
      hasSignedOut.current = true;
      signOut();
    }
  }, [shouldSignOut, signOut]);

  // Reset ref when user changes (e.g., new login attempt)
  useEffect(() => {
    if (!user) {
      hasSignedOut.current = false;
    }
  }, [user]);

  // Loading state
  if (loading || (user && (staffLoading || roleLoading))) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-accent" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  // Redirect if needed
  if (redirectTo) {
    return <Navigate to={redirectTo} replace />;
  }

  return <>{children}</>;
}
