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
// in EngagementForm (the auto-assign-practica effect). Returning a new [] on every render
// makes that effect re-run → setValue → re-render forever (infinite loop). Same pattern as
// WorkOrderNew.focus-cancel.test.tsx.
const stableClients: never[] = [];
const stableServices: never[] = [];
vi.mock("@/hooks/useEmsData", () => ({
  useClients: () => ({ data: stableClients }),
  useServices: () => ({ data: stableServices }),
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

vi.mock("@/hooks/mutations", () => ({
  useCreateEngagement: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateEngagement: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteEngagement: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock("@/hooks/useUserRole", () => ({
  useUserRole: () => ({ isAdmin: false }),
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
