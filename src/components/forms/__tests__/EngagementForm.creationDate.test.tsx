import React from "react";
import { describe, it, expect, vi } from "vitest";
import { format, startOfDay } from "date-fns";
import { render, screen } from "@/test/utils";

/**
 * BUG #0602-134: default "Fecha de Inicio" to today on create.
 * (The separate read-only "Fecha de Creación" field this bug originally added was later
 * removed by hotfix dbed93a — "descartar el campo de fecha de creación inmutable" — so the
 * tests covering it were removed too.)
 */

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => vi.fn() };
});

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: "en" } }),
}));

// Stable (module-level) empty arrays — a fresh `[]` literal returned on every call would give
// EngagementForm's effects a new `allServices`/`allTaxonomies` reference on every render, which
// never lets their dependency arrays settle and hangs the test in an infinite render loop.
const emptyClients: never[] = [];
const emptyServices: never[] = [];
const emptyTaxonomies: never[] = [];
vi.mock("@/hooks/useEmsData", () => ({
  useClients: () => ({ data: emptyClients }),
  useServices: () => ({ data: emptyServices }),
  useTaxonomies: () => ({ data: emptyTaxonomies }),
}));

const emptyStaffList: never[] = [];
vi.mock("@/hooks/useCategoryStaff", () => ({
  useCategoryStaff: () => ({
    partners: emptyStaffList,
    partnerOptions: emptyStaffList,
    managerOptions: emptyStaffList,
    allActiveStaff: emptyStaffList,
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

describe("EngagementForm creation date field (BUG #0602-134)", () => {
  it("create mode: 'Fecha de Inicio' defaults to today", () => {
    render(<EngagementForm />);
    const today = format(startOfDay(new Date()), "dd/MM/yyyy");
    expect(screen.getByText(today)).toBeInTheDocument();
  });
});
