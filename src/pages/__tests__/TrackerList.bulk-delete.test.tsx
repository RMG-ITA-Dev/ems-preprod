import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import React from "react";

// Bug 0529-127 (feat): bulk-delete action on /tracker. A destructive "delete"
// button appears only when >=1 deletable (finished, non-imported) record is
// selected; confirming an AlertDialog deletes the selection. Imported/running
// records are not selectable and must never be sent to delete.

beforeAll(() => {
  class MockResizeObserver {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  }
  (globalThis as any).ResizeObserver = MockResizeObserver;

  // Radix UI relies on these APIs that jsdom does not implement
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = vi.fn(() => false) as never;
  }
  if (!Element.prototype.releasePointerCapture) {
    Element.prototype.releasePointerCapture = vi.fn() as never;
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = vi.fn() as never;
  }

  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false, // desktop table view
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
});

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params && "count" in params ? `${key}:${params.count}` : key,
    i18n: { language: "es" },
  }),
}));

vi.mock("@/components/layout/AppLayout", () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/tracker/ManualEntryDialog", () => ({
  ManualEntryDialog: () => null,
}));

vi.mock("@/components/tracker/ConsolidationDialog", () => ({
  ConsolidationDialog: () => null,
}));

vi.mock("@/hooks/useCurrentStaff", () => ({
  useCurrentStaff: () => ({ staffRecord: { staff_id: "staff-1" }, isLoading: false }),
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { email: "neil@ruizmier.com" } }),
}));

vi.mock("@/hooks/useLanguage", () => ({
  useLanguage: () => ({ currentLanguage: "es" }),
}));

vi.mock("@/hooks/useMobile", () => ({
  useIsMobile: () => false,
}));

vi.mock("@/hooks/useTimesheetImport", () => ({
  useTimesheetImport: () => ({
    exportEntries: vi.fn(),
    isExporting: false,
    analyzeExport: vi.fn(() => ({ hasConsolidation: false, hasConflicts: false, conflicts: [] })),
  }),
}));

const makeEntry = (overrides: Record<string, unknown>) => ({
  timer_id: "t-default",
  staff_id: "staff-1",
  engagement_id: "e1",
  activity_id: "a1",
  description: null,
  started_at: "2026-05-25T08:00:00Z",
  ended_at: "2026-05-25T09:00:00Z",
  duration_minutes: 60,
  is_imported: false,
  imported_to_time_id: null,
  has_explicit_times: true,
  created_at: "2026-05-25T08:00:00Z",
  engagement: { engagement_name: "Eng", engagement_code: "ENG-01" },
  activity: { activity_code: "ACT-01", description: "Act" },
  ...overrides,
});

const entries = [
  makeEntry({ timer_id: "t-deletable-1" }),
  makeEntry({ timer_id: "t-deletable-2" }),
  makeEntry({ timer_id: "t-imported", is_imported: true, imported_to_time_id: "time-1" }),
  makeEntry({ timer_id: "t-running", ended_at: null, duration_minutes: null }),
];

vi.mock("@/hooks/useTimerEntries", () => ({
  useTimerEntries: () => ({ data: entries, isLoading: false }),
  useCreateTimerEntry: () => ({ mutateAsync: vi.fn() }),
  useRunningTimerEntry: () => ({ data: null }),
  useDeleteTimerEntries: () => mockDeleteMutation,
}));

const mockDeleteMutation = {
  mutateAsync: vi.fn().mockResolvedValue(undefined),
  isPending: false,
};

import TrackerList from "@/pages/TrackerList";

const renderPage = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <TrackerList />
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

// The bulk-delete button is the one containing the delete label + count badge.
const queryDeleteButton = () =>
  screen.queryAllByRole("button").find((btn) => btn.textContent?.includes("common.delete"));

describe("TrackerList – bulk delete (bug 0529-127)", () => {
  beforeEach(() => {
    mockDeleteMutation.mutateAsync.mockClear();
  });

  it("does not show the delete button when nothing is selected", () => {
    renderPage();
    expect(queryDeleteButton()).toBeUndefined();
  });

  it("only renders checkboxes for deletable rows (imported/running excluded)", () => {
    renderPage();
    // 2 deletable rows + 1 header select-all checkbox = 3; imported & running have none
    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes).toHaveLength(3);
  });

  it("shows the delete button with a count once a row is selected, and deletes on confirm", async () => {
    const user = userEvent.setup();
    renderPage();

    // Select the first deletable row (skip header checkbox at index 0)
    const checkboxes = screen.getAllByRole("checkbox");
    await user.click(checkboxes[1]);

    const deleteBtn = queryDeleteButton();
    expect(deleteBtn).toBeDefined();
    expect(deleteBtn!.textContent).toContain("1");

    // Open the confirm dialog and confirm
    await user.click(deleteBtn!);
    const dialog = await screen.findByRole("alertdialog");
    const confirm = within(dialog)
      .getAllByRole("button")
      .find((b) => b.textContent?.includes("common.delete"));
    await user.click(confirm!);

    await waitFor(() => {
      expect(mockDeleteMutation.mutateAsync).toHaveBeenCalledTimes(1);
    });
    // Called with an array containing only the selected deletable id
    expect(mockDeleteMutation.mutateAsync).toHaveBeenCalledWith(["t-deletable-1"]);
  });
});
