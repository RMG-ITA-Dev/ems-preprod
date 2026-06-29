import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@/test/utils";
import { fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * 0625-149: EngagementForm — catalog-driven practica select.
 * Verifies active-only options in create mode and name resolution in edit mode.
 *
 * 0625-148: role-based service restriction.
 * Non-admins get Auditoría (code=1) auto-assigned; select is disabled.
 */

// Radix Select requires pointer-capture and scroll APIs in JSDOM
if (typeof (globalThis as any).PointerEvent === "undefined") {
  (globalThis as any).PointerEvent = MouseEvent;
}
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
}
if (!Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = () => {};
}
if (!Element.prototype.releasePointerCapture) {
  Element.prototype.releasePointerCapture = () => {};
}
// JSDOM defines scrollIntoView as non-callable; override unconditionally
Element.prototype.scrollIntoView = () => {};
// Radix Switch (admin section) uses ResizeObserver — polyfill for JSDOM
if (typeof (globalThis as any).ResizeObserver === "undefined") {
  (globalThis as any).ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => vi.fn() };
});

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: "en" } }),
}));

const mockServices = [
  { service_id: "s1", name: "Auditoría",         code: 1, allows_rates_activities: true,  is_active: true,  created_at: "" },
  { service_id: "s2", name: "Tax",               code: 3, allows_rates_activities: true,  is_active: true,  created_at: "" },
  { service_id: "s3", name: "Firmwide (inactivo)", code: 0, allows_rates_activities: false, is_active: false, created_at: "" },
];

// Module-level controllable create mock (Review 2 — test #5)
const mockCreateMutateAsync = vi.fn();

vi.mock("@/hooks/useEmsData", () => ({
  useClients:  () => ({ data: [
    { client_id: "c1", client_legal_name: "Acme Corp", is_active: true },
  ] }),
  useServices: () => ({ data: mockServices }),
}));

vi.mock("@/hooks/useCategoryStaff", () => ({
  useCategoryStaff: () => ({
    partners: [{ staff_id: "p1", first_name: "Juan", last_name: "Partner" }],
    managerOptions: [{ value: "m1", label: "Ana Manager" }],
    hasPartnerCategory: true,
    hasManagerCategory: true,
  }),
}));

vi.mock("@/hooks/mutations", () => ({
  useCreateEngagement: () => ({ mutateAsync: mockCreateMutateAsync, isPending: false }),
  useUpdateEngagement: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteEngagement: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock("@/hooks/useUserRole", () => ({ useUserRole: vi.fn() }));

// Mock Calendar with a simple date input so date fields can be set via fireEvent (Review 2)
vi.mock("@/components/ui/calendar", () => ({
  Calendar: ({ onSelect }: any) => (
    <input
      data-testid="calendar-mock"
      type="date"
      onChange={(e) => e.target.value && onSelect(new Date(e.target.value + "T12:00:00"))}
    />
  ),
}));

// Mock Popover to always render its children so Calendar inputs are reachable (Review 2)
vi.mock("@/components/ui/popover", () => ({
  Popover:        ({ children }: any) => <>{children}</>,
  PopoverTrigger: ({ children }: any) => <>{children}</>,
  PopoverContent: ({ children }: any) => <>{children}</>,
}));

// Minimal EngagementCreatedDialog mock — renders the "crear otro" button when open (Review 2)
vi.mock("@/components/forms/EngagementCreatedDialog", () => ({
  EngagementCreatedDialog: ({ open, onCreateAnother }: any) =>
    open ? (
      <button type="button" onClick={onCreateAnother}>
        engagement.createAnother
      </button>
    ) : null,
}));

import { useUserRole } from "@/hooks/useUserRole";
import { EngagementForm } from "@/components/forms/EngagementForm";
import type { Engagement } from "@/hooks/useEmsData";

// Edit-mode engagement whose service (code=0) is now inactive
const mockEngagementInactiveService: Engagement = {
  engagement_id:       "eng-test-2",
  client_id:           "client-1",
  engagement_name:     "Old Firmwide Audit",
  engagement_code:     "2026.011.002",
  partner_id:          null,
  manager_id:          null,
  status:              "active",
  start_date:          "2025-10-01",
  end_date:            "2026-09-30",
  created_at:          "2025-10-01T00:00:00Z",
  work_order_required: true,
  activity_required:   true,
  is_internal:         false,
  approval_required:   true,
  oficina:             0,
  practica:            0,
  funcion:             1,
  anio_fiscal:         2026,
};

describe("EngagementForm — catalog-driven practica (0625-149)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useUserRole).mockReturnValue({ isAdmin: false, isLoading: false } as any);
  });

  it("renders the practica select label in create mode", () => {
    render(<EngagementForm />);
    expect(screen.getByText("engagement.practica *")).toBeInTheDocument();
  });

  it("code-preview block still present in create mode", () => {
    render(<EngagementForm />);
    expect(screen.getByTestId("engagement-code-preview")).toBeInTheDocument();
  });

  it("in edit mode code is read-only (disabled input)", () => {
    render(<EngagementForm engagement={mockEngagementInactiveService} />);
    const codeInput = screen.getByTestId("engagement-code-readonly");
    expect(codeInput).toBeDisabled();
    expect(codeInput).toHaveValue("2026.011.002");
  });

  it("in edit mode inactive service name is resolved and shown in the disabled select", () => {
    render(<EngagementForm engagement={mockEngagementInactiveService} />);
    // practica=0 maps to "Firmwide (inactivo)" — resolved from full service list.
    // Radix renders the selected label in both the visible trigger span and a hidden
    // native <select>, so getAllByText returns multiple nodes — at least one must be present.
    expect(screen.getAllByText("Firmwide (inactivo)").length).toBeGreaterThan(0);
  });

  it("create mode: opening the practica select shows only active services", async () => {
    vi.mocked(useUserRole).mockReturnValue({ isAdmin: true, isLoading: false } as any);
    const user = userEvent.setup();
    render(<EngagementForm />);

    // Find the practica select trigger via its label
    const practica = screen.getByLabelText(/engagement\.practica/);
    await user.click(practica);

    await waitFor(() => {
      expect(screen.getByRole("option", { name: "Auditoría" })).toBeInTheDocument();
      expect(screen.getByRole("option", { name: "Tax" })).toBeInTheDocument();
      expect(screen.queryByRole("option", { name: "Firmwide (inactivo)" })).not.toBeInTheDocument();
    });
  });

  it("selecting an active service in create mode stores its numeric code", async () => {
    vi.mocked(useUserRole).mockReturnValue({ isAdmin: true, isLoading: false } as any);
    const user = userEvent.setup();
    render(<EngagementForm />);

    const practica = screen.getByLabelText(/engagement\.practica/);
    await user.click(practica);

    // Select "Auditoría" (code=1)
    await waitFor(() => screen.getByRole("option", { name: "Auditoría" }));
    await user.click(screen.getByRole("option", { name: "Auditoría" }));

    // After selection the trigger should reflect the chosen service name
    await waitFor(() => {
      expect(practica).toHaveTextContent("Auditoría");
    });
  });
});

describe("0625-148 — role-based service restriction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useUserRole).mockReturnValue({ isAdmin: false, isLoading: false } as any);
  });

  it("non-admin: practica select is visible but disabled", async () => {
    render(<EngagementForm />);
    const practica = screen.getByLabelText(/engagement\.practica/);
    await waitFor(() => {
      expect(practica).toBeDisabled();
    });
  });

  it("non-admin: practica is auto-set to Auditoría without user interaction", async () => {
    render(<EngagementForm />);
    const practica = screen.getByLabelText(/engagement\.practica/);
    await waitFor(() => {
      expect(practica).toHaveTextContent("Auditoría");
    });
  });

  // Review 1: fill oficina + funcion, then assert preview text pins practica digit to 1
  it("non-admin: code preview uses digit 1 for practica once other fields filled", async () => {
    const user = userEvent.setup();
    render(<EngagementForm />);

    // Wait for practica auto-assignment (code=1 → "Auditoría")
    const practica = screen.getByLabelText(/engagement\.practica/);
    await waitFor(() => expect(practica).toHaveTextContent("Auditoría"));

    // Select oficina = Ambos (value 0)
    const oficina = screen.getByLabelText(/engagement\.oficina/);
    await user.click(oficina);
    await waitFor(() => screen.getByRole("option", { name: "engagement.oficina_ambos" }));
    await user.click(screen.getByRole("option", { name: "engagement.oficina_ambos" }));

    // Select funcion = funcion_cli (value 1)
    const funcion = screen.getByLabelText(/engagement\.funcion/);
    await user.click(funcion);
    await waitFor(() => screen.getByRole("option", { name: "engagement.funcion_cli" }));
    await user.click(screen.getByRole("option", { name: "engagement.funcion_cli" }));

    // anio_fiscal is auto-defaulted; oficina=0, practica=1, funcion=1 → "YYYY.011.---"
    const preview = screen.getByTestId("engagement-code-preview");
    await waitFor(() => {
      expect(preview).toHaveTextContent(/\d{4}\.011\.---/);
    });
  });

  it("admin: practica select is enabled", async () => {
    vi.mocked(useUserRole).mockReturnValue({ isAdmin: true, isLoading: false } as any);
    render(<EngagementForm />);
    const practica = screen.getByLabelText(/engagement\.practica/);
    await waitFor(() => {
      expect(practica).not.toBeDisabled();
    });
  });

  // Review 2: wire create mutation, submit a valid form, click "crear otro", assert reset state
  it("non-admin 'crear otro': after reset, practica shows Auditoría and select is disabled", async () => {
    const user = userEvent.setup();
    mockCreateMutateAsync.mockResolvedValue({ engagement_code: "2026.011.001" });

    render(<EngagementForm />);

    // Fill engagement name (min 5 chars)
    await user.type(screen.getByLabelText(/engagement\.name/), "Test Engagement Alpha");

    // Select client
    const clientSelect = screen.getByLabelText(/engagement\.client/);
    await user.click(clientSelect);
    await waitFor(() => screen.getByRole("option", { name: "Acme Corp" }));
    await user.click(screen.getByRole("option", { name: "Acme Corp" }));

    // Select partner
    const partnerSelect = screen.getByLabelText(/engagement\.partner/);
    await user.click(partnerSelect);
    await waitFor(() => screen.getByRole("option", { name: "Juan Partner" }));
    await user.click(screen.getByRole("option", { name: "Juan Partner" }));

    // Select manager
    const managerSelect = screen.getByLabelText(/engagement\.manager/);
    await user.click(managerSelect);
    await waitFor(() => screen.getByRole("option", { name: "Ana Manager" }));
    await user.click(screen.getByRole("option", { name: "Ana Manager" }));

    // Set start and end dates via the mocked Calendar inputs (always visible via Popover mock)
    const calendars = screen.getAllByTestId("calendar-mock");
    fireEvent.change(calendars[0], { target: { value: "2026-10-01" } });
    fireEvent.change(calendars[1], { target: { value: "2027-09-30" } });

    // Select oficina (Ambos = 0)
    const oficina = screen.getByLabelText(/engagement\.oficina/);
    await user.click(oficina);
    await waitFor(() => screen.getByRole("option", { name: "engagement.oficina_ambos" }));
    await user.click(screen.getByRole("option", { name: "engagement.oficina_ambos" }));

    // Select funcion (funcion_cli = 1)
    const funcion = screen.getByLabelText(/engagement\.funcion/);
    await user.click(funcion);
    await waitFor(() => screen.getByRole("option", { name: "engagement.funcion_cli" }));
    await user.click(screen.getByRole("option", { name: "engagement.funcion_cli" }));

    // practica is auto-assigned to Auditoría; submit
    await user.click(screen.getByText("engagement.createEngagement"));

    // EngagementCreatedDialog mock renders once createdInfo is set
    await waitFor(() => {
      expect(screen.getByText("engagement.createAnother")).toBeInTheDocument();
    });

    // handleCreateAnother: resets form with practica = AUDITORIA_SERVICE_CODE (1)
    await user.click(screen.getByText("engagement.createAnother"));

    const practica = screen.getByLabelText(/engagement\.practica/);
    await waitFor(() => {
      expect(practica).toHaveTextContent("Auditoría");
      expect(practica).toBeDisabled();
    });
  });
});
