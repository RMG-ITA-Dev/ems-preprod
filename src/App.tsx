import { Suspense, lazy } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createBrowserRouter, RouterProvider, Outlet } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { PermissionRoute } from "@/components/authz/PermissionRoute";
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
      { path: "/clients", element: <ProtectedRoute><PermissionRoute permission="client.read"><Clients /></PermissionRoute></ProtectedRoute> },
      { path: "/clients/new", element: <ProtectedRoute><PermissionRoute permission="client.create"><ClientNew /></PermissionRoute></ProtectedRoute> },
      { path: "/clients/:id", element: <ProtectedRoute><PermissionRoute permission="client.read"><ClientEdit /></PermissionRoute></ProtectedRoute> },
      { path: "/engagements", element: <ProtectedRoute><PermissionRoute permission="engagement.read"><Engagements /></PermissionRoute></ProtectedRoute> },
      { path: "/engagements/new", element: <ProtectedRoute><PermissionRoute permission="engagement.create"><EngagementNew /></PermissionRoute></ProtectedRoute> },
      { path: "/engagements/:id", element: <ProtectedRoute><PermissionRoute permission="engagement.read"><EngagementEdit /></PermissionRoute></ProtectedRoute> },
      { path: "/worksheets", element: <ProtectedRoute><PermissionRoute permission="worksheet.read"><WorksheetList /></PermissionRoute></ProtectedRoute> },
      { path: "/worksheets/new", element: <ProtectedRoute><PermissionRoute permission="worksheet.create"><WorksheetNew /></PermissionRoute></ProtectedRoute> },
      { path: "/worksheets/:id", element: <ProtectedRoute><PermissionRoute permission="worksheet.read"><WorksheetEdit /></PermissionRoute></ProtectedRoute> },
      { path: "/work-orders", element: <ProtectedRoute><PermissionRoute permission="work_order.read"><WorkOrders /></PermissionRoute></ProtectedRoute> },
      { path: "/work-orders/new", element: <ProtectedRoute><PermissionRoute permission="work_order.create"><WorkOrderNew /></PermissionRoute></ProtectedRoute> },
      { path: "/work-orders/:id", element: <ProtectedRoute><PermissionRoute permission="work_order.read"><WorkOrderEdit /></PermissionRoute></ProtectedRoute> },
      { path: "/tracker", element: <ProtectedRoute><PermissionRoute permission="time_entry.read"><TrackerList /></PermissionRoute></ProtectedRoute> },
      { path: "/tracker/new", element: <ProtectedRoute><PermissionRoute permission="time_entry.create"><TrackerRecord /></PermissionRoute></ProtectedRoute> },
      { path: "/tracker/:id", element: <ProtectedRoute><PermissionRoute permission="time_entry.read"><TrackerEdit /></PermissionRoute></ProtectedRoute> },
      { path: "/timesheet", element: <ProtectedRoute><PermissionRoute permission="timesheet.read"><TimeSheet /></PermissionRoute></ProtectedRoute> },
      { path: "/timesheet/approvals", element: <ProtectedRoute><PermissionRoute permission="timesheet_approval.read"><TimesheetApprovals /></PermissionRoute></ProtectedRoute> },
      { path: "/timesheet/approvals/:periodId", element: <ProtectedRoute><PermissionRoute permission="timesheet_approval.read"><TimesheetApprovalDetail /></PermissionRoute></ProtectedRoute> },
      { path: "/fund-requests", element: <ProtectedRoute><PermissionRoute permission="fund_request.read"><FundRequests /></PermissionRoute></ProtectedRoute> },
      { path: "/fund-requests/new", element: <ProtectedRoute><PermissionRoute permission="fund_request.create"><FundRequestNew /></PermissionRoute></ProtectedRoute> },
      { path: "/fund-requests/approvals", element: <ProtectedRoute><FundRequestApprovals /></ProtectedRoute> },
      { path: "/fund-requests/disbursements", element: <ProtectedRoute><PermissionRoute permission="fund_disbursement.read"><FundRequestDisbursements /></PermissionRoute></ProtectedRoute> },
      { path: "/fund-requests/:id", element: <ProtectedRoute><PermissionRoute permission="fund_request.read"><FundRequestEdit /></PermissionRoute></ProtectedRoute> },
      { path: "/fund-requests/:id/expenses", element: <ProtectedRoute><PermissionRoute permission="fund_expense.read"><FundRequestExpenses /></PermissionRoute></ProtectedRoute> },
      { path: "/staff", element: <ProtectedRoute><PermissionRoute permission="staff.read"><Staff /></PermissionRoute></ProtectedRoute> },
      { path: "/staff/new", element: <ProtectedRoute><PermissionRoute permission="staff.create"><StaffNew /></PermissionRoute></ProtectedRoute> },
      { path: "/staff/:id", element: <ProtectedRoute><PermissionRoute permission="staff.read"><StaffEdit /></PermissionRoute></ProtectedRoute> },
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
