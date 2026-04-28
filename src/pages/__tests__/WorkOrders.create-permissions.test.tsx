import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: "en" } }),
}));

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate, useSearchParams: () => [new URLSearchParams()] };
});

let mockRole = {
  isAdmin: false, isPartner: false, isDirector: false,
  isManager: false, isLoading: false,
};
vi.mock("@/hooks/useUserRole", () => ({ useUserRole: () => mockRole }));

vi.mock("@/hooks/useEmsData", () => ({
  useWorkOrders: () => ({ data: [], isLoading: false }),
  useEngagements: () => ({ data: [], isLoading: false }),
  useCategories: () => ({ data: [] }),
  useSetting: () => "0.13",
}));
vi.mock("@/hooks/useCategoryStaff", () => ({
  useCategoryStaff: () => ({ partnerOptions: [], managerOptions: [] }),
}));
vi.mock("@/hooks/useMobile", () => ({ useIsMobile: () => false }));
vi.mock("@/components/ui/button", () => ({
  Button: ({ children, onClick, disabled }: any) => <button onClick={onClick} disabled={disabled}>{children}</button>,
  buttonVariants: () => "",
}));
vi.mock("@/components/ui/input", () => ({ Input: (props: any) => <input {...props} /> }));
vi.mock("@/components/ui/label", () => ({ Label: ({ children }: any) => <label>{children}</label> }));
vi.mock("@/components/ui/alert", () => ({
  Alert: ({ children }: any) => <div>{children}</div>,
  AlertDescription: ({ children }: any) => <div>{children}</div>,
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("lucide-react", () => new Proxy({}, { get: (_t, k) => k === "__esModule" ? true : () => null }));
vi.mock("@/hooks/useWorksheetData", () => ({
  useWorksheetByEngagementId: () => ({ data: null }),
}));
vi.mock("@/hooks/mutations", () => ({
  useCreateWorkOrder: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreateBudgetLine: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreateExpenseBudget: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/usePageLeaveLock", () => ({
  usePageLeaveLock: () => ({ blocker: { state: "unblocked" as const }, allowNextNavigation: vi.fn() }),
}));
vi.mock("@/components/layout/AppLayout", () => ({
  AppLayout: ({ children }: any) => <div>{children}</div>,
}));
vi.mock("@/components/forms/WorkOrderForm", () => ({
  WorkOrderForm: () => <div data-testid="work-order-form" />,
}));
vi.mock("@/components/ui/leave-page-dialog", () => ({ LeavePageDialog: () => null }));
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), debug: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

// Mock heavy shadcn components used by WorkOrders desktop table to avoid heap OOM
vi.mock("@/components/ui/table", () => ({
  Table: ({ children }: any) => <table>{children}</table>,
  TableHeader: ({ children }: any) => <thead>{children}</thead>,
  TableBody: ({ children }: any) => <tbody>{children}</tbody>,
  TableRow: ({ children }: any) => <tr>{children}</tr>,
  TableHead: ({ children }: any) => <th>{children}</th>,
  TableCell: ({ children }: any) => <td>{children}</td>,
}));
vi.mock("@/components/ui/tabs", () => ({
  Tabs: ({ children }: any) => <div>{children}</div>,
  TabsList: ({ children }: any) => <div>{children}</div>,
  TabsTrigger: ({ children, value }: any) => <button value={value}>{children}</button>,
}));
vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: any) => <>{children}</>,
  TooltipProvider: ({ children }: any) => <>{children}</>,
  TooltipTrigger: ({ children, asChild }: any) => asChild ? <>{children}</> : <span>{children}</span>,
  TooltipContent: ({ children }: any) => <div>{children}</div>,
}));
vi.mock("@/components/ui/collapsible", () => ({
  Collapsible: ({ children }: any) => <div>{children}</div>,
  CollapsibleTrigger: ({ children }: any) => <button>{children}</button>,
  CollapsibleContent: ({ children }: any) => <div>{children}</div>,
}));
vi.mock("@/components/ui/skeleton", () => ({
  Skeleton: () => <div data-testid="skeleton" />,
}));
vi.mock("@/components/ui/popover", () => ({
  Popover: ({ children }: any) => <div>{children}</div>,
  PopoverTrigger: ({ children }: any) => <>{children}</>,
  PopoverContent: ({ children }: any) => <div>{children}</div>,
}));
vi.mock("@/components/ui/select", () => ({
  Select: ({ children }: any) => <div>{children}</div>,
  SelectTrigger: ({ children }: any) => <button>{children}</button>,
  SelectValue: () => null,
  SelectContent: ({ children }: any) => <div>{children}</div>,
  SelectItem: ({ children, value }: any) => <div data-value={value}>{children}</div>,
}));
vi.mock("@/components/ui/card", () => ({
  Card: ({ children, className, onClick }: any) => <div className={className} onClick={onClick}>{children}</div>,
  CardContent: ({ children, className }: any) => <div className={className}>{children}</div>,
  CardHeader: ({ children }: any) => <div>{children}</div>,
  CardTitle: ({ children }: any) => <div>{children}</div>,
  CardDescription: ({ children }: any) => <div>{children}</div>,
}));
vi.mock("@/components/ui/alert-dialog", () => ({
  AlertDialog: ({ children }: any) => <div>{children}</div>,
  AlertDialogContent: ({ children }: any) => <div>{children}</div>,
  AlertDialogHeader: ({ children }: any) => <div>{children}</div>,
  AlertDialogTitle: ({ children }: any) => <div>{children}</div>,
  AlertDialogDescription: ({ children }: any) => <div>{children}</div>,
  AlertDialogFooter: ({ children }: any) => <div>{children}</div>,
  AlertDialogAction: ({ children, onClick }: any) => <button onClick={onClick}>{children}</button>,
  AlertDialogCancel: ({ children }: any) => <button>{children}</button>,
}));

import WorkOrders from "../WorkOrders";
import WorkOrderNew from "../WorkOrderNew";

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe("WorkOrders — create button permissions (0306-75)", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it.each([
    ["admin",    { isAdmin: true,  isPartner: false, isDirector: false, isManager: false, isLoading: false }],
    ["partner",  { isAdmin: false, isPartner: true,  isDirector: false, isManager: false, isLoading: false }],
    ["director", { isAdmin: false, isPartner: false, isDirector: true,  isManager: false, isLoading: false }],
    ["manager",  { isAdmin: false, isPartner: false, isDirector: false, isManager: true,  isLoading: false }],
  ])("shows 'Nueva Orden de Trabajo' button for %s", (_name, role) => {
    mockRole = role;
    wrap(<WorkOrders />);
    expect(screen.getByText("workOrders.newWorkOrder")).toBeInTheDocument();
  });

  it.each([
    ["senior",     { isAdmin: false, isPartner: false, isDirector: false, isManager: false, isLoading: false }],
    ["semisenior", { isAdmin: false, isPartner: false, isDirector: false, isManager: false, isLoading: false }],
    ["staff",      { isAdmin: false, isPartner: false, isDirector: false, isManager: false, isLoading: false }],
    ["viewer",     { isAdmin: false, isPartner: false, isDirector: false, isManager: false, isLoading: false }],
  ])("hides 'Nueva Orden de Trabajo' button for %s", (_name, role) => {
    mockRole = role;
    wrap(<WorkOrders />);
    expect(screen.queryByText("workOrders.newWorkOrder")).not.toBeInTheDocument();
  });
});

describe("WorkOrderNew — redirect guard (0306-75)", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("redirects staff to /work-orders after role loads", () => {
    mockRole = { isAdmin: false, isPartner: false, isDirector: false, isManager: false, isLoading: false };
    wrap(<WorkOrderNew />);
    expect(mockNavigate).toHaveBeenCalledWith("/work-orders", { replace: true });
  });

  it("does not redirect manager", () => {
    mockRole = { isAdmin: false, isPartner: false, isDirector: false, isManager: true, isLoading: false };
    wrap(<WorkOrderNew />);
    expect(mockNavigate).not.toHaveBeenCalledWith("/work-orders", { replace: true });
  });

  it("does not redirect while role is still loading", () => {
    mockRole = { isAdmin: false, isPartner: false, isDirector: false, isManager: false, isLoading: true };
    wrap(<WorkOrderNew />);
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
