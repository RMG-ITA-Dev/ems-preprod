import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Users,
  Briefcase,
  FileSpreadsheet,
  ClipboardList,
  CheckSquare,
  UserCog,
  Settings,
  LogOut,
  UserCheck,
  UserX,
} from "lucide-react";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { useCurrentStaff } from "@/hooks/useCurrentStaff";
import { useUserRole } from "@/hooks/useUserRole";

interface MobileMoreDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MobileMoreDrawer({ open, onOpenChange }: MobileMoreDrawerProps) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { user, signOut } = useAuth();
  const { data: staffRecord } = useCurrentStaff();
  const { isAdmin } = useUserRole();

  const userInitials = staffRecord?.initials
    ? staffRecord.initials
    : staffRecord
      ? `${staffRecord.first_name[0]}${staffRecord.last_name[0]}`.toUpperCase()
      : user?.user_metadata?.first_name && user?.user_metadata?.last_name
        ? `${user.user_metadata.first_name[0]}${user.user_metadata.last_name[0]}`.toUpperCase()
        : user?.email?.substring(0, 2).toUpperCase() || "U";

  const displayName = staffRecord
    ? `${staffRecord.first_name} ${staffRecord.last_name}`
    : user?.user_metadata?.first_name
      ? `${user.user_metadata.first_name} ${user.user_metadata.last_name || ''}`
      : null;

  const handleNavigate = (path: string) => {
    navigate(path);
    onOpenChange(false);
  };

  const handleSignOut = async () => {
    await signOut();
    onOpenChange(false);
  };

  const mainItems = [
    { path: "/clients", icon: Users, labelKey: "nav.clients" },
    { path: "/engagements", icon: Briefcase, labelKey: "nav.engagements" },
    { path: "/worksheets", icon: FileSpreadsheet, labelKey: "nav.worksheets" },
    { path: "/work-orders", icon: ClipboardList, labelKey: "nav.workOrders" },
  ];

  const operationsItems = [
    { path: "/timesheet/approvals", icon: CheckSquare, labelKey: "nav.timesheetApprovals" },
  ];

  const adminItems = [
    { path: "/staff", icon: UserCog, labelKey: "nav.staff" },
    { path: "/settings", icon: Settings, labelKey: "nav.settings" },
  ];

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[85vh]">
        <DrawerHeader className="text-left">
          <DrawerTitle>{t("common.menu")}</DrawerTitle>
        </DrawerHeader>

        {/* Profile section */}
        <div className="px-4 pb-4 mb-2 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-accent flex items-center justify-center flex-shrink-0">
              <span className="text-accent-foreground font-medium text-sm">{userInitials}</span>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{displayName || t("common.user")}</p>
              <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
            </div>
          </div>
          <div className="mt-2 px-1">
            {staffRecord ? (
              <div className="flex items-center gap-2 text-xs">
                <UserCheck className="h-3.5 w-3.5 text-success" />
                <span className="text-muted-foreground">{t("header.linkedToStaff")} </span>
                {staffRecord.category?.category_name && (
                  <Badge variant="secondary" className="text-xs">
                    {staffRecord.category.category_name}
                  </Badge>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <UserX className="h-3.5 w-3.5" />
                <span>{t("header.notLinkedToStaff")}</span>
              </div>
            )}
          </div>
        </div>

        <div className="px-4 pb-8 space-y-6 overflow-y-auto">
          {/* Main Navigation */}
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-3 mb-2">
              {t("nav.main")}
            </p>
            {mainItems.map((item) => (
              <button
                key={item.path}
                onClick={() => handleNavigate(item.path)}
                className="flex items-center gap-3 w-full px-3 py-3 rounded-lg text-foreground hover:bg-muted transition-colors"
              >
                <item.icon className="h-5 w-5 text-muted-foreground" />
                <span className="text-sm font-medium">{t(item.labelKey)}</span>
              </button>
            ))}
          </div>

          {/* Operations */}
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-3 mb-2">
              {t("nav.operations")}
            </p>
            {operationsItems.map((item) => (
              <button
                key={item.path}
                onClick={() => handleNavigate(item.path)}
                className="flex items-center gap-3 w-full px-3 py-3 rounded-lg text-foreground hover:bg-muted transition-colors"
              >
                <item.icon className="h-5 w-5 text-muted-foreground" />
                <span className="text-sm font-medium">{t(item.labelKey)}</span>
              </button>
            ))}
          </div>

          {/* Administration (Admin only) */}
          {isAdmin && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-3 mb-2">
                {t("nav.administration")}
              </p>
              {adminItems.map((item) => (
                <button
                  key={item.path}
                  onClick={() => handleNavigate(item.path)}
                  className="flex items-center gap-3 w-full px-3 py-3 rounded-lg text-foreground hover:bg-muted transition-colors"
                >
                  <item.icon className="h-5 w-5 text-muted-foreground" />
                  <span className="text-sm font-medium">{t(item.labelKey)}</span>
                </button>
              ))}
            </div>
          )}

          {/* Sign Out */}
          <div className="pt-2 border-t border-border">
            <button
              onClick={handleSignOut}
              className="flex items-center gap-3 w-full px-3 py-3 rounded-lg text-destructive hover:bg-destructive/10 transition-colors"
            >
              <LogOut className="h-5 w-5" />
              <span className="text-sm font-medium">{t("nav.signOut")}</span>
            </button>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}