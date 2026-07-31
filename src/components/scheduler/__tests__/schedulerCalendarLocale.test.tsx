// Spanish calendar regression: the shared Calendar (react-day-picker)
// defaults to enUS; the Scheduler calendar surfaces must pass the
// date-fns `es` locale so Spanish users see Spanish month/weekday names.
//
// Fase 3 (plan v2 §2): el caso de AssignmentSheet no se porta — L2 es
// solo lectura en esta fase (Fase 5 la reintroducirá con su propio test).

import React from "react";
import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// Spanish app language for every component in this file.
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "es" },
  }),
}));

vi.mock("@/hooks/useEmsData", async () => {
  const actual = await vi.importActual<object>("@/hooks/useEmsData");
  return {
    ...actual,
    useClients: () => ({ data: [] }),
  };
});

vi.mock("@/hooks/useUserRole", () => ({
  useUserRole: () => ({
    isAdmin: true,
    isPartner: false,
    isDirector: false,
    isManager: false,
    isSenior: false,
  }),
}));

vi.mock("@/hooks/useCategoryStaff", () => ({
  useCategoryStaff: () => ({ partnerOptions: [], managerOptions: [] }),
}));

vi.mock("@/hooks/scheduler/useSchedulerL1", () => ({
  useSchedulerL1Rows: () => ({
    data: { rows: [], truncated: false },
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

vi.mock("@/components/scheduler/L1EngagementGantt", () => ({
  L1EngagementGantt: () => <div data-testid="l1gantt" />,
}));

vi.mock("@/components/layout/AppLayout", () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import SchedulerL1 from "@/pages/SchedulerL1";

// date-fns `es`: July 2026 renders as "julio 2026" in the DayPicker caption.
const SPANISH_JULY = /julio/i;

describe("Scheduler calendars render in Spanish", () => {
  it("SchedulerL1 window calendar uses the es locale", () => {
    render(
      <MemoryRouter initialEntries={["/scheduler?from=2026-07-01&to=2026-07-31"]}>
        <SchedulerL1 />
      </MemoryRouter>
    );
    const fromPicker = screen.getByRole("button", { name: "engagement.startDate" });
    fireEvent.click(fromPicker);
    expect(screen.getByText(SPANISH_JULY)).toBeInTheDocument();
  });
});
