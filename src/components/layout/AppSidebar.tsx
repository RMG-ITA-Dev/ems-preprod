import {
  LayoutDashboard,
  Briefcase,
  FolderKanban,
  Users,
  Settings,
  FileText,
  LogOut,
  CheckSquare,
  Timer,
  Grid3X3,
  ListChecks,
  TableProperties,
  Wallet,
  Banknote,
  CalendarRange,
  ChartColumnDecreasing,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { NavLink } from "@/components/NavLink";
import { useAuth } from "@/hooks/useAuth";
import { useAuthorization } from "@/hooks/useAuthorization";
import { useCurrentStaff } from "@/hooks/useCurrentStaff";
import { useManagesAnyOt } from "@/hooks/useFundRequests";
import { canSeeGaps, canSeePlanning } from "@/lib/schedulerAccess";
import { isSchedulerEnabled } from "@/lib/schedulerFeature";
import { useNavigate } from "react-router-dom";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
} from "@/components/ui/sidebar";

interface NavItem {
  title: string;
  url: string;
  icon: typeof LayoutDashboard;
  show: boolean;
}

export function AppSidebar() {
  const { t } = useTranslation();
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const { can, roleKey } = useAuthorization();
  const isAdmin = roleKey === "admin";
  const { data: staffRecord } = useCurrentStaff();
  const { data: managesAnyOt } = useManagesAnyOt(staffRecord?.staff_id);
  // Fase 3 — Scheduler: predicados compartidos con rutas/mobile drawer
  // (src/lib/schedulerAccess.ts) para que la matriz de roles nunca diverja.
  // Fuente del rol: role_key (no el enum legacy) — ver el comentario de
  // cabecera de schedulerAccess.ts.
  const schedulerEnabled = isSchedulerEnabled();
  const canSeeSchedulerPlanning = schedulerEnabled && canSeePlanning(roleKey);
  const canSeeSchedulerGaps = schedulerEnabled && canSeeGaps(roleKey);

  const handleSignOut = async () => {
    await signOut();
    navigate("/auth");
  };

  // FASE 5: cada ítem se muestra por permiso (has_permission vía useAuthorization).
  // La aprobación de fondos conserva el acceso relacional (manager de una OT).
  const mainNavItems: NavItem[] = [
    { title: t("nav.dashboard"), url: "/", icon: LayoutDashboard, show: true },
    { title: t("nav.clients"), url: "/clients", icon: Briefcase, show: can("client.read") },
    { title: t("nav.engagements"), url: "/engagements", icon: FolderKanban, show: can("engagement.read") },
    { title: t("nav.administrativeEngagements"), url: "/administrative-engagements", icon: FolderKanban, show: true },
    { title: t("nav.workMatrix"), url: "/worksheets", icon: TableProperties, show: can("worksheet.read") },
    { title: t("nav.workOrders"), url: "/work-orders", icon: FileText, show: can("work_order.read") },
  ].filter((i) => i.show);

  const operationsItems: NavItem[] = [
    { title: t("nav.tracker"), url: "/tracker", icon: Timer, show: can("time_entry.read") },
    { title: t("nav.timeSheet"), url: "/timesheet", icon: Grid3X3, show: can("timesheet.read") },
    // 0922-190: sin permiso — accesible a los 23 roles, la RLS acota los datos.
    { title: t("nav.myAssignments"), url: "/timesheet/assignments", icon: ListChecks, show: true },
    { title: t("nav.timesheetApprovals"), url: "/timesheet/approvals", icon: CheckSquare, show: can("timesheet_approval.read") },
    { title: t("nav.fundRequests"), url: "/fund-requests", icon: Wallet, show: can("fund_request.read") },
    { title: t("nav.fundRequestApprovals"), url: "/fund-requests/approvals", icon: CheckSquare, show: can("fund_approval.read") || !!managesAnyOt },
    { title: t("nav.fundRequestDisbursements"), url: "/fund-requests/disbursements", icon: Banknote, show: can("fund_disbursement.read") },
  ].filter((i) => i.show);

  // Settings: visible si puede ver algún tab. Se evalúa por permisos de LECTURA,
  // no de escritura: los roles con acceso de solo consulta a los catálogos (p.ej.
  // ita_manager / tax_manager con industry.read, category_rate.read, ...) tienen
  // tabs que mostrar aunque no puedan crear nada. Gatear por *.create dejaba a
  // esos roles sin entrada al menú y, con ella, sin forma de llegar al tab de
  // Cuenta para cambiar su contraseña — permiso que la matriz da a los 23 roles.
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
  const adminItems: NavItem[] = [
    { title: t("nav.staff"), url: "/staff", icon: Users, show: can("staff.read") },
    { title: t("nav.settings"), url: "/settings", icon: Settings, show: canSeeSettings },
  ].filter((i) => i.show);

  const renderGroup = (label: string, items: NavItem[], mt?: boolean) => {
    if (items.length === 0) return null;
    return (
      <SidebarGroup className={mt ? "mt-6" : undefined}>
        <SidebarGroupLabel className="text-sidebar-muted text-xs font-medium uppercase tracking-wider px-3 mb-2">
          {label}
        </SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            {items.map((item) => (
              <SidebarMenuItem key={item.url}>
                <SidebarMenuButton asChild tooltip={item.title}>
                  <NavLink
                    to={item.url}
                    end={item.url === "/" || item.url === "/timesheet" || item.url === "/fund-requests"}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors"
                    activeClassName="bg-sidebar-accent text-sidebar-foreground font-medium"
                  >
                    <item.icon className="h-4 w-4" />
                    <span>{item.title}</span>
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    );
  };

  // Fase 3 — Scheduler: Gap Reporting solo para roles firmwide.
  const planningItems: NavItem[] = [
    { title: t("nav.scheduler"), url: "/scheduler", icon: CalendarRange, show: true },
    { title: t("nav.schedulerGaps"), url: "/scheduler/gaps", icon: ChartColumnDecreasing, show: canSeeSchedulerGaps },
  ].filter((i) => i.show);

  return (
    <Sidebar className="border-r-0" collapsible="offcanvas">
      <SidebarContent className="px-3 pb-4">
        <div className="h-16" />
        {renderGroup(t("nav.main"), mainNavItems)}
        {canSeeSchedulerPlanning && renderGroup(t("nav.planning"), planningItems, true)}
        {renderGroup(t("nav.operations"), operationsItems, true)}
        {renderGroup(t("nav.administration"), adminItems, true)}
      </SidebarContent>

      <SidebarFooter className="p-4 border-t border-sidebar-border">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={handleSignOut} tooltip={t("nav.signOut")}>
              <LogOut className="h-4 w-4" />
              <span>{t("nav.signOut")}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
