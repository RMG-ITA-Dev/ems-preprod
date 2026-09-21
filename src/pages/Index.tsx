import { lazy, Suspense } from "react";
import { useTranslation } from "react-i18next";
import { AppLayout } from "@/components/layout/AppLayout";
import { DashboardProvider, useDashboard, DashboardTab } from "@/contexts/DashboardContext";
import { useDashboardAccess } from "@/hooks/useDashboardAccess";
import { PeriodSelector } from "@/components/dashboard/PeriodSelector";
import { TabErrorBoundary } from "@/components/dashboard/TabErrorBoundary";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Building2, Briefcase, FolderKanban, User, Users } from "lucide-react";
import { cn } from "@/lib/utils";

// Lazy-loaded tabs — each becomes its own JS chunk so only the active tab fetches on first render.
const PracticaTab = lazy(() =>
  import("@/components/dashboard/tabs/PracticaTab").then((m) => ({ default: m.PracticaTab }))
);
const CarteraTab = lazy(() =>
  import("@/components/dashboard/tabs/CarteraTab").then((m) => ({ default: m.CarteraTab }))
);
// dash_cartera: filtro Cliente, exclusivo de la pestaña Cartera (mismo patrón que
// PartnerFilters/PartnerTab.tsx).
const CarteraFilters = lazy(() =>
  import("@/components/dashboard/tabs/CarteraTab").then((m) => ({ default: m.CarteraFilters }))
);
const EncargoTab = lazy(() =>
  import("@/components/dashboard/tabs/EncargoTab").then((m) => ({ default: m.EncargoTab }))
);
const PersonalTab = lazy(() =>
  import("@/components/dashboard/tabs/PersonalTab").then((m) => ({ default: m.PersonalTab }))
);
// dash_socio: pestaña Socio (senior_partner/partner/director/sqr), última en el orden
// (decisiones.md §3) para no alterar el tab por defecto de ningún rol existente.
const PartnerTab = lazy(() =>
  import("@/components/dashboard/tabs/PartnerTab").then((m) => ({ default: m.PartnerTab }))
);
const PartnerFilters = lazy(() =>
  import("@/components/dashboard/tabs/PartnerTab").then((m) => ({ default: m.PartnerFilters }))
);

// 'practica' (id) se mantiene en TAB_CONFIG por si se revierte el ocultamiento (ver
// useDashboardAccess.ts TAB_ORDER), pero nunca aparece en allowedTabs -> su trigger no
// renderiza. La pestaña 'socio' toma visualmente su lugar: mismo labelKey
// 'dashboard.tabs.practica' (2026-09-16, decisión del operador) -- el id/permiso interno
// (dashboard.partner.read) no cambia, solo el rótulo mostrado.
// 2026-09-17 (decisión del operador): 'socio' pasa a renderizarse primero -- solo el orden
// visual (este array); TAB_ORDER (useDashboardAccess.ts, elige el tab por defecto) no
// cambia, sigue priorizando 'cartera'.
const TAB_CONFIG: { id: DashboardTab; icon: React.ReactNode; labelKey: string }[] = [
  { id: 'socio', icon: <Users className="h-4 w-4" />, labelKey: 'dashboard.tabs.practica' },
  { id: 'practica', icon: <Building2 className="h-4 w-4" />, labelKey: 'dashboard.tabs.practica' },
  { id: 'cartera', icon: <Briefcase className="h-4 w-4" />, labelKey: 'dashboard.tabs.cartera' },
  { id: 'encargo', icon: <FolderKanban className="h-4 w-4" />, labelKey: 'dashboard.tabs.encargo' },
  { id: 'personal', icon: <User className="h-4 w-4" />, labelKey: 'dashboard.tabs.personal' },
];

function TabSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

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
        <div className="flex flex-wrap items-center justify-between gap-2">
          <TabsList className="bg-muted/50 backdrop-blur-sm border border-border">
            {TAB_CONFIG.map((tab) => {
              const isAllowed = allowedTabs.includes(tab.id);
              if (!isAllowed) return null;

              return (
                <TabsTrigger
                  key={tab.id}
                  value={tab.id}
                  className={cn(
                    "flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm",
                    "transition-all duration-200"
                  )}
                >
                  {tab.icon}
                  <span className="hidden sm:inline">{t(tab.labelKey)}</span>
                </TabsTrigger>
              );
            })}
          </TabsList>
          {/* dash_socio: filtros Cliente/Gerente/Sector, exclusivos de la pestaña Socio
              (decisiones.md §3 layout). Solo se montan cuando la pestaña está activa. */}
          {activeTab === 'socio' && (
            <Suspense fallback={null}>
              <PartnerFilters />
            </Suspense>
          )}
          {/* dash_cartera: filtro Cliente, exclusivo de la pestaña Cartera (decisiones.md
              §7.4 layout). Solo se monta cuando la pestaña está activa. */}
          {activeTab === 'cartera' && (
            <Suspense fallback={null}>
              <CarteraFilters />
            </Suspense>
          )}
        </div>

        {/* Tab Content — each tab is lazy-loaded into its own chunk and isolated by an error boundary
            so a failure in one tab does not crash the whole dashboard. */}
        <TabsContent value="practica" className="mt-4">
          <TabErrorBoundary tabLabel={t('dashboard.tabs.practica')}>
            <Suspense fallback={<TabSkeleton />}>
              <PracticaTab />
            </Suspense>
          </TabErrorBoundary>
        </TabsContent>

        <TabsContent value="cartera" className="mt-4">
          <TabErrorBoundary tabLabel={t('dashboard.tabs.cartera')}>
            <Suspense fallback={<TabSkeleton />}>
              <CarteraTab />
            </Suspense>
          </TabErrorBoundary>
        </TabsContent>

        <TabsContent value="encargo" className="mt-4">
          <TabErrorBoundary tabLabel={t('dashboard.tabs.encargo')}>
            <Suspense fallback={<TabSkeleton />}>
              <EncargoTab />
            </Suspense>
          </TabErrorBoundary>
        </TabsContent>

        <TabsContent value="personal" className="mt-4">
          <TabErrorBoundary tabLabel={t('dashboard.tabs.personal')}>
            <Suspense fallback={<TabSkeleton />}>
              <PersonalTab />
            </Suspense>
          </TabErrorBoundary>
        </TabsContent>

        <TabsContent value="socio" className="mt-4">
          <TabErrorBoundary tabLabel={t('dashboard.tabs.practica')}>
            <Suspense fallback={<TabSkeleton />}>
              <PartnerTab />
            </Suspense>
          </TabErrorBoundary>
        </TabsContent>
      </Tabs>
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
