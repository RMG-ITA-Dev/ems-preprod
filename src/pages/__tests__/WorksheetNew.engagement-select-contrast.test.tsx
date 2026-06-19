import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

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

vi.mock("@/hooks/useWorksheetData", () => ({
  useEngagementsWithoutWorksheet: () => ({
    data: [
      {
        engagement_id: "eng-1",
        engagement_code: "12",
        engagement_name: "AUD EEFF 2025",
        client: { client_legal_name: "TOTTO SA" },
        partner: null,
        manager: null,
      },
    ],
    isLoading: false,
  }),
}));

vi.mock("@/hooks/useWorksheetMutations", () => ({
  useCreateWorksheet: () => ({ mutateAsync: vi.fn(), isPending: false }),
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

// Inline-render the Select primitives so we can introspect SelectItem markup
// without driving Radix's portal/pointer-event flow under jsdom.
vi.mock("@/components/ui/select", () => ({
  Select: ({ children }: any) => <div data-testid="select-root">{children}</div>,
  SelectTrigger: ({ children }: any) => <button type="button">{children}</button>,
  SelectValue: ({ children, placeholder }: any) => <span>{children ?? placeholder}</span>,
  SelectContent: ({ children }: any) => <div role="listbox">{children}</div>,
  SelectItem: ({ children, className, value }: any) => (
    <div role="option" data-value={value} className={className}>
      {children}
    </div>
  ),
}));

import WorksheetNew from "../WorksheetNew";

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/worksheets/new"]}>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe("WorksheetNew — engagement select contrast (0526-124)", () => {
  it("applies highlighted-state contrast overrides to the client name span", () => {
    wrap(<WorksheetNew />);

    const option = screen.getByRole("option", { name: /12 - AUD EEFF 2025/i });
    expect(option.className).toContain("group");

    const clientSpan = screen.getByText("TOTTO SA");
    expect(clientSpan.className).toContain("text-muted-foreground");
    expect(clientSpan.className).toContain("group-focus:text-accent-foreground");
    expect(clientSpan.className).toContain("group-data-[highlighted]:text-accent-foreground");
  });
});
