import { useLocation, useNavigate } from "react-router-dom";
import { LayoutDashboard, Grid3X3, Timer, Receipt, Menu } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

interface MobileBottomNavProps {
  onMoreClick: () => void;
}

const navItems = [
  { path: "/", icon: LayoutDashboard, labelKey: "nav.dashboard" },
  { path: "/timesheet", icon: Grid3X3, labelKey: "nav.timesheet" },
  { path: "/tracker", icon: Timer, labelKey: "nav.tracker" },
  { path: "/expenses", icon: Receipt, labelKey: "nav.expenses" },
];

export function MobileBottomNav({ onMoreClick }: MobileBottomNavProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const isActive = (path: string) => {
    if (path === "/") return location.pathname === "/";
    return location.pathname.startsWith(path);
  };

  return (
    <nav className="fixed bottom-0 inset-x-0 z-[100] bg-sidebar border-t border-sidebar-border md:hidden safe-area-bottom">
      <div className="flex items-center justify-around h-16">
        {navItems.map((item) => {
          const active = isActive(item.path);
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={cn(
                "flex flex-col items-center justify-center flex-1 h-full min-w-[64px] gap-0.5 transition-colors",
                active
                  ? "text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/70 hover:text-sidebar-foreground"
              )}
            >
              <item.icon className="h-5 w-5" />
              <span className="text-[10px] font-medium">{t(item.labelKey)}</span>
            </button>
          );
        })}
        <button
          onClick={onMoreClick}
          className="flex flex-col items-center justify-center flex-1 h-full min-w-[64px] gap-0.5 text-sidebar-foreground/70 hover:text-sidebar-foreground transition-colors"
        >
          <Menu className="h-5 w-5" />
          <span className="text-[10px] font-medium">{t("common.more")}</span>
        </button>
      </div>
    </nav>
  );
}
