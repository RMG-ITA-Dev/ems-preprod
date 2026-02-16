import { Bell, Menu, LogOut, UserCheck, UserX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useAuth } from "@/hooks/useAuth";
import { useCurrentStaff } from "@/hooks/useCurrentStaff";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface AppHeaderProps {
  title?: string;
}

export function AppHeader({ title = "Dashboard" }: AppHeaderProps) {
  const { t } = useTranslation();
  const { user, signOut } = useAuth();
  const { data: staffRecord } = useCurrentStaff();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate("/auth");
  };

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

  const compositeTitle = displayName
    ? `${t("header.userPrefix")} ${displayName} - ${title}`
    : title;

  return (
    <header className="h-16 border-b border-border bg-card px-4 md:px-6 grid grid-cols-[1fr_auto_1fr] items-center">
      {/* Left zone: trigger + user/title */}
      <div className="flex items-center gap-4 min-w-0">
        {/* Sidebar trigger - hidden on mobile */}
        <div className="hidden md:block">
          <SidebarTrigger>
            <Menu className="h-5 w-5" />
          </SidebarTrigger>
        </div>
        <h1 
          className="text-sm md:text-base font-semibold text-foreground truncate"
          title={compositeTitle}
        >
          {compositeTitle}
        </h1>
      </div>

      {/* Center zone: brand - always centered */}
      <div className="flex items-center justify-center px-2">
        <span
          className="font-bold text-primary text-lg md:text-xl leading-none whitespace-nowrap"
          style={{ fontFamily: '"IBM Plex Sans", system-ui, sans-serif' }}
        >
          EMS 2.0
        </span>
      </div>

      {/* Right zone: actions */}
      <div className="flex items-center gap-4 justify-self-end">
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5 text-muted-foreground" />
          <span className="absolute top-1.5 right-1.5 h-2 w-2 bg-accent rounded-full" />
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="h-9 w-9 rounded-full bg-accent flex items-center justify-center cursor-pointer hover:opacity-90 transition-opacity">
              <span className="text-accent-foreground font-medium text-sm">{userInitials}</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
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
                  <Badge variant="secondary" className="text-xs">
                    {staffRecord.category?.category_name || t("entities.staff")}
                  </Badge>
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
    </header>
  );
}
