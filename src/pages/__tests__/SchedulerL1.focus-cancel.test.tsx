// SchedulerL1 focus-mode + Cancel button (BUG 0817-174), modeled on
// WorkOrderNew.focus-cancel.test.tsx. Asserts focusMode is passed to
// AppLayout, and that the Cancel button is present in both the loaded
// and an unavailable state, always navigating to "/".

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SchedulerUnavailableError } from "@/hooks/scheduler/schedulerData";

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<object>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "en" },
  }),
}));

vi.mock("@/components/layout/AppLayout", () => ({
  AppLayout: ({ children, focusMode }: { children: React.ReactNode; focusMode?: boolean }) => (
    <div data-testid="app-layout" data-focus-mode={focusMode}>
      {children}
    </div>
  ),
}));

const role: { roleKey: string | null; isLoading: boolean; isError: boolean; refetch: () => void } = {
  roleKey: "admin",
  isLoading: false,
  isError: false,
  refetch: vi.fn(),
};
vi.mock("@/hooks/useAuthorization", () => ({
  useAuthorization: () => role,
}));

vi.mock("@/hooks/useCategoryStaff", () => ({
  useCategoryStaff: () => ({ partnerOptions: [], managerOptions: [] }),
}));

vi.mock("@/hooks/useEmsData", () => ({
  useClients: () => ({ data: [] }),
}));

const query: {
  data: unknown;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => void;
} = {
  data: { rows: [], truncated: false },
  isLoading: false,
  isError: false,
  error: null,
  refetch: vi.fn(),
};
vi.mock("@/hooks/scheduler/useSchedulerL1", () => ({
  useSchedulerL1Rows: () => query,
}));

vi.mock("@/components/scheduler/L1EngagementGantt", () => ({
  L1EngagementGantt: () => <div data-testid="l1-gantt" />,
}));

import SchedulerL1 from "../SchedulerL1";

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/scheduler"]}>
        <Routes>
          <Route path="/scheduler" element={<SchedulerL1 />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(role, { roleKey: "admin", isLoading: false, isError: false });
  Object.assign(query, {
    data: { rows: [], truncated: false },
    isLoading: false,
    isError: false,
    error: null,
  });
});

describe("SchedulerL1 focus-cancel (BUG 0817-174)", () => {
  it("TL1-1: AppLayout receives focusMode=true", () => {
    renderPage();
    expect(screen.getByTestId("app-layout").dataset.focusMode).toBe("true");
  });

  it("TL1-2: Cancel button is present in the loaded/empty state", () => {
    renderPage();
    expect(screen.getByText("common.cancel")).toBeInTheDocument();
  });

  it("TL1-3: Cancel button is present in the unavailable state", () => {
    Object.assign(query, {
      data: undefined,
      isError: true,
      error: new SchedulerUnavailableError(),
    });
    renderPage();
    expect(screen.getByText("scheduler.errors.unavailable")).toBeInTheDocument();
    expect(screen.getByText("common.cancel")).toBeInTheDocument();
  });

  it("TL1-4: clicking Cancel navigates to /", () => {
    renderPage();
    fireEvent.click(screen.getByText("common.cancel"));
    expect(mockNavigate).toHaveBeenCalledWith("/");
  });
});
