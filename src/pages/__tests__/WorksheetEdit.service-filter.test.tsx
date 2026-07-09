import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render as customRender } from "@/test/utils";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * 0702-152 follow-up: optional service filter in the Work Matrix (worksheet).
 * - Default ("all") shows every category (on-screen total = WO total).
 * - Selecting a service narrows the visible rows only.
 * - The `cells` prop is never filtered, so hidden rows keep their hours on save.
 * - A "overall total" hint appears only when a filter is active.
 */

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Radix Select needs these in jsdom.
if (typeof Element !== "undefined") {
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
    Element.prototype.setPointerCapture = () => {};
    Element.prototype.releasePointerCapture = () => {};
  }
  Element.prototype.scrollIntoView = vi.fn();
}

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    useNavigate: () => vi.fn(),
    useParams: () => ({ id: "ws-1" }),
    useLocation: () => ({ pathname: "/worksheets/ws-1" }),
  };
});

vi.mock("@/components/layout/AppLayout", () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/hooks/usePageLeaveLock", () => ({
  usePageLeaveLock: () => ({ blocker: { state: "idle" }, allowNextNavigation: vi.fn() }),
}));

const mockUseWorksheetById = vi.fn();
vi.mock("@/hooks/useWorksheetData", () => ({
  useWorksheetById: (...args: unknown[]) => mockUseWorksheetById(...args),
}));

vi.mock("@/hooks/useWorksheetMutations", () => ({
  useBatchUpsertCells: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateWorksheet: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreateWorkOrderFromWorksheet: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

const AUD = "svc-aud";
const TAX = "svc-tax";

vi.mock("@/hooks/useEmsData", () => ({
  useCategories: () => ({
    data: [
      { category_id: "cat-aud-1", category_name: "Socio", service_id: AUD, display_order: 1 },
      { category_id: "cat-aud-2", category_name: "Gerente", service_id: AUD, display_order: 2 },
      { category_id: "cat-tax-1", category_name: "TaxSenior", service_id: TAX, display_order: 1 },
    ],
    isLoading: false,
  }),
  useActivityCodes: () => ({
    data: [{ activity_id: "act-1", activity_code: "AUD-A1", description: "x", is_active: true }],
    isLoading: false,
  }),
  useSetting: () => "0.13",
  useServices: () => ({
    data: [
      { service_id: AUD, name: "Auditoría", code: 1, is_active: true, allows_rates_activities: true, created_at: "" },
      { service_id: TAX, name: "Tax", code: 3, is_active: true, allows_rates_activities: true, created_at: "" },
    ],
  }),
}));

vi.mock("@/hooks/useUserRole", () => ({
  useUserRole: () => ({ isAdmin: true, isPartner: false, isDirector: false, isManager: false }),
}));

// Grid mock exposes the received `categories` (as rows) and the `cells` count.
vi.mock("@/components/worksheet/WorksheetGrid", () => ({
  WorksheetGrid: ({ categories, cells }: { categories: any[]; cells: any[] }) => (
    <div data-testid="worksheet-grid" data-cells={String(cells.length)}>
      {categories.map((c) => (
        <div key={c.category_id} data-testid={`row-${c.category_id}`}>
          {c.category_name}
        </div>
      ))}
    </div>
  ),
}));

vi.mock("@/components/worksheet/CopyFromEngagementDialog", () => ({
  CopyFromEngagementDialog: () => null,
}));

function makeWorksheet(overrides: object = {}) {
  return {
    id: "ws-1",
    status: "draft",
    wo_id: null as string | null,
    notes: "",
    work_order: null,
    engagement_id: "eng-1",
    engagement: {
      engagement_code: "TST-001",
      engagement_name: "Test Engagement",
      client: { client_legal_name: "Test Client", industry: null },
      partner: null,
      manager: null,
    },
    // One cell in Auditoría, one in Tax → overall total spans both services.
    cells: [
      { id: "c1", worksheet_id: "ws-1", category_id: "cat-aud-1", activity_id: "act-1", budget_hours: 5, created_at: "", updated_at: "" },
      { id: "c2", worksheet_id: "ws-1", category_id: "cat-tax-1", activity_id: "act-1", budget_hours: 3, created_at: "", updated_at: "" },
    ],
    ...overrides,
  };
}

import WorksheetEdit from "../WorksheetEdit";

describe("WorksheetEdit — service filter (0702-152)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseWorksheetById.mockReturnValue({ data: makeWorksheet(), isLoading: false });
  });

  it("defaults to showing categories from all services", () => {
    customRender(<WorksheetEdit />);
    expect(screen.getByTestId("row-cat-aud-1")).toBeInTheDocument();
    expect(screen.getByTestId("row-cat-aud-2")).toBeInTheDocument();
    expect(screen.getByTestId("row-cat-tax-1")).toBeInTheDocument();
    // No filter active → no overall-total hint.
    expect(screen.queryByTestId("worksheet-filtered-total-hint")).not.toBeInTheDocument();
  });

  it("filtering by a service narrows visible rows but keeps all cells", async () => {
    const user = userEvent.setup();
    customRender(<WorksheetEdit />);

    // Sanity: grid received all cells (both services).
    expect(screen.getByTestId("worksheet-grid")).toHaveAttribute("data-cells", "2");

    await user.click(screen.getByTestId("worksheet-service-filter"));
    await user.click(await screen.findByRole("option", { name: "Tax" }));

    await waitFor(() => expect(screen.queryByTestId("row-cat-aud-1")).not.toBeInTheDocument());
    expect(screen.queryByTestId("row-cat-aud-2")).not.toBeInTheDocument();
    expect(screen.getByTestId("row-cat-tax-1")).toBeInTheDocument();

    // The cells prop is unchanged (hidden rows' hours preserved for save).
    expect(screen.getByTestId("worksheet-grid")).toHaveAttribute("data-cells", "2");

    // Overall-total hint now visible.
    expect(screen.getByTestId("worksheet-filtered-total-hint")).toBeInTheDocument();
  });
});
