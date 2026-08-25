import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render as customRender } from "@/test/utils";
import { screen, waitFor, fireEvent } from "@testing-library/react";

/**
 * 0714-154: the Work Matrix must auto-scope to the engagement's service
 * (engagement.practica matched against services.code) instead of showing
 * every service with an optional manual filter (0702-152's contract, now
 * reversed).
 * - No manual "Filtrar por servicio" selector.
 * - Grid receives only categories/activities of the engagement's own service.
 * - 0825-183: unlike Timesheet/Tracker, global/system activities (ADM,
 *   practica_id === null) are NEVER included in the matrix — every cell must
 *   belong to the engagement's own practice.
 * - Save purges any stray out-of-service cell (wrong category, wrong-practice
 *   activity, or global/system activity).
 * - Applying a copy ignores out-of-service cells from the source worksheet.
 * - An engagement with no service (practica === null) shows an informational
 *   alert, no categories/activities, and purges every historical cell on save.
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

const mockBatchUpsertCells = vi.fn().mockResolvedValue({});
vi.mock("@/hooks/useWorksheetMutations", () => ({
  useBatchUpsertCells: () => ({ mutateAsync: mockBatchUpsertCells, isPending: false }),
  useUpdateWorksheet: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreateWorkOrderFromWorksheet: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

const AUD = "svc-aud";
const TAX = "svc-tax";

vi.mock("@/hooks/useEmsData", () => ({
  useCategories: () => ({
    data: [
      { category_id: "cat-aud-1", category_name: "Socio", practica_id: AUD, display_order: 1 },
      { category_id: "cat-aud-2", category_name: "Gerente", practica_id: AUD, display_order: 2 },
      { category_id: "cat-tax-1", category_name: "TaxSenior", practica_id: TAX, display_order: 1 },
    ],
    isLoading: false,
  }),
  useActivityCodes: () => ({
    data: [
      { activity_id: "act-global", activity_code: "ADM", description: "Administrative", is_active: true, practica_id: null, is_system: true, service: null },
      { activity_id: "act-aud-1", activity_code: "AUD-A1", description: "Aud activity", is_active: true, practica_id: AUD, is_system: false, service: { code: 1 } },
      { activity_id: "act-con-1", activity_code: "CON-A1", description: "Con activity", is_active: true, practica_id: "svc-con", is_system: false, service: { code: 2 } },
    ],
    isLoading: false,
  }),
  // Same set as useActivityCodes, but this is what the save/copy allow-list
  // scopes against directly (matrix filter reads practica_id/is_system, not
  // the nested service.code).
  useAllActivityCodes: () => ({
    data: [
      { activity_id: "act-global", activity_code: "ADM", description: "Administrative", is_active: true, practica_id: null, is_system: true },
      { activity_id: "act-aud-1", activity_code: "AUD-A1", description: "Aud activity", is_active: true, practica_id: AUD, is_system: false },
      { activity_id: "act-con-1", activity_code: "CON-A1", description: "Con activity", is_active: true, practica_id: "svc-con", is_system: false },
      // Inactive but still Auditoría-scoped: not shown in the grid (useActivityCodes
      // excludes it), but historical hours on it must survive a save (0825-183).
      { activity_id: "act-aud-inactive", activity_code: "AUD-A9", description: "Retired aud activity", is_active: false, practica_id: AUD, is_system: false },
    ],
    isLoading: false,
  }),
  useSetting: () => "0.13",
  useServices: () => ({
    data: [
      { practica_id: AUD, name: "Auditoría", code: 1, is_active: true, allows_rates_activities: true, created_at: "" },
      { practica_id: TAX, name: "Tax", code: 3, is_active: true, allows_rates_activities: true, created_at: "" },
    ],
  }),
}));

vi.mock("@/hooks/useUserRole", () => ({
  useUserRole: () => ({ isAdmin: true, isPartner: false, isDirector: false, isManager: false }),
}));
// Fase 5 migró canCreateWorkOrder de (isAdmin||isPartner||isDirector||isManager)
// a can("work_order.create"). useAuthorization llama a useAuth por dentro, así que
// sin este mock el render falla con "useAuth must be used within an AuthProvider".
// Con isAdmin: true el gate anterior daba true, así que can() => true lo replica.
vi.mock("@/hooks/useAuthorization", () => ({
  useAuthorization: () => ({
    // WorksheetEdit ahora exige poder ESCRIBIR la matriz para habilitar el grid:
    // roleKey admin o ser Socio/Gerente del encargo (espejo de is_admin() OR
    // is_engagement_team_member() del backend). Los fixtures de estos tests traen
    // partner/manager en null, asi que se usa la rama admin. `can()` se deja como
    // lo tenia cada test, que gatea otra cosa (crear OT desde la matriz).
    roleKey: "admin",
    can: () => true,
    scope: () => null,
    isLoading: false,
  }),
}));
// WorksheetEdit usa useCurrentStaff para resolver "soy Socio/Gerente de este
// encargo". useCurrentStaff llama a useAuth por dentro, asi que sin mock el render
// falla con "useAuth must be used within an AuthProvider".
vi.mock("@/hooks/useCurrentStaff", () => ({
  useCurrentStaff: () => ({ staffRecord: { staff_id: "staff-1" }, isLoading: false }),
}));


// Grid mock exposes the received `categories`/`activities` (as rows) and the
// `cells` count, plus a button to trigger a cell change.
vi.mock("@/components/worksheet/WorksheetGrid", () => ({
  WorksheetGrid: ({
    categories,
    activities,
    cells,
    onChange,
  }: {
    categories: any[];
    activities: any[];
    cells: any[];
    onChange: (categoryId: string, activityId: string, hours: number) => void;
  }) => (
    <div data-testid="worksheet-grid" data-cells={String(cells.length)}>
      {categories.map((c) => (
        <div key={c.category_id} data-testid={`row-${c.category_id}`}>
          {c.category_name}
        </div>
      ))}
      {activities.map((a) => (
        <div key={a.activity_id} data-testid={`activity-${a.activity_id}`}>
          {a.activity_code}
        </div>
      ))}
      <button
        data-testid="trigger-change"
        onClick={() => onChange("cat-aud-1", "act-aud-1", 5)}
      >
        change
      </button>
    </div>
  ),
}));

// Copy dialog mock exposes a button that applies a mix of in-scope and
// out-of-scope cells, so handleApplyCopy's filtering can be exercised.
vi.mock("@/components/worksheet/CopyFromEngagementDialog", () => ({
  CopyFromEngagementDialog: ({ onApply }: { onApply: (cells: any[]) => void }) => (
    <button
      data-testid="mock-apply-copy"
      onClick={() =>
        onApply([
          {
            id: "copy-1",
            worksheet_id: "src",
            category_id: "cat-aud-1",
            activity_id: "act-aud-1",
            budget_hours: 9,
            created_at: "",
            updated_at: "",
          },
          {
            id: "copy-2",
            worksheet_id: "src",
            category_id: "cat-tax-1",
            activity_id: "act-aud-1",
            budget_hours: 7,
            created_at: "",
            updated_at: "",
          },
          {
            id: "copy-3",
            worksheet_id: "src",
            category_id: "cat-aud-1",
            activity_id: "act-global",
            budget_hours: 4,
            created_at: "",
            updated_at: "",
          },
        ])
      }
    >
      Apply Copy
    </button>
  ),
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
      practica: 1,
      client: { client_legal_name: "Test Client", industry: null },
      partner: null,
      manager: null,
    },
    // One in-scope (Auditoría) cell, one out-of-scope category (Tax), one
    // out-of-scope activity (ADM/global, 0825-183), and one in-scope-but-now-
    // inactive activity (historical hours that must survive a save).
    cells: [
      { id: "c1", worksheet_id: "ws-1", category_id: "cat-aud-1", activity_id: "act-aud-1", budget_hours: 5, created_at: "", updated_at: "" },
      { id: "c2", worksheet_id: "ws-1", category_id: "cat-tax-1", activity_id: "act-aud-1", budget_hours: 3, created_at: "", updated_at: "" },
      { id: "c3", worksheet_id: "ws-1", category_id: "cat-aud-1", activity_id: "act-global", budget_hours: 2, created_at: "", updated_at: "" },
      { id: "c4", worksheet_id: "ws-1", category_id: "cat-aud-1", activity_id: "act-aud-inactive", budget_hours: 4, created_at: "", updated_at: "" },
    ],
    ...overrides,
  };
}

import WorksheetEdit from "../WorksheetEdit";

describe("WorksheetEdit — service scope (0714-154)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBatchUpsertCells.mockResolvedValue({});
    mockUseWorksheetById.mockReturnValue({ data: makeWorksheet(), isLoading: false });
  });

  it("does not render the manual service filter or filtered-total hint", () => {
    customRender(<WorksheetEdit />);
    expect(screen.queryByTestId("worksheet-service-filter")).not.toBeInTheDocument();
    expect(screen.queryByTestId("worksheet-filtered-total-hint")).not.toBeInTheDocument();
  });

  it("shows only categories belonging to the engagement's service", () => {
    customRender(<WorksheetEdit />);
    expect(screen.getByTestId("row-cat-aud-1")).toBeInTheDocument();
    expect(screen.getByTestId("row-cat-aud-2")).toBeInTheDocument();
    expect(screen.queryByTestId("row-cat-tax-1")).not.toBeInTheDocument();
  });

  it("0825-183: shows only the engagement's own practice activities, excluding ADM/global/other-service ones", () => {
    customRender(<WorksheetEdit />);
    expect(screen.queryByTestId("activity-act-global")).not.toBeInTheDocument();
    expect(screen.getByTestId("activity-act-aud-1")).toBeInTheDocument();
    expect(screen.queryByTestId("activity-act-con-1")).not.toBeInTheDocument();
  });

  it("purges out-of-service cells on save", async () => {
    customRender(<WorksheetEdit />);

    fireEvent.click(screen.getByTestId("trigger-change"));

    const saveButton = screen.getByRole("button", { name: /common.save/ });
    await waitFor(() => expect(saveButton).toBeEnabled());
    fireEvent.click(saveButton);

    await waitFor(() => expect(mockBatchUpsertCells).toHaveBeenCalled());

    const payload = mockBatchUpsertCells.mock.calls[0][0];
    const outOfScope = payload.cells.find(
      (c: any) => c.category_id === "cat-tax-1" && c.activity_id === "act-aud-1"
    );
    expect(outOfScope).toBeUndefined();

    const inScope = payload.cells.find(
      (c: any) => c.category_id === "cat-aud-1" && c.activity_id === "act-aud-1"
    );
    expect(inScope).toBeDefined();
    expect(inScope.budget_hours).toBe(5);

    // 0825-183: the pre-existing ADM/global cell (c3) must also be purged.
    const globalActivityCell = payload.cells.find(
      (c: any) => c.activity_id === "act-global"
    );
    expect(globalActivityCell).toBeUndefined();

    // 0825-183: an inactive-but-still-Auditoría activity (c4) is not shown in the
    // grid but must be preserved on save (historical hours).
    const inactiveInScope = payload.cells.find(
      (c: any) => c.activity_id === "act-aud-inactive"
    );
    expect(inactiveInScope).toBeDefined();
    expect(inactiveInScope.budget_hours).toBe(4);
  });

  it("ignores out-of-service cells when applying a copy", async () => {
    customRender(<WorksheetEdit />);

    fireEvent.click(screen.getByRole("button", { name: /workMatrix.copyFromEngagement/ }));
    fireEvent.click(await screen.findByTestId("mock-apply-copy"));

    const saveButton = screen.getByRole("button", { name: /common.save/ });
    await waitFor(() => expect(saveButton).toBeEnabled());
    fireEvent.click(saveButton);

    await waitFor(() => expect(mockBatchUpsertCells).toHaveBeenCalled());

    const payload = mockBatchUpsertCells.mock.calls[0][0];
    const copiedOutOfScope = payload.cells.find(
      (c: any) => c.category_id === "cat-tax-1" && c.budget_hours === 7
    );
    expect(copiedOutOfScope).toBeUndefined();

    const copiedInScope = payload.cells.find(
      (c: any) => c.category_id === "cat-aud-1" && c.activity_id === "act-aud-1"
    );
    expect(copiedInScope).toBeDefined();
    expect(copiedInScope.budget_hours).toBe(9);

    // 0825-183: a copied cell targeting the ADM/global activity must also be ignored.
    const copiedGlobalActivity = payload.cells.find(
      (c: any) => c.activity_id === "act-global"
    );
    expect(copiedGlobalActivity).toBeUndefined();
  });

  it("shows an informational alert and no categories when the engagement has no service", () => {
    mockUseWorksheetById.mockReturnValue({
      data: makeWorksheet({
        engagement: {
          engagement_code: "TST-002",
          engagement_name: "No Service Engagement",
          practica: null,
          client: { client_legal_name: "Test Client", industry: null },
          partner: null,
          manager: null,
        },
      }),
      isLoading: false,
    });

    customRender(<WorksheetEdit />);

    expect(screen.getByTestId("worksheet-no-service-alert")).toBeInTheDocument();
    expect(screen.queryByTestId("row-cat-aud-1")).not.toBeInTheDocument();
    expect(screen.queryByTestId("worksheet-grid")).not.toBeInTheDocument();
  });

  it("0825-183: purges every historical cell on save when the engagement has no service", async () => {
    mockUseWorksheetById.mockReturnValue({
      data: makeWorksheet({
        engagement: {
          engagement_code: "TST-002",
          engagement_name: "No Service Engagement",
          practica: null,
          client: { client_legal_name: "Test Client", industry: null },
          partner: null,
          manager: null,
        },
      }),
      isLoading: false,
    });

    customRender(<WorksheetEdit />);

    // The grid/copy button are hidden for a no-service engagement, so notes
    // are the only way to produce an unsaved change and exercise Save.
    fireEvent.change(screen.getByPlaceholderText("workMatrix.notesPlaceholder"), {
      target: { value: "updated notes" },
    });

    const saveButton = screen.getByRole("button", { name: /common.save/ });
    await waitFor(() => expect(saveButton).toBeEnabled());
    fireEvent.click(saveButton);

    await waitFor(() => expect(mockBatchUpsertCells).toHaveBeenCalled());

    const payload = mockBatchUpsertCells.mock.calls[0][0];
    expect(payload.cells).toEqual([]);
  });
});
