import { Suspense, lazy } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createBrowserRouter, RouterProvider, Outlet } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { BootstrapRoute } from "@/components/BootstrapRoute";
import { LanguageSync } from "@/components/LanguageSync";
import ErrorBoundary from "@/components/ErrorBoundary";
import { ThemeProvider } from "@/components/theme/ThemeProvider";

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
const Expenses = lazy(() => import("./pages/Expenses"));
const ExpenseNew = lazy(() => import("./pages/ExpenseNew"));
const ExpenseEdit = lazy(() => import("./pages/ExpenseEdit"));
const FundRequests = lazy(() => import("./pages/FundRequests"));
const FundRequestNew = lazy(() => import("./pages/FundRequestNew"));
const FundRequestEdit = lazy(() => import("./pages/FundRequestEdit"));
const FundRequestApprovals = lazy(() => import("./pages/FundRequestApprovals"));
const FundRequestDisbursements = lazy(() => import("./pages/FundRequestDisbursements"));
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

const queryClient = new QueryClient({
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
const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <div className="animate-pulse text-muted-foreground">Loading...</div>
  </div>
);

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
      { path: "/expenses", element: <ProtectedRoute><Expenses /></ProtectedRoute> },
      { path: "/expenses/new", element: <ProtectedRoute><ExpenseNew /></ProtectedRoute> },
      { path: "/expenses/:id", element: <ProtectedRoute><ExpenseEdit /></ProtectedRoute> },
      { path: "/fund-requests", element: <ProtectedRoute><FundRequests /></ProtectedRoute> },
      { path: "/fund-requests/new", element: <ProtectedRoute><FundRequestNew /></ProtectedRoute> },
      { path: "/fund-requests/approvals", element: <ProtectedRoute><FundRequestApprovals /></ProtectedRoute> },
      { path: "/fund-requests/disbursements", element: <ProtectedRoute><FundRequestDisbursements /></ProtectedRoute> },
      { path: "/fund-requests/:id", element: <ProtectedRoute><FundRequestEdit /></ProtectedRoute> },
      { path: "/staff", element: <ProtectedRoute><Staff /></ProtectedRoute> },
      { path: "/staff/new", element: <ProtectedRoute><StaffNew /></ProtectedRoute> },
      { path: "/staff/:id", element: <ProtectedRoute><StaffEdit /></ProtectedRoute> },
      { path: "/settings", element: <ProtectedRoute><Settings /></ProtectedRoute> },
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
            <Toaster />
            <RouterProvider router={router} />
          </AuthProvider>
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  </ThemeProvider>
);

export default App;
