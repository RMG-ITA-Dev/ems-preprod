import { useTranslation } from "react-i18next";
import { AppLayout } from "@/components/layout/AppLayout";
import { DashboardProvider, useDashboard, DashboardTab } from "@/contexts/DashboardContext";
import { useDashboardAccess } from "@/hooks/useDashboardAccess";
import { PeriodSelector } from "@/components/dashboard/PeriodSelector";
import { PersonalTab } from '@/components/dashboard/tabs/PersonalTab';
import { EncargoTab } from '@/components/dashboard/tabs/EncargoTab';
import { CarteraTab } from '@/components/dashboard/tabs/CarteraTab';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Building2, Briefcase, FolderKanban, User } from "lucide-react";
import { cn } from "@/lib/utils";

const TAB_CONFIG: { id: DashboardTab; icon: React.ReactNode; labelKey: string }[] = [
  { id: 'practica', icon: <Building2 className="h-4 w-4" />, labelKey: 'dashboard.tabs.practica' },
  { id: 'cartera', icon: <Briefcase className="h-4 w-4" />, labelKey: 'dashboard.tabs.cartera' },
  { id: 'encargo', icon: <FolderKanban className="h-4 w-4" />, labelKey: 'dashboard.tabs.encargo' },
  { id: 'personal', icon: <User className="h-4 w-4" />, labelKey: 'dashboard.tabs.personal' },
];

function DashboardContent() {
  const { t } = useTranslation();
  const { activeTab, setActiveTab } = useDashboard();
  const { allowedTabs, isLoading } = useDashboardAccess();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">{t("common.loading")}</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Period Selector */}
      <PeriodSelector />

      {/* Tab Navigation */}
      <Tabs value={activeTab} onValueChange={(val) => setActiveTab(val as DashboardTab)}>
        <TabsList className="bg-muted/50 backdrop-blur-sm border border-border">
          {TAB_CONFIG.map((tab) => {
            const isAllowed = allowedTabs.includes(tab.id);
            if (!isAllowed) return null;

            return (
              <TabsTrigger
                key={tab.id}
                value={tab.id}
                className={cn(
                  "flex items-center gap-2 data-[state=active]:bg-card data-[state=active]:shadow-sm",
                  "transition-all duration-200"
                )}
              >
                {tab.icon}
                <span className="hidden sm:inline">{t(tab.labelKey)}</span>
              </TabsTrigger>
            );
          })}
        </TabsList>

        {/* Tab Content */}
        <TabsContent value="practica" className="mt-4">
          <PlaceholderTab title={t('dashboard.tabs.practica')} description="Métricas de la práctica a nivel firma" />
        </TabsContent>

        <TabsContent value="cartera" className="mt-4">
          <CarteraTab />
        </TabsContent>

        <TabsContent value="encargo" className="mt-4">
          <EncargoTab />
        </TabsContent>

        <TabsContent value="personal" className="mt-4">
          <PersonalTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function PlaceholderTab({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-xl border border-border bg-card/50 backdrop-blur-sm p-8 text-center">
      <h3 className="text-lg font-semibold text-foreground">{title}</h3>
      <p className="text-muted-foreground mt-2">{description}</p>
      <p className="text-xs text-muted-foreground mt-4">Próximamente...</p>
    </div>
  );
}

const Index = () => {
  const { t } = useTranslation();
  const { defaultTab } = useDashboardAccess();

  return (
    <AppLayout title={t("dashboard.title")}>
      <DashboardProvider defaultTab={defaultTab}>
        <DashboardContent />
      </DashboardProvider>
    </AppLayout>
  );
};

export default Index;
