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
  TableProperties,
  Wallet,
  Banknote,
  CalendarRange,
  ChartColumnDecreasing,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { NavLink } from "@/components/NavLink";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { useCurrentStaff } from "@/hooks/useCurrentStaff";
import { useManagesAnyOt } from "@/hooks/useFundRequests";
import { canSeeGaps, canSeePlanning } from "@/lib/schedulerAccess";
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

export function AppSidebar() {
  const { t } = useTranslation();
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const { isAdmin, isPartner, isDirector, isManager, isSenior } = useUserRole();
  const { data: staffRecord } = useCurrentStaff();
  const { data: managesAnyOt } = useManagesAnyOt(staffRecord?.staff_id);
  // El gerente de OT puede ser un Senior (sin rol de app manager): se incluye si
  // gestiona al menos una OT, para que vea el link de aprobaciones.
  const canApproveFunds =
    isAdmin || isPartner || isDirector || isManager || !!managesAnyOt;
  // Fase 3 — Scheduler: predicados compartidos con rutas/mobile drawer
  // (src/lib/schedulerAccess.ts) para que la matriz de roles nunca diverja.
  const canSeeSchedulerPlanning = canSeePlanning({ isAdmin, isPartner, isDirector, isManager, isSenior });
  const canSeeSchedulerGaps = canSeeGaps({ isAdmin, isPartner, isDirector, isManager, isSenior });

  const handleSignOut = async () => {
    await signOut();
    navigate("/auth");
  };

  const mainNavItems = [
    { title: t("nav.dashboard"), url: "/", icon: LayoutDashboard },
    { title: t("nav.clients"), url: "/clients", icon: Briefcase },
    { title: t("nav.engagements"), url: "/engagements", icon: FolderKanban },
    { title: t("nav.workMatrix"), url: "/worksheets", icon: TableProperties },
    { title: t("nav.workOrders"), url: "/work-orders", icon: FileText },
  ];

  const operationsItems = [
    { title: t("nav.tracker"), url: "/tracker", icon: Timer },
    { title: t("nav.timeSheet"), url: "/timesheet", icon: Grid3X3 },
    { title: t("nav.timesheetApprovals"), url: "/timesheet/approvals", icon: CheckSquare },
    { title: t("nav.fundRequests"), url: "/fund-requests", icon: Wallet },
    ...(canApproveFunds
      ? [
          {
            title: t("nav.fundRequestApprovals"),
            url: "/fund-requests/approvals",
            icon: CheckSquare,
          },
        ]
      : []),
    ...(isAdmin
      ? [
          {
            title: t("nav.fundRequestDisbursements"),
            url: "/fund-requests/disbursements",
            icon: Banknote,
          },
        ]
      : []),
  ];

  const adminItems = [
    { title: t("nav.staff"), url: "/staff", icon: Users },
    { title: t("nav.settings"), url: "/settings", icon: Settings },
  ];

  // Fase 3 — Scheduler: Gap Reporting solo para roles firmwide.
  const planningItems = [
    { title: t("nav.scheduler"), url: "/scheduler", icon: CalendarRange },
    ...(canSeeSchedulerGaps
      ? [{ title: t("nav.schedulerGaps"), url: "/scheduler/gaps", icon: ChartColumnDecreasing }]
      : []),
  ];

  return (
    <Sidebar className="border-r-0" collapsible="offcanvas">
      <SidebarContent className="px-3 pb-4">
        <div className="h-16" />
        <SidebarGroup>
          <SidebarGroupLabel className="text-sidebar-muted text-xs font-medium uppercase tracking-wider px-3 mb-2">
            {t("nav.main")}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainNavItems.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton asChild tooltip={item.title}>
                    <NavLink 
                      to={item.url} 
                      end={item.url === "/"}
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

        {canSeeSchedulerPlanning && (
          <SidebarGroup className="mt-6">
            <SidebarGroupLabel className="text-sidebar-muted text-xs font-medium uppercase tracking-wider px-3 mb-2">
              {t("nav.planning")}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {planningItems.map((item) => (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton asChild tooltip={item.title}>
                      <NavLink
                        to={item.url}
                        end={item.url === "/scheduler"}
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
        )}

        <SidebarGroup className="mt-6">
          <SidebarGroupLabel className="text-sidebar-muted text-xs font-medium uppercase tracking-wider px-3 mb-2">
            {t("nav.operations")}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {operationsItems.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton asChild tooltip={item.title}>
                    <NavLink
                      to={item.url}
                      end={item.url === "/timesheet" || item.url === "/fund-requests"}
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

        <SidebarGroup className="mt-6">
          <SidebarGroupLabel className="text-sidebar-muted text-xs font-medium uppercase tracking-wider px-3 mb-2">
            {t("nav.administration")}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {adminItems.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton asChild tooltip={item.title}>
                    <NavLink 
                      to={item.url}
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
