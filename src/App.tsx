import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { LanguageSync } from "@/components/LanguageSync";
import ErrorBoundary from "@/components/ErrorBoundary";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Clients from "./pages/Clients";
import ClientNew from "./pages/ClientNew";
import ClientEdit from "./pages/ClientEdit";
import Engagements from "./pages/Engagements";
import EngagementNew from "./pages/EngagementNew";
import EngagementEdit from "./pages/EngagementEdit";
import WorkOrders from "./pages/WorkOrders";
import WorkOrderNew from "./pages/WorkOrderNew";
import WorkOrderEdit from "./pages/WorkOrderEdit";
import TimeSheet from "./pages/TimeSheet";
import Expenses from "./pages/Expenses";
import ExpenseNew from "./pages/ExpenseNew";
import ExpenseEdit from "./pages/ExpenseEdit";
import Staff from "./pages/Staff";
import StaffNew from "./pages/StaffNew";
import StaffEdit from "./pages/StaffEdit";
import Settings from "./pages/Settings";
import TimesheetApprovals from "./pages/TimesheetApprovals";
import TimesheetApprovalDetail from "./pages/TimesheetApprovalDetail";
import TrackerList from "./pages/TrackerList";
import TrackerRecord from "./pages/TrackerRecord";
import WorksheetList from "./pages/WorksheetList";
import WorksheetNew from "./pages/WorksheetNew";
import WorksheetEdit from "./pages/WorksheetEdit";
import NotFound from "./pages/NotFound";
import ResetPassword from "./pages/ResetPassword";

const queryClient = new QueryClient();

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <Toaster />
          <BrowserRouter>
            <LanguageSync />
            <Routes>
              <Route path="/auth" element={<Auth />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/" element={<ProtectedRoute><Index /></ProtectedRoute>} />
              <Route path="/clients" element={<ProtectedRoute><Clients /></ProtectedRoute>} />
              <Route path="/clients/new" element={<ProtectedRoute><ClientNew /></ProtectedRoute>} />
              <Route path="/clients/:id" element={<ProtectedRoute><ClientEdit /></ProtectedRoute>} />
              <Route path="/engagements" element={<ProtectedRoute><Engagements /></ProtectedRoute>} />
              <Route path="/engagements/new" element={<ProtectedRoute><EngagementNew /></ProtectedRoute>} />
              <Route path="/engagements/:id" element={<ProtectedRoute><EngagementEdit /></ProtectedRoute>} />
              <Route path="/worksheets" element={<ProtectedRoute><WorksheetList /></ProtectedRoute>} />
              <Route path="/worksheets/new" element={<ProtectedRoute><WorksheetNew /></ProtectedRoute>} />
              <Route path="/worksheets/:id" element={<ProtectedRoute><WorksheetEdit /></ProtectedRoute>} />
              <Route path="/work-orders" element={<ProtectedRoute><WorkOrders /></ProtectedRoute>} />
              <Route path="/work-orders/new" element={<ProtectedRoute><WorkOrderNew /></ProtectedRoute>} />
              <Route path="/work-orders/:id" element={<ProtectedRoute><WorkOrderEdit /></ProtectedRoute>} />
              <Route path="/tracker" element={<ProtectedRoute><TrackerList /></ProtectedRoute>} />
              <Route path="/tracker/new" element={<ProtectedRoute><TrackerRecord /></ProtectedRoute>} />
              <Route path="/tracker/:id" element={<ProtectedRoute><TrackerRecord /></ProtectedRoute>} />
              <Route path="/timesheet" element={<ProtectedRoute><TimeSheet /></ProtectedRoute>} />
              <Route path="/timesheet/approvals" element={<ProtectedRoute><TimesheetApprovals /></ProtectedRoute>} />
              <Route path="/timesheet/approvals/:periodId" element={<ProtectedRoute><TimesheetApprovalDetail /></ProtectedRoute>} />
              <Route path="/expenses" element={<ProtectedRoute><Expenses /></ProtectedRoute>} />
              <Route path="/expenses/new" element={<ProtectedRoute><ExpenseNew /></ProtectedRoute>} />
              <Route path="/expenses/:id" element={<ProtectedRoute><ExpenseEdit /></ProtectedRoute>} />
              <Route path="/staff" element={<ProtectedRoute><Staff /></ProtectedRoute>} />
              <Route path="/staff/new" element={<ProtectedRoute><StaffNew /></ProtectedRoute>} />
              <Route path="/staff/:id" element={<ProtectedRoute><StaffEdit /></ProtectedRoute>} />
              <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
