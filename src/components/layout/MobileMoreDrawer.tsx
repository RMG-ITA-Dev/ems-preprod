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
  Wallet,
  Banknote,
  CalendarRange,
  ChartColumnDecreasing,
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
import { useAuthorization } from "@/hooks/useAuthorization";
import { useManagesAnyOt } from "@/hooks/useFundRequests";
import { canSeeGaps, canSeePlanning } from "@/lib/schedulerAccess";
import { isSchedulerEnabled } from "@/lib/schedulerFeature";
import { ThemeToggle } from "@/components/theme/ThemeToggle";

interface MobileMoreDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface DrawerNavItem {
  path: string;
  icon: typeof Users;
  labelKey: string;
  show: boolean;
}

export function MobileMoreDrawer({ open, onOpenChange }: MobileMoreDrawerProps) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { user, signOut } = useAuth();
  const { data: staffRecord } = useCurrentStaff();
  const { can, roleKey } = useAuthorization();
  const isAdmin = roleKey === "admin";
  const { data: managesAnyOt } = useManagesAnyOt(staffRecord?.staff_id);
  // Fase 3 — Scheduler: mismos predicados que AppSidebar/App.tsx
  // (src/lib/schedulerAccess.ts). Fuente del rol: role_key (no el enum
  // legacy) — ver el comentario de cabecera de schedulerAccess.ts.
  const schedulerEnabled = isSchedulerEnabled();
  const canSeeSchedulerPlanning = schedulerEnabled && canSeePlanning(roleKey);
  const canSeeSchedulerGaps = schedulerEnabled && canSeeGaps(roleKey);

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

  // FASE 5: cada ítem por permiso; aprobación de fondos conserva acceso relacional.
  const mainItems: DrawerNavItem[] = [
    { path: "/clients", icon: Users, labelKey: "nav.clients", show: can("client.read") },
    { path: "/engagements", icon: Briefcase, labelKey: "nav.engagements", show: can("engagement.read") },
    { path: "/worksheets", icon: FileSpreadsheet, labelKey: "nav.worksheets", show: can("worksheet.read") },
    { path: "/work-orders", icon: ClipboardList, labelKey: "nav.workOrders", show: can("work_order.read") },
  ].filter((i) => i.show);

  const operationsItems: DrawerNavItem[] = [
    { path: "/timesheet/approvals", icon: CheckSquare, labelKey: "nav.timesheetApprovals", show: can("timesheet_approval.read") },
    { path: "/fund-requests", icon: Wallet, labelKey: "nav.fundRequests", show: can("fund_request.read") },
    { path: "/fund-requests/approvals", icon: CheckSquare, labelKey: "nav.fundRequestApprovals", show: can("fund_approval.read") || !!managesAnyOt },
    { path: "/fund-requests/disbursements", icon: Banknote, labelKey: "nav.fundRequestDisbursements", show: can("fund_disbursement.read") },
  ].filter((i) => i.show);

  // Mismo predicado que AppSidebar.tsx — la matriz no puede divergir entre sidebar y drawer
  // (plan_merge_sche_rolper.md §G2). `account.password.change` es el permiso que la matriz da a
  // los 23 roles: sin él, cualquier rol de solo-lectura pierde su única forma de llegar al tab de
  // Cuenta para cambiar su contraseña.
  const canSeeSettings =
    isAdmin ||
    can("account.password.change") ||
    can("industry.read") ||
    can("competency.read") ||
    can("category_rate.read") ||
    can("activity_code.read") ||
    can("expense_type.read") ||
    can("holiday.read") ||
    can("user_role.read") ||
    can("global_settings.update");
  const adminItems: DrawerNavItem[] = [
    { path: "/staff", icon: UserCog, labelKey: "nav.staff", show: can("staff.read") },
    { path: "/settings", icon: Settings, labelKey: "nav.settings", show: canSeeSettings },
  ].filter((i) => i.show);

  const renderGroup = (label: string, items: DrawerNavItem[]) => {
    if (items.length === 0) return null;
    return (
      <div className="space-y-1">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-3 mb-2">
          {label}
        </p>
        {items.map((item) => (
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
    );
  };

  // Fase 3 — Scheduler: Gap Reporting solo para roles firmwide.
  const planningItems: DrawerNavItem[] = [
    { path: "/scheduler", icon: CalendarRange, labelKey: "nav.scheduler", show: true },
    { path: "/scheduler/gaps", icon: ChartColumnDecreasing, labelKey: "nav.schedulerGaps", show: canSeeSchedulerGaps },
  ].filter((i) => i.show);

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
            <div className="flex items-center justify-between mt-2 px-1">
              <span className="text-xs text-muted-foreground">{t("theme.label")}</span>
              <ThemeToggle />
            </div>
          </div>
        </div>

        <div className="px-4 pb-8 space-y-6 overflow-y-auto">
          {renderGroup(t("nav.main"), mainItems)}
          {canSeeSchedulerPlanning && renderGroup(t("nav.planning"), planningItems)}
          {renderGroup(t("nav.operations"), operationsItems)}
          {renderGroup(t("nav.administration"), adminItems)}

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
