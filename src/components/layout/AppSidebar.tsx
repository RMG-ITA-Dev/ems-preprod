import { 
  LayoutDashboard, 
  Building2, 
  Briefcase, 
  Users, 
  Settings,
  FileText,
  Receipt,
  LogOut,
  CheckSquare,
  Timer,
  Grid3X3,
  TableProperties,
  UserCheck,
  UserX
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { NavLink } from "@/components/NavLink";
import { useAuth } from "@/hooks/useAuth";
import { useCurrentStaff } from "@/hooks/useCurrentStaff";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";

export function AppSidebar() {
  const { t } = useTranslation();
  const { user, signOut } = useAuth();
  const { data: staffRecord } = useCurrentStaff();
  const navigate = useNavigate();

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

  const handleSignOut = async () => {
    await signOut();
    navigate("/auth");
  };

  const mainNavItems = [
    { title: t("nav.dashboard"), url: "/", icon: LayoutDashboard },
    { title: t("nav.clients"), url: "/clients", icon: Building2 },
    { title: t("nav.engagements"), url: "/engagements", icon: Briefcase },
    { title: t("nav.workMatrix"), url: "/worksheets", icon: TableProperties },
    { title: t("nav.workOrders"), url: "/work-orders", icon: FileText },
  ];

  const operationsItems = [
    { title: t("nav.tracker"), url: "/tracker", icon: Timer },
    { title: t("nav.timeSheet"), url: "/timesheet", icon: Grid3X3 },
    { title: t("nav.timesheetApprovals"), url: "/timesheet/approvals", icon: CheckSquare },
    { title: t("nav.expenses"), url: "/expenses", icon: Receipt },
  ];

  const adminItems = [
    { title: t("nav.staff"), url: "/staff", icon: Users },
    { title: t("nav.settings"), url: "/settings", icon: Settings },
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
                      end={item.url === "/timesheet"}
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
        <div className="flex items-center justify-start">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="h-9 w-9 rounded-full bg-accent flex items-center justify-center cursor-pointer hover:opacity-90 transition-opacity">
                <span className="text-accent-foreground font-medium text-sm">{userInitials}</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="start" className="w-64">
              <div className="px-2 py-1.5">
                <p className="text-sm font-medium">{displayName || t("common.user")}</p>
                <p className="text-xs text-muted-foreground">{user?.email}</p>
              </div>
              <DropdownMenuSeparator />
              <div className="px-2 py-1.5">
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
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleSignOut} className="text-destructive focus:text-destructive">
                <LogOut className="mr-2 h-4 w-4" />
                {t("nav.signOut")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}