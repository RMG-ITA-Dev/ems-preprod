import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useCurrentStaff } from "@/hooks/useCurrentStaff";
import { useInactivityTimeout } from "@/hooks/useInactivityTimeout";
import { useSetting } from "@/hooks/useEmsData";
import { Loader2 } from "lucide-react";

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, loading, signOut } = useAuth();
  const { staffRecord, isLoading: staffLoading } = useCurrentStaff();

  // BUG #0213-22: Auto-logout after inactivity
  const timeoutSetting = useSetting("SESSION_TIMEOUT_MINUTES");
  const timeoutMinutes = timeoutSetting ? parseInt(timeoutSetting, 10) : 30;
  useInactivityTimeout(timeoutMinutes);

  if (loading || (user && staffLoading)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-accent" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  // If staff record exists but is inactive, force sign out
  if (staffRecord && staffRecord.is_active === false) {
    signOut();
    return <Navigate to="/auth" replace />;
  }

  return <>{children}</>;
}
