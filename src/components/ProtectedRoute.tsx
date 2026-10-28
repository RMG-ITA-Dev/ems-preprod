import { useEffect, useRef, useMemo } from "react";
import { Navigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
  const { user, loading, signOut } = useAuth();
  const { staffRecord, isLoading: staffLoading } = useCurrentStaff();
  const { isAdmin, isLoading: roleLoading } = useUserRole();
  const hasSignedOut = useRef(false);

  // BUG #0213-22: Auto-logout after inactivity
  const timeoutSetting = useSetting("SESSION_TIMEOUT_MINUTES");
  const timeoutMinutes = timeoutSetting ? parseInt(timeoutSetting, 10) : 30;
  useInactivityTimeout(timeoutMinutes);

  // Compute derived state — no side effects during render
  const { shouldSignOut, redirectTo, rejectionReason } = useMemo(() => {
    // Still loading — no decisions yet
    if (loading || (user && (staffLoading || roleLoading))) {
      return { shouldSignOut: false, redirectTo: null, rejectionReason: null };
    }

    if (!user) {
      return { shouldSignOut: false, redirectTo: "/auth", rejectionReason: null };
    }

    // Gate 1: No staff record
    if (!staffRecord) {
      if (isAdmin) {
        return { shouldSignOut: false, redirectTo: "/bootstrap", rejectionReason: null };
      }
      return { shouldSignOut: true, redirectTo: "/auth", rejectionReason: "NO_STAFF_RECORD" };
    }

    // Gate 2: Staff inactive
    if (staffRecord.is_active === false) {
      return { shouldSignOut: true, redirectTo: "/auth", rejectionReason: "ACCOUNT_INACTIVE" };
    }

    return { shouldSignOut: false, redirectTo: null, rejectionReason: null };
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
          <p className="text-muted-foreground">{t("common.loading")}</p>
        </div>
      </div>
    );
  }

  // Redirect if needed
  if (redirectTo) {
    // BUG 0723-170: when this redirect is part of the rejection flow (no staff
    // record / inactive staff), the signOut() above is still in flight and
    // `user` stays populated for a few frames. Flag it so Auth's session guard
    // lets the form render instead of bouncing the session straight back here —
    // otherwise the two routes ping-pong until sign-out resolves, and forever
    // if it never does.
    //
    // `reason` le dice a Auth por qué se rechazó la sesión. El ingreso con contraseña ya lo avisó
    // en signIn(), pero el de Microsoft llega acá sin pasar por ahí: sin el motivo, la persona
    // volvía al botón sin saber qué pasó.
    return (
      <Navigate
        to={redirectTo}
        replace
        state={shouldSignOut ? { signingOut: true, reason: rejectionReason } : undefined}
      />
    );
  }

  return <>{children}</>;
}
