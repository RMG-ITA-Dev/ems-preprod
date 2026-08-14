import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

/**
 * FEAT 0714-155: Engagements list — "Sociedad" column + filter.
 * DataTable is stubbed (same convention as Engagements.create-permissions.test.tsx) to
 * capture the columns/filters props actually passed in, without driving DataTable's own
 * rendering/sorting internals.
 */

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: "en" } }),
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => vi.fn() };
});

vi.mock("@/hooks/useAuthorization", () => ({
  useAuthorization: () => ({ can: () => true, roleKey: "admin" }),
}));

vi.mock("@/hooks/useCategoryStaff", () => ({
  useCategoryStaff: () => ({ partnerOptions: [], managerOptions: [] }),
}));

vi.mock("@/components/layout/AppLayout", () => ({
  AppLayout: ({ children }: any) => <div>{children}</div>,
}));

const mockSocieties = [
  { society_id: "soc-1", name: "Ruizmier Pelaez S.R.L.", is_active: true, created_at: "" },
  { society_id: "soc-2", name: "Ruizmier Juaregui S.R.L.", is_active: true, created_at: "" },
];

const mockEngagements = [
  {
    engagement_id: "eng-1",
    engagement_code: "2027.121.001",
    engagement_name: "Audit FY2027",
    client: { client_legal_name: "Acme Corp" },
    society: { society_id: "soc-1", name: "Ruizmier Pelaez S.R.L." },
    work_order: null,
  },
  {
    engagement_id: "eng-2",
    engagement_code: "2027.121.002",
    engagement_name: "Legacy Engagement",
    client: { client_legal_name: "Legacy Client" },
    society: undefined, // historical row: no society backfilled
    work_order: null,
  },
  {
    engagement_id: "eng-3",
    engagement_code: "2027.121.003",
    engagement_name: "Old Firm Engagement",
    client: { client_legal_name: "Old Firm Client" },
    // REVIEW FIX: society deactivated after this engagement was created — useSocieties()
    // (active-only) would never surface it, so it must come from the engagement embed.
    society: { society_id: "soc-inactive", name: "Old Society S.R.L." },
    work_order: null,
  },
];

vi.mock("@/hooks/useEmsData", () => ({
  useEngagements: () => ({ data: mockEngagements, isLoading: false }),
  useSocieties: () => ({ data: mockSocieties }),
}));

let capturedProps: any = null;
vi.mock("@/components/data-table/DataTable", () => ({
  DataTable: (props: any) => {
    capturedProps = props;
    return <div data-testid="data-table-stub" />;
  },
}));

import Engagements from "../Engagements";

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe("Engagements — Sociedad column and filter (FEAT 0714-155)", () => {
  beforeEach(() => {
    capturedProps = null;
  });

  it("renders the list without crashing", () => {
    wrap(<Engagements />);
    expect(screen.getByTestId("data-table-stub")).toBeInTheDocument();
  });

  it("includes a 'society.name' column filtered by society_id", () => {
    wrap(<Engagements />);
    const column = capturedProps.columns.find((c: any) => c.key === "society.name");
    expect(column).toBeDefined();
    expect(column.filterKey).toBe("society_id");
  });

  it("column render shows the society name when present", () => {
    wrap(<Engagements />);
    const column = capturedProps.columns.find((c: any) => c.key === "society.name");
    expect(column.render(capturedProps.data[0])).toBe("Ruizmier Pelaez S.R.L.");
  });

  it("column render falls back to '-' for a historical engagement with no society", () => {
    wrap(<Engagements />);
    const column = capturedProps.columns.find((c: any) => c.key === "society.name");
    expect(column.render(capturedProps.data[1])).toBe("-");
  });

  it("exposes a society_id filter with the 2 catalog options", () => {
    wrap(<Engagements />);
    const filter = capturedProps.filters.find((f: any) => f.key === "society_id");
    expect(filter).toBeDefined();
    expect(filter.options).toEqual(
      expect.arrayContaining([
        { value: "soc-1", label: "Ruizmier Pelaez S.R.L." },
        { value: "soc-2", label: "Ruizmier Juaregui S.R.L." },
      ])
    );
  });

  it("REVIEW FIX: merges in a historical (now-inactive) society from the engagement embed", () => {
    wrap(<Engagements />);
    const filter = capturedProps.filters.find((f: any) => f.key === "society_id");
    expect(filter.options).toEqual(
      expect.arrayContaining([{ value: "soc-inactive", label: "Old Society S.R.L." }])
    );
    // Still exactly 3: the 2 active + the 1 distinct inactive one — not duplicated.
    expect(filter.options).toHaveLength(3);
  });
});
