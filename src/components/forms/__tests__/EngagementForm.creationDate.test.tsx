import React from "react";
import { describe, it, expect, vi } from "vitest";
import { format, startOfDay } from "date-fns";
import { render, screen } from "@/test/utils";

/**
 * BUG #0602-134: default "Fecha de Inicio" to today on create.
 *
 * NOTE: this bug originally also introduced a read-only "Fecha de Creación" field, but that
 * field was later removed (hotfix dbed93a — "descartar el campo de fecha de creación inmutable").
 * The assertions for the removed field were dropped; only the start-date default remains.
 */

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => vi.fn() };
});

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: "en" } }),
}));

// Stable references are required: `allServices` (from useServices) is a useEffect dependency
// in EngagementForm (the auto-assign-practica effect), and `allTaxonomies` (from useTaxonomies)
// feeds a useMemo. Returning a new [] on every render makes these re-run → setValue → re-render
// forever (infinite loop). Same pattern as WorkOrderNew.focus-cancel.test.tsx.
const stableClients: never[] = [];
const stableServices: never[] = [];
const stableTaxonomies: never[] = [];
vi.mock("@/hooks/useEmsData", () => ({
  useClients: () => ({ data: stableClients }),
  useServices: () => ({ data: stableServices }),
  useTaxonomies: () => ({ data: stableTaxonomies }),
  useSocieties: () => ({ data: [] }),
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

vi.mock("@/hooks/useAuthorization", () => ({
  // Estos tests mockean isAdmin: false; con isAdmin derivado de role_key,
  // roleKey debe ser NO-admin para seguir ejercitando el mismo caso.
  useAuthorization: () => ({ can: () => true, roleKey: "manager" }),
}));

// BUG #0625-151 added useCurrentStaff (→ useAuth) to EngagementForm; mock it so the
// component doesn't require a real AuthProvider.
vi.mock("@/hooks/useCurrentStaff", () => ({
  useCurrentStaff: () => ({ staffRecord: null }),
}));

import { EngagementForm } from "@/components/forms/EngagementForm";

describe("EngagementForm start date default (BUG #0602-134)", () => {
  it("create mode: 'Fecha de Inicio' defaults to today", () => {
    render(<EngagementForm />);
    const today = format(startOfDay(new Date()), "dd/MM/yyyy");
    expect(screen.getByText(today)).toBeInTheDocument();
  });
});
