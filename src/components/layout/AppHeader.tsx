import { Bell, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useAuth } from "@/hooks/useAuth";
import { useCurrentStaff } from "@/hooks/useCurrentStaff";
import { useTranslation } from "react-i18next";

interface AppHeaderProps {
  title?: string;
}

export function AppHeader({ title = "Dashboard" }: AppHeaderProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { data: staffRecord } = useCurrentStaff();

  const displayName = staffRecord 
    ? `${staffRecord.first_name} ${staffRecord.last_name}`
    : user?.user_metadata?.first_name 
      ? `${user.user_metadata.first_name} ${user.user_metadata.last_name || ''}`
      : null;

  return (
    <header className="h-16 border-b border-border bg-card px-4 md:px-6 grid grid-cols-[1fr_auto_1fr] items-center">
      {/* Left zone: trigger + title */}
      <div className="flex items-center gap-4 min-w-0">
        {/* Sidebar trigger - hidden on mobile */}
        <div className="hidden md:block">
          <SidebarTrigger>
            <Menu className="h-5 w-5" />
          </SidebarTrigger>
        </div>
        <h1 
          className="text-sm md:text-base font-semibold text-foreground truncate"
          title={title}
        >
          {title}
        </h1>
      </div>

      {/* Center zone: brand - hidden on mobile */}
      <div className="hidden md:flex items-center justify-center px-2">
        <span
          className="font-bold text-primary text-lg md:text-xl leading-none whitespace-nowrap"
          style={{ fontFamily: '"IBM Plex Sans", system-ui, sans-serif' }}
        >
          RuizmierGroup - EMS 2.0
        </span>
      </div>

      {/* Right zone: bell + plain text name */}
      <div className="flex items-center gap-4 justify-self-end min-w-0">
        <Button variant="ghost" size="icon" className="relative flex-shrink-0">
          <Bell className="h-5 w-5 text-muted-foreground" />
          <span className="absolute top-1.5 right-1.5 h-2 w-2 bg-accent rounded-full" />
        </Button>
        <span
          className="text-sm font-semibold text-foreground truncate"
          title={`${t("header.userPrefix")} ${displayName || t("common.user")}`}
        >
          {t("header.userPrefix")} {displayName || t("common.user")}
        </span>
      </div>
    </header>
  );
}