import { Suspense, lazy } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryCache, QueryClient, QueryClientProvider, MutationCache } from "@tanstack/react-query";
import { createBrowserRouter, RouterProvider, Outlet } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { BootstrapRoute } from "@/components/BootstrapRoute";
import { LanguageSync } from "@/components/LanguageSync";
import { SessionCacheGuard } from "@/components/SessionCacheGuard";
import ErrorBoundary from "@/components/ErrorBoundary";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { maybeStartSessionRecovery } from "@/lib/sessionRecovery";
import { isSchedulerEnabled } from "@/lib/schedulerFeature";
import { useTranslation } from "react-i18next";

// Eagerly loaded - critical for initial render
import Auth from "./pages/Auth";
import ResetPassword from "./pages/ResetPassword";
import NotFound from "./pages/NotFound";

// Lazy loaded - deferred until route is accessed
const Index = lazy(() => import("./pages/Index"));
const Clients = lazy(() => import("./pages/Clients"));
const ClientNew = lazy(() => import("./pages/ClientNew"));
const ClientEdit = lazy(() => import("./pages/ClientEdit"));
const Engagements = lazy(() => import("./pages/Engagements"));
const EngagementNew = lazy(() => import("./pages/EngagementNew"));
const EngagementEdit = lazy(() => import("./pages/EngagementEdit"));
const WorkOrders = lazy(() => import("./pages/WorkOrders"));
const WorkOrderNew = lazy(() => import("./pages/WorkOrderNew"));
const WorkOrderEdit = lazy(() => import("./pages/WorkOrderEdit"));
const TimeSheet = lazy(() => import("./pages/TimeSheet"));
const FundRequests = lazy(() => import("./pages/FundRequests"));
const FundRequestNew = lazy(() => import("./pages/FundRequestNew"));
const FundRequestEdit = lazy(() => import("./pages/FundRequestEdit"));
const FundRequestApprovals = lazy(() => import("./pages/FundRequestApprovals"));
const FundRequestDisbursements = lazy(() => import("./pages/FundRequestDisbursements"));
const FundRequestExpenses = lazy(() => import("./pages/FundRequestExpenses"));
const Staff = lazy(() => import("./pages/Staff"));
const StaffNew = lazy(() => import("./pages/StaffNew"));
const StaffEdit = lazy(() => import("./pages/StaffEdit"));
const Settings = lazy(() => import("./pages/Settings"));
const TimesheetApprovals = lazy(() => import("./pages/TimesheetApprovals"));
const TimesheetApprovalDetail = lazy(() => import("./pages/TimesheetApprovalDetail"));
const TrackerList = lazy(() => import("./pages/TrackerList"));
const TrackerRecord = lazy(() => import("./pages/TrackerRecord"));
const TrackerEdit = lazy(() => import("./pages/TrackerEdit"));
const WorksheetList = lazy(() => import("./pages/WorksheetList"));
const WorksheetNew = lazy(() => import("./pages/WorksheetNew"));
const WorksheetEdit = lazy(() => import("./pages/WorksheetEdit"));
const Bootstrap = lazy(() => import("./pages/Bootstrap"));

// Fase 3 — Scheduler (consultivo). Cada página queda en su propio chunk
// lazy; el bundle SVAR vendorizado solo se descarga cuando se entra a
// estas rutas (nunca en el chunk inicial de la app).
const SchedulerL1 = lazy(() => import("./pages/SchedulerL1"));
const SchedulerL2 = lazy(() => import("./pages/SchedulerL2"));
const SchedulerStaff = lazy(() => import("./pages/SchedulerStaff"));
const SchedulerGaps = lazy(() => import("./pages/SchedulerGaps"));

// Fase 7 (plan v2 §A.2): a Scheduler session-revocation 401 can surface from
// any query or mutation, so both caches route their errors through the same
// one-shot coordinator. `maybeStartSessionRecovery` is a no-op for anything
// that isn't a confirmed revoked-session failure (src/lib/sessionRecovery.ts).
const onCacheError = (error: unknown) => {
  maybeStartSessionRecovery(error);
};

const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: onCacheError }),
  mutationCache: new MutationCache({ onError: onCacheError }),
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 300_000,
      retry: 1,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
  },
});

// Minimal loading fallback - matches app background
const PageLoader = () => {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="animate-pulse text-muted-foreground">{t("common.loading")}</div>
    </div>
  );
};

// Root layout rendered inside the data router
function RootLayout() {
  return (
    <>
      <LanguageSync />
      <Suspense fallback={<PageLoader />}>
        <Outlet />
      </Suspense>
    </>
  );
}

const router = createBrowserRouter([
  {
    element: <RootLayout />,
    children: [
      { path: "/auth", element: <Auth /> },
      { path: "/reset-password", element: <ResetPassword /> },
      { path: "/bootstrap", element: <BootstrapRoute><Bootstrap /></BootstrapRoute> },
      { path: "/", element: <ProtectedRoute><Index /></ProtectedRoute> },
      { path: "/clients", element: <ProtectedRoute><Clients /></ProtectedRoute> },
      { path: "/clients/new", element: <ProtectedRoute><ClientNew /></ProtectedRoute> },
      { path: "/clients/:id", element: <ProtectedRoute><ClientEdit /></ProtectedRoute> },
      { path: "/engagements", element: <ProtectedRoute><Engagements /></ProtectedRoute> },
      { path: "/engagements/new", element: <ProtectedRoute><EngagementNew /></ProtectedRoute> },
      { path: "/engagements/:id", element: <ProtectedRoute><EngagementEdit /></ProtectedRoute> },
      { path: "/worksheets", element: <ProtectedRoute><WorksheetList /></ProtectedRoute> },
      { path: "/worksheets/new", element: <ProtectedRoute><WorksheetNew /></ProtectedRoute> },
      { path: "/worksheets/:id", element: <ProtectedRoute><WorksheetEdit /></ProtectedRoute> },
      { path: "/work-orders", element: <ProtectedRoute><WorkOrders /></ProtectedRoute> },
      { path: "/work-orders/new", element: <ProtectedRoute><WorkOrderNew /></ProtectedRoute> },
      { path: "/work-orders/:id", element: <ProtectedRoute><WorkOrderEdit /></ProtectedRoute> },
      { path: "/tracker", element: <ProtectedRoute><TrackerList /></ProtectedRoute> },
      { path: "/tracker/new", element: <ProtectedRoute><TrackerRecord /></ProtectedRoute> },
      { path: "/tracker/:id", element: <ProtectedRoute><TrackerEdit /></ProtectedRoute> },
      { path: "/timesheet", element: <ProtectedRoute><TimeSheet /></ProtectedRoute> },
      { path: "/timesheet/approvals", element: <ProtectedRoute><TimesheetApprovals /></ProtectedRoute> },
      { path: "/timesheet/approvals/:periodId", element: <ProtectedRoute><TimesheetApprovalDetail /></ProtectedRoute> },
      { path: "/fund-requests", element: <ProtectedRoute><FundRequests /></ProtectedRoute> },
      { path: "/fund-requests/new", element: <ProtectedRoute><FundRequestNew /></ProtectedRoute> },
      { path: "/fund-requests/approvals", element: <ProtectedRoute><FundRequestApprovals /></ProtectedRoute> },
      { path: "/fund-requests/disbursements", element: <ProtectedRoute><FundRequestDisbursements /></ProtectedRoute> },
      { path: "/fund-requests/:id", element: <ProtectedRoute><FundRequestEdit /></ProtectedRoute> },
      { path: "/fund-requests/:id/expenses", element: <ProtectedRoute><FundRequestExpenses /></ProtectedRoute> },
      { path: "/staff", element: <ProtectedRoute><Staff /></ProtectedRoute> },
      { path: "/staff/new", element: <ProtectedRoute><StaffNew /></ProtectedRoute> },
      { path: "/staff/:id", element: <ProtectedRoute><StaffEdit /></ProtectedRoute> },
      { path: "/settings", element: <ProtectedRoute><Settings /></ProtectedRoute> },
      // Fase 3 — Scheduler (consultivo). El gate de rol es en componente
      // (canSeePlanning/canSeeGaps) + el 403 del servidor; no hay guard de
      // rol a nivel de ruta en development.
      // Fase 7 (plan v2 §B.4#1): con el flag apagado estas rutas no se
      // registran — caen en el catch-all "*" -> NotFound, cubriendo deep
      // links y bookmarks sin un componente ni una clave i18n nuevos. Los
      // lazy() de arriba siguen incondicionales: lazy no descarga nada hasta
      // que la ruta se renderiza, así que la evidencia de chunks no cambia.
      ...(isSchedulerEnabled()
        ? [
            { path: "/scheduler", element: <ProtectedRoute><SchedulerL1 /></ProtectedRoute> },
            { path: "/scheduler/engagement/:id", element: <ProtectedRoute><SchedulerL2 /></ProtectedRoute> },
            { path: "/scheduler/gaps", element: <ProtectedRoute><SchedulerGaps /></ProtectedRoute> },
            { path: "/scheduler/staff/:id", element: <ProtectedRoute><SchedulerStaff /></ProtectedRoute> },
          ]
        : []),
      { path: "*", element: <NotFound /> },
    ],
  },
]);

const App = () => (
  <ThemeProvider>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <AuthProvider>
            <SessionCacheGuard />
            <Toaster />
            <RouterProvider router={router} />
          </AuthProvider>
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  </ThemeProvider>
);

export default App;
