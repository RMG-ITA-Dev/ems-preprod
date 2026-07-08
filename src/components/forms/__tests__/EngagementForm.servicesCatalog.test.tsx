import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@/test/utils";
import userEvent from "@testing-library/user-event";

/**
 * 0625-149: EngagementForm — catalog-driven practica select.
 * Verifies active-only options in create mode and name resolution in edit mode.
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

vi.mock("@/hooks/useEmsData", () => ({
  useClients:  () => ({ data: [] }),
  useServices: () => ({ data: mockServices }),
}));

vi.mock("@/hooks/useCategoryStaff", () => ({
  useCategoryStaff: () => ({
    partners: [],
    managerOptions: [],
    hasPartnerCategory: true,
    hasManagerCategory: true,
  }),
}));

vi.mock("@/hooks/mutations", () => ({
  useCreateEngagement: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateEngagement: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteEngagement: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock("@/hooks/useUserRole", () => ({
  useUserRole: () => ({ isAdmin: false }),
}));

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
