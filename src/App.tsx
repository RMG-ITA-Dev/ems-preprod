import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { LanguageSync } from "@/components/LanguageSync";
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
import Staff from "./pages/Staff";
import StaffNew from "./pages/StaffNew";
import StaffEdit from "./pages/StaffEdit";
import Settings from "./pages/Settings";
import AdminTimeEntries from "./pages/admin/TimeEntries";
import AdminExpenseLogs from "./pages/admin/ExpenseLogs";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AuthProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <LanguageSync />
          <Routes>
            <Route path="/auth" element={<Auth />} />
            <Route path="/" element={<ProtectedRoute><Index /></ProtectedRoute>} />
            <Route path="/clients" element={<ProtectedRoute><Clients /></ProtectedRoute>} />
            <Route path="/clients/new" element={<ProtectedRoute><ClientNew /></ProtectedRoute>} />
            <Route path="/clients/:id" element={<ProtectedRoute><ClientEdit /></ProtectedRoute>} />
            <Route path="/engagements" element={<ProtectedRoute><Engagements /></ProtectedRoute>} />
            <Route path="/engagements/new" element={<ProtectedRoute><EngagementNew /></ProtectedRoute>} />
            <Route path="/engagements/:id" element={<ProtectedRoute><EngagementEdit /></ProtectedRoute>} />
            <Route path="/work-orders" element={<ProtectedRoute><WorkOrders /></ProtectedRoute>} />
            <Route path="/work-orders/new" element={<ProtectedRoute><WorkOrderNew /></ProtectedRoute>} />
            <Route path="/work-orders/:id" element={<ProtectedRoute><WorkOrderEdit /></ProtectedRoute>} />
            <Route path="/timesheet" element={<ProtectedRoute><TimeSheet /></ProtectedRoute>} />
            <Route path="/expenses" element={<ProtectedRoute><Expenses /></ProtectedRoute>} />
            <Route path="/staff" element={<ProtectedRoute><Staff /></ProtectedRoute>} />
            <Route path="/staff/new" element={<ProtectedRoute><StaffNew /></ProtectedRoute>} />
            <Route path="/staff/:id" element={<ProtectedRoute><StaffEdit /></ProtectedRoute>} />
            <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
            <Route path="/admin/time-entries" element={<ProtectedRoute><AdminTimeEntries /></ProtectedRoute>} />
            <Route path="/admin/expense-logs" element={<ProtectedRoute><AdminExpenseLogs /></ProtectedRoute>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
