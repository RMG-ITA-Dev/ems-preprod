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

// BUG 0722-162: el bloque Equipo pasó a alimentarse de useEngagementTeamCandidates (RPC), así
// que sin este mock el hook real golpearía Supabase.
const emptyTeamCandidates = {
  partnerDirectorOptions: [],
  managerRoleOptions: [],
  encargadoOptions: [],
  specialistItOptions: [],
  specialistTaxOptions: [],
  hasPartnerDirectorCandidates: true,
  hasManagerCandidates: true,
  isLoading: false,
  isError: false,
};
vi.mock("@/hooks/useEngagementTeamCandidates", () => ({
  useEngagementTeamCandidates: () => emptyTeamCandidates,
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
    // Scoped to the start-date field itself (shadcn's FormLabel sets `htmlFor` to the same id
    // FormControl puts on this button, so its accessible name is the field's label) instead of
    // an unscoped `getByText(today)`: on any day that today's date is also one of the "upcoming
    // closing dates" offered by the Fecha de Cierre <Select> below, Radix mirrors that option
    // into a hidden native <select> that's always in the DOM, so the SAME formatted date shows
    // up a second time and `getByText` throws "multiple elements" -- most recently reproduced
    // on 2026-09-30, unrelated to any change in this file.
    const startDateButton = screen.getByRole("button", { name: /engagement\.startDate/i });
    expect(startDateButton).toHaveTextContent(today);
  });
});
