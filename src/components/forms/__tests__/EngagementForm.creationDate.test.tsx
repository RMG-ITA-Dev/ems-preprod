import React from "react";
import { describe, it, expect, vi } from "vitest";
import { format, startOfDay } from "date-fns";
import { render, screen } from "@/test/utils";

/**
 * BUG #0602-134: separate "Fecha de Creación" (read-only, system-generated) from
 * "Fecha de Inicio" (manager/admin-editable), and default the start date to today on create.
 */

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => vi.fn() };
});

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: "en" } }),
}));

vi.mock("@/hooks/useEmsData", () => ({
  useClients: () => ({ data: [] }),
  useServices: () => ({ data: [] }),
  useTaxonomies: () => ({ data: [] }),
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

vi.mock("@/hooks/useCurrentStaff", () => ({
  useCurrentStaff: () => ({ staffRecord: null }),
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
  sqr_id: null,
  encargado_id: null,
  specialist_it_id: null,
  specialist_tax_id: null,
};

describe("EngagementForm creation date field (BUG #0602-134)", () => {
  it("create mode: shows the 'assigned automatically' helper text, not a real date", () => {
    render(<EngagementForm />);
    expect(screen.getByText("engagement.creationDateHelp")).toBeInTheDocument();
  });

  it("create mode: 'Fecha de Inicio' defaults to today", () => {
    render(<EngagementForm />);
    const today = format(startOfDay(new Date()), "dd/MM/yyyy");
    expect(screen.getByText(today)).toBeInTheDocument();
  });

  it("edit mode: shows the engagement's real created_at, disabled", () => {
    render(<EngagementForm engagement={mockEngagement} />);
    const input = screen.getByDisplayValue("22/05/2026");
    expect(input).toBeDisabled();
  });
});
