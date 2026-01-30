import { Bell, Menu, LogOut, UserCheck, UserX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useAuth } from "@/hooks/useAuth";
import { useCurrentStaff } from "@/hooks/useCurrentStaff";
import { useNavigate } from "react-router-dom";
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

  return (
    <header className="h-16 border-b border-border bg-card flex items-center justify-between px-4 md:px-6">
      <div className="flex items-center gap-4">
        {/* Sidebar trigger - hidden on mobile */}
        <div className="hidden md:block">
          <SidebarTrigger>
            <Menu className="h-5 w-5" />
          </SidebarTrigger>
        </div>
        <h1 className="text-lg md:text-xl font-semibold text-foreground">{title}</h1>
      </div>

      <div className="flex items-center gap-4">
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
              <p className="text-sm font-medium">{displayName || 'User'}</p>
              <p className="text-xs text-muted-foreground">{user?.email}</p>
            </div>
            <DropdownMenuSeparator />
            <div className="px-2 py-1.5">
              {staffRecord ? (
                <div className="flex items-center gap-2 text-xs">
                  <UserCheck className="h-3.5 w-3.5 text-success" />
                  <span className="text-muted-foreground">Linked to staff: </span>
                  <Badge variant="secondary" className="text-xs">
                    {staffRecord.category?.category_name || 'Staff'}
                  </Badge>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <UserX className="h-3.5 w-3.5" />
                  <span>Not linked to staff record</span>
                </div>
              )}
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleSignOut} className="text-destructive focus:text-destructive">
              <LogOut className="mr-2 h-4 w-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
