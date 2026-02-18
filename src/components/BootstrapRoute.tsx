import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useCurrentStaff } from "@/hooks/useCurrentStaff";
import { useUserRole } from "@/hooks/useUserRole";
import { Loader2 } from "lucide-react";

interface BootstrapRouteProps {
  children: React.ReactNode;
}

/**
 * Guard for /bootstrap route: only authenticated admins without a staff record.
 * Waits for all loading states before enforcing redirects (Optional B).
 */
export function BootstrapRoute({ children }: BootstrapRouteProps) {
  const { user, loading } = useAuth();
  const { staffRecord, isLoading: staffLoading } = useCurrentStaff();
  const { isAdmin, isLoading: roleLoading } = useUserRole();

  if (loading || (user && (staffLoading || roleLoading))) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-accent" />
        </div>
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;
  if (!isAdmin) return <Navigate to="/" replace />;
  if (staffRecord) return <Navigate to="/" replace />;

  return <>{children}</>;
}
