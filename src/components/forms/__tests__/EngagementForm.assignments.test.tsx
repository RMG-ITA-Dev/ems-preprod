import React from "react";
import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { render, screen, fireEvent, waitFor } from "@/test/utils";

/**
 * Fase 5 (bugs/scheduler/fase_5/plan_v2.md §6): EngagementForm integrates
 * StaffAssignmentsCard for a persisted Engagement only, keeps a combined dirty state, and never
 * runs the assignments save inside its own submit. StaffAssignmentsCard itself is stubbed here
 * (its own internals — grid, RPC diff, validation — are covered by StaffAssignmentsCard.test.tsx);
 * this file only exercises the EngagementForm-level integration contract.
 */

beforeAll(() => {
  class MockResizeObserver {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  }
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = MockResizeObserver;
});

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});
const mockNavigate = vi.fn();

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: "en" } }),
}));

// Includes the client referenced by mockEngagement so the client Select can resolve a matching
// SelectItem for full-submit tests (Radix Select can't retain a `value` that has no
// corresponding item, which otherwise silently clears the field and fails zod validation —
// same gotcha documented in EngagementForm.code-generation.test.tsx).
const stableClients = [{ client_id: "client-1", client_legal_name: "Test Client", is_active: true }];
const stableServices: never[] = [];
const stableTaxonomies: never[] = [];
vi.mock("@/hooks/useEmsData", () => ({
  useClients: () => ({ data: stableClients }),
  useServices: () => ({ data: stableServices }),
  useTaxonomies: () => ({ data: stableTaxonomies }),
}));

vi.mock("@/hooks/useCategoryStaff", () => ({
  useCategoryStaff: () => ({
    partners: [],
    partnerOptions: [],
    managerOptions: [],
    allActiveStaff: [],
    hasPartnerCategory: true,
    hasManagerCategory: true,
  }),
}));

const mockUpdateMutateAsync = vi.fn().mockResolvedValue(undefined);
vi.mock("@/hooks/mutations", () => ({
  useCreateEngagement: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateEngagement: () => ({ mutateAsync: mockUpdateMutateAsync, isPending: false }),
  useDeleteEngagement: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock("@/hooks/useUserRole", () => ({
  useUserRole: () => ({ isAdmin: false }),
}));

vi.mock("@/hooks/useCurrentStaff", () => ({
  useCurrentStaff: () => ({ staffRecord: null }),
}));

// Stub the card: isolates the EngagementForm-level contract (render gate, combined dirty,
// no-navigate-while-dirty) from the card's own internals.
let capturedOnDirtyChange: ((dirty: boolean) => void) | null = null;
const mockSaveAssignmentsFromCard = vi.fn();
vi.mock("@/components/engagements/StaffAssignmentsCard", () => ({
  StaffAssignmentsCard: ({ onDirtyChange }: { onDirtyChange?: (dirty: boolean) => void }) => {
    capturedOnDirtyChange = onDirtyChange ?? null;
    return (
      <div data-testid="staff-assignments-card-stub">
        <button type="button" onClick={() => onDirtyChange?.(true)}>
          stub-make-dirty
        </button>
        <button
          type="button"
          onClick={() => {
            mockSaveAssignmentsFromCard();
            onDirtyChange?.(false);
          }}
        >
          stub-save
        </button>
      </div>
    );
  },
}));

import { EngagementForm } from "@/components/forms/EngagementForm";
import type { Engagement } from "@/hooks/useEmsData";

const mockEngagement: Engagement = {
  engagement_id: "eng-1",
  client_id: "client-1",
  engagement_name: "Audit FY2027",
  engagement_code: "2027.121.001",
  partner_id: "staff-1",
  manager_id: "staff-2",
  status: "active",
  start_date: "2026-10-01",
  end_date: "2027-09-30",
  created_at: "2026-05-22T00:00:00Z",
  work_order_required: true,
  activity_required: true,
  is_internal: false,
  approval_required: true,
  oficina: 1,
  practica: 2,
  funcion: 1,
  anio_fiscal: 2027,
  fecha_cierre: "2026-09-30",
  anio_fiscal_override: false,
  sqr_id: null,
  encargado_id: null,
  specialist_it_id: null,
  specialist_tax_id: null,
  taxonomy_id: "tx-1",
  contract_file_path: null,
};

describe("EngagementForm — Fase 5 assignments integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedOnDirtyChange = null;
    mockUpdateMutateAsync.mockResolvedValue(undefined);
  });

  it("does NOT render StaffAssignmentsCard in creation — shows an 'available after save' note instead", () => {
    render(<EngagementForm />);
    expect(screen.queryByTestId("staff-assignments-card-stub")).not.toBeInTheDocument();
    expect(screen.getByText("engagement.assignments.availableAfterSave")).toBeInTheDocument();
  });

  it("renders StaffAssignmentsCard for a persisted engagement (edit mode)", () => {
    render(<EngagementForm engagement={mockEngagement} />);
    expect(screen.getByTestId("staff-assignments-card-stub")).toBeInTheDocument();
    expect(screen.queryByText("engagement.assignments.availableAfterSave")).not.toBeInTheDocument();
  });

  it("combined dirty: assignments-only dirty is reported to the parent via onDirtyChange", () => {
    const onDirtyChange = vi.fn();
    render(<EngagementForm engagement={mockEngagement} onDirtyChange={onDirtyChange} />);
    onDirtyChange.mockClear();

    fireEvent.click(screen.getByText("stub-make-dirty"));

    expect(onDirtyChange).toHaveBeenCalledWith(true);
  });

  it("the main submit never invokes the card's own save action", async () => {
    render(<EngagementForm engagement={mockEngagement} />);
    fireEvent.click(screen.getByRole("button", { name: "common.saveChanges" }));
    await waitFor(() => expect(mockUpdateMutateAsync).toHaveBeenCalled());
    expect(mockSaveAssignmentsFromCard).not.toHaveBeenCalled();
  });

  it("header Save does NOT navigate while assignments are dirty — it resets only the form baseline and shows a pending-changes notice", async () => {
    const onSaveSuccess = vi.fn();
    render(<EngagementForm engagement={mockEngagement} onSaveSuccess={onSaveSuccess} />);

    fireEvent.click(screen.getByText("stub-make-dirty"));
    fireEvent.click(screen.getByRole("button", { name: "common.saveChanges" }));

    await waitFor(() => expect(mockUpdateMutateAsync).toHaveBeenCalled());
    expect(onSaveSuccess).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("header Save DOES navigate when assignments are clean (unchanged behavior)", async () => {
    const onSaveSuccess = vi.fn();
    render(<EngagementForm engagement={mockEngagement} onSaveSuccess={onSaveSuccess} />);

    fireEvent.click(screen.getByRole("button", { name: "common.saveChanges" }));

    await waitFor(() => expect(mockUpdateMutateAsync).toHaveBeenCalled());
    await waitFor(() => expect(onSaveSuccess).toHaveBeenCalled());
  });

  it("saving assignments from the card clears the pending state without touching the main form", () => {
    render(<EngagementForm engagement={mockEngagement} />);
    fireEvent.click(screen.getByText("stub-make-dirty"));
    fireEvent.click(screen.getByText("stub-save"));
    expect(mockSaveAssignmentsFromCard).toHaveBeenCalledTimes(1);
    expect(mockUpdateMutateAsync).not.toHaveBeenCalled();
  });
});
