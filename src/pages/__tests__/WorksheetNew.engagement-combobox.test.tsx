import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

/**
 * FEAT 0722-157 (renamed from WorksheetNew.engagement-select-contrast.test.tsx, 0526-124):
 * the plain <Select> engagement picker on /worksheets/new was replaced by
 * WorksheetEngagementCombobox (search-as-you-type). Covers: the client-name contrast fix
 * survives the swap, filtering, query-param preselection (valid and invalid), and manual
 * selection still creating the worksheet.
 */

// cmdk (used inside PopoverContent) relies on ResizeObserver and scrollIntoView, unavailable in JSDOM.
if (typeof (globalThis as any).ResizeObserver === "undefined") {
  (globalThis as any).ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
Element.prototype.scrollIntoView = () => {};

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: "en" } }),
}));

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock("@/hooks/useUserRole", () => ({
  useUserRole: () => ({
    isAdmin: true,
    isPartner: false,
    isDirector: false,
    isManager: false,
    isLoading: false,
  }),
}));

const mockEngagements = [
  {
    engagement_id: "eng-1",
    engagement_code: "12",
    engagement_name: "AUD EEFF 2025",
    client: { client_legal_name: "TOTTO SA" },
    partner: null,
    manager: null,
  },
  {
    engagement_id: "eng-2",
    engagement_code: "34",
    engagement_name: "Tax Review",
    client: { client_legal_name: "Acme Corp" },
    partner: null,
    manager: null,
  },
];

vi.mock("@/hooks/useWorksheetData", () => ({
  useEngagementsWithoutWorksheet: () => ({
    data: mockEngagements,
    isLoading: false,
  }),
}));

const mockCreateMutateAsync = vi.fn().mockResolvedValue({ id: "ws-1" });
vi.mock("@/hooks/useWorksheetMutations", () => ({
  useCreateWorksheet: () => ({ mutateAsync: mockCreateMutateAsync, isPending: false }),
}));

vi.mock("@/hooks/useCurrentStaff", () => ({
  useCurrentStaff: () => ({ data: { staff_id: "s1" } }),
}));

vi.mock("@/components/layout/AppLayout", () => ({
  AppLayout: ({ children }: any) => <div>{children}</div>,
}));

vi.mock("@/hooks/usePageLeaveLock", () => ({
  usePageLeaveLock: () => ({
    blocker: { state: "unblocked" as const },
    allowNextNavigation: vi.fn(),
    isDirty: false,
  }),
}));

vi.mock("@/components/ui/leave-page-dialog", () => ({ LeavePageDialog: () => null }));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), debug: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

// Same convention as EngagementForm's StaffCombobox tests: mock Popover as a passthrough so
// the Command list is always in the DOM, without driving Radix's real positioning/pointer flow.
vi.mock("@/components/ui/popover", () => ({
  Popover: ({ children }: any) => <>{children}</>,
  PopoverTrigger: ({ children }: any) => <>{children}</>,
  PopoverContent: ({ children }: any) => <>{children}</>,
}));

import WorksheetNew from "../WorksheetNew";

function wrap(initialEntry = "/worksheets/new") {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <WorksheetNew />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("WorksheetNew — engagement combobox (0722-157)", () => {
  beforeEach(() => {
    mockCreateMutateAsync.mockClear();
    mockNavigate.mockClear();
  });

  it("preserves the client-name contrast fix from the original Select (0526-124)", () => {
    wrap();

    const clientSpan = screen.getByText("TOTTO SA");
    expect(clientSpan.className).toContain("text-muted-foreground");
    expect(clientSpan.className).toContain("group-data-[selected=true]:text-accent-foreground");
  });

  it("typing filters by code, name, or client", async () => {
    const user = userEvent.setup();
    wrap();

    await user.type(screen.getByPlaceholderText("worksheet.searchEngagement"), "Acme");

    expect(screen.getByText("Tax Review")).toBeInTheDocument();
    expect(screen.queryByText("AUD EEFF 2025")).not.toBeInTheDocument();
  });

  it("preselects a valid ?engagement= candidate and enables Create", async () => {
    wrap("/worksheets/new?engagement=eng-1");

    // getAllByRole: the CommandInput (always in the DOM here, since Popover is mocked open)
    // also carries role="combobox" — the trigger Button is the first of the two.
    await waitFor(() => {
      expect(screen.getAllByRole("combobox")[0]).toHaveTextContent("12 - AUD EEFF 2025");
    });
    expect(screen.getByRole("button", { name: "common.create" })).toBeEnabled();
  });

  it("does not preselect an invalid/obsolete ?engagement= id, leaving Create disabled", async () => {
    wrap("/worksheets/new?engagement=eng-does-not-exist");

    expect(screen.getAllByRole("combobox")[0]).toHaveTextContent("workMatrix.selectEngagement");
    expect(screen.getByRole("button", { name: "common.create" })).toBeDisabled();
  });

  it("manual selection still creates the worksheet", async () => {
    const user = userEvent.setup();
    wrap();

    await user.click(screen.getByText("AUD EEFF 2025"));
    await user.click(screen.getByRole("button", { name: "common.create" }));

    await waitFor(() => {
      expect(mockCreateMutateAsync).toHaveBeenCalledWith({
        engagement_id: "eng-1",
        created_by_staff_id: "s1",
      });
    });
    expect(mockNavigate).toHaveBeenCalledWith("/worksheets/ws-1");
  });
});
