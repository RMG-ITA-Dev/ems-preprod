import { ReactNode, useState } from "react";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { AppHeader } from "./AppHeader";
import { MobileBottomNav } from "./MobileBottomNav";
import { MobileMoreDrawer } from "./MobileMoreDrawer";

interface AppLayoutProps {
  children: ReactNode;
  title?: string;
  focusMode?: boolean;
}

export function AppLayout({ children, title, focusMode }: AppLayoutProps) {
  const [moreDrawerOpen, setMoreDrawerOpen] = useState(false);

  return (
    <SidebarProvider defaultOpen={!focusMode}>
      <div className="min-h-screen flex w-full bg-background">
        {/* Sidebar - hidden on mobile; collapsed by default in focus mode */}
        <div className="hidden md:block">
          <AppSidebar />
        </div>
        <div className="flex-1 flex flex-col min-w-0">
          <AppHeader title={title} focusMode={focusMode} />
          <main className="flex-1 p-3 sm:p-4 md:p-6 overflow-auto pb-20 md:pb-6">
            {children}
          </main>
        </div>
      </div>
      
      {/* Mobile bottom navigation - hidden in focus mode */}
      {!focusMode && (
        <>
          <MobileBottomNav onMoreClick={() => setMoreDrawerOpen(true)} />
          <MobileMoreDrawer open={moreDrawerOpen} onOpenChange={setMoreDrawerOpen} />
        </>
      )}
    </SidebarProvider>
  );
}
